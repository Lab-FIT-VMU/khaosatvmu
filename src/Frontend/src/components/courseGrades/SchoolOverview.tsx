import { useCallback, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { FLAG_CODES, FLAG_LABELS, MARKER_CODES, MARKER_LABELS } from './courseGradeLabels';
import { COLORS, median, pct, vi, viInt } from './courseGradeFormat';
import { CourseMap } from './CourseMap';
import { TwoWayTable } from './TwoWayTable';
import { Kpi, SectionCard } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  semesterId: number;
  courses: AnalysisCourse[];
}

/** Cấp toàn trường (hoặc toàn đơn vị với quản lý khoa / bộ môn): số tổng, xu hướng, bản đồ học phần, so sánh khoa. */
export function SchoolOverview({ overview, semesterId, courses }: Props) {
  // Tỷ lệ học phần có điểm lưu ý theo khoa: mọi loại hoặc từng loại H1–H6 (bộ luật D mục 9.3).
  const [flagFilter, setFlagFilter] = useState<string>('');
  const term = overview.terms.find((t) => t.semesterId === semesterId);
  const summary = term?.summary;
  const thresholds = overview.thresholds ?? {};
  const facultyName = useMemo(
    () => new Map(overview.faculties.map((f) => [f.id, f.name])),
    [overview.faculties],
  );
  // Bản đồ: hơn 6 khoa nên không tô mỗi khoa một màu (bộ luật D, M4); chọn một khoa để tô, còn lại xám.
  const [mapFaculty, setMapFaculty] = useState<number | null>(null);
  const mapColor = useCallback(() => COLORS.scale[3], []);
  const mapHighlight = useCallback(
    (course: AnalysisCourse) => mapFaculty === null || course.facultyId === mapFaculty,
    [mapFaculty],
  );

  const trend = overview.terms.map((t) => ({
    label: t.label,
    i1: t.summary?.i1 != null ? t.summary.i1 * 100 : null,
    i2: t.summary?.i2 != null ? t.summary.i2 * 100 : null,
    i5: t.summary?.i5 ?? null,
    i6: t.summary?.i6 ?? null,
  }));

  const comparableCourses = useMemo(
    () => courses.filter((c) => c.data.du_dk && c.data.tau_x != null && c.data.tau_y != null),
    [courses],
  );
  const facultyRows = overview.faculties.map((f) => {
    const list = courses.filter((c) => c.facultyId === f.id);
    const comparable = list.filter((c) => c.data.du_dk);
    const withX = comparable.filter((c) => c.data.tau_x != null);
    const withY = comparable.filter((c) => c.data.tau_y != null);
    return {
      faculty: f,
      total: list.length,
      comparable: comparable.length,
      flagged: list.filter((c) => (flagFilter ? c.flags.includes(flagFilter) : c.flags.length > 0)).length,
      iccX: median(withX.map((c) => c.data.icc_x)),
      tauX: median(withX.map((c) => c.data.tau_x)),
      h1: withX.length ? withX.filter((c) => c.flags.includes('H1')).length / withX.length : null,
      iccY: median(withY.map((c) => c.data.icc_y)),
      tauY: median(withY.map((c) => c.data.tau_y)),
      h2: withY.length ? withY.filter((c) => c.flags.includes('H2')).length / withY.length : null,
    };
  }).filter((row) => row.total > 0);

  const repetition = overview.repetition.find((r) => r.semesterId === semesterId);
  const randomBaseline = term ? overview.crossTerm?.g1_ngau_nhien?.[term.termCode] : null;

  if (!summary) {
    return <p className="cga-muted">Chưa có số liệu cho học kỳ này.</p>;
  }

  return (
    <div className="cga-stack">
      <dl className="cga-kpis">
        <Kpi label="Học phần" value={viInt(summary.so_hp)} note={`${viInt(summary.so_hp - summary.q2)} học phần đủ lớp để so sánh`} />
        <Kpi label="Lớp học phần" value={viInt(summary.so_lop)} note={`${viInt(summary.so_lop_tk)} lớp được đưa vào thống kê`} />
        <Kpi label="Lượt sinh viên" value={viInt(summary.luot_sv)} />
        <Kpi
          label="Lớp không đưa vào thống kê"
          value={viInt(summary.q1)}
          note={`Dưới ${viInt(Number(thresholds.so_sv_toi_thieu_lop ?? 15))} sinh viên đủ tư cách dự thi${summary.q1_mat_tc ? `; ${viInt(summary.q1_mat_tc)} lớp vẫn được xét tỷ lệ mất tư cách` : ''}`}
        />
      </dl>

      <TwoWayTable courses={courses} />

      <SectionCard title="Xu hướng qua các học kỳ" description="Số mô tả toàn bộ phạm vi đang xem; không dùng để xếp hạng chất lượng.">
        <div className="cga-grid-2">
          {([
            ['i1', 'Tỷ lệ mất tư cách dự thi (%)', 1],
            ['i2', 'Tỷ lệ trượt do điểm thi (%)', 1],
            ['i5', 'Chênh điểm quá trình − điểm thi (điểm)', 2],
            ['i6', 'Tương quan điểm quá trình – điểm thi (trung vị r)', 2],
          ] as const).map(([key, title, digits], index) => (
            <div key={key} className="cga-chart">
              <h4>{title}</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#e3e8ec" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} />
                  <Tooltip formatter={(value) => vi(typeof value === 'number' ? value : null, digits)} />
                  <Line type="linear" isAnimationActive={false} dataKey={key} stroke={COLORS.categories[index]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Bản đồ học phần: mức chênh giữa các lớp"
        description={`Mỗi chấm là một học phần đủ lớp để so sánh (${viInt(comparableCourses.length)} học phần), không ghi tên học phần; chọn một khoa để tô nổi. Trục ngang: điểm quá trình; trục dọc: điểm thi sau khi điều chỉnh năng lực nền.`}
      >
        <CourseMap
          courses={comparableCourses}
          thresholds={thresholds}
          colorOf={mapColor}
          highlight={mapHighlight}
          legend={mapFaculty === null
            ? [{ label: 'Học phần', color: COLORS.scale[3] }]
            : [{ label: `Học phần của ${facultyName.get(mapFaculty) ?? 'khoa đã chọn'}`, color: COLORS.scale[3] }, { label: 'Học phần khác', color: '#B8C2D3' }]}
          controls={overview.faculties.length > 1 && (
            <label className="cga-inline-field">
              Khoa
              <select value={mapFaculty ?? ''} onChange={(event) => setMapFaculty(event.target.value ? Number(event.target.value) : null)}>
                <option value="">Tất cả khoa (cùng một màu)</option>
                {overview.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
        />
      </SectionCard>

      <SectionCard
        title="So sánh theo khoa"
        description="Chỉ so sánh các chỉ số rút ra bên trong từng học phần (bộ luật D, R2, R4): trung vị qua các học phần đủ lớp để so sánh, kèm tỷ lệ học phần có điểm lưu ý."
        actions={(
          <label className="cga-inline-field">
            Loại điểm lưu ý
            <select value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}>
              <option value="">Mọi loại</option>
              {FLAG_CODES.map((code) => <option key={code} value={code}>{code} · {FLAG_LABELS[code]?.name}</option>)}
            </select>
          </label>
        )}
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Khoa</th><th className="num">Học phần</th><th className="num">Đủ lớp so sánh</th>
                <th className="num">{flagFilter ? `Có ${flagFilter}` : 'Có điểm lưu ý'}</th>
                <th className="num">ICC / τ điểm quá trình</th><th className="num">Có H1</th>
                <th className="num">ICC / τ điểm thi</th><th className="num">Có H2</th>
              </tr>
            </thead>
            <tbody>
              {facultyRows.map((row) => (
                <tr key={row.faculty.id}>
                  <td>{row.faculty.name}</td>
                  <td className="num">{viInt(row.total)}</td>
                  <td className="num">{viInt(row.comparable)}</td>
                  <td className="num">{viInt(row.flagged)} <small>({pct(row.total ? row.flagged / row.total : 0, 0)})</small></td>
                  <td className="num">{vi(row.iccX, 2)} / {vi(row.tauX, 2)}</td>
                  <td className="num">{pct(row.h1, 0)}</td>
                  <td className="num">{vi(row.iccY, 2)} / {vi(row.tauY, 2)}</td>
                  <td className="num">{pct(row.h2, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Đặc điểm lặp lại qua nhiều học kỳ (G1)"
        description={`Cùng giảng viên, cùng học phần, cùng một đặc điểm ở nhiều học kỳ trong ${viInt(Number(thresholds.g1_cua_so_ky ?? 4))} kỳ gần nhất. ${repetition ? `${viInt(repetition.pairCount)} cặp giảng viên – học phần.` : ''}${randomBaseline != null ? ` Nếu đặc điểm rơi ngẫu nhiên, kỳ vọng khoảng ${vi(randomBaseline, 0)} lượt.` : ''}`}
      >
        <table className="cga-table cga-table--compact">
          <thead><tr><th>Đặc điểm</th><th className="num">Số cặp</th><th className="num">Đang tiếp diễn</th></tr></thead>
          <tbody>
            {MARKER_CODES.map((code) => (
              <tr key={code}>
                <td><span className="cga-code">{code}</span> {MARKER_LABELS[code]?.name}</td>
                <td className="num">{viInt(repetition?.pairsByMarker[code] ?? 0)}</td>
                <td className="num">{viInt(repetition?.ongoingByMarker[code] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
