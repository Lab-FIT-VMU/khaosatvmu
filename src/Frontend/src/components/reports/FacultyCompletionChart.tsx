import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Timer } from 'lucide-react';
import type { FacultyOverview } from '../../types';
import { completionColor } from './theme';
import { FacultyNameAxisTick } from './FacultyNameAxisTick';
import { wrapFacultyName } from './facultyChartLabels';
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../../utils/reportThresholds';

interface FacultyCompletionChartProps {
  faculties: FacultyOverview[];
  onSelect?: (facultyId: number) => void;
}

interface TooltipPayloadItem {
  payload: FacultyOverview;
}

const CompletionTooltip: React.FC<{ active?: boolean; payload?: TooltipPayloadItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const f = payload[0].payload;
  return (
    <div className="reports-chart-tooltip">
      <strong>{f.facultyName}</strong>
      <span style={{ color: completionColor(f.completionRate) }}>
        {f.completionRate.toFixed(1)}% hoàn thành
      </span>
      <span>
        {f.responseCount.toLocaleString('vi-VN')} / {f.targetResponses.toLocaleString('vi-VN')} phiếu
      </span>
    </div>
  );
};

/** Biểu đồ cột ngang: tỷ lệ hoàn thành thu phiếu theo Khoa (màu theo ngưỡng). */
export const FacultyCompletionChart: React.FC<FacultyCompletionChartProps> = ({
  faculties,
  onSelect,
}) => {
  const data = useMemo(
    () => [...faculties]
      .sort((a, b) => a.completionRate - b.completionRate)
      .map((f) => ({ ...f, name: f.facultyName })),
    [faculties],
  );

  // Vẽ hết mọi Khoa trong một biểu đồ: cắt trang một biểu đồ so sánh thì mất
  // luôn cái để so sánh. Khung cao dần theo số Khoa, thẻ tự dài ra theo.
  const chartHeight = Math.max(
    250,
    data.reduce(
      (height, item) => height + 40 + (wrapFacultyName(item.name).length - 1) * 14,
      70,
    ),
  );

  if (data.length === 0) {
    return <div className="reports-chart-empty">Chưa có dữ liệu Khoa để theo dõi tiến độ.</div>;
  }

  return (
    <div className="reports-chart" aria-label="Tỷ lệ hoàn thành thu phiếu theo Khoa">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 12, right: 56, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#b6c2cd" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(value: number) => `${value}%`}
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
          <Tooltip content={<CompletionTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
          <Bar
            dataKey="completionRate"
            radius={[0, 3, 3, 0]}
            isAnimationActive={false}
            onClick={(entry: unknown) => {
              const item = entry as { payload?: FacultyOverview };
              if (item?.payload && onSelect) onSelect(item.payload.facultyId);
            }}
            cursor={onSelect ? 'pointer' : 'default'}
          >
            {data.map((entry) => (
              <Cell key={entry.facultyId} fill={completionColor(entry.completionRate)} />
            ))}
            <LabelList
              dataKey="completionRate"
              position="right"
              formatter={(label) => `${Math.round(Number(label) || 0)}%`}
              style={{ fontSize: 13, fill: '#68737d', fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="reports-chart-note">
        <Timer className="operation-icon" aria-hidden="true" />
        <span>
          ≥{COMPLETED_COMPLETION_RATE}% hoàn thành · {LAGGING_COMPLETION_RATE}–
          {COMPLETED_COMPLETION_RATE - 1}% đang thu · &lt;{LAGGING_COMPLETION_RATE}% chậm tiến độ.
        </span>
      </div>
    </div>
  );
};
