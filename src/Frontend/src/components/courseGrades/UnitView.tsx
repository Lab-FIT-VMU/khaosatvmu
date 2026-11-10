import { useCallback, useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { courseGradeAnalysisApi } from '../../services/courseGradeAnalysisApi';
import { courseGradeErrorMessage } from '../../services/courseGradesApi';
import type { AnalysisCourse, AnalysisLecturerCourse, AnalysisOverview } from '../../types/courseGradeAnalysis';
import { CourseMap } from './CourseMap';
import { TwoWayTable } from './TwoWayTable';
import { EXPLAIN } from './courseGradeExplanations';
import { COLORS, median, pct, vi, viInt } from './courseGradeFormat';
import { Field, FlagChips, MarkerChips, SectionCard, StableChips } from './courseGradeUi';

interface Props {
  overview: AnalysisOverview;
  termCode: string;
  courses: AnalysisCourse[];
  facultyId: number | null;
  onOpenCourse: (departmentId: number | null, courseCode: string) => void;
  onOpenTrends: (departmentId: number | null) => void;
}

interface RepeatRow {
  key: string;
  lecturer: string;
  courseName: string;
  courseCode: string;
  departmentId: number | null;
  marker: string;
  terms: string[];
  ongoing: boolean;
}

/**
 * Cấp khoa (bộ luật D mục 9.4; trang "Cấp khoa / viện" của bản audit): bảng hai chiều, bảng bộ môn
 * × chỉ số, bản đồ học phần của khoa, danh sách học phần có điểm lưu ý và đặc điểm lặp lại (G1, có tên
 * giảng viên).
 */
export function UnitView({ overview, termCode, courses, facultyId, onOpenCourse, onOpenTrends }: Props) {
  const [mapDepartment, setMapDepartment] = useState<number | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [lecturerRows, setLecturerRows] = useState<AnalysisLecturerCourse[]>([]);
  const [loadingRepeat, setLoadingRepeat] = useState(true);
  const [repeatError, setRepeatError] = useState<string | null>(null);

  const departments = useMemo(
    () => overview.departments.filter((d) => facultyId === null || d.facultyId === facultyId),
    [overview.departments, facultyId],
  );
  const departmentName = new Map(overview.departments.map((d) => [d.id, d.name]));
  const inFaculty = useMemo(
    () => courses.filter((c) => facultyId === null || c.facultyId === facultyId),
    [courses, facultyId],
  );
  const terms = overview.crossTerm?.ky ?? [];
  const termIndex = terms.indexOf(termCode);
  const termsUpToNow = termIndex >= 0 ? terms.slice(0, termIndex + 1) : [];
  const termLabel = new Map(overview.terms.map((t) => [t.termCode, t.label]));
  const facultyLabel = facultyId === null
    ? (overview.viewLevel === 'full' ? 'Toàn trường' : 'Đơn vị của bạn')
    : overview.faculties.find((f) => f.id === facultyId)?.name ?? 'Khoa đã chọn';

  useEffect(() => { setMapDepartment(null); }, [facultyId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRepeat(true);
    setRepeatError(null);
    courseGradeAnalysisApi.lecturerCourses()
      .then((rows) => { if (!cancelled) setLecturerRows(rows); })
      .catch((error) => { if (!cancelled) setRepeatError(courseGradeErrorMessage(error, 'Không tải được danh sách đặc điểm lặp lại.')); })
      .finally(() => { if (!cancelled) setLoadingRepeat(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => departments.map((department) => {
    const list = inFaculty.filter((c) => c.departmentId === department.id);
    const counts = new Map<string, number>();
    list.forEach((c) => c.flags.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1)));
    const comparable = list.filter((c) => c.data.du_dk);
    const withX = comparable.filter((c) => c.data.tau_x != null);
    const withY = comparable.filter((c) => c.data.tau_y != null);
    // Như bản audit: tỷ lệ trên các lớp đưa vào thống kê, r là trung vị r của các lớp đó.
    const lost = list.reduce((sum, c) => sum + (c.data.lop_tk?.n_mat ?? 0), 0);
    const graded = list.reduce((sum, c) => sum + (c.data.lop_tk?.n_diem ?? 0), 0);
    const studentsP = list.reduce((sum, c) => sum + (c.data.n_p ?? 0), 0);
    return {
      department,
      courses: list.length,
      sections: list.reduce((sum, c) => sum + (c.data.so_lop ?? 0), 0),
      comparable: comparable.length,
      flagged: list.filter((c) => c.flags.length > 0).length,
      topFlags: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([code]) => code),
      i1: graded ? lost / graded : null,
      i2: studentsP ? list.reduce((sum, c) => sum + (c.data.i2 ?? 0) * (c.data.n_p ?? 0), 0) / studentsP : null,
      r: median(list.flatMap((c) => c.data.lop_tk?.r ?? [])),
      iccX: median(withX.map((c) => c.data.icc_x)),
      tauX: median(withX.map((c) => c.data.tau_x)),
      h1: withX.length ? withX.filter((c) => c.flags.includes('H1')).length / withX.length : null,
      iccY: median(withY.map((c) => c.data.icc_y)),
      tauY: median(withY.map((c) => c.data.tau_y)),
      h2: withY.length ? withY.filter((c) => c.flags.includes('H2')).length / withY.length : null,
    };
  }).filter((row) => row.courses > 0), [departments, inFaculty]);

  // Bản đồ: mỗi bộ môn một màu trung tính (M4); lọc một bộ môn hoặc chỉ học phần có điểm lưu ý thì phần còn lại xám.
  const mapCourses = useMemo(
    () => inFaculty.filter((c) => c.data.du_dk && c.data.tau_x != null && c.data.tau_y != null),
    [inFaculty],
  );
  const mapDepartments = useMemo(
    () => departments.filter((d) => mapCourses.some((c) => c.departmentId === d.id)),
    [departments, mapCourses],
  );
  const departmentColor = useMemo(() => {
    const map = new Map<number, string>();
    mapDepartments.forEach((d, index) => map.set(d.id, COLORS.categories[index % COLORS.categories.length]));
    return map;
  }, [mapDepartments]);
  const colorOf = useCallback(
    (course: AnalysisCourse) => departmentColor.get(course.departmentId ?? -1) ?? COLORS.categories[3],
    [departmentColor],
  );
  const highlight = useCallback(
    (course: AnalysisCourse) => (mapDepartment === null || course.departmentId === mapDepartment)
      && (!onlyFlagged || course.flags.length > 0),
    [mapDepartment, onlyFlagged],
  );
  const showMap = facultyId !== null || overview.viewLevel === 'unit';

  const flagged = inFaculty
    .filter((c) => c.flags.length > 0)
    .sort((a, b) => (departmentName.get(a.departmentId ?? -1) ?? '').localeCompare(departmentName.get(b.departmentId ?? -1) ?? '')
      || a.baseCourseCode.localeCompare(b.baseCourseCode));
  const flaggedTermsOf = (code: string) =>
    termsUpToNow.filter((ky) => (overview.crossTerm?.co_hp?.[code]?.[ky] ?? []).length > 0).length;

  // G1 của kỳ đang xem, trong khoa (theo bộ môn của học phần). Đang tiếp diễn xếp trước.
  const departmentIds = new Set(departments.map((d) => d.id));
  const minRepeatTerms = Math.max(2, Number(overview.thresholds?.g1_so_ky_lap ?? 2));
  const repeats: RepeatRow[] = lecturerRows
    .filter((r) => facultyId === null || (r.departmentId !== null && departmentIds.has(r.departmentId)))
    .flatMap((r) => Object.entries(r.data.g1_ky?.[termCode] ?? {}).map(([marker, detail]) => ({
      key: `${r.lecturerId}|${r.baseCourseCode}|${marker}`,
      lecturer: r.lecturerName ?? `Giảng viên #${r.lecturerId}`,
      courseName: r.data.ten,
      courseCode: r.baseCourseCode,
      departmentId: r.departmentId,
      marker,
      terms: detail.ky,
      ongoing: detail.dang,
    })))
    .sort((a, b) => Number(b.ongoing) - Number(a.ongoing) || a.lecturer.localeCompare(b.lecturer, 'vi'));

  return (
    <div className="cga-stack">
      <TwoWayTable courses={inFaculty} scope={`${facultyLabel}, ${termLabel.get(termCode) ?? termCode}`} thresholds={overview.thresholds} />

      <SectionCard
        title="Tổng hợp chỉ số theo bộ môn"
        description="Tỷ lệ mất tư cách, tỷ lệ trượt và mức độ khớp chỉ để mô tả, không dùng xếp hạng. So sánh giữa bộ môn dựa trên mức chênh giữa các lớp bên trong từng học phần và tỷ lệ học phần có điểm lưu ý. Di chuột vào tên điểm lưu ý để xem giải thích."
        explain={EXPLAIN.facultyDepartments}
        explainKind="table"
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th className="cga-sticky">Bộ môn</th><th className="num">Số học phần</th><th className="num">Số lớp</th>
                <th className="num">Học phần có từ 2 lớp<span className="cga-unit">đủ điều kiện so sánh</span></th>
                <th className="num">Học phần có điểm lưu ý</th><th>Điểm lưu ý gặp nhiều nhất</th>
                <th className="num">Tỷ lệ mất tư cách<span className="cga-unit">%</span></th>
                <th className="num">Tỷ lệ trượt do điểm thi<span className="cga-unit">%</span></th>
                <th className="num">Mức độ khớp<span className="cga-unit">trung vị r, 0 đến 1</span></th>
                <th className="num">Chênh lệch giữa các lớp – điểm quá trình<span className="cga-unit">trung vị ICC / τ</span></th>
                <th className="num">Có điểm lưu ý chênh điểm quá trình<span className="cga-unit">%</span></th>
                <th className="num">Chênh lệch giữa các lớp – điểm thi<span className="cga-unit">trung vị ICC / τ</span></th>
                <th className="num">Có điểm lưu ý chênh điểm thi<span className="cga-unit">%</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.department.id}>
                  <td className="cga-name-col cga-sticky"><strong>{row.department.name}</strong></td>
                  <td className="num">{viInt(row.courses)}</td>
                  <td className="num">{viInt(row.sections)}</td>
                  <td className="num">{viInt(row.comparable)}</td>
                  <td className="num">{viInt(row.flagged)} <small>({pct(row.courses ? row.flagged / row.courses : 0, 0)})</small></td>
                  <td><FlagChips codes={row.topFlags} empty="—" compact /></td>
                  <td className="num">{pct(row.i1)}</td>
                  <td className="num">{pct(row.i2)}</td>
                  <td className="num">{vi(row.r, 2)}</td>
                  <td className="num">{vi(row.iccX, 2)} / {vi(row.tauX, 2)}</td>
                  <td className="num">{pct(row.h1, 0)}</td>
                  <td className="num">{vi(row.iccY, 2)} / {vi(row.tauY, 2)}</td>
                  <td className="num">{pct(row.h2, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Bản đồ học phần của khoa"
        explain={EXPLAIN.facultyMap}
        description={showMap
          ? `Mỗi chấm là một học phần đủ điều kiện so sánh (${viInt(mapCourses.length)} học phần), tô màu theo bộ môn. Ghi tên tối đa 6 học phần có điểm lưu ý nằm xa nhất; di chuột vào các chấm khác để xem tên.`
          : 'Chọn một khoa ở trên để xem bản đồ học phần của khoa đó.'}
      >
        {showMap && (
          <CourseMap
            courses={mapCourses}
            thresholds={overview.thresholds ?? {}}
            colorOf={colorOf}
            highlight={highlight}
            maxLabels={6}
            legend={mapDepartments.map((d) => ({ label: d.name, color: departmentColor.get(d.id) ?? COLORS.categories[3] }))}
            controls={(
              <>
                <Field label="Bộ môn">
                  <select value={mapDepartment ?? ''} onChange={(event) => setMapDepartment(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Tất cả bộ môn</option>
                    {mapDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Học phần hiển thị">
                  <select value={onlyFlagged ? '1' : ''} onChange={(event) => setOnlyFlagged(event.target.value === '1')}>
                    <option value="">Tất cả học phần</option>
                    <option value="1">Chỉ học phần có điểm lưu ý</option>
                  </select>
                </Field>
              </>
            )}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Danh sách học phần có điểm lưu ý"
        description={`${viInt(flagged.length)} học phần. Điểm lưu ý mang nghĩa “cần xem xét”, không kết luận và không đánh giá giảng viên. Bấm “Xem các lớp” để mở trang cấp bộ môn của học phần.`}
        explain={EXPLAIN.facultyFlagged}
        explainKind="table"
      >
        <div className="cga-table-wrap">
          <table className="cga-table">
            <thead>
              <tr>
                <th>Học phần</th><th>Bộ môn</th><th>Điểm lưu ý trong học kỳ này</th><th>Ổn định, đồng đều</th>
                <th className="num">Số học kỳ có điểm lưu ý<span className="cga-unit">trên số kỳ đã nạp</span></th><th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {flagged.map((c) => (
                <tr key={c.baseCourseCode}>
                  <td><span className="cga-course-name">{c.data.ten}</span><span className="cga-course-code">Mã học phần {c.baseCourseCode}{c.data.hai_he ? ' · có cả lớp đại trà và chất lượng cao' : ''}</span></td>
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

      <SectionCard
        title="Đặc điểm lặp lại qua nhiều học kỳ – có tên giảng viên"
        explain={EXPLAIN.facultyRepeat}
        explainKind="table"
        explainValues={{ cua_so: viInt(Number(overview.thresholds?.g1_cua_so_ky ?? 4)) }}
        description={`Cùng giảng viên, cùng học phần, cùng một đặc điểm ở nhiều học kỳ trong ${viInt(Number(overview.thresholds?.g1_cua_so_ky ?? 4))} kỳ gần nhất tính đến ${termLabel.get(termCode) ?? termCode}. ${viInt(repeats.length)} lượt, ${viInt(repeats.filter((r) => r.ongoing).length)} đang tiếp diễn. Sự lặp lại có thể do ngẫu nhiên; đây là căn cứ để trao đổi, không phải kết luận.`}
      >
        {termsUpToNow.length < minRepeatTerms ? (
          <p className="cga-muted">Cần ít nhất {viInt(minRepeatTerms)} học kỳ đã nạp để xét đặc điểm lặp lại.</p>
        ) : loadingRepeat ? (
          <div className="cga-state"><LoaderCircle className="spin" /> Đang tải...</div>
        ) : repeatError ? (
          <div className="cga-alert" role="alert">{repeatError}</div>
        ) : (
          <div className="cga-table-wrap">
            <table className="cga-table">
              <thead>
                <tr><th>Giảng viên</th><th>Học phần</th><th>Đặc điểm lặp lại</th><th>Các học kỳ có đặc điểm</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr>
              </thead>
              <tbody>
                {repeats.map((r) => (
                  <tr key={r.key}>
                    <td className="cga-name-col">{r.lecturer}</td>
                    <td className="cga-name-col"><span className="cga-course-name">{r.courseName}</span><span className="cga-course-code">Mã học phần {r.courseCode}</span></td>
                    <td><MarkerChips codes={[r.marker]} /></td>
                    <td>{r.terms.map((ky) => termLabel.get(ky) ?? ky).join(', ')}</td>
                    <td>{r.ongoing ? 'Đang tiếp diễn' : 'Đã ghi nhận trước đây'}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenTrends(r.departmentId)}>
                        Xem diễn biến
                      </button>
                    </td>
                  </tr>
                ))}
                {repeats.length === 0 && <tr><td colSpan={6} className="cga-muted">Không có đặc điểm nào lặp lại trong học kỳ này.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
