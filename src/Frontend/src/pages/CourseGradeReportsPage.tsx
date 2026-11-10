import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, Printer } from 'lucide-react';
import { GlossaryView } from '../components/courseGrades/GlossaryView';
import { SchoolOverview } from '../components/courseGrades/SchoolOverview';
import { SectionsView } from '../components/courseGrades/SectionsView';
import { TrendsView, type TrendsTab } from '../components/courseGrades/TrendsView';
import { UnitView } from '../components/courseGrades/UnitView';
import { PageHead, RichText } from '../components/courseGrades/courseGradeUi';
import { fillText } from '../components/courseGrades/courseGradeExplanations';
import { viInt } from '../components/courseGrades/courseGradeFormat';
import type { CourseGradeReportView } from '../components/courseGrades/reportViews';
import { courseGradeAnalysisApi } from '../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../services/courseGradesApi';
import type { AnalysisCourse, AnalysisOverview } from '../types/courseGradeAnalysis';
import '../styles/course-grade-reports.css';

/*
  Phân tích điểm học phần → Báo cáo. Bốn cấp như các trang của bản audit, mỗi cấp một mục trên
  sidebar: Cấp Ban giám hiệu, Cấp khoa / viện, Cấp bộ môn, Diễn biến qua các học kỳ (thêm trang
  Giải thích thuật ngữ).

  Đọc kết quả của lượt tính hiện hành (worker Python). Phạm vi do backend lọc: quản trị hệ thống,
  quản trị khảo sát, Ban giám hiệu xem hết; quản lý khoa / bộ môn chỉ thấy đơn vị mình. Học kỳ,
  khoa, bộ môn chọn ở thanh trên cùng và được giữ khi chuyển giữa các cấp.
*/

const RUN_STATUS: Record<string, string> = {
  Queued: 'đang chờ tính',
  Running: 'đang tính',
  Succeeded: 'đã tính xong',
  Failed: 'tính lỗi',
};

interface Selection {
  semesterId: number | null;
  facultyId: number | null;
  departmentId: number | null;
  courseCode: string | null;
  trendsTab: TrendsTab;
}

const SELECTION_KEY = 'khaosatvmu.courseGradeReports.selection';
const EMPTY_SELECTION: Selection = { semesterId: null, facultyId: null, departmentId: null, courseCode: null, trendsTab: 'courses' };

function readSelection(): Selection {
  try {
    const raw = window.sessionStorage.getItem(SELECTION_KEY);
    return raw ? { ...EMPTY_SELECTION, ...JSON.parse(raw) as Partial<Selection> } : EMPTY_SELECTION;
  } catch {
    return EMPTY_SELECTION;
  }
}

const CRUMB: Record<CourseGradeReportView, string> = {
  school: 'Báo cáo · Cấp Ban giám hiệu',
  faculty: 'Báo cáo · Cấp khoa / viện',
  department: 'Báo cáo · Cấp bộ môn',
  trends: 'Báo cáo · Diễn biến qua các học kỳ',
  glossary: 'Trợ giúp',
};

interface Props {
  view: CourseGradeReportView;
  /** Chuyển sang cấp khác (mục khác trên sidebar), giữ lựa chọn hiện tại. */
  onNavigate: (view: CourseGradeReportView) => void;
}

export function CourseGradeReportsPage({ view, onNavigate }: Props) {
  const [overview, setOverview] = useState<AnalysisOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(readSelection);
  const [courses, setCourses] = useState<AnalysisCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const { semesterId, facultyId, departmentId, courseCode, trendsTab } = selection;

  const update = useCallback((patch: Partial<Selection>) => {
    setSelection((current) => {
      const next = { ...current, ...patch };
      try { window.sessionStorage.setItem(SELECTION_KEY, JSON.stringify(next)); } catch { /* bỏ qua: chỉ để tiện */ }
      return next;
    });
  }, []);

  useEffect(() => {
    courseGradeAnalysisApi.overview()
      .then((data) => {
        setOverview(data);
        // Lựa chọn đã lưu không còn hợp lệ (kỳ bị gỡ, đổi vai trò) thì về mặc định như bản audit.
        setSelection((current) => {
          const semester = data.terms.some((t) => t.semesterId === current.semesterId)
            ? current.semesterId : data.terms.at(-1)?.semesterId ?? null;
          const faculty = data.viewLevel === 'unit' && data.scopeFacultyId !== null
            ? data.scopeFacultyId
            : data.faculties.some((f) => f.id === current.facultyId) ? current.facultyId : data.faculties[0]?.id ?? null;
          const inFaculty = data.departments.filter((d) => faculty === null || d.facultyId === faculty);
          const department = data.scopeDepartmentId
            ?? (inFaculty.some((d) => d.id === current.departmentId) ? current.departmentId : inFaculty[0]?.id ?? null);
          return { ...current, semesterId: semester, facultyId: faculty, departmentId: department };
        });
      })
      .catch((loadError) => setError(courseGradeErrorMessage(loadError, 'Không tải được báo cáo phân tích điểm.')));
  }, []);

  useEffect(() => {
    if (semesterId === null || view === 'glossary') return;
    let cancelled = false;
    setLoadingCourses(true);
    courseGradeAnalysisApi.courses(semesterId)
      .then((data) => { if (!cancelled) setCourses(data); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được kết quả học phần.')); })
      .finally(() => { if (!cancelled) setLoadingCourses(false); });
    return () => { cancelled = true; };
  }, [semesterId, view]);

  const term = useMemo(() => overview?.terms.find((t) => t.semesterId === semesterId) ?? null, [overview, semesterId]);
  const departmentsOfFaculty = useMemo(
    () => (overview?.departments ?? []).filter((d) => facultyId === null || d.facultyId === facultyId),
    [overview, facultyId],
  );

  const changeFaculty = (next: number | null) => {
    const first = (overview?.departments ?? []).find((d) => next === null || d.facultyId === next);
    update({ facultyId: next, departmentId: first?.id ?? null, courseCode: null });
  };
  const openCourse = useCallback((department: number | null, code: string) => {
    update({ departmentId: department, courseCode: code });
    onNavigate('department');
  }, [onNavigate, update]);
  const openLecturerTrends = useCallback((department: number | null) => {
    update({ ...(department !== null ? { departmentId: department } : {}), trendsTab: 'lecturers' });
    onNavigate('trends');
  }, [onNavigate, update]);

  if (error) {
    return <div className="cga-page"><div className="cga-alert" role="alert"><CircleAlert size={16} /> {error}</div></div>;
  }
  if (!overview) {
    return <div className="cga-page"><div className="cga-state"><LoaderCircle className="spin" /> Đang tải báo cáo...</div></div>;
  }

  const latest = overview.latestRun;
  const runNote = latest && latest.runId !== overview.runId
    ? `Lượt tính mới nhất ${RUN_STATUS[latest.status] ?? latest.status}${latest.status === 'Failed' ? '' : '; báo cáo sẽ cập nhật khi tính xong'}.`
    : null;
  const facultyName = overview.faculties.find((f) => f.id === facultyId)?.name ?? 'Khoa đã chọn';
  const departmentName = overview.departments.find((d) => d.id === departmentId)?.name ?? 'Bộ môn đã chọn';
  const termLabel = term?.label ?? '';
  const termIndex = term ? (overview.crossTerm?.ky ?? []).indexOf(term.termCode) : -1;
  const facultyCourses = courses.filter((c) => c.facultyId === facultyId);

  // Thanh ngữ cảnh: học kỳ ở mọi cấp; khoa ở cấp khoa, bộ môn, diễn biến; bộ môn ở cấp bộ môn và diễn biến.
  const showFaculty = (view === 'faculty' || view === 'department' || view === 'trends') && overview.faculties.length > 1;
  const showDepartment = view === 'department' || view === 'trends';
  const contextBar = view !== 'glossary' && overview.terms.length > 0 && (
    <div className="cga-context">
      <label className="cga-context__field">
        Học kỳ
        <select value={semesterId ?? ''} onChange={(event) => update({ semesterId: Number(event.target.value) })}>
          {[...overview.terms].reverse().map((t) => <option key={t.semesterId} value={t.semesterId}>{t.label}</option>)}
        </select>
      </label>
      {showFaculty && (
        <label className="cga-context__field">
          Khoa / viện
          <select value={facultyId ?? ''} onChange={(event) => changeFaculty(event.target.value ? Number(event.target.value) : null)}>
            {overview.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}
      {showDepartment && departmentsOfFaculty.length > 0 && (
        <label className="cga-context__field">
          Bộ môn
          <select value={departmentId ?? ''} onChange={(event) => update({ departmentId: Number(event.target.value), courseCode: null })}>
            {departmentsOfFaculty.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {overview.viewLevel === 'unit' && <span className="cga-context__note">Đang xem trong phạm vi đơn vị của bạn</span>}
    </div>
  );

  const head = (() => {
    switch (view) {
      case 'school':
        return {
          title: overview.viewLevel === 'unit' ? 'Tổng quan đơn vị' : 'Tổng quan toàn trường',
          description: `${termLabel}. Báo cáo cấp trường **không hiển thị tên giảng viên và mã lớp**. Các tỷ lệ chung chỉ để mô tả tình hình, **không dùng để xếp hạng** khoa hay bộ môn.`,
        };
      case 'faculty': {
        const departmentCount = new Set(facultyCourses.map((c) => c.departmentId)).size;
        const sectionCount = facultyCourses.reduce((sum, c) => sum + (c.data.so_lop ?? 0), 0);
        return {
          title: facultyName,
          description: `${termLabel} · ${viInt(departmentCount)} bộ môn · ${viInt(facultyCourses.length)} học phần · ${viInt(sectionCount)} lớp. Báo cáo cấp khoa hiển thị tên giảng viên và dùng để chọn học phần cần ưu tiên rà soát, không dùng để xếp hạng bộ môn.`,
        };
      }
      case 'department':
        return {
          title: `Bộ môn ${departmentName}`,
          description: `${termLabel} · ${facultyName}. Mỗi học phần có một trang riêng. Chỉ so sánh **giữa các lớp trong cùng một học phần, cùng một học kỳ**, vì các lớp này dùng chung đề thi.`,
        };
      case 'trends':
        return {
          title: 'Diễn biến qua các học kỳ',
          description: `${facultyName} · ${viInt(termIndex + 1)} học kỳ tính đến học kỳ đang chọn. Một điểm lưu ý xuất hiện ở một học kỳ có thể chỉ là dao động ngẫu nhiên; chỉ nên chú ý khi **cùng một đặc điểm lặp lại ở cùng một học phần qua từ 2 học kỳ trở lên**.`,
        };
      default:
        return {
          title: 'Giải thích thuật ngữ',
          description: 'Tên và ý nghĩa các chỉ số, điểm lưu ý, đặc điểm lớp và trạng thái ổn định dùng trong báo cáo.',
        };
    }
  })();

  return (
    <div className="cga-page">
      {contextBar}
      <PageHead
        crumb={CRUMB[view]}
        title={head.title}
        description={<RichText text={fillText(head.description)} />}
        actions={view === 'school' && overview.runId !== null ? (
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> In báo cáo
          </button>
        ) : undefined}
      />

      {runNote && <div className="cga-info">{runNote}</div>}

      {view === 'glossary' ? <GlossaryView overview={overview} /> : overview.runId === null ? (
        <div className="cga-empty">
          <p><strong>Chưa có kết quả phân tích.</strong></p>
          <p className="cga-muted">
            {latest
              ? `Lượt tính gần nhất ${RUN_STATUS[latest.status] ?? latest.status}${latest.errorMessage ? `: ${latest.errorMessage}` : ''}.`
              : 'Hãy nạp điểm ở mục “Tải lên dữ liệu điểm”; kết quả có ngay sau khi tính xong.'}
          </p>
        </div>
      ) : loadingCourses ? (
        <div className="cga-state"><LoaderCircle className="spin" /> Đang tải kết quả học kỳ...</div>
      ) : term && semesterId !== null && (
        <>
          {view === 'school' && <SchoolOverview overview={overview} semesterId={semesterId} courses={courses} />}
          {view === 'faculty' && (
            <UnitView
              overview={overview}
              termCode={term.termCode}
              courses={courses}
              facultyId={facultyId}
              onOpenCourse={openCourse}
              onOpenTrends={openLecturerTrends}
            />
          )}
          {view === 'department' && (
            <SectionsView
              overview={overview}
              semesterId={semesterId}
              courses={courses}
              departmentId={departmentId}
              courseCode={courseCode}
              onCourseChange={(code) => update({ courseCode: code })}
            />
          )}
          {view === 'trends' && (
            <TrendsView
              overview={overview}
              termCode={term.termCode}
              courses={courses}
              facultyId={facultyId}
              departmentId={departmentId}
              tab={trendsTab}
              onTabChange={(next) => update({ trendsTab: next })}
            />
          )}
        </>
      )}
    </div>
  );
}

export default CourseGradeReportsPage;
