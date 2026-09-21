import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Modal } from '../Modal';
import { graduationAnalytics2Api } from '../../services/graduationAnalytics2Api';
import type {
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
} from '../../types/graduationAnalytics2';

/** Năm học 2018-2019 ứng với khoá 59, mỗi năm sau tăng một khoá. */
const BASE_ACADEMIC_YEAR_START = 2018;
const BASE_COHORT_NUMBER = 59;

/** Chương trình chuẩn 4 năm. */
const STANDARD_PROGRAM_YEARS = 4;

/**
 * Đúng hạn xét theo khoá học chứ không theo hệ đào tạo: khoá 62 nhập năm học
 * 2021-2022 thì chỉ đợt của năm học 2024-2025 mới là đúng hạn.
 */
const isOnTime = (cohortCode: string, academicYearStart: number) => {
  const digits = (cohortCode ?? '').replace(/\D/g, '');
  if (!digits) return false;
  const cohortYearStart = BASE_ACADEMIC_YEAR_START + (Number(digits) - BASE_COHORT_NUMBER);
  return academicYearStart - cohortYearStart === STANDARD_PROGRAM_YEARS - 1;
};

const statusLabel = (cohortCode: string, academicYearStart: number, isWorkStudy: boolean) =>
  `${isOnTime(cohortCode, academicYearStart) ? 'Đúng hạn' : 'Quá hạn'}${isWorkStudy ? ' · VLVH' : ''}`;

interface GraduationSavedPreviewDialogProps {
  period: GraduationManagedPeriod | null;
  onClose: () => void;
}

const uploadedAtLabel = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleTimeString('vi-VN')} ngày ${date.toLocaleDateString('vi-VN')}`;
};

export function GraduationSavedPreviewDialog({
  period,
  onClose,
}: GraduationSavedPreviewDialogProps) {
  const [preview, setPreview] = useState<GraduationImportPreviewV3 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!period) {
      setPreview(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setPreview(null);
    setError(null);
    void graduationAnalytics2Api.activePreview(period.periodId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setError('Không tải được dữ liệu xem trước. Vui lòng thử lại.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [period]);

  return <Modal
    isOpen={Boolean(period)}
    onClose={onClose}
    title={period ? `Xem dữ liệu đã tải lên · Đợt ${period.roundNumber} · ${period.academicYearLabel}` : ''}
    size="data-preview"
  >
    <div className="graduation-import" aria-busy={loading}>
      {period && <div className="graduation-import__picker graduation-import__picker--readonly has-file">
        <div className="graduation-import__file-icon"><FileSpreadsheet size={24} /></div>
        <div className="graduation-import__file-copy">
          <strong>{period.originalFileName}</strong>
          <span>Tải lên vào {uploadedAtLabel(period.importedAtUtc)} bởi {period.importedByName}</span>
        </div>
        <Eye aria-hidden="true" size={20} />
      </div>}

      {loading && <div className="graduation-state"><LoaderCircle className="spin" /> Đang tải dữ liệu xem trước...</div>}
      {error && <div className="graduation-alert" role="alert">{error}</div>}

      {preview && <>
        <div className="graduation-import__summary">
          <div><strong>{preview.sourceRowCount.toLocaleString('vi-VN')}</strong><span>dòng nguồn</span></div>
          <div><strong>{preview.importedRowCount.toLocaleString('vi-VN')}</strong><span>dòng được tính</span></div>
          <div><strong>{preview.skippedRowCount.toLocaleString('vi-VN')}</strong><span>dòng bị bỏ</span></div>
          <div><strong>{preview.sourceSheetName}</strong><span>sheet được đọc</span></div>
        </div>
        {preview.warnings.map((warning) => <div className="graduation-warning" role="status" key={`${warning.code}-${warning.classCode}`}>
          <AlertTriangle size={17} /><div><strong>{warning.message}</strong><span>Sheet {warning.sourceSheetName}, dòng {warning.sourceRowNumbers.join(', ')}. Dòng này không tham gia bất kỳ KPI nào.</span></div>
        </div>)}
        <div className="graduation-preview"><table><thead><tr><th>Khoa</th><th>Chuyên ngành</th><th>Khóa</th><th>Trạng thái</th><th>Số lượng</th></tr></thead><tbody>{preview.aggregates.slice(0, 150).map((row, index) => <tr key={`${row.facultyKey}-${row.programKey}-${row.cohortCode}-${row.graduationRank}-${row.isWorkStudy}-${index}`}><td>{row.facultyNameRaw}</td><td>{row.programNameRaw}</td><td>{row.cohortCode}</td><td>{statusLabel(row.cohortCode, period?.academicYearStart ?? 0, row.isWorkStudy)}</td><td>{row.studentCount}</td></tr>)}</tbody></table></div>
        {preview.aggregates.length > 150 && <p className="graduation-note">Hiển thị 150/{preview.aggregates.length} tổ hợp tổng hợp.</p>}
      </>}
    </div>
  </Modal>;
}
