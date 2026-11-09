import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CircleAlert, LoaderCircle } from 'lucide-react';
import { GlossaryView } from '../components/courseGrades/GlossaryView';
import { SchoolOverview } from '../components/courseGrades/SchoolOverview';
import { SectionsView } from '../components/courseGrades/SectionsView';
import { TrendsView } from '../components/courseGrades/TrendsView';
import { UnitView } from '../components/courseGrades/UnitView';
import { courseGradeAnalysisApi } from '../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../services/courseGradesApi';
import type { AnalysisCourse, AnalysisOverview } from '../types/courseGradeAnalysis';
import '../styles/course-grade-reports.css';

/*
  Phân tích điểm học phần → Báo cáo phân tích.

  Đọc kết quả của lượt tính hiện hành (worker Python). Phạm vi do backend lọc: quản trị hệ thống,
  quản trị khảo sát, Ban giám hiệu xem hết; quản lý khoa / bộ môn chỉ thấy đơn vị mình.
  Các tab tương ứng các trang của module audit: toàn trường, khoa / bộ môn, lớp và hồ sơ, diễn biến,
  giải thích thuật ngữ.
*/

type Tab = 'school' | 'unit' | 'sections' | 'trends' | 'glossary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'school', label: 'Toàn trường' },
  { id: 'unit', label: 'Khoa / bộ môn' },
  { id: 'sections', label: 'Lớp và hồ sơ lớp' },
  { id: 'trends', label: 'Diễn biến qua các kỳ' },
  { id: 'glossary', label: 'Thuật ngữ' },
];

const RUN_STATUS: Record<string, string> = {
  Queued: 'đang chờ tính',
  Running: 'đang tính',
  Succeeded: 'đã tính xong',
  Failed: 'tính lỗi',
};

export function CourseGradeReportsPage() {
  const [overview, setOverview] = useState<AnalysisOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semesterId, setSemesterId] = useState<number | null>(null);
  const [courses, setCourses] = useState<AnalysisCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [tab, setTab] = useState<Tab>('school');
  const [facultyId, setFacultyId] = useState<number | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [courseCode, setCourseCode] = useState<string | null>(null);

  useEffect(() => {
    courseGradeAnalysisApi.overview()
      .then((data) => {
        setOverview(data);
        setSemesterId(data.terms.at(-1)?.semesterId ?? null);
        if (data.viewLevel === 'unit') {
          setFacultyId(data.scopeFacultyId);
          setDepartmentId(data.scopeDepartmentId ?? data.departments[0]?.id ?? null);
        } else {
          setDepartmentId(data.departments[0]?.id ?? null);
        }
      })
      .catch((loadError) => setError(courseGradeErrorMessage(loadError, 'Không tải được báo cáo phân tích điểm.')));
  }, []);

  useEffect(() => {
    if (semesterId === null) return;
    let cancelled = false;
    setLoadingCourses(true);
    courseGradeAnalysisApi.courses(semesterId)
      .then((data) => { if (!cancelled) setCourses(data); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được kết quả học phần.')); })
      .finally(() => { if (!cancelled) setLoadingCourses(false); });
    return () => { cancelled = true; };
  }, [semesterId]);

  const term = useMemo(() => overview?.terms.find((t) => t.semesterId === semesterId) ?? null, [overview, semesterId]);
  const openCourse = useCallback((department: number | null, code: string) => {
    setDepartmentId(department);
    setCourseCode(code);
    setTab('sections');
  }, []);
  const openTrends = useCallback((department: number | null) => {
    if (department !== null) setDepartmentId(department);
    setTab('trends');
  }, []);

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

  return (
    <div className="cga-page">
      <header className="cga-heading">
        <div className="cga-heading__title">
          <BarChart3 size={20} aria-hidden="true" />
          <div>
            <h2>Báo cáo phân tích điểm học phần</h2>
            <p>
              So sánh các lớp trong cùng học phần, cùng học kỳ. Điểm lưu ý mang nghĩa “cần xem xét”, không đánh giá giảng viên.
              {overview.viewLevel === 'unit' && ' Đang xem trong phạm vi đơn vị của bạn.'}
            </p>
          </div>
        </div>
        {overview.terms.length > 0 && (
          <label className="cga-inline-field">
            Học kỳ
            <select value={semesterId ?? ''} onChange={(event) => setSemesterId(Number(event.target.value))}>
              {[...overview.terms].reverse().map((t) => <option key={t.semesterId} value={t.semesterId}>{t.label}</option>)}
            </select>
          </label>
        )}
      </header>

      {runNote && <div className="cga-info">{runNote}</div>}

      {overview.runId === null ? (
        <div className="cga-empty">
          <p>Chưa có kết quả phân tích.</p>
          <p className="cga-muted">
            {latest
              ? `Lượt tính gần nhất ${RUN_STATUS[latest.status] ?? latest.status}${latest.errorMessage ? `: ${latest.errorMessage}` : ''}.`
              : 'Hãy nạp điểm ở mục “Tải lên dữ liệu điểm”; kết quả có sau khi worker tính xong.'}
          </p>
        </div>
      ) : (
        <>
          <nav className="cga-tabs" aria-label="Cấp báo cáo">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={t.id === tab ? 'is-active' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          {tab === 'glossary' && <GlossaryView overview={overview} />}
          {tab !== 'glossary' && loadingCourses && <div className="cga-state"><LoaderCircle className="spin" /> Đang tải kết quả học kỳ...</div>}
          {tab !== 'glossary' && !loadingCourses && term && semesterId !== null && (
            <>
              {tab === 'school' && <SchoolOverview overview={overview} semesterId={semesterId} courses={courses} />}
              {tab === 'unit' && (
                <UnitView
                  overview={overview}
                  termCode={term.termCode}
                  courses={courses}
                  facultyId={facultyId}
                  onFacultyChange={setFacultyId}
                  onOpenCourse={openCourse}
                  onOpenTrends={openTrends}
                />
              )}
              {tab === 'sections' && (
                <SectionsView
                  overview={overview}
                  semesterId={semesterId}
                  courses={courses}
                  departmentId={departmentId}
                  courseCode={courseCode}
                  onDepartmentChange={setDepartmentId}
                  onCourseChange={setCourseCode}
                />
              )}
              {tab === 'trends' && (
                <TrendsView
                  overview={overview}
                  termCode={term.termCode}
                  courses={courses}
                  departmentId={departmentId}
                  onDepartmentChange={setDepartmentId}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default CourseGradeReportsPage;
