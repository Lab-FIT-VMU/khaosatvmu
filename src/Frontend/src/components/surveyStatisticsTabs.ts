import type { UnitSurveyType } from './unitReports/unitReportModel';

/*
  Các trang thống kê của ba loại khảo sát.

  Nhóm Học phần giữ nguyên mã tab cũ (overview, progress, reports...) vì các trang học
  phần tự đọc / ghi đường dẫn theo mã đó và bookmark cũ đang trỏ vào. Hai nhóm CTĐT và
  giảng viên dùng mã có tiền tố loại khảo sát, ví dụ `program-progress`.

  Bảng điều khiển (`overview`) giờ là một mục chung ở đầu sidebar, gộp đợt khảo sát của cả
  ba loại; nó không nằm trong nhóm nào nữa.
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

/**
 * Trang của nhóm CTĐT / giảng viên. Không có Phân tích chuyên sâu. `overview` vẫn giữ để
 * có quyền PROGRAM_DASHBOARD_ACCESS / LECTURER_DASHBOARD_ACCESS: quyền này quyết định đợt
 * của loại đó có hiện trong Bảng điều khiển chung không.
 */
export const unitStatisticsPages = [
  'overview',
  'survey-dashboard',
  'progress',
  'survey-statistics',
  'reports',
] as const satisfies readonly SurveyStatisticsPage[];

export type UnitStatisticsPage = (typeof unitStatisticsPages)[number];

export const unitTabPrefix: Record<UnitSurveyType, string> = {
  PROGRAM: 'program',
  LECTURER: 'lecturer',
};

export const unitStatisticsTabId = (surveyType: UnitSurveyType, page: UnitStatisticsPage) =>
  `${unitTabPrefix[surveyType]}-${page}`;

/**
 * Tách mã tab thống kê CTĐT / giảng viên thành loại khảo sát và trang. Mã khác (kể cả
 * `program-campaigns`, `lecturer-campaigns`) trả về null.
 */
export function parseUnitStatisticsTab(
  tab: string,
): { surveyType: UnitSurveyType; page: UnitStatisticsPage } | null {
  for (const surveyType of Object.keys(unitTabPrefix) as UnitSurveyType[]) {
    const prefix = `${unitTabPrefix[surveyType]}-`;
    if (!tab.startsWith(prefix)) continue;
    const page = tab.slice(prefix.length) as UnitStatisticsPage;
    if (unitStatisticsPages.includes(page)) return { surveyType, page };
  }
  return null;
}

/**
 * Mã tab cũ không còn trang riêng: bảng điều khiển CTĐT / giảng viên đã gộp vào Bảng điều
 * khiển chung, còn Phân tích chuyên sâu của hai loại đó đã bỏ. Bookmark cũ đưa về đây.
 */
export const retiredUnitTabs: ReadonlySet<string> = new Set(
  (Object.keys(unitTabPrefix) as UnitSurveyType[]).flatMap((surveyType) => [
    unitStatisticsTabId(surveyType, 'overview'),
    `${unitTabPrefix[surveyType]}-survey-analysis`,
  ]),
);
