import React, { useState } from 'react';
import { FileSpreadsheet, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog, isReadOnlyRole } from '../auth/roles';
import { ConfirmDialog, Modal } from '../components/Modal';
import { FacultyImportDialog } from '../components/FacultyImportDialog';
import { catalogErrorMessage, type CatalogImportResponse } from '../services/catalogApi';
import type { ImportFacultyRow } from '../utils/facultyImportExcel';
import type { Department, Faculty } from '../types';
import { foldVietnamese } from '../utils/vietnamese';

interface FacultiesPageProps {
  faculties: Faculty[];
  departments: Department[];
  /** Trả về mã lỗi của API, null nếu lưu thành công. */
  onSaveFaculty: (facultyId: number | null, facultyName: string) => Promise<string | null>;
  onDeleteFaculty: (facultyId: number) => Promise<string | null>;
  onImportFaculties: (rows: ImportFacultyRow[]) => Promise<CatalogImportResponse>;
}

export const FacultiesPage: React.FC<FacultiesPageProps> = ({
  faculties,
  departments,
  onSaveFaculty,
  onDeleteFaculty,
  onImportFaculties,
}) => {
  // Thêm và xoá là việc của quản trị; trưởng bộ môn và giảng viên chỉ xem và sửa.
  const { activeProfile } = useAuth();
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);
  // Vai trò chỉ đọc (giảng viên, Ban Giám hiệu) không sửa được gì, nên ẩn cả nút Sửa.
  const readOnly = isReadOnlyRole(activeProfile?.roleCode);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [toDelete, setToDelete] = useState<Faculty | null>(null);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [facultyName, setFacultyName] = useState('');

  const departmentCountOf = (facultyId: number) =>
    departments.filter((department) => department.facultyId === facultyId).length;

  const openCreate = () => {
    setEditing(null);
    setFacultyName('');
    setValidationError('');
    setIsModalOpen(true);
  };

  const openEdit = (faculty: Faculty) => {
    setEditing(faculty);
    setFacultyName(faculty.facultyName);
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = facultyName.trim();

    if (!name) {
      setValidationError('Vui lòng nhập tên khoa / viện.');
      return;
    }

    setSaving(true);
    const errorCode = await onSaveFaculty(editing?.facultyId ?? null, name);
    setSaving(false);
    if (errorCode) {
      setValidationError(catalogErrorMessage(errorCode));
      return;
    }

    toast.success(editing ? 'Đã cập nhật khoa / viện' : 'Đã thêm khoa / viện', { description: name });
    setIsModalOpen(false);
    setEditing(null);
    setFacultyName('');
    setValidationError('');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const errorCode = await onDeleteFaculty(toDelete.facultyId);
    if (errorCode) {
      toast.error('Không thể xóa khoa / viện', { description: catalogErrorMessage(errorCode) });
    } else {
      toast.success('Đã xóa khoa / viện', { description: toDelete.facultyName });
    }
    setToDelete(null);
  };

  const handleImport = async (rows: ImportFacultyRow[]): Promise<CatalogImportResponse> => {
    const result = await onImportFaculties(rows);
    if (result.createdCount > 0) {
      toast.success(`Đã import ${result.createdCount} khoa / viện`, {
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
  const filtered = faculties.filter(
    (faculty) => !normalized || foldVietnamese(faculty.facultyName).includes(normalized)
  );

  // Bề rộng theo phần trăm để ba cột còn lại lấp đầy bảng sau khi ẩn số ngành học.
  const columns: Column<Faculty>[] = [
    {
      key: 'facultyName',
      header: 'Khoa/viện',
      width: '55%',
      filterValue: (item) => item.facultyName,
      render: (item) => <span className="catalog-cell-primary">{item.facultyName}</span>,
    },
    {
      key: 'departmentCount',
      header: 'Số bộ môn',
      width: '25%',
      filterValue: (item) => String(departmentCountOf(item.facultyId)),
      numeric: true,
      render: (item) => (
        <span className="catalog-cell-primary">{departmentCountOf(item.facultyId)}</span>
      ),
    },
  ];

  // Bỏ hẳn cả cột cho vai trò chỉ đọc, không để lại một cột trống.
  if (!readOnly) {
    columns.push({
        key: 'actions',
        header: 'Hành động',
        width: '20%',
        render: (item) => (
          <div className="catalog-actions">
            <button
              type="button"
              className="catalog-icon-button"
              onClick={() => openEdit(item)}
              aria-label={`Sửa ${item.facultyName}`}
              title="Sửa"
            >
              <Pencil aria-hidden="true" size={15} />
            </button>
            {canManageCatalog && (
              <button
                type="button"
                className="catalog-icon-button catalog-icon-button--danger"
                onClick={() => setToDelete(item)}
                aria-label={`Xóa ${item.facultyName}`}
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
          <h2>Danh mục khoa và viện</h2>
          <p>Bảng "Faculties".</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm nhanh theo tên khoa/viện..."
        exportConfig={{
          title: 'DANH SÁCH KHOA / VIỆN',
          fileName: 'danh-sach-khoa-vien',
          breadcrumb: ['Khoa / Viện'],
        }}
        onAddNew={canManageCatalog ? openCreate : undefined}
        addNewLabel="Thêm khoa/viện"
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
        emptyMessage="Chưa có khoa / viện nào trong danh mục."
        keyExtractor={(item) => String(item.facultyId)}
        pageSize={20}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa khoa/viện' : 'Thêm khoa/viện'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="form-group">
            <label htmlFor="faculty-name">Tên khoa/viện</label>
            <input
              id="faculty-name"
              type="text"
              placeholder="Khoa Công nghệ Thông tin"
              value={facultyName}
              onChange={(event) => setFacultyName(event.target.value)}
              required
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

      <FacultyImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Xóa khoa / viện?"
        recordName={toDelete?.facultyName ?? ''}
        confirmText="Xóa"
      />
    </div>
  );
};
