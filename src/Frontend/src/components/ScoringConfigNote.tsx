import React from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import '../styles/scoring-config-note.css';

/**
 * Dòng thông báo cấu hình tính điểm đang áp: hai ngưỡng lọc lớp và các bẫy lỗi được
 * chọn. Đặt ngay dưới thanh chọn Học kỳ / Đợt khảo sát của mọi trang thống kê, báo
 * cáo — cấu hình quyết định lớp nào và phiếu nào có mặt trong mọi con số của trang,
 * nên phải in ra chứ không để người xem đoán.
 *
 * Đọc từ cache dùng chung của useScoringThresholds, nên lưu cấu hình ở nút Cập nhật
 * điểm hoặc nhận thông báo người khác vừa đổi là dòng này đổi theo ngay.
 *
 * Tạm thời chỉ hiện cho admin hệ thống và admin khảo sát.
 */
export const ScoringConfigNote: React.FC = () => {
  const { activeProfile } = useAuth();
  const thresholds = useScoringThresholds();

  if (!isUnrestrictedRole(activeProfile?.roleCode)) return null;

  // Cùng thứ tự và cùng tên với ba ô chọn trong hộp thoại Cập nhật điểm.
  const selectedTraps = [
    thresholds.rejectSingleAnswer && 'Chọn cùng đáp án',
    thresholds.rejectAttentionCheckFailed && 'Sai câu độ tập trung',
    thresholds.rejectTooFast && 'Làm bài quá nhanh',
  ].filter(Boolean);

  return (
    <p className="scoring-config-note">
      <Info aria-hidden="true" />
      <span>
        Số liệu chỉ gộp lớp qua cả hai tiêu chí: tỷ lệ phản hồi ≥{' '}
        <strong>{thresholds.minimumResponseRate}%</strong> và tỷ lệ phiếu hợp lệ ≥{' '}
        <strong>{thresholds.minimumValidRate}%</strong>.{' '}
        {selectedTraps.length > 0 ? (
          <>
            Bẫy lỗi được chọn: <strong>{selectedTraps.join(', ')}</strong>.
          </>
        ) : (
          <>
            Bẫy lỗi được chọn: <strong>không có</strong>, mọi phiếu thu về đều được tính là
            hợp lệ.
          </>
        )}{' '}
        Cấu hình này đổi được ở nút Cập nhật điểm.
      </span>
    </p>
  );
};
