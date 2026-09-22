import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, LoaderCircle, Trash2 } from 'lucide-react';
import { Modal } from '../Modal';
import { ApiError } from '../../services/apiClient';
import { graduationAnalytics2Api } from '../../services/graduationAnalytics2Api';
import type { GraduationManagedPeriod } from '../../types/graduationAnalytics2';

interface GraduationDeletePeriodDialogProps {
  period: GraduationManagedPeriod | null;
  onClose: () => void;
  onDeleted: (period: GraduationManagedPeriod) => void | Promise<void>;
}

const deleteErrorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.errorCode === 'GRADUATION_V3_PERIOD_NOT_FOUND') {
    return 'Đợt này không còn tồn tại hoặc đã được người khác xóa.';
  }
  if (error instanceof ApiError && error.errorCode === 'GRADUATION_QUERY_INVALID') {
    return 'Lý do xóa phải có từ 3 đến 1000 ký tự.';
  }
  return 'Không thể xóa dữ liệu đợt. Vui lòng thử lại.';
};

export function GraduationDeletePeriodDialog({
  period,
  onClose,
  onDeleted,
}: GraduationDeletePeriodDialogProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setError(null);
  }, [period]);

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!period || reason.trim().length < 3) {
      setError('Vui lòng nhập lý do xóa, tối thiểu 3 ký tự.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await graduationAnalytics2Api.deletePeriod(period.periodId, reason.trim());
      await onDeleted(period);
      onClose();
    } catch (caught) {
      setError(deleteErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <Modal
    isOpen={Boolean(period)}
    onClose={close}
    title="Xóa dữ liệu đợt tốt nghiệp"
    size="compact"
  >
    {period && <form className="graduation-delete-dialog" onSubmit={(event) => void submit(event)}>
      <div className="graduation-delete-dialog__warning">
        <AlertTriangle aria-hidden="true" size={20} />
        <div>
          <strong>{period.academicYearLabel} · Đợt {period.roundNumber}</strong>
          <p>
            Dữ liệu đang dùng của {period.studentCount.toLocaleString('vi-VN')} sinh viên sẽ bị gỡ khỏi thống kê.
            Lịch sử tải lên vẫn được lưu để kiểm tra và có thể tải lại đợt này sau đó.
          </p>
        </div>
      </div>

      <label>
        <span className="graduation-delete-dialog__label-text">
          Lý do xóa <span aria-hidden="true">*</span>
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder="Ví dụ: Tải nhầm file của năm học khác"
          disabled={busy}
          required
          autoFocus
        />
      </label>

      {error && <div className="graduation-alert" role="alert">{error}</div>}

      <div className="graduation-delete-dialog__actions">
        <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Hủy</button>
        <button
          type="submit"
          className="btn graduation-delete-dialog__submit"
          disabled={busy || reason.trim().length < 3}
        >
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {busy ? 'Đang xóa...' : 'Xóa dữ liệu đợt'}
        </button>
      </div>
    </form>}
  </Modal>;
}
