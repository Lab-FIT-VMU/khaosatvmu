import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage, type SurveyPublication } from '../services/surveyApi';
import { publishSurveyPublication } from '../hooks/useSurveyPublication';
import { ConfirmDialog } from './Modal';
import '../styles/catalogs.css';

const messageFrom = (error: unknown): string =>
  error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(value));
}

/**
 * Nút Phát hành kết quả của một đợt khảo sát.
 *
 * Trước khi phát hành, chỉ quản trị xem được số liệu; trưởng bộ môn và giảng viên
 * nhận màn trống kèm lời giải thích, kể cả khi đã được mở quyền vào module. Phát hành
 * rồi thì hai vai trò kia xem được đúng phạm vi của mình, và mỗi lần quản trị bấm
 * Cập nhật điểm là họ thấy ngay số mới — không phải phát hành lại.
 *
 * Nút chỉ hiện với quản trị; backend vẫn tự chặn, đây chỉ để người khác khỏi bấm rồi
 * ăn lỗi. Phát hành đòi đợt đã hết thời gian thu phiếu.
 *
 * Đã phát hành thì nút Cập nhật điểm bị khoá; thu hồi thì mở lại. Cả hai chiều đều qua
 * hộp xác nhận.
 */
export const PublishResultsButton: React.FC<{
  semesterSurveyId: number | string | null | undefined;
  /** Chạy sau khi đổi trạng thái, để trang nạp lại số liệu. */
  onChanged?: () => void | Promise<void>;
}> = ({ semesterSurveyId, onChanged }) => {
  const { activeProfile } = useAuth();
  const canPublish = isUnrestrictedRole(activeProfile?.roleCode);

  const surveyId = Number(semesterSurveyId) || 0;
  const [state, setState] = useState<SurveyPublication | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    if (!surveyId) {
      setState(null);
      return;
    }
    try {
      setState(await surveyApi.surveyPublication(surveyId));
    } catch {
      // Không đọc được trạng thái thì ẩn nút, đừng chặn cả trang vì một dòng phụ.
      setState(null);
    }
  }, [surveyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canPublish || !surveyId || !state) return null;

  const handleClick = async () => {
    const publish = !state.isPublished;

    // Đợt còn đang thu phiếu thì số liệu còn chạy từng ngày. Nút vẫn bấm được để
    // người dùng nhận được lời giải thích, thay vì nút xám không nói gì.
    if (publish && !state.hasEnded) {
      toast.error('Chưa phát hành được', {
        description: 'Đợt khảo sát chưa kết thúc. Chờ hết thời gian thu phiếu rồi phát hành.',
      });
      return;
    }

    setConfirming(true);
  };

  const changePublication = async () => {
    const publish = !state.isPublished;
    setConfirming(false);
    setSaving(true);
    try {
      const next = await surveyApi.setSurveyPublication(surveyId, publish);
      setState(next);
      // Nút Cập nhật điểm trên cùng màn hình khoá / mở lại theo ngay.
      publishSurveyPublication(next);
      toast.success(publish ? 'Đã phát hành kết quả.' : 'Đã thu hồi phát hành.');
      await onChanged?.();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={state.isPublished ? 'btn btn-secondary' : 'btn btn-primary'}
        onClick={() => void handleClick()}
        disabled={saving}
        title={state.isPublished
          ? `Đã phát hành${state.changedAt ? ` lúc ${formatDateTime(state.changedAt)}` : ''}`
            + `${state.changedByName ? ` bởi ${state.changedByName}` : ''}.`
            + ' Bấm để thu hồi.'
          : state.hasEnded
            ? 'Cho quản lý khoa, quản lý bộ môn và giảng viên xem kết quả của đợt này.'
            : 'Đợt chưa kết thúc nên chưa phát hành được.'}
      >
        {saving
          ? <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          : state.isPublished
            ? <Lock className="operation-icon" aria-hidden="true" />
            : <Send className="operation-icon" aria-hidden="true" />}
        {state.isPublished ? 'Thu hồi phát hành' : 'Phát hành kết quả'}
      </button>

      {/* Vẽ thẳng vào body như hộp thoại của nút Cập nhật điểm: nút nằm trong thanh công cụ
          có luật dàn hàng ngang, để trong đó thì hộp xác nhận bị bóp méo. */}
      {createPortal(
        <ConfirmDialog
          isOpen={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => void changePublication()}
          title={state.isPublished ? 'Thu hồi phát hành' : 'Phát hành kết quả'}
          recordName=""
          message={state.isPublished
            ? 'Bạn có chắc muốn thu hồi phát hành kết quả đợt này? Quản lý khoa, quản lý bộ môn và'
              + ' giảng viên sẽ không xem được số liệu của đợt nữa, và nút Cập nhật điểm được mở lại.'
            : 'Phát hành kết quả đợt này? Quản lý khoa, quản lý bộ môn và giảng viên sẽ xem được số'
              + ' liệu trong phạm vi của họ. Sau khi phát hành, nút Cập nhật điểm bị khoá cho tới'
              + ' khi thu hồi.'}
          confirmText={state.isPublished ? 'Thu hồi' : 'Phát hành'}
          confirmVariant={state.isPublished ? 'danger' : 'primary'}
        />,
        document.body,
      )}
    </>
  );
};
