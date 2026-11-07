import type { UnitSurveyType } from './unitReports/unitReportModel';

/*
  Sáu trang thống kê có mặt ở cả ba nhóm "Thống kê khảo sát ..." trên sidebar.

  Nhóm Học phần giữ nguyên mã tab cũ (overview, progress, reports...) vì các trang học
  phần tự đọc / ghi đường dẫn theo mã đó và bookmark cũ đang trỏ vào. Hai nhóm CTĐT và
  giảng viên dùng mã có tiền tố loại khảo sát, ví dụ `program-progress`.
*/

export const surveyStatisticsPages = [
  'overview',
  'survey-dashboard',
  'progress',
  'survey-statistics',
  'reports',
  'survey-analysis',
] as const;

export type SurveyStatisticsPage = (typeof surveyStatisticsPages)[number];

export const unitTabPrefix: Record<UnitSurveyType, string> = {
  PROGRAM: 'program',
  LECTURER: 'lecturer',
};

export const unitStatisticsTabId = (surveyType: UnitSurveyType, page: SurveyStatisticsPage) =>
  `${unitTabPrefix[surveyType]}-${page}`;

/**
 * Tách mã tab thống kê CTĐT / giảng viên thành loại khảo sát và trang. Mã khác (kể cả
 * `program-campaigns`, `lecturer-campaigns`) trả về null.
 */
export function parseUnitStatisticsTab(
  tab: string,
): { surveyType: UnitSurveyType; page: SurveyStatisticsPage } | null {
  for (const surveyType of Object.keys(unitTabPrefix) as UnitSurveyType[]) {
    const prefix = `${unitTabPrefix[surveyType]}-`;
    if (!tab.startsWith(prefix)) continue;
    const page = tab.slice(prefix.length) as SurveyStatisticsPage;
    if (surveyStatisticsPages.includes(page)) return { surveyType, page };
  }
  return null;
}
