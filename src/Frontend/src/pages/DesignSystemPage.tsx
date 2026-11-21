import { RotateCcw } from 'lucide-react';
import { DesignSystemView } from '../components/designSystem/DesignSystemView';
import { PageHead } from '../components/courseGrades/courseGradeUi';
import { resetDesignTokens, useDesignTokens, designTokens, isDesignTokenCustom } from '../utils/designTokens';
import '../styles/course-grade-reports.css';
import '../styles/survey-operations.css';
import '../styles/design-system.css';

/*
  Mục "Design System" trên thanh điều hướng: bộ màu chung của hệ thống (bảng thống kê khảo sát
  và Phân tích điểm học phần), quy tắc màu và các thành phần dùng chung. Trước đây trang này nằm
  trong nhóm Phân tích điểm và chỉ để xem; giờ là mục riêng và đổi được màu.
*/
export function DesignSystemPage() {
  useDesignTokens();
  const anyCustom = designTokens.some((token) => isDesignTokenCustom(token.key));

  return (
    <div className="cga-page">
      <PageHead
        crumb="Design System"
        title="Design System"
        description="Bộ màu chung của các bảng thống kê khảo sát và Phân tích điểm học phần. Bấm vào ô màu để đổi — mọi trang đổi theo. Màu chỉ lưu trên trình duyệt của bạn, người khác không bị ảnh hưởng."
        actions={(
          <button type="button" className="btn btn-secondary" disabled={!anyCustom} onClick={() => resetDesignTokens()}>
            <RotateCcw size={16} aria-hidden="true" /> Về mặc định tất cả
          </button>
        )}
      />
      <DesignSystemView />
    </div>
  );
}
