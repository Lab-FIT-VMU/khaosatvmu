import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { Modal } from './Modal';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import {
  publishScoringThresholds,
  useScoringThresholds,
} from '../hooks/useScoringThresholds';
import type { ScoringThresholds } from '../utils/reportThresholds';
import '../styles/catalogs.css';

const messageFrom = (error: unknown): string =>
  error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(value));
}

/**
 * Nút Cập nhật điểm, đặt trên thanh chọn Học kỳ / Đợt khảo sát của mọi trang thống
 * kê, báo cáo. Bấm vào chưa tính ngay: mở hộp thoại cấu hình trước, xem/sửa xong mới
 * bấm Cập nhật trong hộp thoại để chạy.
 *
 * Cập nhật điểm ghi đè điểm của MỌI lớp trong đợt, không cắt được theo bộ môn — nên
 * chỉ quản trị toàn hệ thống mới thấy nút. Backend cũng chặn, đây chỉ là để người
 * không có quyền khỏi bấm rồi ăn lỗi.
 */
export const UpdateScoresButton: React.FC<{
  semesterSurveyId: number | string | null | undefined;
  /** Chạy sau khi tính xong, để trang nạp lại số liệu mới. */
  onUpdated?: () => void | Promise<void>;
}> = ({ semesterSurveyId, onUpdated }) => {
  const { activeProfile } = useAuth();
  const thresholds = useScoringThresholds();
  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  if (!isUnrestrictedRole(activeProfile?.roleCode)) return null;

  const campaignId = Number(semesterSurveyId) || null;

  /** Trả true khi tính xong, để hộp thoại biết mà tự đóng. */
  const handleUpdate = async (): Promise<boolean> => {
    if (!campaignId || updating) return false;
    setUpdating(true);
    try {
      const result = await surveyApi.recalculateScores(campaignId);
      toast.success(`Đã cập nhật điểm ${result.updatedSectionCount} lớp học phần`, {
        description: `Thời điểm tính: ${formatDateTime(result.calculatedAt)}`,
      });
      await onUpdated?.();
      return true;
    } catch (error) {
      toast.error('Không cập nhật được điểm', { description: messageFrom(error) });
      return false;
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setIsOpen(true)}
        disabled={!campaignId || updating}
      >
        {updating ? (
          <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
        ) : (
          <Calculator aria-hidden="true" size={16} />
        )}
        {updating ? 'Đang cập nhật...' : 'Cập nhật điểm'}
      </button>

      {/* Nút nằm trong thanh chọn Học kỳ / Đợt khảo sát, mà thanh đó có luật
          `.statistics-toolbar .form-group` dàn mọi ô thành hàng ngang. Vẽ hộp thoại
          thẳng vào body để không dính luật đó — không thì nhãn, ô nhập và ghi chú
          bị bóp thành từng cột hẹp. */}
      {createPortal(
        <ScoringThresholdDialog
          isOpen={isOpen}
          current={thresholds}
          onClose={() => setIsOpen(false)}
          onUpdate={handleUpdate}
          updating={updating}
        />,
        document.body,
      )}
    </>
  );
};

/**
 * Hộp thoại cấu hình tính điểm của nút Cập nhật điểm. Nút Lưu cấu hình nằm ngay dưới
 * phần cấu hình, còn chân hộp thoại là nút Cập nhật để chạy tính điểm theo cấu hình
 * ĐÃ LƯU.
 */
const ScoringThresholdDialog: React.FC<{
  isOpen: boolean;
  current: ScoringThresholds;
  onClose: () => void;
  /** Chạy cập nhật điểm; trả true khi tính xong. */
  onUpdate: () => Promise<boolean>;
  updating: boolean;
}> = ({ isOpen, current, onClose, onUpdate, updating }) => {
  const [responseRate, setResponseRate] = useState(String(current.minimumResponseRate));
  const [validRate, setValidRate] = useState(String(current.minimumValidRate));
  const [rejectTooFast, setRejectTooFast] = useState(current.rejectTooFast);
  const [rejectSingleAnswer, setRejectSingleAnswer] = useState(current.rejectSingleAnswer);
  const [rejectAttentionCheck, setRejectAttentionCheck] = useState(
    current.rejectAttentionCheckFailed
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Mở lại hộp thoại thì đọc lại giá trị đang áp, không giữ bản nháp lần trước.
  useEffect(() => {
    if (!isOpen) return;
    setResponseRate(String(current.minimumResponseRate));
    setValidRate(String(current.minimumValidRate));
    setRejectTooFast(current.rejectTooFast);
    setRejectSingleAnswer(current.rejectSingleAnswer);
    setRejectAttentionCheck(current.rejectAttentionCheckFailed);
    setError(null);
  }, [isOpen, current]);

  // Còn chỉnh mà chưa lưu thì chưa cho Cập nhật: tính điểm đọc cấu hình đã lưu trên
  // máy chủ, không đọc những gì đang gõ trong hộp thoại.
  const hasUnsavedChanges =
    responseRate !== String(current.minimumResponseRate)
    || validRate !== String(current.minimumValidRate)
    || rejectTooFast !== current.rejectTooFast
    || rejectSingleAnswer !== current.rejectSingleAnswer
    || rejectAttentionCheck !== current.rejectAttentionCheckFailed;
  const busy = saving || updating;

  const handleUpdate = async () => {
    if (hasUnsavedChanges || busy) return;
    if (await onUpdate()) onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next = {
      minimumResponseRate: Number(responseRate),
      minimumValidRate: Number(validRate),
      rejectTooFast,
      rejectSingleAnswer,
      rejectAttentionCheckFailed: rejectAttentionCheck,
    };
    const outOfRange = [next.minimumResponseRate, next.minimumValidRate].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100
    );
    if (outOfRange) {
      setError('Cả hai ngưỡng phải là số trong khoảng 0 đến 100.');
      return;
    }

    setSaving(true);
    try {
      const saved = await surveyApi.updateScoringThresholds(next);
      publishScoringThresholds(saved);
      toast.success('Đã lưu ngưỡng tính điểm', {
        description:
          `Tỷ lệ phản hồi ≥ ${saved.minimumResponseRate}% · `
          + `Tỷ lệ phiếu hợp lệ ≥ ${saved.minimumValidRate}%. `
          + 'Bấm "Cập nhật" để tính lại điểm theo cấu hình mới.',
      });
      // Giữ hộp thoại lại để bấm Cập nhật ngay sau đó.
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ngưỡng lọc lớp được tính điểm">
      <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
        {error && <div className="catalog-validation-error" role="alert">{error}</div>}

        <div className="catalog-context-band">
          Một lớp phải qua cả hai tiêu chí thì điểm của nó mới được gộp vào mọi bảng thống
          kê và báo cáo. Chỉnh cấu hình nếu cần rồi bấm <strong>Lưu cấu hình</strong>, sau
          đó bấm <strong>Cập nhật</strong> để tính lại điểm cho mọi lớp trong đợt.
        </div>

        <div className="catalog-form-grid catalog-form-grid--2">
          <div className="form-group">
            <label htmlFor="threshold-response-rate">
              Tiêu chí 1 — Tỷ lệ phản hồi tối thiểu (%)
            </label>
            <input
              id="threshold-response-rate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={responseRate}
              disabled={busy}
              onChange={(event) => setResponseRate(event.target.value)}
              required
            />
            <p className="answer-scale-hint">Số phiếu đã thu ÷ Sĩ số. Mặc định 50%.</p>
          </div>
          <div className="form-group">
            <label htmlFor="threshold-valid-rate">
              Tiêu chí 2 — Tỷ lệ phiếu hợp lệ tối thiểu (%)
            </label>
            <input
              id="threshold-valid-rate"
              type="number"
              min={0}
              max={100}
              step={1}
              value={validRate}
              disabled={busy}
              onChange={(event) => setValidRate(event.target.value)}
              required
            />
            <p className="answer-scale-hint">
              Số phiếu hợp lệ ÷ Số phiếu đã thu. Mặc định 80%.
            </p>
          </div>
        </div>

        {/* Ba luật của bộ lọc nhiễu. Bỏ chọn luật nào thì phiếu chỉ dính đúng luật
            đó quay lại được tính vào thống kê — phiếu không bị ghi lại, chỉ đổi
            cách đọc lý do đã lưu từ lúc nộp, nên chọn lại là mọi số về như cũ. */}
        <div className="form-group">
          <label>Bẫy lỗi được áp khi tính thống kê</label>
          <div className="catalog-checkbox-list">
            <label className="catalog-checkbox">
              <input
                type="checkbox"
                checked={rejectSingleAnswer}
                disabled={busy}
                onChange={(event) => setRejectSingleAnswer(event.target.checked)}
              />
              <span>Chọn cùng đáp án</span>
            </label>
            <label className="catalog-checkbox">
              <input
                type="checkbox"
                checked={rejectAttentionCheck}
                disabled={busy}
                onChange={(event) => setRejectAttentionCheck(event.target.checked)}
              />
              <span>Sai câu độ tập trung</span>
            </label>
            <label className="catalog-checkbox">
              <input
                type="checkbox"
                checked={rejectTooFast}
                disabled={busy}
                onChange={(event) => setRejectTooFast(event.target.checked)}
              />
              <span>Làm bài quá nhanh</span>
            </label>
          </div>
          <p className="answer-scale-hint">
            Bỏ chọn luật nào thì phiếu dính lỗi đó được tính vào thống kê trở lại. Phiếu
            đã thu không bị sửa, chọn lại là mọi con số quay về như cũ. Ngưỡng "làm bài
            quá nhanh" cố định 1,5 giây mỗi câu.
          </p>
          {/* Nhãn của từng phiếu nằm trong cơ sở dữ liệu từ lúc nộp và không đổi theo
              ba ô chọn này, nên phải nói rõ Số phiếu hợp lệ ở các bảng thống kê đếm
              theo cách nào — không thì người xem tưởng hai chỗ mâu thuẫn nhau. */}
          <p className="answer-scale-hint">
            <strong>Số phiếu hợp lệ</strong> ở các bảng thống kê là số phiếu thu về không
            dính bẫy lỗi nào đang được chọn. Bỏ chọn cả ba thì mọi phiếu thu về đều được
            tính là hợp lệ.
          </p>
          <p className="answer-scale-hint">
            Nhãn <strong>Hợp lệ / Bị lọc</strong> và lý do bị lọc trong danh sách phiếu của
            từng lớp được lưu lúc sinh viên nộp phiếu, xét đủ cả ba bẫy lỗi, nên không đổi
            theo các ô chọn này. Vì vậy số phiếu hợp lệ ở bảng thống kê có thể khác số
            phiếu mang nhãn Hợp lệ.
          </p>
        </div>

        {/* Nút lưu nằm ngay dưới phần cấu hình, tách khỏi nút Cập nhật ở chân hộp thoại. */}
        <div className="threshold-save-row">
          {hasUnsavedChanges && (
            <span className="answer-scale-hint">
              Có thay đổi chưa lưu. Lưu cấu hình trước rồi mới bấm Cập nhật.
            </span>
          )}
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={busy || !hasUnsavedChanges}
          >
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>

        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleUpdate()}
            disabled={busy || hasUnsavedChanges}
            title={hasUnsavedChanges ? 'Lưu cấu hình trước khi cập nhật' : undefined}
          >
            {updating ? (
              <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
            ) : (
              <Calculator aria-hidden="true" size={16} />
            )}
            {updating ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
