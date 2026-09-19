import React from 'react';
import type { QuestionRating } from '../../types';
import { formatNumber, scoreColor } from './theme';
import '../../styles/catalogs.css';

interface WeakestQuestionsPanelProps {
  questions: QuestionRating[];
  /**
   * Số PHIẾU HỢP LỆ của nhóm lớp đủ điều kiện — đúng con số ở dải chỉ số phía trên.
   * Trước đây chỗ này nhận tổng phiếu của mọi lớp, nên hai nơi trên cùng một màn
   * hình nói ra hai số khác nhau.
   */
  validResponseCount: number;
  /** true là xem từ tiêu chí điểm thấp nhất, false là từ tiêu chí điểm cao nhất. */
  lowestFirst?: boolean;
}

const ratingLabel = (score: number): string => {
  if (score >= 4.5) return 'Xuất sắc';
  if (score >= 4.0) return 'Tốt';
  if (score >= 3.0) return 'Trung bình';
  if (score > 0) return 'Cần cải thiện';
  return 'Chưa có điểm';
};

/** Bảng xếp hạng tiêu chí toàn trường theo điểm, dùng đúng bảng của trang danh mục. */
export const WeakestQuestionsPanel: React.FC<WeakestQuestionsPanelProps> = ({
  questions,
  validResponseCount,
  lowestFirst = true,
}) => {
  if (questions.length === 0) {
    return (
      <div className="reports-chart-empty">
        Chưa đủ dữ liệu để xếp hạng tiêu chí (cần ≥ 10 phiếu hợp lệ mỗi câu).
      </div>
    );
  }

  return (
    <div className="reports-weakest">
      <p className="reports-weakest-hint">
        Gộp từ {formatNumber(validResponseCount)} phiếu hợp lệ của các lớp
        đủ điều kiện tính điểm ·{' '}
        {lowestFirst
          ? 'xếp từ tiêu chí bị chấm thấp nhất'
          : 'xếp từ tiêu chí được chấm cao nhất'}
      </p>

      {/* Dựng đúng bộ khung của DataTable ở Danh mục đào tạo: shell → scroll → table. */}
      <section className="catalog-table-shell" aria-label="Xếp hạng tiêu chí">
        <div className="catalog-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu, có thể cuộn ngang">
          <table className="catalog-table">
            <thead>
              <tr>
                <th className="catalog-table__index" scope="col">STT</th>
                <th scope="col" style={{ width: '44%' }}>Tiêu chí</th>
                <th scope="col" style={{ width: '18%' }}>Thang trả lời</th>
                <th scope="col" style={{ width: '13%' }}>Phiếu hợp lệ</th>
                <th scope="col" style={{ width: '12%' }}>Điểm trung bình</th>
                <th scope="col" style={{ width: '13%' }}>Xếp loại</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question, index) => (
                <tr key={question.questionId}>
                  <td className="catalog-table__index">{index + 1}</td>
                  <td>
                    <span className="catalog-cell-primary">{question.questionText}</span>
                  </td>
                  <td>{question.answerScaleName || '—'}</td>
                  <td>{formatNumber(question.totalAnswers)}</td>
                  <td style={{ color: scoreColor(question.averageScore) }}>
                    {question.averageScore > 0 ? question.averageScore.toFixed(2) : '—'}
                  </td>
                  <td style={{ color: scoreColor(question.averageScore) }}>
                    {ratingLabel(question.averageScore)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
