import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { courseGradeAnalysisApi } from '../../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../../services/courseGradesApi';
import type { AnalysisCourse, AnalysisLecturerCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { MARKER_LABELS } from './courseGradeLabels';
import { deviationColor, signed, vi, viInt } from './courseGradeFormat';
import { SectionCard } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  termCode: string;
  courses: AnalysisCourse[];
  departmentId: number | null;
  onDepartmentChange: (departmentId: number | null) => void;
}

/**
 * Diễn biến qua các học kỳ: chuỗi I7 của từng cặp giảng viên – học phần, đặc điểm lặp lại (G1),
 * câu xu hướng; và điểm thi trung bình của học phần qua các kỳ (H6). Chỉ dùng các kỳ đến kỳ
 * đang xem (bộ luật E, E-P4).
 */
export function TrendsView({ overview, termCode, courses, departmentId, onDepartmentChange }: Props) {
  const [rows, setRows] = useState<AnalysisLecturerCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const terms = overview.crossTerm?.ky ?? [];
  const termIndex = terms.indexOf(termCode);
  const visibleTerms = termIndex >= 0 ? terms.slice(0, termIndex + 1) : terms;
  const labelOf = new Map(overview.terms.map((t) => [t.termCode, t.label]));
  const nearZero = Number(overview.thresholds?.vung_gan_0 ?? 0.05);
  const strong = Number(overview.thresholds?.d1_d2_lech_x ?? 1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    courseGradeAnalysisApi.lecturerCourses({ departmentId })
      .then((data) => { if (!cancelled) setRows(data); })
      .catch((loadError) => { if (!cancelled) setError(courseGradeErrorMessage(loadError, 'Không tải được diễn biến giảng viên.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [departmentId]);

  const visibleRows = useMemo(
    () => rows
      .filter((r) => visibleTerms.some((ky) => r.data.ky_day.includes(ky)))
      .sort((a, b) => (a.lecturerName ?? '').localeCompare(b.lecturerName ?? '', 'vi') || a.baseCourseCode.localeCompare(b.baseCourseCode)),
    [rows, visibleTerms],
  );

  const examCourses = courses
    .filter((c) => departmentId === null || c.departmentId === departmentId)
    .filter((c) => visibleTerms.filter((ky) => overview.crossTerm?.de_thi?.[c.baseCourseCode]?.[ky] != null).length >= 2)
    .sort((a, b) => a.data.ten.localeCompare(b.data.ten, 'vi'));

  return (
    <div className="cga-stack">
      <label className="cga-inline-field">
        Bộ môn
        <select value={departmentId ?? ''} onChange={(event) => onDepartmentChange(event.target.value ? Number(event.target.value) : null)}>
          {overview.viewLevel === 'full' && <option value="">Tất cả bộ môn</option>}
          {overview.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      {error && <div className="cga-alert" role="alert">{error}</div>}

      <SectionCard
        title="Giảng viên qua các học kỳ"
        description={`Điểm quá trình so với mức kỳ vọng (trung bình I7 các lớp của giảng viên trong mỗi kỳ). Xám: gần 0 (±${vi(nearZero, 2)} điểm); xanh mòng két: cao hơn; tím: thấp hơn. Chỉ là mô tả, không đánh giá giảng viên.`}
      >
        {loading ? (
          <div className="cga-state"><LoaderCircle className="spin" /> Đang tải...</div>
        ) : visibleRows.length === 0 ? (
          <p className="cga-muted">Chưa có cặp giảng viên – học phần nào. Lớp chỉ được gắn giảng viên khi file lớp có email giảng viên.</p>
        ) : (
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr>
                  <th>Giảng viên</th><th>Học phần</th>
                  {visibleTerms.map((ky) => <th key={ky} className="num">{labelOf.get(ky) ?? ky}</th>)}
                  <th>Đặc điểm đã xuất hiện</th><th>Lặp lại (G1)</th><th>Xu hướng</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const g1 = r.data.g1_ky?.[termCode] ?? {};
                  return (
                    <tr key={`${r.lecturerId}|${r.baseCourseCode}`}>
                      <td className="cga-name-col">{r.lecturerName ?? r.lecturerId}</td>
                      <td className="cga-name-col">{r.data.ten}<br /><small className="cga-muted">{r.baseCourseCode}</small></td>
                      {visibleTerms.map((ky) => {
                        const value = r.data.i7[ky];
                        return (
                          <td key={ky} className="num" style={value != null ? { background: deviationColor(value, nearZero, strong) } : undefined}>
                            {value != null ? signed(value) : r.data.ky_day.includes(ky) ? '·' : ''}
                          </td>
                        );
                      })}
                      <td>
                        {Object.entries(r.data.dh).map(([code, kys]) => {
                          const shown = kys.filter((ky) => visibleTerms.includes(ky));
                          return shown.length ? (
                            <div key={code} title={MARKER_LABELS[code]?.name}>
                              <span className="cga-code">{code}</span> {shown.map((ky) => labelOf.get(ky) ?? ky).join(', ')}
                            </div>
                          ) : null;
                        })}
                      </td>
                      <td>
                        {Object.keys(g1).length === 0 ? <span className="cga-muted">—</span> : Object.entries(g1).map(([code, detail]) => (
                          <div key={code} title={MARKER_LABELS[code]?.name}>
                            <span className="cga-code">{code}</span> {detail.dang ? 'đang tiếp diễn' : 'đã ghi nhận trước đây'}
                          </div>
                        ))}
                      </td>
                      <td className="cga-wrap">{r.data.theo_ky?.[termCode]?.xu_huong ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Điểm thi trung bình của học phần qua các kỳ"
        description="Học phần mở từ hai kỳ trở lên. Ô đánh dấu H6: điểm thi thay đổi có ý nghĩa so với lần mở gần nhất."
      >
        {examCourses.length === 0 ? <p className="cga-muted">Chưa có học phần nào mở từ hai kỳ trở lên.</p> : (
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr>
                  <th>Học phần</th>
                  {visibleTerms.map((ky) => <th key={ky} className="num">{labelOf.get(ky) ?? ky}</th>)}
                </tr>
              </thead>
              <tbody>
                {examCourses.map((c) => (
                  <tr key={c.baseCourseCode}>
                    <td className="cga-name-col">{c.data.ten}<br /><small className="cga-muted">{c.baseCourseCode}</small></td>
                    {visibleTerms.map((ky) => {
                      const value = overview.crossTerm?.de_thi?.[c.baseCourseCode]?.[ky];
                      const change = overview.crossTerm?.de_thi_lech?.[c.baseCourseCode]?.[ky];
                      return (
                        <td key={ky} className="num">
                          {value != null ? vi(value) : ''}
                          {change && <small className="cga-muted"> ({signed(change.lech)}){change.h6 ? <strong> H6</strong> : null}</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cga-note">{viInt(examCourses.length)} học phần.</p>
      </SectionCard>
    </div>
  );
}
