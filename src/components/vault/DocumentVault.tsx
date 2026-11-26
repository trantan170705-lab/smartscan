import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  Upload,
  Search,
  FileText,
  Image as ImageIcon,
  FolderUp,
  CreditCard,
  Type,
  Sparkles,
  LayoutGrid,
  Share2,
  Eye,
  Trash2,
  Download,
  Check,
  X,
  FileSpreadsheet,
  FilePlus,
  FileSignature,
  Lock,
  Stamp,
  Home,
  ScanLine,
  Wrench,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { ThemeToggle } from '../common/ThemeToggle';
import { LanguageToggle } from '../common/LanguageToggle';
import { HairlineDivider } from '../common/HairlineDivider';
import { useLanguage } from '../../hooks/useLanguage';
import {
  getExportHistory,
  deleteExportHistoryItem,
  type ExportHistoryItem,
} from '../../db/exportHistory';
import { sharePdfDocument } from '../../utils/shareService';
import type { VaultPage } from '../../db/vault';

interface DocumentVaultProps {
  onOpenViewfinder: () => void;
  onImportFiles: (files: FileList | File[]) => void;
  onOpenHistory?: () => void;
  onOpenStudio?: () => void;
  onSelectPage?: (idx: number) => void;
  onEditDocument?: (item: ExportHistoryItem) => void;
  onTriggerExtractText?: (source: 'camera' | 'import' | 'existing') => void;
  pages?: VaultPage[];
  isProcessing?: boolean;
}

export const DocumentVault: React.FC<DocumentVaultProps> = ({
  onOpenViewfinder,
  onImportFiles,
  onOpenHistory,
  onOpenStudio,
  onEditDocument,
  onTriggerExtractText,
  pages = [],
  isProcessing = false,
}) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Bottom Tab: strictly 3 items: 'home' | 'scan' | 'tools'
  const [activeTab, setActiveTab] = useState<'home' | 'tools'>('home');

  // Search filter query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Export history items
  const [historyItems, setHistoryItems] = useState<ExportHistoryItem[]>([]);
  const [historyThumbUrls, setHistoryThumbUrls] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<string | null>(null);
  const [isExtractPickerOpen, setIsExtractPickerOpen] = useState<boolean>(false);

  // Load history on mount
  const loadHistory = async () => {
    try {
      const items = await getExportHistory();
      setHistoryItems(items);

      const urls: Record<string, string> = {};
      items.forEach((item) => {
        urls[item.id] = URL.createObjectURL(item.pdfBlob);
      });
      setHistoryThumbUrls(urls);
    } catch (e) {
      console.error('Failed to load export history:', e);
    }
  };

  useEffect(() => {
    loadHistory();
    return () => {
      Object.values(historyThumbUrls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  // Filtered documents
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyItems;
    const q = searchQuery.toLowerCase().trim();
    return historyItems.filter((item) => item.fileName.toLowerCase().includes(q));
  }, [historyItems, searchQuery]);

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteExportHistoryItem(id);
      setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      if (historyThumbUrls[id]) {
        URL.revokeObjectURL(historyThumbUrls[id]);
        setHistoryThumbUrls((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      showToast('ĐÃ XÓA TÀI LIỆU');
    } catch {
      showToast('XÓA THẤT BẠI');
    }
  };

  const handleSharePdf = async (item: ExportHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    await sharePdfDocument(item.pdfBlob, item.fileName, showToast);
  };

  const handleDownloadPdf = (item: ExportHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = URL.createObjectURL(item.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`TẢI VỀ: ${item.fileName}`);
  };

  const handleViewPdf = (item: ExportHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = URL.createObjectURL(item.pdfBlob);
    window.open(url, '_blank');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    const d = new Date(timestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  };

  // Quick tools list following UI_UX_SPEC.md optical hardware styling
  const quickTools = [
    {
      id: 'scan',
      label: t.toolScan,
      code: 'CAMERA',
      icon: ScanLine,
      action: onOpenViewfinder,
      highlight: true,
    },
    {
      id: 'pdf_ops',
      label: t.toolPdf,
      code: 'PDF_DOC',
      icon: FileText,
      action: () => setActiveTab('tools'),
    },
    {
      id: 'import_img',
      label: t.toolImportImg,
      code: 'GALLERY',
      icon: ImageIcon,
      action: () => fileInputRef.current?.click(),
    },
    {
      id: 'import_file',
      label: t.toolImportFile,
      code: 'STORAGE',
      icon: FolderUp,
      action: () => fileInputRef.current?.click(),
    },
    {
      id: 'id_card',
      label: t.toolIdCard,
      code: 'ID_CARD',
      icon: CreditCard,
      action: () => {
        showToast('CHẾ ĐỘ THẺ ID // 2 MẶT');
        onOpenViewfinder();
      },
    },
    {
      id: 'ocr',
      label: t.toolOcr,
      code: 'OCR_TXT',
      icon: Type,
      action: () => {
        if (pages.length > 0) {
          onTriggerExtractText ? onTriggerExtractText('existing') : onOpenStudio?.();
        } else {
          setIsExtractPickerOpen(true);
        }
      },
    },
    {
      id: 'ai_solver',
      label: t.toolAiSolver,
      code: 'NEURAL',
      icon: Sparkles,
      action: () => showToast('NEURAL_ENGINE: SẴN SÀNG PHÂN TÍCH'),
    },
    {
      id: 'all_tools',
      label: t.toolAll,
      code: 'INDEX',
      icon: LayoutGrid,
      action: () => setActiveTab('tools'),
    },
  ];

  return (
    <div className="relative w-full h-full bg-[var(--bg-void)] text-[var(--text-primary)] flex flex-col justify-between overflow-hidden select-none">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Optical Hardware Toast (UI_UX_SPEC.md: Technical pill, no bounce) */}
      {notification && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--accent-laser)] font-mono text-[11px] text-[var(--accent-laser)] flex items-center gap-2 shadow-xs transition-opacity duration-150">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-laser)]" />
          <span>{notification}</span>
        </div>
      )}

      {/* Main Scrollable Workspace Container */}
      <div className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto pb-20 px-3 sm:px-6 pt-3">
        {/* ======================================================== */}
        {/* 1. TOP HARDWARE HEADER & SEARCH BAR */}
        {/* ======================================================== */}
        <header className="flex items-center justify-between gap-2 mb-4 p-2 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)]">
          {/* Hardware Brand Monogram (Click to Return Home) */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveTab('home');
            }}
            title="Trang chủ"
            className="flex items-center gap-2 pl-1 shrink-0 cursor-pointer hover:opacity-80 active:scale-95 transition-all"
          >
            <span className="w-[6px] h-[6px] bg-[var(--accent-laser)] rounded-[1px]" />
            <span className="font-mono text-xs font-bold tracking-wider text-[var(--text-primary)] uppercase">
              {t.brandName}
            </span>
          </button>

          <HairlineDivider vertical className="h-4 hidden sm:block" />

          {/* Search Box (Expands smoothly into freed header space) */}
          <div className="flex-1 relative flex items-center min-w-0">
            <Search
              size={14}
              strokeWidth={1.5}
              className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-8 pr-7 py-1.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] focus:border-[var(--accent-laser)] focus:outline-none font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            )}
          </div>

          {/* Compact Toggles (Dropdown Language & Theme) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </header>

        {activeTab === 'home' ? (
          <>
            {/* ======================================================== */}
            {/* 2. OPTICAL QUICK TOOLS GRID (Compact 30% Functional Module) */}
            {/* ======================================================== */}
            <div className="mb-2.5">
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 p-1.5 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)]">
                {quickTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={tool.action}
                      className="flex flex-col items-center justify-center py-1.5 px-0.5 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] hover:bg-[var(--bg-panel)] transition-all cursor-pointer group text-center"
                    >
                      <div
                        className={`w-7 h-7 rounded-[2px] flex items-center justify-center transition-transform group-hover:scale-105 shrink-0 ${
                          tool.highlight
                            ? 'bg-[var(--accent-laser)] text-white'
                            : 'bg-[var(--bg-panel)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                        }`}
                      >
                        <Icon size={14} strokeWidth={1.5} />
                      </div>
                      <div className="font-mono text-[10px] font-medium text-[var(--text-primary)] mt-1 w-full truncate px-0.5 leading-none">
                        {tool.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Staged Session Strip (Compact Height) */}
            {pages.length > 0 && onOpenStudio && (
              <div className="mb-2.5 p-2 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--accent-laser)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[2px] bg-[var(--accent-laser)] text-white flex items-center justify-center font-mono text-[11px] font-bold shrink-0">
                    {String(pages.length).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="font-mono text-[11px] font-semibold text-[var(--text-primary)] uppercase tracking-wider truncate">
                      PHIÊN ĐANG MỞ // {pages.length} {t.pagesCount}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenStudio}
                  className="px-2.5 py-1 rounded-[3px] bg-[var(--accent-laser)] text-white font-mono text-[11px] font-medium flex items-center gap-1 active:scale-95 transition-transform cursor-pointer shrink-0"
                >
                  <span>MỞ STUDIO</span>
                  <ChevronRight size={12} strokeWidth={2} />
                </button>
              </div>
            )}

            {/* ======================================================== */}
            {/* 3. RECENT ARCHIVE SECTION ("Gần đây") */}
            {/* ======================================================== */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    {t.recentTitle}
                  </span>
                  {filteredHistory.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                      {String(filteredHistory.length).padStart(2, '0')}
                    </span>
                  )}
                </div>
                {filteredHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenHistory?.()}
                    className="font-mono text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-laser)] transition-colors cursor-pointer"
                  >
                    {t.seeAll}
                  </button>
                )}
              </div>

              {/* Document List (Hardware List Items) */}
              {filteredHistory.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      onClick={(e) => handleViewPdf(item, e)}
                      className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] transition-all flex flex-col gap-2.5 cursor-pointer group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Technical Document Card Thumbnail (rounded-[2px]) */}
                        <div className="w-10 h-13 rounded-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex flex-col items-center justify-center shrink-0 text-[var(--text-muted)] relative overflow-hidden group-hover:border-[var(--accent-laser)] transition-colors">
                          <FileText size={18} strokeWidth={1.5} />
                          <span className="font-mono text-[8px] font-bold tracking-tighter mt-0.5 text-[var(--accent-laser)]">
                            PDF
                          </span>
                        </div>

                        {/* Document Title & Tabular Metadata */}
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-laser)] transition-colors">
                            {item.fileName}
                          </div>
                          <div className="font-mono text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-2">
                            <span>{formatDate(item.timestamp)}</span>
                            <span>/</span>
                            <span>
                              {String(item.pageCount).padStart(2, '0')} {t.pagesCount}
                            </span>
                            <span>/</span>
                            <span>{formatFileSize(item.fileSizeBytes)}</span>
                          </div>
                        </div>

                        {/* Quick Delete */}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          title="XÓA KHỎI LỊCH SỬ"
                          className="p-1 rounded-[3px] text-[var(--text-muted)] hover:text-[var(--accent-laser)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      </div>

                      {/* Hardware Action Pills (UI_UX_SPEC.md: rounded-[3px], font-mono 11px) */}
                      <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--border-hairline)]">
                        {onEditDocument && item.pages && item.pages.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditDocument(item);
                            }}
                            className="flex-1 py-1 px-2 rounded-[3px] bg-[var(--accent-laser)]/10 hover:bg-[var(--accent-laser)] text-[var(--accent-laser)] hover:text-white font-mono text-[11px] font-medium flex items-center justify-center gap-1.5 border border-[var(--accent-laser)]/40 transition-colors cursor-pointer"
                          >
                            <FileSignature size={12} strokeWidth={1.5} />
                            <span>{t.editDocument}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleSharePdf(item, e)}
                          className="flex-1 py-1 px-2 rounded-[3px] bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] hover:text-[var(--accent-laser)] font-mono text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 border border-[var(--border-hairline)] transition-colors cursor-pointer"
                        >
                          <Share2 size={12} strokeWidth={1.5} />
                          <span>{t.shareButton}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleDownloadPdf(item, e)}
                          className="flex-1 py-1 px-2 rounded-[3px] bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] font-mono text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 border border-[var(--border-hairline)] transition-colors cursor-pointer"
                        >
                          <Download size={12} strokeWidth={1.5} />
                          <span>{t.downloadButton}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleViewPdf(item, e)}
                          className="flex-1 py-1 px-2 rounded-[3px] bg-[var(--bg-elevated)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] font-mono text-[11px] text-[var(--text-muted)] flex items-center justify-center gap-1.5 border border-[var(--border-hairline)] transition-colors cursor-pointer"
                        >
                          <Eye size={12} strokeWidth={1.5} />
                          <span>{t.viewButton}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Hardware Empty State Box from UI_UX_SPEC.md Section 4.E */
                <div className="p-8 border border-dashed border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-panel)] flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center mb-3 text-[var(--accent-laser)]">
                    <Layers size={22} strokeWidth={1.5} />
                  </div>
                  <div className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    {t.noDocsIndexed}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--text-muted)] mb-4 max-w-sm">
                    {t.dropImagesHint}
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={onOpenViewfinder}
                      className="px-3.5 py-2 rounded-[4px] bg-[var(--accent-laser)] text-white font-mono text-xs font-medium flex items-center justify-center gap-1.5 active:scale-95 transition-transform cursor-pointer whitespace-nowrap"
                    >
                      <Camera size={13} strokeWidth={2} />
                      <span className="whitespace-nowrap">{t.openViewfinder}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-primary)] font-mono text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <Upload size={13} strokeWidth={1.5} />
                      <span className="whitespace-nowrap">{t.importFiles}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* ======================================================== */
          /* TOOLS TAB VIEW ("Công cụ" - Optical Hardware Spec) */
          /* ======================================================== */
          <div className="flex flex-col gap-4">
            <div className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)]">
              <div className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                BỘ TIỆN ÍCH QUANG HỌC // HARDWARE_UTILITIES
              </div>
              <div className="font-mono text-[11px] text-[var(--text-muted)] mt-1">
                ENGINE: PURE_WASM // 100% CLIENT-SIDE ZERO-COPY ARCHITECTURE
              </div>
            </div>

            {/* Category 1: PDF Operations */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase px-1">
                01. CÔNG CỤ PDF // PDF_ENGINE
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <FileText size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      XUẤT PDF A4
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">KHỔ TIÊU CHUẨN</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => showToast('TIỆN ÍCH GỘP PDF: SẴN SÀNG CHỌN TỆP')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <FilePlus size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      GHÉP NỐI PDF
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">GỘP NHIỀU FILE</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => showToast('NÉN DUNG LƯỢNG PDF BẰNG DCT')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <Download size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      NÉN DUNG LƯỢNG
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">TỐI ƯU HÓA SIZE</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Category 2: Recognition & Neural */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase px-1">
                02. QUANG HỌC & AI // NEURAL_VISION
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (pages.length > 0) {
                      onTriggerExtractText ? onTriggerExtractText('existing') : onOpenStudio?.();
                    } else {
                      setIsExtractPickerOpen(true);
                    }
                  }}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <Type size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      BÓC TÁCH CHỮ (OCR)
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">TRÍCH XUẤT .TXT</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    showToast('CHẾ ĐỘ THẺ ID // 2 MẶT');
                    onOpenViewfinder();
                  }}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <CreditCard size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      THẺ ID / CCCD
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">2 MẶT / 1 TRANG</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => showToast('AI_SOLVER: ĐANG NẠP MÔ HÌNH')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <Sparkles size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      AI TỔNG HỢP
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">TÓM TẮT NỘI DUNG</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Category 3: Security & Watermark */}
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase px-1">
                03. BẢO MẬT & KÝ TÊN // SECURITY
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => showToast('KÝ TÊN ĐIỆN TỬ: SẴN SÀNG')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <FileSignature size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      KÝ TÀI LIỆU
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">CHỮ KÝ TAY SỐ</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => showToast('ĐÓNG DẤU CHÌM WATERMARK')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <Stamp size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      DẤU WATERMARK
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">CHỐNG SAO CHÉP</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => showToast('MÃ HÓA KHÓA MẬT KHẨU')}
                  className="p-3 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-2.5 text-left transition-colors cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0 group-hover:text-[var(--accent-laser)]">
                    <Lock size={16} strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                      KHÓA MẬT KHẨU
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)]">MÃ HÓA AES-256</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 5. BOTTOM NAVIGATION BAR (Strictly 3 Items) */}
      {/* 1: Trang chủ, 2: Quét tài liệu, 3: Công cụ */}
      {/* Precision hardware dock: 48px height, hairline border */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-[var(--bg-panel)] border-t border-[var(--border-hairline)] z-40 flex items-center justify-around px-3">
        {/* Item 1: Trang chủ */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`flex-1 h-full flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
            activeTab === 'home'
              ? 'text-[var(--accent-laser)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Home size={18} strokeWidth={activeTab === 'home' ? 2 : 1.5} />
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase mt-1">
            {t.tabHome}
          </span>
        </button>

        {/* Item 2: Quét tài liệu (Opens Live Viewfinder) */}
        <button
          type="button"
          onClick={onOpenViewfinder}
          className="flex-1 h-full flex flex-col items-center justify-center py-1 text-[var(--text-muted)] hover:text-[var(--accent-laser)] transition-colors cursor-pointer group"
        >
          <ScanLine size={18} strokeWidth={1.5} className="group-hover:text-[var(--accent-laser)] transition-colors" />
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase mt-1">
            {t.tabScan}
          </span>
        </button>

        {/* Item 3: Công cụ */}
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`flex-1 h-full flex flex-col items-center justify-center py-1 transition-colors cursor-pointer ${
            activeTab === 'tools'
              ? 'text-[var(--accent-laser)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Wrench size={18} strokeWidth={activeTab === 'tools' ? 2 : 1.5} />
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase mt-1">
            {t.tabTools}
          </span>
        </button>
      </nav>

      {/* Extract Text Source Selection Dialog */}
      {isExtractPickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[6px] shadow-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-[4px] bg-[var(--accent-laser)]/10 text-[var(--accent-laser)] flex items-center justify-center border border-[var(--accent-laser)]/20">
                  <Type size={16} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    TRÍCH XUẤT VĂN BẢN (OCR)
                  </h3>
                  <p className="font-mono text-[10px] text-[var(--text-muted)]">
                    Tự động nhận diện chữ tiếng Việt & mở khung soạn thảo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExtractPickerOpen(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsExtractPickerOpen(false);
                  onTriggerExtractText ? onTriggerExtractText('camera') : onOpenViewfinder();
                }}
                className="p-3.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-3 text-left transition-colors cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] group-hover:border-[var(--accent-laser)] flex items-center justify-center shrink-0 text-[var(--accent-laser)]">
                  <Camera size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                    MỞ MÁY ẢNH ĐỂ CHỤP
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-muted)]">
                    Chụp tài liệu thực tế, tự động làm thẳng & trích xuất văn bản
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsExtractPickerOpen(false);
                  onTriggerExtractText ? onTriggerExtractText('import') : fileInputRef.current?.click();
                }}
                className="p-3.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--accent-laser)] flex items-center gap-3 text-left transition-colors cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] group-hover:border-[var(--accent-laser)] flex items-center justify-center shrink-0 text-[var(--accent-laser)]">
                  <Upload size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="font-mono text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-laser)]">
                    CHỌN ẢNH TỪ THIẾT BỊ
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-muted)]">
                    Tải lên file ảnh có sẵn để bóc tách chữ tiếng Việt
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
