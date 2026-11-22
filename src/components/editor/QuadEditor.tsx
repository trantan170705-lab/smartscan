import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCw, Check, Undo2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface QuadEditorProps {
  imageBlob: Blob;
  initialQuad: [number, number, number, number, number, number, number, number];
  width: number;
  height: number;
  onConfirm: (finalQuad: [number, number, number, number, number, number, number, number]) => void;
  onCancel: () => void;
}

export const QuadEditor: React.FC<QuadEditorProps> = ({
  imageBlob,
  initialQuad,
  width: origWidth,
  height: origHeight,
  onConfirm,
  onCancel,
}) => {
  const { t } = useLanguage();
  // Normalized coordinates (0.0 to 1.0) for [TL, TR, BR, BL]
  const [normQuad, setNormQuad] = useState<[number, number, number, number, number, number, number, number]>(() => [
    initialQuad[0] / origWidth,
    initialQuad[1] / origHeight,
    initialQuad[2] / origWidth,
    initialQuad[3] / origHeight,
    initialQuad[4] / origWidth,
    initialQuad[5] / origHeight,
    initialQuad[6] / origWidth,
    initialQuad[7] / origHeight,
  ]);

  const [imageUrl, setImageUrl] = useState<string>('');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Canvas zoom & pan state for inspecting small documents
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);

  // Active dragging handle index (0: TL, 1: TR, 2: BR, 3: BL)
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  // Touch point for loupe positioning
  const [loupePoint, setLoupePoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Pointer down start tracker for jitter-free 1:1 delta dragging
  const dragStartRef = useRef<{ clientX: number; clientY: number; startNormX: number; startNormY: number } | null>(null);

  // Load image object URL with memory hygiene cleanup
  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    setImageUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageBlob]);

  // Render Magnifier Loupe on pointer move
  const updateLoupe = useCallback(
    (
      clientX: number,
      clientY: number,
      handleIdx: number,
      overrideNormX?: number,
      overrideNormY?: number
    ) => {
      const img = imgRef.current;
      const canvas = loupeCanvasRef.current;
      const container = containerRef.current;
      if (!img || !canvas || !container) return;

      const normX = overrideNormX !== undefined ? overrideNormX : normQuad[handleIdx * 2];
      const normY = overrideNormY !== undefined ? overrideNormY : normQuad[handleIdx * 2 + 1];

      const imgPixelX = normX * origWidth;
      const imgPixelY = normY * origHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 176;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;

      // 1.75x zoom matches CamScanner mobile loupe: shows the corner, both edges meeting at 90°, and desk background
      const zoom = 1.75;
      const sampleSize = size / zoom;

      ctx.drawImage(
        img,
        imgPixelX - sampleSize / 2,
        imgPixelY - sampleSize / 2,
        sampleSize,
        sampleSize,
        0,
        0,
        size,
        size
      );

      const center = size / 2;
      const arm = 30;

      // Draw CamScanner right-angle corner guide for the active corner:
      // 0: TL (arm right, arm down - ┌)
      // 1: TR (arm left, arm down - ┐)
      // 2: BR (arm left, arm up - ┘)
      // 3: BL (arm right, arm up - └)
      ctx.save();
      ctx.strokeStyle = '#FF4D00';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 4;

      ctx.beginPath();
      if (handleIdx === 0) {
        ctx.moveTo(center, center + arm);
        ctx.lineTo(center, center);
        ctx.lineTo(center + arm, center);
      } else if (handleIdx === 1) {
        ctx.moveTo(center, center + arm);
        ctx.lineTo(center, center);
        ctx.lineTo(center - arm, center);
      } else if (handleIdx === 2) {
        ctx.moveTo(center, center - arm);
        ctx.lineTo(center, center);
        ctx.lineTo(center - arm, center);
      } else if (handleIdx === 3) {
        ctx.moveTo(center, center - arm);
        ctx.lineTo(center, center);
        ctx.lineTo(center + arm, center);
      }
      ctx.stroke();
      ctx.restore();

      // Laser accent crosshair lines
      ctx.strokeStyle = 'rgba(255, 77, 0, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, center);
      ctx.lineTo(size, center);
      ctx.moveTo(center, 0);
      ctx.lineTo(center, size);
      ctx.stroke();

      // Clear center aperture ring with high contrast
      ctx.beginPath();
      ctx.arc(center, center, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(center, center, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#FF4D00';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Precision center dot
      ctx.beginPath();
      ctx.arc(center, center, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#FF4D00';
      ctx.fill();

      setLoupePoint({ clientX, clientY });
    },
    [normQuad, origWidth, origHeight]
  );

  // Zoom and pan handlers
  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.max(50, Math.min(350, prev + delta)));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY < 0 ? 15 : -15;
    setZoomLevel((prev) => Math.max(50, Math.min(350, prev + delta)));
  };

  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    if (activeHandle !== null) return;
    if (e.button === 0) {
      setIsPanning(true);
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        startX: panOffset.x,
        startY: panOffset.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const handleWorkspacePointerMove = (e: React.PointerEvent) => {
    if (isPanning && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.clientX;
      const dy = e.clientY - panStartRef.current.clientY;
      setPanOffset({
        x: panStartRef.current.startX + dx,
        y: panStartRef.current.startY + dy,
      });
    }
  };

  const handleWorkspacePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture fallback
      }
    }
  };

  // Pointer drag events on corner handles
  const handlePointerDown = (e: React.PointerEvent, handleIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveHandle(handleIdx);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startNormX: normQuad[handleIdx * 2],
      startNormY: normQuad[handleIdx * 2 + 1],
    };
    updateLoupe(e.clientX, e.clientY, handleIdx);
  };

  // Global window pointer listeners while dragging a handle
  // Guarantees zero dropped frames and uninterrupted tracking on mobile touch and desktop mice
  useEffect(() => {
    if (activeHandle === null) return;

    const onWindowPointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const target = imgRef.current || containerRef.current;
      if (!target || !dragStartRef.current) return;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Delta tracking relative to drag start:
      // Eliminates instant jump when finger touches hit box edge and ensures calm, 1:1 steady drag
      const dx = (e.clientX - dragStartRef.current.clientX) / rect.width;
      const dy = (e.clientY - dragStartRef.current.clientY) / rect.height;

      const clampedX = Math.max(0, Math.min(1, dragStartRef.current.startNormX + dx));
      const clampedY = Math.max(0, Math.min(1, dragStartRef.current.startNormY + dy));

      setNormQuad((prev) => {
        const next = [...prev] as [number, number, number, number, number, number, number, number];
        next[activeHandle * 2] = clampedX;
        next[activeHandle * 2 + 1] = clampedY;
        return next;
      });

      updateLoupe(e.clientX, e.clientY, activeHandle, clampedX, clampedY);
    };

    const onWindowPointerUp = () => {
      setActiveHandle(null);
      dragStartRef.current = null;
      setLoupePoint(null);
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [activeHandle, updateLoupe]);

  const handleResetQuad = () => {
    handleResetZoom();
    setNormQuad([
      initialQuad[0] / origWidth,
      initialQuad[1] / origHeight,
      initialQuad[2] / origWidth,
      initialQuad[3] / origHeight,
      initialQuad[4] / origWidth,
      initialQuad[5] / origHeight,
      initialQuad[6] / origWidth,
      initialQuad[7] / origHeight,
    ]);
  };

  const handleConfirm = () => {
    // 1. Points in pixel coordinate space
    const p0 = { x: normQuad[0] * origWidth, y: normQuad[1] * origHeight };
    const p1 = { x: normQuad[2] * origWidth, y: normQuad[3] * origHeight };
    const p2 = { x: normQuad[4] * origWidth, y: normQuad[5] * origHeight };
    const p3 = { x: normQuad[6] * origWidth, y: normQuad[7] * origHeight };
    const pts = [p0, p1, p2, p3];

    // Canonical OpenCV / computer vision ordering [TL, TR, BR, BL]:
    // TL = argmin(x + y)
    // BR = argmax(x + y)
    // TR = argmax(x - y)
    // BL = argmin(x - y)
    let tl = pts[0];
    let br = pts[0];
    let minSum = pts[0].x + pts[0].y;
    let maxSum = pts[0].x + pts[0].y;

    for (let i = 1; i < 4; i++) {
      const s = pts[i].x + pts[i].y;
      if (s < minSum) {
        minSum = s;
        tl = pts[i];
      }
      if (s > maxSum) {
        maxSum = s;
        br = pts[i];
      }
    }

    let tr = pts[0];
    let bl = pts[0];
    let maxDiff = -Infinity;
    let minDiff = Infinity;

    for (let i = 0; i < 4; i++) {
      const d = pts[i].x - pts[i].y;
      if (d > maxDiff) {
        maxDiff = d;
        tr = pts[i];
      }
      if (d < minDiff) {
        minDiff = d;
        bl = pts[i];
      }
    }

    const finalQuad: [number, number, number, number, number, number, number, number] = [
      Math.round(tl.x),
      Math.round(tl.y),
      Math.round(tr.x),
      Math.round(tr.y),
      Math.round(br.x),
      Math.round(br.y),
      Math.round(bl.x),
      Math.round(bl.y),
    ];
    onConfirm(finalQuad);
  };

  // Dynamic loupe placement away from user's thumb
  const loupeSize = 176;
  let loupeTop = 0;
  let loupeLeft = 0;
  if (loupePoint) {
    const pad = 16;
    if (activeHandle === 2) {
      // BR -> float top-left of touch point
      loupeLeft = loupePoint.clientX - loupeSize - 20;
      loupeTop = loupePoint.clientY - loupeSize - 20;
    } else if (activeHandle === 3) {
      // BL -> float top-right of touch point
      loupeLeft = loupePoint.clientX + 20;
      loupeTop = loupePoint.clientY - loupeSize - 20;
    } else if (activeHandle === 1) {
      // TR -> float bottom-left of touch point
      loupeLeft = loupePoint.clientX - loupeSize - 20;
      loupeTop = loupePoint.clientY + 20;
    } else {
      // TL -> float bottom-right of touch point
      loupeLeft = loupePoint.clientX + 20;
      loupeTop = loupePoint.clientY + 20;
    }

    loupeLeft = Math.max(pad, Math.min(window.innerWidth - loupeSize - pad, loupeLeft));
    loupeTop = Math.max(pad, Math.min(window.innerHeight - loupeSize - pad, loupeTop));
  }

  const corners = [
    { label: 'TL', x: normQuad[0], y: normQuad[1] },
    { label: 'TR', x: normQuad[2], y: normQuad[3] },
    { label: 'BR', x: normQuad[4], y: normQuad[5] },
    { label: 'BL', x: normQuad[6], y: normQuad[7] },
  ];

  return (
    <div className="relative w-full h-full bg-[var(--bg-void)] flex flex-col justify-between select-none overflow-hidden touch-none">
      {/* Top action header */}
      <div className="z-20 flex items-center justify-between px-3 h-[48px] bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] shrink-0 gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Undo2 size={13} strokeWidth={1.5} />
          <span>{t.cancelButton}</span>
        </button>

        <div className="font-mono text-xs tracking-wider text-[var(--text-primary)] whitespace-nowrap truncate px-1 font-semibold">
          {t.editorTitle}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleResetQuad}
            className="px-2 py-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
          >
            <RotateCw size={13} strokeWidth={1.5} />
            <span className="whitespace-nowrap">{t.resetCornersButton}</span>
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-2.5 py-1.5 rounded-[4px] bg-[var(--accent-laser)] text-white font-mono text-xs font-semibold flex items-center gap-1 cursor-pointer active:scale-95 transition-transform whitespace-nowrap"
          >
            <Check size={14} strokeWidth={2} />
            <span>{t.confirmCropButton}</span>
          </button>
        </div>
      </div>

      {/* Interactive Crop Workspace with Zoom & Pan */}
      <div
        onWheel={handleWheel}
        onPointerDown={handleWorkspacePointerDown}
        onPointerMove={handleWorkspacePointerMove}
        onPointerUp={handleWorkspacePointerUp}
        className={`relative flex-1 w-full h-full flex items-center justify-center p-4 overflow-hidden touch-none ${
          zoomLevel > 100 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        <div
          style={{
            transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomLevel / 100})`,
            transformOrigin: 'center center',
            transition: isPanning || activeHandle !== null ? 'none' : 'transform 100ms var(--ease-mechanical)',
          }}
          className="relative max-w-full max-h-full flex items-center justify-center"
        >
          <div
            ref={containerRef}
            className="relative max-w-full max-h-full inline-block shadow-sm"
          >
            {imageUrl && (
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Scan Target"
                draggable={false}
                className="max-h-[75vh] max-w-[90vw] object-contain block rounded-[2px] pointer-events-none"
              />
            )}

            {/* SVG Crop polygon overlay: 100% transparent fill so paper texture is crystal clear */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points={`
                  ${normQuad[0] * 100},${normQuad[1] * 100} 
                  ${normQuad[2] * 100},${normQuad[3] * 100} 
                  ${normQuad[4] * 100},${normQuad[5] * 100} 
                  ${normQuad[6] * 100},${normQuad[7] * 100}
                `}
                fill="none"
                stroke="var(--accent-laser)"
                strokeWidth="1.2"
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* 4 Interactive Corner Handles: Transparent center ring with fine 1px crosshair */}
            {corners.map((corner, idx) => (
              <div
                key={corner.label}
                onPointerDown={(e) => handlePointerDown(e, idx)}
                style={{
                  left: `${corner.x * 100}%`,
                  top: `${corner.y * 100}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-[52px] h-[52px] flex items-center justify-center cursor-crosshair z-30 touch-none"
              >
                {/* Visible Ring Handle (Transparent center so paper edge is completely visible) */}
                <div
                  className={`relative w-[28px] h-[28px] rounded-full border-2 border-[var(--accent-laser)] bg-transparent flex items-center justify-center transition-transform ${
                    activeHandle === idx ? 'scale-125 ring-2 ring-[var(--accent-laser)]/40' : ''
                  }`}
                >
                  {/* Thin 1px crosshair lines */}
                  <div className="absolute inset-x-0 h-[1px] bg-[var(--accent-laser)]/60 pointer-events-none" />
                  <div className="absolute inset-y-0 w-[1px] bg-[var(--accent-laser)]/60 pointer-events-none" />
                  {/* Transparent clear aperture center */}
                  <div className="w-[8px] h-[8px] rounded-full border border-[var(--accent-laser)] bg-transparent z-10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Canvas Zoom Controls (Matching AdaptiveStudio) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[var(--bg-panel)]/90 backdrop-blur-sm border border-[var(--border-hairline)] shadow-sm font-mono text-[11px] text-[var(--text-muted)] z-40">
        <button
          type="button"
          onClick={() => handleZoom(-25)}
          title={t.zoomOut}
          className="p-1 hover:text-[var(--text-primary)] cursor-pointer active:scale-95 transition-transform"
        >
          <ZoomOut size={13} strokeWidth={1.5} />
        </button>
        <span className="w-10 text-center font-mono select-none">{zoomLevel}%</span>
        <button
          type="button"
          onClick={() => handleZoom(25)}
          title={t.zoomIn}
          className="p-1 hover:text-[var(--text-primary)] cursor-pointer active:scale-95 transition-transform"
        >
          <ZoomIn size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          title={t.resetZoom}
          className="p-1 hover:text-[var(--text-primary)] cursor-pointer active:scale-95 transition-transform"
        >
          <Maximize2 size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* CamScanner Magnifier Loupe: 176px circular canvas at 1.75x zoom with corner bracket reticle */}
      <div
        style={{
          transform: `translate3d(${loupeLeft}px, ${loupeTop}px, 0)`,
          transition: 'opacity 120ms ease',
        }}
        className={`fixed pointer-events-none z-50 w-[176px] h-[176px] rounded-full border-[3px] border-[var(--accent-laser)] bg-[var(--bg-void)] shadow-[0_16px_50px_rgba(0,0,0,0.8)] overflow-hidden flex items-center justify-center ${
          activeHandle !== null && loupePoint ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
        }`}
      >
        <canvas ref={loupeCanvasRef} className="w-full h-full block" />
        <div className="absolute top-2 px-2 py-0.5 rounded-[2px] bg-black/85 border border-white/20 text-white font-mono text-[9px] tracking-widest font-semibold uppercase pointer-events-none shadow-md">
          {activeHandle !== null
            ? ['TL', 'TR', 'BR', 'BL'][activeHandle]
            : ''}{' '}
          · 1.75x
        </div>
      </div>
    </div>
  );
};
