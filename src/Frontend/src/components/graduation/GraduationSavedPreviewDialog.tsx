import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import { Modal } from '../Modal';
import { graduationAnalyticsApi } from '../../services/graduationAnalyticsApi';
import type {
  GraduationImportPreviewV3,
  GraduationManagedPeriod,
  GraduationRankV3,
} from '../../types/graduationAnalytics';

interface GraduationSavedPreviewDialogProps {
  period: GraduationManagedPeriod | null;
  onClose: () => void;
}

const rankLabel = (rank: GraduationRankV3) => ({
  1: 'Xuất sắc',
  2: 'Giỏi',
  3: 'Khá',
  4: 'Trung bình',
}[rank]);

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
    void graduationAnalyticsApi.activePreview(period.periodId)
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
        <div className="graduation-preview"><table><thead><tr><th>Khoa</th><th>Chuyên ngành</th><th>Khóa</th><th>Xếp loại</th><th>Trạng thái</th><th>Số lượng</th></tr></thead><tbody>{preview.aggregates.slice(0, 150).map((row, index) => <tr key={`${row.facultyKey}-${row.programKey}-${row.cohortCode}-${row.graduationRank}-${row.isWorkStudy}-${index}`}><td>{row.facultyNameRaw}</td><td>{row.programNameRaw}</td><td>{row.cohortCode}</td><td>{rankLabel(row.graduationRank)}</td><td>{row.isWorkStudy ? 'Hệ VLVH' : 'Đúng hạn'}</td><td>{row.studentCount}</td></tr>)}</tbody></table></div>
        {preview.aggregates.length > 150 && <p className="graduation-note">Hiển thị 150/{preview.aggregates.length} tổ hợp tổng hợp.</p>}
      </>}
    </div>
  </Modal>;
}
