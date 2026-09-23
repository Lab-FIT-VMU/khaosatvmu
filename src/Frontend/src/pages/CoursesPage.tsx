import React, { useState } from 'react';
import { FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { CourseImportDialog } from '../components/CourseImportDialog';
import {
  catalogErrorMessage,
  type CatalogImportResponse,
  type SaveCoursePayload,
} from '../services/catalogApi';
import type { ImportCourseRow } from '../utils/courseImportExcel';
import type { Course, CourseType, Department, Faculty } from '../types';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog, isReadOnlyRole, isUnrestrictedRole } from '../auth/roles';
import { foldVietnamese } from '../utils/vietnamese';

interface CoursesPageProps {
  courses: Course[];
  faculties: Faculty[];
  departments: Department[];
  /** Trả về mã lỗi của API, null nếu lưu thành công. */
  onSaveCourse: (courseId: number | null, course: SaveCoursePayload) => Promise<string | null>;
  onDeleteCourse: (courseId: number) => Promise<string | null>;
  onImportCourses: (rows: ImportCourseRow[]) => Promise<CatalogImportResponse>;
}

interface CourseForm {
  courseCode: string;
  courseName: string;
  credits: string;
  /** Chuỗi rỗng nghĩa là chưa xác định, gửi lên API thành null. */
  courseType: CourseType | '';
  departmentId: string;
  facultyId: string;
  prerequisiteCourseId: string;
}

const emptyForm: CourseForm = {
  courseCode: '',
  courseName: '',
  credits: '3',
  courseType: '',
  departmentId: '',
  facultyId: '',
  prerequisiteCourseId: '',
};

export const CoursesPage: React.FC<CoursesPageProps> = ({
  courses,
  faculties,
  departments,
  onSaveCourse,
  onDeleteCourse,
  onImportCourses,
}) => {
  const [search, setSearch] = useState('');
  // Xoá học phần và import chỉ dành cho quản trị; ẩn nút cho gọn, chặn thật ở backend.
  const { activeProfile } = useAuth();
  const canManageAll = isUnrestrictedRole(activeProfile?.roleCode);
  // Thêm và xoá là việc của quản trị; trưởng bộ môn chỉ xem và sửa.
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);
  // Giảng viên chỉ xem các học phần mình có lớp dạy, không sửa gì.
  const readOnly = isReadOnlyRole(activeProfile?.roleCode);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [toDelete, setToDelete] = useState<Course | null>(null);
  const [validationError, setValidationError] = useState('');
  const [form, setForm] = useState<CourseForm>(emptyForm);

  const updateForm = (patch: Partial<CourseForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const facultyNameOf = (facultyId: number | null) =>
    faculties.find((faculty) => faculty.facultyId === facultyId)?.facultyName ?? '—';
  const departmentNameOf = (departmentId: number | null) =>
    departments.find((department) => department.departmentId === departmentId)?.departmentName ?? '—';
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
    setIsModalOpen(true);
  };

  const openEdit = (course: Course) => {
    setEditing(course);
    setForm({
      courseCode: course.courseCode,
      courseName: course.courseName,
      credits: String(course.credits),
      courseType: course.courseType ?? '',
      departmentId: course.departmentId === null ? '' : String(course.departmentId),
      facultyId: course.facultyId === null ? '' : String(course.facultyId),
      prerequisiteCourseId:
        course.prerequisiteCourseId === null ? '' : String(course.prerequisiteCourseId),
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const courseCode = form.courseCode.trim();
    const courseName = form.courseName.trim();
    const credits = Number(form.credits);

    if (!courseCode || !courseName) {
      setValidationError('Vui lòng nhập mã học phần và tên học phần.');
      return;
    }
    if (!Number.isFinite(credits)) {
      setValidationError('Số tín chỉ không hợp lệ.');
      return;
    }

    setSaving(true);
    const errorCode = await onSaveCourse(editing?.courseId ?? null, {
      courseCode,
      courseName,
      credits,
      courseType: form.courseType === '' ? null : form.courseType,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      facultyId: form.facultyId ? Number(form.facultyId) : null,
      prerequisiteCourseId: form.prerequisiteCourseId ? Number(form.prerequisiteCourseId) : null,
    });
    setSaving(false);
    if (errorCode) {
      setValidationError(catalogErrorMessage(errorCode));
      return;
    }

    toast.success(editing ? 'Đã cập nhật học phần' : 'Đã thêm học phần', { description: courseName });
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
  };

  const handleImport = async (rows: ImportCourseRow[]): Promise<CatalogImportResponse> => {
    const result = await onImportCourses(rows);
    if (result.createdCount > 0) {
      toast.success(`Đã import ${result.createdCount} học phần`, {
        description: result.skippedCount > 0 ? `${result.skippedCount} dòng bị bỏ qua` : undefined,
      });
    } else {
      toast.error('Không có dòng nào được thêm', {
        description: `${result.skippedCount} dòng bị bỏ qua`,
      });
    }
    return result;
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const errorCode = await onDeleteCourse(toDelete.courseId);
    if (errorCode) {
      toast.error('Không thể xóa học phần', { description: catalogErrorMessage(errorCode) });
    } else {
      toast.success('Đã xóa học phần', { description: toDelete.courseName });
    }
    setToDelete(null);
  };

  const availableDepartments = form.facultyId
    ? departments.filter((department) => String(department.facultyId) === form.facultyId)
    : departments;

  const normalized = foldVietnamese(search);
  const filtered = courses.filter((course) => {
    const matchesSearch =
      !normalized ||
      foldVietnamese(course.courseName).includes(normalized) ||
      foldVietnamese(course.courseCode).includes(normalized);
    // Lọc theo khoa/viện đã có ngay trên tiêu đề cột, không cần thêm một ô chọn
    // riêng cạnh nút xuất dữ liệu.
    return matchesSearch;
  });

  const columns: Column<Course>[] = [
    {
      key: 'courseCode',
      header: 'Mã học phần',
      width: '12%',
      filterValue: (item) => item.courseCode,
      render: (item) => <span className="catalog-code">{item.courseCode}</span>,
    },
    {
      key: 'courseName',
      header: 'Tên học phần',
      width: '30%',
      filterValue: (item) => item.courseName,
      render: (item) => <span className="catalog-cell-primary">{item.courseName}</span>,
    },
    {
      key: 'credits',
      header: 'Số tín chỉ',
      width: '10%',
      filterValue: (item) => String(item.credits),
      numeric: true,
      render: (item) => <span className="catalog-cell-primary">{item.credits}</span>,
    },
    {
      key: 'departmentId',
      header: 'Bộ môn',
      width: '18%',
      filterValue: (item) => (item.departmentId === null ? '—' : departmentNameOf(item.departmentId)),
      render: (item) => (item.departmentId === null ? '—' : departmentNameOf(item.departmentId)),
    },
    {
      key: 'facultyId',
      header: 'Khoa/viện',
      width: '20%',
      filterValue: (item) => (item.facultyId === null ? '—' : facultyNameOf(item.facultyId)),
      render: (item) => (item.facultyId === null ? '—' : facultyNameOf(item.facultyId)),
    },
  ];

  // Bỏ hẳn cả cột cho vai trò chỉ đọc, không để lại một cột trống.
  if (!readOnly) {
    columns.push({
      key: 'actions',
      header: 'Thao tác',
      width: '10%',
      render: (item) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openEdit(item)}
            aria-label={`Sửa ${item.courseName}`}
            title="Sửa"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          {canManageAll && (
            <button
              type="button"
              className="catalog-icon-button catalog-icon-button--danger"
              onClick={() => setToDelete(item)}
              aria-label={`Xóa ${item.courseName}`}
              title="Xóa"
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          )}
        </div>
      ),
    });
  }

  return (
    <div className="catalog-page catalog-page--wide">
      <header className="catalog-page-header">
        <div>
          <h2>Danh mục học phần</h2>
          <p>Bảng "Courses".</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm mã hoặc tên học phần..."
        exportConfig={{
          title: 'DANH SÁCH HỌC PHẦN',
          fileName: 'danh-sach-hoc-phan',
          breadcrumb: ['Học phần'],
        }}
        onAddNew={canManageCatalog ? openCreate : undefined}
        addNewLabel="Thêm học phần"
        toolbarActions={canManageAll ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm catalog-add-button"
            onClick={() => setIsImportOpen(true)}
          >
            <FileSpreadsheet aria-hidden="true" size={16} />
            <span>Import Excel</span>
          </button>
        ) : undefined}
        emptyMessage="Chưa có học phần nào trong danh mục."
        keyExtractor={(item) => String(item.courseId)}
        pageSize={20}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa học phần' : 'Thêm học phần'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="catalog-form-grid catalog-form-grid--code-name">
            <div className="form-group">
              <label htmlFor="course-code">Mã học phần</label>
              <input
                id="course-code"
                type="text"
                placeholder="19783"
                value={form.courseCode}
                onChange={(event) => updateForm({ courseCode: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="course-name">Tên học phần</label>
              <input
                id="course-name"
                type="text"
                placeholder="Lập trình Web nâng cao"
                value={form.courseName}
                onChange={(event) => updateForm({ courseName: event.target.value })}
                required
              />
            </div>
          </div>

          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="course-credits">Số tín chỉ</label>
              <input
                id="course-credits"
                type="number"
                value={form.credits}
                onChange={(event) => updateForm({ credits: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="course-type">Loại học phần</label>
              <SearchableSelect
                id="course-type"
                value={form.courseType}
                onChange={(value) => updateForm({ courseType: value as CourseType | '' })}
                emptyLabel="Chưa xác định"
                options={[
                  { value: 'Required', label: 'Required — Bắt buộc' },
                  { value: 'Elective', label: 'Elective — Tự chọn' },
                ]}
              />
            </div>
          </div>

          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="course-faculty">Khoa/viện</label>
              <SearchableSelect
                id="course-faculty"
                value={form.facultyId}
                onChange={(value) => updateForm({ facultyId: value, departmentId: '' })}
                emptyLabel="Chưa gán khoa/viện"
                options={faculties.map((faculty) => ({
                  value: String(faculty.facultyId),
                  label: faculty.facultyName,
                }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="course-department">Bộ môn</label>
              <SearchableSelect
                id="course-department"
                value={form.departmentId}
                onChange={(value) => updateForm({ departmentId: value })}
                emptyLabel="Chưa gán bộ môn"
                options={availableDepartments.map((department) => ({
                  value: String(department.departmentId),
                  label: department.departmentName,
                }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="course-prerequisite">Học phần tiên quyết</label>
            <SearchableSelect
              id="course-prerequisite"
              value={form.prerequisiteCourseId}
              onChange={(value) => updateForm({ prerequisiteCourseId: value })}
              emptyLabel="Không có"
              options={courses
                .filter((course) => course.courseId !== editing?.courseId)
                .map((course) => ({
                  value: String(course.courseId),
                  label: `[${course.courseCode}] ${course.courseName}`,
                }))}
            />
          </div>

          <div className="modal-footer catalog-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      <CourseImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        departments={departments}
        faculties={faculties}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa học phần?"
        recordName={toDelete?.courseName ?? ''}
        confirmText="Xóa"
      />
    </div>
  );
};
