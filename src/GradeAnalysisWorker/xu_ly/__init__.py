"""Bộ tính chỉ số phân tích điểm học phần (bộ luật D, E).

Chép từ module audit (project-audit/xu_ly) ngày 09/11/2026, chỉ sửa chỗ nối với khaosatvmu:
- chuan_hoa: mã kỳ nhận học kỳ phụ (2526_HKP), thứ tự phụ → HK1 → HK2.
- nhan_xet: mẫu câu ở rules/mau_nhan_xet.json; câu không chèn tên giảng viên và không ghi
  số tháng giữa hai kỳ (API điền tên theo quyền người xem).
- chi_so: số tiến trình chạy mô hình hỗn hợp đọc từ GRADE_WORKER_PROCESSES.
Phần tính giữ nguyên. Bộ luật A, B (đọc file, loại dòng, ghép lớp) nằm ở backend C#.
"""
