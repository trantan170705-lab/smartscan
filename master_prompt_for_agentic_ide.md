Hãy đóng vai Principal Systems Engineer (Rust/WASM) kiêm Senior Frontend Architect. Chúng ta sẽ xây dựng một WebApp Scan tài liệu chuyên nghiệp (tương tự CamScanner) chạy 100% client-side (không cần server xử lý ảnh), hoạt động mượt mà trên **Desktop, Tablet và Mobile (iOS Safari & Android Chrome)** dưới dạng PWA cài đặt được.

Thực hiện nghiêm ngặt theo **4 GIAI ĐOẠN** tuần tự dưới đây. Không nhảy bước.

================================================================================
GIAI ĐOẠN 1: THIẾT LẬP WORKFLOW & KỶ LUẬT CODE TỪ REPO ECC
================================================================================
1. Clone repository `https://github.com/affaan-m/ecc` (Everything Claude Code) vào thư mục tạm `.tmp-ecc`.
2. Phân tích cấu trúc `.tmp-ecc`, chỉ trích xuất các bộ **rules, coding style, TDD workflow, và code-review checklists** phù hợp cho **TypeScript + React + Rust** và cài đặt vào thư mục cấu hình chuẩn của Agent/IDE hiện tại (`.claude/rules/` hoặc `.cursor/rules/`). Xóa sạch `.tmp-ecc` sau khi hoàn tất.
3. Tạo thêm file rule chuyên biệt `rust-wasm-scanner.md` trong thư mục rules với các nguyên tắc bất di bất dịch:
   - **Pure Rust WASM:** Chỉ dùng crate biên dịch sạch sang `wasm32-unknown-unknown` (`image` với `default-features = false`, bật chỉ `jpeg`, `png`; `imageproc`; `lopdf`; `wasm-bindgen`; `console_error_panic_hook`). TUYỆT ĐỐI CẤM `opencv` hoặc bất kỳ crate nào cần C/C++ bindings.
   - **Zero-Copy Worker Architecture:** Toàn bộ lời gọi WASM phải nằm trong Web Worker, truyền `Uint8Array.buffer` bằng `Transferable` objects để không copy RAM và giữ UI 60fps.
   - **iOS Safari Memory Hygiene:** Mọi `<canvas>` tạm phải giải phóng (`width = 0; height = 0`) sau khi dùng; mọi `Blob URL` phải gọi `URL.revokeObjectURL`; ảnh đầu vào từ camera phải downscale cạnh dài tối đa `1800px` trước khi đẩy vào WASM.
   - **TDD First:** Mọi thuật toán lõi trong Rust phải có unit test với ảnh giả lập (synthetic test image) pass 100% (`cargo test`) trước khi nối vào React UI.

================================================================================
GIAI ĐOẠN 2: KIẾN TRÚC DỰ ÁN & CẤU TRÚC THƯ MỤC
================================================================================
Khởi tạo dự án theo cấu trúc sạch sẽ sau:

/
├── UI_UX_SPEC.md                 # Nguồn chân lý duy nhất cho giao diện (Strict Dual-Theme CSS Variables)
├── wasm-scanner/                 # Rust crate biên dịch ra WebAssembly
│   ├── Cargo.toml                # Tối ưu release: opt-level = "s", lto = true
│   └── src/
│       ├── lib.rs                # wasm-bindgen exports
│       ├── detector.rs           # Auto-crop 4 góc giấy (Canny + Contour + RDP)
│       ├── warp.rs               # Perspective transform
│       ├── filters.rs            # Original, Magic Color, B&W
│       └── pdf.rs                # Đóng gói PDF A4 bằng lopdf
├── src/
│   ├── workers/
│   │   └── scanner.worker.ts     # Dedicated Web Worker load WASM + typed RPC
│   ├── db/
│   │   └── vault.ts              # IndexedDB (idb) lưu trữ Non-Destructive
│   ├── hooks/
│   │   ├── useTheme.ts           # Hook quản lý Dark/Light mode toggle qua CSS variables
│   │   ├── useCamera.ts          # Quản lý getUserMedia, Torch, Fallback Webcam
│   │   ├── useScannerWorker.ts   # Giao tiếp Worker + hủy tác vụ cũ (Abort)
│   │   └── useKeyboardShortcuts.ts
│   ├── components/
│   │   ├── common/               # ThemeToggle, HairlineDivider, TelemetryPill
│   │   ├── vault/                # Document Vault & Drag-and-Drop Zone
│   │   ├── camera/               # Live Viewfinder + SVG Quad + Temporal Smoothing
│   │   ├── editor/               # 4-Corner Crop + Touch Magnifier Loupe
│   │   └── studio/               # Adaptive 3-Pane Desktop / Split Tablet / Mobile Dock
│   └── App.tsx
└── vite.config.ts                # vite-plugin-pwa + @vitejs/plugin-basic-ssl + wasm

================================================================================
GIAI ĐOẠN 3: THUẬT TOÁN XỬ LÝ ẢNH LÕI TRONG RUST (`/wasm-scanner`)
================================================================================
Cài đặt và viết unit test đầy đủ cho 4 module sau:

1. `detect_document_quad(rgba: &[u8], width: u32, height: u32) -> Option<Vec<f32>>` (trả về 8 số `[x0, y0, x1, y1, x2, y2, x3, y3]` theo đúng thứ tự `TL, TR, BR, BL`):
   - Downscale ảnh về chiều ngang ~320px (tính sẵn `scale_x`, `scale_y`).
   - Chuyển sang Grayscale -> chạy Morphological Closing (hoặc Median/Box blur mạnh) để xóa chữ viết và dòng kẻ trên giấy.
   - Chạy Gaussian Blur (`sigma ~ 1.4`) -> Canny Edge Detection (ngưỡng tự động hoặc Otsu-assisted).
   - Chạy `imageproc::contours::find_contours` -> lọc các contour có diện tích > 15% diện tích khung hình -> xấp xỉ đa giác bằng Ramer-Douglas-Peucker (`approx_poly_dp` thử epsilon từ `0.02` đến `0.05` chu vi).
   - Chọn đa giác lồi có đúng 4 đỉnh, các góc trong nằm trong khoảng `45°–135°`.
   - Sắp xếp 4 đỉnh chuẩn `[TL, TR, BR, BL]` và nhân lại tỉ lệ về tọa độ ảnh gốc.
   - *Viết unit test:* Tạo một ảnh canvas tối có 1 hình tứ giác trắng nghiêng ở giữa + nhiễu ngẫu nhiên, verify hàm trả về đúng 4 đỉnh với sai số < 5px.

2. `warp_perspective(rgba: &[u8], width: u32, height: u32, quad: &[f32]) -> JsValue` (trả về `{ data: Uint8Array, width, height }`)**:
   - Tính chiều rộng mục tiêu `out_w = max(dist(TL, TR), dist(BL, BR))` và chiều cao `out_h = max(dist(TL, BL), dist(TR, BR))`.
   - Dùng `imageproc::geometric_transformations::Projection::from_control_points` và `warp` (nội suy Bilinear) để kéo phẳng tờ giấy thành hình chữ nhật vuông vức.

3. `apply_scan_filter(rgba: &[u8], width: u32, height: u32, mode: u8, contrast: f32, brightness: f32) -> Vec<u8>`**:
   - `mode = 0` (**ORIGINAL**): Giữ màu gốc + Unsharp mask nhẹ làm rõ chữ + áp dụng tinh chỉnh `contrast`/`brightness`.
   - `mode = 1` (**MAGIC COLOR**): Thực hiện Illumination Normalization để xóa bóng tay/điện thoại: tính nền sáng bằng Box/Gaussian Blur bán kính lớn (trên ảnh downscale 1/4 rồi upscale lại để chạy cực nhanh trong < 50ms), sau đó chia từng kênh RGB: `out = clamp((src / max(bg, 1.0)) * 255.0)` kết hợp kéo giãn tương phản nhẹ để nền giấy trắng đều nhưng con dấu đỏ/chữ ký xanh vẫn giữ nguyên màu rực rỡ.
   - `mode = 2` (**B&W DOCUMENT**): Chuyển Grayscale -> `imageproc::contrast::adaptive_threshold` (khử bóng đổ cục bộ) -> tinh chỉnh để nền trắng tuyệt đối (`255`) và nét chữ đen sắc (`0`).

4. `generate_pdf(jpeg_pages: JsValue, page_size: &str) -> Vec<u8>`**:
   - Nhận mảng các byte ảnh JPEG đã nén từ Frontend/WASM, dùng `lopdf` nhúng trực tiếp luồng `DCTDecode` (không giải nén lại để tiết kiệm RAM và tốc độ) vào các trang PDF chuẩn A4 (`595.28 x 841.89 pt`), căn giữa và scale vừa khít giữ đúng tỉ lệ ảnh.

================================================================================
GIAI ĐOẠN 4: FRONTEND ADAPTIVE, NON-DESTRUCTIVE VAULT & ĐA THIẾT BỊ
================================================================================
1. **Tuân thủ tuyệt đối `UI_UX_SPEC.md`:** Đọc kỹ toàn bộ file `UI_UX_SPEC.md` trước khi viết bất kỳ component React nào. Dùng 100% CSS variables (`var(--bg-void)`, `var(--bg-panel)`, `var(--accent-laser)`) để nút chuyển Light/Dark mode hoạt động mượt mà. KHÔNG dùng gradient mềm hay bo góc AI slop.
2. **Lưu trữ Non-Destructive (IndexedDB qua `idb`):**
   - Mỗi trang tài liệu lưu: `originalBlob` (ảnh gốc đã resize <= 1800px), `quad: [number; 8]`, `rotation: 0|90|180|270`, `filterMode: 0|1|2`, `contrast`, `brightness`, và `processedThumbnailBlob`.
   - Nhờ vậy người dùng luôn có thể bấm "Chỉnh lại góc" hoặc đổi Filter bất cứ lúc nào mà không bị mất dữ liệu gốc.
3. **Live Camera & Temporal Smoothing (Mobile/Tablet/Webcam):**
   - Thẻ `<video playsinline autoplay muted>` yêu cầu `facingMode: { ideal: "environment" }`, độ phân giải ưu tiên cao nhất thiết bị hỗ trợ. Nếu chạy trên Desktop không có camera sau, tự động fallback sang Webcam hoặc màn hình Drag & Drop.
   - Chạy vòng lặp gửi khung hình thu nhỏ sang Web Worker mỗi `120ms–150ms` để tìm `quad`. Ở phía React, áp dụng **Linear Interpolation (lerp)** qua `requestAnimationFrame` để khung viền `var(--accent-laser)` bám theo mép giấy mượt mà, không bị giật nháy.
   - Hỗ trợ nút bật/tắt đèn Flash (Torch) nếu `track.getCapabilities().torch` tồn tại.
4. **Export & Share đa nền tảng:**
   - Mobile/Tablet: Ưu tiên gọi `navigator.share({ files: [pdfFile] })` (Web Share API) để mở thẳng menu chia sẻ gốc của iOS/Android (Lưu vào Tệp, gửi Zalo, AirDrop). Nếu trình duyệt không hỗ trợ, tự động fallback sang tải file trực tiếp.
   - Desktop: Tải trực tiếp file `.pdf` hoặc `.jpg` với tên file người dùng tùy chỉnh.
5. **Cấu hình Dev & PWA:**
   - Tích hợp `@vitejs/plugin-basic-ssl` và bật `server: { host: true }` trong `vite.config.ts` để test trực tiếp Camera trên iPhone/Android qua HTTPS mạng LAN.
   - Cấu hình `vite-plugin-pwa` (manifest + service worker precache cả file `.wasm`) để cài đặt lên màn hình chính và hoạt động 100% Offline.

Hãy bắt đầu ngay với **GIAI ĐOẠN 1**, báo cáo ngắn gọn các rules đã trích xuất từ `ecc` và xác nhận đã đọc `UI_UX_SPEC.md`, sau đó tiến hành **GIAI ĐOẠN 2 & 3** (dựng Rust WASM và chạy `cargo test` pass 100% trước khi code UI).