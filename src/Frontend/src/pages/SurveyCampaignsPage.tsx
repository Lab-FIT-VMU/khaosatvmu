import React, { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Presentation } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { surveyTypeLabels } from '../services/surveyApi';
import type { SurveyType } from '../types';
import { CourseSurveysPage } from './CourseSurveysPage';
import { UnitSurveysPage } from './UnitSurveysPage';
import '../styles/survey-operations.css';

/*
  Danh sách đợt khảo sát của cả ba loại trên MỘT mục menu. Loại đã chọn ngay ở bước đầu
  hộp thoại tạo đợt, nên menu không cần chia nhóm theo loại; ở đây chỉ còn thanh tab để
  xem đợt của từng loại. Tạo xong một đợt loại khác thì tự chuyển sang tab của loại đó.
*/

const tabIcons: Record<SurveyType, React.ReactNode> = {
  COURSE: <BookOpen className="operation-icon" aria-hidden="true" />,
  PROGRAM: <GraduationCap className="operation-icon" aria-hidden="true" />,
  LECTURER: <Presentation className="operation-icon" aria-hidden="true" />,
};

interface SurveyCampaignsPageProps {
  /** Tab mở sẵn; link cũ của trang đợt CTĐT / giảng viên mở thẳng vào tab đó. */
  initialSurveyType?: SurveyType;
  onOpenSurveyReport?: (courseSectionSurveyId: number) => void;
  onOpenClasses?: () => void;
}

export const SurveyCampaignsPage: React.FC<SurveyCampaignsPageProps> = ({
  initialSurveyType = 'COURSE',
  onOpenSurveyReport,
  onOpenClasses,
}) => {
  // Đợt CTĐT và giảng viên chỉ quản trị toàn trường thao tác được, các vai trò khác chỉ
  // thấy tab học phần — tức là y như trước khi có ba loại.
  const { activeProfile } = useAuth();
  const canSeeOtherTypes = isUnrestrictedRole(activeProfile?.roleCode);
  const tabs: SurveyType[] = canSeeOtherTypes ? ['COURSE', 'PROGRAM', 'LECTURER'] : ['COURSE'];

  const [activeType, setActiveType] = useState<SurveyType>(initialSurveyType);
  useEffect(() => {
    setActiveType(initialSurveyType);
  }, [initialSurveyType]);
  const visibleType = tabs.includes(activeType) ? activeType : 'COURSE';

  return (
    <div className="survey-operations-page">
      {tabs.length > 1 && (
        <div className="operations-tabs-bar">
          <div className="operations-tabs" role="tablist" aria-label="Loại khảo sát">
            {tabs.map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={visibleType === type}
                className={`operations-tab${visibleType === type ? ' is-active' : ''}`}
                onClick={() => setActiveType(type)}
              >
                {tabIcons[type]}
                {surveyTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>
      )}

      {visibleType === 'COURSE' ? (
        <CourseSurveysPage
          onOpenSurveyType={setActiveType}
          onOpenSurveyReport={onOpenSurveyReport}
          onOpenClasses={onOpenClasses}
        />
      ) : (
        // key theo loại để đổi tab là dựng lại trang, không mang danh sách đợt của loại cũ sang.
        <UnitSurveysPage key={visibleType} surveyType={visibleType} onOpenSurveyType={setActiveType} />
      )}
    </div>
  );
};
