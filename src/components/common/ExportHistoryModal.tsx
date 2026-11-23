import React, { useEffect, useState } from 'react';
import {
  X,
  FileText,
  Download,
  Share2,
  Trash2,
  Clock,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import {
  getExportHistory,
  deleteExportHistoryItem,
  clearAllExportHistory,
  ExportHistoryItem,
} from '../../db/exportHistory';
import { sharePdfDocument } from '../../utils/shareService';
import { useLanguage } from '../../hooks/useLanguage';

interface ExportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportHistoryModal: React.FC<ExportHistoryModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<ExportHistoryItem[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const { language } = useLanguage();

  const isVi = language === 'vi';

  const loadHistory = async () => {
    const items = await getExportHistory();
    setHistory(items);
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleDownload = (item: ExportHistoryItem) => {
    const url = URL.createObjectURL(item.pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(isVi ? `Đã tải về tệp ${item.fileName}` : `Downloaded ${item.fileName}`);
  };

  const handleShare = async (item: ExportHistoryItem) => {
    await sharePdfDocument(item.pdfBlob, item.fileName, (msg: string) => showToast(msg));
  };

  const handleDelete = async (id: string) => {
    await deleteExportHistoryItem(id);
    await loadHistory();
  };

  const handleClearAll = async () => {
    if (window.confirm(isVi ? 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử xuất file?' : 'Clear all export history?')) {
      await clearAllExportHistory();
      setHistory([]);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins} ${day}/${month}/${year}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none">
      <div className="relative w-full max-w-[560px] max-h-[85vh] bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[4px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-[48px] px-4 border-b border-[var(--border-hairline)] flex items-center justify-between shrink-0 bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-[var(--text-primary)] tracking-wider">
            <Clock size={15} strokeWidth={2} className="text-[var(--accent-laser)]" />
            <span>{isVi ? 'LỊCH SỬ TÀI LIỆU ĐÃ XUẤT' : 'EXPORTED DOCUMENTS HISTORY'}</span>
            <span className="text-[var(--text-muted)] font-normal text-[11px]">
              ({history.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[10px] font-mono text-[var(--text-muted)] hover:text-red-400 cursor-pointer transition-colors px-1.5 py-0.5 rounded-[2px]"
              >
                {isVi ? 'Xóa hết' : 'Clear all'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-[3px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-void)] cursor-pointer"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Toast notification */}
        {notification && (
          <div className="px-4 py-2 bg-[var(--accent-laser)]/10 border-b border-[var(--accent-laser)]/30 flex items-center gap-2 font-mono text-[11px] text-[var(--accent-laser)] animate-fadeIn">
            <CheckCircle2 size={13} strokeWidth={2} />
            <span>{notification}</span>
          </div>
        )}

        {/* List of files */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {history.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-[var(--text-muted)] font-mono text-xs">
              <FileText size={32} strokeWidth={1.5} className="mb-2 opacity-40 text-[var(--accent-laser)]" />
              <div>{isVi ? 'CHƯA CÓ FILE NÀO ĐƯỢC LƯU' : 'NO SAVED FILES YET'}</div>
              <div className="text-[11px] opacity-70 mt-1 max-w-[280px]">
                {isVi
                  ? 'Khi bạn bấm "XUẤT PDF", tài liệu sẽ được lưu tự động tại đây.'
                  : 'Exported PDF files will be safely stored here for instant access.'}
              </div>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-[4px] bg-[var(--bg-void)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-[34px] h-[34px] rounded-[3px] bg-[var(--accent-laser)]/10 border border-[var(--accent-laser)]/20 flex items-center justify-center text-[var(--accent-laser)] shrink-0 mt-0.5">
                    <FileText size={18} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-[var(--text-primary)] truncate">
                      {item.fileName}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-muted)] mt-0.5">
                      <span>{formatDate(item.timestamp)}</span>
                      <span>•</span>
                      <span>{item.pageCount} {isVi ? 'trang' : 'pages'}</span>
                      <span>•</span>
                      <span>{formatSize(item.fileSizeBytes)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  {/* Share button */}
                  <button
                    type="button"
                    onClick={() => handleShare(item)}
                    title={isVi ? 'Chia sẻ qua Zalo / Ứng dụng' : 'Share via Zalo / Apps'}
                    className="px-2.5 py-1.5 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-primary)] font-mono text-[11px] flex items-center gap-1.5 cursor-pointer active:scale-95 transition-transform"
                  >
                    <Share2 size={12} strokeWidth={1.5} className="text-[var(--accent-laser)]" />
                    <span>{isVi ? 'Zalo / Chia sẻ' : 'Share'}</span>
                  </button>

                  {/* Re-download button */}
                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    title={isVi ? 'Tải lại về máy' : 'Download file'}
                    className="p-1.5 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-primary)] cursor-pointer active:scale-95 transition-transform"
                  >
                    <Download size={13} strokeWidth={1.5} />
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    title={isVi ? 'Xóa khỏi lịch sử' : 'Delete from history'}
                    className="p-1.5 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-red-400 cursor-pointer active:scale-95 transition-transform"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info banner */}
        <div className="p-3 border-t border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[10px] font-mono text-[var(--text-muted)] flex items-center justify-between">
          <span>{isVi ? 'Lưu trữ an toàn 100% trên thiết bị' : 'Stored safely 100% on device'}</span>
          <span className="text-[var(--accent-laser)]">SmartScan</span>
        </div>
      </div>
    </div>
  );
};
