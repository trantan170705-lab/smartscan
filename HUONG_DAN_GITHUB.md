# HƯỚNG DẪN ĐƯA CODE LÊN GITHUB & QUY TRÌNH COMMIT CẬP NHẬT
**Kho lưu trữ GitHub:** [https://github.com/trantan170705-lab/smartscan](https://github.com/trantan170705-lab/smartscan)

---

## PHẦN 1: ĐƯA DỰ ÁN LÊN GITHUB LẦN ĐẦU TIÊN (INITIAL PUSH)

Mở cửa sổ dòng lệnh (Terminal / PowerShell / Git Bash) tại thư mục dự án `c:\Users\PC\Desktop\smartscan` và thực hiện lần lượt các bước sau:

### Bước 1: Khởi tạo Git repository trong thư mục
```bash
git init
```

### Bước 2: Kiểm tra các file sẽ được đưa lên
Đảm bảo file `.gitignore` đã có trong thư mục (để không đẩy các thư mục nặng như `node_modules` hay `wasm-scanner/target`).
```bash
git status
```

### Bước 3: Thêm tất cả các file mã nguồn vào khu vực chờ (Staging Area)
```bash
git add .
```

### Bước 4: Tạo commit đầu tiên
```bash
git commit -m "feat: initial commit SmartScan precision document scanner"
```

### Bước 5: Đặt tên nhánh chính là `main`
```bash
git branch -M main
```

### Bước 6: Liên kết với kho lưu trữ GitHub của bạn
```bash
git remote add origin https://github.com/trantan170705-lab/smartscan.git
```
*(Nếu trước đó đã lỡ thêm remote, bạn có thể kiểm tra bằng lệnh `git remote -v` hoặc đổi lại bằng `git remote set-url origin https://github.com/trantan170705-lab/smartscan.git`)*

### Bước 7: Đẩy mã nguồn lên GitHub
```bash
git push -u origin main
```

> **Lưu ý khi đăng nhập GitHub lần đầu:**
> Khi màn hình yêu cầu xác thực tài khoản GitHub:
> - Có thể chọn đăng nhập qua trình duyệt (Browser login).
> - Hoặc sử dụng **Personal Access Token (PAT)** của GitHub thay cho mật khẩu (vào GitHub $\rightarrow$ *Settings* $\rightarrow$ *Developer settings* $\rightarrow$ *Personal access tokens* $\rightarrow$ tạo token có quyền `repo`).

---

## PHẦN 2: QUY TRÌNH CẬP NHẬT & COMMIT KHI CÓ CODE MỚI

Mỗi khi bạn sửa code, thêm tính năng mới hoặc sửa lỗi, hãy thực hiện quy trình chuẩn 4 bước sau:

### Bước 1: Kiểm tra các file vừa thay đổi
```bash
git status
```
*(Lệnh này sẽ liệt kê màu đỏ các file bạn vừa chỉnh sửa hoặc thêm mới).*

### Bước 2: Thêm các thay đổi vào danh sách chuẩn bị lưu
- Nếu muốn lưu tất cả thay đổi:
  ```bash
  git add .
  ```
- Hoặc nếu chỉ muốn lưu một file cụ thể:
  ```bash
  git add src/App.tsx
  ```

### Bước 3: Tạo commit với thông điệp mô tả rõ ràng
```bash
git commit -m "mô_tả_nội_dung_bạn_vừa_làm"
```

**Ví dụ các thông điệp commit chuẩn quốc tế:**
- Thêm tính năng mới:
  ```bash
  git commit -m "feat: them bo loc magic color va nhan dien goc thong minh"
  ```
- Sửa lỗi:
  ```bash
  git commit -m "fix: sua loi auto-crop nhay lung tung va xoay ngang trang pdf"
  ```
- Cập nhật giao diện:
  ```bash
  git commit -m "style: toi uu hoa thanh tim kiem va menu ngon ngu tren mobile"
  ```
- Cập nhật tài liệu:
  ```bash
  git commit -m "docs: cap nhat file README va bao cao tien do"
  ```

### Bước 4: Đẩy commit lên GitHub
```bash
git push
```
*(Chỉ cần gõ `git push`, code mới sẽ tự động đồng bộ lên GitHub của bạn ngay lập tức).*

---

## PHẦN 3: CÁC LỆNH HỮU ÍCH THƯỜNG DÙNG

| Tình huống | Lệnh thực hiện |
| :--- | :--- |
| **Xem lịch sử các commit đã tạo** | `git log --oneline -n 5` |
| **Hủy bỏ thay đổi chưa commit của 1 file** | `git checkout -- tên_file` |
| **Xem nội dung code khác biệt trước khi commit** | `git diff` |
| **Kéo code mới nhất từ GitHub về máy** | `git pull origin main` |

---

## PHẦN 4: XỬ LÝ LỖI THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi: `Updates were rejected because the remote contains work that you do not have locally`
- **Nguyên nhân:** Trên GitHub đã có sẵn file (ví dụ file README tạo lúc tạo repo trên web) mà ở máy bạn chưa có.
- **Cách xử lý:**
  ```bash
  git pull origin main --rebase
  git push origin main
  ```
  *(Hoặc nếu repo trên GitHub còn mới và bạn muốn ghi đè hoàn toàn từ máy tính lên: `git push -u origin main --force`)*

### 2. Lỗi: `fatal: remote origin already exists`
- **Cách xử lý:**
  ```bash
  git remote set-url origin https://github.com/trantan170705-lab/smartscan.git
  ```
