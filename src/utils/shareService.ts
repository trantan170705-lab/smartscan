/**
 * Detect Mobile / Tablet OS (Android, iOS, iPadOS)
 */
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent || '';
  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/i.test(ua) || isTouchMac;
}

/**
 * Sanitize filename for safe OS file transfer (always preserves .pdf extension)
 */
export function sanitizePdfFileName(fileName: string): string {
  const cleaned = (fileName || 'SmartScan_Document.pdf')
    .trim()
    .replace(/[:\\/*?"<>|\r\n]+/g, '_');
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

/**
 * Wake up Zalo PC Desktop application via custom protocol handler (zalo://).
 * Shows the browser's native "Open Zalo" dialog (or opens Zalo PC directly if allowed).
 */
export function launchZaloPc(): void {
  try {
    const zaloIframe = document.createElement('iframe');
    zaloIframe.style.display = 'none';
    zaloIframe.src = 'zalo://';
    document.body.appendChild(zaloIframe);
    window.setTimeout(() => {
      if (zaloIframe.parentNode) {
        zaloIframe.parentNode.removeChild(zaloIframe);
      }
    }, 2500);
  } catch {
    // Ignore if protocol handler is not registered
  }
}

/**
 * Cross-platform PDF Sharing:
 * - On Mobile / Tablet (iOS / Android): Opens native OS Share Sheet with the .PDF file (Zalo, Messenger, AirDrop).
 * - On Windows / Desktop PC:
 *     1. Never opens Windows Share Sheet, never opens a custom modal, and never downloads into Downloads.
 *     2. Registers the actual .PDF file into Windows System FileDropList (CF_HDROP) via local bridge
 *        so pressing Ctrl + V inside ANY Zalo PC chat pastes the exact .PDF file attachment!
 *     3. Launches Zalo PC ("Mở Zalo" browser prompt / direct launch via zalo://).
 */
export async function sharePdfDocument(
  pdfBlob: Blob,
  fileName: string,
  onNotify?: (msg: string) => void
): Promise<void> {
  const safeName = sanitizePdfFileName(fileName);

  // 1. Mobile & Tablet: Native OS Share Sheet
  if (isMobileDevice()) {
    const file = new File([pdfBlob], safeName, { type: 'application/pdf' });
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: safeName,
        });
        return;
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    onNotify?.('THIẾT BỊ KHÔNG HỖ TRỢ CHIA SẺ TRỰC TIẾP // HÃY DÙNG NÚT TẢI VỀ');
    return;
  }

  // 2. Windows / Desktop PC: Copy real .PDF file into Windows CF_HDROP Clipboard + Open Zalo PC
  let copiedPdfFile = false;
  try {
    const res = await fetch('/__smartscan/clipboard-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-File-Name': encodeURIComponent(safeName),
      },
      body: pdfBlob,
    });
    if (res.ok) {
      const json = (await res.json()) as { ok?: boolean };
      copiedPdfFile = Boolean(json?.ok);
    }
  } catch {
    copiedPdfFile = false;
  }

  // Trigger native browser "Mở Zalo" prompt / launch Zalo PC directly
  launchZaloPc();

  if (copiedPdfFile) {
    onNotify?.('ĐÃ COPY FILE .PDF VÀO CLIPBOARD // MỞ ZALO BẤM CTRL + V ĐỂ DÁN FILE');
  } else {
    onNotify?.('ĐÃ GỌI MỞ ZALO PC // TRÊN HOST TĨNH HÃY TẢI VỀ ĐỂ ĐÍNH KÈM FILE .PDF');
  }
}
