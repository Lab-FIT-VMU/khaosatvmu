import React, { type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { seesAllData } from '../auth/roles';
import { useScoringThresholds } from '../hooks/useScoringThresholds';
import '../styles/scoring-config-note.css';

/**
 * Dòng thông báo cấu hình tính điểm đang áp: hai ngưỡng lọc lớp. Đặt ngay dưới thanh
 * chọn Học kỳ / Đợt khảo sát của mọi trang thống kê, báo
 * cáo — cấu hình quyết định lớp nào và phiếu nào có mặt trong mọi con số của trang,
 * nên phải in ra chứ không để người xem đoán.
 *
 * Đọc từ cache dùng chung của useScoringThresholds, nên lưu cấu hình ở nút Cập nhật
 * điểm hoặc nhận thông báo người khác vừa đổi là dòng này đổi theo ngay.
 *
 * Tạm thời chỉ hiện cho các vai trò xem được toàn trường: admin hệ thống, admin khảo
 * sát và Ban Giám hiệu.
 */
type ScoringConfigNoteProps = {
  children?: ReactNode;
};

export const ScoringConfigNote: React.FC<ScoringConfigNoteProps> = ({ children }) => {
  const { activeProfile } = useAuth();
  const thresholds = useScoringThresholds();

  if (!seesAllData(activeProfile?.roleCode)) return null;

  return (
    <p className="scoring-config-note">
      <Info aria-hidden="true" />
      <span>
        {children ?? (
          <>
            Số liệu chỉ sử dụng dữ liệu các phiếu của các lớp, bộ môn và khoa/viện hợp lệ
            (đảm bảo hai tiêu chí: tỷ lệ phản hồi ≥{' '}
            <strong>{thresholds.minimumResponseRate}%</strong> và tỷ lệ phiếu hợp lệ ≥{' '}
            <strong>{thresholds.minimumValidRate}%</strong>). Cấu hình này đổi được ở nút Cập
            nhật điểm.
          </>
        )}
      </span>
    </p>
  );
};
