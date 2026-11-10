import { useCallback, useMemo, useState } from 'react';
import { BookOpen, Filter, Layers, Users } from 'lucide-react';
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
import type { AnalysisCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { FLAG_CODES, FLAG_LABELS, MARKER_CODES, MARKER_LABELS } from './courseGradeLabels';
import { COLORS, median, pct, vi, viInt } from './courseGradeFormat';
import { CourseMap } from './CourseMap';
import { TwoWayTable } from './TwoWayTable';
import { EXPLAIN } from './courseGradeExplanations';
import { Field, HBars, Kpi, SectionCard, type BarRow } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  semesterId: number;
  courses: AnalysisCourse[];
}

const ACCENTS = ['#1D63D6', '#6A55C2', '#138A8A', '#2E3F9E'];

function TrendChart({ title, description, data, digits, suffix = '', color }: {
  title: string;
  description: string;
  data: { label: string; value: number | null }[];
  digits: number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="cga-chart">
      <div className="cga-chart__title">{title}</div>
      <p className="cga-chart__desc">{description}</p>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 22, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E3E9F2" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
          <YAxis tick={{ fontSize: 11 }} width={44} domain={['auto', 'auto']} />
          <Tooltip formatter={(value) => `${vi(typeof value === 'number' ? value : null, digits)}${suffix}`} />
          <Line type="linear" isAnimationActive={false} dataKey="value" name={title} stroke={color} strokeWidth={2.5} dot={{ r: 4 }}>
            <LabelList dataKey="value" position="top" fontSize={11} formatter={(value) => (typeof value === 'number' ? vi(value, digits) : '')} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Cấp Ban giám hiệu (trang "Cấp Ban giám hiệu" của bản audit; bộ luật D mục 9.3): số tổng, bảng hai
 * chiều, xu hướng, bản đồ học phần, tỷ lệ học phần có điểm lưu ý theo khoa, mức chênh giữa các lớp
 * (I9) theo khoa và qua các kỳ, đặc điểm lặp lại. Không có tên giảng viên hay mã lớp.
 */
export function SchoolOverview({ overview, semesterId, courses }: Props) {
  const [flagFilter, setFlagFilter] = useState<string>('');
  const [flagScope, setFlagScope] = useState<'all' | 'comparable'>('all');
  const [spreadScore, setSpreadScore] = useState<'x' | 'y'>('x');
  const [spreadScale, setSpreadScale] = useState<'icc' | 'tau'>('icc');
  const [mapFaculty, setMapFaculty] = useState<number | null>(null);

  const termIndex = overview.terms.findIndex((t) => t.semesterId === semesterId);
  const term = overview.terms[termIndex];
  const previous = termIndex > 0 ? overview.terms[termIndex - 1] : null;
  const upToNow = overview.terms.slice(0, termIndex + 1);
  const summary = term?.summary;
  const thresholds = overview.thresholds ?? {};
  const facultyName = useMemo(() => new Map(overview.faculties.map((f) => [f.id, f.name])), [overview.faculties]);

  const mapColor = useCallback(() => COLORS.scale[3], []);
  const mapHighlight = useCallback(
    (course: AnalysisCourse) => mapFaculty === null || course.facultyId === mapFaculty,
    [mapFaculty],
  );
  const comparableCourses = useMemo(
    () => courses.filter((c) => c.data.du_dk && c.data.tau_x != null && c.data.tau_y != null),
    [courses],
  );

  if (!summary) {
    return <p className="cga-muted">Chưa có số liệu cho học kỳ này.</p>;
  }

  const delta = (now: number, before: number | undefined, unit: string) => (before === undefined
    ? 'Đây là học kỳ đầu tiên trong kho'
    : `${now >= before ? 'Tăng' : 'Giảm'} ${viInt(Math.abs(now - before))} ${unit} so với ${previous?.label}`);
  const facultyCount = new Set(courses.map((c) => c.facultyId)).size;
  const departmentCount = new Set(courses.map((c) => c.departmentId)).size;

  // Tỷ lệ học phần có điểm lưu ý theo khoa (bộ luật D mục 9.3), tách đủ / chưa đủ điều kiện so sánh.
  const hasFlag = (c: AnalysisCourse) => (flagFilter ? c.flags.includes(flagFilter) : c.flags.length > 0);
  const countFlags = (list: AnalysisCourse[]) => {
    const comparable = list.filter((c) => c.data.du_dk);
    const small = list.filter((c) => !c.data.du_dk);
    return {
      dk: comparable.length, ndk: comparable.filter(hasFlag).length,
      cd: small.length, ncd: small.filter(hasFlag).length,
    };
  };
  const flagRows: BarRow[] = overview.faculties.map((f) => {
    const list = courses.filter((c) => c.facultyId === f.id);
    const c = countFlags(list);
    const total = flagScope === 'comparable' ? c.dk : list.length;
    const n = flagScope === 'comparable' ? c.ndk : c.ndk + c.ncd;
    if (!total) return null;
    const value = (n / total) * 100;
    return {
      key: String(f.id),
      label: f.name,
      value,
      text: flagScope === 'comparable'
        ? `${vi(value, 1)}% · ${viInt(c.ndk)}/${viInt(c.dk)} đủ ĐK`
        : `${vi(value, 1)}% · ${viInt(c.ndk)}/${viInt(c.dk)} đủ ĐK, ${viInt(c.ncd)}/${viInt(c.cd)} chưa đủ`,
      title: `${f.name}: ${viInt(n)} trên ${viInt(total)} học phần (${vi(value, 1)}%)`,
      color: COLORS.scale[3],
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null).sort((a, b) => b.value - a.value);
  const all = countFlags(courses);
  const allTotal = flagScope === 'comparable' ? all.dk : courses.length;
  const allFlagged = flagScope === 'comparable' ? all.ndk : all.ndk + all.ncd;
  const comparableOnlyFlag = flagFilter === 'H1' || flagFilter === 'H2' || flagFilter === 'H4';

  // I9 gộp theo khoa (R4): trung vị trên học phần đủ điều kiện, kèm tỷ lệ có H1 (X) / H2 (Y).
  const spreadFlag = spreadScore === 'x' ? 'H1' : 'H2';
  const spreadOf = (list: AnalysisCourse[]) => {
    const usable = list.filter((c) => c.data.du_dk && c.data[`tau_${spreadScore}`] != null);
    if (usable.length === 0) return null;
    return {
      n: usable.length,
      value: median(usable.map((c) => Number(c.data[`${spreadScale}_${spreadScore}`]))),
      other: median(usable.map((c) => Number(c.data[`${spreadScale === 'icc' ? 'tau' : 'icc'}_${spreadScore}`]))),
      share: usable.filter((c) => c.flags.includes(spreadFlag)).length / usable.length,
    };
  };
  const fmtSpread = (value: number | null, scale = spreadScale) => (scale === 'icc' ? vi(value, 2) : `${vi(value, 2)} điểm`);
  const schoolSpread = spreadOf(courses);
  const spreadRows: BarRow[] = overview.faculties.map((f) => {
    const g = spreadOf(courses.filter((c) => c.facultyId === f.id));
    if (!g || g.value === null) return null;
    return {
      key: String(f.id),
      label: f.name,
      value: g.value,
      text: `${fmtSpread(g.value)} · ${pct(g.share, 0)} có điểm lưu ý`,
      title: `${f.name}: ${viInt(g.n)} học phần đủ điều kiện; trung vị ${fmtSpread(g.value)}, ${spreadScale === 'icc' ? 'τ' : 'ICC'} ${fmtSpread(g.other, spreadScale === 'icc' ? 'tau' : 'icc')}; ${pct(g.share)} có “${FLAG_LABELS[spreadFlag]?.name}”.`,
      color: COLORS.scale[2],
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null).sort((a, b) => b.value - a.value);
  const scoreName = spreadScore === 'x' ? 'điểm quá trình' : 'điểm thi';
  const spreadTrend = upToNow.map((t) => ({
    label: t.label,
    value: (t.summary?.i9?.[`${spreadScale}_${spreadScore}`] as number | null | undefined) ?? null,
  }));
  const shareTrend = upToNow.map((t) => {
    const share = t.summary?.i9?.[spreadScore === 'x' ? 'ty_le_h1' : 'ty_le_h2'];
    return { label: t.label, value: share != null ? share * 100 : null };
  });

  // Đặc điểm lặp lại (G1) của kỳ đang xem.
  const repetition = overview.repetition.find((r) => r.semesterId === semesterId);
  const randomBaseline = term ? overview.crossTerm?.g1_ngau_nhien?.[term.termCode] : null;
  const minRepeatTerms = Math.max(2, Number(thresholds.g1_so_ky_lap ?? 2));
  const windowTerms = Number(thresholds.g1_cua_so_ky ?? 4);
  const totalRepeats = MARKER_CODES.reduce((sum, code) => sum + (repetition?.pairsByMarker[code] ?? 0), 0);
  const ongoingRepeats = MARKER_CODES.reduce((sum, code) => sum + (repetition?.ongoingByMarker[code] ?? 0), 0);
  const repeatRows: BarRow[] = MARKER_CODES.map((code) => {
    const n = repetition?.pairsByMarker[code] ?? 0;
    const ongoing = repetition?.ongoingByMarker[code] ?? 0;
    const direction = code === 'D1' || code === 'D6' ? COLORS.up : code === 'D2' || code === 'D7' ? COLORS.down : COLORS.scale[3];
    return {
      key: code,
      label: MARKER_LABELS[code]?.name ?? code,
      value: n,
      text: `${viInt(n)} trường hợp · ${viInt(ongoing)} đang tiếp diễn`,
      title: `${MARKER_LABELS[code]?.name ?? code}: ${viInt(n)} trường hợp, ${viInt(ongoing)} đang tiếp diễn.`,
      color: direction,
    };
  });

  return (
    <div className="cga-stack">
      <dl className="cga-kpis">
        <Kpi icon={BookOpen} tone="blue" label="Học phần được thống kê" value={viInt(summary.so_hp)} note={`Thuộc ${viInt(facultyCount)} khoa/viện, ${viInt(departmentCount)} bộ môn`} />
        <Kpi icon={Layers} tone="teal" label="Lớp học phần" value={viInt(summary.so_lop)} note={delta(summary.so_lop, previous?.summary?.so_lop, 'lớp')} />
        <Kpi icon={Users} tone="violet" label="Lượt sinh viên" value={viInt(summary.luot_sv)} note={delta(summary.luot_sv, previous?.summary?.luot_sv, 'lượt')} />
        <Kpi
          icon={Filter}
          tone="indigo"
          label="Lớp không đưa vào thống kê"
          value={viInt(summary.q1)}
          note={`Dưới ${viInt(Number(thresholds.so_sv_toi_thieu_lop ?? 15))} sinh viên đủ tư cách dự thi${summary.q1_mat_tc ? `; ${viInt(summary.q1_mat_tc)} lớp vẫn được xét tỷ lệ mất tư cách` : ''}`}
        />
      </dl>

      <TwoWayTable courses={courses} scope={`Toàn trường, ${term.label}`} thresholds={thresholds} />

      <SectionCard
        title="Xu hướng của bốn chỉ số chính qua các học kỳ"
        description={`Tính chung cho toàn trường, từ học kỳ đầu tiên trong kho đến ${term.label}. Di chuột vào từng điểm để xem giá trị.`}
        explain={EXPLAIN.schoolTrend}
      >
        {upToNow.length < 2 && <div className="cga-info">Mới có một học kỳ; đường xu hướng có từ học kỳ thứ hai.</div>}
        <div className="cga-grid-2">
          <TrendChart title="Tỷ lệ mất tư cách dự thi" description="Phần trăm lượt sinh viên không đủ điều kiện dự thi." data={upToNow.map((t) => ({ label: t.label, value: t.summary?.i1 != null ? t.summary.i1 * 100 : null }))} digits={1} suffix="%" color={ACCENTS[0]} />
          <TrendChart title="Tỷ lệ trượt do điểm thi" description="Phần trăm sinh viên dự thi bị điểm F vì điểm thi dưới mức tối thiểu." data={upToNow.map((t) => ({ label: t.label, value: t.summary?.i2 != null ? t.summary.i2 * 100 : null }))} digits={1} suffix="%" color={ACCENTS[1]} />
          <TrendChart title="Chênh lệch điểm quá trình – điểm thi" description="Điểm quá trình trung bình trừ điểm thi trung bình (điểm)." data={upToNow.map((t) => ({ label: t.label, value: t.summary?.i5 ?? null }))} digits={2} color={ACCENTS[2]} />
          <TrendChart title="Mức độ khớp điểm quá trình – điểm thi" description="Trung vị hệ số tương quan r của các lớp (0 đến 1)." data={upToNow.map((t) => ({ label: t.label, value: t.summary?.i6 ?? null }))} digits={2} color={ACCENTS[3]} />
        </div>
      </SectionCard>

      <SectionCard
        title="Bản đồ học phần theo mức chênh lệch giữa các lớp"
        description={`Mỗi chấm là một học phần có từ 2 lớp được thống kê trở lên (${viInt(comparableCourses.length)} học phần; ${viInt(summary.q2)} học phần khác chỉ có 1 lớp được thống kê nên không so sánh được). Báo cáo cấp trường không ghi mã hay tên học phần trên biểu đồ.`}
        explain={EXPLAIN.schoolMap}
      >
        <CourseMap
          courses={comparableCourses}
          thresholds={thresholds}
          colorOf={mapColor}
          highlight={mapHighlight}
          anonymous
          legend={mapFaculty === null
            ? [{ label: 'Học phần', color: COLORS.scale[3] }]
            : [{ label: `Học phần của ${facultyName.get(mapFaculty) ?? 'khoa đã chọn'}`, color: COLORS.scale[3] }, { label: 'Học phần khác', color: '#B8C2D3' }]}
          controls={overview.faculties.length > 1 && (
            <Field label="Tô nổi khoa/viện">
              <select value={mapFaculty ?? ''} onChange={(event) => setMapFaculty(event.target.value ? Number(event.target.value) : null)}>
                <option value="">Tất cả khoa/viện (cùng một màu)</option>
                {overview.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          )}
        />
      </SectionCard>

      <SectionCard
        title="Tỷ lệ học phần có điểm lưu ý, theo khoa/viện"
        description={`Điểm lưu ý mang nghĩa “cần xem xét”, không phải kết luận về chất lượng. Toàn trường${flagScope === 'comparable' ? ' (chỉ học phần đủ điều kiện so sánh)' : ''}: ${viInt(allFlagged)} trên ${viInt(allTotal)} học phần (${pct(allTotal ? allFlagged / allTotal : 0, 0)}).`}
        explain={EXPLAIN.flaggedRate}
        filters={(
          <>
            <Field label="Loại điểm lưu ý">
              <select value={flagFilter} onChange={(event) => setFlagFilter(event.target.value)}>
                <option value="">Bất kỳ loại nào</option>
                {FLAG_CODES.map((code) => <option key={code} value={code}>{FLAG_LABELS[code]?.name}</option>)}
              </select>
            </Field>
            <Field label="Phạm vi học phần">
              <select value={flagScope} onChange={(event) => setFlagScope(event.target.value as 'all' | 'comparable')}>
                <option value="all">Tất cả học phần</option>
                <option value="comparable">Chỉ học phần đủ điều kiện so sánh</option>
              </select>
            </Field>
          </>
        )}
      >
        {comparableOnlyFlag && flagScope === 'all' && (
          <div className="cga-info">Loại điểm lưu ý này chỉ có ở học phần đủ điều kiện so sánh; nên chọn phạm vi “Chỉ học phần đủ điều kiện so sánh”.</div>
        )}
        <HBars rows={flagRows} max={100} label="Tỷ lệ học phần có điểm lưu ý theo khoa/viện" />
      </SectionCard>

      <SectionCard
        title="Các lớp trong cùng học phần chênh nhau bao nhiêu? – theo khoa/viện và qua các học kỳ"
        description="Mức chênh giữa các lớp gộp theo quy tắc R4: trung vị trên các học phần đủ điều kiện so sánh, luôn kèm tỷ lệ học phần có điểm lưu ý."
        explain={spreadScore === 'x' ? EXPLAIN.spreadX : EXPLAIN.spreadY}
        filters={(
          <>
            <Field label="Loại điểm">
              <select value={spreadScore} onChange={(event) => setSpreadScore(event.target.value as 'x' | 'y')}>
                <option value="x">Điểm quá trình</option>
                <option value="y">Điểm thi</option>
              </select>
            </Field>
            <Field label="Thang đo">
              <select value={spreadScale} onChange={(event) => setSpreadScale(event.target.value as 'icc' | 'tau')}>
                <option value="icc">Tỷ lệ phương sai giữa các lớp (ICC)</option>
                <option value="tau">Độ lệch chuẩn giữa các lớp (τ, điểm)</option>
              </select>
            </Field>
          </>
        )}
      >
        {schoolSpread && (
          <p className="cga-lead">
            Toàn trường, {viInt(schoolSpread.n)} học phần đủ điều kiện: trung vị {scoreName} <strong>{fmtSpread(schoolSpread.value)}</strong>;{' '}
            <strong>{pct(schoolSpread.share)}</strong> học phần có điểm lưu ý “{FLAG_LABELS[spreadFlag]?.name}”.
          </p>
        )}
        <HBars rows={spreadRows} label="Mức chênh giữa các lớp theo khoa/viện" />
        <div className="cga-grid-2">
          <TrendChart
            title={`Trung vị ${spreadScale === 'icc' ? 'tỷ lệ phương sai (ICC)' : 'độ lệch chuẩn (τ, điểm)'} qua các học kỳ`}
            description={`Toàn trường, ${scoreName}.`}
            data={spreadTrend}
            digits={2}
            color={ACCENTS[0]}
          />
          <TrendChart
            title={`Tỷ lệ học phần có “${FLAG_LABELS[spreadFlag]?.name}”`}
            description="Trên các học phần đủ điều kiện so sánh (%)."
            data={shareTrend}
            digits={1}
            suffix="%"
            color={ACCENTS[1]}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Đặc điểm lặp lại qua nhiều học kỳ"
        description="Cấp trường chỉ thống kê số lượng. Tên giảng viên và học phần cụ thể được xem ở báo cáo cấp khoa."
        explain={EXPLAIN.schoolRepeat}
      >
        {upToNow.length < minRepeatTerms ? (
          <div className="cga-empty"><p><strong>Chưa đủ học kỳ để xét đặc điểm lặp lại</strong></p><p className="cga-muted">Cần ít nhất {viInt(minRepeatTerms)} học kỳ đã nạp.</p></div>
        ) : (
          <>
            <p className="cga-lead">
              Trong {viInt(windowTerms)} học kỳ gần nhất tính đến {term.label}: <strong>{viInt(repetition?.pairCount ?? 0)}</strong> cặp giảng viên – học phần có ít nhất một đặc điểm lặp lại từ {viInt(minRepeatTerms)} học kỳ.
            </p>
            <p className="cga-note">
              Tổng {viInt(totalRepeats)} lượt đặc điểm lặp lại: {viInt(ongoingRepeats)} đang tiếp diễn, {viInt(totalRepeats - ongoingRepeats)} đã ghi nhận trước đây.
              {randomBaseline != null ? ` Nếu đặc điểm rơi ngẫu nhiên, kỳ vọng khoảng ${vi(randomBaseline, 0)} lượt.` : ''}
            </p>
            <HBars rows={repeatRows} label="Đặc điểm lặp lại qua nhiều học kỳ" />
          </>
        )}
      </SectionCard>
    </div>
  );
}
