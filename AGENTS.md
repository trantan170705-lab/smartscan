# HƯỚNG DẪN CỐT LÕI DỰ ÁN SMARTSCAN (AGENTS.md)
> Tệp này được hệ thống Antigravity tự động nạp vào ngữ cảnh cho MỌI cửa sổ chat mới trong workspace này.

---

## 1. NGUỒN CHÂN LÝ GIAO DIỆN: UI_UX_SPEC.md (BẮT BUỘC)
Mọi prompt liên quan đến giao diện (UI/UX) đều phải tuân thủ tuyệt đối [UI_UX_SPEC.md](file:///c:/Users/Windows/Desktop/smartscan/UI_UX_SPEC.md):
- **Phong cách Thiết bị Quang học Chính xác (Optical Instrument Aesthetic)**: Lấy cảm hứng từ Leica M-series & Teenage Engineering.
- **Hệ màu Cố định Dual-Theme**: Chỉ dùng các CSS variables định sẵn (`--bg-void`, `--bg-panel`, `--bg-elevated`, `--border-hairline`, `--border-active`, `--accent-laser`, `--text-primary`, `--text-muted`). Không dùng màu pastel, gradient mềm hay màu tím/xanh ngọc SaaS.
- **Danh sách CẤM (Hard Ban List)**:
  - CẤM: `bg-gradient-*`, `from-indigo-*`, `from-purple-*`, `shadow-md`, `shadow-lg`, `rounded-2xl`, `rounded-3xl`, `animate-bounce`.
  - CẤM EMOJI: 100% không dùng emoji trong code hay giao diện. Sử dụng `lucide-react` với `strokeWidth={1.5}`.
  - CẤM Copywriting tiếp thị sáo rỗng: Sử dụng nhãn phần cứng kỹ thuật (`READY`, `NO_DOCS`, `A4_200DPI`, `WASM_IDLE`).
- **Typography**: Mọi số liệu đo lường, thông số kỹ thuật, zoom, số trang (`01/08`, `1800×2545`, `1.42 MB`) BẮT BUỘC dùng font monospace (`font-mono` với `tabular-nums`).

---

## 2. NGUYÊN TẮC KỸ THUẬT & ECC WORKFLOW
- **Tuân thủ tiêu chuẩn ECC (Everything Claude Code)**:
  - Lập kế hoạch trước khi code tính năng phức tạp.
  - Quy trình TDD (Test-Driven Development): Viết/chạy unit test Rust (`cargo test`) và build kiểm tra (`npm run build`) trước khi kết thúc tác vụ.
  - Kiến trúc Pure Rust WASM: Toàn bộ xử lý nặng (Homography warp, Radon deskew, Retinex, JPEG encoder, PDF) chạy trên Web Worker bằng `Uint8Array.buffer` Transferable (Zero-Copy).
  - Quản lý bộ nhớ di động (iOS Safari / Android): Mọi `<canvas>` tạm phải giải phóng (`width = 0; height = 0`), mọi Object URL phải được `URL.revokeObjectURL`.

---

## 3. LỊCH SỬ DỰ ÁN & TIẾN ĐỘ
- Trước khi thực hiện thay đổi cấu trúc, đọc tóm tắt trong [PROJECT_PROGRESS.md](file:///c:/Users/Windows/Desktop/smartscan/PROJECT_PROGRESS.md) để kế thừa toàn bộ thành quả từ các phiên phát triển trước.

---

## 4. QUY TẮC GIT BẮT BUỘC
- **TUYỆT ĐỐI KHÔNG TỰ ĐỘNG COMMIT HOẶC PUSH GIT**: Người dùng sẽ tự review mã nguồn và commit thủ công. Agent chỉ giữ các thay đổi tại local workspace.

