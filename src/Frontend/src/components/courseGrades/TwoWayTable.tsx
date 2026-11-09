import type { AnalysisCourse } from '../../types/courseGradeAnalysis';
import { FLAG_CODES, FLAG_LABELS, STABLE_LABELS } from './courseGradeLabels';
import { pct, viInt } from './courseGradeFormat';
import { SectionCard } from './courseGradeUi';

/**
 * Bảng hai chiều (haiChieu của bản audit; bộ luật E mục 9): mỗi dòng một cặp điểm lưu ý H và trạng thái
 * ổn định O ngược với nó. Tỷ lệ tính trên các học phần so sánh được của dòng đó.
 */
export function TwoWayTable({ courses, scope }: { courses: AnalysisCourse[]; scope?: string }) {
  const rows = FLAG_CODES.map((flag, index) => {
    const stable = `O${index + 1}`;
    const flagged = courses.filter((c) => c.flags.includes(flag)).length;
    const steady = courses.filter((c) => c.stableStates.includes(stable)).length;
    const pending = courses.filter((c) => (c.data.cdl ?? []).includes(stable)).length;
    const comparable = flagged + steady + pending;
    return { flag, stable, flagged, steady, pending, comparable, notComparable: courses.length - comparable };
  });
  const share = (n: number, total: number) => pct(total ? n / total : 0, 0);

  return (
    <SectionCard
      title="Điểm lưu ý và trạng thái ổn định"
      description={`${scope ? `${scope}. ` : ''}Mỗi dòng một câu hỏi về học phần. Tỷ lệ tính trên các học phần so sánh được của dòng đó. “Chưa đủ căn cứ” không có nghĩa là đồng đều.`}
    >
      <div className="cga-table-wrap">
        <table className="cga-table">
          <thead>
            <tr>
              <th>Điểm lưu ý</th><th className="num">Số học phần</th>
              <th>Ổn định, đồng đều</th><th className="num">Số học phần</th>
              <th className="num">Chưa đủ căn cứ</th><th className="num">Không so sánh được</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.flag}>
                <td><span className="cga-code">{row.flag}</span> {FLAG_LABELS[row.flag]?.name}</td>
                <td className="num">{viInt(row.flagged)} <small>({share(row.flagged, row.comparable)})</small></td>
                <td><span className="cga-code">{row.stable}</span> {STABLE_LABELS[row.stable]?.name}</td>
                <td className="num">{viInt(row.steady)} <small>({share(row.steady, row.comparable)})</small></td>
                <td className="num">{viInt(row.pending)} <small>({share(row.pending, row.comparable)})</small></td>
                <td className="num cga-muted">{viInt(row.notComparable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
