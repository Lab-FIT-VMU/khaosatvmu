/*
  Kiểu dữ liệu báo cáo phân tích điểm học phần (khớp CourseGradeAnalysisContracts.cs và
  GradeAnalysisThresholdContracts.cs). Phần "data" là bản ghi của bộ tính (xu_ly), giữ nguyên tên
  trường tiếng Việt viết tắt như bản audit (i1, i2, tau_x, icc_x, co, od…).
*/
import type { GradeAnalysisRun } from './courseGrades';

export type ViewLevel = 'full' | 'unit';

/** Số tổng toàn trường của một kỳ (tong). */
export interface TermSummary {
  so_hp: number;
  so_lop: number;
  so_lop_tk: number;
  luot_sv: number;
  q1: number;
  q2: number;
  q3: number | null;
  q1_mat_tc: number;
  i1: number | null;
  i2: number | null;
  i5: number | null;
  i6: number | null;
  so_hp_co: number;
  so_hp_od?: Record<string, number>;
  i9?: {
    so_hp: number;
    tau_x: number | null;
    icc_x: number | null;
    ty_le_h1: number | null;
    tau_y: number | null;
    icc_y: number | null;
    ty_le_h2: number | null;
  };
}

export interface AnalysisTerm {
  semesterId: number;
  termCode: string;
  label: string;
  summary: TermSummary | null;
}

export interface AnalysisUnit {
  id: number;
  name: string;
  facultyId: number | null;
}

export interface RepetitionCount {
  semesterId: number;
  pairCount: number;
  pairsByMarker: Record<string, number>;
  ongoingByMarker: Record<string, number>;
}

export interface CrossTerm {
  ky: string[];
  semester_by_ky: Record<string, number>;
  co_hp: Record<string, Record<string, string[]>>;
  de_thi: Record<string, Record<string, number>>;
  de_thi_lech: Record<string, Record<string, { lech: number; ky_truoc: string; h6: boolean }>>;
  g1_ngau_nhien: Record<string, number | null>;
}

export interface AnalysisOverview {
  viewLevel: ViewLevel;
  scopeFacultyId: number | null;
  scopeDepartmentId: number | null;
  runId: number | null;
  finishedAtUtc: string | null;
  thresholdVersion: number | null;
  thresholds: Record<string, number | boolean | string[]> | null;
  terms: AnalysisTerm[];
  faculties: AnalysisUnit[];
  departments: AnalysisUnit[];
  crossTerm: CrossTerm | null;
  repetition: RepetitionCount[];
  latestRun: GradeAnalysisRun | null;
  /** Học phần có kết quả ở bất kỳ kỳ nào trong phạm vi (tên, đơn vị theo kỳ gần nhất có mở). */
  courses: { baseCourseCode: string; name: string; departmentId: number | null; facultyId: number | null }[];
}

/** Bản ghi học phần (hp) của bộ tính. */
export interface CourseData {
  ma: string;
  ten: string;
  bm: string;
  khoa: string;
  so_lop: number;
  so_lop_tk: number;
  du_dk: boolean;
  n_diem: number;
  n_p: number;
  hai_he: boolean;
  i1?: number | null;
  i2?: number | null;
  r?: number | null;
  x_tb?: number | null;
  y_tb?: number | null;
  tau_x?: number | null;
  icc_x?: number | null;
  tau_y?: number | null;
  icc_y?: number | null;
  co: string[];
  od?: string[];
  cdl?: string[];
  /** Tổng các lớp đưa vào thống kê (API thêm): mất tư cách, số SV có điểm, r từng lớp. */
  lop_tk?: { n_mat: number; n_diem: number; r: number[] };
  [key: string]: unknown;
}

export interface AnalysisCourse {
  baseCourseCode: string;
  departmentId: number | null;
  facultyId: number | null;
  flags: string[];
  stableStates: string[];
  data: CourseData;
}

/** Bản ghi lớp (lop) của bộ tính. */
export interface SectionData {
  ma: string;
  goc: string;
  nhom: string;
  ten: string;
  si_so: number;
  n_diem: number;
  n_p: number;
  tk: boolean;
  tct?: boolean;
  i1?: number | null;
  i2?: number | null;
  x_tb?: number | null;
  y_tb?: number | null;
  i5?: number | null;
  r?: number | null;
  i7?: number | null;
  i7_lo?: number | null;
  i7_hi?: number | null;
  i7_q?: number | null;
  i8?: number | null;
  i8_lo?: number | null;
  i8_hi?: number | null;
  i8_q?: number | null;
  dh: string[];
  [key: string]: unknown;
}

/** Hồ sơ một lớp (bộ luật E). */
export interface SectionProfile {
  tieu_de?: string[];
  b1: string[];
  b1_trong?: string | null;
  /** Mỗi dòng: [chỉ số, của lớp, của học phần, khoảng các lớp, nhận xét]. */
  b2: string[][];
  b3: string[];
  b3_chuoi?: { ky: string[]; nhan: string[]; gt: number[] } | null;
  b4: string[];
  b4_ma: string[];
  luu_y?: string;
}

export interface AnalysisSection {
  courseSectionId: number;
  baseCourseCode: string;
  lecturerId: number | null;
  lecturerName: string | null;
  departmentId: number | null;
  facultyId: number | null;
  includedInStats: boolean;
  markers: string[];
  data: SectionData;
  profile: SectionProfile | null;
}

export interface LecturerCourseData {
  goc: string;
  ten: string;
  ky_day: string[];
  i7: Record<string, number>;
  dh: Record<string, string[]>;
  g1_ky?: Record<string, Record<string, { ky: string[]; dang: boolean }>>;
  theo_ky?: Record<string, { xu_huong: string; cung_chieu: boolean; tuong_duong: boolean }>;
}

export interface AnalysisLecturerCourse {
  lecturerId: number;
  lecturerName: string | null;
  baseCourseCode: string;
  departmentId: number | null;
  facultyId: number | null;
  data: LecturerCourseData;
}

export interface ThresholdItem {
  code: string;
  groupCode: string;
  groupName: string;
  displayName: string;
  description: string | null;
  ruleReference: string | null;
  valueType: 'integer' | 'decimal' | 'boolean' | 'text_list';
  numericValue: number | null;
  booleanValue: boolean | null;
  textListValue: string[] | null;
  defaultNumericValue: number | null;
  defaultBooleanValue: boolean | null;
  defaultTextListValue: string[] | null;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  sortOrder: number;
  version: number;
  updatedAtUtc: string;
}

export interface ThresholdSet {
  version: number;
  canEdit: boolean;
  thresholds: ThresholdItem[];
}

export interface ThresholdSaveResult {
  version: number;
  changedCount: number;
  queuedRun: GradeAnalysisRun | null;
}
