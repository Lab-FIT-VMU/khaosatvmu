import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Building2 } from 'lucide-react';
import type { FacultyOverview } from '../../types';
import { scoreColor } from './theme';
import { FacultyNameAxisTick } from './FacultyNameAxisTick';
import { wrapFacultyName } from './facultyChartLabels';

interface FacultyScoreChartProps {
  faculties: FacultyOverview[];
  /** Điểm TB toàn trường dùng làm đường tham chiếu. */
  schoolAverage: number;
  onSelect?: (facultyId: number) => void;
}

interface TooltipPayloadItem {
  payload: FacultyOverview;
}

const ScoreTooltip: React.FC<{ active?: boolean; payload?: TooltipPayloadItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const f = payload[0].payload;
  return (
    <div className="reports-chart-tooltip">
      <strong>{f.facultyName}</strong>
      <span style={{ color: scoreColor(f.averageScore) }}>
        Điểm TB: {f.averageScore > 0 ? f.averageScore.toFixed(2) : '—'} / 5.0
      </span>
      <span>{f.responseCount.toLocaleString('vi-VN')} phiếu · {f.sectionCount} lớp</span>
    </div>
  );
};

/** Biểu đồ cột ngang: điểm trung bình theo Khoa, kèm đường tham chiếu điểm TB toàn trường. */
export const FacultyScoreChart: React.FC<FacultyScoreChartProps> = ({
  faculties,
  schoolAverage,
  onSelect,
}) => {
  const data = useMemo(
    () => [...faculties]
      .sort((a, b) => a.averageScore - b.averageScore)
      .map((f) => ({ ...f, name: f.facultyName })),
    [faculties],
  );

  // Vẽ hết mọi Khoa trong một biểu đồ: cắt trang một biểu đồ so sánh thì mất
  // luôn cái để so sánh. Khung cao dần theo số Khoa, thẻ tự dài ra theo.
  const chartHeight = Math.max(
    250,
    data.reduce(
      (height, item) => height + 40 + (wrapFacultyName(item.name).length - 1) * 14,
      90,
    ),
  );

  if (data.length === 0) {
    return (
      <div className="reports-chart-empty">Chưa có dữ liệu Khoa để xếp hạng.</div>
    );
  }

  return (
    <div className="reports-chart" aria-label="Điểm trung bình theo Khoa">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 32, right: 48, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#b6c2cd" />
          <XAxis
            type="number"
            domain={[0, 5]}
            ticks={[0, 1, 2, 3, 4, 5]}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 13, fill: '#68737d' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={190}
            tickLine={false}
            axisLine={false}
            tick={<FacultyNameAxisTick />}
          />
          <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
          {schoolAverage > 0 && (
            <ReferenceLine
              x={schoolAverage}
              stroke="#1f2937"
              strokeWidth={2}
              strokeDasharray="6 4"
              ifOverflow="extendDomain"
              label={{
                value: `Toàn trường ${schoolAverage.toFixed(2)}`,
                position: 'top',
                fill: '#1f2937',
                fontSize: 13,
                fontWeight: 700,
              }}
            />
          )}
          <Bar
            dataKey="averageScore"
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
            onClick={(entry: unknown) => {
              const item = entry as { payload?: FacultyOverview };
              if (item?.payload && onSelect) onSelect(item.payload.facultyId);
            }}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((entry) => (
              <Cell
                key={entry.facultyId}
                fill={scoreColor(entry.averageScore)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="reports-chart-note">
        <Building2 className="operation-icon" aria-hidden="true" />
        <span>Click vào cột để lọc chi tiết theo Khoa.</span>
      </div>
    </div>
  );
};
