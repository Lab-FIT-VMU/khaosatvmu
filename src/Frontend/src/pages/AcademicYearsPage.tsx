import React, { useMemo, useState } from 'react';
import { CalendarPlus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { useSemester } from '../context/semesterContext';
import { ApiError } from '../services/apiClient';
import { catalogApi, catalogErrorMessage, type SaveAcademicYearPayload } from '../services/catalogApi';
import type { AcademicYear } from '../types';
import { foldVietnamese } from '../utils/vietnamese';

/*
  Danh mục năm học và học kỳ. Trước đây nằm lẫn trong trang Lớp học phần (nút "+" ở cột
  cây bên trái); tách thành mục riêng để tạo năm học không phải đi qua trang lớp, và để
  bật tắt bằng một quyền riêng.

  Thêm năm học là máy chủ tạo luôn ba học kỳ và khoá học của năm đó, cùng một lần lưu.
  Khoá học không còn tạo tay ở mục Khoá ngành đào tạo nữa.

  Năm học và học kỳ là khung dùng chung cho cả trường nên chỉ quản trị toàn trường được
  thêm / sửa — backend cũng từ chối các vai trò khác (xem congviec3.md mục H4). Vai trò
  chỉ đọc vẫn xem được danh sách.
*/

interface YearForm {
  academicYearName: string;
  startDate: string;
  endDate: string;
}

const emptyYearForm: YearForm = {
  academicYearName: '',
  startDate: '',
  endDate: '',
};

/**
 * Năm học kết thúc vào ngày liền trước mốc bắt đầu của năm sau, để hai năm liên tiếp khít
 * nhau. Ngày 29/2 lùi về 28/2 trước khi trừ một ngày, khớp cách DateOnly.AddYears của máy
 * chủ làm tròn.
 */
const endDateFromStart = (startDate: string) => {
  const [year, month, day] = startDate.split('-').map(Number);
  if (!year || !month || !day) return '';

  const nextYear = year + 1;
  const daysInMonth = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  const anniversary = new Date(Date.UTC(nextYear, month - 1, Math.min(day, daysInMonth)));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  return anniversary.toISOString().slice(0, 10);
};

/**
 * Dải năm học sinh sẵn trong danh sách chọn, tính từ năm hiện tại: 20 năm đã qua để nhập
 * bù dữ liệu cũ, 10 năm sắp tới để mở trước. Dải trượt theo năm hiện tại nên không có mốc
 * cứng nào phải sửa lại về sau.
 */
const YEARS_BEFORE = 20;
const YEARS_AFTER = 10;

/**
 * Năm học chỉ nhận khuôn "n-(n+1)", nên thay vì để gõ tay rồi lọt "2025-2027", danh sách
 * được sinh quanh năm hiện tại. Tên đang sửa luôn có mặt, kể cả khi nó nằm ngoài dải, để
 * mở hộp thoại sửa không làm mất giá trị cũ.
 */
const buildAcademicYearOptions = (currentName: string): string[] => {
  const thisYear = new Date().getFullYear();
  const generated = Array.from(
    { length: YEARS_BEFORE + YEARS_AFTER + 1 },
    (_, index) => {
      const start = thisYear - YEARS_BEFORE + index;
      return `${start}-${start + 1}`;
    }
  );
  return currentName && !generated.includes(currentName)
    ? [currentName, ...generated]
    : generated;
};

/**
 * Mã khoá suy từ năm học, cùng quy tắc với máy chủ (CohortCodeRules.FromAcademicYearName):
 * 2018-2019 là khoá 59, mỗi năm sau tăng một khoá. Chỉ để xem trước trong hộp thoại; mã
 * thật do máy chủ sinh.
 */
const BASE_ACADEMIC_YEAR_START = 2018;
const BASE_COHORT_NUMBER = 59;
const cohortCodeOf = (academicYearName: string): string => {
  const yearStart = Number.parseInt(academicYearName, 10);
  return Number.isNaN(yearStart) ? '' : String(BASE_COHORT_NUMBER + (yearStart - BASE_ACADEMIC_YEAR_START));
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const errorCodeOf = (error: unknown): string =>
  error instanceof ApiError ? error.errorCode : 'API_REQUEST_FAILED';

export const AcademicYearsPage: React.FC = () => {
  const { academicYears, reloadAcademicYears } = useSemester();
  const { activeProfile } = useAuth();
  const canManage = isUnrestrictedRole(activeProfile?.roleCode);

  const [search, setSearch] = useState('');

  const [isYearModalOpen, setIsYearModalOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [yearForm, setYearForm] = useState<YearForm>(emptyYearForm);
  const [yearError, setYearError] = useState('');
  const [savingYear, setSavingYear] = useState(false);

  const [semesterYear, setSemesterYear] = useState<AcademicYear | null>(null);
  const [semesterName, setSemesterName] = useState('');
  const [semesterError, setSemesterError] = useState('');
  const [savingSemester, setSavingSemester] = useState(false);

  // Năm học đã có trong danh mục thì bỏ khỏi danh sách chọn, khỏi để người dùng chọn xong
  // mới nhận lỗi trùng tên từ API.
  const yearNameOptions = useMemo(() => {
    const editingName = editingYear?.academicYearName ?? '';
    const taken = new Set(
      academicYears
        .filter((year) => year.academicYearId !== editingYear?.academicYearId)
        .map((year) => year.academicYearName)
    );
    return buildAcademicYearOptions(editingName).filter((option) => !taken.has(option));
  }, [academicYears, editingYear]);

  // ----- Năm học ------------------------------------------------------------

  const openCreateYear = () => {
    setEditingYear(null);
    setYearForm(emptyYearForm);
    setYearError('');
    setIsYearModalOpen(true);
  };

  const openEditYear = (year: AcademicYear) => {
    setEditingYear(year);
    setYearForm({
      academicYearName: year.academicYearName,
      startDate: year.startDate,
      endDate: year.endDate,
    });
    setYearError('');
    setIsYearModalOpen(true);
  };

  const handleYearSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = yearForm.academicYearName.trim();

    if (!name) {
      setYearError('Vui lòng chọn năm học.');
      return;
    }
    if (!yearForm.startDate) {
      setYearError('Vui lòng chọn ngày bắt đầu năm học.');
      return;
    }

    const payload: SaveAcademicYearPayload = {
      academicYearName: name,
      startDate: yearForm.startDate,
    };

    setSavingYear(true);
    try {
      if (editingYear) {
        await catalogApi.updateAcademicYear(editingYear.academicYearId, payload);
        await reloadAcademicYears();
        toast.success('Đã cập nhật năm học', { description: name });
      } else {
        const created = await catalogApi.createAcademicYear(payload);
        await reloadAcademicYears();
        toast.success('Đã thêm năm học', {
          description: `${name} · tự tạo ${created.semesters.length} học kỳ và Khoá ${cohortCodeOf(name)}`,
        });
      }
      setIsYearModalOpen(false);
      setEditingYear(null);
      setYearForm(emptyYearForm);
      setYearError('');
    } catch (error) {
      setYearError(catalogErrorMessage(errorCodeOf(error)));
    } finally {
      setSavingYear(false);
    }
  };

  // ----- Học kỳ -------------------------------------------------------------

  // Ba học kỳ được sinh tự động cùng năm học và không cho sửa hay xoá, tránh việc đổi nhầm
  // tên hay xoá nhầm một học kỳ đang gánh lớp học phần. Ở đây chỉ thêm được học kỳ mới.
  const openCreateSemester = (year: AcademicYear) => {
    setSemesterYear(year);
    setSemesterName('');
    setSemesterError('');
  };

  const handleSemesterSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = semesterName.trim();
    if (semesterYear === null) return;
    if (!name) {
      setSemesterError('Vui lòng nhập tên học kỳ.');
      return;
    }

    setSavingSemester(true);
    try {
      await catalogApi.createSemester(name, semesterYear.academicYearId);
      await reloadAcademicYears();
      toast.success('Đã thêm học kỳ', { description: `${name} · ${semesterYear.academicYearName}` });
      setSemesterYear(null);
      setSemesterName('');
      setSemesterError('');
    } catch (error) {
      setSemesterError(catalogErrorMessage(errorCodeOf(error)));
    } finally {
      setSavingSemester(false);
    }
  };

  // ----- Bảng ---------------------------------------------------------------

  const keyword = foldVietnamese(search);
  const filtered = academicYears.filter((year) =>
    !keyword
    || foldVietnamese([year.academicYearName, ...year.semesters.map((semester) => semester.semesterName)].join(' '))
      .includes(keyword));

  const columns: Column<AcademicYear>[] = [
    {
      key: 'academicYearName',
      header: 'Năm học',
      width: '18%',
      sortValue: (item) => item.academicYearName,
      filterValue: (item) => item.academicYearName,
      render: (item) => <span className="catalog-cell-primary">{item.academicYearName}</span>,
    },
    {
      key: 'startDate',
      header: 'Ngày bắt đầu',
      width: '14%',
      sortValue: (item) => item.startDate,
      render: (item) => formatDate(item.startDate),
    },
    {
      key: 'endDate',
      header: 'Ngày kết thúc',
      width: '14%',
      sortValue: (item) => item.endDate,
      render: (item) => formatDate(item.endDate),
    },
    {
      key: 'semesters',
      header: 'Học kỳ',
      width: canManage ? '40%' : '54%',
      filterValue: (item) => item.semesters.map((semester) => semester.semesterName).join(', '),
      render: (item) => (
        item.semesters.length === 0
          ? "Chưa có học kỳ"
          : item.semesters.map((semester) => semester.semesterName).join(' · ')
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: 'actions',
      header: 'Hành động',
      width: '14%',
      render: (item) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openEditYear(item)}
            aria-label={`Sửa năm học ${item.academicYearName}`}
            title="Sửa năm học"
          >
            <Pencil aria-hidden="true" size={15} />
          </button>
          <button
            type="button"
            className="catalog-icon-button"
            onClick={() => openCreateSemester(item)}
            aria-label={`Thêm học kỳ cho năm học ${item.academicYearName}`}
            title="Thêm học kỳ"
          >
            <CalendarPlus aria-hidden="true" size={15} />
          </button>
        </div>
      ),
    });
  }

  return (
    <div className="catalog-page">
      <header className="catalog-page-header">
        <div>
          <h2>Danh mục năm học và học kỳ</h2>
          <p>Mỗi năm học mới được tạo sẵn ba học kỳ (Học kỳ phụ, Học kỳ 1, Học kỳ 2) và khoá học của năm đó.</p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm năm học hoặc học kỳ..."
        exportConfig={{
          title: 'DANH SÁCH NĂM HỌC VÀ HỌC KỲ',
          fileName: 'danh-sach-nam-hoc-hoc-ky',
          breadcrumb: ['Năm học & học kỳ'],
        }}
        onAddNew={canManage ? openCreateYear : undefined}
        addNewLabel="Thêm năm học"
        emptyMessage="Chưa có năm học nào."
        keyExtractor={(item) => String(item.academicYearId)}
        pageSize={20}
      />

      {/* Modal năm học */}
      <Modal
        isOpen={isYearModalOpen}
        onClose={() => setIsYearModalOpen(false)}
        title={editingYear ? 'Sửa năm học' : 'Thêm năm học'}
      >
        <form className="catalog-form" onSubmit={(event) => void handleYearSubmit(event)}>
          {yearError && <div className="catalog-validation-error" role="alert">{yearError}</div>}
          <div className="form-group">
            <label htmlFor="year-name">Tên năm học</label>
            <select
              id="year-name"
              value={yearForm.academicYearName}
              onChange={(event) =>
                setYearForm((prev) => ({ ...prev, academicYearName: event.target.value }))
              }
              required
            >
              <option value="">-- Chọn năm học --</option>
              {yearNameOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="year-start-date">Ngày bắt đầu</label>
            <input
              id="year-start-date"
              type="date"
              value={yearForm.startDate}
              onChange={(event) =>
                setYearForm((prev) => ({
                  ...prev,
                  startDate: event.target.value,
                  endDate: endDateFromStart(event.target.value),
                }))
              }
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="year-end-date">Ngày kết thúc</label>
            <input
              id="year-end-date"
              type="date"
              value={yearForm.endDate}
              readOnly
              disabled
            />
            <small className="form-hint">
              Tự tính theo ngày bắt đầu: ngày liền trước mốc đó của năm sau.
            </small>
          </div>
          {!editingYear && (
            <div className="catalog-context-band">
              Sau khi lưu, hệ thống tự tạo ba học kỳ (Học kỳ phụ, Học kỳ 1, Học kỳ 2) và khoá học
              của năm nhập học
              {cohortCodeOf(yearForm.academicYearName) && (
                <> (<strong>Khoá {cohortCodeOf(yearForm.academicYearName)}</strong>)</>
              )}
              .
            </div>
          )}
          <div className="modal-footer catalog-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsYearModalOpen(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingYear}>
              {savingYear ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal học kỳ */}
      <Modal
        isOpen={semesterYear !== null}
        onClose={() => setSemesterYear(null)}
        title="Thêm học kỳ"
      >
        <form className="catalog-form" onSubmit={(event) => void handleSemesterSubmit(event)}>
          {semesterError && (
            <div className="catalog-validation-error" role="alert">{semesterError}</div>
          )}
          <div className="catalog-context-band">
            Năm học: <strong>{semesterYear?.academicYearName}</strong>
          </div>
          <div className="form-group">
            <label htmlFor="semester-name">Tên học kỳ</label>
            <input
              id="semester-name"
              type="text"
              placeholder="VD: Học kỳ hè"
              value={semesterName}
              onChange={(event) => setSemesterName(event.target.value)}
              required
            />
          </div>
          <div className="modal-footer catalog-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setSemesterYear(null)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={savingSemester}>
              {savingSemester ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
