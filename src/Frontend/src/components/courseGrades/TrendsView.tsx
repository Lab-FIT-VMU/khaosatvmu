import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { courseGradeAnalysisApi } from '../../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../../services/courseGradesApi';
import type { AnalysisCourse, AnalysisLecturerCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { FLAG_CODES, FLAG_LABELS, MARKER_LABELS } from './courseGradeLabels';
import { COLORS, deviationColor, signed, vi, viInt } from './courseGradeFormat';
import { EXPLAIN } from './courseGradeExplanations';
import { Field, FlagChips, MarkerChips, RichText, SectionCard } from './courseGradeUi';

export type TrendsTab = 'courses' | 'lecturers' | 'exam';

const TABS: { id: TrendsTab; label: string }[] = [
  { id: 'courses', label: 'Điểm lưu ý của học phần' },
  { id: 'lecturers', label: 'Giảng viên' },
  { id: 'exam', label: 'Điểm thi' },
];

interface Props {
  overview: AnalysisOverview;
  termCode: string;
  courses: AnalysisCourse[];
  facultyId: number | null;
  departmentId: number | null;
  tab: TrendsTab;
  onTabChange: (tab: TrendsTab) => void;
}

/**
 * Diễn biến qua các học kỳ (trang "Truy vết" của bản audit), ba thẻ: điểm lưu ý của học phần qua các
 * kỳ (theo khoa), giảng viên qua các kỳ (chuỗi I7, đặc điểm, G1, câu xu hướng; theo bộ môn) và điểm
 * thi trung bình của học phần qua các kỳ (H6; theo khoa). Chỉ dùng các kỳ đến kỳ đang xem (E-P4).
 */
export function TrendsView({ overview, termCode, courses, facultyId, departmentId, tab, onTabChange }: Props) {
  const [rows, setRows] = useState<AnalysisLecturerCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flagFilter, setFlagFilter] = useState('');
  const [repeatedOnly, setRepeatedOnly] = useState(true);
  const [examCode, setExamCode] = useState<string | null>(null);
  const terms = useMemo(() => overview.crossTerm?.ky ?? [], [overview.crossTerm]);
  const termIndex = terms.indexOf(termCode);
  const visibleTerms = useMemo(() => (termIndex >= 0 ? terms.slice(0, termIndex + 1) : terms), [terms, termIndex]);
  const labelOf = new Map(overview.terms.map((t) => [t.termCode, t.label]));
  const nearZero = Number(overview.thresholds?.vung_gan_0 ?? 0.05);
  const strong = Number(overview.thresholds?.d1_d2_lech_x ?? 1);
  const examStep = Number(overview.thresholds?.h6_lech_y_giua_ky ?? 1);
  const departmentName = new Map(overview.departments.map((d) => [d.id, d.name]));
  const facultyName = overview.faculties.find((f) => f.id === facultyId)?.name ?? 'khoa đã chọn';

  useEffect(() => {
    if (tab !== 'lecturers') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    courseGradeAnalysisApi.lecturerCourses({ departmentId })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được diễn biến giảng viên.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId, tab]);

  const lecturerRows = useMemo(
    () => rows
      .filter((r) => visibleTerms.some((ky) => r.data.ky_day.includes(ky)))
      .sort((a, b) => (a.lecturerName ?? '').localeCompare(b.lecturerName ?? '', 'vi') || a.data.ten.localeCompare(b.data.ten, 'vi')),
    [rows, visibleTerms],
  );

  // Thẻ học phần: điểm lưu ý ở từng kỳ đến kỳ đang xem, học phần của khoa.
  const flagHistory = (overview.courses ?? [])
    .filter((c) => facultyId === null || c.facultyId === facultyId)
    .map((c) => ({ course: c, flags: visibleTerms.map((ky) => overview.crossTerm?.co_hp?.[c.baseCourseCode]?.[ky] ?? []) }))
    .filter((row) => {
      const hits = row.flags.filter((f) => (flagFilter ? f.includes(flagFilter) : f.length > 0)).length;
      const text = `${row.course.name} ${row.course.baseCourseCode}`.toLowerCase();
      return hits >= (repeatedOnly ? 2 : 1) && (!search.trim() || text.includes(search.trim().toLowerCase()));
    })
    .sort((a, b) => b.flags.filter((f) => f.length).length - a.flags.filter((f) => f.length).length
      || a.course.name.localeCompare(b.course.name, 'vi'));

  // Thẻ điểm thi: học phần của khoa mở từ 2 kỳ trở lên; mở sẵn học phần có H6.
  const examCourses = (overview.courses ?? [])
    .filter((c) => facultyId === null || c.facultyId === facultyId)
    .filter((c) => visibleTerms.filter((ky) => overview.crossTerm?.de_thi?.[c.baseCourseCode]?.[ky] != null).length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const h6Terms = (code: string) => visibleTerms.filter((ky) => (overview.crossTerm?.co_hp?.[code]?.[ky] ?? []).includes('H6'));
  const exam = examCourses.find((c) => c.baseCourseCode === examCode)
    ?? examCourses.find((c) => h6Terms(c.baseCourseCode).length > 0) ?? examCourses[0] ?? null;
  const examTerms = exam ? visibleTerms.filter((ky) => overview.crossTerm?.de_thi?.[exam.baseCourseCode]?.[ky] != null) : [];
  const examSeries = exam ? examTerms.map((ky) => ({
    label: labelOf.get(ky) ?? ky,
    value: overview.crossTerm!.de_thi[exam.baseCourseCode][ky],
    change: overview.crossTerm?.de_thi_lech?.[exam.baseCourseCode]?.[ky] ?? null,
  })) : [];
  const currentCourse = courses.find((c) => c.baseCourseCode === exam?.baseCourseCode);

  return (
    <div className="cga-stack">
      <div className="cga-tabs" role="tablist" aria-label="Diễn biến qua các học kỳ">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTabChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'courses' && (
        <SectionCard
          title="Điểm lưu ý của học phần qua các học kỳ"
          description={`${viInt(flagHistory.length)} học phần của ${facultyName} phù hợp với bộ lọc.`}
          explain={EXPLAIN.trendsCourses}
          explainKind="table"
          filters={(
            <>
              <Field label="Tìm học phần">
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc mã học phần" />
              </Field>
              <Field label="Loại điểm lưu ý">
                <select value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}>
                  <option value="">Bất kỳ loại nào</option>
                  {FLAG_CODES.map((code) => <option key={code} value={code}>{FLAG_LABELS[code]?.name}</option>)}
                </select>
              </Field>
              <Field label="Mức độ lặp lại">
                <select value={repeatedOnly ? '2' : '1'} onChange={(event) => setRepeatedOnly(event.target.value === '2')}>
                  <option value="2">Có điểm lưu ý từ 2 học kỳ trở lên</option>
                  <option value="1">Có điểm lưu ý ở ít nhất 1 học kỳ</option>
                </select>
              </Field>
            </>
          )}
        >
          {flagHistory.length === 0 ? (
            <div className="cga-empty">
              <p><strong>Không có học phần nào phù hợp</strong></p>
              <p className="cga-muted">Thử chọn “Có điểm lưu ý ở ít nhất 1 học kỳ” hoặc loại điểm lưu ý khác.</p>
            </div>
          ) : (
            <div className="cga-table-wrap">
              <table className="cga-table">
                <thead>
                  <tr>
                    <th className="cga-sticky">Học phần</th><th>Bộ môn</th>
                    {visibleTerms.map((ky) => <th key={ky} className={ky === termCode ? 'cga-current' : undefined}>{labelOf.get(ky) ?? ky}</th>)}
                    <th className="num">Số học kỳ có điểm lưu ý<span className="cga-unit">bất kỳ loại nào</span></th>
                    <th>Số học kỳ theo từng loại điểm lưu ý</th>
                  </tr>
                </thead>
                <tbody>
                  {flagHistory.map(({ course, flags }) => (
                    <tr key={course.baseCourseCode}>
                      <td className="cga-sticky cga-name-col"><span className="cga-course-name">{course.name}</span><span className="cga-course-code">Mã học phần {course.baseCourseCode}</span></td>
                      <td>{departmentName.get(course.departmentId ?? -1) ?? '—'}</td>
                      {flags.map((f, i) => (
                        <td key={visibleTerms[i]} className={visibleTerms[i] === termCode ? 'cga-current' : undefined}>
                          <FlagChips codes={f} empty="—" compact />
                        </td>
                      ))}
                      <td className="num"><strong>{viInt(flags.filter((f) => f.length).length)}</strong></td>
                      <td>
                        <span className="cga-chips">
                          {FLAG_CODES.map((code) => [code, flags.filter((f) => f.includes(code)).length] as const)
                            .filter(([, n]) => n > 0)
                            .sort((a, b) => b[1] - a[1])
                            .map(([code, n]) => (
                              <span key={code} className="cga-chip cga-chip--flag" title={FLAG_LABELS[code]?.name}>{FLAG_LABELS[code]?.short ?? code}: {viInt(n)} kỳ</span>
                            ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === 'lecturers' && (
        <SectionCard
          title="Điểm quá trình so với kỳ vọng: theo giảng viên, học phần và học kỳ"
          description={`Bộ môn ${departmentName.get(departmentId ?? -1) ?? ''} · ${viInt(lecturerRows.length)} cặp giảng viên – học phần. Đổi bộ môn ở thanh phía trên.`}
          explain={EXPLAIN.trendsLecturers}
          explainKind="table"
        >
          {error && <div className="cga-alert" role="alert">{error}</div>}
          {loading ? (
            <div className="cga-state"><LoaderCircle className="spin" /> Đang tải...</div>
          ) : lecturerRows.length === 0 ? (
            <p className="cga-muted">Chưa có cặp giảng viên – học phần nào. Lớp chỉ được gắn giảng viên khi file lớp có email giảng viên.</p>
          ) : (
            <>
              <div className="cga-table-wrap">
                <table className="cga-table cga-heatmap">
                  <thead>
                    <tr>
                      <th>Giảng viên</th><th>Học phần</th>
                      {visibleTerms.map((ky) => <th key={ky} className={`num${ky === termCode ? ' cga-current' : ''}`}>{labelOf.get(ky) ?? ky}</th>)}
                      <th>Xu hướng qua các học kỳ<span className="cga-unit">câu nhận xét theo bộ luật E</span></th>
                      <th>Lặp lại qua nhiều học kỳ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lecturerRows.map((r) => {
                      const g1 = r.data.g1_ky?.[termCode] ?? {};
                      const trend = r.data.theo_ky?.[termCode];
                      return (
                        <tr key={`${r.lecturerId}|${r.baseCourseCode}`}>
                          <td className="cga-name-col"><strong>{r.lecturerName ?? r.lecturerId}</strong></td>
                          <td className="cga-name-col"><span className="cga-course-name">{r.data.ten}</span><span className="cga-course-code">Mã học phần {r.baseCourseCode}</span></td>
                          {visibleTerms.map((ky) => {
                            const value = r.data.i7[ky];
                            const markers = Object.entries(r.data.dh).filter(([, kys]) => kys.includes(ky)).map(([code]) => code);
                            const strongCell = value != null && Math.abs(value) > nearZero
                              && (Math.abs(value) - nearZero) / Math.max(strong - nearZero, 0.01) > 0.55;
                            return (
                              <td
                                key={ky}
                                className={`num${ky === termCode ? ' cga-current' : ''}`}
                                style={value != null ? { background: deviationColor(value, nearZero, strong), color: strongCell ? '#fff' : undefined } : undefined}
                                title={value != null
                                  ? `${r.lecturerName ?? ''} – ${r.data.ten}, ${labelOf.get(ky) ?? ky}: ${Math.abs(value) <= nearZero ? 'gần mức kỳ vọng' : `${value > 0 ? 'cao' : 'thấp'} hơn kỳ vọng ${vi(Math.abs(value), 2)} điểm`}${markers.length ? `. Đặc điểm: ${markers.map((c) => MARKER_LABELS[c]?.name ?? c).join('; ')}` : ''}`
                                  : undefined}
                              >
                                {value != null ? `${signed(value)}${markers.length ? ' ◆' : ''}` : r.data.ky_day.includes(ky) ? '·' : ''}
                              </td>
                            );
                          })}
                          <td className="cga-wrap">
                            {trend?.xu_huong ? <RichText text={trend.xu_huong} /> : '—'}
                            {trend?.tuong_duong && (
                              <div>
                                <span
                                  className="cga-chip cga-chip--stable"
                                  title={`Mức điểm quá trình so với kỳ vọng nằm trong vùng gần 0 (±${vi(nearZero, 2)} điểm) ở mọi học kỳ đã dạy học phần. Đây là mô tả số liệu; khi học phần có ít lớp, điều này chưa khẳng định các lớp tương đương nhau.`}
                                >
                                  Gần mức kỳ vọng ở các kỳ đã dạy
                                </span>
                              </div>
                            )}
                          </td>
                          <td>
                            {Object.keys(g1).length === 0 ? <span className="cga-muted">—</span> : Object.entries(g1).map(([code, detail]) => (
                              <div key={code}>
                                <MarkerChips codes={[code]} />
                                <span className="cga-course-code">{detail.dang ? 'Đang tiếp diễn' : 'Đã ghi nhận trước đây'}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="cga-legend">
                <span><i style={{ background: COLORS.up }} />Cao hơn kỳ vọng (đậm dần tới {vi(strong, 1)} điểm)</span>
                <span><i style={{ background: COLORS.middle }} />Gần 0 (±{vi(nearZero, 2)} điểm)</span>
                <span><i style={{ background: COLORS.down }} />Thấp hơn kỳ vọng</span>
                <span>◆ Học kỳ có đặc điểm lớp</span>
                <span><i className="cga-legend-current" />Học kỳ đang chọn</span>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {tab === 'exam' && (
        <SectionCard
          title="Điểm thi trung bình của học phần qua các học kỳ"
          description={<RichText text={`${viInt(examCourses.length)} học phần của ${facultyName} có từ 2 học kỳ trở lên. Ngưỡng lưu ý: điểm thi trung bình thay đổi từ **${vi(examStep, 2)} điểm** trở lên so với học kỳ gần nhất trước đó có mở học phần, đồng thời có ý nghĩa thống kê.`} />}
          explain={{ meaning: FLAG_LABELS.H6?.description, ...EXPLAIN.trendsExam }}
          explainValues={{ ng: vi(examStep, 2) }}
          filters={examCourses.length > 0 && (
            <Field label="Học phần" wide>
              <select value={exam?.baseCourseCode ?? ''} onChange={(event) => setExamCode(event.target.value)}>
                {examCourses.map((c) => {
                  const flagged = h6Terms(c.baseCourseCode);
                  return (
                    <option key={c.baseCourseCode} value={c.baseCourseCode}>
                      {c.name} – mã {c.baseCourseCode}{flagged.length ? ` · điểm thi thay đổi: ${flagged.map((ky) => labelOf.get(ky) ?? ky).join(', ')}` : ''}
                    </option>
                  );
                })}
              </select>
            </Field>
          )}
        >
          {!exam ? <p className="cga-muted">Chưa có học phần nào mở từ hai học kỳ trở lên.</p> : (
            <>
              <div className="cga-chart__title">{exam.name}</div>
              <p className="cga-chart__desc">Mã học phần {exam.baseCourseCode}{currentCourse ? ` · kỳ đang xem ${viInt(currentCourse.data.so_lop)} lớp` : ''}. Điểm có dấu ◆ là học kỳ có điểm lưu ý “{FLAG_LABELS.H6?.name}”.</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={examSeries} margin={{ top: 26, right: 32, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#E3E9F2" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} />
                  <Tooltip formatter={(value) => vi(typeof value === 'number' ? value : null, 2)} />
                  <Line
                    type="linear"
                    isAnimationActive={false}
                    dataKey="value"
                    name="Điểm thi trung bình"
                    stroke={COLORS.scale[3]}
                    strokeWidth={2.5}
                    dot={(props: { cx?: number; cy?: number; index?: number }) => {
                      const point = examSeries[props.index ?? 0];
                      const marked = point?.change?.h6;
                      return (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={marked ? 7 : 4.5}
                          fill={marked ? COLORS.scale[4] : '#fff'} stroke={COLORS.scale[3]} strokeWidth={2} />
                      );
                    }}
                  >
                    <LabelList dataKey="value" position="top" fontSize={11} formatter={(value) => (typeof value === 'number' ? vi(value, 1) : '')} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
              <div className="cga-table-wrap">
                <table className="cga-table">
                  <thead>
                    <tr>
                      <th>Học kỳ</th><th className="num">Điểm thi trung bình</th><th>So với lần mở trước</th>
                      <th className="num">Mức thay đổi<span className="cga-unit">điểm</span></th>
                      <th>So với ngưỡng {vi(examStep, 2)} điểm</th><th>Điểm lưu ý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examTerms.map((ky, i) => {
                      const change = examSeries[i].change;
                      return (
                        <tr key={ky}>
                          <td className={ky === termCode ? 'cga-current' : undefined}><strong>{labelOf.get(ky) ?? ky}</strong></td>
                          <td className="num">{vi(examSeries[i].value, 2)}</td>
                          <td>{change ? labelOf.get(change.ky_truoc) ?? change.ky_truoc : '—'}</td>
                          <td className="num">{change ? signed(change.lech) : '—'}</td>
                          <td>
                            {!change ? 'Lần mở đầu tiên trong kho'
                              : Math.abs(change.lech) >= examStep ? 'Đạt ngưỡng'
                                : `Dưới ngưỡng ${vi(examStep - Math.abs(change.lech), 2)} điểm`}
                          </td>
                          <td>{change?.h6 ? <FlagChips codes={['H6']} /> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}
