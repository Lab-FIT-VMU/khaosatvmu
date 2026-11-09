import type { AnalysisOverview } from '../../types/courseGradeAnalysis';
import { GLOSSARY, type GlossaryEntry } from './courseGradeGlossary';
import { FLAG_LABELS, STABLE_LABELS } from './courseGradeLabels';
import { vi } from './courseGradeFormat';
import { SectionCard } from './courseGradeUi';

/** Tên chỗ trống trong văn bản gốc → mã ngưỡng tương ứng. */
const PLACEHOLDER_THRESHOLD: Record<string, string> = { n: 'so_sv_toi_thieu_lop', vung: 'vung_gan_0' };

function GlossaryList({ entries }: { entries: readonly GlossaryEntry[] }) {
  return (
    <dl className="cga-gloss">
      {entries.map((e) => (
        <div key={e.code ?? e.name}>
          <dt>{e.name}{e.code && <>{' '}<span className="cga-code">({e.code})</span></>}</dt>
          <dd>{e.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Giải thích thuật ngữ (trang "Thuật ngữ" của module audit), điền ngưỡng hiện hành vào lời giải thích. */
export function GlossaryView({ overview }: { overview: AnalysisOverview }) {
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = overview.thresholds?.[PLACEHOLDER_THRESHOLD[key] ?? key];
    if (value == null) return match;
    const n = Number(value);
    return Number.isFinite(n) ? vi(n, Number.isInteger(n) ? 0 : 2) : String(value);
  });
  const filled = (entries: readonly GlossaryEntry[]) => entries.map((e) => ({ ...e, description: fill(e.description) }));
  const stable = Object.entries(STABLE_LABELS).map(([code, label]) => ({
    code: `${code}, ngược với ${FLAG_LABELS[`H${code.slice(1)}`]?.name ?? ''}`,
    name: label.name,
    description: fill(label.description ?? ''),
  }));

  return (
    <div className="cga-stack">
      <p className="cga-muted">{GLOSSARY.intro}</p>
      <SectionCard title={GLOSSARY.basicTitle}>
        <GlossaryList entries={filled(GLOSSARY.basic)} />
      </SectionCard>
      <SectionCard title={GLOSSARY.indicatorTitle}>
        <GlossaryList entries={filled(GLOSSARY.indicators)} />
      </SectionCard>
      <SectionCard title={GLOSSARY.flagTitle} description={GLOSSARY.flagIntro}>
        <GlossaryList entries={filled(GLOSSARY.flags)} />
      </SectionCard>
      <SectionCard title={GLOSSARY.stableTitle} description={GLOSSARY.stableIntro}>
        <GlossaryList entries={[...stable, ...filled([GLOSSARY.nearZero])]} />
      </SectionCard>
      <SectionCard title={GLOSSARY.markerTitle}>
        <GlossaryList entries={filled([...GLOSSARY.markers, GLOSSARY.repeat])} />
      </SectionCard>
    </div>
  );
}
