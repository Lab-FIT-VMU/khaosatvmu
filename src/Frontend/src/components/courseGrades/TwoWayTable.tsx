import type { AnalysisCourse } from '../../types/courseGradeAnalysis';
import { FLAG_CODES } from './courseGradeLabels';
import { pct, vi, viInt } from './courseGradeFormat';
import { EXPLAIN } from './courseGradeExplanations';
import { FlagChips, SectionCard, StableChips } from './courseGradeUi';

/**
 * Bảng hai chiều (haiChieu của bản audit; bộ luật E mục 9): mỗi dòng một cặp điểm lưu ý H và trạng thái
 * ổn định O ngược với nó. Tỷ lệ tính trên các học phần so sánh được của dòng đó.
 */
export function TwoWayTable({ courses, scope, thresholds }: {
  courses: AnalysisCourse[];
  scope: string;
  thresholds?: Record<string, number | boolean | string[]> | null;
}) {
  const rows = FLAG_CODES.map((flag, index) => {
    const stable = `O${index + 1}`;
    const flagged = courses.filter((c) => c.flags.includes(flag)).length;
    const steady = courses.filter((c) => c.stableStates.includes(stable)).length;
    const pending = courses.filter((c) => (c.data.cdl ?? []).includes(stable)).length;
    const comparable = flagged + steady + pending;
    return { flag, stable, flagged, steady, pending, comparable, notComparable: courses.length - comparable };
  });
  const share = (n: number, total: number) => (
    <>{viInt(n)} <span className="cga-pct">({pct(total ? n / total : 0, 0)})</span></>
  );

  return (
    <SectionCard
      title="Cần lưu ý và ổn định, đồng đều"
      description={`${scope}: ${viInt(courses.length)} học phần. Mỗi dòng đặt một điểm lưu ý cạnh trạng thái ngược với nó, cùng ngưỡng. Tỷ lệ tính trên các học phần so sánh được của dòng đó.`}
      explain={EXPLAIN.twoWay}
      explainKind="table"
      explainValues={{
        r_thap: vi(Number(thresholds?.h3_r_hp ?? 0.3), 2),
        r_cao: vi(Number(thresholds?.d3_r_hp ?? 0.4), 2),
      }}
    >
      <div className="cga-table-wrap">
        <table className="cga-table">
          <thead>
            <tr>
              <th>Cần lưu ý</th><th className="num">Số học phần</th>
              <th>Ổn định, đồng đều</th><th className="num">Số học phần</th>
              <th className="num">Chưa đủ căn cứ</th><th className="num">Không thể so sánh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.flag}>
                <td><FlagChips codes={[row.flag]} /></td>
                <td className="num">{share(row.flagged, row.comparable)}</td>
                <td><StableChips codes={[row.stable]} /></td>
                <td className="num">{share(row.steady, row.comparable)}</td>
                <td className="num cga-muted">{share(row.pending, row.comparable)}</td>
                <td className="num cga-muted">{viInt(row.notComparable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
