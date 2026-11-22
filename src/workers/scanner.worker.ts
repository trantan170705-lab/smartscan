import init, {
  detect_document_quad,
  warp_perspective,
  apply_scan_filter,
  generate_pdf,
  encode_jpeg,
} from '../wasm-pkg/wasm_scanner.js';

export type WorkerRequest =
  | { type: 'INIT' }
  | { id: string; type: 'DETECT_QUAD'; rgba: Uint8Array; width: number; height: number }
  | { id: string; type: 'WARP_PERSPECTIVE'; rgba: Uint8Array; width: number; height: number; quad: number[] }
  | { id: string; type: 'APPLY_FILTER'; rgba: Uint8Array; width: number; height: number; mode: number; contrast: number; brightness: number }
  | { id: string; type: 'GENERATE_PDF'; jpegPages: Uint8Array[]; pageSize: string }
  | { id: string; type: 'ENCODE_JPEG'; rgba: Uint8Array; width: number; height: number; quality: number };

export type WorkerResponse =
  | { type: 'INIT_OK' }
  | { id: string; type: 'DETECT_QUAD_RESULT'; quad: number[] | null; timeMs: number }
  | { id: string; type: 'WARP_PERSPECTIVE_RESULT'; data: Uint8Array; width: number; height: number; timeMs: number }
  | { id: string; type: 'APPLY_FILTER_RESULT'; data: Uint8Array; width: number; height: number; timeMs: number }
  | { id: string; type: 'GENERATE_PDF_RESULT'; pdfData: Uint8Array; timeMs: number }
  | { id: string; type: 'ENCODE_JPEG_RESULT'; jpegData: Uint8Array; timeMs: number }
  | { id?: string; type: 'ERROR'; error: string };

let isInitialized = false;
let initPromise: Promise<void> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await init();
      isInitialized = true;
    })();
  }
  await initPromise;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  try {
    await ensureWasmInitialized();

    if (req.type === 'INIT') {
      self.postMessage({ type: 'INIT_OK' } as WorkerResponse);
      return;
    }

    const startTime = performance.now();

    switch (req.type) {
      case 'DETECT_QUAD': {
        const quadFloatArray = detect_document_quad(req.rgba, req.width, req.height);
        const timeMs = Math.round(performance.now() - startTime);
        const quad = quadFloatArray ? Array.from(quadFloatArray) : null;
        self.postMessage(
          { id: req.id, type: 'DETECT_QUAD_RESULT', quad, timeMs } as WorkerResponse
        );
        break;
      }

      case 'WARP_PERSPECTIVE': {
        const floatQuad = new Float32Array(req.quad);
        const raw = warp_perspective(req.rgba, req.width, req.height, floatQuad);
        const timeMs = Math.round(performance.now() - startTime);
        const dv = new DataView(raw.buffer, raw.byteOffset, 8);
        const outWidth = dv.getUint32(0, true);
        const outHeight = dv.getUint32(4, true);
        const pixelData = raw.slice(8);
        const resultBuffer = pixelData.buffer;
        self.postMessage(
          {
            id: req.id,
            type: 'WARP_PERSPECTIVE_RESULT',
            data: pixelData,
            width: outWidth,
            height: outHeight,
            timeMs,
          } as WorkerResponse,
          [resultBuffer]
        );
        break;
      }

      case 'APPLY_FILTER': {
        const out = apply_scan_filter(
          req.rgba,
          req.width,
          req.height,
          req.mode,
          req.contrast,
          req.brightness
        );
        const timeMs = Math.round(performance.now() - startTime);
        const resultBuffer = out.buffer;
        self.postMessage(
          {
            id: req.id,
            type: 'APPLY_FILTER_RESULT',
            data: out,
            width: req.width,
            height: req.height,
            timeMs,
          } as WorkerResponse,
          [resultBuffer]
        );
        break;
      }

      case 'ENCODE_JPEG': {
        const jpeg = encode_jpeg(req.rgba, req.width, req.height, req.quality);
        const timeMs = Math.round(performance.now() - startTime);
        const resultBuffer = jpeg.buffer;
        self.postMessage(
          {
            id: req.id,
            type: 'ENCODE_JPEG_RESULT',
            jpegData: jpeg,
            timeMs,
          } as WorkerResponse,
          [resultBuffer]
        );
        break;
      }

      case 'GENERATE_PDF': {
        const pdfBytes = generate_pdf(req.jpegPages, req.pageSize);
        const timeMs = Math.round(performance.now() - startTime);
        const resultBuffer = pdfBytes.buffer;
        self.postMessage(
          {
            id: req.id,
            type: 'GENERATE_PDF_RESULT',
            pdfData: pdfBytes,
            timeMs,
          } as WorkerResponse,
          [resultBuffer]
        );
        break;
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    self.postMessage({
      id: 'id' in req ? req.id : undefined,
      type: 'ERROR',
      error: errorMsg,
    } as WorkerResponse);
  }
};
