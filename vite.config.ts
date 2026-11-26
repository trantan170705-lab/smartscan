import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Local Windows System Clipboard File-Drop (CF_HDROP) bridge for instant Ctrl+V PDF pasting in Zalo PC.
 * Writes temporary .pdf to %TEMP%\smartscan-share (never touches Downloads) and registers FileDropList.
 */
function windowsPdfClipboardPlugin(): Plugin {
  const handleClipboardPdf = (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    if (req.url !== '/__smartscan/clipboard-pdf' || req.method !== 'POST') {
      next();
      return;
    }

    if (process.platform !== 'win32') {
      res.statusCode = 501;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'WIN32_ONLY' }));
      return;
    }

    const rawHeader = String(req.headers['x-file-name'] || 'SmartScan_Document.pdf');
    let decodedName = 'SmartScan_Document.pdf';
    try {
      decodedName = decodeURIComponent(rawHeader);
    } catch {
      decodedName = rawHeader;
    }

    // Strict filename sanitization & path-traversal prevention
    const baseClean = path
      .basename(decodedName)
      .trim()
      .replace(/[:\\/*?"<>|\r\n\0]+/g, '_');
    const safeFileName = /\.pdf$/i.test(baseClean)
      ? baseClean
      : `${baseClean || 'SmartScan_Document'}.pdf`;

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB safety cap

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= MAX_BYTES) {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      if (totalBytes === 0 || totalBytes > MAX_BYTES) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'INVALID_PAYLOAD_SIZE' }));
        return;
      }

      try {
        const shareDir = path.join(os.tmpdir(), 'smartscan-share');
        fs.mkdirSync(shareDir, { recursive: true });

        // Opportunistically clean up temp files older than 2 hours
        const now = Date.now();
        for (const entry of fs.readdirSync(shareDir)) {
          if (entry.toLowerCase().endsWith('.pdf')) {
            const p = path.join(shareDir, entry);
            try {
              const st = fs.statSync(p);
              if (now - st.mtimeMs > 2 * 60 * 60 * 1000) {
                fs.unlinkSync(p);
              }
            } catch {
              // Ignore locked/in-use files
            }
          }
        }

        const tempFilePath = path.join(shareDir, safeFileName);
        fs.writeFileSync(tempFilePath, Buffer.concat(chunks));

        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Sta',
            '-Command',
            "Set-Clipboard -LiteralPath ([System.Environment]::GetEnvironmentVariable('SMARTSCAN_PDF_PATH'))",
          ],
          {
            env: { ...process.env, SMARTSCAN_PDF_PATH: tempFilePath },
            windowsHide: true,
          },
          (err) => {
            if (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'CLIPBOARD_EXEC_FAILED' }));
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, fileName: safeFileName }));
          }
        );
      } catch {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'TEMP_WRITE_FAILED' }));
      }
    });
  };

  return {
    name: 'smartscan-windows-pdf-clipboard',
    configureServer(server) {
      server.middlewares.use(handleClipboardPdf);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleClipboardPdf);
    },
  };
}

export default defineConfig({
  plugins: [
    windowsPdfClipboardPlugin(),
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
        'app-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: 'SmartScan - Máy Quét Tài Liệu Thông Minh',
        short_name: 'SmartScan',
        description: 'Máy quét tài liệu chuẩn xác cao, bảo mật Client-side bằng Rust WebAssembly',
        theme_color: '#08080A',
        background_color: '#08080A',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    https: {},
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['wasm-scanner'],
  },
});
