import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { ScoreBand } from '../../types';
import { bandColor } from './theme';
import { formatPercent } from '../../utils/formatNumber';

interface ScoreDistributionDonutProps {
  scoreDistribution: ScoreBand[];
  totalResponses: number;
}

interface TooltipPayloadItem {
  payload: ScoreBand;
}

const DonutTooltip: React.FC<{ active?: boolean; payload?: TooltipPayloadItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || !payload.length) return null;
  const band = payload[0].payload;
  return (
    <div className="reports-chart-tooltip">
      <strong>{band.label}</strong>
      <span>{band.count.toLocaleString('vi-VN')} phiếu</span>
      <span>{formatPercent(band.percentage, 3)}</span>
    </div>
  );
};

/** Donut phân bố điểm 1–5 của sinh viên toàn trường theo nhóm điểm TB từng phiếu. */
export const ScoreDistributionDonut: React.FC<ScoreDistributionDonutProps> = ({
  scoreDistribution,
  totalResponses,
}) => {
  const data = scoreDistribution.filter((band) => band.count > 0);

  if (data.length === 0) {
    return <div className="reports-chart-empty">Chưa có phiếu để phân tích phân bố điểm.</div>;
  }

  return (
    <div className="reports-donut-wrap">
      <div className="reports-donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((band) => (
                <Cell key={band.band} fill={bandColor(band.band)} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="reports-donut-center">
          <strong>{totalResponses.toLocaleString('vi-VN')}</strong>
          <span>phiếu đã thu</span>
        </div>
      </div>
      <ul className="reports-donut-legend">
        {[5, 4, 3, 2].map((band) => {
          const item = scoreDistribution.find((s) => s.band === band);
          return (
            <li key={band}>
              <span className="reports-donut-legend-dot" style={{ background: bandColor(band) }} />
              <span className="reports-donut-legend-label">{item?.label ?? '—'}</span>
              <span className="reports-donut-legend-value">
                {item ? `${formatPercent(item.percentage, 3)}` : '0%'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
