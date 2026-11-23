import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  saveVaultPage,
  getAllVaultPages,
  updateVaultPage,
  deleteVaultPage,
  clearVault,
  VaultPage,
} from './db/vault';
import { saveExportHistory, type ExportHistoryItem } from './db/exportHistory';
import {
  buildDocumentFileName,
  updateDocumentDate,
  detectDocumentTitleFromCanvas,
} from './utils/documentTitleDetector';
import { useScannerWorker } from './hooks/useScannerWorker';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { DocumentVault } from './components/vault/DocumentVault';
import { LiveViewfinder } from './components/camera/LiveViewfinder';
import { QuadEditor } from './components/editor/QuadEditor';
import { AdaptiveStudio } from './components/studio/AdaptiveStudio';
import { ExportHistoryModal } from './components/common/ExportHistoryModal';
import { TextExtractionModal } from './components/common/TextExtractionModal';
import { PwaInstallBanner } from './components/common/PwaInstallBanner';

export const App: React.FC = () => {
  const [pages, setPages] = useState<VaultPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'vault' | 'camera' | 'studio' | 'editor'>('vault');
  const [recropPageId, setRecropPageId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [docTitle, setDocTitle] = useState<string>(() =>
    buildDocumentFileName('Tài liệu scan')
  );
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);

  // OCR Text Extraction Modal State
  const [isOcrModalOpen, setIsOcrModalOpen] = useState<boolean>(false);
  const [ocrTargetPage, setOcrTargetPage] = useState<VaultPage | null>(null);
  const [isAutoOcrOnCapture, setIsAutoOcrOnCapture] = useState<boolean>(false);

  const { detectQuad, warpPerspective, applyFilter, encodeJpeg, generatePdf, wasmReady } =
    useScannerWorker();

  // Reset workspace on initial mount so F5 never retains old image traces
  useEffect(() => {
    (async () => {
      await clearVault();
      setPages([]);
      setActivePageIndex(0);
      setViewMode('vault');
    })();
  }, []);

  // Downscale image file <= 1800px (iOS Safari Memory Hygiene)
  const processImageFile = useCallback(
    async (file: File): Promise<{
      blob: Blob;
      width: number;
      height: number;
      rgba: Uint8Array;
      quad: [number, number, number, number, number, number, number, number];
    }> => {
      const img = new Image();
      const objUrl = URL.createObjectURL(file);
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = objUrl;
      });
      URL.revokeObjectURL(objUrl);

      const maxEdge = 1800;
      let targetW = img.naturalWidth;
      let targetH = img.naturalHeight;

      if (Math.max(targetW, targetH) > maxEdge) {
        if (targetW >= targetH) {
          targetW = maxEdge;
          targetH = Math.round((img.naturalHeight / img.naturalWidth) * maxEdge);
        } else {
          targetH = maxEdge;
          targetW = Math.round((img.naturalWidth / img.naturalHeight) * maxEdge);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas 2D context failed');

      ctx.drawImage(img, 0, 0, targetW, targetH);
      const imgData = ctx.getImageData(0, 0, targetW, targetH);
      const rgba = new Uint8Array(imgData.data.buffer);

      // Detect document title if first page
      if (pages.length === 0 && !editingHistoryId) {
        detectDocumentTitleFromCanvas(canvas).then((info) => {
          setDocTitle(info.formattedFileName);
        });
      }

      // Auto-detect quad using WASM
      let finalQuad: [number, number, number, number, number, number, number, number];
      try {
        const det = await detectQuad(rgba, targetW, targetH);
        if (det.quad && det.quad.length === 8) {
          const q = det.quad;
          // Calculate polygon area using Shoelace formula
          const area = 0.5 * Math.abs(
            (q[0] * q[3] - q[1] * q[2]) +
            (q[2] * q[5] - q[3] * q[4]) +
            (q[4] * q[7] - q[5] * q[6]) +
            (q[6] * q[1] - q[7] * q[0])
          );
          const frameArea = targetW * targetH;
          // If detected quad covers > 94% of the image, the image is already a full document scan
          // Keep full frame [0,0,W,0,W,H,0,H] so we never crop into headers/footers
          if (area / frameArea > 0.94) {
            finalQuad = [0, 0, targetW, 0, targetW, targetH, 0, targetH];
          } else {
            finalQuad = q as [number, number, number, number, number, number, number, number];
          }
        } else {
          // If no smaller paper detected, keep full image frame (never crop into document text!)
          finalQuad = [0, 0, targetW, 0, targetW, targetH, 0, targetH];
        }
      } catch {
        finalQuad = [0, 0, targetW, 0, targetW, targetH, 0, targetH];
      }

      const blob: Blob = await new Promise((resolve) => {
        canvas.toBlob(
          (b) => {
            canvas.width = 0;
            canvas.height = 0;
            resolve(b || file);
          },
          'image/jpeg',
          0.92
        );
      });

      return { blob, width: targetW, height: targetH, rgba, quad: finalQuad };
    },
    [detectQuad]
  );

  // Batch import files (Drag & Drop or File picker)
  const handleImportFiles = useCallback(
    async (files: FileList | File[]) => {
      setIsProcessingFiles(true);
      try {
        const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
        const newPages: VaultPage[] = [];

        for (let i = 0; i < fileArr.length; i++) {
          const processed = await processImageFile(fileArr[i]);
          const newPage: VaultPage = {
            id: 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            docId: 'doc_primary',
            pageNumber: pages.length + i + 1,
            createdAt: Date.now(),
            originalBlob: processed.blob,
            quad: processed.quad,
            rotation: 0,
            filterMode: 1, // Default: Magic Color
            contrast: 1.0,
            brightness: 0.0,
            processedThumbnailBlob: processed.blob,
            originalWidth: processed.width,
            originalHeight: processed.height,
          };
          await saveVaultPage(newPage);
          newPages.push(newPage);
        }

        let targetIdx = 0;
        setPages((prev) => {
          const next = [...prev, ...newPages];
          targetIdx = next.length - 1;
          return next;
        });
        setActivePageIndex(targetIdx);
        setViewMode('studio');

        if (isAutoOcrOnCapture && newPages.length > 0) {
          setIsAutoOcrOnCapture(false);
          setOcrTargetPage(newPages[0]);
          setIsOcrModalOpen(true);
        }
      } catch (err) {
        console.error('File import failed:', err);
      } finally {
        setIsProcessingFiles(false);
      }
    },
    [pages.length, processImageFile]
  );

  // Handle camera snapshot capture
  const handleCameraCapture = useCallback(
    async (captured: {
      blob: Blob;
      width: number;
      height: number;
      quad: [number, number, number, number, number, number, number, number];
    }) => {
      const newPage: VaultPage = {
        id: 'page_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        docId: 'doc_primary',
        pageNumber: pages.length + 1,
        createdAt: Date.now(),
        originalBlob: captured.blob,
        quad: captured.quad,
        rotation: 0,
        filterMode: 1, // Magic Color
        contrast: 1.0,
        brightness: 0.0,
        processedThumbnailBlob: captured.blob,
        originalWidth: captured.width,
        originalHeight: captured.height,
      };

      await saveVaultPage(newPage);
      let targetIdx = 0;
      setPages((prev) => {
        const next = [...prev, newPage];
        targetIdx = next.length - 1;
        return next;
      });
      setActivePageIndex(targetIdx);
      setViewMode('studio');

      if (isAutoOcrOnCapture) {
        setIsAutoOcrOnCapture(false);
        setOcrTargetPage(newPage);
        setIsOcrModalOpen(true);
      }
    },
    [pages.length, isAutoOcrOnCapture]
  );

  // Non-destructive page updates
  const handleUpdatePage = useCallback(
    async (id: string, updates: Partial<VaultPage>) => {
      await updateVaultPage(id, updates);
      setPages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    []
  );

  // Open OCR Text Extraction Modal
  const handleOpenOcrModal = useCallback(
    (page?: VaultPage) => {
      const target = page || pages[activePageIndex] || pages[0] || null;
      if (target) {
        setOcrTargetPage(target);
        setIsOcrModalOpen(true);
      }
    },
    [pages, activePageIndex]
  );

  // Trigger Extract Text from Vault
  const handleTriggerExtractText = useCallback(
    (source: 'camera' | 'import' | 'existing') => {
      if (source === 'existing') {
        handleOpenOcrModal();
      } else if (source === 'camera') {
        setIsAutoOcrOnCapture(true);
        setViewMode('camera');
      } else if (source === 'import') {
        setIsAutoOcrOnCapture(true);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (e) => {
          const files = (e.target as HTMLInputElement).files;
          if (files && files.length > 0) {
            handleImportFiles(files);
          }
        };
        input.click();
      }
    },
    [handleOpenOcrModal, handleImportFiles]
  );

  // Save extracted OCR text to VaultPage
  const handleSavePageExtractedText = useCallback(
    async (newText: string) => {
      if (ocrTargetPage) {
        await handleUpdatePage(ocrTargetPage.id, { extractedText: newText });
      }
    },
    [ocrTargetPage, handleUpdatePage]
  );

  // Delete page
  const handleDeletePage = useCallback(
    async (id: string) => {
      await deleteVaultPage(id);
      setPages((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (next.length === 0) {
          setViewMode('vault');
        } else {
          setActivePageIndex((currentIdx) => Math.min(currentIdx, next.length - 1));
        }
        return next;
      });
    },
    []
  );

  // Open Re-crop editor
  const handleOpenRecrop = useCallback((pageId: string) => {
    setRecropPageId(pageId);
    setViewMode('editor');
  }, []);

  // Confirm Re-crop
  const handleConfirmRecrop = useCallback(
    async (finalQuad: [number, number, number, number, number, number, number, number]) => {
      if (recropPageId) {
        const targetPage = pages.find((p) => p.id === recropPageId);
        await handleUpdatePage(recropPageId, {
          quad: finalQuad,
          processedThumbnailBlob: targetPage?.originalBlob,
        });
        setRecropPageId(null);
        setViewMode('studio');
      }
    },
    [recropPageId, pages, handleUpdatePage]
  );

  // Move / Reorder pages
  const handleMovePage = useCallback((fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((p, idx) => ({ ...p, pageNumber: idx + 1 }));
    });
    setActivePageIndex(toIndex);
  }, []);

  // Batch apply filter & fine tunings to all pages
  const handleApplyFilterToAll = useCallback(
    async (filterMode: 0 | 1 | 2 | 3, contrast: number, brightness: number) => {
      for (const p of pages) {
        await updateVaultPage(p.id, { filterMode, contrast, brightness });
      }
      setPages((prev) =>
        prev.map((p) => ({ ...p, filterMode, contrast, brightness }))
      );
    },
    [pages]
  );

  // Edit document loaded from History
  const handleEditHistoryItem = useCallback((item: ExportHistoryItem) => {
    if (item.pages && item.pages.length > 0) {
      setPages(item.pages);
      setActivePageIndex(0);
      setEditingHistoryId(item.id);
      const baseTitle = item.fileName.replace(/\.pdf$/i, '');
      const updatedTitle = updateDocumentDate(baseTitle);
      setDocTitle(updatedTitle);
      setViewMode('studio');
    }
  }, []);

  // Multi-Page PDF Export using pure Rust WASM + Web Share API
  const handleExportPdf = useCallback(
    async (pageSize: string) => {
      if (pages.length === 0 || isExporting) return;
      setIsExporting(true);

      try {
        const jpegBuffers: Uint8Array[] = [];
        const updatedPages: VaultPage[] = [];

        for (const page of pages) {
          // Decode originalBlob
          const img = new Image();
          const objUrl = URL.createObjectURL(page.originalBlob);
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
          if (!ctx) continue;

          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const rawRgba = new Uint8Array(imgData.data.buffer);
          canvas.width = 0;
          canvas.height = 0;

          // Warp perspective
          const warped = await warpPerspective(
            rawRgba,
            imgData.width,
            imgData.height,
            page.quad
          );

          // Apply filter
          const filtered = await applyFilter(
            warped.data,
            warped.width,
            warped.height,
            page.filterMode,
            page.contrast,
            page.brightness
          );

          // Handle 90° rotation if present
          let finalRgba = filtered.data;
          let finalW = warped.width;
          let finalH = warped.height;

          if (page.rotation !== 0) {
            const rotCanvas = document.createElement('canvas');
            if (page.rotation === 90 || page.rotation === 270) {
              rotCanvas.width = warped.height;
              rotCanvas.height = warped.width;
            } else {
              rotCanvas.width = warped.width;
              rotCanvas.height = warped.height;
            }
            const rotCtx = rotCanvas.getContext('2d');
            if (rotCtx) {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = warped.width;
              tempCanvas.height = warped.height;
              const tempCtx = tempCanvas.getContext('2d');
              if (tempCtx) {
                tempCtx.putImageData(
                  new ImageData(new Uint8ClampedArray(filtered.data.buffer as ArrayBuffer), warped.width, warped.height),
                  0,
                  0
                );
                rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
                rotCtx.rotate((page.rotation * Math.PI) / 180);
                rotCtx.drawImage(tempCanvas, -warped.width / 2, -warped.height / 2);

                const rotData = rotCtx.getImageData(0, 0, rotCanvas.width, rotCanvas.height);
                finalRgba = new Uint8Array(rotData.data.buffer);
                finalW = rotCanvas.width;
                finalH = rotCanvas.height;
              }
              tempCanvas.width = 0;
              tempCanvas.height = 0;
            }
            rotCanvas.width = 0;
            rotCanvas.height = 0;
          }

          // Encode JPEG in pure Rust WASM
          const encoded = await encodeJpeg(finalRgba, finalW, finalH, 92);
          jpegBuffers.push(encoded.jpegData);

          // Cache the final processed JPEG blob on the page so editing immediately displays it without reloading
          const processedBlob = new Blob([encoded.jpegData.buffer as ArrayBuffer], { type: 'image/jpeg' });
          const updatedPage: VaultPage = {
            ...page,
            processedThumbnailBlob: processedBlob,
          };
          updatedPages.push(updatedPage);
          await updateVaultPage(page.id, { processedThumbnailBlob: processedBlob });
        }

        // Generate PDF using pure Rust WASM (automatically detects landscape vs portrait per page)
        const pdfRes = await generatePdf(jpegBuffers, pageSize);
        const pdfBlob = new Blob([pdfRes.pdfData.buffer as ArrayBuffer], { type: 'application/pdf' });
        
        // Clean dynamic document name: {Tên_Văn_Bản}_{DD-MM-YYYY}.pdf
        const cleanTitle = (docTitle.trim() || 'SmartScan_Doc').replace(/[\\/:*?"<>|]/g, '_');
        const fileName = `${cleanTitle}.pdf`;

        // 1. Save or update document record to persistent Export History (IndexedDB)
        const recordId = editingHistoryId || ('exp_' + Date.now());
        await saveExportHistory({
          id: recordId,
          fileName,
          timestamp: Date.now(),
          pageCount: pages.length,
          fileSizeBytes: pdfBlob.size,
          pdfBlob,
          pages: updatedPages, // Non-destructive pages with cached final processed previews
        });
        setEditingHistoryId(null);

        // 2. Return to Home screen (vault view) without auto-downloading,
        // so the user sees the saved file in "GẦN ĐÂY" and can review, edit, or share as desired.
        setPages([]);
        setDocTitle('');
        setViewMode('vault');
      } catch (err) {
        console.error('PDF export failed:', err);
      } finally {
        setIsExporting(false);
      }
    },
    [pages, isExporting, docTitle, editingHistoryId, warpPerspective, applyFilter, encodeJpeg, generatePdf]
  );

  // Single JPEG download
  const handleExportSingleJpeg = useCallback(
    async (page: VaultPage) => {
      try {
        const thumb = page.processedThumbnailBlob || page.originalBlob;
        const fileName = `PAGE_${page.pageNumber}_${Date.now()}.jpg`;

        if (
          navigator.canShare &&
          /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        ) {
          const file = new File([thumb], fileName, { type: 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName });
            return;
          }
        }

        const url = URL.createObjectURL(thumb);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Single JPEG export failed:', err);
      }
    },
    []
  );

  // Keyboard Shortcuts bindings (UI_UX_SPEC.md)
  useKeyboardShortcuts(
    {
      onSpace: () => {
        if (viewMode === 'camera') {
          // handled in camera
        } else if (viewMode === 'vault') {
          setViewMode('camera');
        }
      },
      onRotate: () => {
        const page = pages[activePageIndex];
        if (page && viewMode === 'studio') {
          const nextRot = ((page.rotation + 90) % 360) as 0 | 90 | 180 | 270;
          handleUpdatePage(page.id, { rotation: nextRot });
        }
      },
      onFilter1: () => {
        const page = pages[activePageIndex];
        if (page && viewMode === 'studio') {
          handleUpdatePage(page.id, { filterMode: 0 });
        }
      },
      onFilter2: () => {
        const page = pages[activePageIndex];
        if (page && viewMode === 'studio') {
          handleUpdatePage(page.id, { filterMode: 1 });
        }
      },
      onFilter3: () => {
        const page = pages[activePageIndex];
        if (page && viewMode === 'studio') {
          handleUpdatePage(page.id, { filterMode: 2 });
        }
      },
      onPrevPage: () => {
        if (viewMode === 'studio') {
          setActivePageIndex((prev) => Math.max(0, prev - 1));
        }
      },
      onNextPage: () => {
        if (viewMode === 'studio') {
          setActivePageIndex((prev) => Math.min(pages.length - 1, prev + 1));
        }
      },
      onExport: () => {
        if (viewMode === 'studio' && pages.length > 0) {
          handleExportPdf('A4');
        }
      },
      onEscape: () => {
        if (viewMode === 'camera') {
          setViewMode(pages.length > 0 ? 'studio' : 'vault');
        } else if (viewMode === 'editor') {
          setViewMode('studio');
        }
      },
    },
    true
  );

  const recropTargetPage = pages.find((p) => p.id === recropPageId);

  return (
    <div className="w-full h-full bg-[var(--bg-void)] text-[var(--text-primary)] overflow-hidden flex flex-col">
      {/* 0. Top Sticky PWA Install Header */}
      {viewMode !== 'camera' && viewMode !== 'editor' && <PwaInstallBanner />}

      <div className="flex-1 w-full h-full overflow-hidden relative">
        {/* 1. Camera Viewfinder View */}
        {viewMode === 'camera' && (
          <LiveViewfinder
            onCapture={handleCameraCapture}
            onImportFiles={handleImportFiles}
            onClose={() => setViewMode(pages.length > 0 ? 'studio' : 'vault')}
            pageCount={pages.length}
          />
        )}

        {/* 2. 4-Corner Crop Editor View */}
        {viewMode === 'editor' && recropTargetPage && (
          <QuadEditor
            imageBlob={recropTargetPage.originalBlob}
            initialQuad={recropTargetPage.quad}
            width={recropTargetPage.originalWidth}
            height={recropTargetPage.originalHeight}
            onConfirm={handleConfirmRecrop}
            onCancel={() => setViewMode('studio')}
          />
        )}

        {/* 3. Empty Vault / CamScanner Home View */}
        {viewMode === 'vault' && (
          <DocumentVault
            onOpenViewfinder={() => setViewMode('camera')}
            onImportFiles={handleImportFiles}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenStudio={() => setViewMode('studio')}
            onSelectPage={setActivePageIndex}
            onEditDocument={handleEditHistoryItem}
            onTriggerExtractText={handleTriggerExtractText}
            pages={pages}
            isProcessing={isProcessingFiles}
          />
        )}

        {/* 4. Adaptive Studio Workstation View */}
        {viewMode === 'studio' && (
          <AdaptiveStudio
            pages={pages}
            activePageIndex={activePageIndex}
            docTitle={docTitle}
            onUpdateDocTitle={setDocTitle}
            onSelectPage={setActivePageIndex}
            onUpdatePage={handleUpdatePage}
            onApplyFilterToAll={handleApplyFilterToAll}
            onMovePage={handleMovePage}
            onDeletePage={handleDeletePage}
            onRecropPage={handleOpenRecrop}
            onAddPage={() => setViewMode('camera')}
            onExportPdf={handleExportPdf}
            onExportSingleJpeg={handleExportSingleJpeg}
            onExtractText={handleOpenOcrModal}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onBackToHome={() => setViewMode('vault')}
            isExporting={isExporting}
          />
        )}

        {/* 5. Export History Modal */}
        <ExportHistoryModal
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
        />

        {/* 6. Precision OCR & Text Extraction Editor Modal */}
        <TextExtractionModal
          isOpen={isOcrModalOpen}
          onClose={() => setIsOcrModalOpen(false)}
          imageSource={ocrTargetPage ? (ocrTargetPage.processedThumbnailBlob || ocrTargetPage.originalBlob) : null}
          thumbnailBlob={ocrTargetPage ? (ocrTargetPage.processedThumbnailBlob || ocrTargetPage.originalBlob) : undefined}
          docTitle={docTitle}
          initialText={ocrTargetPage?.extractedText || ''}
          onSaveExtractedText={handleSavePageExtractedText}
        />
      </div>
    </div>
  );
};

export default App;
