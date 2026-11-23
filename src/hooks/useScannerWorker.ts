import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkerRequest, WorkerResponse } from '../workers/scanner.worker';

interface PendingRequest {
  resolve: (val: unknown) => void;
  reject: (err: Error) => void;
  timeoutId: number;
}

export function useScannerWorker() {
  const [wasmReady, setWasmReady] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastProcessingMs, setLastProcessingMs] = useState<number>(0);
  const [currentTask, setCurrentTask] = useState<string>('IDLE');

  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    // Instantiate dedicated Web Worker
    const worker = new Worker(new URL('../workers/scanner.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data;

      if (res.type === 'INIT_OK') {
        setWasmReady(true);
        return;
      }

      if ('id' in res && res.id) {
        const pending = pendingRequests.current.get(res.id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          pendingRequests.current.delete(res.id);

          if (pendingRequests.current.size === 0) {
            setIsProcessing(false);
            setCurrentTask('IDLE');
          }

          if (res.type === 'ERROR') {
            pending.reject(new Error(res.error));
          } else {
            if ('timeMs' in res) {
              setLastProcessingMs(res.timeMs);
            }
            pending.resolve(res);
          }
        }
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
    };

    // Initialize WASM
    worker.postMessage({ type: 'INIT' } as WorkerRequest);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendRequest = useCallback(
    <T extends WorkerResponse>(
      req: WorkerRequest,
      taskName: string,
      transferables?: Transferable[],
      timeoutMs: number = 30000
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          return reject(new Error('Scanner worker not available'));
        }

        if (!('id' in req)) {
          worker.postMessage(req);
          return resolve({ type: 'INIT_OK' } as unknown as T);
        }

        setIsProcessing(true);
        setCurrentTask(taskName);

        const timeoutId = window.setTimeout(() => {
          if (pendingRequests.current.has(req.id)) {
            pendingRequests.current.delete(req.id);
            if (pendingRequests.current.size === 0) {
              setIsProcessing(false);
              setCurrentTask('IDLE');
            }
            reject(new Error(`Worker request timeout: ${taskName}`));
          }
        }, timeoutMs);

        pendingRequests.current.set(req.id, {
          resolve: resolve as (val: unknown) => void,
          reject,
          timeoutId,
        });

        if (transferables && transferables.length > 0) {
          worker.postMessage(req, transferables);
        } else {
          worker.postMessage(req);
        }
      });
    },
    []
  );

  // Abort pending request
  const abortRequest = useCallback((id: string) => {
    const pending = pendingRequests.current.get(id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pendingRequests.current.delete(id);
      pending.reject(new Error('ABORTED'));
      if (pendingRequests.current.size === 0) {
        setIsProcessing(false);
        setCurrentTask('IDLE');
      }
    }
  }, []);

  // 1. Detect Quad (Frame buffer transferred or copied for continuous detection)
  const detectQuad = useCallback(
    async (rgba: Uint8Array, width: number, height: number): Promise<{ quad: number[] | null; timeMs: number }> => {
      const id = 'det_' + Math.random().toString(36).slice(2, 9);
      // Fast detection copy so caller retains video snapshot if needed
      const copy = new Uint8Array(rgba);
      const res = await sendRequest<Extract<WorkerResponse, { type: 'DETECT_QUAD_RESULT' }>>(
        { id, type: 'DETECT_QUAD', rgba: copy, width, height },
        'DETECT_QUAD',
        [copy.buffer],
        5000
      );
      return { quad: res.quad, timeMs: res.timeMs };
    },
    [sendRequest]
  );

  // 2. Warp Perspective (Zero-Copy Transfer)
  const warpPerspective = useCallback(
    async (
      rgba: Uint8Array,
      width: number,
      height: number,
      quad: number[]
    ): Promise<{ data: Uint8Array; width: number; height: number; timeMs: number }> => {
      const id = 'warp_' + Math.random().toString(36).slice(2, 9);
      const res = await sendRequest<Extract<WorkerResponse, { type: 'WARP_PERSPECTIVE_RESULT' }>>(
        { id, type: 'WARP_PERSPECTIVE', rgba, width, height, quad },
        'WARP_PERSPECTIVE',
        [rgba.buffer]
      );
      return { data: res.data, width: res.width, height: res.height, timeMs: res.timeMs };
    },
    [sendRequest]
  );

  // 3. Apply Filter (Zero-Copy Transfer with Buffer Protection for warpedCacheRef)
  const applyFilter = useCallback(
    async (
      rgba: Uint8Array,
      width: number,
      height: number,
      mode: number,
      contrast: number,
      brightness: number
    ): Promise<{ data: Uint8Array; width: number; height: number; timeMs: number }> => {
      const id = 'filt_' + Math.random().toString(36).slice(2, 9);
      // Copy slice so the caller's cached warped buffer is never neutered/detached by worker transfer
      const copy = new Uint8Array(rgba);
      const res = await sendRequest<Extract<WorkerResponse, { type: 'APPLY_FILTER_RESULT' }>>(
        { id, type: 'APPLY_FILTER', rgba: copy, width, height, mode, contrast, brightness },
        'APPLY_FILTER',
        [copy.buffer]
      );
      return { data: res.data, width: res.width, height: res.height, timeMs: res.timeMs };
    },
    [sendRequest]
  );

  // 4. Encode JPEG (Zero-Copy Transfer)
  const encodeJpeg = useCallback(
    async (rgba: Uint8Array, width: number, height: number, quality: number = 90): Promise<{ jpegData: Uint8Array; timeMs: number }> => {
      const id = 'jpg_' + Math.random().toString(36).slice(2, 9);
      const res = await sendRequest<Extract<WorkerResponse, { type: 'ENCODE_JPEG_RESULT' }>>(
        { id, type: 'ENCODE_JPEG', rgba, width, height, quality },
        'ENCODE_JPEG',
        [rgba.buffer]
      );
      return { jpegData: res.jpegData, timeMs: res.timeMs };
    },
    [sendRequest]
  );

  // 5. Generate Multi-Page PDF
  const generatePdf = useCallback(
    async (jpegPages: Uint8Array[], pageSize: string = 'A4'): Promise<{ pdfData: Uint8Array; timeMs: number }> => {
      const id = 'pdf_' + Math.random().toString(36).slice(2, 9);
      const transferables = jpegPages.map((p) => p.buffer);
      const res = await sendRequest<Extract<WorkerResponse, { type: 'GENERATE_PDF_RESULT' }>>(
        { id, type: 'GENERATE_PDF', jpegPages, pageSize },
        'GENERATE_PDF',
        transferables
      );
      return { pdfData: res.pdfData, timeMs: res.timeMs };
    },
    [sendRequest]
  );

  return {
    wasmReady,
    isProcessing,
    lastProcessingMs,
    currentTask,
    abortRequest,
    detectQuad,
    warpPerspective,
    applyFilter,
    encodeJpeg,
    generatePdf,
  };
}
