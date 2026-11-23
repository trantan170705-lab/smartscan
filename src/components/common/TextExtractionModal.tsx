import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Copy,
  Check,
  ExternalLink,
  Download,
  Columns2,
  RefreshCw,
  X,
  Edit3,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import {
  extractDocumentText,
  exportToGoogleDocs,
  downloadAsTextFile,
  downloadAsWordDoc,
  type OcrResult,
} from '../../utils/ocrService';
import { HairlineDivider } from './HairlineDivider';
import { useLanguage } from '../../hooks/useLanguage';

interface TextExtractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSource: Blob | HTMLCanvasElement | null;
  thumbnailBlob?: Blob;
  pageThumbnailUrl?: string;
  docTitle?: string;
  initialText?: string;
  onSaveExtractedText?: (text: string) => void;
}

export const TextExtractionModal: React.FC<TextExtractionModalProps> = ({
  isOpen,
  onClose,
  imageSource,
  thumbnailBlob,
  pageThumbnailUrl,
  docTitle = 'Tài liệu SmartScan',
  initialText = '',
  onSaveExtractedText,
}) => {
  const { t } = useLanguage();

  const [text, setText] = useState<string>(initialText);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(92);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');
  const [activeThumbUrl, setActiveThumbUrl] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Manage thumbnail object URL
  useEffect(() => {
    if (pageThumbnailUrl) {
      setActiveThumbUrl(pageThumbnailUrl);
      return;
    }
    if (thumbnailBlob) {
      const url = URL.createObjectURL(thumbnailBlob);
      setActiveThumbUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [thumbnailBlob, pageThumbnailUrl]);

  // Trigger OCR extraction if initialText is empty and imageSource is provided
  useEffect(() => {
    if (!isOpen) return;

    if (initialText) {
      setText(initialText);
      setIsLoading(false);
      setProgress(100);
      return;
    }

    if (imageSource) {
      let isCancelled = false;
      setIsLoading(true);
      setProgress(10);

      extractDocumentText(imageSource, (p) => {
        if (!isCancelled) setProgress(p);
      })
        .then((res: OcrResult) => {
          if (!isCancelled) {
            setText(res.text);
            setConfidence(res.confidence);
            setIsLoading(false);
            setProgress(100);
            if (onSaveExtractedText) {
              onSaveExtractedText(res.text);
            }
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            console.error('OCR Error in Modal:', err);
            setIsLoading(false);
            setToastMessage('LỖI TRÍCH XUẤT VĂN BẢN');
            setTimeout(() => setToastMessage(null), 3000);
          }
        });

      return () => {
        isCancelled = true;
      };
    }
  }, [isOpen, imageSource, initialText, onSaveExtractedText]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const wordsCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const charsCount = text.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      showToast('ĐÃ SAO CHÉP TOÀN BỘ VĂN BẢN VÀO BỘ NHỚ TẠM');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      showToast('KHÔNG THỂ SAO CHÉP');
    }
  };

  const handleOpenGoogleDocs = async () => {
    try {
      await exportToGoogleDocs(text, docTitle);
      showToast('ĐÃ CHÉP VĂN BẢN & MỞ GOOGLE DOCS (Nhấn Ctrl+V để dán trực tiếp)');
    } catch {
      showToast('LỖI KHI MỞ GOOGLE DOCS');
    }
  };

  const handleSaveAndClose = () => {
    if (onSaveExtractedText) {
      onSaveExtractedText(text);
    }
    onClose();
  };

  const fontSizeClass = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-relaxed',
  }[fontSize];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in select-none">
      <div className="w-full max-w-5xl h-[92vh] max-h-[850px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[6px] shadow-2xl flex flex-col overflow-hidden">
        {/* ======================================================== */}
        {/* 1. MODAL HEADER                                          */}
        {/* ======================================================== */}
        <div className="h-[50px] px-4 bg-[var(--bg-elevated)] border-b border-[var(--border-hairline)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[4px] bg-[var(--accent-laser)]/10 border border-[var(--accent-laser)]/30 flex items-center justify-center text-[var(--accent-laser)]">
              <FileText size={18} strokeWidth={2} />
            </div>
            <div>
              <div className="font-mono text-xs font-bold tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                <span>TRÍCH XUẤT VĂN BẢN</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--accent-laser)]/15 text-[var(--accent-laser)] font-mono font-medium">
                  OCR TIẾNG VIỆT
                </span>
              </div>
              <div className="font-mono text-[10px] text-[var(--text-muted)] tracking-tight">
                {docTitle} // CONFIDENCE: {confidence}%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Split Toggle */}
            {activeThumbUrl && (
              <button
                type="button"
                onClick={() => setIsSplitView((prev) => !prev)}
                className={`p-1.5 rounded-[4px] border font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isSplitView
                    ? 'bg-[var(--accent-laser)]/15 border-[var(--accent-laser)] text-[var(--accent-laser)]'
                    : 'bg-[var(--bg-panel)] border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Bật/Tắt đối chiếu ảnh gốc song song"
              >
                <Columns2 size={14} strokeWidth={1.75} />
                <span className="hidden sm:inline">Đối chiếu ảnh</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              title="Đóng khung soạn thảo"
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. ACTION TOOLBAR                                        */}
        {/* ======================================================== */}
        <div className="px-4 py-2.5 bg-[var(--bg-panel)] border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mở & OCR trong Google Docs Button */}
            <button
              type="button"
              onClick={handleOpenGoogleDocs}
              disabled={isLoading || !text}
              className="h-8 px-3 rounded-[4px] bg-[var(--accent-laser)] hover:bg-[var(--accent-laser)]/90 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
              title="Mở Google Docs trực tuyến và tự động sao chép văn bản để dán"
            >
              <ExternalLink size={14} strokeWidth={2.2} />
              <span>Mở trong Google Docs</span>
            </button>

            {/* Sao chép tất cả */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={isLoading || !text}
              className="h-8 px-3 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-primary)] font-mono text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {isCopied ? (
                <>
                  <Check size={14} strokeWidth={2.5} className="text-emerald-500" />
                  <span className="text-emerald-500 font-bold">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy size={14} strokeWidth={1.75} />
                  <span>Sao chép tất cả</span>
                </>
              )}
            </button>

            <HairlineDivider vertical className="h-4 hidden sm:block" />

            {/* Tải về .DOC */}
            <button
              type="button"
              onClick={() => downloadAsWordDoc(text, docTitle)}
              disabled={isLoading || !text}
              className="h-8 px-2.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="Tải về file Microsoft Word (.doc) tương thích Google Docs"
            >
              <Download size={13} strokeWidth={1.75} />
              <span>Tải .DOC</span>
            </button>

            {/* Tải về .TXT */}
            <button
              type="button"
              onClick={() => downloadAsTextFile(text, docTitle)}
              disabled={isLoading || !text}
              className="h-8 px-2.5 rounded-[4px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="Tải về file văn bản thuần (.txt)"
            >
              <Download size={13} strokeWidth={1.75} />
              <span>Tải .TXT</span>
            </button>
          </div>

          {/* Right Toolbar Controls: Font Size Switcher */}
          <div className="flex items-center gap-1 font-mono text-xs text-[var(--text-muted)] bg-[var(--bg-void)] p-0.5 rounded-[4px] border border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setFontSize('sm')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                fontSize === 'sm' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold' : 'hover:text-[var(--text-primary)]'
              }`}
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize('base')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                fontSize === 'base' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold' : 'hover:text-[var(--text-primary)]'
              }`}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setFontSize('lg')}
              className={`px-2 py-0.5 rounded-[2px] cursor-pointer ${
                fontSize === 'lg' ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold' : 'hover:text-[var(--text-primary)]'
              }`}
            >
              A+
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. TOAST NOTIFICATION BANNER                             */}
        {/* ======================================================== */}
        {toastMessage && (
          <div className="bg-[var(--accent-laser)]/10 border-b border-[var(--accent-laser)]/30 px-4 py-2 text-xs font-mono text-[var(--accent-laser)] font-semibold flex items-center justify-between animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button type="button" onClick={() => setToastMessage(null)} className="cursor-pointer hover:opacity-75">
              <X size={14} />
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* 4. MAIN EDITOR WORKSPACE                                 */}
        {/* ======================================================== */}
        <div className="flex-1 flex overflow-hidden bg-[var(--bg-void)]">
          {isLoading ? (
            /* Loading OCR Progress State */
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none">
              <div className="w-12 h-12 rounded-full border-2 border-[var(--accent-laser)] border-t-transparent animate-spin mb-4" />
              <div className="font-mono text-sm font-bold text-[var(--text-primary)] tracking-wide mb-1">
                ĐANG TRÍCH XUẤT VĂN BẢN TIẾNG VIỆT QUA GOOGLE DOCS ENGINE
              </div>
              <div className="font-mono text-xs text-[var(--text-muted)] mb-4">
                Giữ nguyên dấu thanh tiếng Việt, cấu trúc đoạn văn bản và tiêu đề
              </div>
              <div className="w-64 max-w-full bg-[var(--bg-elevated)] h-2 rounded-full overflow-hidden border border-[var(--border-hairline)] mb-2">
                <div
                  className="bg-[var(--accent-laser)] h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="font-mono text-[11px] text-[var(--accent-laser)] font-semibold">
                TIẾN ĐỘ: {progress}%
              </div>
            </div>
          ) : (
            <>
              {/* Optional Left Pane: Scanned Document Image Preview for Side-by-Side Comparison */}
              {isSplitView && activeThumbUrl && (
                <div className="w-1/2 border-r border-[var(--border-hairline)] bg-[var(--bg-panel)] flex flex-col overflow-hidden">
                  <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border-b border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-muted)] tracking-wider uppercase flex items-center justify-between shrink-0">
                    <span>ẢNH TÀI LIỆU GỐC</span>
                    <span className="text-[var(--accent-laser)]">ĐỐI CHIẾU</span>
                  </div>
                  <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/20">
                    <img
                      src={activeThumbUrl}
                      alt="Scanned Document Reference"
                      className="max-w-full max-h-full object-contain shadow-lg rounded border border-[var(--border-hairline)]"
                    />
                  </div>
                </div>
              )}

              {/* Textarea Editor Area */}
              <div className={`flex-1 flex flex-col overflow-hidden ${isSplitView ? 'w-1/2' : 'w-full'}`}>
                <div className="px-3 py-1.5 bg-[var(--bg-elevated)] border-b border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-muted)] tracking-wider uppercase flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Edit3 size={11} />
                    <span>KHUNG SOẠN THẢO VĂN BẢN (CHỈNH SỬA TỰ DO)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>TỪ: {wordsCount}</span>
                    <span>//</span>
                    <span>KÝ TỰ: {charsCount}</span>
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-y-auto">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Nội dung văn bản trích xuất sẽ hiển thị tại đây..."
                    className={`w-full h-full min-h-[350px] bg-transparent text-[var(--text-primary)] font-sans resize-none focus:outline-none select-text ${fontSizeClass}`}
                    style={{ whiteSpace: 'pre-wrap' }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ======================================================== */}
        {/* 5. MODAL FOOTER                                          */}
        {/* ======================================================== */}
        <div className="h-[48px] px-4 bg-[var(--bg-elevated)] border-t border-[var(--border-hairline)] flex items-center justify-between shrink-0 font-mono text-xs">
          <div className="text-[var(--text-muted)] text-[11px] truncate mr-2 hidden sm:block">
            Mẹo: Nhấn <span className="text-[var(--accent-laser)] font-semibold">"Mở trong Google Docs"</span> để mở trang tài liệu mới và dán ngay văn bản.
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-[4px] bg-[var(--bg-panel)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSaveAndClose}
              className="px-4 py-1.5 rounded-[4px] bg-[var(--accent-laser)] hover:bg-[var(--accent-laser)]/90 text-white font-bold cursor-pointer active:scale-95 transition-transform"
            >
              Lưu thay đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
