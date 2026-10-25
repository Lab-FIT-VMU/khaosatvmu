import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSemester } from '../../context/semesterContext';
import { ApiError } from '../../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../../services/surveyApi';
import type {
  FacultyOverview,
  QuestionRating,
  SemesterSurvey,
  SurveyType,
  UnitReportQuestion,
  UnitReportRow,
  UnitSurveyReport,
} from '../../types';

/*
  Phần dữ liệu dùng chung của các trang thống kê CTĐT / giảng viên: nạp báo cáo của đợt
  đang chọn, và các phép tính mà trang học phần làm ở backend nhưng hai loại này làm ngay
  trên số liệu sống (đánh số câu, Z-score, số đơn vị cảnh báo, điểm theo mục).
*/

export type UnitSurveyType = Exclude<SurveyType, 'COURSE'>;

/** Danh từ đơn vị, thay cho "lớp" / "lớp học phần" ở trang học phần. */
export const unitNounOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'khoá ngành',
  LECTURER: 'khoa / viện',
};

/** Tiêu đề cột đơn vị. */
export const unitHeaderOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'Khoá ngành',
  LECTURER: 'Khoa / Viện',
};

/** Tên người trả lời, cho các câu chữ kiểu "Ý kiến khác do ... nhập". */
export const respondentNounOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'người học',
  LECTURER: 'giảng viên',
};

export function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

export interface UnitReportState {
  surveys: SemesterSurvey[];
  surveysLoading: boolean;
  selectedId: string;
  setSelectedId: (id: string) => void;
  report: UnitSurveyReport | null;
  loading: boolean;
  error: string | null;
}

/** Đợt của loại đang xem trong học kỳ làm việc, và báo cáo của đợt đang chọn. */
export function useUnitSurveyReport(surveyType: UnitSurveyType): UnitReportState {
  const { activeSemesterId } = useSemester();
  const [surveys, setSurveys] = useState<SemesterSurvey[]>([]);
  const [surveysLoading, setSurveysLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState<UnitSurveyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSurveys([]);
    setReport(null);
    if (!activeSemesterId) {
      setSelectedId('');
      return;
    }
    const controller = new AbortController();
    setSurveysLoading(true);
    surveyApi.semesterSurveys(activeSemesterId, controller.signal, surveyType)
      .then((next) => {
        setSurveys(next);
        // Giữ đợt đang chọn nếu còn trong danh sách, không thì lấy đợt mới nhất. CỐ Ý không
        // dùng selectAvailableSemesterSurveyId: hàm đó ghi đợt vào ô nhớ dùng chung của các
        // trang học phần, ghi mã đợt CTĐT vào đó là trang học phần mở nhầm đợt CTĐT.
        setSelectedId((current) =>
          next.some((survey) => String(survey.semesterSurveyId) === current)
            ? current
            : next[0] ? String(next[0].semesterSurveyId) : '');
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSurveysLoading(false);
      });
    return () => controller.abort();
  }, [activeSemesterId, surveyType]);

  const load = useCallback((id: string, signal: AbortSignal) => {
    setLoading(true);
    surveyApi.unitSurveyReport(Number(id), signal)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!signal.aborted) {
          setReport(null);
          setError(messageFrom(loadError));
        }
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    setReport(null);
    if (!selectedId) return;
    const controller = new AbortController();
    load(selectedId, controller.signal);
    return () => controller.abort();
  }, [selectedId, load]);

  return { surveys, surveysLoading, selectedId, setSelectedId, report, loading, error };
}

// ------------------------------------------------------------------ Câu hỏi

/**
 * Câu có điểm, đánh số C1, C2… liền nhau như bảng dữ liệu học phần: câu bẫy và câu tự
 * nhập không được đánh số nên bảng không nhảy cóc số câu.
 */
export interface ScoredQuestion extends UnitReportQuestion {
  /** Số thứ tự C chỉ đếm câu có điểm. */
  columnOrder: number;
}

export function scoredQuestionsOf(report: UnitSurveyReport): ScoredQuestion[] {
  return report.questions
    .filter((question) => question.isScored)
    .map((question, index) => ({ ...question, columnOrder: index + 1 }));
}

/** Số câu bẫy của bộ. */
export function attentionCheckCountOf(report: UnitSurveyReport): number {
  return report.questions.filter((question) => question.isAttentionCheck).length;
}

/** Mục của bộ câu hỏi kèm số câu có điểm, cho bộ chọn "Tính điểm và Z-Score theo". */
export interface QuestionSectionOption {
  sectionId: number;
  sectionName: string;
  questionIds: number[];
}

export function questionSectionsOf(report: UnitSurveyReport): QuestionSectionOption[] {
  const sections = new Map<number, QuestionSectionOption>();
  for (const question of report.questions) {
    if (!question.isScored) continue;
    const section = sections.get(question.sectionId)
      ?? { sectionId: question.sectionId, sectionName: question.sectionName, questionIds: [] };
    section.questionIds.push(question.questionId);
    sections.set(question.sectionId, section);
  }
  return [...sections.values()];
}

/**
 * Điểm của một đơn vị chỉ gộp các câu của một mục: tổng (điểm câu × số lượt trả lời) chia
 * tổng số lượt trả lời — cùng công thức điểm mục của trang học phần.
 */
export function sectionScoreOf(row: UnitReportRow, questionIds: readonly number[]): number | null {
  let weighted = 0;
  let count = 0;
  for (const score of row.questionScores) {
    if (!questionIds.includes(score.questionId)) continue;
    weighted += score.averageScore * score.answerCount;
    count += score.answerCount;
  }
  return count === 0 ? null : weighted / count;
}

// ---------------------------------------------------------------- Thống kê

export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Độ lệch chuẩn mẫu (chia n − 1), như trang Phân tích chuyên sâu. Dưới hai giá trị thì null. */
export function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values)!;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function zScore(value: number, average: number | null, deviation: number | null): number | null {
  return average === null || deviation === null || deviation === 0 ? null : (value - average) / deviation;
}

/**
 * Số đơn vị cảnh báo của từng câu: đơn vị được tính điểm chấm câu đó thấp hơn trung bình
 * của chính câu đó từ 1 độ lệch chuẩn trở lên — cùng định nghĩa "lớp cảnh báo" của trang
 * Tổng quan khảo sát học phần.
 */
export function questionWarningCounts(report: UnitSurveyReport): Map<number, number> {
  const counts = new Map<number, number>();
  const scoredRows = report.units.filter((row) => row.isScored);
  for (const question of report.questions) {
    if (!question.isScored) continue;
    const values = scoredRows
      .map((row) => row.questionScores.find((score) => score.questionId === question.questionId))
      .filter((score) => score !== undefined && score.answerCount > 0)
      .map((score) => score!.averageScore);
    const average = mean(values);
    const deviation = sampleStandardDeviation(values);
    counts.set(
      question.questionId,
      average === null || deviation === null
        ? 0
        : values.filter((value) => value <= average - deviation).length,
    );
  }
  return counts;
}

// ------------------------------------------- Chuyển sang kiểu của biểu đồ dùng chung

/**
 * Dữ liệu theo khoa cho FacultyScoreChart / FacultyCompletionChart của trang học phần.
 * CTĐT không có sĩ số nên `targetResponses` bằng số phiếu đã thu và `completionRate` là 0;
 * trang CTĐT không dựng biểu đồ tỷ lệ hoàn thành.
 */
export function toFacultyOverviews(report: UnitSurveyReport): FacultyOverview[] {
  return report.faculties
    .filter((group) => group.averageScore !== null)
    .map((group, index) => ({
      facultyId: Number(group.key) || -(index + 1),
      facultyName: group.name,
      departmentCount: 0,
      sectionCount: group.scoredUnitCount,
      targetResponses: group.targetCount ?? group.responseCount,
      responseCount: group.responseCount,
      completionRate: group.responseRate ?? 0,
      averageScore: group.averageScore ?? 0,
    }));
}

/** Dữ liệu tỷ lệ phản hồi theo khoa — gồm cả khoa chưa có điểm. Chỉ dùng cho khảo sát giảng viên. */
export function toFacultyCompletion(report: UnitSurveyReport): FacultyOverview[] {
  return report.faculties.map((group, index) => ({
    facultyId: Number(group.key) || -(index + 1),
    facultyName: group.name,
    departmentCount: 0,
    sectionCount: group.unitCount,
    targetResponses: group.targetCount ?? 0,
    responseCount: group.responseCount,
    completionRate: group.responseRate ?? 0,
    averageScore: group.averageScore ?? 0,
  }));
}

/** Câu có điểm theo kiểu QuestionRating cho WeakestQuestionsPanel / SchoolCriteriaChart. */
export function toQuestionRatings(report: UnitSurveyReport): QuestionRating[] {
  return scoredQuestionsOf(report)
    .filter((question) => question.averageScore !== null)
    .map((question) => ({
      questionId: question.questionId,
      questionOrder: question.columnOrder,
      questionText: question.questionText,
      averageScore: question.averageScore ?? 0,
      totalAnswers: question.answerCount,
      optionDistribution: question.distribution.map((item) => ({
        value: item.value,
        displayText: item.displayText,
        count: item.count,
        percentage: question.answerCount === 0 ? 0 : (item.count / question.answerCount) * 100,
      })),
      scaleKind: 'Options',
      answerScaleName: '',
      textAnswers: null,
    }));
}

/** Số phiếu hợp lệ của các đơn vị được tính điểm — mẫu số của điểm tiêu chí. */
export function scoredValidResponseCountOf(report: UnitSurveyReport): number {
  return report.units.filter((row) => row.isScored).reduce((sum, row) => sum + row.validResponseCount, 0);
}

/** Tên đơn vị đầy đủ: CTĐT ghép mã khoá ngành và tên ngành, khảo sát giảng viên là tên khoa. */
export function unitTitleOf(row: Pick<UnitReportRow, 'unitCode' | 'unitName'>, surveyType: UnitSurveyType): string {
  return surveyType === 'PROGRAM' ? `${row.unitCode} – ${row.unitName}` : row.unitName;
}

/** Danh sách học kỳ cho ô chọn của thanh công cụ. */
export function useSemesterOptions() {
  const { academicYears } = useSemester();
  return useMemo(
    () =>
      academicYears.flatMap((year) =>
        year.semesters.map((semester) => ({
          value: String(semester.semesterId),
          label: `${semester.semesterName} · ${year.academicYearName}`,
        })),
      ),
    [academicYears],
  );
}
