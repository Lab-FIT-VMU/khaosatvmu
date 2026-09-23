import React, { useState } from 'react';
import { FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog, isReadOnlyRole } from '../auth/roles';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { MajorImportDialog } from '../components/MajorImportDialog';
import { catalogErrorMessage, type CatalogImportResponse } from '../services/catalogApi';
import type { ImportMajorRow } from '../utils/majorImportExcel';
import type { Faculty, Major } from '../types';
import { foldVietnamese } from '../utils/vietnamese';

interface MajorsPageProps {
  majors: Major[];
  faculties: Faculty[];
  /** Trả về mã lỗi của API, null nếu lưu thành công. */
  onSaveMajor: (
    majorId: number | null,
    majorCode: string,
    majorName: string,
    facultyId: number,
  ) => Promise<string | null>;
  onDeleteMajor: (majorId: number) => Promise<string | null>;
  onImportMajors: (rows: ImportMajorRow[]) => Promise<CatalogImportResponse>;
}

interface MajorForm {
  majorCode: string;
  majorName: string;
  facultyId: string;
}

const emptyForm: MajorForm = { majorCode: '', majorName: '', facultyId: '' };

export const MajorsPage: React.FC<MajorsPageProps> = ({
  majors,
  faculties,
  onSaveMajor,
  onDeleteMajor,
  onImportMajors,
}) => {
  // Thêm và xoá là việc của quản trị; trưởng bộ môn và giảng viên chỉ xem và sửa.
  const { activeProfile } = useAuth();
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);
  // Vai trò chỉ đọc (giảng viên, Ban Giám hiệu) không sửa được gì, nên ẩn cả nút Sửa.
  const readOnly = isReadOnlyRole(activeProfile?.roleCode);
  const [search, setSearch] = useState('');
  const [facultyFilter, setFacultyFilter] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Major | null>(null);
  const [toDelete, setToDelete] = useState<Major | null>(null);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MajorForm>(emptyForm);

  const updateForm = (patch: Partial<MajorForm>) => setForm((prev) => ({ ...prev, ...patch }));
  const facultyNameOf = (facultyId: number) =>
    faculties.find((faculty) => faculty.facultyId === facultyId)?.facultyName ?? '—';

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, facultyId: faculties[0] ? String(faculties[0].facultyId) : '' });
    setValidationError('');
    setIsModalOpen(true);
  };

  const openEdit = (major: Major) => {
    setEditing(major);
    setForm({ majorCode: major.majorCode, majorName: major.majorName, facultyId: String(major.facultyId) });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.majorName.trim();
    const code = form.majorCode.trim();

    if (!code) {
      setValidationError('Vui lòng nhập mã ngành.');
      return;
    }
    if (!name) {
      setValidationError('Vui lòng nhập tên ngành.');
      return;
    }
    // "Majors"."FacultyId" NOT NULL
    if (!form.facultyId) {
      setValidationError('Vui lòng chọn khoa / viện.');
      return;
    }

    setSaving(true);
    const errorCode = await onSaveMajor(editing?.majorId ?? null, code, name, Number(form.facultyId));
    setSaving(false);
    if (errorCode) {
      setValidationError(catalogErrorMessage(errorCode));
      return;
    }

    toast.success(editing ? 'Đã cập nhật ngành' : 'Đã thêm ngành', { description: name });
    setIsModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setValidationError('');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const errorCode = await onDeleteMajor(toDelete.majorId);
    if (errorCode) {
      toast.error('Không thể xóa ngành', { description: catalogErrorMessage(errorCode) });
    } else {
      toast.success('Đã xóa ngành', { description: toDelete.majorName });
    }
    setToDelete(null);
  };

  const handleImport = async (rows: ImportMajorRow[]): Promise<CatalogImportResponse> => {
    const result = await onImportMajors(rows);
    if (result.createdCount > 0) {
      toast.success(`Đã import ${result.createdCount} ngành đào tạo`, {
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
  const filtered = majors.filter((major) => {
    const matchesSearch = !normalized || foldVietnamese(major.majorName).includes(normalized);
    const matchesFaculty = !facultyFilter || String(major.facultyId) === facultyFilter;
    return matchesSearch && matchesFaculty;
  });

  const columns: Column<Major>[] = [
    {
      key: 'majorCode',
      header: 'Mã ngành',
      width: '16%',
      filterValue: (item) => item.majorCode,
      // Tệp xuất lấy giá trị qua filterValue nên phải khai riêng: ngành chưa có mã thì
      // màn hình in "—", còn tệp lại để trắng một ô không nói lên điều gì.
      exportFormat: (item) => item.majorCode || '—',
      render: (item) => <span className="catalog-cell-primary">{item.majorCode || '—'}</span>,
    },
    {
      key: 'majorName',
      header: 'Tên ngành đào tạo',
      width: '42%',
      filterValue: (item) => item.majorName,
      render: (item) => <span className="catalog-cell-primary">{item.majorName}</span>,
    },
    {
      key: 'facultyId',
      header: 'Khoa viện',
      width: '30%',
      filterValue: (item) => facultyNameOf(item.facultyId),
      render: (item) => facultyNameOf(item.facultyId),
    },
  ];

  // Bỏ hẳn cả cột cho vai trò chỉ đọc, không để lại một cột trống.
  if (!readOnly) {
    columns.push({
        key: 'actions',
        header: 'Hành động',
        width: '12%',
        render: (item) => (
          <div className="catalog-actions">
            <button
              type="button"
              className="catalog-icon-button"
              onClick={() => openEdit(item)}
              aria-label={`Sửa ${item.majorName}`}
              title="Sửa"
            >
              <Pencil aria-hidden="true" size={15} />
            </button>
            {canManageCatalog && (
              <button
                type="button"
                className="catalog-icon-button catalog-icon-button--danger"
                onClick={() => setToDelete(item)}
                aria-label={`Xóa ${item.majorName}`}
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
          <h2>Danh mục ngành đào tạo</h2>
          <p>Bảng "Majors".</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm nhanh theo tên ngành đào tạo..."
        exportConfig={{
          title: 'DANH SÁCH NGÀNH ĐÀO TẠO',
          fileName: 'danh-sach-nganh-dao-tao',
          breadcrumb: ['Ngành đào tạo'],
        }}
        currentFilter={facultyFilter}
        onFilterChange={setFacultyFilter}
        onAddNew={canManageCatalog ? openCreate : undefined}
        addNewLabel="Thêm ngành đào tạo"
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
        emptyMessage="Chưa có ngành đào tạo nào trong danh mục."
        keyExtractor={(item) => String(item.majorId)}
        pageSize={20}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa ngành đào tạo' : 'Thêm ngành đào tạo'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="form-group">
            <label htmlFor="major-code">Mã ngành</label>
            <input
              id="major-code"
              type="text"
              placeholder="CNT"
              value={form.majorCode}
              onChange={(event) => updateForm({ majorCode: event.target.value.toUpperCase() })}
              maxLength={30}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="major-name">Tên ngành</label>
            <input
              id="major-name"
              type="text"
              placeholder="Công nghệ Thông tin"
              value={form.majorName}
              onChange={(event) => updateForm({ majorName: event.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="major-faculty">Khoa viện</label>
            <SearchableSelect
              id="major-faculty"
              value={form.facultyId}
              onChange={(value) => updateForm({ facultyId: value })}
              required
              placeholder="Chọn khoa viện"
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || faculties.length === 0}
            >
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      <MajorImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        faculties={faculties}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa ngành?"
        recordName={toDelete?.majorName ?? ''}
        confirmText="Xóa"
      />
    </div>
  );
};
