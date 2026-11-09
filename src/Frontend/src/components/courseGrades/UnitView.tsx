import { useMemo } from 'react';
import type { AnalysisCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { median, pct, vi, viInt } from './courseGradeFormat';
import { FlagChips, SectionCard, StableChips } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  termCode: string;
  courses: AnalysisCourse[];
  facultyId: number | null;
  onFacultyChange: (facultyId: number | null) => void;
  onOpenCourse: (departmentId: number | null, courseCode: string) => void;
}

/** Cấp khoa / bộ môn: bảng bộ môn × chỉ số và danh sách học phần có điểm lưu ý. */
export function UnitView({ overview, termCode, courses, facultyId, onFacultyChange, onOpenCourse }: Props) {
  const departments = overview.departments.filter((d) => facultyId === null || d.facultyId === facultyId);
  const departmentName = new Map(overview.departments.map((d) => [d.id, d.name]));
  const inFaculty = courses.filter((c) => facultyId === null || c.facultyId === facultyId);
  const termIndex = overview.crossTerm?.ky.indexOf(termCode) ?? -1;
  const termsUpToNow = termIndex >= 0 ? overview.crossTerm!.ky.slice(0, termIndex + 1) : [];

  const rows = useMemo(() => departments.map((department) => {
    const list = inFaculty.filter((c) => c.departmentId === department.id);
    const counts = new Map<string, number>();
    list.forEach((c) => c.flags.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1)));
    const comparable = list.filter((c) => c.data.du_dk);
    const withX = comparable.filter((c) => c.data.tau_x != null);
    const withY = comparable.filter((c) => c.data.tau_y != null);
    const studentsP = list.reduce((sum, c) => sum + (c.data.n_p ?? 0), 0);
    return {
      department,
      courses: list.length,
      sections: list.reduce((sum, c) => sum + (c.data.so_lop ?? 0), 0),
      comparable: comparable.length,
      flagged: list.filter((c) => c.flags.length > 0).length,
      topFlags: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([code]) => code),
      i2: studentsP ? list.reduce((sum, c) => sum + (c.data.i2 ?? 0) * (c.data.n_p ?? 0), 0) / studentsP : null,
      r: median(list.map((c) => c.data.r)),
      iccX: median(withX.map((c) => c.data.icc_x)),
      h1: withX.length ? withX.filter((c) => c.flags.includes('H1')).length / withX.length : null,
      iccY: median(withY.map((c) => c.data.icc_y)),
      h2: withY.length ? withY.filter((c) => c.flags.includes('H2')).length / withY.length : null,
    };
  }).filter((row) => row.courses > 0), [departments, inFaculty]);

  const flagged = inFaculty
    .filter((c) => c.flags.length > 0)
    .sort((a, b) => (departmentName.get(a.departmentId ?? -1) ?? '').localeCompare(departmentName.get(b.departmentId ?? -1) ?? '')
      || a.baseCourseCode.localeCompare(b.baseCourseCode));
  const flaggedTermsOf = (code: string) =>
    termsUpToNow.filter((ky) => (overview.crossTerm?.co_hp?.[code]?.[ky] ?? []).length > 0).length;

  return (
    <div className="cga-stack">
      {overview.viewLevel === 'full' && (
        <label className="cga-inline-field">
          Khoa / viện
          <select value={facultyId ?? ''} onChange={(event) => onFacultyChange(event.target.value ? Number(event.target.value) : null)}>
            <option value="">Tất cả khoa</option>
            {overview.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
      )}

      <SectionCard
        title="Các bộ môn"
        description="Tỷ lệ trượt và tương quan chỉ để mô tả, không dùng xếp hạng chất lượng. So sánh giữa bộ môn dựa trên mức chênh giữa các lớp bên trong từng học phần (trung vị ICC) và tỷ lệ học phần có điểm lưu ý."
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Bộ môn</th><th className="num">Học phần</th><th className="num">Lớp</th><th className="num">Đủ lớp so sánh</th>
                <th className="num">Có điểm lưu ý</th><th>Gặp nhiều nhất</th>
                <th className="num">Trượt do điểm thi</th><th className="num">r (trung vị)</th>
                <th className="num">ICC điểm quá trình</th><th className="num">Có H1</th>
                <th className="num">ICC điểm thi</th><th className="num">Có H2</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.department.id}>
                  <td className="cga-name-col">{row.department.name}</td>
                  <td className="num">{viInt(row.courses)}</td>
                  <td className="num">{viInt(row.sections)}</td>
                  <td className="num">{viInt(row.comparable)}</td>
                  <td className="num">{viInt(row.flagged)} <small>({pct(row.courses ? row.flagged / row.courses : 0, 0)})</small></td>
                  <td><FlagChips codes={row.topFlags} empty="—" compact /></td>
                  <td className="num">{pct(row.i2)}</td>
                  <td className="num">{vi(row.r, 2)}</td>
                  <td className="num">{vi(row.iccX, 2)}</td>
                  <td className="num">{pct(row.h1, 0)}</td>
                  <td className="num">{vi(row.iccY, 2)}</td>
                  <td className="num">{pct(row.h2, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Học phần có điểm lưu ý"
        description={`${viInt(flagged.length)} học phần. Điểm lưu ý mang nghĩa “cần xem xét”, không kết luận và không đánh giá giảng viên.`}
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Học phần</th><th>Bộ môn</th><th>Điểm lưu ý</th><th>Ổn định / chưa đủ căn cứ</th>
                <th className="num">Số kỳ có điểm lưu ý</th><th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {flagged.map((c) => (
                <tr key={c.baseCourseCode}>
                  <td><strong>{c.data.ten}</strong><br /><small className="cga-muted">{c.baseCourseCode}{c.data.hai_he ? ' · có cả lớp đại trà và chất lượng cao' : ''}</small></td>
                  <td>{departmentName.get(c.departmentId ?? -1) ?? '—'}</td>
                  <td><FlagChips codes={c.flags} /></td>
                  <td><StableChips codes={c.stableStates} pending={c.data.cdl} /></td>
                  <td className="num">{viInt(flaggedTermsOf(c.baseCourseCode))} / {viInt(termsUpToNow.length)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenCourse(c.departmentId, c.baseCourseCode)}>
                      Xem các lớp
                    </button>
                  </td>
                </tr>
              ))}
              {flagged.length === 0 && <tr><td colSpan={6} className="cga-muted">Không có học phần nào có điểm lưu ý.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
