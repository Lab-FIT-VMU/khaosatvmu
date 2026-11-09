/* Danh mục sinh viên (khớp Application/Students/StudentContracts.cs). */

export interface Student {
  studentId: number;
  studentCode: string;
  fullName: string;
  administrativeClassCode: string | null;
  cohortId: number | null;
  cohortName: string | null;
  majorId: number | null;
  majorName: string | null;
  facultyId: number | null;
  facultyName: string | null;
  email: string | null;
  phoneNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  studyStatus: string | null;
}

export interface StudentCohortCount {
  cohortId: number | null;
  cohortName: string;
  studentCount: number;
}

export interface StudentList {
  canImport: boolean;
  cohorts: StudentCohortCount[];
  students: Student[];
}

/** Một dòng của file danh sách sinh viên, gửi lên server để kiểm tra. */
export interface StudentImportRow {
  sheetName: string | null;
  rowNumber: number;
  studentCode: string;
  fullName: string;
  administrativeClassCode: string | null;
  cohort: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phoneNumber: string | null;
  studyStatus: string | null;
}

export interface StudentImportIssue {
  sheetName: string | null;
  rowNumber: number;
  studentCode: string | null;
  message: string;
}

export interface StudentImportPreview {
  rowCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  renamedCount: number;
  withoutCohortCount: number;
  cohorts: { cohortName: string; rowCount: number; newCount: number; updatedCount: number }[];
  errors: StudentImportIssue[];
  warnings: StudentImportIssue[];
  previewHash: string;
}

export interface StudentImportResult {
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  skippedCount: number;
}
