"""Bộ xử lý dữ liệu phân tích kết quả học phần (bộ luật A–D).

Luồng: nạp file lớp + file điểm của một kỳ -> luat_b / luat_a -> kho (lưu dữ liệu sạch)
-> chi_so (chỉ số trong kỳ) -> lien_ky (so sánh qua các kỳ) -> xuat (JSON cho web).
"""
