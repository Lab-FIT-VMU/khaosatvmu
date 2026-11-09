import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { AnalysisCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { FLAG_CODES, FLAG_LABELS, MARKER_CODES, MARKER_LABELS, STABLE_LABELS } from './courseGradeLabels';
import { COLORS, median, pct, vi, viInt } from './courseGradeFormat';
import { Kpi, SectionCard } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  semesterId: number;
  courses: AnalysisCourse[];
}

type Axis = 'icc' | 'tau';

/** Cấp toàn trường (hoặc toàn đơn vị với quản lý khoa / bộ môn): số tổng, xu hướng, bản đồ học phần, so sánh khoa. */
export function SchoolOverview({ overview, semesterId, courses }: Props) {
  const [axis, setAxis] = useState<Axis>('icc');
  const term = overview.terms.find((t) => t.semesterId === semesterId);
  const summary = term?.summary;
  const thresholds = overview.thresholds ?? {};
  const facultyName = useMemo(
    () => new Map(overview.faculties.map((f) => [f.id, f.name])),
    [overview.faculties],
  );
  const facultyColor = useMemo(() => {
    const map = new Map<number, string>();
    overview.faculties.forEach((f, index) => map.set(f.id, COLORS.categories[index % COLORS.categories.length]));
    return map;
  }, [overview.faculties]);

  // Bảng hai chiều: mỗi dòng một cặp điểm lưu ý H – trạng thái ổn định O ngược với nó.
  const twoWay = FLAG_CODES.map((flag, index) => {
    const stable = `O${index + 1}`;
    const flagged = courses.filter((c) => c.flags.includes(flag)).length;
    const steady = courses.filter((c) => c.stableStates.includes(stable)).length;
    const pending = courses.filter((c) => (c.data.cdl ?? []).includes(stable)).length;
    const comparable = flagged + steady + pending;
    return { flag, stable, flagged, steady, pending, comparable, notComparable: courses.length - comparable };
  });

  const trend = overview.terms.map((t) => ({
    label: t.label,
    i1: t.summary?.i1 != null ? t.summary.i1 * 100 : null,
    i2: t.summary?.i2 != null ? t.summary.i2 * 100 : null,
    i5: t.summary?.i5 ?? null,
    i6: t.summary?.i6 ?? null,
  }));

  const comparableCourses = courses.filter((c) => c.data.du_dk && c.data.tau_x != null && c.data.tau_y != null);
  const scatterByFaculty = useMemo(() => {
    const groups = new Map<number, { x: number; y: number; name: string; flags: string }[]>();
    for (const c of comparableCourses) {
      const key = c.facultyId ?? -1;
      const point = {
        x: (axis === 'icc' ? c.data.icc_x : c.data.tau_x) ?? 0,
        y: (axis === 'icc' ? c.data.icc_y : c.data.tau_y) ?? 0,
        name: `${c.data.ten} (${c.baseCourseCode})`,
        flags: c.flags.join(', '),
      };
      groups.set(key, [...(groups.get(key) ?? []), point]);
    }
    return [...groups.entries()];
  }, [comparableCourses, axis]);

  const facultyRows = overview.faculties.map((f) => {
    const list = courses.filter((c) => c.facultyId === f.id);
    const comparable = list.filter((c) => c.data.du_dk);
    const withX = comparable.filter((c) => c.data.tau_x != null);
    const withY = comparable.filter((c) => c.data.tau_y != null);
    return {
      faculty: f,
      total: list.length,
      comparable: comparable.length,
      flagged: list.filter((c) => c.flags.length > 0).length,
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

      <SectionCard
        title="Điểm lưu ý và trạng thái ổn định"
        description="Mỗi dòng một câu hỏi về học phần. Tỷ lệ tính trên các học phần so sánh được của dòng đó. “Chưa đủ căn cứ” không có nghĩa là đồng đều."
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Điểm lưu ý</th><th className="num">Số học phần</th>
                <th>Ổn định, đồng đều</th><th className="num">Số học phần</th>
                <th className="num">Chưa đủ căn cứ</th><th className="num">Không so sánh được</th>
              </tr>
            </thead>
            <tbody>
              {twoWay.map((row) => (
                <tr key={row.flag}>
                  <td><span className="cga-code">{row.flag}</span> {FLAG_LABELS[row.flag]?.name}</td>
                  <td className="num">{viInt(row.flagged)} <small>({pct(row.comparable ? row.flagged / row.comparable : 0, 0)})</small></td>
                  <td><span className="cga-code">{row.stable}</span> {STABLE_LABELS[row.stable]?.name}</td>
                  <td className="num">{viInt(row.steady)} <small>({pct(row.comparable ? row.steady / row.comparable : 0, 0)})</small></td>
                  <td className="num">{viInt(row.pending)} <small>({pct(row.comparable ? row.pending / row.comparable : 0, 0)})</small></td>
                  <td className="num cga-muted">{viInt(row.notComparable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

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
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} />
                  <Tooltip formatter={(value) => vi(typeof value === 'number' ? value : null, digits)} />
                  <Line type="linear" dataKey={key} stroke={COLORS.categories[index]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Bản đồ học phần: mức chênh giữa các lớp"
        description={`Mỗi điểm là một học phần đủ lớp để so sánh (${viInt(comparableCourses.length)} học phần). Trục ngang: điểm quá trình; trục dọc: điểm thi sau khi điều chỉnh năng lực nền.`}
        actions={(
          <label className="cga-inline-field">
            Thang đo
            <select value={axis} onChange={(event) => setAxis(event.target.value as Axis)}>
              <option value="icc">Tỷ lệ phương sai giữa các lớp (ICC)</option>
              <option value="tau">Độ lệch chuẩn giữa các lớp (τ, điểm)</option>
            </select>
          </label>
        )}
      >
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 8 }}>
            <CartesianGrid stroke="#e3e8ec" />
            <XAxis type="number" dataKey="x" name="X" tick={{ fontSize: 11 }}
              label={{ value: axis === 'icc' ? 'ICC điểm quá trình' : 'τ điểm quá trình', position: 'insideBottom', offset: -12, fontSize: 12 }} />
            <YAxis type="number" dataKey="y" name="Y" tick={{ fontSize: 11 }} width={48}
              label={{ value: axis === 'icc' ? 'ICC điểm thi' : 'τ điểm thi', angle: -90, position: 'insideLeft', fontSize: 12 }} />
            <ZAxis range={[36, 36]} />
            {axis === 'icc' && typeof thresholds.h1_icc_x === 'number' && (
              <ReferenceLine x={thresholds.h1_icc_x} stroke="#64748b" strokeDasharray="4 4" />
            )}
            {axis === 'icc' && typeof thresholds.h2_icc_y === 'number' && (
              <ReferenceLine y={thresholds.h2_icc_y} stroke="#64748b" strokeDasharray="4 4" />
            )}
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                const point = payload?.[0]?.payload as { name: string; x: number; y: number; flags: string } | undefined;
                if (!point) return null;
                return (
                  <div className="cga-tooltip">
                    <strong>{point.name}</strong>
                    <div>Điểm quá trình: {vi(point.x, 3)} · Điểm thi: {vi(point.y, 3)}</div>
                    {point.flags && <div>Điểm lưu ý: {point.flags}</div>}
                  </div>
                );
              }}
            />
            <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
            {scatterByFaculty.map(([facultyId, points]) => (
              <Scatter
                key={facultyId}
                name={facultyName.get(facultyId) ?? 'Chưa rõ khoa'}
                data={points}
                fill={facultyColor.get(facultyId) ?? COLORS.categories[3]}
                fillOpacity={0.75}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </SectionCard>

      <SectionCard
        title="So sánh theo khoa"
        description="Chỉ so sánh các chỉ số rút ra bên trong từng học phần (bộ luật D, R2, R4): trung vị qua các học phần đủ lớp để so sánh, kèm tỷ lệ học phần có điểm lưu ý."
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Khoa</th><th className="num">Học phần</th><th className="num">Đủ lớp so sánh</th>
                <th className="num">Có điểm lưu ý</th>
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
