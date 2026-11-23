import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RotateCw,
  RotateCcw,
  Crop,
  Download,
  Plus,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Clock,
  Trash2,
  Check,
  X,
  Columns2,
  Edit2,
  Type,
} from 'lucide-react';
import type { VaultPage } from '../../db/vault';
import { ThemeToggle } from '../common/ThemeToggle';
import { LanguageToggle } from '../common/LanguageToggle';
import { TelemetryPill } from '../common/TelemetryPill';
import { HairlineDivider } from '../common/HairlineDivider';
import { VaultFilmstrip } from '../vault/VaultFilmstrip';
import { useScannerWorker } from '../../hooks/useScannerWorker';
import { useLanguage } from '../../hooks/useLanguage';

interface AdaptiveStudioProps {
  pages: VaultPage[];
  activePageIndex: number;
  docTitle: string;
  onUpdateDocTitle: (title: string) => void;
  onSelectPage: (idx: number) => void;
  onUpdatePage: (id: string, updates: Partial<VaultPage>) => void;
  onApplyFilterToAll: (mode: 0 | 1 | 2 | 3, contrast: number, brightness: number) => void;
  onMovePage?: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (id: string) => void;
  onRecropPage: (id: string) => void;
  onAddPage: () => void;
  onExportPdf: (pageSize: string) => Promise<void>;
  onExportSingleJpeg: (page: VaultPage) => Promise<void>;
  onExtractText?: (page: VaultPage) => void;
  onOpenHistory?: () => void;
  onBackToHome?: () => void;
  isExporting?: boolean;
}

export const AdaptiveStudio: React.FC<AdaptiveStudioProps> = ({
  pages,
  activePageIndex,
  docTitle,
  onUpdateDocTitle,
  onSelectPage,
  onUpdatePage,
  onApplyFilterToAll,
  onMovePage,
  onDeletePage,
  onRecropPage,
  onAddPage,
  onExportPdf,
  onExportSingleJpeg,
  onExtractText,
  onOpenHistory,
  onBackToHome,
  isExporting = false,
}) => {
  const activePage = pages[activePageIndex];
  const { applyFilter, warpPerspective, lastProcessingMs } = useScannerWorker();
  const { t } = useLanguage();

  // Active processed preview URL with automatic revocation
  const [activePreviewUrl, setActivePreviewUrl] = useState<string>('');
  const [rawBlobUrl, setRawBlobUrl] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [pageSize, setPageSize] = useState<string>('A4');
  const [isReprocessing, setIsReprocessing] = useState<boolean>(false);

  // Pan and drag offset for canvas inspection when zoomed
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; startX: number; startY: number } | null>(null);

  // Mobile CamScanner interactive drawer & compare states
  const [isFineTuningOpen, setIsFineTuningOpen] = useState<boolean>(false);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  // Discrete rotation state: only animate when user explicitly clicks "Xoay 90°"
  const [isRotating, setIsRotating] = useState<boolean>(false);

  // High-performance Memory Cache Map: pageId -> { url, sig, blob }
  // Completely eliminates re-warping and re-processing when switching between pages!
  const previewCacheRef = useRef<Map<string, { url: string; sig: string; blob: Blob }>>(new Map());

  // Reset pan offset whenever page switches
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [activePage?.id]);

  // Immediate preview synchronization on page switch (0ms delay)
  useEffect(() => {
    if (!activePage) {
      setActivePreviewUrl('');
      return;
    }
    const cached = previewCacheRef.current.get(activePage.id);
    const quadSig = activePage.quad.map((n) => Math.round(n)).join(',');
    const currentSig = `${activePage.id}_${quadSig}_${activePage.filterMode}_${activePage.contrast}_${activePage.brightness}_${activePage.rotation}`;

    if (cached && cached.sig === currentSig) {
      setActivePreviewUrl(cached.url);
    }
  }, [activePage?.id, activePage?.quad, activePage?.filterMode, activePage?.contrast, activePage?.brightness, activePage?.rotation]);

  // Keep rawBlobUrl in sync with activePage.originalBlob
  useEffect(() => {
    if (!activePage) {
      setRawBlobUrl('');
      return;
    }
    const url = URL.createObjectURL(activePage.originalBlob);
    setRawBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activePage?.id, activePage?.originalBlob]);

  // Render processed preview from originalBlob + quad + filter + contrast + brightness
  const updateProcessedPreview = useCallback(async () => {
    if (!activePage) return;

    const quadSig = activePage.quad.map((n) => Math.round(n)).join(',');
    const currentSig = `${activePage.id}_${quadSig}_${activePage.filterMode}_${activePage.contrast}_${activePage.brightness}_${activePage.rotation}`;

    // 1. Check if already cached in memory Map
    const cached = previewCacheRef.current.get(activePage.id);
    if (cached && cached.sig === currentSig) {
      if (activePreviewUrl !== cached.url) {
        setActivePreviewUrl(cached.url);
      }
      return;
    }

    setIsReprocessing(true);
    try {
      // 1. Decode originalBlob to ImageData
      const img = new Image();
      const objUrl = URL.createObjectURL(activePage.originalBlob);
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = objUrl;
      });
      URL.revokeObjectURL(objUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rawRgba = new Uint8Array(imgData.data.buffer);

      // Memory hygiene: free canvas
      canvas.width = 0;
      canvas.height = 0;

      // 2. Warp Perspective using pure Rust WASM
      const warped = await warpPerspective(
        rawRgba,
        imgData.width,
        imgData.height,
        activePage.quad
      );

      // 3. Apply Filter using WASM
      const filtered = await applyFilter(
        warped.data,
        warped.width,
        warped.height,
        activePage.filterMode,
        activePage.contrast,
        activePage.brightness
      );

      // 4. Render to Blob
      const outCanvas = document.createElement('canvas');
      outCanvas.width = warped.width;
      outCanvas.height = warped.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) return;

      const outImgData = new ImageData(
        new Uint8ClampedArray(filtered.data.buffer as ArrayBuffer),
        warped.width,
        warped.height
      );
      outCtx.putImageData(outImgData, 0, 0);

      outCanvas.toBlob(
        (blob) => {
          outCanvas.width = 0;
          outCanvas.height = 0;
          if (blob) {
            // Revoke old URL for THIS page if it existed
            const old = previewCacheRef.current.get(activePage.id);
            if (old && old.url) {
              URL.revokeObjectURL(old.url);
            }
            const newUrl = URL.createObjectURL(blob);
            previewCacheRef.current.set(activePage.id, {
              url: newUrl,
              sig: currentSig,
              blob,
            });
            setActivePreviewUrl(newUrl);
            // Update processed thumbnail for filmstrip
            onUpdatePage(activePage.id, { processedThumbnailBlob: blob });
          }
        },
        'image/jpeg',
        0.88
      );
    } catch (e) {
      console.error('Error reprocessing page in WASM:', e);
    } finally {
      setIsReprocessing(false);
    }
  }, [activePage, activePreviewUrl, warpPerspective, applyFilter, onUpdatePage]);

  // Trigger reprocessing whenever page parameters change
  useEffect(() => {
    updateProcessedPreview();
  }, [
    activePage?.id,
    activePage?.quad,
    activePage?.filterMode,
    activePage?.contrast,
    activePage?.brightness,
    activePage?.rotation,
    updateProcessedPreview,
  ]);

  // Clean up all cached preview URLs on unmount
  useEffect(() => {
    return () => {
      previewCacheRef.current.forEach((item) => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
      previewCacheRef.current.clear();
    };
  }, []);

  // Rotate active page 90 degrees CW with smooth animation only when user clicks rotate
  const handleRotateCurrent = () => {
    if (!activePage) return;
    setIsRotating(true);
    const nextRotation = ((activePage.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    onUpdatePage(activePage.id, { rotation: nextRotation });
    setTimeout(() => {
      setIsRotating(false);
    }, 200);
  };

  // Zoom controls with auto-pan reset at <= 100%
  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => {
      const next = Math.max(50, Math.min(350, prev + delta));
      if (next <= 100) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY < 0 ? 15 : -15;
    setZoomLevel((prev) => {
      const next = Math.max(50, Math.min(350, prev + delta));
      if (next <= 100) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  // Drag / Pan handlers for zoomed document inspection (Desktop + Mobile)
  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    if (e.button === 0 && zoomLevel > 100) {
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
      } catch {}
    }
  };

  const filterModes: { mode: 0 | 1 | 2 | 3; name: string; cssFilter: string }[] = [
    { mode: 0, name: t.filterOriginal, cssFilter: 'none' },
    { mode: 1, name: t.filterMagic, cssFilter: 'brightness(1.15) contrast(1.22) saturate(1.2)' },
    { mode: 2, name: t.filterMagicPro, cssFilter: 'brightness(1.25) contrast(1.35) saturate(1.1)' },
    { mode: 3, name: t.filterBw, cssFilter: 'grayscale(100%) contrast(1.5) brightness(1.1)' },
  ];

  return (
    <div className="relative w-full h-full flex flex-col bg-[var(--bg-void)] select-none overflow-hidden">
      {/* ======================================================== */}
      {/* 1. MOBILE CAMSCANNER VIEWPORT (md:hidden)                */}
      {/* ======================================================== */}
      <div className="flex md:hidden flex-col w-full h-full overflow-hidden relative">
        {/* Mobile Header (44px) */}
        <header className="h-[44px] px-3 bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] flex items-center justify-between shrink-0 z-20">
          {/* Back button */}
          <button
            type="button"
            onClick={onBackToHome}
            title="Quay lại"
            className="p-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>

          {/* Centered Document Title with pencil icon */}
          <div className="flex-1 min-w-0 max-w-[220px] flex items-center justify-center gap-1 mx-2">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => onUpdateDocTitle(e.target.value)}
              aria-label={t.docTitleAria}
              className="bg-transparent border-b border-transparent focus:border-[var(--accent-laser)] font-mono text-[11px] font-semibold text-[var(--text-primary)] outline-none text-center truncate tracking-wide transition-colors"
            />
            <Edit2 size={11} strokeWidth={1.5} className="text-[var(--text-muted)] shrink-0 pointer-events-none" />
          </div>

          {/* Quick Hardware Toggles */}
          <div className="flex items-center gap-1 shrink-0">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                title={t.historyTooltip}
                className="p-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Clock size={13} strokeWidth={1.5} />
              </button>
            )}
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile Center Workspace (Canvas ~65% height with Pan/Drag when Zoomed) */}
        <div
          onPointerDown={handleWorkspacePointerDown}
          onPointerMove={handleWorkspacePointerMove}
          onPointerUp={handleWorkspacePointerUp}
          className={`relative flex-1 w-full min-h-0 bg-[var(--bg-void)] blueprint-grid flex flex-col items-center justify-center p-3 overflow-hidden touch-none ${
            zoomLevel > 100 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
          }`}
        >
          {activePage ? (
            <div
              style={{
                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 80ms var(--ease-mechanical)',
              }}
              className="relative max-w-full max-h-[82%] flex items-center justify-center select-none"
            >
              {activePreviewUrl ? (
                <div className="relative flex items-center justify-center">
                  {/* Scanned Document Image with discrete rotation and zero page-switch spin */}
                  <img
                    key={activePage.id}
                    src={isComparing && rawBlobUrl ? rawBlobUrl : activePreviewUrl}
                    alt={`${t.pageNumber} ${activePageIndex + 1}`}
                    draggable={false}
                    style={{
                      transform: isComparing ? 'none' : `rotate(${activePage.rotation}deg)`,
                      transition: isRotating ? 'transform 150ms var(--ease-mechanical)' : 'none',
                    }}
                    className="max-h-[56vh] max-w-[90vw] object-contain shadow-md rounded-[2px] border border-[var(--border-hairline)] select-none pointer-events-none"
                  />

                  {/* CamScanner Trash Button on Top-Left of paper */}
                  <button
                    type="button"
                    onClick={() => {
                      if (pages.length <= 1) {
                        onDeletePage(activePage.id);
                      } else if (confirm('Xóa trang này khỏi tài liệu?')) {
                        onDeletePage(activePage.id);
                      }
                    }}
                    title={t.deletePageTooltip}
                    className="absolute top-2 left-2 w-7 h-7 rounded-full bg-[var(--bg-panel)]/85 backdrop-blur-sm border border-[var(--border-hairline)] text-zinc-400 hover:text-red-500 flex items-center justify-center shadow-sm active:scale-90 transition-transform cursor-pointer z-10 pointer-events-auto"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>

                  {/* Comparing Indicator Badge */}
                  {isComparing && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-[2px] bg-[var(--accent-laser)] text-white font-mono text-[9px] font-bold tracking-wider uppercase shadow-md pointer-events-none">
                      {t.comparingOriginal}
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 py-6 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] font-mono text-xs text-[var(--text-muted)] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-laser)] animate-ping" />
                  <span>{t.initializingWarp}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="font-mono text-xs text-[var(--text-muted)]">
              {t.selectPagePrompt}
            </div>
          )}

          {/* Stepper, Zoom & Compare Control Bar (CamScanner pagination bar directly under document) */}
          {activePage && (
            <div className="mt-2.5 flex items-center justify-between w-full max-w-[320px] px-2.5 py-1 rounded-[4px] bg-[var(--bg-panel)]/95 backdrop-blur-sm border border-[var(--border-hairline)] shadow-xs z-10">
              {/* Stepper < 01 / 01 > */}
              <div className="flex items-center gap-1.5 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => onSelectPage(Math.max(0, activePageIndex - 1))}
                  disabled={activePageIndex === 0}
                  aria-label={t.prevPage}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <span className="px-1 text-[var(--text-primary)] font-semibold font-mono text-xs">
                  {String(activePageIndex + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectPage(Math.min(pages.length - 1, activePageIndex + 1))}
                  disabled={activePageIndex >= pages.length - 1}
                  aria-label={t.nextPage}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>

              {/* Mobile Zoom Tool Controls */}
              <div className="flex items-center gap-1 font-mono text-[10px] text-[var(--text-muted)] border-l border-r border-[var(--border-hairline)] px-2">
                <button
                  type="button"
                  onClick={() => handleZoom(-25)}
                  className="p-0.5 hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <ZoomOut size={12} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title={t.resetZoom}
                  className="w-8 text-center hover:text-[var(--accent-laser)] font-semibold cursor-pointer"
                >
                  {zoomLevel}%
                </button>
                <button
                  type="button"
                  onClick={() => handleZoom(25)}
                  className="p-0.5 hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <ZoomIn size={12} strokeWidth={1.5} />
                </button>
              </div>

              {/* So sánh (Compare with raw photo) */}
              <button
                type="button"
                onMouseDown={() => setIsComparing(true)}
                onMouseUp={() => setIsComparing(false)}
                onTouchStart={() => setIsComparing(true)}
                onTouchEnd={() => setIsComparing(false)}
                className={`px-2 py-0.5 rounded-[2px] border font-mono text-[10px] font-medium flex items-center gap-1 cursor-pointer select-none transition-colors ${
                  isComparing
                    ? 'bg-[var(--accent-laser)] text-white border-[var(--accent-laser)]'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Columns2 size={12} strokeWidth={1.5} />
                <span>{t.compare}</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Filter Carousel Rail */}
        {activePage && (
          <div className="h-[82px] bg-[var(--bg-panel)] border-t border-[var(--border-hairline)] px-2.5 py-1.5 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 z-10">
            {filterModes.map(({ mode, name, cssFilter }) => {
              const isActive = activePage.filterMode === mode;
              const thumbSrc = isActive ? activePreviewUrl : (rawBlobUrl || activePreviewUrl);
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onUpdatePage(activePage.id, { filterMode: mode })}
                  className={`flex flex-col items-center justify-between min-w-[72px] w-[74px] h-[72px] p-1 rounded-[3px] transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--accent-laser)]/10 border-2 border-[var(--accent-laser)] text-[var(--accent-laser)] shadow-xs'
                      : 'bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:border-[var(--border-active)]'
                  }`}
                >
                  {/* Miniature preview thumbnail */}
                  <div className="w-full h-[44px] rounded-[2px] bg-[var(--bg-void)] border border-[var(--border-hairline)] overflow-hidden flex items-center justify-center">
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt={name}
                        style={{ filter: isActive ? 'none' : cssFilter }}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-[var(--accent-laser)]" />
                    )}
                  </div>
                  {/* Label - compact readable text without truncation ellipsis */}
                  <span className="font-mono text-[8px] font-semibold text-center mt-0.5 leading-tight tracking-tighter whitespace-nowrap overflow-visible">
                    {name}
                  </span>
                </button>
              );
            })}

            {/* Áp dụng tất cả button */}
            <button
              type="button"
              onClick={() =>
                onApplyFilterToAll(
                  activePage.filterMode as 0 | 1 | 2 | 3,
                  activePage.contrast,
                  activePage.brightness
                )
              }
              title={t.applyToAllPages}
              className="flex flex-col items-center justify-center min-w-[56px] h-[72px] p-1 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] text-[var(--text-muted)] hover:text-[var(--accent-laser)] font-mono text-[9px] cursor-pointer transition-colors text-center leading-tight shrink-0"
            >
              <span>ÁP DỤNG</span>
              <span className="font-bold text-[var(--accent-laser)]">TẤT CẢ</span>
            </button>
          </div>
        )}

        {/* Fine-Tuning Drawer (Floats over bottom dock when opened) */}
        {isFineTuningOpen && activePage && (
          <div className="absolute inset-x-0 bottom-[54px] bg-[var(--bg-panel)] border-t border-[var(--border-hairline)] p-3.5 shadow-2xl z-30 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2">
              <div className="flex items-center gap-1.5">
                <Sliders size={13} strokeWidth={1.5} className="text-[var(--accent-laser)]" />
                <span className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  {t.fineTuningLabel}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdatePage(activePage.id, { contrast: 1.0, brightness: 0.0 })}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[9px] font-mono cursor-pointer"
                >
                  <RotateCcw size={10} strokeWidth={1.5} />
                  <span>{t.resetSlidersButton}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFineTuningOpen(false)}
                  className="p-1 rounded-[2px] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X size={15} strokeWidth={2} />
                </button>
              </div>
            </div>

            {/* Contrast slider */}
            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-[var(--text-muted)]">{t.contrastLabel}</span>
                <span className="text-[var(--text-primary)] font-bold">{activePage.contrast.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={activePage.contrast}
                onChange={(e) => onUpdatePage(activePage.id, { contrast: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Brightness slider */}
            <div>
              <div className="flex justify-between font-mono text-[11px] mb-1">
                <span className="text-[var(--text-muted)]">{t.brightnessLabel}</span>
                <span className="text-[var(--text-primary)] font-bold">
                  {activePage.brightness > 0 ? `+${activePage.brightness}` : activePage.brightness}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                step="5"
                value={activePage.brightness}
                onChange={(e) => onUpdatePage(activePage.id, { brightness: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Page size format */}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border-hairline)]">
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">
                {t.outputPageSpecLabel}
              </span>
              <div className="flex gap-1 bg-[var(--bg-void)] border border-[var(--border-hairline)] p-0.5 rounded-[3px]">
                {['A4', 'Letter', 'Fit'].map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => setPageSize(format)}
                    className={`px-2.5 py-0.5 text-center font-mono text-[10px] rounded-[2px] cursor-pointer ${
                      pageSize === format
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-semibold border border-[var(--border-active)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mobile Bottom Action Dock (CamScanner 5-item toolbar) */}
        <div className="h-[54px] px-3 bg-[var(--bg-panel)] border-t border-[var(--border-hairline)] flex items-center justify-between shrink-0 z-20">
          {/* Thêm trang */}
          <button
            type="button"
            onClick={onAddPage}
            className="flex flex-col items-center justify-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-95 transition-transform cursor-pointer px-2"
          >
            <Plus size={18} strokeWidth={1.75} />
            <span className="font-mono text-[9px] tracking-tight">{t.mobileAddPage}</span>
          </button>

          {/* Xoay */}
          <button
            type="button"
            onClick={handleRotateCurrent}
            className="flex flex-col items-center justify-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-95 transition-transform cursor-pointer px-2"
          >
            <RotateCw size={18} strokeWidth={1.75} />
            <span className="font-mono text-[9px] tracking-tight">{t.mobileRotate}</span>
          </button>

          {/* Cắt góc */}
          <button
            type="button"
            onClick={() => activePage && onRecropPage(activePage.id)}
            className="flex flex-col items-center justify-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] active:scale-95 transition-transform cursor-pointer px-2"
          >
            <Crop size={18} strokeWidth={1.75} />
            <span className="font-mono text-[9px] tracking-tight">{t.mobileCrop}</span>
          </button>

          {/* Trích xuất văn bản (CamScanner OCR) */}
          <button
            type="button"
            onClick={() => activePage && onExtractText && onExtractText(activePage)}
            className="flex flex-col items-center justify-center gap-0.5 text-[var(--text-muted)] hover:text-[var(--accent-laser)] active:scale-95 transition-transform cursor-pointer px-2"
            title="Trích xuất văn bản & Mở Google Docs"
          >
            <Type size={18} strokeWidth={1.75} />
            <span className="font-mono text-[9px] tracking-tight">{t.toolOcr}</span>
          </button>

          {/* Tinh chỉnh */}
          <button
            type="button"
            onClick={() => setIsFineTuningOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer px-2 ${
              isFineTuningOpen
                ? 'text-[var(--accent-laser)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sliders size={18} strokeWidth={1.75} />
            <span className="font-mono text-[9px] tracking-tight">{t.mobileFineTune}</span>
          </button>

          {/* XUẤT (Prominent Orange Button with Check) */}
          <button
            type="button"
            onClick={() => onExportPdf(pageSize)}
            disabled={isExporting || pages.length === 0}
            className="h-9 px-4 rounded-[4px] bg-[var(--accent-laser)] hover:bg-[var(--accent-laser)]/90 text-white font-mono text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform cursor-pointer disabled:opacity-50 ml-1"
          >
            <Check size={16} strokeWidth={2.5} />
            <span>{isExporting ? '...' : t.mobileExport}</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. DESKTOP 3-PANE WORKSTATION VIEWPORT (hidden md:flex)  */}
      {/* ======================================================== */}
      <div className="hidden md:flex flex-col w-full h-full overflow-hidden">
        {/* Top Status Strip: 44px (from UI_UX_SPEC.md) */}
        <header className="h-[44px] px-4 bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                title="Quay lại trang chủ"
                className="p-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                <ChevronLeft size={15} strokeWidth={2} />
              </button>
            )}

            <button
              type="button"
              onClick={onBackToHome}
              title="Về trang chủ"
              className="font-mono text-xs font-bold tracking-widest text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer hover:opacity-80 active:scale-95 transition-transform"
            >
              <span className="w-[8px] h-[8px] bg-[var(--accent-laser)] rounded-[1px]" />
              <span>{t.brandName}</span>
            </button>

            <HairlineDivider vertical className="h-4" />

            {/* Editable Document Title */}
            <input
              type="text"
              value={docTitle}
              onChange={(e) => onUpdateDocTitle(e.target.value)}
              aria-label={t.docTitleAria}
              className="bg-transparent border-b border-transparent hover:border-[var(--border-hairline)] focus:border-[var(--border-active)] font-mono text-[11px] text-[var(--text-muted)] focus:text-[var(--text-primary)] outline-none px-1 py-0.5 tracking-wider uppercase transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Telemetry LED */}
            <TelemetryPill
              label={isReprocessing ? t.warpingWasm : t.engineReady}
              status={isReprocessing ? 'active' : 'ready'}
              subLabel={lastProcessingMs > 0 ? `${lastProcessingMs}ms` : undefined}
            />

            {/* Export History Button */}
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                title={t.historyTooltip}
                className="p-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                <Clock size={13} strokeWidth={1.5} />
              </button>
            )}

            {/* Language Switcher (VI / EN) */}
            <LanguageToggle />

            {/* Theme Switcher (Dark / Light) */}
            <ThemeToggle />

            {/* Trích xuất văn bản (OCR) Button */}
            {activePage && onExtractText && (
              <button
                type="button"
                onClick={() => onExtractText(activePage)}
                className="px-3 py-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] text-[var(--text-primary)] hover:text-[var(--accent-laser)] font-mono text-[11px] font-medium flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                title="Trích xuất văn bản OCR & Mở Google Docs"
              >
                <Type size={13} strokeWidth={2} />
                <span>{t.toolOcr}</span>
              </button>
            )}

            {/* Export PDF Button */}
            <button
              type="button"
              onClick={() => onExportPdf(pageSize)}
              disabled={isExporting || pages.length === 0}
              className="px-3 py-1.5 rounded-[4px] bg-[var(--accent-laser)] text-white font-mono text-[11px] font-medium flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform disabled:opacity-50"
            >
              <Download size={13} strokeWidth={2} />
              <span>{isExporting ? t.exporting : t.exportPdf}</span>
            </button>
          </div>
        </header>

        {/* Main 3-Pane Workstation Layout */}
        <div className="flex-1 w-full h-full flex flex-row overflow-hidden">
          {/* Left Filmstrip Rail: 220px on desktop */}
          <aside className="w-[220px] bg-[var(--bg-panel)] border-r border-[var(--border-hairline)] shrink-0 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-muted)] tracking-wider">
              <span>{t.pagesRailTitle} ({String(pages.length).padStart(2, '0')})</span>
              <button
                type="button"
                onClick={onAddPage}
                title={t.addPageTooltip}
                className="p-1 rounded-[2px] hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Plus size={13} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <VaultFilmstrip
                pages={pages}
                activePageIndex={activePageIndex}
                onSelectPage={onSelectPage}
                onRotatePage={() => handleRotateCurrent()}
                onDeletePage={(id) => onDeletePage(id)}
                onRecropPage={(id) => onRecropPage(id)}
                onMovePage={onMovePage}
                onAddPage={onAddPage}
                orientation="vertical"
              />
            </div>
          </aside>

          {/* Center Fluid Canvas Workspace with 20px blueprint dot grid (Drag/Pan when Zoomed) */}
          <main
            onWheel={handleWheel}
            onPointerDown={handleWorkspacePointerDown}
            onPointerMove={handleWorkspacePointerMove}
            onPointerUp={handleWorkspacePointerUp}
            className={`relative flex-1 w-full min-h-0 bg-[var(--bg-void)] blueprint-grid flex items-center justify-center p-4 overflow-hidden touch-none ${
              zoomLevel > 100 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
            }`}
          >
            {activePage ? (
              <div
                style={{
                  transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 80ms var(--ease-mechanical)',
                }}
                className="relative max-w-full max-h-full flex items-center justify-center origin-center select-none"
              >
                {activePreviewUrl ? (
                  <img
                    key={activePage.id}
                    src={activePreviewUrl}
                    alt={`${t.pageNumber} ${activePageIndex + 1}`}
                    draggable={false}
                    style={{
                      transform: `rotate(${activePage.rotation}deg)`,
                      transition: isRotating ? 'transform 150ms var(--ease-mechanical)' : 'none',
                    }}
                    className="max-h-[68vh] max-w-[55vw] object-contain shadow-lg rounded-[2px] pointer-events-none select-none"
                  />
                ) : (
                  <div className="px-6 py-8 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] font-mono text-xs text-[var(--text-muted)] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-laser)] animate-ping" />
                    <span>{t.initializingWarp}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="font-mono text-xs text-[var(--text-muted)]">
                {t.selectPagePrompt}
              </div>
            )}

            {/* Floating Canvas Zoom & Navigation Tools */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-[4px] bg-[var(--bg-panel)]/90 backdrop-blur-sm border border-[var(--border-hairline)] shadow-sm font-mono text-[11px] text-[var(--text-muted)]">
              <button
                type="button"
                onClick={() => onSelectPage(Math.max(0, activePageIndex - 1))}
                disabled={activePageIndex === 0}
                aria-label={t.prevPage}
                title={t.prevPage}
                className="p-1 hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} strokeWidth={1.5} />
              </button>
              <span className="px-1 text-[var(--text-primary)] font-medium">
                {String(activePageIndex + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={() => onSelectPage(Math.min(pages.length - 1, activePageIndex + 1))}
                disabled={activePageIndex >= pages.length - 1}
                aria-label={t.nextPage}
                title={t.nextPage}
                className="p-1 hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={14} strokeWidth={1.5} />
              </button>

              <HairlineDivider vertical className="h-3 mx-1" />

              <button
                type="button"
                onClick={() => handleZoom(-25)}
                title={t.zoomOut}
                className="p-1 hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ZoomOut size={13} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title={t.resetZoom}
                className="w-10 text-center font-mono hover:text-[var(--accent-laser)] cursor-pointer"
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={() => handleZoom(25)}
                title={t.zoomIn}
                className="p-1 hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ZoomIn size={13} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title={t.resetZoom}
                className="p-1 hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Maximize2 size={12} strokeWidth={1.5} />
              </button>
            </div>
          </main>

          {/* Right Inspector Rail: 280px on desktop (Hardware controls from UI_UX_SPEC.md) */}
          <aside className="w-[280px] bg-[var(--bg-panel)] border-l border-[var(--border-hairline)] p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            {activePage ? (
              <div className="flex flex-col gap-4">
                {/* 1. Hardware Segmented Filter Switcher */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-mono text-[10px] text-[var(--text-muted)] tracking-wider uppercase">
                      {t.scanFilterLabel}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        onApplyFilterToAll(
                          activePage.filterMode as 0 | 1 | 2 | 3,
                          activePage.contrast,
                          activePage.brightness
                        )
                      }
                      title={t.applyToAllPages}
                      className="px-2 py-0.5 rounded-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] text-[var(--text-muted)] hover:text-[var(--accent-laser)] font-mono text-[9px] tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {t.applyToAllPages}
                    </button>
                  </div>
                  <div className="bg-[var(--bg-void)] border border-[var(--border-hairline)] p-1 rounded-[4px] grid grid-cols-2 gap-1.5">
                    {filterModes.map(({ mode, name }) => {
                      const isActive = activePage.filterMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onUpdatePage(activePage.id, { filterMode: mode })}
                          className={`py-2 px-1 text-center font-mono text-[11px] font-medium tracking-wide rounded-[2px] transition-colors cursor-pointer whitespace-nowrap overflow-hidden ${
                            isActive
                              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-active)] font-semibold shadow-xs'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/40'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Fine-tune sliders (Contrast & Brightness) with Reset */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between font-mono text-[10px] text-[var(--text-muted)] tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <span>{t.fineTuningLabel}</span>
                      <Sliders size={12} strokeWidth={1.5} />
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdatePage(activePage.id, { contrast: 1.0, brightness: 0.0 })}
                      title={t.resetSlidersButton}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer text-[9px] font-mono tracking-wider transition-colors active:scale-95"
                    >
                      <RotateCcw size={10} strokeWidth={1.5} />
                      <span>{t.resetSlidersButton}</span>
                    </button>
                  </div>

                  {/* Contrast slider */}
                  <div>
                    <div className="flex justify-between font-mono text-[11px] mb-1">
                      <span className="text-[var(--text-muted)]">{t.contrastLabel}</span>
                      <span className="text-[var(--text-primary)]">{activePage.contrast.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={activePage.contrast}
                      onChange={(e) => onUpdatePage(activePage.id, { contrast: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  {/* Brightness slider */}
                  <div>
                    <div className="flex justify-between font-mono text-[11px] mb-1">
                      <span className="text-[var(--text-muted)]">{t.brightnessLabel}</span>
                      <span className="text-[var(--text-primary)]">
                        {activePage.brightness > 0 ? `+${activePage.brightness}` : activePage.brightness}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="5"
                      value={activePage.brightness}
                      onChange={(e) => onUpdatePage(activePage.id, { brightness: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* 3. Geometry Operations */}
                <div>
                  <label className="block font-mono text-[10px] text-[var(--text-muted)] tracking-wider uppercase mb-1.5">
                    {t.geometryOpsLabel}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onRecropPage(activePage.id)}
                      className="py-2 px-2 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] font-mono text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Crop size={13} strokeWidth={1.5} className="shrink-0" />
                      <span className="whitespace-nowrap">{t.reCropButton}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRotateCurrent}
                      className="py-2 px-2 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] font-mono text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCw size={13} strokeWidth={1.5} className="shrink-0" />
                      <span className="whitespace-nowrap">{t.rotate90Button}</span>
                    </button>
                  </div>
                </div>

                {/* 4. Page Output Spec */}
                <div>
                  <label className="block font-mono text-[10px] text-[var(--text-muted)] tracking-wider uppercase mb-2">
                    {t.outputPageSpecLabel}
                  </label>
                  <div className="grid grid-cols-3 gap-1 bg-[var(--bg-void)] border border-[var(--border-hairline)] p-1 rounded-[4px]">
                    {['A4', 'Letter', 'Fit'].map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => setPageSize(format)}
                        className={`py-1 text-center font-mono text-[11px] rounded-[2px] cursor-pointer ${
                          pageSize === format
                            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-medium border border-[var(--border-active)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center font-mono text-xs text-[var(--text-muted)]">
                {t.selectPagePrompt}
              </div>
            )}

            {/* Bottom Export & Page Actions */}
            <div className="pt-4 border-t border-[var(--border-hairline)] flex flex-col gap-2 shrink-0">
              {activePage && onExtractText && (
                <button
                  type="button"
                  onClick={() => onExtractText(activePage)}
                  className="w-full py-2 px-3 rounded-[4px] bg-[var(--accent-laser)]/10 border border-[var(--accent-laser)]/40 hover:bg-[var(--accent-laser)]/20 font-mono text-[11px] text-[var(--accent-laser)] font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Type size={13} strokeWidth={2} />
                  <span>TRÍCH XUẤT VĂN BẢN (OCR)</span>
                </button>
              )}

              {activePage && (
                <button
                  type="button"
                  onClick={() => onExportSingleJpeg(activePage)}
                  className="w-full py-2 px-3 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] font-mono text-[11px] text-[var(--text-primary)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileText size={13} strokeWidth={1.5} />
                  <span>{t.saveCurrentPageJpg}</span>
                </button>
              )}

              {/* Keyboard shortcut hint badges */}
              <div className="grid grid-cols-2 gap-1 font-mono text-[9px] text-[var(--text-muted)] pt-2 opacity-70">
                <div>{t.shortcutCapture}</div>
                <div>{t.shortcutRotate}</div>
                <div>{t.shortcutFilters}</div>
                <div>{t.shortcutExport}</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
