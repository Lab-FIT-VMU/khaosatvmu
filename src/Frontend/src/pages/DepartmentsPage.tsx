import React, { useState } from 'react';
import { FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog, isReadOnlyRole } from '../auth/roles';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { DepartmentImportDialog } from '../components/DepartmentImportDialog';
import { catalogErrorMessage, type CatalogImportResponse } from '../services/catalogApi';
import type { ImportDepartmentRow } from '../utils/departmentImportExcel';
import type { Course, Department, Faculty, Lecturer } from '../types';
import { foldVietnamese } from '../utils/vietnamese';

interface DepartmentsPageProps {
  departments: Department[];
  faculties: Faculty[];
  courses: Course[];
  lecturers: Lecturer[];
  /**
   * Trả về mã lỗi của API, null nếu lưu thành công.
   * editingDepartmentId là mã bộ môn đang sửa (null khi thêm mới);
   * departmentId là mã người dùng nhập, chỉ dùng khi thêm mới.
   */
  onSaveDepartment: (
    editingDepartmentId: number | null,
    departmentId: number,
    departmentName: string,
    facultyId: number | null,
  ) => Promise<string | null>;
  onDeleteDepartment: (departmentId: number) => Promise<string | null>;
  onImportDepartments: (rows: ImportDepartmentRow[]) => Promise<CatalogImportResponse>;
}

interface DepartmentForm {
  departmentId: string;
  departmentName: string;
  facultyId: string;
}

const emptyForm: DepartmentForm = { departmentId: '', departmentName: '', facultyId: '' };

export const DepartmentsPage: React.FC<DepartmentsPageProps> = ({
  departments,
  faculties,
  courses,
  lecturers,
  onSaveDepartment,
  onDeleteDepartment,
  onImportDepartments,
}) => {
  // Thêm và xoá là việc của quản trị; trưởng bộ môn và giảng viên chỉ xem và sửa.
  const { activeProfile } = useAuth();
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);
  // Vai trò chỉ đọc (giảng viên, Ban Giám hiệu) không sửa được gì, nên ẩn cả nút Sửa.
  const readOnly = isReadOnlyRole(activeProfile?.roleCode);
  const [search, setSearch] = useState('');
  // Ô lọc theo khoa/viện đã bỏ khỏi thanh công cụ; cột Khoa/viện vẫn lọc được
  // bằng menu lọc trên chính tiêu đề cột.
  const [facultyFilter] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [toDelete, setToDelete] = useState<Department | null>(null);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);

  const updateForm = (patch: Partial<DepartmentForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const facultyNameOf = (facultyId: number | null) =>
    faculties.find((faculty) => faculty.facultyId === facultyId)?.facultyName ?? '—';
  const courseCountOf = (departmentId: number) =>
    courses.filter((course) => course.departmentId === departmentId).length;
  const lecturerCountOf = (departmentId: number) =>
    lecturers.filter((lecturer) => lecturer.departmentId === departmentId).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
    setIsModalOpen(true);
  };

  const openEdit = (department: Department) => {
    setEditing(department);
    setForm({
      departmentId: String(department.departmentId),
      departmentName: department.departmentName,
      facultyId: department.facultyId === null ? '' : String(department.facultyId),
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.departmentName.trim();
    const id = form.departmentId.trim();

    // Chỉ bắt buộc khi thêm mới; lúc sửa thì mã đã cố định và ô nhập bị khóa.
    if (!editing && !/^\d+$/.test(id)) {
      setValidationError('Mã bộ môn phải là số nguyên dương.');
      return;
    }
    if (!name) {
      setValidationError('Vui lòng nhập tên bộ môn.');
      return;
    }

    setSaving(true);
    const errorCode = await onSaveDepartment(
      editing?.departmentId ?? null,
      Number(id),
      name,
      form.facultyId ? Number(form.facultyId) : null
    );
    setSaving(false);
    if (errorCode) {
      setValidationError(catalogErrorMessage(errorCode));
      return;
    }

    toast.success(editing ? 'Đã cập nhật bộ môn' : 'Đã thêm bộ môn', { description: name });
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const errorCode = await onDeleteDepartment(toDelete.departmentId);
    if (errorCode) {
      toast.error('Không thể xóa bộ môn', { description: catalogErrorMessage(errorCode) });
    } else {
      toast.success('Đã xóa bộ môn', { description: toDelete.departmentName });
    }
    setToDelete(null);
  };

  const handleImport = async (rows: ImportDepartmentRow[]): Promise<CatalogImportResponse> => {
    const result = await onImportDepartments(rows);
    if (result.createdCount > 0) {
      toast.success(`Đã import ${result.createdCount} bộ môn`, {
        description: result.skippedCount > 0 ? `${result.skippedCount} dòng bị bỏ qua` : undefined,
      });
    } else {
      toast.error('Không có dòng nào được thêm', {
        description: `${result.skippedCount} dòng bị bỏ qua`,
      });
    }
    return result;
  };

  const normalized = foldVietnamese(search);
  const filtered = departments.filter((department) => {
    const matchesSearch = !normalized || foldVietnamese(department.departmentName).includes(normalized);
    const matchesFaculty = !facultyFilter || String(department.facultyId) === facultyFilter;
    return matchesSearch && matchesFaculty;
  });

  // Bề rộng theo phần trăm để tỷ lệ giữ nguyên trên mọi cỡ màn hình, thay vì để
  // một cột nuốt hết phần dư như khi trộn pixel với cột không khai bề rộng.
  const columns: Column<Department>[] = [
    {
      key: 'departmentId',
      header: 'Mã bộ môn',
      width: '10%',
      filterValue: (row) => String(row.departmentId),
      numeric: true,
      render: (row) => <span className="catalog-cell-primary">{row.departmentId}</span>,
    },
    {
      key: 'departmentName',
      header: 'Tên bộ môn',
      width: '26%',
      filterValue: (row) => row.departmentName,
      render: (row) => <span className="catalog-cell-primary">{row.departmentName}</span>,
    },
    {
      key: 'facultyId',
      header: 'Khoa/viện',
      width: '28%',
      filterValue: (row) => (row.facultyId === null ? '—' : facultyNameOf(row.facultyId)),
      render: (row) => (row.facultyId === null ? '—' : facultyNameOf(row.facultyId)),
    },
    {
      key: 'courseCount',
      header: 'Số môn học',
      width: '12%',
      filterValue: (row) => String(courseCountOf(row.departmentId)),
      numeric: true,
      render: (row) => (
        <span className="catalog-cell-primary">{courseCountOf(row.departmentId)}</span>
      ),
    },
    {
      key: 'lecturerCount',
      header: 'Số giảng viên',
      width: '14%',
      filterValue: (row) => String(lecturerCountOf(row.departmentId)),
      numeric: true,
      render: (row) => (
        <span className="catalog-cell-primary">{lecturerCountOf(row.departmentId)}</span>
      ),
    },
  ];

  // Bỏ hẳn cả cột cho vai trò chỉ đọc, không để lại một cột trống.
  if (!readOnly) {
    columns.push({
        key: 'actions',
        header: 'Hành động',
        width: '10%',
        render: (row) => (
          <div className="catalog-actions">
            <button
              type="button"
              className="catalog-icon-button"
              onClick={() => openEdit(row)}
              aria-label={`Sửa ${row.departmentName}`}
              title="Sửa"
            >
              <Pencil aria-hidden="true" size={15} />
            </button>
            {canManageCatalog && (
              <button
                type="button"
                className="catalog-icon-button catalog-icon-button--danger"
                onClick={() => setToDelete(row)}
                aria-label={`Xóa ${row.departmentName}`}
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
    <div className="catalog-page">
      <header className="catalog-page-header">
        <div>
          <h2>Danh mục bộ môn</h2>
          <p>Bảng "Departments".</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm nhanh theo tên bộ môn..."
        exportConfig={{
          title: 'DANH SÁCH BỘ MÔN',
          fileName: 'danh-sach-bo-mon',
          breadcrumb: ['Bộ môn'],
        }}
        onAddNew={canManageCatalog ? openCreate : undefined}
        addNewLabel="Thêm bộ môn"
        toolbarActions={(
          <button
            type="button"
            className="btn btn-secondary btn-sm catalog-add-button"
            onClick={() => setIsImportOpen(true)}
          >
            <FileSpreadsheet aria-hidden="true" size={16} />
            <span>Import Excel</span>
          </button>
        )}
        emptyMessage="Chưa có bộ môn nào trong danh mục."
        keyExtractor={(item) => String(item.departmentId)}
        pageSize={20}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa bộ môn' : 'Thêm bộ môn'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="form-group">
            <label htmlFor="department-id">Mã bộ môn</label>
            <input
              id="department-id"
              type="number"
              min={1}
              step={1}
              placeholder="101"
              value={form.departmentId}
              onChange={(event) => updateForm({ departmentId: event.target.value })}
              disabled={editing !== null}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="department-name">Tên bộ môn</label>
            <input
              id="department-name"
              type="text"
              placeholder="Bộ môn Công nghệ Phần mềm"
              value={form.departmentName}
              onChange={(event) => updateForm({ departmentName: event.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="department-faculty">Khoa/viện</label>
            <SearchableSelect
              id="department-faculty"
              value={form.facultyId}
              onChange={(value) => updateForm({ facultyId: value })}
              emptyLabel="Chưa thuộc khoa viện"
              options={faculties.map((faculty) => ({
                value: String(faculty.facultyId),
                label: faculty.facultyName,
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

      <DepartmentImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        faculties={faculties}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa bộ môn?"
        recordName={toDelete?.departmentName ?? ''}
        confirmText="Xóa"
      />
    </div>
  );
};
