import { useState, useEffect, useRef, useCallback } from 'react';

export function useCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play tactile mechanical shutter sound via Web Audio API (0 external assets)
  const playShutterSound = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Shutter click 1 (high snappy click)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1200, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.04);
      gain1.gain.setValueAtTime(0.35, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.04);

      // Shutter click 2 (rebound tactile click after 40ms)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(600, ctx.currentTime + 0.045);
      osc2.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.09);
      gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.045);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.045);
      osc2.stop(ctx.currentTime + 0.09);
    } catch {
      // Audio optional on restricted browser contexts
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setIsInitializing(false);
  }, []);

  const startCamera = useCallback(async () => {
    setIsInitializing(true);
    setCameraError(null);

    // Stop existing stream if running
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }

    // Check Secure Context / MediaDevices availability
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsInitializing(false);
      setCameraError('TRÌNH DUYỆT CHẶN CAMERA DO TRUY CẬP HTTP (YÊU CẦU HTTPS HOẶC CẤP QUYỀN CAMERA)');
      return;
    }

    // Safety timeout: never let isInitializing hang permanently
    const initTimer = setTimeout(() => {
      setIsInitializing(false);
    }, 4500);

    try {
      // Try back camera with sensible mobile constraints
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        });
      } catch {
        // Fallback to any available video sensor
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        const vid = videoRef.current;
        vid.srcObject = mediaStream;
        vid.onloadedmetadata = () => {
          clearTimeout(initTimer);
          setIsInitializing(false);
        };
        await vid.play().catch(() => {});
      }

      // Check torch capability
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities ? (videoTrack.getCapabilities() as { torch?: boolean }) : {};
        setHasTorch(Boolean(capabilities.torch));
      }
    } catch (err: unknown) {
      clearTimeout(initTimer);
      const msg = err instanceof Error ? err.message : 'CAMERA_ACCESS_DENIED';
      setCameraError(msg);
    } finally {
      clearTimeout(initTimer);
      setIsInitializing(false);
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const activeStream = streamRef.current;
    if (!activeStream) return;
    const track = activeStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !torchOn;
      await (track as MediaStreamTrack & { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }, [torchOn]);

  // Capture frame with iOS Safari Memory Hygiene (<= 1800px, canvas zeroed after use)
  const captureFrame = useCallback((): Promise<{ blob: Blob; width: number; height: number; rgba: Uint8Array } | null> => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return Promise.resolve(null);
    }

    playShutterSound();

    const origW = video.videoWidth;
    const origH = video.videoHeight;

    // Downscale long edge to max 1800px
    const maxEdge = 1800;
    let targetW = origW;
    let targetH = origH;
    if (Math.max(origW, origH) > maxEdge) {
      if (origW >= origH) {
        targetW = maxEdge;
        targetH = Math.round((origH / origW) * maxEdge);
      } else {
        targetH = maxEdge;
        targetW = Math.round((origW / origH) * maxEdge);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return Promise.resolve(null);

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const rgba = new Uint8Array(imgData.data.buffer);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          // iOS Safari Memory Hygiene: wipe canvas immediately
          canvas.width = 0;
          canvas.height = 0;
          if (blob) {
            resolve({ blob, width: targetW, height: targetH, rgba });
          } else {
            resolve(null);
          }
        },
        'image/jpeg',
        0.92
      );
    });
  }, [playShutterSound]);

  // Grab downscaled frame for real-time quad detection viewfinder
  const grabDetectionFrame = useCallback((): { rgba: Uint8Array; width: number; height: number } | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Downscale to ~320px for real-time tracking
    const targetW = 320;
    const scale = targetW / video.videoWidth;
    const targetH = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const rgba = new Uint8Array(imgData.data.buffer);

    // Free canvas
    canvas.width = 0;
    canvas.height = 0;

    return { rgba, width: targetW, height: targetH };
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopCamera]);

  return {
    videoRef,
    stream,
    isInitializing,
    cameraError,
    hasTorch,
    torchOn,
    startCamera,
    stopCamera,
    toggleTorch,
    captureFrame,
    grabDetectionFrame,
  };
}
