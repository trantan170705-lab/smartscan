/**
 * SmartScan Document Title & OCR Header Detection Utility
 * Automatically identifies official Vietnamese document headers (Kế hoạch, Quyết định, Bằng tốt nghiệp, Giấy chứng nhận, etc.)
 * and constructs standardized dynamic filenames: {Tiêu_đề}_{DD-MM-YYYY}
 */

import { createWorker } from 'tesseract.js';

export interface DetectedDocumentInfo {
  detectedTitle: string;
  category: string;
  confidence: number;
  formattedFileName: string;
}

/**
 * Strips Vietnamese diacritics / accents for robust fuzzy keyword matching
 */
export function removeVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .trim();
}

/**
 * Format date as DD-MM-YYYY (e.g. 22-11-2026)
 */
export function formatCurrentDate(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Generates formatted file name: {Tiêu_đề}_{DD-MM-YYYY}
 */
export function buildDocumentFileName(title: string, date: Date = new Date()): string {
  const cleanTitle = title.trim().replace(/[\\/:*?"<>|]/g, '_');
  const dateStr = formatCurrentDate(date);
  return `${cleanTitle}_${dateStr}`;
}

/**
 * Updates the date component in an existing document title when re-saving or editing.
 * E.g. "Kế hoạch tổ chức các hoạt động Tháng Công nhân_20-11-2026" -> "Kế hoạch tổ chức các hoạt động Tháng Công nhân_22-11-2026"
 */
export function updateDocumentDate(existingTitle: string, newDate: Date = new Date()): string {
  const newDateStr = formatCurrentDate(newDate);
  const dateRegex = /_\d{2}-\d{2}-\d{4}$/;
  if (dateRegex.test(existingTitle)) {
    return existingTitle.replace(dateRegex, `_${newDateStr}`);
  }
  return `${existingTitle}_${newDateStr}`;
}

/**
 * Parses official Vietnamese document title from raw OCR text
 */
export function parseDocumentTitleFromText(text: string): { title: string; category: string } {
  if (!text || text.trim().length === 0) {
    return { title: 'Tài liệu scan', category: 'DOCUMENT' };
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const categories: Array<{
    normKw: string;
    prefix: string;
    category: string;
    exactTitle?: string;
  }> = [
    { normKw: 'BANG TOT NGHIEP', prefix: 'Bằng tốt nghiệp', category: 'DIPLOMA', exactTitle: 'Bằng tốt nghiệp trung học phổ thông' },
    { normKw: 'TOT NGHIEP TRUNG HOC', prefix: 'Bằng tốt nghiệp', category: 'DIPLOMA', exactTitle: 'Bằng tốt nghiệp trung học phổ thông' },
    { normKw: 'SO VAO SO CAP BANG', prefix: 'Bằng tốt nghiệp', category: 'DIPLOMA', exactTitle: 'Bằng tốt nghiệp trung học phổ thông' },
    { normKw: 'XEP LOAI TOT NGHIEP', prefix: 'Bằng tốt nghiệp', category: 'DIPLOMA', exactTitle: 'Bằng tốt nghiệp trung học phổ thông' },
    { normKw: 'DIPLOMA', prefix: 'Bằng tốt nghiệp', category: 'DIPLOMA', exactTitle: 'Bằng tốt nghiệp trung học phổ thông' },
    { normKw: 'GIAY CHUNG NHAN', prefix: 'Giấy chứng nhận', category: 'CERTIFICATE' },
    { normKw: 'GIAY CAM ON', prefix: 'Giấy cảm ơn', category: 'LETTER' },
    { normKw: 'KE HOACH', prefix: 'Kế hoạch', category: 'PLAN' },
    { normKw: 'QUYET DINH', prefix: 'Quyết định', category: 'DECISION' },
    { normKw: 'THONG BAO', prefix: 'Thông báo', category: 'NOTICE' },
    { normKw: 'BIEN BAN', prefix: 'Biên bản', category: 'MINUTES' },
    { normKw: 'HOP DONG', prefix: 'Hợp đồng', category: 'CONTRACT' },
    { normKw: 'BAO CAO', prefix: 'Báo cáo', category: 'REPORT' },
    { normKw: 'TO TRINH', prefix: 'Tờ trình', category: 'SUBMISSION' },
    { normKw: 'DON XIN', prefix: 'Đơn xin', category: 'APPLICATION' },
    { normKw: 'CAN CUOC CONG DAN', prefix: 'Căn cước công dân', category: 'ID_CARD', exactTitle: 'Căn cước công dân' },
    { normKw: 'CHUNG MINH NHAN DAN', prefix: 'Chứng minh nhân dân', category: 'ID_CARD', exactTitle: 'Chứng minh nhân dân' },
    { normKw: 'GIAY KHAI SINH', prefix: 'Giấy khai sinh', category: 'CERTIFICATE', exactTitle: 'Giấy khai sinh' },
    { normKw: 'HOA DON', prefix: 'Hóa đơn', category: 'INVOICE' },
    { normKw: 'CHUNG CHI', prefix: 'Chứng chỉ', category: 'CERTIFICATE' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const normLine = removeVietnameseAccents(lines[i]).toUpperCase();
    for (const cat of categories) {
      if (normLine.includes(cat.normKw)) {
        if (cat.exactTitle) {
          return { title: cat.exactTitle, category: cat.category };
        }

        // Look at next lines for specific document description
        const details: string[] = [];
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j];
          const normNext = removeVietnameseAccents(nextLine).toUpperCase();
          if (
            normNext.includes('CAN CU') ||
            normNext.includes('DIEU 1') ||
            normNext.includes('KINH GUI') ||
            normNext.startsWith('SO:') ||
            normNext.startsWith('NOI NHAN')
          ) {
            break;
          }
          const cleanLine = nextLine.replace(/[,;.\-\s]+$/, '').trim();
          if (cleanLine.length > 2) {
            details.push(cleanLine);
          }
        }

        if (details.length > 0) {
          let fullDetail = details.join(' ');
          if (fullDetail.length > 45) {
            const cut = fullDetail.slice(0, 45);
            fullDetail = cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
          }
          const detailStr = fullDetail.charAt(0).toLowerCase() + fullDetail.slice(1);
          return {
            title: `${cat.prefix} ${detailStr}`.trim(),
            category: cat.category,
          };
        }

        return { title: cat.prefix, category: cat.category };
      }
    }
  }

  return { title: 'Tài liệu scan', category: 'DOCUMENT' };
}

// Global cached Tesseract worker to avoid multiple re-initializations
let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker(['vie', 'eng'], undefined, {
        logger: () => {},
      });
      return worker;
    })();
  }
  return workerPromise;
}

function cropHeaderCanvas(src: HTMLCanvasElement, fraction: number = 0.55): HTMLCanvasElement {
  const hc = document.createElement('canvas');
  hc.width = src.width;
  hc.height = Math.max(1, Math.round(src.height * fraction));
  const hCtx = hc.getContext('2d');
  if (hCtx) {
    hCtx.drawImage(src, 0, 0, src.width, hc.height, 0, 0, src.width, hc.height);
  }
  return hc;
}

function rotateCanvasCW(src: HTMLCanvasElement, angle: 90 | 270): HTMLCanvasElement {
  const rc = document.createElement('canvas');
  rc.width = src.height;
  rc.height = src.width;
  const rCtx = rc.getContext('2d');
  if (rCtx) {
    rCtx.translate(rc.width / 2, rc.height / 2);
    rCtx.rotate((angle * Math.PI) / 180);
    rCtx.drawImage(src, -src.width / 2, -src.height / 2);
  }
  return rc;
}

async function runOcrWithTimeout(worker: any, cv: HTMLCanvasElement, timeoutMs: number): Promise<string> {
  const ocrPromise = worker.recognize(cv).then((ret: any) => ret.data.text || '');
  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('OCR Timeout')), timeoutMs)
  );
  return Promise.race([ocrPromise, timeoutPromise]);
}

/**
 * Intelligent Document Title Detector from canvas image.
 * Automatically handles multi-orientation scans (0°, 90°, 270°) and recognizes
 * official Vietnamese titles (Kế hoạch, Bằng tốt nghiệp, Quyết định, etc.).
 * Unrecognized documents strictly default to "Tài liệu scan_{DD-MM-YYYY}".
 */
export async function detectDocumentTitleFromCanvas(
  canvas: HTMLCanvasElement
): Promise<DetectedDocumentInfo> {
  const width = canvas.width;
  const height = canvas.height;
  if (width === 0 || height === 0) {
    const defaultTitle = 'Tài liệu scan';
    return {
      detectedTitle: defaultTitle,
      category: 'DOCUMENT',
      confidence: 0.5,
      formattedFileName: buildDocumentFileName(defaultTitle),
    };
  }

  try {
    const worker = await getWorker();

    // 1. Initial attempt: Header at current 0° orientation
    const header0 = cropHeaderCanvas(canvas, 0.55);
    let text0 = '';
    try {
      text0 = await runOcrWithTimeout(worker, header0, 3500);
    } catch {
      // ignore timeout
    }

    let parsed = parseDocumentTitleFromText(text0);
    if (parsed.category !== 'DOCUMENT') {
      return {
        detectedTitle: parsed.title,
        category: parsed.category,
        confidence: 0.95,
        formattedFileName: buildDocumentFileName(parsed.title),
      };
    }

    // 2. If unrecognized and document might be rotated (or sideways diploma):
    // Try 90° Clockwise rotation
    const rot90 = rotateCanvasCW(canvas, 90);
    const header90 = cropHeaderCanvas(rot90, 0.55);
    let text90 = '';
    try {
      text90 = await runOcrWithTimeout(worker, header90, 3000);
    } catch {
      // ignore timeout
    }

    let parsed90 = parseDocumentTitleFromText(text90);
    if (parsed90.category !== 'DOCUMENT') {
      return {
        detectedTitle: parsed90.title,
        category: parsed90.category,
        confidence: 0.95,
        formattedFileName: buildDocumentFileName(parsed90.title),
      };
    }

    // 3. Try 270° Clockwise rotation
    const rot270 = rotateCanvasCW(canvas, 270);
    const header270 = cropHeaderCanvas(rot270, 0.55);
    let text270 = '';
    try {
      text270 = await runOcrWithTimeout(worker, header270, 2500);
    } catch {
      // ignore timeout
    }

    let parsed270 = parseDocumentTitleFromText(text270);
    if (parsed270.category !== 'DOCUMENT') {
      return {
        detectedTitle: parsed270.title,
        category: parsed270.category,
        confidence: 0.95,
        formattedFileName: buildDocumentFileName(parsed270.title),
      };
    }

    // 4. Fallback: Color & Official Red Seal detection (e.g. for diplomas/certificates)
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let isDiplomaOrCert = false;
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      let redCount = 0;
      let yellowParchmentCount = 0;
      const totalPixels = width * height;
      const step = 24;

      for (let i = 0; i < data.length; i += step * 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > g + 35 && r > b + 35 && r > 115) {
          redCount++;
        }
        if (r > 190 && g > 170 && b < 170) {
          yellowParchmentCount++;
        }
      }

      const sampledCount = Math.floor(totalPixels / step);
      // Red seal (> 0.08% of image) and diploma parchment texture (> 10%)
      if (redCount > sampledCount * 0.0008 && yellowParchmentCount > sampledCount * 0.10) {
        isDiplomaOrCert = true;
      }
    }

    if (isDiplomaOrCert) {
      const diplomaTitle = 'Bằng tốt nghiệp trung học phổ thông';
      return {
        detectedTitle: diplomaTitle,
        category: 'DIPLOMA',
        confidence: 0.85,
        formattedFileName: buildDocumentFileName(diplomaTitle),
      };
    }

    // Default strictly to "Tài liệu scan_{DD-MM-YYYY}" as requested
    const defaultTitle = 'Tài liệu scan';
    return {
      detectedTitle: defaultTitle,
      category: 'DOCUMENT',
      confidence: 0.6,
      formattedFileName: buildDocumentFileName(defaultTitle),
    };
  } catch (err) {
    console.warn('OCR title detection fallback:', err);
    const defaultTitle = 'Tài liệu scan';
    return {
      detectedTitle: defaultTitle,
      category: 'DOCUMENT',
      confidence: 0.5,
      formattedFileName: buildDocumentFileName(defaultTitle),
    };
  }
}
