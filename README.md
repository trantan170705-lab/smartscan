# SmartScan — Precision Document Scanner

> **Máy quét tài liệu chuẩn xác cao, bảo mật 100% Client-side chạy bằng Rust WebAssembly + React TypeScript.**

[![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-WASM-654FF0.svg?logo=webassembly)](https://webassembly.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.x-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)

---

## 📖 Giới thiệu
**SmartScan** là ứng dụng máy quét tài liệu thông minh hoạt động trực tiếp trong trình duyệt web mà không cần cài đặt phần mềm phụ trợ hay tải ảnh lên máy chủ đám mây. 

Mọi tác vụ xử lý hình ảnh phức tạp—từ phát hiện góc giấy tự động, nắn phẳng góc phối cảnh (Warp Perspective), áp dụng bộ lọc tăng cường văn bản, bảo toàn con dấu đỏ, đến đóng gói file PDF đa trang—đều được thực thi trực tiếp trên luồng Web Worker với tốc độ cực nhanh bằng mã nhị phân **Rust WebAssembly**.

---

## ✨ Tính năng Nổi bật

### 1. Nhận diện góc giấy thông minh (White Document Saliency & CamScanner Tracking)
- Phân đoạn vùng giấy trắng theo phân vị độ sáng cao, loại bỏ hoàn toàn viền màn hình máy tính, bàn làm việc hay bóng đổ.
- Khóa mục tiêu tài liệu (`QUAD_LOCKED`) với thuật toán chống rung giật (Temporal Hysteresis & Outlier Rejection) chuẩn CamScanner.
- Hiển thị khung nhận diện màu xanh ngọc với 4 điểm chốt góc tinh tế.

### 2. Nắn góc phối cảnh chính xác cao (Sub-pixel Homography)
- Ma trận biến đổi phối cảnh 3x3 tính bằng Rust WASM kết hợp thuật toán nội suy song tuyến (Bilinear Interpolation).
- Khử độ cong, độ nghiêng của trang giấy khi chụp xéo.
- Thuật toán điều chuẩn mép giấy khi chụp giấy xếp chồng lên nhau (không bị tràn viền giấy bên dưới).

### 3. Bộ lọc màu tài liệu chuyên dụng
- **Màu thần kỳ (Magic Color)**: Tăng độ tương phản chữ in đen, làm trắng nền giấy đồng thời bảo toàn độ tươi đỏ rực rỡ của con dấu pháp lý.
- **Thần kỳ Pro (Magic Pro)**: Cân bằng trắng thích ứng theo vùng (Local Adaptive White Balance), triệt tiêu bóng đổ bàn tay.
- **Trắng đen (B&W)**: Nhị phân hóa thích ứng tối ưu cho tài liệu photocopy và văn bản hành chính.
- **Ảnh gốc**: Giữ trọn màu sắc và sắc thái ban đầu của trang giấy sau khi cắt viền.

### 4. Bộ chỉnh góc thủ công với Kính lúp (Magnifier Loupe)
- Kính lúp phóng đại **1.75x** với đường kính 176px cho tầm nhìn góc 90° rõ ràng.
- Cánh tay đòn kính lúp (Offset Arm) 30px: ngón tay kéo không che khuất góc nhìn.
- Hỗ trợ phóng to tài liệu (50% – 250%) và kéo lia (Pan/Drag) để điều chỉnh chi tiết nhỏ.

### 5. Xuất PDF thông minh đa trang
- **Tự động nhận diện hướng giấy (Auto-Orientation)**: Tự động chuyển trang ngang (A4 Landscape) cho các tài liệu khổ ngang (Bằng tốt nghiệp, chứng chỉ, giấy khen) và khổ dọc (A4 Portrait) cho tài liệu thông thường.
- Nhúng nén ảnh DCTDecode JPEG trực tiếp trong cấu trúc PDF từ Rust, cho file PDF dung lượng nhỏ gọn và sắc nét.

### 6. Bộ nhớ đệm 0ms & Trải nghiệm Di động Hoàn hảo
- Chụp hoặc thêm trang mới lập tức chuyển đến xem ngay trang vừa thêm.
- Lưu cache thành phẩm ảnh đã xử lý: mở Chỉnh sửa tức thì trong 0ms, không load lại từ đầu.
- Giao diện Header tinh gọn tối đa, thanh tìm kiếm mở rộng thoáng đãng trên điện thoại.

---

## 🛠️ Kiến trúc Công nghệ

```
SmartScan Workspace
├── Frontend UI (React + TypeScript + TailwindCSS)
│   ├── DocumentVault (Quản lý hồ sơ quét, tìm kiếm, xem lại)
│   ├── LiveViewfinder (Camera trực tiếp, nhận diện viền xanh ngọc)
│   ├── QuadEditor (Chỉnh sửa 4 góc thủ công, kính lúp 1.75x)
│   └── AdaptiveStudio (Xem trước, bộ lọc, xoay 90°, xuất PDF)
│
├── Web Worker Layer (scanner.worker.ts)
│   └── Chạy song song không gây đơ lag giao diện người dùng
│
└── WASM Core Engine (wasm-scanner bằng Rust)
    ├── detector.rs (White Document Saliency, Otsu, Canny, RDP)
    ├── warp.rs (Homography perspective transform, bilinear interpolation)
    ├── filters.rs (Magic Color, Magic Pro, B&W, red seal preservation)
    └── pdf.rs (Direct DCTDecode multi-page PDF generation, auto-orientation)
```

---

## 🚀 Hướng dẫn Cài đặt & Chạy Dự án

### Yêu cầu hệ thống:
- **Node.js**: v18.0 trở lên
- **Rust & Cargo**: phiên bản mới nhất (`rustup default stable`)
- **wasm-pack**: (`npm install -g wasm-pack` hoặc `cargo install wasm-pack`)

### 1. Clone mã nguồn
```bash
git clone https://github.com/trantan170705-lab/smartscan.git
cd smartscan
```

### 2. Cài đặt thư viện Node.js
```bash
npm install
```

### 3. Biên dịch lõi Rust WASM
```bash
npx wasm-pack build wasm-scanner --target web --out-dir ../src/wasm-pkg
```

### 4. Khởi chạy máy chủ phát triển
```bash
npm run dev
```
Trình duyệt sẽ mở ứng dụng tại `https://localhost:5173`.

---

## 📱 Sử dụng trên Điện thoại (Mạng LAN)

Do chính sách bảo mật quốc tế **W3C WebRTC (Secure Context)**:
- **Cách 1 (Nhanh nhất không cần cài đặt)**: Bấm nút **"CHỤP BẰNG MÁY ẢNH ĐIỆN THOẠI"** trên màn hình để mở ngay camera gốc của máy.
- **Cách 2 (Bật Live Camera qua IP LAN)**:
  1. Trên Chrome của điện thoại, mở: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
  2. Thêm địa chỉ máy chủ (ví dụ: `http://192.168.x.x:5173`)
  3. Chọn **Enabled** và khởi động lại trình duyệt Chrome.

---

## 📄 Bản quyền
Dự án được phát triển dưới giấy phép MIT License.
Toàn bộ mã nguồn thuộc quyền sở hữu của [trantan170705-lab](https://github.com/trantan170705-lab/smartscan).
