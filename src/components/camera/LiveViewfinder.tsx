import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Zap, ZapOff, X, Image as ImageIcon, Camera } from 'lucide-react';
import { useCamera } from '../../hooks/useCamera';
import { useScannerWorker } from '../../hooks/useScannerWorker';
import { useLanguage } from '../../hooks/useLanguage';
import { TelemetryPill } from '../common/TelemetryPill';

interface LiveViewfinderProps {
  onCapture: (captured: {
    blob: Blob;
    width: number;
    height: number;
    quad: [number, number, number, number, number, number, number, number];
  }) => void;
  onImportFiles: (files: FileList | File[]) => void;
  onClose: () => void;
  pageCount: number;
}

export const LiveViewfinder: React.FC<LiveViewfinderProps> = ({
  onCapture,
  onImportFiles,
  onClose,
  pageCount,
}) => {
  const {
    videoRef,
    isInitializing,
    cameraError,
    hasTorch,
    torchOn,
    startCamera,
    stopCamera,
    toggleTorch,
    captureFrame,
    grabDetectionFrame,
  } = useCamera();

  const { detectQuad, wasmReady, lastProcessingMs } = useScannerWorker();
  const { t } = useLanguage();

  // Target quad detected by worker (video coords 0.0 - 1.0)
  const targetQuadRef = useRef<number[] | null>(null);
  // Current interpolated quad for smooth rendering
  const [smoothQuad, setSmoothQuad] = useState<number[] | null>(null);
  const currentQuadRef = useRef<number[] | null>(null);
  // CamScanner-style rock-solid tracking: locked document reference + hysteresis
  const lockedQuadRef = useRef<number[] | null>(null);
  const missedFramesRef = useRef<number>(0);
  const outlierCountRef = useRef<number>(0);

  // Flash overlay state
  const [showFlash, setShowFlash] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  // Start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Real-time quad detection loop every 140ms
  useEffect(() => {
    let timerId: number;
    let isDetecting = false;

    const runDetection = async () => {
      if (isDetecting || !wasmReady || isCapturing) {
        timerId = window.setTimeout(runDetection, 140);
        return;
      }

      const frame = grabDetectionFrame();
      if (!frame) {
        timerId = window.setTimeout(runDetection, 140);
        return;
      }

      isDetecting = true;
      try {
        const res = await detectQuad(frame.rgba, frame.width, frame.height);
        if (res.quad && res.quad.length === 8) {
          // Normalize quad coords to 0.0 - 1.0 based on detection frame dimensions
          const normQuad = [
            res.quad[0] / frame.width,
            res.quad[1] / frame.height,
            res.quad[2] / frame.width,
            res.quad[3] / frame.height,
            res.quad[4] / frame.width,
            res.quad[5] / frame.height,
            res.quad[6] / frame.width,
            res.quad[7] / frame.height,
          ];

          // Calculate normalized polygon area using Shoelace formula
          const quadArea = 0.5 * Math.abs(
            (normQuad[0] * normQuad[3] - normQuad[1] * normQuad[2]) +
            (normQuad[2] * normQuad[5] - normQuad[3] * normQuad[4]) +
            (normQuad[4] * normQuad[7] - normQuad[5] * normQuad[6]) +
            (normQuad[6] * normQuad[1] - normQuad[7] * normQuad[0])
          );

          // CamScanner Document Saliency Filter:
          // Accepts documents from 4.5% of frame (e.g. document shown on computer monitor or desk)
          if (quadArea >= 0.045 && quadArea <= 0.98) {
            if (!lockedQuadRef.current) {
              // Lock initial target document
              lockedQuadRef.current = normQuad;
              targetQuadRef.current = normQuad;
              missedFramesRef.current = 0;
              outlierCountRef.current = 0;
            } else {
              // Measure maximum corner shift distance
              let maxDist = 0;
              for (let i = 0; i < 4; i++) {
                const dx = normQuad[i * 2] - lockedQuadRef.current[i * 2];
                const dy = normQuad[i * 2 + 1] - lockedQuadRef.current[i * 2 + 1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > maxDist) maxDist = d;
              }

              // Continuous tracking: smooth hand tremor if moving normally
              if (maxDist < 0.22) {
                const alpha = 0.35;
                const updated: number[] = [];
                for (let i = 0; i < 8; i++) {
                  updated.push(lockedQuadRef.current[i] * (1 - alpha) + normQuad[i] * alpha);
                }
                lockedQuadRef.current = updated;
                targetQuadRef.current = updated;
                missedFramesRef.current = 0;
                outlierCountRef.current = 0;
              } else {
                // Outlier jump (e.g. detector momentarily snapped to monitor bezel or desk):
                // CamScanner behavior: HOLD locked document, do not jump!
                outlierCountRef.current++;
                if (outlierCountRef.current > 4) {
                  // User genuinely moved camera to a completely new object
                  lockedQuadRef.current = normQuad;
                  targetQuadRef.current = normQuad;
                  outlierCountRef.current = 0;
                }
              }
            }
          } else {
            missedFramesRef.current++;
            if (missedFramesRef.current > 6) {
              lockedQuadRef.current = null;
              targetQuadRef.current = null;
            }
          }
        } else {
          missedFramesRef.current++;
          // Temporal Hysteresis: Hold onto locked quad during momentary blur/movement (up to ~750ms)
          if (missedFramesRef.current > 6) {
            lockedQuadRef.current = null;
            targetQuadRef.current = null;
          }
        }
      } catch {
        // detection skipped
      } finally {
        isDetecting = false;
        timerId = window.setTimeout(runDetection, 110);
      }
    };

    timerId = window.setTimeout(runDetection, 500);

    return () => {
      clearTimeout(timerId);
    };
  }, [wasmReady, isCapturing, detectQuad, grabDetectionFrame]);

  // RequestAnimationFrame Linear Interpolation (LERP) loop for rock-solid 60fps tracking
  useEffect(() => {
    let animId: number;
    const lerpFactor = 0.25;

    const animate = () => {
      const target = targetQuadRef.current;
      const current = currentQuadRef.current;

      if (target && !current) {
        currentQuadRef.current = [...target];
        setSmoothQuad([...target]);
      } else if (target && current) {
        const next: number[] = [];
        let changed = false;
        for (let i = 0; i < 8; i++) {
          const val = current[i] + (target[i] - current[i]) * lerpFactor;
          next.push(val);
          if (Math.abs(val - current[i]) > 0.0005) {
            changed = true;
          }
        }
        if (changed) {
          currentQuadRef.current = next;
          setSmoothQuad(next);
        }
      } else if (!target && current) {
        currentQuadRef.current = null;
        setSmoothQuad(null);
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  // Handle capture trigger
  const handleShutter = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 90);

    try {
      const captured = await captureFrame();
      if (!captured) return;

      const normQuad = currentQuadRef.current || targetQuadRef.current;
      let finalQuad: [number, number, number, number, number, number, number, number];

      if (normQuad && normQuad.length === 8) {
        // Map normalized quad to high-res captured image pixels
        finalQuad = [
          normQuad[0] * captured.width,
          normQuad[1] * captured.height,
          normQuad[2] * captured.width,
          normQuad[3] * captured.height,
          normQuad[4] * captured.width,
          normQuad[5] * captured.height,
          normQuad[6] * captured.width,
          normQuad[7] * captured.height,
        ];
      } else {
        // Full frame default (never clip into text)
        finalQuad = [
          0,
          0,
          captured.width,
          0,
          captured.width,
          captured.height,
          0,
          captured.height,
        ];
      }

      onCapture({
        blob: captured.blob,
        width: captured.width,
        height: captured.height,
        quad: finalQuad,
      });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, captureFrame, onCapture]);

  const hasQuadLock = Boolean(smoothQuad);

  return (
    <div className="relative w-full h-full bg-[var(--bg-void)] flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* Flash overlay */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-100 ease-out ${
          showFlash ? 'opacity-80' : 'opacity-0'
        }`}
      />

      {/* Top Bar: 48px high */}
      <div className="relative z-20 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] h-[52px] bg-gradient-to-b from-black/60 to-transparent">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeTooltip}
          title={t.closeTooltip}
          className="p-2 rounded-[4px] bg-[var(--bg-panel)]/80 text-[var(--text-primary)] border border-[var(--border-hairline)] hover:border-[var(--border-active)]"
        >
          <X size={18} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2">
          <TelemetryPill
            label={hasQuadLock ? 'QUAD_LOCKED' : 'TRACKING'}
            status={hasQuadLock ? 'active' : 'ready'}
            subLabel={lastProcessingMs > 0 ? `${lastProcessingMs}ms` : undefined}
          />
          <div className="px-2 py-1 bg-[var(--bg-panel)]/80 border border-[var(--border-hairline)] rounded-[3px] font-mono text-[11px] text-[var(--text-primary)]">
            {String(pageCount + 1).padStart(2, '0')} // {t.pageNumber}
          </div>
        </div>

        {hasTorch ? (
          <button
            type="button"
            onClick={toggleTorch}
            aria-label={t.torchTooltip}
            title={t.torchTooltip}
            className={`p-2 rounded-[4px] border ${
              torchOn
                ? 'bg-[var(--accent-laser)] text-white border-[var(--accent-laser)]'
                : 'bg-[var(--bg-panel)]/80 text-[var(--text-primary)] border-[var(--border-hairline)]'
            }`}
          >
            {torchOn ? <Zap size={18} strokeWidth={1.5} /> : <ZapOff size={18} strokeWidth={1.5} />}
          </button>
        ) : (
          <div className="w-[34px]" />
        )}
      </div>

      {/* Camera Viewport & SVG Quad Overlay */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-black">
        {cameraError ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-[var(--text-muted)] font-mono text-xs max-w-sm mx-auto">
            <Camera size={44} strokeWidth={1.5} className="mb-3 text-[var(--accent-laser)]" />
            <div className="text-[var(--text-primary)] font-bold text-sm mb-1 uppercase tracking-wider">
              MÁY ẢNH CHƯA SẴN SÀNG
            </div>
            <div className="text-[11px] mb-4 opacity-80 leading-relaxed">
              {cameraError}
            </div>
            <div className="flex flex-col w-full gap-2">
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="w-full py-2.5 px-4 bg-[var(--accent-laser)] text-white font-medium rounded-[4px] shadow-sm hover:opacity-90 active:scale-95 transition-transform cursor-pointer flex items-center justify-center gap-2"
              >
                <Camera size={16} strokeWidth={2} />
                <span>CHỤP BẰNG MÁY ẢNH ĐIỆN THOẠI</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-4 bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] rounded-[4px] hover:border-[var(--border-active)] cursor-pointer"
              >
                {t.importFiles}
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Smooth SVG Quad Overlay (CamScanner-Style Emerald Green) */}
            {smoothQuad && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none z-10"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <polygon
                  points={`
                    ${smoothQuad[0] * 100},${smoothQuad[1] * 100} 
                    ${smoothQuad[2] * 100},${smoothQuad[3] * 100} 
                    ${smoothQuad[4] * 100},${smoothQuad[5] * 100} 
                    ${smoothQuad[6] * 100},${smoothQuad[7] * 100}
                  `}
                  fill="rgba(16, 185, 129, 0.15)"
                  stroke="#10b981"
                  strokeWidth="0.9"
                  vectorEffect="non-scaling-stroke"
                />
                {/* 4 Corner reticle rings (CamScanner emerald dots) */}
                {[
                  [smoothQuad[0] * 100, smoothQuad[1] * 100],
                  [smoothQuad[2] * 100, smoothQuad[3] * 100],
                  [smoothQuad[4] * 100, smoothQuad[5] * 100],
                  [smoothQuad[6] * 100, smoothQuad[7] * 100],
                ].map(([cx, cy], idx) => (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r="1.4"
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="0.4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}

            {isInitializing && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 rounded-[4px] font-mono text-[11px] text-[var(--text-muted)] border border-[var(--border-hairline)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-laser)] animate-ping" />
                <span>STARTING_SENSOR...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden native camera capture input (bypasses WebRTC restrictions on HTTP) */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Bottom Control Dock */}
      <div className="relative z-20 w-full pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 px-6 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
        {/* Gallery Import on Bottom-Left */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Import image from gallery"
          className="w-[48px] h-[48px] rounded-[4px] bg-[var(--bg-panel)]/80 border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-primary)] hover:border-[var(--border-active)] cursor-pointer"
        >
          <ImageIcon size={20} strokeWidth={1.5} />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onImportFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        {/* Physical Shutter Button (72px × 72px) */}
        <button
          type="button"
          onClick={() => {
            if (cameraError) {
              nativeCameraInputRef.current?.click();
            } else {
              handleShutter();
            }
          }}
          disabled={isCapturing}
          aria-label="Capture Document"
          className="w-[72px] h-[72px] rounded-full border-[3px] border-[var(--text-primary)] p-[4px] flex items-center justify-center active:scale-[0.92] transition-transform duration-75 cursor-pointer disabled:opacity-50"
        >
          <div
            className={`w-full h-full rounded-full transition-colors duration-150 ${
              hasQuadLock ? 'bg-[var(--accent-laser)]' : 'bg-[var(--text-primary)]'
            }`}
          />
        </button>

        {/* Review Stack Badge on Bottom-Right */}
        <button
          type="button"
          onClick={onClose}
          className="w-[48px] h-[48px] rounded-[4px] bg-[var(--bg-panel)]/80 border border-[var(--border-hairline)] flex flex-col items-center justify-center text-[var(--text-primary)] font-mono text-xs hover:border-[var(--border-active)] cursor-pointer"
        >
          <span className="text-[10px] text-[var(--text-muted)]">STACK</span>
          <span className="font-semibold">{String(pageCount).padStart(2, '0')}</span>
        </button>
      </div>
    </div>
  );
};
