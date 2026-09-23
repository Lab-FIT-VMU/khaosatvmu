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
import { LoaderCircle } from 'lucide-react';
import type { QuestionRating } from '../../types';
import { formatDecimal } from './theme';

interface SchoolCriteriaChartProps {
  questions: QuestionRating[];
  /** Điểm TB toàn trường dùng làm đường tham chiếu. */
  schoolAverage: number;
  loading?: boolean;
}

interface ChartItem extends QuestionRating {
  label: string;
}

const lowScore = 3.2;

/**
 * Thang màu cột biểu đồ tiêu chí:
 * - Dưới 3.2: đỏ (#d4544a)
 * - 3.2 – 3.49: cam (#e0904a)
 * - 3.5 – 3.79: vàng (#d8b442)
 * - Từ 3.8 trở lên: xanh lá (#3f9b5c)
 */
function getBarColor(score: number): string {
  if (score < lowScore) return '#d4544a';
  if (score < 3.5) return '#e0904a';
  if (score < 3.8) return '#d8b442';
  return '#3f9b5c';
}

const scoreAxis = { domain: [0, 5] as [number, number], ticks: [0, 1, 2, 3, 4, 5] };

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartItem }>;
}

const CriteriaTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  return (
    <div className="reports-chart-tooltip">
      <strong>{item.label}: {item.questionText}</strong>
      <span style={{ color: getBarColor(item.averageScore), fontWeight: 700 }}>
        Điểm TB: {item.averageScore > 0 ? formatDecimal(item.averageScore) : '—'} / 5,0
      </span>
      {item.totalAnswers > 0 && (
        <span style={{ color: '#68737d', fontSize: '12px' }}>
          Số lượt đánh giá (dựa trên số phiếu dùng để tính điểm):{' '}
          <strong style={{ color: '#1f2d3d' }}>{item.totalAnswers.toLocaleString('vi-VN')}</strong>
        </span>
      )}
    </div>
  );
};

export const SchoolCriteriaChart: React.FC<SchoolCriteriaChartProps> = ({
  questions,
  schoolAverage,
  loading = false,
}) => {
  const chartData = useMemo<ChartItem[]>(() => {
    return questions.map((q) => ({
      ...q,
      label: `C${q.questionOrder}`,
    }));
  }, [questions]);

  if (loading) {
    return (
      <div
        className="reports-chart-loading"
        style={{
          minHeight: 320,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: '#68737d',
          fontSize: '13px',
        }}
      >
        <LoaderCircle className="operation-icon is-spinning" aria-hidden="true" />
        <span>Đang tải dữ liệu điểm theo tiêu chí...</span>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="reports-chart-empty" style={{ padding: '32px 16px', textAlign: 'center', color: '#68737d' }}>
        Chưa có dữ liệu phiếu hợp lệ nào để dựng biểu đồ tiêu chí.
      </div>
    );
  }

  return (
    <div className="dashboard-chart-frame" style={{ padding: '12px 14px 16px', width: '100%', overflowX: 'auto' }}>
      <div style={{ minWidth: chartData.length > 20 ? `${chartData.length * 36}px` : '100%', width: '100%' }}>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 16, left: -10, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fontSize: 13, fill: '#68737d' }}
              interval={0}
            />
            <YAxis
              domain={scoreAxis.domain}
              ticks={scoreAxis.ticks}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              tick={{ fontSize: 13, fill: '#68737d' }}
            />
            <Tooltip content={<CriteriaTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
            {schoolAverage > 0 && (
              <ReferenceLine
                y={schoolAverage}
                stroke="#68737d"
                strokeDasharray="4 4"
                label={{
                  value: `Toàn trường: ${formatDecimal(schoolAverage)}`,
                  position: 'insideTopRight',
                  fill: '#68737d',
                  fontSize: 13,
                }}
              />
            )}
            <Bar dataKey="averageScore" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {chartData.map((item) => (
                <Cell key={item.questionOrder} fill={getBarColor(item.averageScore)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
