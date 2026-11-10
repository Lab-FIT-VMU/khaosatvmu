import type { ReactNode } from 'react';
import { Filter, type LucideIcon } from 'lucide-react';
import { FLAG_LABELS, MARKER_LABELS, STABLE_LABELS, type CodeLabel } from './courseGradeLabels';
import { fillText, type Explanation } from './courseGradeExplanations';

/*
  Component dùng chung của các trang phân tích điểm, theo bố cục của bản audit: đầu trang có đường
  dẫn, thẻ có vạch xanh ở tiêu đề, khung "Bảng / Biểu đồ này cho biết gì?", ô "Bộ lọc", thẻ số liệu
  có biểu tượng. Màu và định dạng số: courseGradeFormat.ts.
*/

/** Chiều lệch của đặc điểm lớp (▲ cao hơn, ▼ thấp hơn kỳ vọng), như lớp CSS up/down của bản audit. */
const MARKER_DIRECTION: Record<string, 'up' | 'down'> = { D1: 'up', D2: 'down', D6: 'up', D7: 'down' };

function Chip({ code, label, kind, compact = false }: { code: string; label?: CodeLabel; kind: 'flag' | 'marker' | 'stable' | 'pending'; compact?: boolean }) {
  const tooltip = label ? [label.name, label.description].filter(Boolean).join(' — ') : code;
  // Rộng chỗ thì ghi tên (như bản audit), chật thì chỉ ghi mã, tên khi rê chuột.
  const text = !compact && label?.name && kind !== 'pending' ? label.name : code;
  return (
    <span className={`cga-chip cga-chip--${kind}${kind === 'marker' && MARKER_DIRECTION[code] ? ` cga-chip--${MARKER_DIRECTION[code]}` : ''}`} title={tooltip}>
      {text}
    </span>
  );
}

/** compact: chỉ hiện mã (tên đầy đủ khi rê chuột), dùng trong bảng nhiều cột. */
export function FlagChips({ codes, empty = 'Không có điểm lưu ý', compact = false }: { codes?: string[] | null; empty?: string; compact?: boolean }) {
  if (!codes || codes.length === 0) return <span className="cga-muted">{empty}</span>;
  return <span className="cga-chips">{codes.map((c) => <Chip key={c} code={c} label={FLAG_LABELS[c]} kind="flag" compact={compact} />)}</span>;
}

export function MarkerChips({ codes, compact = false }: { codes?: string[] | null; compact?: boolean }) {
  if (!codes || codes.length === 0) return <span className="cga-muted">—</span>;
  return (
    <span className="cga-chips">
      {codes.map((c) => <Chip key={c} code={c} label={MARKER_LABELS[c]} kind="marker" compact={compact} />)}
    </span>
  );
}

export function StableChips({ codes, pending, compact = false }: { codes?: string[] | null; pending?: string[] | null; compact?: boolean }) {
  const stable = codes ?? [];
  const notYet = pending ?? [];
  if (stable.length === 0 && notYet.length === 0) return <span className="cga-muted">Chưa xác định</span>;
  return (
    <span className="cga-chips">
      {stable.map((c) => <Chip key={c} code={c} label={STABLE_LABELS[c]} kind="stable" compact={compact} />)}
      {notYet.map((c) => (
        <Chip key={`p-${c}`} code={`${c}: chưa đủ căn cứ`} label={{ name: `${STABLE_LABELS[c]?.name ?? c}: chưa đủ căn cứ để kết luận` }} kind="pending" />
      ))}
    </span>
  );
}

/** Câu mẫu đánh dấu chữ đậm bằng **…**. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => (part.startsWith('**') && part.endsWith('**')
        ? <strong key={index}>{part.slice(2, -2)}</strong>
        : <span key={index}>{part}</span>))}
    </>
  );
}

export function PageHead({ crumb, title, description, actions }: {
  crumb: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="cga-page-head">
      <div>
        <div className="cga-crumb">{crumb}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="cga-page-head__actions">{actions}</div> : null}
    </header>
  );
}

export type KpiTone = 'blue' | 'teal' | 'violet' | 'indigo';

export function Kpi({ label, value, note, icon: Icon, tone = 'blue' }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
}) {
  return (
    <div className="cga-kpi">
      {Icon ? <span className={`cga-kpi__icon cga-kpi__icon--${tone}`}><Icon aria-hidden="true" /></span> : null}
      <div>
        <dt>{label}</dt>
        <dd>{value}</dd>
        {note ? <p>{note}</p> : null}
      </div>
    </div>
  );
}

/** Khung "Biểu đồ / Bảng này cho biết gì?" (bấm để mở). */
export function ExplainBox({ explanation, kind = 'chart', values }: {
  explanation: Explanation;
  kind?: 'chart' | 'table';
  values?: Record<string, string | number | null | undefined>;
}) {
  const parts = ([
    ['Ý nghĩa', explanation.meaning],
    ['Dùng để', explanation.use],
    ['Cách đọc', explanation.read],
  ] as const).filter(([, text]) => text);
  return (
    <details className="cga-explain">
      <summary>{kind === 'table' ? 'Bảng này cho biết gì?' : 'Biểu đồ này cho biết gì?'}</summary>
      <dl>
        {parts.map(([term, text]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd><RichText text={fillText(text!, values)} /></dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Ô "Bộ lọc" chứa các Field. */
export function Filters({ children }: { children: ReactNode }) {
  return (
    <div className="cga-filter-box">
      <span className="cga-filter-box__title"><Filter aria-hidden="true" />Bộ lọc</span>
      {children}
    </div>
  );
}

/** Ô chọn có nhãn đặt phía trên, dùng trong Bộ lọc và thanh ngữ cảnh. */
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`cga-field${wide ? ' cga-field--wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SectionCard({ title, description, children, actions, explain, explainKind = 'chart', explainValues, filters, id }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  explain?: Explanation;
  explainKind?: 'chart' | 'table';
  explainValues?: Record<string, string | number | null | undefined>;
  filters?: ReactNode;
  id?: string;
}) {
  return (
    <section className="cga-card" id={id}>
      <header className="cga-card__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>
      {explain ? <ExplainBox explanation={explain} kind={explainKind} values={explainValues} /> : null}
      {filters ? <Filters>{filters}</Filters> : null}
      {children}
    </section>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Chữ bên phải thanh. */
  text: string;
  /** Chú thích khi rê chuột. */
  title?: string;
  color?: string;
}

/** Biểu đồ thanh ngang (barsH của bản audit): nhãn trái, thanh, chữ phải. */
export function HBars({ rows, max, label }: { rows: BarRow[]; max?: number; label: string }) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="cga-muted">Chưa có số liệu.</p>;
  return (
    <div className="cga-bars" role="list" aria-label={label}>
      {rows.map((row) => (
        <div key={row.key} className="cga-bars__row" role="listitem" title={row.title}>
          <span className="cga-bars__label">{row.label}</span>
          <span className="cga-bars__track">
            <span
              className="cga-bars__bar"
              style={{ width: `${top > 0 ? Math.max(0.5, (row.value / top) * 100) : 0}%`, background: row.color }}
            />
          </span>
          <span className="cga-bars__text">{row.text}</span>
        </div>
      ))}
    </div>
  );
}
