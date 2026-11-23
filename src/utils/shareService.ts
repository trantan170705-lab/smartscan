/**
 * Smart Cross-Platform Document Sharing
 * - On Mobile / Tablet: Uses native navigator.share() with files (opens iOS / Android share sheet with Zalo, Messenger, etc.)
 * - On Windows / Desktop:
 *     1. Copies PDF file to system clipboard (so user can press Ctrl+V directly in Zalo PC / chat to paste the PDF!)
 *     2. Downloads the PDF file so user has it immediately in Downloads / File Explorer
 *     3. Tries to invoke Zalo PC app protocol (zalo://)
 *     4. Shows clear guidance to paste or drag file into Zalo
 */
export async function sharePdfDocument(
  pdfBlob: Blob,
  fileName: string,
  onNotify: (msg: string) => void
): Promise<void> {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

  // 1. Mobile & Tablet: Native OS Share Sheet (includes mobile Zalo, Messenger, AirDrop, etc.)
  if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: fileName,
        text: `SmartScan: ${fileName}`,
      });
      return;
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      // Fallback below if user canceled or failed
    }
  }

  // 2. Windows / Desktop: Dedicated Zalo PC & Clipboard Flow
  let copiedToClipboard = false;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const item = new ClipboardItem({
        'application/pdf': pdfBlob,
      });
      await navigator.clipboard.write([item]);
      copiedToClipboard = true;
    }
  } catch {
    // If browser restricts application/pdf in clipboard, we'll notify user with the file download
    copiedToClipboard = false;
  }

  // Always trigger file download on Desktop so the user has the physical file ready in Downloads
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);

  // Try to wake up Zalo PC app via protocol
  try {
    const zaloIframe = document.createElement('iframe');
    zaloIframe.style.display = 'none';
    zaloIframe.src = 'zalo://';
    document.body.appendChild(zaloIframe);
    setTimeout(() => document.body.removeChild(zaloIframe), 2000);
  } catch {}

  if (copiedToClipboard) {
    onNotify('ĐÃ COPY FILE PDF VÀO CLIPBOARD // MỞ ZALO NHẤN CTRL + V ĐỂ GỬI');
  } else {
    onNotify('ĐÃ TẢI FILE VỀ MÁY & MỞ ZALO // KÉO TỆP HOẶC GỬI TRONG ZALO');
  }
}

