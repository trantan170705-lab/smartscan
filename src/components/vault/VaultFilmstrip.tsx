import React, { useEffect, useState } from 'react';
import { RotateCw, Trash2, Crop, Plus, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { VaultPage } from '../../db/vault';
import { useLanguage } from '../../hooks/useLanguage';

interface VaultFilmstripProps {
  pages: VaultPage[];
  activePageIndex: number;
  onSelectPage: (index: number) => void;
  onRotatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onRecropPage: (pageId: string) => void;
  onMovePage?: (fromIndex: number, toIndex: number) => void;
  onAddPage: () => void;
  orientation?: 'vertical' | 'horizontal';
}

export const VaultFilmstrip: React.FC<VaultFilmstripProps> = ({
  pages,
  activePageIndex,
  onSelectPage,
  onRotatePage,
  onDeletePage,
  onRecropPage,
  onMovePage,
  onAddPage,
  orientation = 'vertical',
}) => {
  const { t } = useLanguage();
  // Store thumbnail object URLs with memory cleanup
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const urls: Record<string, string> = {};
    pages.forEach((page) => {
      urls[page.id] = URL.createObjectURL(page.processedThumbnailBlob || page.originalBlob);
    });
    setThumbUrls(urls);

    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pages]);

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`flex ${
        isVertical ? 'flex-col w-full h-full p-2 gap-2 overflow-y-auto' : 'flex-row w-full p-1.5 gap-1.5 overflow-x-auto'
      }`}
    >
      {pages.map((page, idx) => {
        const isActive = idx === activePageIndex;
        const thumbUrl = thumbUrls[page.id];

        return (
          <div
            key={page.id}
            onClick={() => onSelectPage(idx)}
            className={`group relative rounded-[2px] border transition-all cursor-pointer overflow-hidden shrink-0 ${
              isVertical ? 'w-full h-[120px]' : 'w-[54px] h-[68px]'
            } ${
              isActive
                ? 'border-[var(--accent-laser)] bg-[var(--bg-elevated)] ring-1 ring-[var(--accent-laser)]'
                : 'border-[var(--border-hairline)] bg-[var(--bg-panel)] hover:border-[var(--border-active)]'
            }`}
          >
            {/* Page number badge */}
            <div className="absolute top-1 left-1 z-10 px-1 py-0.5 rounded-[2px] bg-[var(--bg-void)]/80 backdrop-blur-sm border border-[var(--border-hairline)] font-mono text-[9px] text-[var(--text-muted)]">
              {String(idx + 1).padStart(2, '0')}
            </div>

            {/* Thumbnail Preview */}
            <div className="w-full h-full flex items-center justify-center p-1.5 bg-[var(--bg-void)]">
              {thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={`Page ${idx + 1}`}
                  style={{ transform: `rotate(${page.rotation}deg)` }}
                  className="max-w-full max-h-full object-contain shadow-xs transition-transform duration-100"
                />
              ) : (
                <div className="font-mono text-[9px] text-[var(--text-muted)]">PAGE_{idx + 1}</div>
              )}
            </div>

            {/* Move Page Left/Right (Up/Down) */}
            {onMovePage && pages.length > 1 && (
              <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePage(idx, idx - 1);
                    }}
                    title={t.movePageLeft}
                    aria-label={t.movePageLeft}
                    className="p-0.5 rounded-[2px] bg-[var(--bg-void)]/90 border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {isVertical ? <ArrowUp size={10} strokeWidth={2} /> : <ChevronLeft size={10} strokeWidth={2} />}
                  </button>
                )}
                {idx < pages.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePage(idx, idx + 1);
                    }}
                    title={t.movePageRight}
                    aria-label={t.movePageRight}
                    className="p-0.5 rounded-[2px] bg-[var(--bg-void)]/90 border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    {isVertical ? <ArrowDown size={10} strokeWidth={2} /> : <ChevronRight size={10} strokeWidth={2} />}
                  </button>
                )}
              </div>
            )}

            {/* Action buttons on hover */}
            <div className="absolute bottom-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRecropPage(page.id);
                }}
                title={t.recropPageTooltip}
                aria-label={t.recropPageTooltip}
                className="p-1 rounded-[2px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <Crop size={11} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRotatePage(page.id);
                }}
                title={t.rotatePageTooltip}
                aria-label={t.rotatePageTooltip}
                className="p-1 rounded-[2px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <RotateCw size={11} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePage(page.id);
                }}
                title={t.deletePageTooltip}
                aria-label={t.deletePageTooltip}
                className="p-1 rounded-[2px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-red-500 cursor-pointer"
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add Page Button */}
      <button
        type="button"
        onClick={onAddPage}
        title={t.addPageTooltip}
        aria-label={t.addPageTooltip}
        className={`rounded-[2px] border border-dashed border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-laser)] transition-colors cursor-pointer shrink-0 ${
          isVertical ? 'w-full h-[52px]' : 'w-[54px] h-[68px]'
        }`}
      >
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <Plus size={14} strokeWidth={1.5} />
          <span>{t.addPageTooltip}</span>
        </div>
      </button>
    </div>
  );
};
