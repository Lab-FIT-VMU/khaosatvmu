import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, Pencil, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { LecturerImportDialog } from '../components/LecturerImportDialog';
import { ApiError } from '../services/apiClient';
import {
  catalogApi,
  catalogErrorMessage,
  type CatalogImportResponse,
  type SaveLecturerPayload,
} from '../services/catalogApi';
import type { ImportLecturerRow } from '../utils/lecturerImportExcel';
import type { Department, Faculty, Lecturer, Position } from '../types';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog, isReadOnlyRole, isUnrestrictedRole } from '../auth/roles';
import { foldVietnamese } from '../utils/vietnamese';

interface LecturersPageProps {
  lecturers: Lecturer[];
  faculties: Faculty[];
  departments: Department[];
  /** Trả về mã lỗi của API, null nếu lưu thành công. */
  onSaveLecturer: (
    lecturerId: number | null,
    lecturer: SaveLecturerPayload,
  ) => Promise<string | null>;
  onDeleteLecturer: (lecturerId: number) => Promise<string | null>;
  onImportLecturers: (rows: ImportLecturerRow[]) => Promise<CatalogImportResponse>;
}

interface LecturerForm {
  fullName: string;
  departmentId: string;
  facultyId: string;
  email: string;
  phoneNumber: string;
  positionId: string;
}

const emptyForm: LecturerForm = {
  fullName: '',
  departmentId: '',
  facultyId: '',
  email: '',
  phoneNumber: '',
  positionId: '',
};

/** Form quản lý chức vụ; positionId null nghĩa là đang thêm mới. */
interface PositionForm {
  positionId: number | null;
  positionName: string;
}

const emptyPositionForm: PositionForm = { positionId: null, positionName: '' };

export const LecturersPage: React.FC<LecturersPageProps> = ({
  lecturers,
  faculties,
  departments,
  onSaveLecturer,
  onDeleteLecturer,
  onImportLecturers,
}) => {
  const [search, setSearch] = useState('');
  // Ô lọc theo khoa/viện đã bỏ khỏi thanh công cụ; cột Khoa/viện vẫn lọc được
  // bằng menu lọc trên chính tiêu đề cột.
  const [facultyFilter] = useState('');
  // Trưởng bộ môn chỉ thấy bộ môn mình nên lọc theo khoa là vô nghĩa, và các thao tác
  // chỉ dành cho quản trị thì ẩn nút đi cho gọn. Chặn thật nằm ở backend.
  const { activeProfile } = useAuth();
  const canManageAll = isUnrestrictedRole(activeProfile?.roleCode);
  // Thêm và xoá là việc của quản trị; trưởng đơn vị chỉ xem và sửa.
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);
  // Ban Giám hiệu xem toàn trường nhưng không sửa được gì, nên giấu cả cột Thao tác.
  const readOnly = isReadOnlyRole(activeProfile?.roleCode);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Lecturer | null>(null);
  const [toDelete, setToDelete] = useState<Lecturer | null>(null);
  const [validationError, setValidationError] = useState('');
  const [form, setForm] = useState<LecturerForm>(emptyForm);

  // ----------------------------------------------------------- Chức vụ
  const [positions, setPositions] = useState<Position[]>([]);
  const [isPositionsOpen, setIsPositionsOpen] = useState(false);
  const [positionForm, setPositionForm] = useState<PositionForm>(emptyPositionForm);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [positionSaving, setPositionSaving] = useState(false);
  const [deletingPositionId, setDeletingPositionId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void catalogApi
      .positions()
      .then((next) => {
        if (active) setPositions(next);
      })
      .catch(() => {
        if (active) setPositionError('Không tải được danh sách chức vụ.');
      });
    return () => {
      active = false;
    };
  }, []);

  const messageFrom = (error: unknown) =>
    error instanceof ApiError ? catalogErrorMessage(error.errorCode) : catalogErrorMessage(null);

  const openPositionCreate = () => {
    setPositionError(null);
    setDeletingPositionId(null);
    setPositionForm(emptyPositionForm);
  };

  const openPositionEdit = (position: Position) => {
    setPositionError(null);
    setDeletingPositionId(null);
    setPositionForm({ positionId: position.positionId, positionName: position.positionName });
  };

  const handleSavePosition = async (event: React.FormEvent) => {
    event.preventDefault();

    const positionName = positionForm.positionName.trim();
    if (!positionName) {
      setPositionError('Vui lòng nhập tên chức vụ.');
      return;
    }

    setPositionSaving(true);
    try {
      if (positionForm.positionId === null) {
        await catalogApi.createPosition(positionName);
      } else {
        await catalogApi.updatePosition(positionForm.positionId, positionName);
      }
      setPositions(await catalogApi.positions());
      toast.success(positionForm.positionId === null ? 'Đã thêm chức vụ' : 'Đã cập nhật chức vụ', {
        description: positionName,
      });
      setPositionForm(emptyPositionForm);
      setPositionError(null);
    } catch (error) {
      setPositionError(messageFrom(error));
    } finally {
      setPositionSaving(false);
    }
  };

  const handleDeletePosition = async (positionId: number) => {
    try {
      await catalogApi.deletePosition(positionId);
      setPositions(await catalogApi.positions());
      toast.success('Đã xóa chức vụ');
      if (positionForm.positionId === positionId) setPositionForm(emptyPositionForm);
    } catch (error) {
      setPositionError(messageFrom(error));
    } finally {
      setDeletingPositionId(null);
    }
  };

  const positionNameOf = (positionId: number | null) =>
    positions.find((position) => position.positionId === positionId)?.positionName ?? '—';

  const updateForm = (patch: Partial<LecturerForm>) => setForm((prev) => ({ ...prev, ...patch }));
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

  const openEdit = (lecturer: Lecturer) => {
    setEditing(lecturer);
    setForm({
      fullName: lecturer.fullName,
      departmentId: lecturer.departmentId === null ? '' : String(lecturer.departmentId),
      facultyId: lecturer.facultyId === null ? '' : String(lecturer.facultyId),
      email: lecturer.email ?? '',
      phoneNumber: lecturer.phoneNumber ?? '',
      positionId: lecturer.positionId === null ? '' : String(lecturer.positionId),
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim();

    if (!fullName) {
      setValidationError('Vui lòng nhập họ và tên.');
      return;
    }

    // Email là bắt buộc: nó vừa là khoá định danh giảng viên, vừa là thứ dùng để
    // tạo tài khoản đăng nhập đi kèm.
    if (!email) {
      setValidationError('Vui lòng nhập email. Giảng viên không có email thì không tạo được tài khoản đăng nhập.');
      return;
    }

    setSaving(true);
    const errorCode = await onSaveLecturer(editing?.lecturerId ?? null, {
      fullName,
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      facultyId: form.facultyId ? Number(form.facultyId) : null,
      email: email || null,
      phoneNumber: form.phoneNumber.trim() || null,
      positionId: form.positionId ? Number(form.positionId) : null,
    });
    setSaving(false);
    if (errorCode) {
      setValidationError(catalogErrorMessage(errorCode));
      return;
    }

    toast.success(editing ? 'Đã cập nhật giảng viên' : 'Đã thêm giảng viên', { description: fullName });
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
  };

  const handleImport = async (rows: ImportLecturerRow[]): Promise<CatalogImportResponse> => {
    const result = await onImportLecturers(rows);
    if (result.createdCount > 0) {
      toast.success(`Đã import ${result.createdCount} giảng viên`, {
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
    const errorCode = await onDeleteLecturer(toDelete.lecturerId);
    if (errorCode) {
      toast.error('Không thể xóa giảng viên', { description: catalogErrorMessage(errorCode) });
    } else {
      toast.success('Đã xóa giảng viên', { description: toDelete.fullName });
    }
    setToDelete(null);
  };

  const availableDepartments = form.facultyId
    ? departments.filter((department) => String(department.facultyId) === form.facultyId)
    : departments;

  const normalized = foldVietnamese(search);
  const filtered = lecturers.filter((lecturer) => {
    const matchesSearch =
      !normalized ||
      foldVietnamese(lecturer.fullName).includes(normalized) ||
      (lecturer.email ?? '').toLowerCase().includes(normalized);
    const matchesFaculty = !facultyFilter || String(lecturer.facultyId) === facultyFilter;
    return matchesSearch && matchesFaculty;
  });

  const columns: Column<Lecturer>[] = [
    {
      key: 'fullName',
      header: 'Họ và tên',
      width: '20%',
      filterValue: (row) => row.fullName,
      render: (row) => <span className="catalog-cell-primary">{row.fullName}</span>,
    },
    {
      key: 'departmentId',
      header: 'Bộ môn',
      width: '18%',
      filterValue: (row) => (row.departmentId === null ? '—' : departmentNameOf(row.departmentId)),
      render: (row) => (row.departmentId === null ? '—' : departmentNameOf(row.departmentId)),
    },
    {
      key: 'facultyId',
      header: 'Khoa/viện',
      width: '18%',
      filterValue: (row) => (row.facultyId === null ? '—' : facultyNameOf(row.facultyId)),
      render: (row) => (row.facultyId === null ? '—' : facultyNameOf(row.facultyId)),
    },
    {
      key: 'positionId',
      header: 'Chức vụ',
      width: '12%',
      filterValue: (row) => (row.positionId === null ? '—' : positionNameOf(row.positionId)),
      render: (row) => (row.positionId === null ? '—' : positionNameOf(row.positionId)),
    },
    {
      key: 'email',
      header: 'Email',
      width: '15%',
      render: (row) => row.email ?? '—',
    },
    {
      key: 'phoneNumber',
      header: 'Số điện thoại',
      width: '10%',
      render: (row) => row.phoneNumber ?? '—',
    },
  ];

  // Bỏ hẳn cả cột cho vai trò chỉ đọc, không để lại một cột trống — giống trang Học phần.
  if (!readOnly) {
    columns.push({
      key: 'actions',
      header: 'Thao tác',
      width: '7%',
      render: (row) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openEdit(row)}
            aria-label={`Sửa ${row.fullName}`}
            title="Sửa"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          {canManageAll && (
            <button
              type="button"
              className="catalog-icon-button catalog-icon-button--danger"
              onClick={() => setToDelete(row)}
              aria-label={`Xóa ${row.fullName}`}
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
          <h2>Danh mục giảng viên</h2>
          <p>Bảng "Lecturers".</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm họ tên hoặc email..."
        exportConfig={{
          title: 'DANH SÁCH GIẢNG VIÊN',
          fileName: 'danh-sach-giang-vien',
          subInstitution: 'PHÒNG ĐÀO TẠO',
        }}
        onAddNew={canManageCatalog ? openCreate : undefined}
        addNewLabel="Thêm giảng viên"
        toolbarActions={(
          <>
            {canManageAll && (
              <button
                type="button"
                className="btn btn-secondary btn-sm catalog-add-button"
                onClick={() => setIsImportOpen(true)}
              >
                <FileSpreadsheet aria-hidden="true" size={16} />
                <span>Import Excel</span>
              </button>
            )}
          </>
        )}
        emptyMessage="Chưa có giảng viên nào trong danh mục."
        keyExtractor={(item) => String(item.lecturerId)}
        pageSize={20}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa giảng viên' : 'Thêm giảng viên'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="form-group">
            <label htmlFor="lecturer-name">Họ và tên</label>
            <input
              id="lecturer-name"
              type="text"
              placeholder="Nguyễn Văn Hải"
              value={form.fullName}
              onChange={(event) => updateForm({ fullName: event.target.value })}
              required
            />
          </div>
          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="lecturer-faculty">Khoa/viện</label>
              <SearchableSelect
                id="lecturer-faculty"
                value={form.facultyId}
                onChange={(value) => updateForm({ facultyId: value, departmentId: '' })}
                emptyLabel="Chưa phân công"
                options={faculties.map((faculty) => ({
                  value: String(faculty.facultyId),
                  label: faculty.facultyName,
                }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lecturer-department">Bộ môn</label>
              <SearchableSelect
                id="lecturer-department"
                value={form.departmentId}
                onChange={(value) => updateForm({ departmentId: value })}
                emptyLabel="Chưa phân công"
                options={availableDepartments.map((department) => ({
                  value: String(department.departmentId),
                  label: department.departmentName,
                }))}
              />
            </div>
          </div>
          <div className="catalog-form-grid catalog-form-grid--2">
            <div className="form-group">
              <label htmlFor="lecturer-email">Email *</label>
              <input
                id="lecturer-email"
                type="email"
                required
                placeholder="vidu@vimaru.edu.vn"
                value={form.email}
                onChange={(event) => updateForm({ email: event.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="lecturer-phone">Số điện thoại</label>
              <input
                id="lecturer-phone"
                type="tel"
                placeholder="09xx xxx xxx"
                value={form.phoneNumber}
                onChange={(event) => updateForm({ phoneNumber: event.target.value })}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="lecturer-position">Chức vụ</label>
            <SearchableSelect
              id="lecturer-position"
              value={form.positionId}
              onChange={(value) => updateForm({ positionId: value })}
              emptyLabel="Chưa phân công"
              options={positions.map((position) => ({
                value: String(position.positionId),
                label: position.positionName,
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

      <Modal
        isOpen={isPositionsOpen}
        onClose={() => {
          if (positionSaving) return;
          setIsPositionsOpen(false);
          setPositionError(null);
        }}
        title="Chức vụ"
      >
        <div className="answer-scale-manager">
          {positionError && (
            <div className="catalog-validation-error" role="alert">{positionError}</div>
          )}

          <section className="answer-scale-list" aria-label="Danh sách chức vụ">
            {positions.length === 0 && (
              <p className="answer-scale-empty">Chưa có chức vụ nào.</p>
            )}
            {positions.map((position) => (
              <div className="answer-scale-row" key={position.positionId}>
                <div className="answer-scale-row-body">
                  <strong>{position.positionName}</strong>
                </div>
                {deletingPositionId === position.positionId ? (
                  <div className="answer-scale-confirm">
                    <span>Xóa chức vụ này?</span>
                    <button
                      type="button"
                      className="btn catalog-danger-button btn-sm"
                      onClick={() => void handleDeletePosition(position.positionId)}
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDeletingPositionId(null)}
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div className="catalog-actions">
                    <button
                      type="button"
                      className="catalog-icon-button"
                      onClick={() => openPositionEdit(position)}
                      aria-label={`Sửa chức vụ ${position.positionName}`}
                      title="Sửa"
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    {canManageCatalog && (
                      <button
                        type="button"
                        className="catalog-icon-button catalog-icon-button--danger"
                        onClick={() => setDeletingPositionId(position.positionId)}
                        aria-label={`Xóa chức vụ ${position.positionName}`}
                        title="Xóa"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>

          <form className="catalog-form" onSubmit={(event) => void handleSavePosition(event)}>
            <div className="form-group">
              <label htmlFor="position-name">
                {positionForm.positionId === null ? 'Tên chức vụ mới' : 'Tên chức vụ'}
              </label>
              <input
                id="position-name"
                type="text"
                placeholder="VD: Giảng viên chính"
                value={positionForm.positionName}
                onChange={(event) =>
                  setPositionForm((prev) => ({ ...prev, positionName: event.target.value }))
                }
                required
              />
            </div>

            <div className="modal-footer catalog-form-actions">
              {positionForm.positionId !== null && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openPositionCreate}
                  disabled={positionSaving}
                >
                  Thêm chức vụ mới
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={positionSaving}>
                {positionSaving ? (
                  <LoaderCircle className="auth-spin" aria-hidden="true" size={16} />
                ) : (
                  <Save aria-hidden="true" size={16} />
                )}
                {positionForm.positionId === null ? 'Thêm chức vụ' : 'Lưu chức vụ'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <LecturerImportDialog
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
        title="Xóa giảng viên?"
        recordName={toDelete?.fullName ?? ''}
        confirmText="Xóa"
      />
    </div>
  );
};
