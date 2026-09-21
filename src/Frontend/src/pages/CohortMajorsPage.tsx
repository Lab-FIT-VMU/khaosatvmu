import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, GraduationCap, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { useAuth } from '../auth/authContext';
import { canCreateOrDeleteCatalog } from '../auth/roles';
import { ConfirmDialog, Modal } from '../components/Modal';
import { SearchableSelect } from '../components/SearchableSelect';
import { CohortMajorImportDialog } from '../components/CohortMajorImportDialog';
import { ApiError } from '../services/apiClient';
import { catalogApi } from '../services/catalogApi';
import {
  cohortApi,
  cohortErrorMessage,
  type Cohort,
  type CohortImportResponse,
  type CohortMajor,
} from '../services/cohortApi';
import type { ImportCohortMajorRow } from '../utils/cohortMajorImportExcel';
import type { AcademicYear, Major } from '../types';
import { foldVietnamese } from '../utils/vietnamese';

interface CohortMajorsPageProps {
  majors: Major[];
}

interface CohortMajorForm {
  cohortId: string;
  cohortMajorCode: string;
  majorId: string;
  studentCount: string;
}

const emptyForm: CohortMajorForm = {
  cohortId: '',
  cohortMajorCode: '',
  majorId: '',
  studentCount: '0',
};

function errorCodeOf(error: unknown): string | null {
  return error instanceof ApiError ? error.errorCode : null;
}

export const CohortMajorsPage: React.FC<CohortMajorsPageProps> = ({ majors }) => {
  const { activeProfile } = useAuth();
  const canManageCatalog = canCreateOrDeleteCatalog(activeProfile?.roleCode);

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortMajors, setCohortMajors] = useState<CohortMajor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCohortId, setSelectedCohortId] = useState<number | null>(null);

  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false);
  const [cohortAcademicYearId, setCohortAcademicYearId] = useState('');
  const [cohortError, setCohortError] = useState('');
  const [savingCohort, setSavingCohort] = useState(false);
  const [cohortToDelete, setCohortToDelete] = useState<Cohort | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<CohortMajor | null>(null);
  const [toDelete, setToDelete] = useState<CohortMajor | null>(null);
  const [validationError, setValidationError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CohortMajorForm>(emptyForm);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextYears, nextCohorts, nextCohortMajors] = await Promise.all([
        catalogApi.academicYears(),
        cohortApi.cohorts(),
        cohortApi.cohortMajors(),
      ]);
      setAcademicYears(nextYears);
      setCohorts(nextCohorts);
      setCohortMajors(nextCohortMajors);
    } catch {
      toast.error('Không tải được danh mục khoá ngành đào tạo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateForm = (patch: Partial<CohortMajorForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  // Năm học chưa có khoá nào mới được chọn; mỗi năm học ứng với đúng một khoá.
  const availableYears = useMemo(() => {
    const used = new Set(cohorts.map((cohort) => cohort.academicYearId));
    return academicYears.filter((year) => !used.has(year.academicYearId));
  }, [academicYears, cohorts]);

  const openCreateCohort = () => {
    setCohortAcademicYearId(availableYears[0] ? String(availableYears[0].academicYearId) : '');
    setCohortError('');
    setIsCohortModalOpen(true);
  };

  const handleCreateCohort = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cohortAcademicYearId) {
      setCohortError('Vui lòng chọn năm học.');
      return;
    }
    setSavingCohort(true);
    try {
      const created = await cohortApi.createCohort(Number(cohortAcademicYearId));
      toast.success('Đã tạo khoá học', { description: created.cohortName });
      setIsCohortModalOpen(false);
      await reload();
    } catch (error) {
      setCohortError(cohortErrorMessage(errorCodeOf(error)));
    } finally {
      setSavingCohort(false);
    }
  };

  const handleDeleteCohort = async () => {
    if (!cohortToDelete) return;
    try {
      await cohortApi.deleteCohort(cohortToDelete.cohortId);
      toast.success('Đã xoá khoá học', { description: cohortToDelete.cohortName });
      await reload();
    } catch (error) {
      toast.error('Không thể xoá khoá học', {
        description: cohortErrorMessage(errorCodeOf(error)),
      });
    } finally {
      setCohortToDelete(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      // Khoá đang chọn ở cột trái là mặc định; đang xem "Tất cả" thì lấy khoá mới nhất.
      cohortId: String(selectedCohortId ?? cohorts[0]?.cohortId ?? ''),
      majorId: majors[0] ? String(majors[0].majorId) : '',
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const openEdit = (item: CohortMajor) => {
    setEditing(item);
    setForm({
      cohortId: String(item.cohortId),
      cohortMajorCode: item.cohortMajorCode,
      majorId: String(item.majorId),
      studentCount: String(item.studentCount),
    });
    setValidationError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.cohortMajorCode.trim();
    if (!name) {
      setValidationError('Vui lòng nhập tên khoá ngành đào tạo.');
      return;
    }
    if (!form.cohortId) {
      setValidationError('Vui lòng chọn khoá học.');
      return;
    }
    if (!form.majorId) {
      setValidationError('Vui lòng chọn ngành đào tạo.');
      return;
    }
    const studentCount = Number(form.studentCount);
    if (!Number.isFinite(studentCount) || studentCount < 0) {
      setValidationError('Số lượng sinh viên phải là số không âm.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await cohortApi.updateCohortMajor(
          editing.cohortMajorId,
          Number(form.cohortId),
          name,
          Number(form.majorId),
          studentCount
        );
      } else {
        await cohortApi.createCohortMajor(
          Number(form.cohortId),
          name,
          Number(form.majorId),
          studentCount
        );
      }
      toast.success(editing ? 'Đã cập nhật khoá ngành' : 'Đã thêm khoá ngành', {
        description: name,
      });
      setIsModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await reload();
    } catch (error) {
      setValidationError(cohortErrorMessage(errorCodeOf(error)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await cohortApi.deleteCohortMajor(toDelete.cohortMajorId);
      toast.success('Đã xoá khoá ngành', { description: toDelete.cohortMajorCode });
      await reload();
    } catch (error) {
      toast.error('Không thể xoá khoá ngành', {
        description: cohortErrorMessage(errorCodeOf(error)),
      });
    } finally {
      setToDelete(null);
    }
  };

  const handleImport = async (
    cohortId: number,
    rows: ImportCohortMajorRow[]
  ): Promise<CohortImportResponse> => {
    const result = await cohortApi.importCohortMajors(cohortId, rows);
    const changed = result.createdCount + result.updatedCount;
    if (changed > 0) {
      toast.success(`Đã import ${changed} khoá ngành đào tạo`, {
        description: result.skippedCount > 0 ? `${result.skippedCount} dòng bị bỏ qua` : undefined,
      });
    } else {
      toast.error('Không có dòng nào được ghi', {
        description: `${result.skippedCount} dòng bị bỏ qua`,
      });
    }
    await reload();
    return result;
  };

  const normalized = foldVietnamese(search);
  const filtered = cohortMajors.filter((item) => {
    const matchesSearch =
      !normalized ||
      foldVietnamese(item.cohortMajorCode).includes(normalized) ||
      foldVietnamese(item.majorName).includes(normalized);
    const matchesCohort = selectedCohortId === null || item.cohortId === selectedCohortId;
    return matchesSearch && matchesCohort;
  });

  const columns: Column<CohortMajor>[] = [
    {
      key: 'cohortMajorCode',
      header: 'Khoá ngành đào tạo',
      width: '20%',
      filterValue: (item) => item.cohortMajorCode,
      render: (item) => <span className="catalog-cell-primary">{item.cohortMajorCode}</span>,
    },
    {
      key: 'majorName',
      header: 'Ngành đào tạo',
      width: '26%',
      filterValue: (item) => item.majorName,
      render: (item) => (
        <div>
          <div className="catalog-cell-primary">{item.majorName}</div>
          <div className="catalog-cell-secondary">{item.facultyName}</div>
        </div>
      ),
    },
    {
      key: 'studentCount',
      header: 'Số lượng sinh viên',
      width: '11%',
      filterValue: (item) => String(item.studentCount),
      render: (item) => item.studentCount,
    },
    {
      key: 'graduatedCount',
      header: 'Đã tốt nghiệp',
      width: '11%',
      filterValue: (item) => String(item.graduatedCount),
      render: (item) => item.graduatedCount,
    },
    {
      key: 'notGraduatedCount',
      header: 'Chưa tốt nghiệp',
      width: '11%',
      filterValue: (item) => String(item.notGraduatedCount),
      render: (item) => item.notGraduatedCount,
    },
    {
      key: 'onTimeGraduatedCount',
      header: 'Tốt nghiệp đúng hạn',
      width: '13%',
      filterValue: (item) => String(item.onTimeGraduatedCount),
      render: (item) => item.onTimeGraduatedCount,
    },
    {
      key: 'actions',
      header: 'Hành động',
      width: '12%',
      render: (item) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openEdit(item)}
            aria-label={`Sửa ${item.cohortMajorCode}`}
            title="Sửa"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          {canManageCatalog && (
            <button
              type="button"
              className="catalog-icon-button catalog-icon-button--danger"
              onClick={() => setToDelete(item)}
              aria-label={`Xoá ${item.cohortMajorCode}`}
              title="Xoá"
            >
              <Trash2 aria-hidden="true" size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const selectedCohort = cohorts.find((cohort) => cohort.cohortId === selectedCohortId) ?? null;

  return (
    <div className="catalog-page term-page">
      <div className="term-layout">
        {/* Cột trái: danh sách khoá học */}
        <aside className="term-tree" aria-label="Khoá học">
          <header className="term-tree__header">
            <span className="term-tree__title">
              <GraduationCap aria-hidden="true" size={16} />
              Khoá học
            </span>
            {canManageCatalog && (
              <button
                type="button"
                className="term-tree__add"
                onClick={openCreateCohort}
                disabled={availableYears.length === 0}
                aria-label="Tạo khoá học"
                title={
                  availableYears.length === 0
                    ? 'Mọi năm học đều đã có khoá học'
                    : 'Tạo khoá học từ năm học'
                }
              >
                <Plus aria-hidden="true" size={16} />
              </button>
            )}
          </header>

          {cohorts.length === 0 ? (
            <p className="term-tree__empty">
              {loading ? 'Đang tải...' : 'Chưa có khoá học nào'}
            </p>
          ) : (
            <ul className="term-tree__list">
              <li>
                <div className={`term-tree__year ${selectedCohortId === null ? 'is-selected' : ''}`}>
                  <button
                    type="button"
                    className="term-tree__year-button"
                    onClick={() => setSelectedCohortId(null)}
                  >
                    <Layers aria-hidden="true" size={14} />
                    <span className="term-tree__year-name">Tất cả khoá học</span>
                    <span className="term-tree__count">{cohortMajors.length}</span>
                  </button>
                </div>
              </li>
              {cohorts.map((cohort) => (
                <li key={cohort.cohortId}>
                  <div
                    className={`term-tree__year ${
                      selectedCohortId === cohort.cohortId ? 'is-selected' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="term-tree__year-button"
                      onClick={() => setSelectedCohortId(cohort.cohortId)}
                    >
                      <span className="term-tree__year-name">{cohort.cohortName}</span>
                      <span className="term-tree__count">{cohort.cohortMajorCount}</span>
                    </button>
                    {/* Khoá còn khoá ngành thì backend chặn xoá, nên chỉ hiện nút khi rỗng. */}
                    {canManageCatalog && cohort.cohortMajorCount === 0 && (
                      <span className="term-tree__row-actions">
                        <button
                          type="button"
                          className="catalog-icon-button catalog-icon-button--sm"
                          onClick={() => setCohortToDelete(cohort)}
                          aria-label={`Xoá ${cohort.cohortName}`}
                          title="Xoá khoá học"
                        >
                          <Trash2 aria-hidden="true" size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Cột phải: khoá ngành đào tạo của khoá đang chọn */}
        <section className="term-detail" aria-label="Khoá ngành đào tạo">
          <header className="term-detail__header">
            <span className="term-detail__title">
              <Layers aria-hidden="true" size={16} />
              Khoá ngành đào tạo
              <span className="term-detail__badge">{filtered.length} ngành</span>
              {selectedCohort && (
                <span className="term-detail__context">
                  {selectedCohort.cohortName} · {selectedCohort.academicYearName}
                </span>
              )}
            </span>
          </header>

          <DataTable
            columns={columns}
            data={filtered}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm theo mã khoá ngành hoặc tên ngành..."
            exportConfig={{
              title: selectedCohort
                ? `DANH SÁCH KHOÁ NGÀNH ĐÀO TẠO - ${selectedCohort.cohortName}`
                : 'DANH SÁCH KHOÁ NGÀNH ĐÀO TẠO',
              fileName: selectedCohort
                ? `danh-sach-khoa-nganh-dao-tao-${selectedCohort.cohortCode}`
                : 'danh-sach-khoa-nganh-dao-tao',
              subtitle: selectedCohort?.academicYearName,
              subInstitution: 'PHÒNG ĐÀO TẠO',
            }}
            onAddNew={canManageCatalog ? openCreate : undefined}
            addNewLabel="Thêm khoá ngành"
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
            emptyMessage="Chưa có khoá ngành đào tạo nào."
            keyExtractor={(item) => String(item.cohortMajorId)}
            pageSize={20}
          />
        </section>
      </div>

      <Modal
        isOpen={isCohortModalOpen}
        onClose={() => setIsCohortModalOpen(false)}
        title="Tạo khoá học"
      >
        <form className="catalog-form" onSubmit={(event) => void handleCreateCohort(event)}>
          {cohortError && (
            <div className="catalog-validation-error" role="alert">{cohortError}</div>
          )}
          <div className="form-group">
            <label htmlFor="cohort-academic-year">Năm học nhập học</label>
            <SearchableSelect
              id="cohort-academic-year"
              value={cohortAcademicYearId}
              onChange={setCohortAcademicYearId}
              required
              placeholder="Chọn năm học"
              options={availableYears.map((year) => ({
                value: String(year.academicYearId),
                label: year.academicYearName,
              }))}
            />
            <small className="form-hint">
              Mã khoá tự sinh theo năm học: 2018-2019 là khoá 59, mỗi năm sau tăng một khoá.
            </small>
          </div>
          <div className="modal-footer catalog-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCohortModalOpen(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingCohort || availableYears.length === 0}
            >
              {savingCohort ? 'Đang lưu...' : 'Tạo khoá'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? 'Sửa khoá ngành đào tạo' : 'Thêm khoá ngành đào tạo'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleSubmit(event)}>
          {validationError && (
            <div className="catalog-validation-error" role="alert">{validationError}</div>
          )}
          <div className="form-group">
            <label htmlFor="cohort-major-code">Tên khoá ngành đào tạo</label>
            <input
              id="cohort-major-code"
              type="text"
              placeholder="CNT63CL"
              value={form.cohortMajorCode}
              onChange={(event) => updateForm({ cohortMajorCode: event.target.value })}
              maxLength={30}
              required
            />
            <small className="form-hint">
              Đặt tên tự do, chỉ cần không trùng trong cùng một khoá.
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="cohort-major-cohort">Khoá học</label>
            <SearchableSelect
              id="cohort-major-cohort"
              value={form.cohortId}
              onChange={(value) => updateForm({ cohortId: value })}
              required
              placeholder="Chọn khoá học"
              options={cohorts.map((cohort) => ({
                value: String(cohort.cohortId),
                label: `${cohort.cohortName} (${cohort.academicYearName})`,
              }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="cohort-major-major">Ngành đào tạo</label>
            <SearchableSelect
              id="cohort-major-major"
              value={form.majorId}
              onChange={(value) => updateForm({ majorId: value })}
              required
              placeholder="Chọn ngành đào tạo"
              options={majors.map((major) => ({
                value: String(major.majorId),
                label: `${major.majorCode} — ${major.majorName}`,
              }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="cohort-major-student-count">Số lượng sinh viên</label>
            <input
              id="cohort-major-student-count"
              type="number"
              min={0}
              value={form.studentCount}
              onChange={(event) => updateForm({ studentCount: event.target.value })}
              required
            />
          </div>
          <div className="modal-footer catalog-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || majors.length === 0 || cohorts.length === 0}
            >
              {saving ? 'Đang lưu...' : editing ? 'Cập nhật' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      <CohortMajorImportDialog
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        cohorts={cohorts}
        defaultCohortId={selectedCohortId}
        majors={majors}
        onImport={handleImport}
      />

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Xoá khoá ngành đào tạo?"
        recordName={toDelete?.cohortMajorCode ?? ''}
        confirmText="Xoá"
      />

      <ConfirmDialog
        isOpen={cohortToDelete !== null}
        onClose={() => setCohortToDelete(null)}
        onConfirm={() => void handleDeleteCohort()}
        title="Xoá khoá học?"
        recordName={cohortToDelete?.cohortName ?? ''}
        confirmText="Xoá"
      />
    </div>
  );
};
