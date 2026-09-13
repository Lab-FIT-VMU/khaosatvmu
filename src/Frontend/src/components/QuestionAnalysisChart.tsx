import React, { useState } from 'react';
import {
  BarChart3,
  Star,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { QuestionRating } from '../types';
import '../styles/catalogs.css';

export interface QuestionAnalysisChartProps {
  questions: QuestionRating[];
  overallAverageScore?: number;
  /** Nhãn của điểm trung bình trên hàng tiêu đề; tab theo mục đổi thành điểm của mục. */
  averageLabel?: string;
  responseCount?: number;
  title?: string;
  showDistributionTable?: boolean;
  emptyMessage?: string;
}

const getScoreColor = (score: number): string => {
  if (score >= 4.5) return '#10b981'; // Emerald - Xuất sắc
  if (score >= 4.0) return '#0284c7'; // Sky / Blue - Tốt
  if (score >= 3.0) return '#f59e0b'; // Amber - Trung bình
  return '#ef4444'; // Rose - Cần cải thiện
};

const getScoreRatingText = (score: number): string => {
  if (score >= 4.5) return 'Xuất sắc';
  if (score >= 4.0) return 'Tốt';
  if (score >= 3.0) return 'Trung bình';
  if (score > 0) return 'Cần cải thiện';
  return 'Chưa có điểm';
};

interface ChartDataItem extends QuestionRating {
  code: string;
  index: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDataItem;
  }>;
}

const CustomQuestionTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const score = data.averageScore;
  const color = getScoreColor(score);
  const ratingText = getScoreRatingText(score);

  return (
    <div className="analysis-tooltip-card">
      <div className="analysis-tooltip-header">
        <div className="analysis-tooltip-badge" style={{ backgroundColor: color }}>
          {data.code}
        </div>
        <div className="analysis-tooltip-score-info">
          <div className="analysis-tooltip-score" style={{ color }}>
            <Star className="analysis-tooltip-star" aria-hidden="true" />
            <span>{score > 0 ? score.toFixed(2) : '—'}</span>
            <small>/ 5.0</small>
          </div>
          <span
            className="analysis-tooltip-tag"
            style={{
              color,
              borderColor: `${color}40`,
              backgroundColor: `${color}12`,
            }}
          >
            {ratingText}
          </span>
        </div>
      </div>

      <div className="analysis-tooltip-body">
        <p className="analysis-tooltip-question-text">{data.questionText}</p>
      </div>

      <div className="analysis-tooltip-meta">
        <span className="analysis-tooltip-answers">
          <strong>{data.totalAnswers}</strong> lượt trả lời
        </span>
      </div>

      {data.optionDistribution && data.optionDistribution.length > 0 && (
        <div className="analysis-tooltip-distribution">
          <div className="analysis-tooltip-dist-title">Phân bố mức đánh giá:</div>
          <div className="analysis-tooltip-dist-list">
            {data.optionDistribution.map((opt) => (
              <div key={opt.value} className="analysis-tooltip-dist-item">
                <span className="dist-opt-label">
                  M{opt.value} ({opt.displayText}):
                </span>
                <div className="dist-opt-bar-wrapper">
                  <div
                    className="dist-opt-bar-fill"
                    style={{
                      width: `${Math.max(4, opt.percentage)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="dist-opt-count">
                  {opt.count} ({opt.percentage.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const QuestionAnalysisChart: React.FC<QuestionAnalysisChartProps> = ({
  questions,
  overallAverageScore,
  averageLabel = 'ĐTB toàn bài',
  responseCount,
  title = 'Phân tích kết quả theo câu hỏi',
  showDistributionTable = true,
  emptyMessage = 'Chưa có dữ liệu phân tích câu hỏi cho bài khảo sát này.',
}) => {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  if (!questions || questions.length === 0) {
    return (
      <div className="operations-empty">
        <BarChart3 className="operation-icon" aria-hidden="true" />
        <strong>Chưa có dữ liệu để phân tích</strong>
        <span>{emptyMessage}</span>
      </div>
    );
  }

  // Mã C1, C2... lấy đúng số thứ tự câu trong bộ đề do API trả về. Đánh lại theo
  // vị trí trong mảng thì sai: câu bẫy đã bị loại nên các câu sau bị lùi một bậc,
  // C16 ở trang bảng dữ liệu khảo sát sẽ thành C15 ở đây.
  const coded: ChartDataItem[] = questions.map((q, idx) => ({
    ...q,
    code: `C${q.questionOrder || idx + 1}`,
    index: q.questionOrder || idx + 1,
  }));

  // Câu tự nhập không có điểm nên tách khỏi biểu đồ và bảng phân bố.
  const chartData = coded.filter((q) => q.scaleKind !== 'Text');
  const textQuestions = coded.filter((q) => q.scaleKind === 'Text');

  // Mỗi thang có bộ mức riêng nên bảng phân bố tách theo từng thang.
  const distributionGroups = chartData.reduce<Map<string, ChartDataItem[]>>((groups, question) => {
    const key = question.answerScaleName || 'Thang trả lời';
    const current = groups.get(key);
    if (current) current.push(question);
    else groups.set(key, [question]);
    return groups;
  }, new Map());

  // Tính điểm trung bình nếu chưa truyền vào
  const computedAverage =
    overallAverageScore !== undefined
      ? overallAverageScore
      : chartData.reduce((sum, q) => sum + q.averageScore, 0) / (chartData.length || 1);

  const needsScroll = chartData.length > 14;
  const chartInnerWidth = needsScroll ? Math.max(680, chartData.length * 48) : undefined;

  return (
    <section className="section-analysis" aria-label={title}>
      {/* Header phần phân tích */}
      <header className="section-analysis-header">
        <div className="section-analysis-heading">
          <h3>{title}</h3>
        </div>

        {/* Chú thích thang điểm nằm luôn trên hàng tiêu đề, đỡ tốn một băng riêng. */}
        <div className="analysis-legend-items" aria-label="Thang đánh giá">
          <span className="analysis-legend-chip">
            <span className="legend-dot" style={{ backgroundColor: '#10b981' }} />≥ 4.5
          </span>
          <span className="analysis-legend-chip">
            <span className="legend-dot" style={{ backgroundColor: '#0284c7' }} />4.0 - 4.49
          </span>
          <span className="analysis-legend-chip">
            <span className="legend-dot" style={{ backgroundColor: '#f59e0b' }} />3.0 - 3.99
          </span>
          <span className="analysis-legend-chip">
            <span className="legend-dot" style={{ backgroundColor: '#ef4444' }} />&lt; 3.0
          </span>
        </div>

        <div className="section-analysis-meta">
          {responseCount !== undefined && (
            <span className="analysis-meta-count">
              <strong>{responseCount}</strong> phiếu hợp lệ
            </span>
          )}
          <span className="analysis-meta-avg">
            <span className="analysis-meta-dash" aria-hidden="true" />
            {averageLabel}:{' '}
            <strong style={{ color: getScoreColor(computedAverage) }}>
              {computedAverage > 0 ? computedAverage.toFixed(2) : '—'} / 5.0
            </strong>
          </span>
        </div>
      </header>

      {/* Khu vực Biểu đồ cột đứng. Bộ chỉ toàn câu tự nhập thì không có gì để vẽ. */}
      {chartData.length > 0 && (
      <div
        className="section-analysis-chart-container"
        title="Rê chuột vào các cột C1, C2... để xem câu hỏi thực tế"
      >
        <div
          className="section-analysis-chart-scroll"
          style={needsScroll ? { paddingBottom: '8px' } : undefined}
        >
          <div
            style={{
              width: chartInnerWidth ? `${chartInnerWidth}px` : '100%',
              minWidth: '100%',
              height: '360px',
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 24, right: 24, left: 0, bottom: 24 }}
                onMouseMove={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length) {
                    const pl = state.activePayload[0].payload as ChartDataItem;
                    setHoveredCode(pl?.code ?? null);
                  } else {
                    setHoveredCode(null);
                  }
                }}
                onMouseLeave={() => setHoveredCode(null)}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis
                  dataKey="code"
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                  tick={(props: { x?: string | number; y?: string | number; payload?: { value?: string } }) => {
                    const { x = 0, y = 0, payload } = props;
                    const val = payload?.value ?? '';
                    const item = chartData.find((d) => d.code === val);
                    const isHovered = hoveredCode === val;
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text
                          x={0}
                          y={0}
                          dy={14}
                          textAnchor="middle"
                          className={`analysis-xaxis-tick ${isHovered ? 'is-active' : ''}`}
                          style={{
                            fontSize: '12px',
                            fontWeight: isHovered ? 700 : 600,
                            fill: isHovered ? '#0284c7' : '#334155',
                            cursor: 'pointer',
                          }}
                        >
                          {val}
                        </text>
                        {item && <title>{`${item.code}: ${item.questionText}`}</title>}
                      </g>
                    );
                  }}
                />
                <YAxis
                  domain={[0, 5]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(val) => `${val}.0`}
                />
                <Tooltip
                  content={<CustomQuestionTooltip />}
                  cursor={{ fill: 'rgba(2, 132, 199, 0.06)', radius: 4 }}
                  isAnimationActive={false}
                />
                {computedAverage > 0 && (
                  /* Không gắn nhãn lên đường: dù đặt ở mép nào nó cũng đè lên một
                     cột. Con số đã nằm ở phần chú thích trên tiêu đề. */
                  <ReferenceLine
                    y={computedAverage}
                    stroke="#0284c7"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                )}
                <Bar
                  dataKey="averageScore"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  minPointSize={4}
                >
                  <LabelList
                    dataKey="averageScore"
                    position="top"
                    formatter={(val: unknown) => (Number(val) > 0 ? Number(val).toFixed(2) : '')}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#475569' }}
                    offset={6}
                  />
                  {chartData.map((entry) => {
                    const isHovered = hoveredCode === entry.code;
                    const baseColor = getScoreColor(entry.averageScore);
                    return (
                      <Cell
                        key={`cell-${entry.code}`}
                        fill={baseColor}
                        fillOpacity={hoveredCode ? (isHovered ? 1 : 0.45) : 0.9}
                        stroke={isHovered ? baseColor : 'transparent'}
                        strokeWidth={isHovered ? 2 : 0}
                        style={{
                          transition: 'all 0.2s ease',
                          cursor: 'pointer',
                        }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}

      {/* Bảng chi tiết phân bố lựa chọn, tách riêng cho từng thang trả lời vì
          mỗi thang có bộ mức khác nhau (Có/Không chỉ có 2 mức là 1 và 5). */}
      {showDistributionTable &&
        [...distributionGroups.entries()].map(([scaleName, groupQuestions]) => {
          const options = groupQuestions[0]?.optionDistribution ?? [];

          return (
            <div className="section-analysis-distribution" key={scaleName}>
              <div className="distribution-table-header">
                <h4 className="distribution-table-title">
                  Bảng điểm chi tiết &amp; tỷ lệ phân bố · {scaleName}
                </h4>
                <span className="distribution-table-subtitle">
                  Đối chiếu mã câu hỏi <strong>C1, C2...</strong> với biểu đồ bên trên
                </span>
              </div>

              {/* Dùng đúng bảng của các trang danh mục để cả hệ thống một kiểu bảng. */}
              <div className="catalog-table-scroll" tabIndex={0} aria-label={`Phân bố ${scaleName}`}>
              <table className="catalog-table analysis-detail-table">
                <thead>
                  <tr>
                    <th className="analysis-table-code-col">Mã</th>
                    <th className="section-analysis-question-col">Nội dung câu hỏi khảo sát</th>
                    {options.map((option) => (
                      <th key={option.value} className="section-analysis-option-col">
                        Mức {option.value}
                        <small>{option.displayText}</small>
                      </th>
                    ))}
                    <th className="section-analysis-avg-col">Điểm TB</th>
                    <th className="analysis-table-rating-col">Đánh giá</th>
                  </tr>
                </thead>
                <tbody>
                  {groupQuestions.map((question) => {
                    const isHovered = hoveredCode === question.code;
                    const score = question.averageScore;
                    const scoreColor = getScoreColor(score);
                    const ratingText = getScoreRatingText(score);

                    return (
                      <tr
                        key={question.questionId}
                        className={`analysis-table-row ${isHovered ? 'is-highlighted' : ''}`}
                      >
                        <td className="analysis-code-cell">
                          <span
                            className="analysis-code-badge"
                            style={{
                              backgroundColor: `${scoreColor}18`,
                              color: scoreColor,
                              borderColor: `${scoreColor}50`,
                            }}
                          >
                            {question.code}
                          </span>
                        </td>
                        {/* Một dòng cho gọn; nội dung đầy đủ và số lượt trả lời
                            nằm trong tooltip vì bảng này rất dài. */}
                        <td
                          className="campaign-primary-cell analysis-question-cell"
                          title={`${question.questionText} — ${question.totalAnswers} lượt trả lời`}
                        >
                          {question.questionText}
                        </td>
                        {options.map((column) => {
                          const cell = question.optionDistribution?.find(
                            (option) => option.value === column.value
                          );

                          return (
                            <td key={column.value} className="section-analysis-option-cell">
                              <span className="section-analysis-option-count">
                                {cell?.count ?? 0}
                              </span>
                              <span className="section-analysis-option-pct">
                                ({(cell?.percentage ?? 0).toFixed(0)}%)
                              </span>
                            </td>
                          );
                        })}
                        <td className="section-analysis-avg-cell" style={{ color: scoreColor }}>
                          <strong>{score > 0 ? score.toFixed(2) : '—'}</strong>
                        </td>
                        <td className="analysis-rating-cell">
                          <span
                            className="analysis-status-pill"
                            style={{
                              color: scoreColor,
                              backgroundColor: `${scoreColor}14`,
                              borderColor: `${scoreColor}30`,
                            }}
                          >
                            {ratingText}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}

      {/* Câu tự nhập: không có điểm nên liệt kê nội dung người học đã gõ. */}
      {textQuestions.length > 0 && (
        <div className="section-analysis-distribution">
          <div className="distribution-table-header">
            <h4 className="distribution-table-title">Câu hỏi tự nhập</h4>
            <span className="distribution-table-subtitle">
              Không tính vào điểm trung bình
            </span>
          </div>

          <div className="analysis-text-answers">
            {textQuestions.map((question) => (
              <div className="analysis-text-question" key={question.questionId}>
                <p className="analysis-text-question-title">
                  <span className="analysis-code-badge">{question.code}</span>
                  {question.questionText}
                  <small>{question.totalAnswers} lượt trả lời</small>
                </p>
                {question.textAnswers && question.textAnswers.length > 0 ? (
                  <ul>
                    {question.textAnswers.map((answer, index) => (
                      // Nội dung có thể trùng nhau nên dùng vị trí làm key.
                      <li key={index}>{answer}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="analysis-text-empty">Chưa có nội dung nào.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
