import React from 'react';
import type { OpenCommentSentiment } from '../../types';

interface SentimentBadgeProps {
  sentiment: OpenCommentSentiment | null;
  label: string | null;
  /** Xác suất của nhãn, 0..1. Hiển thị trong tooltip, không phải tín hiệu duy nhất. */
  confidence?: number | null;
  isManuallyReviewed?: boolean;
  /** Bản gọn cho bảng nhiều dòng: chỉ badge, không kèm dòng độ tin cậy. */
  compact?: boolean;
}

/**
 * Badge nhãn cảm xúc.
 *
 * Màu sắc KHÔNG bao giờ là tín hiệu duy nhất: ô nào cũng có nhãn chữ, và nhãn "Chưa chắc chắn"
 * phân biệt bằng viền nét đứt chứ không bằng màu. Người dùng mù màu vẫn đọc được đủ thông tin,
 * và file Excel xuất ra cũng mang theo chữ chứ không mang theo màu.
 */
export const SentimentBadge: React.FC<SentimentBadgeProps> = ({
  sentiment,
  label,
  confidence,
  isManuallyReviewed = false,
  compact = false,
}) => {
  if (!sentiment || !label) {
    return (
      <span
        className="sentiment-badge is-pending"
        title="Ý kiến này chưa được phân tích. Hệ thống sẽ xử lý ở lần quét tiếp theo."
      >
        Chưa phân tích
      </span>
    );
  }

  // Nhãn do người đặt không có độ tin cậy riêng. In ra con số của mô hình ngay cạnh nhãn người
  // sửa là gán ghép hai thứ khác nhau, nên nhánh này chỉ nói rõ nguồn gốc của nhãn.
  const confidenceText = isManuallyReviewed
    ? 'nhãn do người có quyền đặt, không có độ tin cậy'
    : confidence === null || confidence === undefined
      ? 'chưa có độ tin cậy'
      : `Độ tin cậy ${(confidence * 100).toFixed(0)}%`;

  const title = [
    `Phân loại tự động: ${label}`,
    confidenceText,
    'Cần đối chiếu nội dung gốc trước khi kết luận.',
  ].join(' · ');

  return (
    <span className={`sentiment-cell${compact ? ' is-compact' : ''}`} title={title}>
      <span className={`sentiment-badge is-${sentiment.toLowerCase()}`}>{label}</span>
      {!compact && (
        <span className="sentiment-cell-meta">
          {isManuallyReviewed ? (
            <span className="sentiment-manual-flag">Đã hiệu chỉnh</span>
          ) : confidence === null || confidence === undefined ? (
            '—'
          ) : (
            `${(confidence * 100).toFixed(0)}%`
          )}
        </span>
      )}
    </span>
  );
};
