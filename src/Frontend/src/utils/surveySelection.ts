const ACTIVE_SEMESTER_SURVEY_KEY = 'vmu_active_semester_survey_id';

/** Đợt khảo sát đang làm việc được dùng chung giữa các màn tổng quan, tiến độ và phân tích. */
export function getActiveSemesterSurveyId(): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(ACTIVE_SEMESTER_SURVEY_KEY) ?? '';
}

export function setActiveSemesterSurveyId(value: string | number | null | undefined): void {
  if (typeof window === 'undefined') return;
  const normalized = value === null || value === undefined ? '' : String(value);
  if (normalized) {
    window.localStorage.setItem(ACTIVE_SEMESTER_SURVEY_KEY, normalized);
  } else {
    window.localStorage.removeItem(ACTIVE_SEMESTER_SURVEY_KEY);
  }
}

export function selectAvailableSemesterSurveyId<T extends { semesterSurveyId: number }>(
  surveys: readonly T[],
  preferred?: string | number | null,
): string {
  const candidates = [preferred, getActiveSemesterSurveyId()]
    .filter((value): value is string | number => value !== null && value !== undefined && value !== '')
    .map(String);
  const selected = candidates.find((candidate) =>
    surveys.some((survey) => String(survey.semesterSurveyId) === candidate),
  ) ?? (surveys[0] ? String(surveys[0].semesterSurveyId) : '');
  // Danh sách thường rỗng tạm thời trong lúc đổi trang hoặc đang gọi API. Không
  // xóa lựa chọn đã lưu ở nhịp này, nếu không khi dữ liệu về trang lại chọn đợt đầu.
  if (selected) setActiveSemesterSurveyId(selected);
  return selected;
}
