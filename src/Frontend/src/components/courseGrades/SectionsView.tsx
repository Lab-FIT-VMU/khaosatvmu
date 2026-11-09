import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Modal } from '../Modal';
import { courseGradeAnalysisApi } from '../../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../../services/courseGradesApi';
import type { AnalysisCourse, AnalysisOverview, AnalysisSection } from '../../types/courseGradeAnalysis';
import { FLAG_LABELS } from './courseGradeLabels';
import { COLORS, pct, signed, vi, viInt } from './courseGradeFormat';
import { FlagChips, MarkerChips, RichText, SectionCard, StableChips } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  semesterId: number;
  courses: AnalysisCourse[];
  departmentId: number | null;
  courseCode: string | null;
  onDepartmentChange: (departmentId: number | null) => void;
  onCourseChange: (courseCode: string | null) => void;
}

/** Thanh khoảng tin cậy nhỏ (forest plot thu gọn) cho I7 / I8, thang −3…+3 điểm. */
function CiBar({ value, low, high, significant }: { value?: number | null; low?: number | null; high?: number | null; significant: boolean }) {
  if (value == null) return <span className="cga-muted">—</span>;
  const span = 3;
  const x = (v: number) => 50 + (Math.max(-span, Math.min(span, v)) / span) * 46;
  const color = value > 0 ? COLORS.up : value < 0 ? COLORS.down : '#94a3b8';
  return (
    <span className="cga-ci">
      <svg viewBox="0 0 100 14" width="96" height="14" aria-hidden="true">
        <line x1="50" y1="1" x2="50" y2="13" stroke="#cbd5e1" />
        {low != null && high != null && <line x1={x(low)} y1="7" x2={x(high)} y2="7" stroke={color} strokeWidth="2" />}
        <circle cx={x(value)} cy="7" r="3.2" fill={significant ? color : '#fff'} stroke={color} strokeWidth="1.5" />
      </svg>
      <span>{signed(value)}</span>
    </span>
  );
}

/** Cấp bộ môn: các lớp của một học phần và hồ sơ từng lớp (bộ luật E). */
export function SectionsView({ overview, semesterId, courses, departmentId, courseCode, onDepartmentChange, onCourseChange }: Props) {
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileOf, setProfileOf] = useState<AnalysisSection | null>(null);
  const fdr = Number(overview.thresholds?.fdr_q ?? 0.05);

  const departmentCourses = useMemo(
    () => courses.filter((c) => departmentId === null || c.departmentId === departmentId)
      .sort((a, b) => a.data.ten.localeCompare(b.data.ten, 'vi')),
    [courses, departmentId],
  );
  const course = courses.find((c) => c.baseCourseCode === courseCode) ?? null;
  // Lớp liên quan đến từng điểm lưu ý (gp) của học phần, tên giảng viên do API điền.
  const related = Object.entries(
    (course?.data.gp ?? {}) as Record<string, { ds: { ma: string; nhom: string; lecturer_name?: string | null; txt: string }[]; ghi?: string | null }>,
  );

  useEffect(() => {
    if (!courseCode) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    courseGradeAnalysisApi.sections(semesterId, { courseCode })
      .then((rows) => { if (!cancelled) setSections(rows); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được danh sách lớp.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [semesterId, courseCode]);

  const sorted = [...sections].sort((a, b) => a.data.nhom.localeCompare(b.data.nhom) || a.data.ma.localeCompare(b.data.ma));
  const profile = profileOf?.profile;

  return (
    <div className="cga-stack">
      <div className="cga-filters">
        <label className="cga-inline-field">
          Bộ môn
          <select value={departmentId ?? ''} onChange={(event) => { onDepartmentChange(event.target.value ? Number(event.target.value) : null); onCourseChange(null); }}>
            {overview.viewLevel === 'full' && <option value="">Tất cả bộ môn</option>}
            {overview.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="cga-inline-field">
          Học phần
          <select value={courseCode ?? ''} onChange={(event) => onCourseChange(event.target.value || null)}>
            <option value="">Chọn học phần</option>
            {departmentCourses.map((c) => (
              <option key={c.baseCourseCode} value={c.baseCourseCode}>
                {c.data.ten} ({c.baseCourseCode}){c.flags.length ? ` · ${c.flags.join(', ')}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!course && <p className="cga-muted">Chọn một học phần để xem các lớp và hồ sơ từng lớp.</p>}

      {course && (
        <SectionCard
          title={`${course.data.ten} (${course.baseCourseCode})`}
          description={`${viInt(course.data.so_lop)} lớp, ${viInt(course.data.so_lop_tk)} lớp được đưa vào thống kê${course.data.du_dk ? '' : ' — chưa đủ lớp để so sánh giữa các lớp'}${course.data.hai_he ? '; có cả lớp đại trà và chất lượng cao' : ''}.`}
        >
          <div className="cga-course-summary">
            <div><span>Điểm lưu ý</span><FlagChips codes={course.flags} /></div>
            <div><span>Ổn định, đồng đều</span><StableChips codes={course.stableStates} pending={course.data.cdl} /></div>
            <div><span>Điểm quá trình / điểm thi trung bình</span>{vi(course.data.x_tb)} / {vi(course.data.y_tb)}</div>
            <div><span>Tương quan X–Y (r)</span>{vi(course.data.r)}</div>
            <div><span>ICC điểm quá trình / điểm thi</span>{vi(course.data.icc_x, 3)} / {vi(course.data.icc_y, 3)}</div>
          </div>
          {related.length > 0 && (
            <div className="cga-related">
              <h4>Lớp liên quan đến điểm lưu ý</h4>
              {related.map(([flag, group]) => (
                  <div key={flag} className="cga-related__group">
                    <strong>{flag} · {FLAG_LABELS[flag]?.name}</strong>
                    <ul>
                      {group.ds.map((entry) => (
                        <li key={`${entry.ma}|${entry.nhom}`}>
                          {entry.nhom}{entry.lecturer_name ? ` (${entry.lecturer_name})` : ''}: {entry.txt}
                        </li>
                      ))}
                    </ul>
                    {group.ghi && <p className="cga-muted">{group.ghi}</p>}
                  </div>
                ))}
            </div>
          )}
        </SectionCard>
      )}

      {error && <div className="cga-alert" role="alert">{error}</div>}
      {loading && <div className="cga-state"><LoaderCircle className="spin" /> Đang tải các lớp...</div>}

      {course && !loading && sorted.length > 0 && (
        <SectionCard
          title="Các lớp"
          description="I7: điểm quá trình so với mức kỳ vọng ở sinh viên có cùng điểm thi. I8: điểm thi so với kỳ vọng theo năng lực nền. Chấm đặc: có ý nghĩa thống kê sau hiệu chỉnh nhiều phép thử."
        >
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr>
                  <th>Lớp</th><th>Giảng viên</th><th className="num">Sĩ số</th><th className="num">Đủ tư cách</th>
                  <th className="num">Mất tư cách</th><th className="num">Trượt do thi</th>
                  <th className="num">X̄ / Ȳ</th><th className="num">X − Y</th><th className="num">r</th>
                  <th>I7 (điểm quá trình)</th><th>I8 (điểm thi)</th><th>Đặc điểm</th><th aria-label="Hồ sơ" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.courseSectionId} className={s.includedInStats ? undefined : 'cga-row-muted'}>
                    <td><strong>{s.data.nhom}</strong>{s.data.ma !== s.baseCourseCode && <small className="cga-muted"> {s.data.ma}</small>}</td>
                    <td>{s.lecturerName ?? <span className="cga-muted">Chưa xác định</span>}</td>
                    <td className="num">{viInt(s.data.si_so)}</td>
                    <td className="num">{viInt(s.data.n_p)}{s.data.tct ? <small title="Ít sinh viên – đọc thận trọng"> *</small> : null}</td>
                    <td className="num">{pct(s.data.i1)}</td>
                    <td className="num">{pct(s.data.i2)}</td>
                    <td className="num">{vi(s.data.x_tb)} / {vi(s.data.y_tb)}</td>
                    <td className="num">{signed(s.data.i5)}</td>
                    <td className="num">{vi(s.data.r)}</td>
                    <td><CiBar value={s.data.i7} low={s.data.i7_lo} high={s.data.i7_hi} significant={(s.data.i7_q ?? 1) < fdr} /></td>
                    <td><CiBar value={s.data.i8} low={s.data.i8_lo} high={s.data.i8_hi} significant={(s.data.i8_q ?? 1) < fdr} /></td>
                    <td><MarkerChips codes={s.markers} /></td>
                    <td>
                      {s.profile
                        ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setProfileOf(s)}>Hồ sơ</button>
                        : <span className="cga-muted" title="Lớp không đủ sinh viên để đưa vào thống kê">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cga-note">* Ít sinh viên – đọc thận trọng. Dòng mờ: lớp không đưa vào thống kê (vẫn dạy bình thường, chỉ ít sinh viên đủ tư cách dự thi).</p>
        </SectionCard>
      )}

      <Modal
        isOpen={profileOf !== null}
        onClose={() => setProfileOf(null)}
        title={profileOf ? `Hồ sơ lớp ${profileOf.data.ten} – ${profileOf.data.nhom}${profileOf.lecturerName ? ` · ${profileOf.lecturerName}` : ''}` : ''}
        size="workspace"
      >
        {profile && (
          <div className="cga-profile">
            <section>
              <h4>1. {profile.tieu_de?.[0] ?? 'Lớp liên quan thế nào đến điểm lưu ý của học phần?'}</h4>
              {profile.b1.length > 0
                ? <ul>{profile.b1.map((line, i) => <li key={i}><RichText text={line} /></li>)}</ul>
                : <p><RichText text={profile.b1_trong ?? ''} /></p>}
            </section>
            <section>
              <h4>2. {profile.tieu_de?.[1] ?? 'Số liệu của lớp so với cả học phần'}</h4>
              <table className="cga-table cga-table--compact">
                <thead><tr><th>Chỉ số</th><th className="num">Lớp</th><th className="num">Cả học phần</th><th className="num">Khoảng các lớp</th><th>Nhận xét</th></tr></thead>
                <tbody>
                  {profile.b2.map((row, i) => (
                    <tr key={i}><td>{row[0]}</td><td className="num">{row[1]}</td><td className="num">{row[2]}</td><td className="num">{row[3]}</td><td>{row[4]}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section>
              <h4>3. {profile.tieu_de?.[2] ?? 'Giảng viên qua các học kỳ'}</h4>
              {profile.b3.map((line, i) => <p key={i}><RichText text={line} /></p>)}
              {profile.b3_chuoi && profile.b3_chuoi.gt.length > 0 && (
                <div className="cga-series">
                  {profile.b3_chuoi.gt.map((value, i) => (
                    <span key={profile.b3_chuoi!.ky[i]} title={profile.b3_chuoi!.nhan[i]}>
                      <small>{profile.b3_chuoi!.nhan[i]}</small>{signed(value)}
                    </span>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h4>4. {profile.tieu_de?.[3] ?? 'Câu hỏi gợi ý trao đổi'}</h4>
              <ul>{profile.b4.map((line, i) => <li key={i}><RichText text={line} /></li>)}</ul>
              {profile.luu_y && <p className="cga-note"><RichText text={profile.luu_y} /></p>}
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
