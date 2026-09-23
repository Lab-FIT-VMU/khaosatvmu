import React from 'react';
import { Star } from 'lucide-react';
import { scoreColor } from './theme';
import { formatDecimal } from '../../utils/formatNumber';

interface SatisfactionGaugeProps {
  /** Điểm trung bình toàn trường (thang 5). */
  score: number;
  /** Nhãn ngắn, VD "Toàn trường". */
  label?: string;
}

/**
 * Thanh thang điểm 5 đoạn — trực quan hóa điểm hài lòng toàn trường.
 * Màu theo thang: ≥4.5 xanh lá, ≥4.0 xanh dương, còn lại cam.
 */
export const SatisfactionGauge: React.FC<SatisfactionGaugeProps> = ({ score, label }) => {
  const color = scoreColor(score);
  const segments = [1, 2, 3, 4, 5];

  return (
    <div className="reports-satisfaction" aria-label={label ? `${label}: ${formatDecimal(score, 3)}/5` : undefined}>
      <div className="reports-satisfaction-score">
        <Star className="operation-icon" style={{ color, fill: 'currentColor' }} aria-hidden="true" />
        <strong style={{ color }}>{score > 0 ? formatDecimal(score, 3) : '—'}</strong>
        <small>/ 5,0</small>
      </div>
      <div className="reports-satisfaction-scale" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment}
            className={`reports-satisfaction-segment${score >= segment ? ' is-filled' : ''}`}
            style={score >= segment ? { background: color } : undefined}
          />
        ))}
      </div>
      <span className="reports-satisfaction-label">{label ?? 'Điểm hài lòng TB'}</span>
    </div>
  );
};
