import '../styles/audit-grade-module.css';

/**
 * Module phân tích điểm học phần bản audit (src/AuditGradeModule), chạy nguyên bản và độc lập
 * với nhóm "Phân tích điểm học phần": dữ liệu, tham số và giao diện riêng. Trang chỉ nhúng giao
 * diện của nó; API chuyển tiếp /api/audit-grades/ tới container và chỉ cho ADMIN.
 *
 * Phải mở ở địa chỉ có "/" cuối: giao diện audit dùng đường dẫn tương đối (data/…, api/…).
 */
export function AuditGradeModulePage() {
  return (
    <div className="audit-grade-module">
      <iframe
        className="audit-grade-module__frame"
        src="/api/audit-grades/"
        title="Phân tích điểm học phần (bản audit)"
      />
    </div>
  );
}
