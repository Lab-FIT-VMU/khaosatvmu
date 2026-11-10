import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ClassDumbbell } from './ClassDumbbell';
import { courseGradeAnalysisApi } from '../../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../../services/courseGradesApi';
import type { AnalysisCourse, AnalysisOverview, AnalysisSection } from '../../types/courseGradeAnalysis';
import { COLORS, pct, signed, vi, viInt } from './courseGradeFormat';
import { EXPLAIN, FLAG_VS_MARKER, fillText } from './courseGradeExplanations';
import { Field, FlagChips, MarkerChips, RichText, SectionCard, StableChips } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  semesterId: number;
  courses: AnalysisCourse[];
  departmentId: number | null;
  courseCode: string | null;
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

type RelatedGroup = { ds: { ma: string; nhom: string; lecturer_name?: string | null; txt: string }[]; ghi?: string | null };

/**
 * Cấp bộ môn (trang "Cấp bộ môn" của bản audit): chọn một học phần của bộ môn; lớp liên quan đến
 * điểm lưu ý, bảng các lớp, hồ sơ một lớp theo 4 bước (bộ luật E) và điểm trung bình từng lớp.
 */
export function SectionsView({ overview, semesterId, courses, departmentId, courseCode, onCourseChange }: Props) {
  const [sections, setSections] = useState<AnalysisSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyInStats, setOnlyInStats] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const fdr = Number(overview.thresholds?.fdr_q ?? 0.05);
  const minStudents = viInt(Number(overview.thresholds?.so_sv_toi_thieu_lop ?? 15));

  const departmentCourses = useMemo(
    () => courses.filter((c) => departmentId === null || c.departmentId === departmentId)
      .sort((a, b) => a.data.ten.localeCompare(b.data.ten, 'vi')),
    [courses, departmentId],
  );
  // Như bản audit: chưa chọn (hoặc học phần không thuộc bộ môn) thì mở học phần đủ điều kiện so sánh đầu tiên.
  const course = departmentCourses.find((c) => c.baseCourseCode === courseCode)
    ?? departmentCourses.find((c) => c.data.du_dk) ?? departmentCourses[0] ?? null;
  const activeCode = course?.baseCourseCode ?? null;
  useEffect(() => {
    if (activeCode !== courseCode) onCourseChange(activeCode);
  }, [activeCode, courseCode, onCourseChange]);

  const related = Object.entries((course?.data.gp ?? {}) as Record<string, RelatedGroup>);

  useEffect(() => {
    setProfileId(null);
    if (!activeCode) {
      setSections([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    courseGradeAnalysisApi.sections(semesterId, { courseCode: activeCode })
      .then((rows) => { if (!cancelled) setSections(rows); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được danh sách lớp.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [semesterId, activeCode]);

  const sorted = [...sections].sort((a, b) => a.data.nhom.localeCompare(b.data.nhom) || a.data.ma.localeCompare(b.data.ma));
  const shown = sorted.filter((s) => !onlyInStats || s.includedInStats);
  const withProfile = sorted.filter((s) => s.profile);
  // Lớp mở sẵn: lớp có nhiều dấu hiệu nhất (đặc điểm, mức chênh lớn), như bản audit.
  const score = (s: AnalysisSection) => s.markers.length * 2 + Math.abs(s.data.i7 ?? 0);
  const profileOf = withProfile.find((s) => s.courseSectionId === profileId)
    ?? [...withProfile].sort((a, b) => score(b) - score(a))[0] ?? null;
  const profile = profileOf?.profile;
  const termLabel = new Map(overview.terms.map((t) => [t.termCode, t.label]));
  const className = (s: AnalysisSection) => `${s.data.ten} (${s.data.nhom})`;

  const openProfile = (id: number) => {
    setProfileId(id);
    window.requestAnimationFrame(() => document.getElementById('cga-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  if (departmentCourses.length === 0) {
    return (
      <div className="cga-empty">
        <p><strong>Bộ môn chưa có học phần nào trong học kỳ này</strong></p>
        <p className="cga-muted">Chọn bộ môn hoặc học kỳ khác ở thanh phía trên.</p>
      </div>
    );
  }

  return (
    <div className="cga-stack">
      <section className="cga-card cga-course-picker">
        <div className="cga-course-picker__row">
          <Field label={`Chọn học phần (bộ môn có ${viInt(departmentCourses.length)} học phần trong kỳ)`} wide>
            <select value={activeCode ?? ''} onChange={(event) => onCourseChange(event.target.value || null)}>
              {departmentCourses.map((c) => (
                <option key={c.baseCourseCode} value={c.baseCourseCode}>
                  {c.data.ten} – mã {c.baseCourseCode}{c.flags.length ? ' · có điểm lưu ý' : ''}
                </option>
              ))}
            </select>
          </Field>
          {course && (
            <>
              <div className="cga-field"><span>Điểm lưu ý của học phần trong học kỳ này</span><FlagChips codes={course.flags} /></div>
              <div className="cga-field"><span>Ổn định, đồng đều</span><StableChips codes={course.stableStates} pending={course.data.cdl} /></div>
            </>
          )}
        </div>
        {course?.data.hai_he && <p className="cga-note">Học phần có cả lớp đại trà và lớp chất lượng cao; các mã được gộp để so sánh.</p>}
        {course && typeof course.data.ky_truoc === 'string' && (
          <p className="cga-note">Điểm thi được so sánh với {termLabel.get(course.data.ky_truoc) ?? course.data.ky_truoc} (lần mở gần nhất trước đó).</p>
        )}
        {course?.data.h5_ly_do === 'lich_su' && (
          <p className="cga-note">
            Tỷ lệ trượt do điểm thi kỳ này {pct(course.data.i2)}, cao hơn rõ so với {pct(Number(course.data.i2_lich_su ?? 0))} của các kỳ trước của chính học phần.
          </p>
        )}
      </section>

      {course && course.flags.length > 0 && (
        <SectionCard
          title="Lớp nào liên quan đến điểm lưu ý của học phần?"
          description="Với mỗi điểm lưu ý, hệ thống chỉ ra các lớp liên quan nhiều nhất để bộ môn biết bắt đầu xem xét từ đâu."
        >
          <details className="cga-explain">
            <summary>Điểm lưu ý của học phần và đặc điểm của lớp khác nhau thế nào?</summary>
            <dl>
              {FLAG_VS_MARKER.map(([term, text]) => (
                <div key={term}>
                  <dt><RichText text={term} /></dt>
                  <dd><RichText text={fillText(text, { d1: vi(Number(overview.thresholds?.d1_d2_lech_x ?? 1), 1) })} /></dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead><tr><th>Điểm lưu ý</th><th>Lớp liên quan</th></tr></thead>
              <tbody>
                {course.flags.map((flag) => {
                  const group = related.find(([code]) => code === flag)?.[1];
                  return (
                    <tr key={flag}>
                      <td><FlagChips codes={[flag]} /></td>
                      <td>
                        {group && group.ds.length > 0 && (
                          <ul className="cga-list">
                            {group.ds.map((entry) => (
                              <li key={`${entry.ma}|${entry.nhom}`}>
                                <strong>{course.data.ten} ({entry.nhom})</strong>{entry.ma !== course.baseCourseCode ? ` – mã ${entry.ma}` : ''}
                                {entry.lecturer_name ? ` – ${entry.lecturer_name}` : ''}: {entry.txt}
                              </li>
                            ))}
                          </ul>
                        )}
                        {group?.ghi && <p className="cga-note">{group.ghi}</p>}
                        {!group && <span className="cga-muted">Không chỉ ra được lớp cụ thể: điểm lưu ý đến từ cả học phần.</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {error && <div className="cga-alert" role="alert">{error}</div>}
      {loading && <div className="cga-state"><LoaderCircle className="spin" /> Đang tải các lớp...</div>}

      {course && !loading && sorted.length > 0 && (
        <SectionCard
          title={`Các lớp của học phần “${course.data.ten}”`}
          description={`${viInt(sorted.length)} lớp, trong đó ${viInt(sorted.length - sorted.filter((s) => s.includedInStats).length)} lớp không đưa vào thống kê. Bấm vào tên lớp để mở hồ sơ lớp.`}
          explain={EXPLAIN.departmentClasses}
          explainKind="table"
          explainValues={{ n: minStudents }}
          filters={(
            <Field label="Hiển thị">
              <select value={onlyInStats ? '1' : ''} onChange={(event) => setOnlyInStats(event.target.value === '1')}>
                <option value="">Tất cả các lớp</option>
                <option value="1">Chỉ lớp được đưa vào thống kê</option>
              </select>
            </Field>
          )}
        >
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr>
                  <th className="cga-sticky">Lớp học phần</th><th>Giảng viên</th><th className="num">Sĩ số</th>
                  <th className="num">Số SV đủ tư cách dự thi</th>
                  <th className="num">Tỷ lệ mất tư cách<span className="cga-unit">%</span></th>
                  <th className="num">Tỷ lệ trượt do điểm thi<span className="cga-unit">%</span></th>
                  <th className="num">Điểm quá trình trung bình</th><th className="num">Điểm thi trung bình</th>
                  <th>Điểm quá trình so với kỳ vọng<span className="cga-unit">I7, điểm</span></th>
                  <th>Điểm thi so với kỳ vọng<span className="cga-unit">I8, điểm</span></th>
                  <th>Đặc điểm lớp</th><th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.courseSectionId} className={s.includedInStats ? undefined : 'cga-row-muted'}>
                    <td className="cga-sticky">
                      {s.profile
                        ? <button type="button" className="cga-link" title="Mở hồ sơ lớp" onClick={() => openProfile(s.courseSectionId)}><strong>{className(s)}</strong></button>
                        : <strong>{className(s)}</strong>}
                      {s.data.ma !== course.baseCourseCode && <span className="cga-course-code">Mã {s.data.ma}</span>}
                    </td>
                    <td className="cga-nowrap">{s.lecturerName ?? <span className="cga-muted">Chưa xác định</span>}</td>
                    <td className="num">{viInt(s.data.si_so)}</td>
                    <td className="num">{viInt(s.data.n_p)}</td>
                    <td className="num">{pct(s.data.i1)}</td>
                    <td className="num">{pct(s.data.i2)}</td>
                    <td className="num">{vi(s.data.x_tb)}</td>
                    <td className="num">{vi(s.data.y_tb)}</td>
                    <td><CiBar value={s.data.i7} low={s.data.i7_lo} high={s.data.i7_hi} significant={(s.data.i7_q ?? 1) < fdr} /></td>
                    <td><CiBar value={s.data.i8} low={s.data.i8_lo} high={s.data.i8_hi} significant={(s.data.i8_q ?? 1) < fdr} /></td>
                    <td><MarkerChips codes={s.markers} /></td>
                    <td>
                      {!s.includedInStats
                        ? <span className="cga-tag">Không đưa vào thống kê</span>
                        : s.data.tct ? <span className="cga-tag">Ít sinh viên – đọc thận trọng</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {course && !loading && profileOf && profile && (
        <SectionCard
          id="cga-profile"
          title={`Hồ sơ một lớp: ${className(profileOf)}${profileOf.lecturerName ? ` – ${profileOf.lecturerName}` : ''}`}
          description="Đọc lần lượt 4 bước để hiểu lớp này so với các lớp khác cùng học phần. Chọn lớp khác ở ô dưới đây, hoặc bấm vào tên lớp trong bảng phía trên."
          filters={(
            <Field label="Chọn lớp" wide>
              <select value={profileOf.courseSectionId} onChange={(event) => setProfileId(Number(event.target.value))}>
                {withProfile.map((s) => (
                  <option key={s.courseSectionId} value={s.courseSectionId}>
                    {className(s)}{s.lecturerName ? ` – ${s.lecturerName}` : ''}{s.markers.length ? ' · có đặc điểm' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
        >
          <div className="cga-profile">
            <section>
              <h3>Bước 1. {profile.tieu_de?.[0] ?? 'Lớp liên quan thế nào đến điểm lưu ý của học phần?'}</h3>
              {profile.b1.length > 0
                ? <ul>{profile.b1.map((line, i) => <li key={i}><RichText text={line} /></li>)}</ul>
                : <p><RichText text={profile.b1_trong ?? ''} /></p>}
            </section>
            <section>
              <h3>Bước 2. {profile.tieu_de?.[1] ?? 'Số liệu của lớp so với cả học phần'}</h3>
              <div className="cga-table-wrap">
                <table className="cga-table">
                  <thead><tr><th>Chỉ số</th><th className="num">Lớp</th><th className="num">Cả học phần</th><th className="num">Khoảng các lớp</th><th>Nhận xét</th></tr></thead>
                  <tbody>
                    {profile.b2.map((row, i) => (
                      <tr key={i}><td>{row[0]}</td><td className="num"><strong>{row[1]}</strong></td><td className="num">{row[2]}</td><td className="num">{row[3]}</td><td><RichText text={row[4]} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h3>Bước 3. {profile.tieu_de?.[2] ?? 'Giảng viên qua các học kỳ'}</h3>
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
              <details className="cga-step">
                <summary><h3>Bước 4. {profile.tieu_de?.[3] ?? 'Câu hỏi gợi ý trao đổi'}</h3><span>{viInt(profile.b4.length)} câu hỏi · bấm để xem</span></summary>
                <ol>{profile.b4.map((line, i) => <li key={i}><RichText text={line} /></li>)}</ol>
                {profile.luu_y && <p className="cga-note"><RichText text={profile.luu_y} /></p>}
              </details>
            </section>
          </div>
        </SectionCard>
      )}

      {course && !loading && sections.length > 0 && (
        <SectionCard
          title="Điểm quá trình và điểm thi trung bình của từng lớp"
          description="Mỗi dòng là một lớp được đưa vào thống kê. Di chuột vào hình tròn hoặc hình vuông để xem số liệu."
          explain={EXPLAIN.departmentDumbbell}
        >
          <ClassDumbbell sections={sections} baseCourseCode={course.baseCourseCode} />
        </SectionCard>
      )}
    </div>
  );
}
