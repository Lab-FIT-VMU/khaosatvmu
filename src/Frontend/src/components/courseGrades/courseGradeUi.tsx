import type { ReactNode } from 'react';
import { FLAG_LABELS, MARKER_LABELS, STABLE_LABELS, type CodeLabel } from './courseGradeLabels';

/* Component dùng chung của các trang phân tích điểm. Màu và định dạng: courseGradeFormat.ts. */

function Chip({ code, label, kind, compact = false }: { code: string; label?: CodeLabel; kind: 'flag' | 'marker' | 'stable' | 'pending'; compact?: boolean }) {
  const tooltip = label ? [label.name, label.description].filter(Boolean).join(' — ') : code;
  return (
    <span className={`cga-chip cga-chip--${kind}`} title={tooltip}>
      {code}
      {label?.short && kind === 'flag' && !compact ? <small>{label.short}</small> : null}
    </span>
  );
}

/** compact: chỉ hiện mã (tên đầy đủ khi rê chuột), dùng trong bảng nhiều cột. */
export function FlagChips({ codes, empty = 'Không có', compact = false }: { codes?: string[] | null; empty?: string; compact?: boolean }) {
  if (!codes || codes.length === 0) return <span className="cga-muted">{empty}</span>;
  return <span className="cga-chips">{codes.map((c) => <Chip key={c} code={c} label={FLAG_LABELS[c]} kind="flag" compact={compact} />)}</span>;
}

export function MarkerChips({ codes }: { codes?: string[] | null }) {
  if (!codes || codes.length === 0) return <span className="cga-muted">—</span>;
  return (
    <span className="cga-chips">
      {codes.map((c) => <Chip key={c} code={c} label={MARKER_LABELS[c]} kind="marker" />)}
    </span>
  );
}

export function StableChips({ codes, pending }: { codes?: string[] | null; pending?: string[] | null }) {
  const stable = codes ?? [];
  const notYet = pending ?? [];
  if (stable.length === 0 && notYet.length === 0) return <span className="cga-muted">—</span>;
  return (
    <span className="cga-chips">
      {stable.map((c) => <Chip key={c} code={c} label={STABLE_LABELS[c]} kind="stable" />)}
      {notYet.map((c) => (
        <Chip key={`p-${c}`} code={`${c}?`} label={{ name: `${STABLE_LABELS[c]?.name ?? c}: chưa đủ căn cứ để kết luận` }} kind="pending" />
      ))}
    </span>
  );
}

/** Câu mẫu của bộ luật E đánh dấu chữ đậm bằng **…**. */
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

export function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="cga-kpi">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

export function SectionCard({ title, description, children, actions }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="cga-card">
      <header className="cga-card__header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}
