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
 * Hộp thoại cấu hình tính điểm của nút Cập nhật điểm. Bấm Cập nhật thì lưu hai ngưỡng
 * (nếu có đổi) rồi tính điểm luôn theo đúng cấu hình vừa lưu.
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Mở lại hộp thoại thì đọc lại giá trị đang áp, không giữ bản nháp lần trước.
  useEffect(() => {
    if (!isOpen) return;
    setResponseRate(String(current.minimumResponseRate));
    setValidRate(String(current.minimumValidRate));
    setError(null);
  }, [isOpen, current]);

  const hasChanges =
    responseRate !== String(current.minimumResponseRate)
    || validRate !== String(current.minimumValidRate);
  const busy = saving || updating;

  // Tính điểm đọc cấu hình ĐÃ LƯU trên máy chủ, nên phải lưu xong mới tính. Lưu lỗi
  // thì dừng luôn, không tính theo cấu hình cũ.
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const next = {
      minimumResponseRate: Number(responseRate),
      minimumValidRate: Number(validRate),
    };
    const outOfRange = [next.minimumResponseRate, next.minimumValidRate].some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100
    );
    if (outOfRange) {
      setError('Cả hai ngưỡng phải là số trong khoảng 0 đến 100.');
      return;
    }
    setError(null);

    if (hasChanges) {
      setSaving(true);
      try {
        const saved = await surveyApi.updateScoringThresholds(next);
        publishScoringThresholds(saved);
      } catch (caught) {
        setError(messageFrom(caught));
        return;
      } finally {
        setSaving(false);
      }
    }

    if (await onUpdate()) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ngưỡng lọc lớp được tính điểm">
      <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
        {error && <div className="catalog-validation-error" role="alert">{error}</div>}

        <div className="catalog-context-band">
          Một lớp phải qua cả hai tiêu chí thì điểm của nó mới được gộp vào mọi bảng thống
          kê và báo cáo. Chỉnh hai tiêu chí nếu cần rồi bấm <strong>Cập nhật</strong>: hệ
          thống lưu cấu hình và tính lại điểm cho mọi lớp trong đợt.
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

        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
            ) : (
              <Calculator aria-hidden="true" size={16} />
            )}
            {saving ? 'Đang lưu cấu hình...' : updating ? 'Đang cập nhật...' : 'Cập nhật'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
