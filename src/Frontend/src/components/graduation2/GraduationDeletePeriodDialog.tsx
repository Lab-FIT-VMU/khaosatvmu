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
  return 'Không thể xóa dữ liệu đợt. Vui lòng thử lại.';
};

export function GraduationDeletePeriodDialog({
  period,
  onClose,
  onDeleted,
}: GraduationDeletePeriodDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [period]);

  const close = () => {
    if (!busy) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!period) return;

    setBusy(true);
    setError(null);
    try {
      await graduationAnalytics2Api.deletePeriod(period.periodId);
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
            Toàn bộ dữ liệu đã import của {period.studentCount.toLocaleString('vi-VN')} sinh viên trong đợt này sẽ bị xóa vĩnh viễn khỏi thống kê.
          </p>
        </div>
      </div>

      {error && <div className="graduation-alert" role="alert">{error}</div>}

      <div className="graduation-delete-dialog__actions">
        <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>Hủy</button>
        <button
          type="submit"
          className="btn graduation-delete-dialog__submit"
          disabled={busy}
        >
          {busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {busy ? 'Đang xóa...' : 'Xóa dữ liệu đợt'}
        </button>
      </div>
    </form>}
  </Modal>;
}
