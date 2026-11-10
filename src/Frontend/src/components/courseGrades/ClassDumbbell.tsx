import { useState } from 'react';
import type { AnalysisSection } from '../../types/courseGradeAnalysis';
import { vi } from './courseGradeFormat';
import { Field, Filters } from './courseGradeUi';

/** Màu hai loại điểm của bản audit (--score-qt, --score-thi). */
const SCORE_X = '#1D63D6';
const SCORE_Y = '#1F2633';

type Sort = 'gap' | 'x' | 'name';

/**
 * Điểm quá trình và điểm thi trung bình của từng lớp (bộ luật D mục 9.5; hàm dumbbell của bản audit):
 * tròn = X̄, vuông = Ȳ, đoạn nối là chênh lệch; hai đường đứt là trung bình chung của các lớp.
 */
export function ClassDumbbell({ sections, baseCourseCode }: { sections: AnalysisSection[]; baseCourseCode: string }) {
  const [sort, setSort] = useState<Sort>('gap');
  const rows = sections
    .filter((s) => s.includedInStats && s.data.x_tb != null && s.data.y_tb != null)
    .map((s) => ({
      key: s.courseSectionId,
      label: `Nhóm ${s.data.nhom}${s.data.ma !== baseCourseCode ? ` (${s.data.ma})` : ''} – ${s.lecturerName ?? 'chưa xác định giảng viên'}`,
      x: s.data.x_tb as number,
      y: s.data.y_tb as number,
      nhom: s.data.nhom,
    }))
    .sort((a, b) => (sort === 'gap' ? (b.x - b.y) - (a.x - a.y) : sort === 'x' ? b.x - a.x : a.nhom.localeCompare(b.nhom)));

  if (rows.length === 0) return <p className="cga-muted">Học phần chưa có lớp nào được đưa vào thống kê.</p>;

  const avgX = rows.reduce((sum, r) => sum + r.x, 0) / rows.length;
  const avgY = rows.reduce((sum, r) => sum + r.y, 0) / rows.length;
  const lo = Math.max(0, Math.floor(Math.min(...rows.map((r) => Math.min(r.x, r.y)))) - 1);
  const width = 1000;
  const pad = { l: 330, r: 30, t: 40, b: 40 };
  const rowHeight = 34;
  const height = pad.t + pad.b + rows.length * rowHeight;
  const sx = (v: number) => pad.l + ((v - lo) / (10 - lo)) * (width - pad.l - pad.r);
  const ticks = Array.from({ length: 10 - lo + 1 }, (_, i) => lo + i);

  return (
    <div className="cga-dumbbell">
      <Filters>
        <Field label="Sắp xếp các lớp theo">
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="gap">Chênh lệch giữa hai loại điểm (lớn nhất ở trên)</option>
            <option value="x">Điểm quá trình trung bình (cao nhất ở trên)</option>
            <option value="name">Tên nhóm lớp</option>
          </select>
        </Field>
      </Filters>
      <div className="cga-table-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img"
          aria-label="Điểm quá trình và điểm thi trung bình của từng lớp" style={{ minWidth: 640 }}>
          {rows.map((_, i) => i % 2 === 0 && (
            <rect key={`band${i}`} x={0} y={pad.t + rowHeight * i} width={width} height={rowHeight} fill="#F4F7FC" />
          ))}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={sx(v)} x2={sx(v)} y1={pad.t - 6} y2={height - pad.b} stroke="#e3e8ec" />
              <text x={sx(v)} y={height - pad.b + 18} textAnchor="middle" fontSize={12} fill="#475569">{v}</text>
            </g>
          ))}
          <line x1={sx(avgX)} x2={sx(avgX)} y1={pad.t - 10} y2={height - pad.b} stroke={SCORE_X} strokeWidth={2} strokeDasharray="8 5" />
          <line x1={sx(avgY)} x2={sx(avgY)} y1={pad.t - 10} y2={height - pad.b} stroke={SCORE_Y} strokeWidth={2} strokeDasharray="2 4" />
          <text x={sx(avgX) + (avgX >= avgY ? 6 : -6)} y={pad.t - 16} textAnchor={avgX >= avgY ? 'start' : 'end'} fontSize={12} fontWeight={600} fill={SCORE_X}>
            TB điểm quá trình: {vi(avgX)}
          </text>
          <text x={sx(avgY) + (avgX >= avgY ? -6 : 6)} y={pad.t - 16} textAnchor={avgX >= avgY ? 'end' : 'start'} fontSize={12} fontWeight={600} fill={SCORE_Y}>
            TB điểm thi: {vi(avgY)}
          </text>
          {rows.map((r, i) => {
            const cy = pad.t + rowHeight * i + rowHeight / 2;
            return (
              <g key={r.key}>
                <text x={pad.l - 12} y={cy + 4} textAnchor="end" fontSize={12} fill="#1f2937">
                  {r.label.length > 48 ? `${r.label.slice(0, 47)}…` : r.label}
                  <title>{r.label}</title>
                </text>
                <line x1={sx(r.x)} x2={sx(r.y)} y1={cy} y2={cy} stroke="#94a3b8" strokeWidth={3} />
                <circle cx={sx(r.x)} cy={cy} r={6} fill={SCORE_X}>
                  <title>{`${r.label}\nĐiểm quá trình trung bình: ${vi(r.x)}\nChênh với điểm thi: ${vi(r.x - r.y)}`}</title>
                </circle>
                <rect x={sx(r.y) - 5.5} y={cy - 5.5} width={11} height={11} fill={SCORE_Y}>
                  <title>{`${r.label}\nĐiểm thi trung bình: ${vi(r.y)}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="cga-legend">
        <span><i style={{ background: SCORE_X }} />Điểm quá trình trung bình (tròn)</span>
        <span><i style={{ background: SCORE_Y, borderRadius: 0 }} />Điểm thi trung bình (vuông)</span>
        <span>Đoạn nối càng dài, hai loại điểm của lớp càng chênh nhau; so giữa các lớp, không so với một con số cố định.</span>
      </div>
    </div>
  );
}
