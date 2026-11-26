export type Language = 'vi' | 'en';

export interface TranslationDictionary {
  // Brand & Header
  brandName: string;
  engineReady: string;
  warpingWasm: string;
  exportPdf: string;
  exporting: string;
  docTitleDefault: string;
  docTitleAria: string;
  themeToggleTooltip: string;
  langToggleTooltip: string;
  historyTooltip: string;

  // Vault / Empty State
  noDocsIndexed: string;
  dropImagesHint: string;
  openViewfinder: string;
  importFiles: string;
  processingBuffers: string;

  // Filmstrip & Left Rail
  pagesRailTitle: string;
  addPageTooltip: string;
  pageNumber: string;
  deletePageTooltip: string;
  recropPageTooltip: string;
  rotatePageTooltip: string;

  // Main Canvas
  initializingWarp: string;
  selectPagePrompt: string;
  prevPage: string;
  nextPage: string;
  zoomOut: string;
  zoomIn: string;
  resetZoom: string;

  // Inspector Rail
  scanFilterLabel: string;
  filterOriginal: string;
  filterMagic: string;
  filterMagicPro: string;
  filterBw: string;
  applyToAllPages: string;
  movePageLeft: string;
  movePageRight: string;
  editDocument: string;
  updateAndSave: string;
  fineTuningLabel: string;
  resetSlidersButton: string;
  contrastLabel: string;
  brightnessLabel: string;
  geometryOpsLabel: string;
  reCropButton: string;
  rotate90Button: string;
  outputPageSpecLabel: string;
  saveCurrentPageJpg: string;
  compare: string;
  comparingOriginal: string;
  doneButton: string;
  mobileAddPage: string;
  mobileRotate: string;
  mobileCrop: string;
  mobileFineTune: string;
  mobileExport: string;

  // Keyboard Shortcuts Footer
  shortcutCapture: string;
  shortcutRotate: string;
  shortcutFilters: string;
  shortcutExport: string;

  // Live Viewfinder
  viewfinderTitle: string;
  viewfinderSubtitle: string;
  alignPaperHint: string;
  autoDetectActive: string;
  captureButton: string;
  torchTooltip: string;
  switchCameraTooltip: string;
  closeTooltip: string;
  cameraInitFailed: string;

  // Quad Editor
  editorTitle: string;
  editorSubtitle: string;
  resetCornersButton: string;
  confirmCropButton: string;
  cancelButton: string;

  // CamScanner Home UI
  searchPlaceholder: string;
  tabHome: string;
  tabScan: string;
  tabTools: string;
  toolScan: string;
  toolPdf: string;
  toolImportImg: string;
  toolImportFile: string;
  toolIdCard: string;
  toolOcr: string;
  toolOcrText: string;
  toolAiSolver: string;
  toolAll: string;
  recentTitle: string;
  seeAll: string;
  shareButton: string;
  downloadButton: string;
  toWordButton: string;
  toPdfButton: string;
  viewButton: string;
  deleteButton: string;
  pagesCount: string;
  noRecentDocs: string;
  noRecentDocsDesc: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  vi: {
    // Brand & Header
    brandName: 'SmartScan',
    engineReady: 'ĐỘNG CƠ SẴN SÀNG',
    warpingWasm: 'ĐANG NẮN ẢNH (WASM)',
    exportPdf: 'XUẤT PDF',
    exporting: 'ĐANG XUẤT...',
    docTitleDefault: 'SMARTSCAN_DOC',
    docTitleAria: 'Tên tài liệu',
    themeToggleTooltip: 'Chuyển đổi giao diện Sáng / Tối',
    langToggleTooltip: 'Chuyển đổi ngôn ngữ Tiếng Việt / English',
    historyTooltip: 'Lịch sử tài liệu đã lưu',

    // Vault / Empty State
    noDocsIndexed: 'CHƯA CÓ TRANG QUÉT NÀO',
    dropImagesHint: 'KÉO THẢ ẢNH VÀO ĐÂY HOẶC MỞ MÁY ẢNH',
    openViewfinder: 'Quét tài liệu',
    importFiles: 'Nhập ảnh',
    processingBuffers: 'ĐANG XỬ LÝ ẢNH...',

    // Filmstrip & Left Rail
    pagesRailTitle: 'DANH SÁCH TRANG',
    addPageTooltip: 'Thêm trang mới',
    pageNumber: 'TRANG',
    deletePageTooltip: 'Xóa trang này',
    recropPageTooltip: 'Cắt lại 4 góc',
    rotatePageTooltip: 'Xoay 90 độ',

    // Main Canvas
    initializingWarp: 'ĐANG NẮN PHẲNG GIẤY (WASM)...',
    selectPagePrompt: 'CHỌN MỘT TRANG ĐỂ XEM VÀ CHỈNH SỬA',
    prevPage: 'Trang trước',
    nextPage: 'Trang sau',
    zoomOut: 'Thu nhỏ',
    zoomIn: 'Phóng to',
    resetZoom: 'Thu phóng 100%',

    // Inspector Rail
    scanFilterLabel: 'BỘ LỌC TÀI LIỆU',
    filterOriginal: 'GỐC',
    filterMagic: 'MÀU THẦN KỲ',
    filterMagicPro: 'THẦN KỲ PRO',
    filterBw: 'TRẮNG ĐEN',
    applyToAllPages: 'ÁP DỤNG TẤT CẢ',
    movePageLeft: 'Di chuyển sang trái',
    movePageRight: 'Di chuyển sang phải',
    editDocument: 'Chỉnh sửa',
    updateAndSave: 'LƯU CẬP NHẬT',
    fineTuningLabel: 'TINH CHỈNH HÌNH ẢNH',
    resetSlidersButton: 'ĐẶT LẠI',
    contrastLabel: 'ĐỘ TƯƠNG PHẢN',
    brightnessLabel: 'ĐỘ SÁNG',
    geometryOpsLabel: 'THAO TÁC HÌNH HỌC',
    reCropButton: 'CẮT LẠI GÓC',
    rotate90Button: 'XOAY 90°',
    outputPageSpecLabel: 'KHỔ GIẤY XUẤT',
    saveCurrentPageJpg: 'LƯU TRANG NÀY (.JPG)',
    compare: 'So sánh',
    comparingOriginal: 'ĐANG SO SÁNH: ẢNH GỐC',
    doneButton: 'Xong',
    mobileAddPage: 'Thêm trang',
    mobileRotate: 'Xoay',
    mobileCrop: 'Cắt góc',
    mobileFineTune: 'Tinh chỉnh',
    mobileExport: 'XUẤT',

    // Keyboard Shortcuts Footer
    shortcutCapture: '[SPACE] CHỤP',
    shortcutRotate: '[R] XOAY 90°',
    shortcutFilters: '[1-3] ĐỔI BỘ LỌC',
    shortcutExport: '[CTRL+S] XUẤT TÀI LIỆU',

    // Live Viewfinder
    viewfinderTitle: 'MÁY ẢNH QUÉT TÀI LIỆU',
    viewfinderSubtitle: 'TỰ ĐỘNG BẮT 4 GÓC GIẤY TRÊN MẶT BÀN',
    alignPaperHint: 'ĐẶT TÀI LIỆU TRÊN NỀN TƯƠNG PHẢN ĐỂ TỰ ĐỘNG BẮT GÓC',
    autoDetectActive: 'TỰ ĐỘNG NHẬN DIỆN KHUNG GIẤY',
    captureButton: 'CHỤP TÀI LIỆU',
    torchTooltip: 'Bật/tắt đèn Flash',
    switchCameraTooltip: 'Đổi máy ảnh',
    closeTooltip: 'Đóng máy ảnh',
    cameraInitFailed: 'Không thể khởi động máy ảnh. Vui lòng cấp quyền truy cập camera.',

    // Quad Editor
    editorTitle: 'CHỈNH 4 GÓC',
    editorSubtitle: 'KÉO CÁC ĐIỂM GÓC ĐỂ ĐỊNH VỊ CHÍNH XÁC MÉP TÀI LIỆU',
    resetCornersButton: 'Tự động',
    confirmCropButton: 'CẮT',
    cancelButton: 'HỦY',

    // CamScanner Home UI
    searchPlaceholder: 'Tìm kiếm',
    tabHome: 'Trang chủ',
    tabScan: 'Quét tài liệu',
    tabTools: 'Công cụ',
    toolScan: 'Quét',
    toolPdf: 'Công cụ PDF',
    toolImportImg: 'Nhập ảnh',
    toolImportFile: 'Nhập tệp',
    toolIdCard: 'Thẻ ID',
    toolOcr: 'Trích xuất',
    toolOcrText: 'Trích xuất văn bản',
    toolAiSolver: 'AI Solver',
    toolAll: 'Tất cả',
    recentTitle: 'Gần đây',
    seeAll: 'Xem tất cả >',
    shareButton: 'Chia sẻ',
    downloadButton: 'Tải về',
    toWordButton: 'Thành Word',
    toPdfButton: 'Thành PDF',
    viewButton: 'Xem',
    deleteButton: 'Xóa',
    pagesCount: 'trang',
    noRecentDocs: 'Chưa có tài liệu nào gần đây',
    noRecentDocsDesc: 'Bấm nút máy ảnh hoặc chọn tệp để bắt đầu quét!',
  },
  en: {
    // Brand & Header
    brandName: 'SmartScan',
    engineReady: 'ENGINE_READY',
    warpingWasm: 'WARPING_WASM',
    exportPdf: 'EXPORT_PDF',
    exporting: 'EXPORTING...',
    docTitleDefault: 'SMARTSCAN_DOC',
    docTitleAria: 'Document Title',
    themeToggleTooltip: 'Toggle Light / Dark mode',
    langToggleTooltip: 'Switch language English / Vietnamese',
    historyTooltip: 'Exported Files History',

    // Vault / Empty State
    noDocsIndexed: 'NO_DOCUMENTS_INDEXED',
    dropImagesHint: 'DROP IMAGES HERE OR ACTIVATE VIEWFINDER',
    openViewfinder: 'Scan Document',
    importFiles: 'Import Image',
    processingBuffers: 'PROCESSING_BUFFERS...',

    // Filmstrip & Left Rail
    pagesRailTitle: 'PAGES',
    addPageTooltip: 'Add new page',
    pageNumber: 'PAGE',
    deletePageTooltip: 'Delete page',
    recropPageTooltip: 'Re-crop 4 corners',
    rotatePageTooltip: 'Rotate 90 degrees',

    // Main Canvas
    initializingWarp: 'INITIALIZING_WARP...',
    selectPagePrompt: 'SELECT_A_PAGE_TO_VIEW',
    prevPage: 'Previous Page',
    nextPage: 'Next Page',
    zoomOut: 'Zoom Out',
    zoomIn: 'Zoom In',
    resetZoom: 'Reset Zoom (100%)',

    // Inspector Rail
    scanFilterLabel: 'SCAN_FILTER',
    filterOriginal: 'ORIGINAL',
    filterMagic: 'MAGIC',
    filterMagicPro: 'MAGIC PRO',
    filterBw: 'B&W',
    applyToAllPages: 'APPLY TO ALL',
    movePageLeft: 'Move Left',
    movePageRight: 'Move Right',
    editDocument: 'Edit Document',
    updateAndSave: 'UPDATE & SAVE',
    fineTuningLabel: 'FINE_TUNING',
    resetSlidersButton: 'RESET',
    contrastLabel: 'CONTRAST',
    brightnessLabel: 'BRIGHTNESS',
    geometryOpsLabel: 'GEOMETRY_OPS',
    reCropButton: 'RE_CROP',
    rotate90Button: 'ROTATE_90°',
    outputPageSpecLabel: 'OUTPUT_PAGE_SPEC',
    saveCurrentPageJpg: 'SAVE_CURRENT_PAGE (.JPG)',
    compare: 'Compare',
    comparingOriginal: 'COMPARING: ORIGINAL',
    doneButton: 'Done',
    mobileAddPage: 'Add Page',
    mobileRotate: 'Rotate',
    mobileCrop: 'Crop',
    mobileFineTune: 'Adjust',
    mobileExport: 'EXPORT',

    // Keyboard Shortcuts Footer
    shortcutCapture: '[SPACE] CAPTURE',
    shortcutRotate: '[R] ROTATE 90°',
    shortcutFilters: '[1-3] FILTERS',
    shortcutExport: '[CTRL+S] EXPORT',

    // Live Viewfinder
    viewfinderTitle: 'CAMERA VIEWFINDER',
    viewfinderSubtitle: 'REAL-TIME 4-CORNER PAPER DETECTION',
    alignPaperHint: 'ALIGN PAPER EDGES INSIDE FRAME ON CONTRASTING BACKGROUND',
    autoDetectActive: 'AUTO_DETECT_ACTIVE',
    captureButton: 'CAPTURE_DOCUMENT',
    torchTooltip: 'Toggle Flash Torch',
    switchCameraTooltip: 'Switch Camera',
    closeTooltip: 'Close Viewfinder',
    cameraInitFailed: 'Failed to access camera. Please allow camera permissions.',

    // Quad Editor
    editorTitle: '4-CORNER CROP',
    editorSubtitle: 'DRAG HANDLES TO REFINE PAPER QUAD WITH LOUPE',
    resetCornersButton: 'Auto',
    confirmCropButton: 'CROP',
    cancelButton: 'CANCEL',

    // CamScanner Home UI
    searchPlaceholder: 'Search',
    tabHome: 'Home',
    tabScan: 'Scan Document',
    tabTools: 'Tools',
    toolScan: 'Scan',
    toolPdf: 'PDF Tools',
    toolImportImg: 'Import Img',
    toolImportFile: 'Import File',
    toolIdCard: 'ID Card',
    toolOcr: 'Extract',
    toolOcrText: 'Extract Text',
    toolAiSolver: 'AI Solver',
    toolAll: 'All Tools',
    recentTitle: 'Recent',
    seeAll: 'See all >',
    shareButton: 'Share',
    downloadButton: 'Download',
    toWordButton: 'To Word',
    toPdfButton: 'To PDF',
    viewButton: 'View',
    deleteButton: 'Delete',
    pagesCount: 'pages',
    noRecentDocs: 'No recent documents',
    noRecentDocsDesc: 'Tap camera button or import file to start scanning!',
  },
};
