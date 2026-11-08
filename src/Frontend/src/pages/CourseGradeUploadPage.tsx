import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, Eye, FileSpreadsheet, LoaderCircle, RotateCcw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { useSemester } from '../context/semesterContext';
import { courseGradeErrorMessage, courseGradesApi } from '../services/courseGradesApi';
import type {
  CourseGradeImportPreview,
  CourseGradeSemester,
  GradeAnalysisRun,
} from '../types/courseGrades';
import '../styles/course-grades.css';

/*
  Phân tích điểm học phần → Tải lên dữ liệu điểm.

  Chọn kỳ rồi nạp, giống trang Lớp học phần: file điểm được gắn vào đúng kỳ đang chọn, không
  suy kỳ từ cột f_nhhk. Kỳ phải có lớp học phần trước (nạp file lớp ở trang Lớp học phần).

  Hai bước như module tốt nghiệp: "Xem trước" chỉ đọc file và trả số đếm; "Xác nhận" gửi lại
  đúng file đó, backend so mã băm rồi mới ghi. Trang không bao giờ nhận dòng điểm của từng
  sinh viên, chỉ có số đếm và mã lớp.
*/

const numberFormat = new Intl.NumberFormat('vi-VN');
const formatNumber = (value: number) => numberFormat.format(value);
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const RUN_STATUS_LABEL: Record<GradeAnalysisRun['status'], string> = {
  Queued: 'Đang chờ tính',
  Running: 'Đang tính',
  Succeeded: 'Đã tính xong',
  Failed: 'Tính lỗi',
};

const LIST_PREVIEW_LIMIT = 8;

export function CourseGradeUploadPage() {
  const { academicYears, activeSemesterId } = useSemester();
  const [semesterId, setSemesterId] = useState<number | null>(activeSemesterId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CourseGradeImportPreview | null>(null);
  const [replaceReason, setReplaceReason] = useState('');
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [semesters, setSemesters] = useState<CourseGradeSemester[]>([]);
  const [latestRun, setLatestRun] = useState<GradeAnalysisRun | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [removing, setRemoving] = useState<CourseGradeSemester | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [showAllMissing, setShowAllMissing] = useState(false);
  const [showAllWithoutGrades, setShowAllWithoutGrades] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ với học kỳ đang chọn trên thanh trên cùng, như trang Lớp học phần.
  useEffect(() => {
    if (activeSemesterId !== null) setSemesterId(activeSemesterId);
  }, [activeSemesterId]);

  const semesterOptions = useMemo(
    () => [...academicYears]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((year) => ({ year, semesters: year.semesters })),
    [academicYears],
  );

  const loadedSemesterIds = useMemo(() => new Set(semesters.map((s) => s.semesterId)), [semesters]);

  const reload = useCallback(async () => {
    setLoadingList(true);
    try {
      const [loaded, run] = await Promise.all([courseGradesApi.semesters(), courseGradesApi.latestRun()]);
      setSemesters(loaded);
      setLatestRun(run ?? null);
    } catch (loadError) {
      setError(courseGradeErrorMessage(loadError, 'Không tải được danh sách kỳ đã nạp điểm.'));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const resetPreview = () => {
    setPreview(null);
    setReplaceReason('');
    setShowAllMissing(false);
    setShowAllWithoutGrades(false);
  };

  const chooseFile = (next: File | null) => {
    setFile(next);
    setError(null);
    resetPreview();
  };

  const runPreview = async () => {
    if (semesterId === null || !file) return;
    setBusy('preview');
    setError(null);
    resetPreview();
    try {
      setPreview(await courseGradesApi.previewImport(semesterId, file));
    } catch (previewError) {
      setError(courseGradeErrorMessage(previewError, 'Không xem trước được file điểm.'));
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!preview || !file) return;
    setBusy('commit');
    setError(null);
    try {
      const result = await courseGradesApi.commitImport({
        semesterId: preview.semesterId,
        file,
        previewFileHash: preview.fileHash,
        expectedActiveRevisionId: preview.activeRevisionId,
        replaceReason: preview.activeRevisionId ? replaceReason : null,
      });
      toast.success(
        `Đã nạp ${formatNumber(result.importedRowCount)} dòng điểm cho ${preview.semesterLabel}`
        + (result.createdStudentCount > 0 ? `, thêm ${formatNumber(result.createdStudentCount)} sinh viên mới.` : '.'),
      );
      chooseFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await reload();
    } catch (commitError) {
      setError(courseGradeErrorMessage(commitError, 'Không nạp được file điểm.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    try {
      await courseGradesApi.removeSemester(removing.semesterId, removeReason);
      toast.success(`Đã gỡ điểm của ${removing.semesterLabel}.`);
      setRemoving(null);
      setRemoveReason('');
      await reload();
    } catch (removeError) {
      toast.error(courseGradeErrorMessage(removeError, 'Không gỡ được điểm của kỳ này.'));
    }
  };

  const needsReason = preview?.activeRevisionId != null;
  const canCommit = preview !== null && busy === null && (!needsReason || replaceReason.trim().length > 0);
  const missingShown = showAllMissing ? preview?.missingSections ?? [] : (preview?.missingSections ?? []).slice(0, LIST_PREVIEW_LIMIT);
  const withoutShown = showAllWithoutGrades
    ? preview?.sectionsWithoutGrades ?? []
    : (preview?.sectionsWithoutGrades ?? []).slice(0, LIST_PREVIEW_LIMIT);

  return (
    <div className="course-grade-page">
      <header className="course-grade-heading">
        <div className="course-grade-heading__title">
          <Upload size={20} aria-hidden="true" />
          <div>
            <h2>Tải lên dữ liệu điểm</h2>
            <p>Chọn học kỳ rồi nạp file “Điểm học tập của SV theo kỳ”. Kỳ phải có danh sách lớp học phần trước.</p>
          </div>
        </div>
        <div className="course-grade-heading__summary" aria-label="Tóm tắt">
          <span><strong>{formatNumber(semesters.length)}</strong> kỳ đã nạp điểm</span>
          {latestRun && (
            <span className={`course-grade-run course-grade-run--${latestRun.status.toLowerCase()}`}>
              Phân tích: {RUN_STATUS_LABEL[latestRun.status]}
              <small>{formatDateTime(latestRun.finishedAtUtc ?? latestRun.requestedAtUtc)}</small>
            </span>
          )}
        </div>
      </header>

      <section className="course-grade-card" aria-labelledby="course-grade-upload-title">
        <h3 id="course-grade-upload-title">1. Chọn kỳ và file điểm</h3>
        <div className="course-grade-toolbar">
          <label className="course-grade-field">
            <span>Học kỳ</span>
            <select
              value={semesterId ?? ''}
              onChange={(event) => {
                setSemesterId(event.target.value ? Number(event.target.value) : null);
                resetPreview();
              }}
            >
              <option value="">Chọn học kỳ</option>
              {semesterOptions.map(({ year, semesters: yearSemesters }) => (
                <optgroup key={year.academicYearId} label={`Năm học ${year.academicYearName}`}>
                  {yearSemesters.map((semester) => (
                    <option key={semester.semesterId} value={semester.semesterId}>
                      {semester.semesterName} {year.academicYearName}
                      {loadedSemesterIds.has(semester.semesterId) ? ' · đã có điểm' : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="course-grade-field course-grade-field--file">
            <span>File điểm (.xlsx)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={semesterId === null || !file || busy !== null}
            onClick={() => void runPreview()}
          >
            {busy === 'preview' ? <LoaderCircle className="spin" size={16} /> : <Eye size={16} />}
            Xem trước
          </button>
        </div>
        <p className="course-grade-note">
          File được đọc trong bộ nhớ máy chủ, không lưu lại. Điểm được mã hóa trước khi ghi vào cơ sở dữ liệu.
        </p>
      </section>

      {error && (
        <div className="course-grade-alert" role="alert">
          <CircleAlert size={16} aria-hidden="true" /> {error}
        </div>
      )}

      {preview && (
        <section className="course-grade-card" aria-labelledby="course-grade-preview-title">
          <h3 id="course-grade-preview-title">2. Đối soát · {preview.semesterLabel}</h3>
          <p className="course-grade-note">
            File <strong>{preview.fileName}</strong>, sheet “{preview.sheetName}”.
          </p>

          <dl className="course-grade-kpis">
            <div><dt>Dòng trong file</dt><dd>{formatNumber(preview.sourceRowCount)}</dd></div>
            <div><dt>Dòng dùng được (bộ luật A)</dt><dd>{formatNumber(preview.usableRowCount)}</dd></div>
            <div><dt>Ghép được với lớp học phần</dt><dd>{formatNumber(preview.matchedRowCount)}</dd></div>
            <div><dt>Sinh viên</dt><dd>{formatNumber(preview.studentCount)}<small>{formatNumber(preview.newStudentCount)} mới</small></dd></div>
          </dl>

          {preview.warnings.length > 0 && (
            <ul className="course-grade-warnings">
              {preview.warnings.map((warning) => <li key={warning}><CircleAlert size={14} aria-hidden="true" />{warning}</li>)}
            </ul>
          )}

          <div className="course-grade-columns">
            <div>
              <h4>Dòng bị loại</h4>
              {preview.excludedRows.length === 0 ? <p className="course-grade-muted">Không có.</p> : (
                <table className="course-grade-table">
                  <thead><tr><th>Luật</th><th>Lý do</th><th className="num">Số dòng</th></tr></thead>
                  <tbody>
                    {preview.excludedRows.map((row) => (
                      <tr key={row.rule}><td>{row.rule}</td><td>{row.description}</td><td className="num">{formatNumber(row.count)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <h4>
                Lớp có điểm nhưng không có trong danh sách lớp
                <span className="course-grade-count">{formatNumber(preview.missingSectionCount)} lớp · {formatNumber(preview.missingSectionRowCount)} dòng</span>
              </h4>
              <p className="course-grade-muted">Các dòng này không đưa vào phân tích (bộ luật B-G1).</p>
              {preview.missingSections.length > 0 && (
                <table className="course-grade-table">
                  <thead><tr><th>Mã HP</th><th>Nhóm</th><th>Học phần</th><th className="num">Số dòng</th></tr></thead>
                  <tbody>
                    {missingShown.map((row) => (
                      <tr key={`${row.courseCode}|${row.sectionName ?? ''}`}>
                        <td>{row.courseCode}</td><td>{row.sectionName ?? <em>(trống)</em>}</td><td>{row.courseName ?? ''}</td><td className="num">{formatNumber(row.rowCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {preview.missingSections.length > LIST_PREVIEW_LIMIT && (
                <button type="button" className="course-grade-link" onClick={() => setShowAllMissing((v) => !v)}>
                  {showAllMissing ? 'Thu gọn' : `Xem cả ${formatNumber(preview.missingSections.length)} lớp`}
                </button>
              )}
            </div>
          </div>

          <div>
            <h4>
              Lớp chưa có dòng điểm nào
              <span className="course-grade-count">{formatNumber(preview.sectionsWithoutGradesCount)} lớp</span>
            </h4>
            <p className="course-grade-muted">Lớp có trong danh sách lớp của kỳ nhưng không có trong file điểm (bộ luật B-G2).</p>
            {withoutShown.length > 0 && <ul className="course-grade-chips">{withoutShown.map((label) => <li key={label}>{label}</li>)}</ul>}
            {preview.sectionsWithoutGrades.length > LIST_PREVIEW_LIMIT && (
              <button type="button" className="course-grade-link" onClick={() => setShowAllWithoutGrades((v) => !v)}>
                {showAllWithoutGrades ? 'Thu gọn' : `Xem cả ${formatNumber(preview.sectionsWithoutGrades.length)} lớp`}
              </button>
            )}
          </div>

          <div className="course-grade-confirm">
            {needsReason && (
              <label className="course-grade-field course-grade-field--wide">
                <span>Kỳ này đã có điểm. Lý do nạp lại (bắt buộc)</span>
                <textarea
                  rows={2}
                  value={replaceReason}
                  maxLength={1000}
                  placeholder="Ví dụ: Phòng Đào tạo gửi lại file đã sửa điểm phúc khảo"
                  onChange={(event) => setReplaceReason(event.target.value)}
                />
              </label>
            )}
            <div className="course-grade-confirm__actions">
              <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={resetPreview}>
                <RotateCcw size={16} /> Hủy
              </button>
              <button type="button" className="btn btn-primary" disabled={!canCommit} onClick={() => void commit()}>
                {busy === 'commit' ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
                {needsReason ? 'Xác nhận nạp lại' : 'Xác nhận nạp'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="course-grade-card" aria-labelledby="course-grade-loaded-title">
        <h3 id="course-grade-loaded-title">Các kỳ đã nạp điểm</h3>
        {loadingList ? (
          <div className="course-grade-state"><LoaderCircle className="spin" /> Đang tải...</div>
        ) : semesters.length === 0 ? (
          <div className="course-grade-empty">
            <FileSpreadsheet size={36} aria-hidden="true" />
            <p>Chưa có kỳ nào được nạp điểm.</p>
          </div>
        ) : (
          <table className="course-grade-table">
            <thead>
              <tr>
                <th>Học kỳ</th><th>File</th><th className="num">Dòng trong file</th><th className="num">Dùng được</th>
                <th className="num">Bị loại</th><th>Nạp lúc</th><th>Người nạp</th><th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {semesters.map((row) => (
                <tr key={row.semesterId}>
                  <td><strong>{row.semesterLabel}</strong>{row.revisionNumber > 1 && <small className="course-grade-muted"> · lần {row.revisionNumber}</small>}</td>
                  <td title={row.originalFileName}>{row.originalFileName}</td>
                  <td className="num">{formatNumber(row.sourceRowCount)}</td>
                  <td className="num">{formatNumber(row.importedRowCount)}</td>
                  <td className="num">{formatNumber(row.skippedRowCount)}</td>
                  <td>{formatDateTime(row.importedAtUtc)}</td>
                  <td>{row.importedByName}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary course-grade-icon-button"
                      title={`Gỡ điểm của ${row.semesterLabel}`}
                      onClick={() => { setRemoving(row); setRemoveReason(''); }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      <span className="course-grade-sr-only">Gỡ điểm của {row.semesterLabel}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <Modal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Gỡ điểm của ${removing?.semesterLabel ?? ''}`}
        size="compact"
        submitText="Gỡ điểm"
        onSubmit={() => void confirmRemove()}
      >
        <p>
          Toàn bộ {formatNumber(removing?.importedRowCount ?? 0)} dòng điểm của kỳ này sẽ bị <strong>xóa hẳn</strong>,
          chỉ giữ lại lịch sử lần nạp. Kết quả phân tích sẽ được tính lại không có kỳ này.
        </p>
        <label className="course-grade-field course-grade-field--wide">
          <span>Lý do (không bắt buộc)</span>
          <textarea rows={2} maxLength={500} value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} />
        </label>
      </Modal>
    </div>
  );
}

export default CourseGradeUploadPage;
