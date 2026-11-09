import { useMemo, useState, type ReactNode } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { AnalysisCourse } from '../../types/courseGradeAnalysis';
import { FLAG_LABELS } from './courseGradeLabels';
import { median, vi, viInt } from './courseGradeFormat';

type Axis = 'icc' | 'tau';

interface Props {
  /** Học phần đủ điều kiện so sánh (du_dk) và có τ của cả hai loại điểm. */
  courses: AnalysisCourse[];
  thresholds: Record<string, number | boolean | string[]>;
  colorOf: (course: AnalysisCourse) => string;
  /** Học phần không được chọn bởi bộ lọc thì tô xám, vẫn giữ vị trí để so. */
  highlight?: (course: AnalysisCourse) => boolean;
  /** Ghi tên tối đa ngần này học phần có điểm lưu ý nằm xa gốc nhất (cấp khoa: 6; cấp trường: 0). */
  maxLabels?: number;
  legend: { label: string; color: string }[];
  controls?: ReactNode;
}

interface Point {
  course: AnalysisCourse;
  x: number;
  y: number;
  hollow: boolean;
  color: string;
  label: string | null;
}

const MUTED = '#B8C2D3';
const ZONES_THRESHOLD = ['dưới ngưỡng ở cả hai loại điểm', 'chỉ vượt ngưỡng ở điểm quá trình', 'chỉ vượt ngưỡng ở điểm thi', 'vượt ngưỡng ở cả hai loại điểm'];
const ZONES_MEDIAN = ['dưới trung vị ở cả hai loại điểm', 'chỉ trên trung vị ở điểm quá trình', 'chỉ trên trung vị ở điểm thi', 'trên trung vị ở cả hai loại điểm'];

/**
 * Bản đồ học phần (bộ luật D mục 9.3, 9.4; hàm banDo của bản audit): mỗi chấm một học phần, trục ngang
 * mức chênh điểm quá trình giữa các lớp, trục dọc mức chênh điểm thi. Mốc là ngưỡng lưu ý (thang ICC)
 * hoặc trung vị các học phần (thang τ); ghi số học phần ở mỗi vùng. Chấm rỗng: mô hình không phát hiện
 * chênh lệch giữa các lớp ở ít nhất một loại điểm (τ = 0).
 */
export function CourseMap({ courses, thresholds, colorOf, highlight = () => true, maxLabels = 0, legend, controls }: Props) {
  const [axis, setAxis] = useState<Axis>('icc');

  const { points, refX, refY, zones, zeroX, zeroY } = useMemo(() => {
    const raw = courses.map((course) => {
      const on = highlight(course);
      return {
        course,
        x: Number(axis === 'icc' ? course.data.icc_x : course.data.tau_x),
        y: Number(axis === 'icc' ? course.data.icc_y : course.data.tau_y),
        zeroX: course.data.tau_x === 0,
        zeroY: course.data.tau_y === 0,
        on,
        color: on ? colorOf(course) : MUTED,
      };
    });
    const rx = axis === 'icc'
      ? Number(thresholds.h1_icc_x ?? 0.1)
      : median(raw.filter((p) => !p.zeroX).map((p) => p.x)) ?? 0;
    const ry = axis === 'icc'
      ? Number(thresholds.h2_icc_y ?? 0.1)
      : median(raw.filter((p) => !p.zeroY).map((p) => p.y)) ?? 0;
    // Tên học phần: các học phần có điểm lưu ý, đang được chọn, nằm xa gốc nhất (theo tỷ lệ với mốc).
    const far = (p: (typeof raw)[number]) => Math.hypot(p.x / (rx || 1), p.y / (ry || 1));
    const labelled = new Set(
      raw.filter((p) => p.on && p.course.flags.length > 0)
        .sort((a, b) => far(b) - far(a))
        .slice(0, maxLabels)
        .map((p) => p.course.baseCourseCode),
    );
    const count = [0, 0, 0, 0];
    raw.forEach((p) => { count[(p.x >= rx ? 1 : 0) + (p.y >= ry ? 2 : 0)] += 1; });
    return {
      points: raw.map<Point>((p) => ({
        course: p.course,
        x: p.x,
        y: p.y,
        hollow: p.zeroX || p.zeroY,
        color: p.color,
        label: labelled.has(p.course.baseCourseCode) ? p.course.data.ten : null,
      })),
      refX: rx,
      refY: ry,
      zones: count,
      zeroX: raw.filter((p) => p.zeroX).length,
      zeroY: raw.filter((p) => p.zeroY).length,
    };
  }, [courses, axis, thresholds, colorOf, highlight, maxLabels]);

  const zoneNames = axis === 'icc' ? ZONES_THRESHOLD : ZONES_MEDIAN;
  const axisName = axis === 'icc' ? 'tỷ lệ phương sai giữa các lớp (ICC)' : 'độ lệch chuẩn giữa các lớp (τ, điểm)';

  return (
    <div className="cga-map">
      <div className="cga-actions">
        <label className="cga-inline-field">
          Thang đo
          <select value={axis} onChange={(event) => setAxis(event.target.value as Axis)}>
            <option value="icc">Tỷ lệ phương sai giữa các lớp (ICC)</option>
            <option value="tau">Độ lệch chuẩn giữa các lớp (τ, điểm)</option>
          </select>
        </label>
        {controls}
      </div>
      {points.length === 0 ? <p className="cga-muted">Chưa có học phần đủ điều kiện so sánh.</p> : (
        <>
          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
              <CartesianGrid stroke="#e3e8ec" />
              <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }}
                label={{ value: 'Các lớp chênh lệch về điểm quá trình →', position: 'insideBottom', offset: -14, fontSize: 12 }} />
              <YAxis type="number" dataKey="y" tick={{ fontSize: 11 }} width={48}
                label={{ value: 'Các lớp chênh lệch về điểm thi →', angle: -90, position: 'insideLeft', fontSize: 12, dy: 90 }} />
              <ZAxis range={[40, 40]} />
              <ReferenceLine x={refX} stroke="#64748b" strokeDasharray="4 4" />
              <ReferenceLine y={refY} stroke="#64748b" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ payload }) => {
                  const point = payload?.[0]?.payload as Point | undefined;
                  if (!point) return null;
                  return (
                    <div className="cga-tooltip">
                      <strong>{point.course.data.ten} ({point.course.baseCourseCode})</strong>
                      <div>Điểm quá trình: {vi(point.x, 3)} · Điểm thi: {vi(point.y, 3)}</div>
                      {point.course.flags.length > 0 && (
                        <div>Điểm lưu ý: {point.course.flags.map((c) => FLAG_LABELS[c]?.name ?? c).join('; ')}</div>
                      )}
                    </div>
                  );
                }}
              />
              <Scatter
                data={points}
                isAnimationActive={false}
                shape={(props: { cx?: number; cy?: number; payload?: Point }) => {
                  const { cx = 0, cy = 0, payload } = props;
                  if (!payload) return <g />;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={4.5} fill={payload.hollow ? '#fff' : payload.color}
                        stroke={payload.color} strokeWidth={payload.hollow ? 2 : 1} fillOpacity={payload.hollow ? 1 : 0.85} />
                      {payload.label && (
                        <text x={cx + 7} y={cy - 6} fontSize={11} fill="#1f2937">{payload.label}</text>
                      )}
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="cga-zones" aria-label="Số học phần ở mỗi vùng">
            {[2, 3, 0, 1].map((zone) => (
              <span key={zone}><strong>{viInt(zones[zone])}</strong> {zoneNames[zone]}</span>
            ))}
          </div>
          <div className="cga-legend">
            {legend.map((item) => (
              <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>
            ))}
            <span><i className="cga-legend-hollow" />Không phát hiện chênh lệch giữa các lớp</span>
          </div>
          <p className="cga-note">
            {axis === 'icc'
              ? `Đường đứt là ngưỡng lưu ý về ${axisName} (điểm quá trình: ${vi(refX, 2)}; điểm thi: ${vi(refY, 2)}). Vượt ngưỡng chưa đồng nghĩa với có điểm lưu ý: điểm lưu ý chỉ ghi nhận khi khác biệt giữa các lớp đồng thời có ý nghĩa thống kê.`
              : `Đường đứt là trung vị ${axisName} của các học phần, không tính học phần có độ tản bằng 0.`}
            {` Chấm rỗng: ${viInt(zeroX)} học phần không phát hiện chênh lệch ở điểm quá trình, ${viInt(zeroY)} học phần ở điểm thi.`}
          </p>
        </>
      )}
    </div>
  );
}
