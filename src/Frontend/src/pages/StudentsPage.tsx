import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type Column } from '../components/DataTable';
import { StudentImportDialog } from '../components/StudentImportDialog';
import { ApiError } from '../services/apiClient';
import { studentsApi } from '../services/studentsApi';
import type { Student, StudentCohortCount, StudentImportResult } from '../types/students';
import { foldVietnamese } from '../utils/vietnamese';
import '../styles/students.css';

/** Giá trị bộ lọc khóa: "all", "none" (chưa xác định khóa) hoặc mã khóa. */
type CohortFilter = string;

const numberFormat = new Intl.NumberFormat('vi-VN');

function formatDate(value: string | null): string {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return d && m && y ? `${d}/${m}/${y}` : value;
}

/**
 * Danh mục sinh viên (Danh mục đào tạo → Sinh viên). Sinh viên được tạo khi nạp file điểm hoặc nạp
 * danh sách sinh viên; trang này chỉ hiện thông tin sinh viên, không hiện điểm.
 */
export function StudentsPage() {
  const [cohorts, setCohorts] = useState<StudentCohortCount[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [filter, setFilter] = useState<CohortFilter | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const load = useCallback(async (next: CohortFilter | null) => {
    setLoading(true);
    try {
      const data = await studentsApi.list({
        cohortId: next && next !== 'all' && next !== 'none' ? Number(next) : null,
        unassigned: next === 'none',
      });
      setCohorts(data.cohorts);
      setStudents(data.students);
      setCanImport(data.canImport);
    } catch (error) {
      toast.error(error instanceof ApiError && typeof error.body.message === 'string'
        ? error.body.message
        : 'Không tải được danh sách sinh viên.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Lần đầu: tải số lượng theo khóa rồi mở khóa mới nhất (cả trường có hơn 20 nghìn sinh viên).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const first = await studentsApi.list({ cohortId: -1, unassigned: false });
        if (cancelled) return;
        setCohorts(first.cohorts);
        setCanImport(first.canImport);
        const newest = first.cohorts.find((c) => c.cohortId !== null);
        const initial = newest ? String(newest.cohortId) : 'all';
        setFilter(initial);
        await load(initial);
      } catch {
        if (!cancelled) {
          setFilter('all');
          await load('all');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  const changeFilter = (value: string) => {
    setFilter(value);
    void load(value);
  };

  const imported = (result: StudentImportResult) => {
    setIsImportOpen(false);
    toast.success(`Đã nạp: ${numberFormat.format(result.createdCount)} sinh viên mới, ${numberFormat.format(result.updatedCount)} cập nhật${result.skippedCount ? `, bỏ qua ${numberFormat.format(result.skippedCount)} dòng lỗi` : ''}.`);
    void load(filter);
  };

  const filtered = useMemo(() => {
    const term = foldVietnamese(search.trim());
    if (!term) return students;
    return students.filter((s) => foldVietnamese(`${s.studentCode} ${s.fullName} ${s.cohortMajorCode ?? ''} ${s.email ?? ''}`).includes(term));
  }, [students, search]);

  const total = cohorts.reduce((sum, c) => sum + c.studentCount, 0);
  const filterOptions = [
    { label: `Tất cả khóa (${numberFormat.format(total)})`, value: 'all' },
    ...cohorts.map((c) => ({
      label: `${c.cohortName} (${numberFormat.format(c.studentCount)})`,
      value: c.cohortId === null ? 'none' : String(c.cohortId),
    })),
  ];

  const columns: Column<Student>[] = [
    { key: 'studentCode', header: 'Mã sinh viên', sortValue: (s) => s.studentCode, width: '120px' },
    {
      key: 'fullName',
      header: 'Họ và tên',
      render: (s) => <span className="catalog-cell-primary">{s.fullName}</span>,
      sortValue: (s) => s.fullName.split(' ').slice(-1)[0] + s.fullName,
    },
    {
      key: 'cohortMajor',
      header: 'Khoá ngành đào tạo',
      render: (s) => s.cohortMajorCode ?? <span className="student-muted">Chưa có</span>,
      exportFormat: (s) => s.cohortMajorCode ?? '',
      sortValue: (s) => s.cohortMajorCode ?? '',
      filterValue: (s) => s.cohortMajorCode ?? '(Chưa có)',
    },
    {
      key: 'cohort',
      header: 'Khóa',
      render: (s) => s.cohortName ?? '',
      filterValue: (s) => s.cohortName ?? '(Chưa có)',
    },
    {
      key: 'major',
      header: 'Ngành',
      render: (s) => s.majorName ?? '',
      filterValue: (s) => s.majorName ?? '(Chưa có)',
    },
    {
      key: 'faculty',
      header: 'Khoa',
      render: (s) => s.facultyName ?? '',
      filterValue: (s) => s.facultyName ?? '(Chưa có)',
    },
    { key: 'dateOfBirth', header: 'Ngày sinh', render: (s) => formatDate(s.dateOfBirth), exportFormat: (s) => formatDate(s.dateOfBirth) },
    { key: 'gender', header: 'Giới tính', render: (s) => s.gender ?? '', filterValue: (s) => s.gender ?? '(Trống)' },
    { key: 'email', header: 'Email', render: (s) => s.email ?? '' },
    { key: 'status', header: 'Tình trạng', render: (s) => s.studyStatus ?? '', filterValue: (s) => s.studyStatus ?? '(Trống)' },
  ];

  return (
    <div className="catalog-page">
      <header className="catalog-page-header">
        <div>
          <h2>Danh mục sinh viên</h2>
          <p>
            Mỗi sinh viên gắn với một khoá ngành đào tạo (lớp hành chính, ví dụ ĐKT66ĐH); khóa, ngành, khoa lấy theo khoá ngành
            đó. Sinh viên được thêm khi nạp file điểm hoặc nạp danh sách sinh viên. Trang này không hiện điểm.
          </p>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={loading ? [] : filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm mã, họ tên, lớp hoặc email..."
        filterOptions={filterOptions}
        currentFilter={filter ?? ''}
        onFilterChange={changeFilter}
        exportConfig={{
          title: 'DANH SÁCH SINH VIÊN',
          fileName: 'danh-sach-sinh-vien',
          breadcrumb: ['Sinh viên'],
        }}
        toolbarActions={canImport && (
          <button type="button" className="btn btn-secondary btn-sm catalog-add-button" onClick={() => setIsImportOpen(true)}>
            <FileSpreadsheet aria-hidden="true" size={16} />
            <span>Nạp danh sách</span>
          </button>
        )}
        emptyMessage={loading ? 'Đang tải danh sách sinh viên...' : 'Chưa có sinh viên nào.'}
        keyExtractor={(s) => String(s.studentId)}
        pageSize={50}
      />

      <StudentImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} onImported={imported} />
    </div>
  );
}

export default StudentsPage;
