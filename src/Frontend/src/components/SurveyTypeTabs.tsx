import React, { useState } from 'react';
import { BookOpen, GraduationCap, Presentation } from 'lucide-react';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { surveyTypeLabels } from '../services/surveyApi';
import type { SurveyType } from '../types';
import type { UnitSurveyType } from './unitReports/UnitSurveyStatistics';
import '../styles/survey-operations.css';

/*
  Thanh tab theo loại khảo sát cho các trang thống kê. Tab Học phần giữ nguyên trang cũ;
  hai tab còn lại hiện thống kê riêng của CTĐT và khảo sát giảng viên. Hai loại này chỉ
  quản trị toàn trường xem được, nên vai trò khác không thấy thanh tab — trang y như cũ.
*/

const tabIcons: Record<SurveyType, React.ReactNode> = {
  COURSE: <BookOpen className="operation-icon" aria-hidden="true" />,
  PROGRAM: <GraduationCap className="operation-icon" aria-hidden="true" />,
  LECTURER: <Presentation className="operation-icon" aria-hidden="true" />,
};

interface SurveyTypeTabsProps {
  /** Trang của khảo sát học phần, dựng khi đang ở tab Học phần. */
  course: React.ReactNode;
  /** Thống kê của loại CTĐT hoặc giảng viên. */
  renderUnit: (surveyType: UnitSurveyType) => React.ReactNode;
}

export const SurveyTypeTabs: React.FC<SurveyTypeTabsProps> = ({ course, renderUnit }) => {
  const { activeProfile } = useAuth();
  const [activeType, setActiveType] = useState<SurveyType>('COURSE');
  if (!isUnrestrictedRole(activeProfile?.roleCode)) return <>{course}</>;

  return (
    <div className="survey-operations-page">
      <div className="operations-tabs-bar">
        <div className="operations-tabs" role="tablist" aria-label="Loại khảo sát">
          {(['COURSE', 'PROGRAM', 'LECTURER'] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={activeType === type}
              className={`operations-tab${activeType === type ? ' is-active' : ''}`}
              onClick={() => setActiveType(type)}
            >
              {tabIcons[type]}
              {surveyTypeLabels[type]}
            </button>
          ))}
        </div>
      </div>
      {activeType === 'COURSE'
        ? course
        // key theo loại để đổi tab là nạp lại số liệu của loại mới, không giữ đợt của loại cũ.
        : <React.Fragment key={activeType}>{renderUnit(activeType)}</React.Fragment>}
    </div>
  );
};
