import React, { useState } from 'react';
import { QuestionAnalysisChart, type QuestionAnalysisChartProps } from './QuestionAnalysisChart';
import type { QuestionAnalysisSectionScore } from '../types';

/*
  Phần "Phân tích kết quả theo câu hỏi" chia ba tab: toàn bài, mục học phần, mục
  giảng viên. Lớp xử lý TẠM theo danh mục mục cố định (SurveySectionCatalog bên
  backend): bộ đề gộp ba mục vào một bài nên cần xem riêng từng mục.

  Ba tab cùng một bố cục, chỉ khác tập câu và điểm trung bình trên hàng tiêu đề.
  Câu bẫy đã bị backend loại từ trước nên không tab nào có. Mục cơ sở vật chất tạm
  chưa cần xem nên chưa có tab; thêm lại chỉ là thêm một dòng vào `tabs`.
*/

type TabId = 'all' | 'COURSE_CONTENT' | 'LECTURER';

const tabs: { id: TabId; label: string; averageLabel: string }[] = [
  { id: 'all', label: 'Toàn bài', averageLabel: 'ĐTB toàn bài' },
  { id: 'COURSE_CONTENT', label: 'Học phần', averageLabel: 'ĐTB mục học phần' },
  { id: 'LECTURER', label: 'Giảng viên', averageLabel: 'ĐTB mục giảng viên' },
];

export interface QuestionAnalysisTabsProps extends QuestionAnalysisChartProps {
  /** Điểm từng mục do API tính sẵn, cùng công thức với trang Thống kê theo mục. */
  sectionScores?: QuestionAnalysisSectionScore[] | null;
}

export const QuestionAnalysisTabs: React.FC<QuestionAnalysisTabsProps> = ({
  questions,
  overallAverageScore,
  sectionScores,
  ...chartProps
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('all');

  const allQuestions = questions ?? [];
  const questionsOf = (tab: TabId) =>
    tab === 'all' ? allQuestions : allQuestions.filter((question) => question.sectionKey === tab);

  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  // Tab mục lấy điểm của mục do API gộp có trọng số, không lấy trung bình cộng các cột.
  const averageScore =
    activeTab === 'all'
      ? overallAverageScore
      : sectionScores?.find((item) => item.sectionKey === activeTab)?.averageScore ?? undefined;

  return (
    <div className="question-analysis-tabs">
      <div
        className="reports-analysis-tabs"
        role="tablist"
        aria-label="Chọn nhóm câu hỏi"
        style={{ marginBottom: 8 }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={tab.id === activeTab ? 'is-active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span>{questionsOf(tab.id).length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={active.label}>
        <QuestionAnalysisChart
          // Dựng lại biểu đồ khi đổi tab để không giữ cột đang rê chuột của tab trước.
          key={activeTab}
          {...chartProps}
          questions={questionsOf(activeTab)}
          overallAverageScore={averageScore}
          averageLabel={active.averageLabel}
        />
      </div>
    </div>
  );
};
