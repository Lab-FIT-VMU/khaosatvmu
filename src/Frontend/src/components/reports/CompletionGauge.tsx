import React from 'react';
import { formatNumber } from './theme';
import { formatDecimal } from '../../utils/formatNumber';
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../../utils/reportThresholds';

interface CompletionGaugeProps {
  /** 0..100 */
  value: number;
  /** Số phiếu đã thu, hiển thị ở giữa vòng tròn. */
  collected: number;
  /** Số phiếu chỉ tiêu. */
  target: number;
  size?: number;
}

/**
 * Vòng tròn tiến độ thu phiếu (SVG) — hiển thị % hoàn thành toàn trường.
 * Màu theo ngưỡng thu đủ phiếu: đạt thì xanh lá, giữa là xanh dương, thấp là cam.
 */
export const CompletionGauge: React.FC<CompletionGaugeProps> = ({
  value,
  collected,
  target,
  size = 132,
}) => {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const displayValue = clamped > 0 && clamped < 1 ? formatDecimal(clamped, 3) : formatDecimal(clamped, 3);
  const offset = circumference - (clamped / 100) * circumference;
  const color = completionColor(clamped);

  return (
    <div className="reports-gauge" style={{ width: size, height: size }} role="img" aria-label={`Tỷ lệ hoàn thành ${displayValue}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#eef1f4"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="reports-gauge-center">
        <strong style={{ color }}>{displayValue}%</strong>
        <span>hoàn thành</span>
        <small className="reports-gauge-sub">
          {formatNumber(collected)} / {formatNumber(target)}
        </small>
      </div>
    </div>
  );
};

function completionColor(rate: number): string {
  return rate >= COMPLETED_COMPLETION_RATE
    ? '#137b3b'
    : rate >= LAGGING_COMPLETION_RATE
      ? '#0788b8'
      : '#b86216';
}
