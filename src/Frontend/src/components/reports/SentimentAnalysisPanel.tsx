import React from 'react';
import { AlertTriangle, Bot, Info } from 'lucide-react';
import type { OpenCommentAnalysisReport, OpenCommentSentiment } from '../../types';
import { sentimentColor } from './theme';

interface SentimentAnalysisPanelProps {
  report: OpenCommentAnalysisReport;
}

/** Thứ tự nhãn cố định để KPI không nhảy vị trí khi số liệu thay đổi. */
const SENTIMENT_ORDER: OpenCommentSentiment[] = [
  'Positive',
  'Negative',
  'Neutral',
  'Mixed',
  'Uncertain',
];

/** Nhãn hiển thị luôn dùng tiếng Việt, không phụ thuộc chuỗi nhãn từ API. */
const SENTIMENT_LABEL: Record<OpenCommentSentiment, string> = {
  Positive: 'Tích cực',
  Negative: 'Tiêu cực',
  Neutral: 'Trung tính',
  Mixed: 'Hỗn hợp',
  Uncertain: 'Chưa chắc chắn',
};

/** Dòng phụ của thẻ chỉ số: nói nhãn này nghĩa là gì, không lặp lại con số. */
const SENTIMENT_MEANING: Record<OpenCommentSentiment, string> = {
  Positive: 'Khen, hài lòng',
  Negative: 'Phàn nàn, chê',
  Neutral: 'Không mang sắc thái rõ rệt',
  Mixed: 'Vừa khen vừa chê',
  Uncertain: 'Chưa đủ căn cứ để kết luận',
};

/**
 * Khối phân bố cảm xúc của ý kiến mở: năm thẻ chỉ số và các ghi chú bắt buộc.
 *
 * Số liệu từng nhãn nằm ở thẻ chỉ số, không vẽ thêm biểu đồ: lưới thẻ ngay trên đã có đủ số và
 * tỷ lệ của từng nhãn rồi, thêm một vòng tròn nữa là nói lại đúng những con số đó.
 *
 * Hai cảnh báo dưới đây là yêu cầu nghiệp vụ, không phải trang trí:
 * - Kết quả do model tạo ra, phải đối chiếu nội dung gốc trước khi kết luận về một giảng viên.
 * - Ý kiến chưa phân tích phải hiện thành một con số riêng, không được gộp vào Trung tính.
 */
export const SentimentAnalysisPanel: React.FC<SentimentAnalysisPanelProps> = ({ report }) => {
  const breakdownByLabel = new Map(
    report.sentimentBreakdown.map((item) => [item.sentiment, item]),
  );

  return (
    <section className="reports-sentiment-group" aria-label="Phân bố cảm xúc ý kiến mở">
      <div className="reports-overview-group-header">
        <span className="reports-overview-group-title">
          <Bot size={14} aria-hidden="true" />
          Phân bố cảm xúc (phân loại tự động)
        </span>
        {report.pendingAnalysisCount > 0 && (
          <span className="reports-sentiment-pending">
            <AlertTriangle size={14} aria-hidden="true" />
            Còn {report.pendingAnalysisCount.toLocaleString('vi-VN')} ý kiến chưa phân tích
          </span>
        )}
      </div>

      <div
        className="reports-overview-kpis"
        role="region"
        aria-label="Số ý kiến theo từng nhãn cảm xúc"
      >
        {SENTIMENT_ORDER.map((sentiment) => {
          const bucket = breakdownByLabel.get(sentiment);
          const count = bucket?.count ?? 0;
          return (
            <div
              key={sentiment}
              className="reports-overview-kpi-card reports-sentiment-card"
              // Màu nhãn nằm ở viền trái để vẫn nhận ra nhãn nào là nhãn nào, giống cách
              // bảng KPI bên tab Tổng quan phân biệt bằng màu chứ không bằng vị trí.
              style={{ borderLeftColor: sentimentColor(sentiment) }}
              title={
                sentiment === 'Uncertain'
                  ? 'Ý kiến chưa đủ căn cứ để kết luận. Cần người xem lại nội dung gốc.'
                  : 'Số ý kiến được phân loại vào nhãn này trong phạm vi đang xem.'
              }
            >
              <span className="reports-overview-kpi-label">{SENTIMENT_LABEL[sentiment]}</span>
              <div className="reports-overview-kpi-value">
                <strong className="reports-overview-kpi-num">
                  {count.toLocaleString('vi-VN')}
                </strong>
                <span className="reports-overview-kpi-unit">ý kiến</span>
                {report.analyzedCommentCount > 0 && (
                  <span className="reports-overview-kpi-badge">
                    {bucket?.percentage.toFixed(1) ?? '0.0'}%
                  </span>
                )}
              </div>
              <span className="reports-overview-kpi-sub">{SENTIMENT_MEANING[sentiment]}</span>
            </div>
          );
        })}

        {/*
          Phần giải thích nằm TRONG lưới thẻ, không phải một dải riêng bên dưới: 5 nhãn ở lưới 4
          cột thì hàng thứ hai chỉ có một thẻ, ba cột còn lại để trống rất phí. Đặt vào đây rồi
          để CSS quyết định chiếm mấy cột theo bề rộng màn hình.
        */}
        <ul className="reports-sentiment-notes">
          <li>
            <Info size={14} aria-hidden="true" />
            <span>
              <strong>Kết quả phân loại tự động, cần đối chiếu nội dung gốc.</strong> Không dùng số
              liệu này làm căn cứ duy nhất để đánh giá hoặc xếp hạng giảng viên.
            </span>
          </li>
          <li>
            <Info size={14} aria-hidden="true" />
            <span>
              <strong>“Chưa chắc chắn”</strong> là ý kiến hệ thống chưa đủ căn cứ kết luận, khác
              với <strong>“Trung tính”</strong> là ý kiến đã kết luận không mang sắc thái rõ rệt.
              Hai nhóm này không được gộp chung khi tính tỷ lệ.
            </span>
          </li>
          <li>
            <Info size={14} aria-hidden="true" />
            <span>
              Tỷ lệ tính trên{' '}
              <strong>{report.analyzedCommentCount.toLocaleString('vi-VN')}</strong> ý kiến đã phân
              tích
              {report.pendingAnalysisCount > 0
                ? `, còn ${report.pendingAnalysisCount.toLocaleString('vi-VN')} ý kiến chờ xử lý và chưa nằm trong mẫu số.`
                : '.'}
            </span>
          </li>
          {report.manuallyReviewedCount > 0 && (
            <li>
              <Info size={14} aria-hidden="true" />
              <span>
                Có <strong>{report.manuallyReviewedCount.toLocaleString('vi-VN')}</strong> ý kiến đã
                được người có quyền hiệu chỉnh nhãn; số liệu ở đây đã dùng nhãn sau hiệu chỉnh.
              </span>
            </li>
          )}
        </ul>
      </div>

      {report.analyzedCommentCount === 0 && report.pendingAnalysisCount > 0 && (
        <div className="reports-sentiment-alert" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Chưa ý kiến nào của phạm vi này được phân tích cảm xúc. Phân tích chạy theo lô và chỉ
            chạy khi quản trị viên chủ động khởi động, nên đây là trạng thái bình thường sau khi
            chốt một đợt khảo sát mới.
          </span>
        </div>
      )}

      {report.analyzedCommentCount > 0 && report.pendingAnalysisCount > 0 && (
        <div className="reports-sentiment-alert" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Còn {report.pendingAnalysisCount.toLocaleString('vi-VN')} ý kiến chưa được phân tích.
            Số liệu ở trên chỉ tính trên phần đã phân tích.
          </span>
        </div>
      )}
    </section>
  );
};
