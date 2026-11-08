/*
  Kiểu dữ liệu của mục "Phân tích điểm học phần → Tải lên dữ liệu điểm".
  Khớp Application/CourseGrades/CourseGradeContracts.cs bên backend.
  Không có kiểu nào chứa dòng điểm của từng sinh viên: API chỉ trả số đếm và mã lớp.
*/

export interface CourseGradeRuleCount {
  rule: string;
  description: string;
  count: number;
}

export interface CourseGradeMissingSection {
  courseCode: string;
  sectionName: string | null;
  courseName: string | null;
  rowCount: number;
}

export interface CourseGradeImportPreview {
  semesterId: number;
  semesterLabel: string;
  fileName: string;
  sheetName: string;
  fileHash: string;
  sourceRowCount: number;
  usableRowCount: number;
  matchedRowCount: number;
  studentCount: number;
  newStudentCount: number;
  excludedRows: CourseGradeRuleCount[];
  missingSectionCount: number;
  missingSectionRowCount: number;
  missingSections: CourseGradeMissingSection[];
  sectionsWithoutGradesCount: number;
  sectionsWithoutGrades: string[];
  warnings: string[];
  /** Lần nạp đang dùng của kỳ; có giá trị nghĩa là đang nạp lại và phải nhập lý do. */
  activeRevisionId: number | null;
}

export interface CourseGradeImportResult {
  revisionId: number;
  revisionNumber: number;
  semesterId: number;
  importedRowCount: number;
  skippedRowCount: number;
  createdStudentCount: number;
  analysisRunId: number;
}

export interface CourseGradeSemester {
  semesterId: number;
  semesterLabel: string;
  revisionId: number;
  revisionNumber: number;
  originalFileName: string;
  sourceRowCount: number;
  importedRowCount: number;
  skippedRowCount: number;
  importedAtUtc: string;
  importedByName: string;
}

export type GradeAnalysisRunStatus = 'Queued' | 'Running' | 'Succeeded' | 'Failed';

export interface GradeAnalysisRun {
  runId: number;
  status: GradeAnalysisRunStatus;
  trigger: string;
  semesterIds: number[];
  thresholdVersion: number;
  requestedAtUtc: string;
  startedAtUtc: string | null;
  finishedAtUtc: string | null;
  errorMessage: string | null;
  isCurrent: boolean;
}
