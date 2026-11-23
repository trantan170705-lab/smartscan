import React, { useState, useEffect } from 'react';
import { Download, X, Share, Monitor, Smartphone, CheckCircle2 } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const checkIsRunningStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

export const PwaInstallBanner: React.FC = () => {
  const [isStandalone, setIsStandalone] = useState<boolean>(checkIsRunningStandalone);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState<boolean>(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState<boolean>(false);

  useEffect(() => {
    // 1. If already running as an installed standalone app, do nothing
    if (checkIsRunningStandalone()) {
      setIsStandalone(true);
      return;
    }

    // 2. Listen for display-mode changes (e.g. user opens in app)
    const mql = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsStandalone(true);
      }
    };
    mql.addEventListener('change', handleDisplayChange);

    // 3. Listen for appinstalled event (fired when installation completes)
    const handleAppInstalled = () => {
      setIsStandalone(true);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // 4. Capture beforeinstallprompt for one-click installation on Chromium
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      mql.removeEventListener('change', handleDisplayChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    // A. Native Chromium Prompt
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
      return;
    }

    // B. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;
    if (isIos) {
      setShowIosGuide(true);
      return;
    }

    // C. Other Desktop / Android browsers without beforeinstallprompt
    setShowDesktopGuide(true);
  };

  // If already installed and running standalone, or dismissed, do not render
  if (isStandalone || isDismissed) {
    return null;
  }

  return (
    <>
      {/* ======================================================== */}
      {/* STICKY TOP PWA INSTALL HEADER */}
      {/* ======================================================== */}
      <div className="w-full shrink-0 z-40 bg-[var(--bg-elevated)] border-b border-[var(--border-hairline)] px-3 sm:px-4 py-2 flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-3 overflow-hidden mr-2">
          {/* App Icon */}
          <div className="relative shrink-0">
            <img
              src="/app-icon.png"
              alt="SmartScan"
              className="w-8 h-8 rounded-[6px] object-contain shadow-sm border border-[var(--border-hairline)] bg-white/5"
            />
          </div>

          {/* Title & Tagline */}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs sm:text-sm font-bold text-[var(--text-primary)] tracking-wide truncate">
                CÀI ĐẶT SMARTSCAN NHƯ ỨNG DỤNG
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent-laser)]/15 text-[var(--accent-laser)] font-mono font-bold shrink-0">
                PWA // APP
              </span>
            </div>
            <p className="font-mono text-[11px] text-[var(--text-muted)] truncate hidden sm:block">
              Trải nghiệm toàn màn hình mượt mà, dùng ngoại tuyến & không cần gõ web
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="h-8 px-3.5 rounded-[4px] bg-[var(--accent-laser)] hover:bg-[var(--accent-laser)]/90 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
            title="Cài đặt SmartScan lên thiết bị"
          >
            <Download size={14} strokeWidth={2.2} />
            <span>CÀI ĐẶT</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] cursor-pointer transition-colors"
            title="Tạm ẩn"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* iOS Safari Step-by-Step Installation Modal */}
      {/* ======================================================== */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-sm bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[6px] shadow-2xl p-5 flex flex-col gap-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
              <div className="flex items-center gap-2">
                <img src="/app-icon.png" alt="SmartScan" className="w-6 h-6 rounded-[5px]" />
                <span className="font-bold text-[var(--text-primary)]">CÀI ĐẶT TRÊN IPHONE / IPAD</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[var(--text-muted)] text-[11px] leading-relaxed flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Bấm vào nút <strong>Chia sẻ (Share)</strong> <Share size={12} className="inline mx-0.5 text-[var(--accent-laser)]" /> ở thanh dưới cùng Safari.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Cuộn xuống danh sách tác vụ và chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong>.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Bấm <strong>"Thêm" (Add)</strong> ở góc trên bên phải để tạo biểu tượng ứng dụng.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 mt-2 rounded-[4px] bg-[var(--accent-laser)] text-white font-bold text-center cursor-pointer active:scale-95 transition-transform"
            >
              ĐÃ HIỂU
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* Desktop / Other Browsers Installation Guide Modal */}
      {/* ======================================================== */}
      {showDesktopGuide && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[6px] shadow-2xl p-5 flex flex-col gap-3 font-mono text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
              <div className="flex items-center gap-2">
                <img src="/app-icon.png" alt="SmartScan" className="w-6 h-6 rounded-[5px]" />
                <span className="font-bold text-[var(--text-primary)]">HƯỚNG DẪN CÀI ĐẶT ỨNG DỤNG</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDesktopGuide(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="text-[var(--text-muted)] text-[11px] leading-relaxed flex flex-col gap-3 py-1">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Nhìn lên <strong>thanh địa chỉ (URL)</strong> của trình duyệt ở phía trên.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Nhấp vào biểu tượng <strong>Cài đặt ứng dụng</strong> (hình màn hình máy tính có mũi tên hoặc biểu tượng dấu cộng <strong>⊕</strong> ở góc phải thanh URL).
                  <br />
                  <em>Hoặc bấm Menu trình duyệt (dấu 3 chấm <strong>⋮</strong>) ➔ Chọn <strong>"Cài đặt SmartScan"</strong>.</em>
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[var(--accent-laser)]/20 text-[var(--accent-laser)] font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Nhấp <strong>"Cài đặt"</strong> trong hộp thoại xác nhận. SmartScan sẽ mở ngay dưới dạng ứng dụng độc lập!
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDesktopGuide(false)}
              className="w-full py-2.5 mt-1 rounded-[4px] bg-[var(--accent-laser)] text-white font-bold text-center cursor-pointer active:scale-95 transition-transform"
            >
              ĐÃ HIỂU
            </button>
          </div>
        </div>
      )}
    </>
  );
};
