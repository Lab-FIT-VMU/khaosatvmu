import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  Copy,
  LoaderCircle,
  Save,
  Undo2,
  X,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { Modal } from '../Modal';
import { SentimentAnalysisPanel } from './SentimentAnalysisPanel';
import { SentimentBadge } from './SentimentBadge';
import { reportApi } from '../../services/reportApi';
import { surveyApi } from '../../services/surveyApi';
import { useAuth } from '../../auth/authContext';
import type {
  Department,
  Faculty,
  Lecturer,
  OpenCommentAnalysisReport,
  OpenCommentItem,
  OpenCommentSentiment,
  SurveyResponseDetail,
} from '../../types';
import { foldVietnamese } from '../../utils/vietnamese';
import { formatDecimal } from '../../utils/formatNumber';

/** Quyền được sửa nhãn model. Backend vẫn kiểm tra lại; đây chỉ là lớp ẩn nút. */
const REVIEW_PERMISSION = 'OPEN_COMMENT_SENTIMENT_REVIEW';

/** Năm nhãn cho ô chọn khi hiệu chỉnh, giữ đúng thứ tự hiển thị trên bảng KPI. */
const SENTIMENT_OPTIONS: { value: OpenCommentSentiment; label: string }[] = [
  { value: 'Positive', label: 'Tích cực' },
  { value: 'Negative', label: 'Tiêu cực' },
  { value: 'Neutral', label: 'Trung tính' },
  { value: 'Mixed', label: 'Hỗn hợp' },
  { value: 'Uncertain', label: 'Chưa chắc chắn' },
];

interface OpenCommentAnalysisProps {
  semesterId: number;
  semesterSurveyId?: number;
  semesterLabel: string;
  surveyName?: string;
  faculties?: Faculty[];
  departments?: Department[];
  lecturers?: Lecturer[];
  onOpenSurvey?: (courseSectionSurveyId: number) => void;
  onOpenLecturer?: (lecturerId: number, lecturerName: string) => void;
  onOpenUnidentifiedLecturer?: (lecturerName: string, facultyId: number) => void;
}

export const OpenCommentAnalysis: React.FC<OpenCommentAnalysisProps> = ({
  semesterId,
  semesterSurveyId,
  semesterLabel,
  surveyName,
  onOpenSurvey,
  onOpenLecturer,
  onOpenUnidentifiedLecturer,
}) => {
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OpenCommentAnalysisReport | null>(null);
  const [activeModalComment, setActiveModalComment] = useState<OpenCommentItem | null>(null);
  const [responseDetail, setResponseDetail] = useState<SurveyResponseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Trạng thái hiệu chỉnh nhãn cảm xúc trong modal chi tiết.
  // reviewConfirming giữ HÀNH ĐỘNG đang chờ xác nhận: null là chưa xác nhận gì, chuỗi rỗng là
  // đang xác nhận bỏ hiệu chỉnh, còn lại là nhãn sắp ghi. Gộp một chỗ để không có nhánh nào
  // ghi được nhãn mà bỏ qua bước xác nhận.
  const [reviewDraft, setReviewDraft] = useState<OpenCommentSentiment | ''>('');
  const [reviewConfirming, setReviewConfirming] = useState<OpenCommentSentiment | '' | null>(null);
  const [reviewSaving, setReviewSaving] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const { access } = useAuth();
  const canReview = access?.permissions.includes(REVIEW_PERMISSION) === true;

  /**
   * Số thứ tự của lần tải gần nhất. Đổi học kỳ liên tục thì phản hồi cũ về sau có thể ghi đè
   * kết quả mới; so số này trước khi ghi state là cách chặn rẻ nhất.
   */
  const requestIdRef = useRef(0);

  // Tải dữ liệu ý kiến mở từ backend. `silent` dùng khi tải lại sau hiệu chỉnh để không
  // chớp bảng thành vòng xoay trong lúc người dùng còn đang mở modal.
  const loadComments = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current;
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await reportApi.openComments({
        semesterId,
        semesterSurveyId,
      });
      if (requestId === requestIdRef.current) {
        setReport(data);
      }
    } catch {
      if (requestId === requestIdRef.current && !options?.silent) {
        setError('Không tải được danh sách ý kiến mở. Vui lòng thử lại sau.');
      }
    } finally {
      if (requestId === requestIdRef.current && !options?.silent) {
        setLoading(false);
      }
    }
  }, [semesterId, semesterSurveyId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  // Mở chi tiết phiếu khảo sát và nạp toàn bộ câu trả lời
  const handleOpenDetail = async (item: OpenCommentItem) => {
    setActiveModalComment(item);
    setDetailLoading(true);
    setResponseDetail(null);
    // Mỗi phiếu có một phiên hiệu chỉnh riêng: mở phiếu khác phải xoá lựa chọn và thông báo cũ,
    // nếu không người dùng tưởng nhãn vừa chọn đã thuộc về phiếu đang mở.
    setReviewDraft('');
    setReviewConfirming(null);
    setReviewError(null);
    setReviewNotice(null);
    try {
      const data = await surveyApi.surveyResponse(item.responseId);
      setResponseDetail(data);
    } catch {
      // Nếu API trả lời thất bại thì modal vẫn hiển thị thông tin ý kiến
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setActiveModalComment(null);
    setResponseDetail(null);
    setReviewDraft('');
    setReviewConfirming(null);
    setReviewError(null);
    setReviewNotice(null);
  };

  /**
   * Lưu nhãn hiệu chỉnh. Chỉ gọi được khi người dùng đã bấm qua bước xác nhận.
   * Truyền chuỗi rỗng khi bỏ hiệu chỉnh để backend xoá nhãn người đặt.
   */
  const submitReview = async (sentiment: OpenCommentSentiment | '') => {
    if (!activeModalComment) return;
    setReviewSaving(true);
    setReviewError(null);
    setReviewNotice(null);
    try {
      await reportApi.reviewOpenCommentSentiment(activeModalComment.responseId, sentiment);
      const label = SENTIMENT_OPTIONS.find((option) => option.value === sentiment)?.label ?? null;
      setActiveModalComment({
        ...activeModalComment,
        sentiment: sentiment === '' ? activeModalComment.sentiment : sentiment,
        sentimentLabel: sentiment === '' ? activeModalComment.sentimentLabel : label,
        isManuallyReviewed: sentiment !== '',
      });
      setReviewDraft('');
      setReviewConfirming(null);
      setReviewNotice(
        sentiment === ''
          ? 'Đã bỏ hiệu chỉnh, nhãn quay về kết quả của model.'
          : 'Đã lưu nhãn hiệu chỉnh.',
      );
      // Tải lại bảng để KPI và biểu đồ phân bố khớp với nhãn vừa sửa.
      await loadComments({ silent: true });
    } catch {
      setReviewError('Không lưu được nhãn. Vui lòng thử lại sau.');
    } finally {
      setReviewSaving(false);
    }
  };

  // Tìm kiếm tức thì không dấu
  const displayComments = useMemo(() => {
    if (!report?.comments) return [];
    const term = foldVietnamese(search.trim().toLowerCase());
    if (!term) return report.comments;

    return report.comments.filter((item) => {
      const commentFolded = foldVietnamese(item.additionalComments.toLowerCase());
      const courseFolded = foldVietnamese(`${item.courseCode} ${item.courseName}`.toLowerCase());
      const lecturerFolded = foldVietnamese(item.lecturerName.toLowerCase());
      const sectionFolded = foldVietnamese(item.sectionName.toLowerCase());
      const deptFolded = foldVietnamese(item.departmentName.toLowerCase());
      const facFolded = foldVietnamese(item.facultyName.toLowerCase());

      return (
        commentFolded.includes(term) ||
        courseFolded.includes(term) ||
        lecturerFolded.includes(term) ||
        sectionFolded.includes(term) ||
        deptFolded.includes(term) ||
        facFolded.includes(term)
      );
    });
  }, [report, search]);

  const handleCopyComment = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateTime = (isoDate: string) => {
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return isoDate;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return isoDate;
    }
  };

  // Cấu hình các cột hiển thị trong bảng
  const columns: Column<OpenCommentItem>[] = useMemo(
    () => [
      {
        key: 'submittedAt',
        header: 'Thời gian',
        width: '90px',
        sortValue: (item) => new Date(item.submittedAt).getTime(),
        render: (item) => (
          <span className="operations-code" style={{ fontSize: '12px' }}>
            {formatDateTime(item.submittedAt)}
          </span>
        ),
      },
      {
        key: 'facultyName',
        header: 'Khoa / Viện',
        width: '95px',
        sortValue: (item) => item.facultyName,
        filterValue: (item) => item.facultyName,
        render: (item) => <span className="operations-primary-text">{item.facultyName}</span>,
      },
      {
        key: 'departmentName',
        header: 'Bộ môn',
        width: '80px',
        sortValue: (item) => item.departmentName,
        filterValue: (item) => item.departmentName,
        render: (item) => <span>{item.departmentName}</span>,
      },
      {
        key: 'courseName',
        header: 'Lớp học phần',
        width: '150px',
        sortValue: (item) => `${item.courseCode} ${item.courseName} ${item.sectionName}`,
        filterValue: (item) => `${item.courseCode} - ${item.courseName} (${item.sectionName})`,
        render: (item) => (
          onOpenSurvey ? (
            <button
              type="button"
              className="reports-cell-link"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSurvey(item.courseSectionSurveyId);
              }}
              title="Xem trang chi tiết lớp học phần"
              style={{
                display: 'block',
                textAlign: 'left',
                width: '100%',
                textDecoration: 'none',
                padding: 0,
              }}
            >
              <strong style={{ display: 'block', lineHeight: 1.35, color: '#0788b8', fontWeight: 650 }}>
                {item.courseName} {item.sectionName}
              </strong>
            </button>
          ) : (
            <div>
              <strong className="operations-primary-text" style={{ display: 'block', lineHeight: 1.35 }}>
                {item.courseName} {item.sectionName}
              </strong>
            </div>
          )
        ),
      },
      {
        key: 'lecturerName',
        header: 'Giảng viên',
        width: '105px',
        sortValue: (item) => item.lecturerName,
        filterValue: (item) => item.lecturerName,
        render: (item) => {
          const hasLecturer =
            item.lecturerName &&
            item.lecturerName.trim() !== '' &&
            item.lecturerName !== 'Chưa phân công';

          if (!hasLecturer) {
            return <span style={{ color: '#68737d' }}>{item.lecturerName || 'Chưa phân công'}</span>;
          }

          if (item.lecturerId && onOpenLecturer) {
            return (
              <button
                type="button"
                className="reports-cell-link"
                style={{ fontWeight: 600 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLecturer(item.lecturerId!, item.lecturerName);
                }}
                title="Xem báo cáo giảng viên"
              >
                {item.lecturerName}
              </button>
            );
          }

          if (onOpenUnidentifiedLecturer) {
            return (
              <button
                type="button"
                className="reports-cell-link"
                style={{ fontWeight: 600 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenUnidentifiedLecturer(item.lecturerName, item.facultyId ?? 0);
                }}
                title="Xem báo cáo giảng viên"
              >
                {item.lecturerName}
              </button>
            );
          }

          return <span style={{ fontWeight: 600 }}>{item.lecturerName}</span>;
        },
      },
      {
        key: 'score',
        header: 'Điểm của phiếu khảo sát',
        width: '90px',
        align: 'center',
        numeric: true,
        sortValue: (item) => item.score,
        render: (item) => (
          <span style={{ fontWeight: 650, color: item.score >= 4 ? '#0f6b47' : item.score >= 3 ? '#b54708' : '#b42318' }}>
            {item.score > 0 ? formatDecimal(item.score, 3) : '—'}
          </span>
        ),
      },
      {
        key: 'sentiment',
        header: 'Phân loại cảm xúc',
        headerHint:
          'Phần trăm cho biết hệ thống chắc chắn đến mức nào khi nhận định một ý kiến là tích cực, tiêu cực, trung tính hoặc vừa khen vừa chê. Ví dụ: 91% nghĩa là hệ thống khá chắc với nhận định đang hiển thị. Kết quả này chỉ để tham khảo, có thể chưa chính xác và người có quyền có thể sửa lại sau khi đọc nội dung góp ý.',
        width: '130px',
        // Lọc kiểu Excel theo NHÃN (đúng yêu cầu nghiệp vụ) nhưng sắp xếp theo ĐỘ TIN CẬY:
        // việc cần làm nhiều nhất trên bảng này là tìm ra những câu model đoán chưa chắc để
        // người có chuyên môn xem lại. Ô chưa phân tích nhận giá trị -1 nên luôn xếp cuối.
        sortValue: (item) => item.confidence ?? -1,
        filterValue: (item) => item.sentimentLabel ?? 'Chưa phân tích',
        quickFilters: [
          { label: 'Chỉ ý kiến tiêu cực', match: (value) => value === 'Tiêu cực' },
          { label: 'Chỉ ý kiến chưa chắc chắn', match: (value) => value === 'Chưa chắc chắn' },
          { label: 'Chỉ ý kiến chưa phân tích', match: (value) => value === 'Chưa phân tích' },
        ],
        render: (item) => (
          <SentimentBadge
            sentiment={item.sentiment}
            label={item.sentimentLabel}
            confidence={item.confidence}
            isManuallyReviewed={item.isManuallyReviewed}
          />
        ),
      },
      {
        key: 'additionalComments',
        header: 'Nội dung ý kiến đóng góp',
        render: (item) => (
          <div
            className="open-comment-content"
            title="Bấm vào dòng để xem chi tiết phiếu khảo sát"
          >
            <div className="response-comment">
              "{item.additionalComments}"
            </div>
          </div>
        ),
      },
    ],
    [onOpenSurvey, onOpenLecturer, onOpenUnidentifiedLecturer]
  );

  // Cấu hình xuất Excel
  const exportConfig = useMemo(
    () => ({
      title: 'BÁO CÁO PHÂN TÍCH Ý KIẾN MỞ CỦA SINH VIÊN',
      fileName: `bao-cao-y-kien-mo-${semesterLabel}`,
      subtitle: `${semesterLabel}${surveyName ? ` · ${surveyName}` : ''}`,
      breadcrumb: ['Thống kê & Báo cáo', 'Phân tích ý kiến mở'],
      info: {
        'Học kỳ': semesterLabel,
        'Đợt khảo sát': surveyName || 'Tất cả các đợt',
        'Tổng số ý kiến thu thập': report?.totalComments ?? 0,
        'Tỷ lệ phiếu có ý kiến': `${report?.commentRate ?? 0}%`,
        'Số lớp học phần có ý kiến': report?.sectionCountWithComments ?? 0,
        'Số giảng viên nhận ý kiến': report?.lecturerCountWithComments ?? 0,
        'Số ý kiến đã phân tích cảm xúc': report?.analyzedCommentCount ?? 0,
        'Số ý kiến chưa phân tích': report?.pendingAnalysisCount ?? 0,
        'Số ý kiến đã hiệu chỉnh thủ công': report?.manuallyReviewedCount ?? 0,
      },
      summaryNotes: [
        'Dữ liệu bao gồm các ý kiến mở do sinh viên phản hồi trong bài khảo sát học phần.',
        'Hệ thống bảo đảm hoàn toàn tính ẩn danh: không lưu thông tin người gửi.',
        'Cột Phân loại cảm xúc do mô hình tự động gán, cần đối chiếu nội dung gốc trước khi kết luận.',
        'Nhãn "Chưa chắc chắn" nghĩa là hệ thống chưa đủ căn cứ kết luận, không phải ý kiến trung tính.',
        'Độ tin cậy là xác suất của mô hình cho nhãn dự đoán; ý kiến đã hiệu chỉnh thủ công ghi "Đã hiệu chỉnh" vì nhãn do người đặt.',
      ],
      // Cột khai theo đúng bảng đang hiển thị: cùng tiêu đề, cùng cách in giá trị.
      columns: [
        { key: 'submittedAt', header: 'Thời gian', width: 18, format: (val: unknown) => formatDateTime(String(val)) },
        { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
        { key: 'departmentName', header: 'Bộ môn', width: 22 },
        { key: 'courseCode', header: 'Mã học phần', width: 14, align: 'center' as const },
        { key: 'courseName', header: 'Tên học phần', width: 28 },
        { key: 'sectionName', header: 'Nhóm lớp', width: 14, align: 'center' as const },
        {
          key: 'lecturerName',
          header: 'Giảng viên',
          width: 24,
          format: (val: unknown) => (val ? String(val) : 'Chưa phân công'),
        },
        {
          key: 'score',
          header: 'Điểm của phiếu khảo sát',
          width: 18,
          type: 'number' as const,
          align: 'right' as const,
          // Trang bảng in "—" khi phiếu chưa có điểm; in ra 0 thì người đọc tệp hiểu
          // thành phiếu bị chấm 0 điểm.
          format: (val: unknown) => (Number(val) > 0 ? formatDecimal(Number(val), 3) : '—'),
        },
        { key: 'isValid', header: 'Tính hợp lệ', width: 14, align: 'center' as const, format: (val: unknown) => (val ? 'Hợp lệ' : 'Bị bộ lọc loại') },
        { key: 'sentimentLabel', header: 'Phân loại cảm xúc', width: 18, align: 'center' as const, format: (val: unknown) => (val ? String(val) : 'Chưa phân tích') },
        {
          key: 'confidence',
          header: 'Độ tin cậy',
          width: 14,
          type: 'number' as const,
          align: 'right' as const,
          numberFormat: '0"%"',
          // Ô đã hiệu chỉnh thủ công ghi đúng chữ mà ô cảm xúc trên màn hình hiện,
          // thay vì để trống khiến người đọc tưởng thiếu dữ liệu.
          format: (val: unknown, row: OpenCommentItem) =>
            row.isManuallyReviewed
              ? 'Đã hiệu chỉnh'
              : val === null || val === undefined
                ? ''
                : Number((Number(val) * 100).toFixed(0)),
        },
        {
          key: 'isManuallyReviewed',
          header: 'Trạng thái hiệu chỉnh',
          width: 20,
          align: 'center' as const,
          format: (val: unknown) => (val ? 'Đã hiệu chỉnh thủ công' : 'Kết quả của model'),
        },
        { key: 'additionalComments', header: 'Nội dung ý kiến đóng góp', width: 45 },
      ],
    }),
    [semesterLabel, surveyName, report]
  );

  return (
    <div className="reports-comments-workspace" role="tabpanel" aria-label="Phân tích ý kiến mở">
      {/* Tiêu đề khối: dùng đúng class của tab Tổng quan để hai tab nhìn như một hệ. */}
      <header className="reports-exec-header">
        <div className="reports-exec-heading">
          <div>
            <h2>Phân tích ý kiến mở do sinh viên đóng góp</h2>
          </div>
        </div>
      </header>

      {/* 1. Lưới thẻ KPI, cùng kiểu thẻ với tab Tổng quan */}
      <div className="reports-overview-sections">
        <div className="reports-overview-group">
          <div className="reports-overview-group-header">
            <span className="reports-overview-group-title">Quy mô ý kiến đóng góp</span>
          </div>
          <div
            className="reports-overview-kpis"
            role="region"
            aria-label="Quy mô ý kiến đóng góp"
          >
            <div
              className="reports-overview-kpi-card"
              title="Tổng số ý kiến nhận xét mở do sinh viên nhập"
            >
              <span className="reports-overview-kpi-label">Tổng số ý kiến mở</span>
              <div className="reports-overview-kpi-value">
                <strong className="reports-overview-kpi-num">
                  {loading ? '...' : (report?.totalComments ?? 0).toLocaleString('vi-VN')}
                </strong>
                <span className="reports-overview-kpi-unit">ý kiến</span>
              </div>
              <span className="reports-overview-kpi-sub">Sinh viên tự nhập, không giới hạn chủ đề</span>
            </div>

            <div
              className="reports-overview-kpi-card"
              title="Tỷ lệ phiếu có ý kiến trên tổng số lượt nộp"
            >
              <span className="reports-overview-kpi-label">Tỷ lệ phiếu có ý kiến</span>
              <div className="reports-overview-kpi-value">
                <strong className="reports-overview-kpi-num">
                  {loading
                    ? '...'
                    : report && report.totalComments > 0 && report.commentRate === 0
                      ? '< 0,1%'
                      : `${report?.commentRate ?? 0}%`}
                </strong>
              </div>
              <span className="reports-overview-kpi-sub">Trên tổng số phiếu đã thu</span>
            </div>

            <div
              className="reports-overview-kpi-card"
              title="Số lớp học phần nhận được ý kiến phản hồi mở"
            >
              <span className="reports-overview-kpi-label">Lớp học phần có ý kiến</span>
              <div className="reports-overview-kpi-value">
                <strong className="reports-overview-kpi-num">
                  {loading ? '...' : (report?.sectionCountWithComments ?? 0).toLocaleString('vi-VN')}
                </strong>
                <span className="reports-overview-kpi-unit">lớp</span>
              </div>
              <span className="reports-overview-kpi-sub">Có ít nhất một ý kiến mở</span>
            </div>

            <div
              className="reports-overview-kpi-card"
              title="Số giảng viên nhận được ý kiến phản hồi mở"
            >
              <span className="reports-overview-kpi-label">Giảng viên nhận ý kiến</span>
              <div className="reports-overview-kpi-value">
                <strong className="reports-overview-kpi-num">
                  {loading ? '...' : (report?.lecturerCountWithComments ?? 0).toLocaleString('vi-VN')}
                </strong>
                <span className="reports-overview-kpi-unit">giảng viên</span>
              </div>
              <span className="reports-overview-kpi-sub">Được sinh viên nhắc tới trong ý kiến</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Phân bố cảm xúc: lưới thẻ chỉ số, biểu đồ donut và các ghi chú bắt buộc */}
      {!loading && !error && report && <SentimentAnalysisPanel report={report} />}

      {/* 3. Danh sách dữ liệu & DataTable (có sẵn tìm kiếm, sắp xếp và lọc cột) */}
      <section className="reports-table-section" aria-label="Bảng ý kiến mở">
        {loading ? (
          <div className="operations-empty" role="status">
            <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
            <strong>Đang tải và tổng hợp ý kiến mở...</strong>
          </div>
        ) : error ? (
          <div className="public-survey-alert" role="alert">
            <X aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={displayComments}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm kiếm nội dung ý kiến, môn học, lớp, giảng viên, khoa, bộ môn..."
            exportConfig={exportConfig}
            emptyMessage="Không tìm thấy ý kiến mở nào phù hợp."
            keyExtractor={(item) => String(item.responseId)}
            showIndex={true}
            onRowClick={(item) => void handleOpenDetail(item)}
          />
        )}
      </section>

      {/* 4. Modal xem toàn văn ý kiến & chi tiết phiếu khảo sát */}
      {activeModalComment &&
        createPortal(
          <Modal
            isOpen={true}
            onClose={closeDetail}
            title={`Chi tiết phiếu khảo sát #${activeModalComment.responseId}`}
            size="workspace"
          >
            <div className="response-detail">
              {/* Thông tin metadata của phiếu */}
              <div
                className="response-detail-meta"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '4px',
                }}
              >
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Học phần:</span>
                  <strong style={{ color: '#000000' }}>
                    {activeModalComment.courseCode} - {activeModalComment.courseName}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Lớp học phần:</span>
                  <strong style={{ color: '#000000' }}>{activeModalComment.sectionName}</strong>
                </div>
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Giảng viên:</span>
                  <strong style={{ color: '#000000' }}>{activeModalComment.lecturerName}</strong>
                </div>
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Khoa / Bộ môn:</span>
                  <span style={{ color: '#000000' }}>
                    {activeModalComment.departmentName} · {activeModalComment.facultyName}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Thời gian gửi:</span>
                  <span style={{ color: '#000000' }}>{formatDateTime(activeModalComment.submittedAt)}</span>
                </div>
                <div>
                  <span style={{ color: '#68737d', display: 'block', fontSize: '12px' }}>Điểm của phiếu khảo sát:</span>
                  <strong
                    style={{
                      fontSize: '14px',
                      color:
                        activeModalComment.score >= 4
                          ? '#0f6b47'
                          : activeModalComment.score >= 3
                          ? '#b54708'
                          : '#b42318',
                    }}
                  >
                    {activeModalComment.score > 0 ? formatDecimal(activeModalComment.score, 3) : '—'} / 5,0
                  </strong>{' '}
                  <span
                    className={`response-validity${activeModalComment.isValid ? '' : ' is-rejected'}`}
                    style={{ fontSize: '11px', padding: '1px 6px', marginLeft: '4px' }}
                  >
                    {activeModalComment.isValid ? 'Hợp lệ' : 'Bị lọc'}
                  </span>
                </div>
              </div>

              {/* Nội dung ý kiến đóng góp */}
              <div
                className="response-detail-comment"
                style={{
                  borderRadius: '4px',
                  background: '#ffffff',
                  border: '1px solid #dfe4e8',
                  padding: '14px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <strong style={{ color: '#1e293b', fontSize: '13px' }}>
                    Ý kiến đóng góp của sinh viên:
                  </strong>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      fontSize: '12px',
                    }}
                    onClick={() => handleCopyComment(activeModalComment.additionalComments)}
                  >
                    {copied ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                    <span>{copied ? 'Đã sao chép ý kiến!' : 'Sao chép ý kiến'}</span>
                  </button>
                </div>
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '6px',
                    padding: '12px 14px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    color: '#166534',
                    whiteSpace: 'pre-wrap',
                    fontStyle: 'italic',
                  }}
                >
                  "{activeModalComment.additionalComments}"
                </div>
              </div>

              {/* Phân loại cảm xúc và hiệu chỉnh thủ công */}
              <div className="sentiment-review-box">
                <div className="sentiment-review-head">
                  <strong style={{ fontSize: '13px', color: '#1e293b' }}>
                    Phân loại cảm xúc của ý kiến này:
                  </strong>
                  <SentimentBadge
                    sentiment={activeModalComment.sentiment}
                    label={activeModalComment.sentimentLabel}
                    confidence={activeModalComment.confidence}
                    isManuallyReviewed={activeModalComment.isManuallyReviewed}
                    compact
                  />
                </div>

                <p className="sentiment-review-hint">
                  Kết quả do mô hình tự động tạo, cần đối chiếu nội dung gốc trước khi kết luận.
                  Nhãn “Chưa chắc chắn” nghĩa là hệ thống chưa đủ căn cứ, khác hẳn “Trung tính”.
                </p>

                {activeModalComment.isManuallyReviewed && (
                  <p className="sentiment-review-saved">
                    <Check size={14} aria-hidden="true" />
                    <span>
                      Đã được hiệu chỉnh thủ công.
                      {activeModalComment.confidence !== null && (
                        <> Độ tin cậy hiển thị phía trên là của dự đoán mô hình, không thuộc nhãn người đặt.</>
                      )}
                    </span>
                  </p>
                )}

                {canReview && activeModalComment.sentiment ? (
                  <div className="sentiment-review-actions">
                    {reviewNotice && <p className="sentiment-review-notice">{reviewNotice}</p>}
                    {reviewError && (
                      <p className="sentiment-review-error" role="alert">
                        <AlertTriangle size={14} aria-hidden="true" />
                        <span>{reviewError}</span>
                      </p>
                    )}

                    {reviewConfirming !== null ? (
                      <div className="sentiment-review-confirm" role="alertdialog">
                        <span>
                          {reviewConfirming === ''
                            ? 'Xác nhận bỏ hiệu chỉnh và quay về nhãn của mô hình?'
                            : `Xác nhận đặt nhãn “${
                                SENTIMENT_OPTIONS.find((option) => option.value === reviewConfirming)
                                  ?.label ?? ''
                              }” cho ý kiến này? Nhãn do người đặt sẽ được ưu tiên khi thống kê.`}
                        </span>
                        <div className="sentiment-review-buttons">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={reviewSaving}
                            onClick={() => void submitReview(reviewConfirming)}
                          >
                            {reviewSaving ? (
                              <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                            ) : (
                              <Save size={14} aria-hidden="true" />
                            )}
                            <span>Xác nhận lưu</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={reviewSaving}
                            onClick={() => setReviewConfirming(null)}
                          >
                            Huỷ
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div
                          className="sentiment-review-options"
                          role="radiogroup"
                          aria-label="Chọn nhãn đúng cho ý kiến"
                        >
                          {SENTIMENT_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`sentiment-review-option${
                                reviewDraft === option.value ? ' is-selected' : ''
                              }`}
                            >
                              <input
                                type="radio"
                                name={`sentiment-review-${activeModalComment.responseId}`}
                                value={option.value}
                                checked={reviewDraft === option.value}
                                onChange={() => {
                                  setReviewDraft(option.value);
                                  setReviewNotice(null);
                                }}
                              />
                              <span>{option.label}</span>
                            </label>
                          ))}
                        </div>
                        <div className="sentiment-review-buttons">
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={reviewDraft === '' || reviewSaving}
                            onClick={() => setReviewConfirming(reviewDraft)}
                          >
                            <Save size={14} aria-hidden="true" />
                            <span>Lưu nhãn hiệu chỉnh</span>
                          </button>
                          {activeModalComment.isManuallyReviewed && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={reviewSaving}
                              onClick={() => setReviewConfirming('')}
                            >
                              <Undo2 size={14} aria-hidden="true" />
                              <span>Bỏ hiệu chỉnh</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  !canReview && (
                    <p className="sentiment-review-hint">
                      Chỉ tài khoản được cấp quyền hiệu chỉnh cảm xúc mới sửa được nhãn này.
                    </p>
                  )
                )}
              </div>

              {/* Toàn bộ câu trả lời trong phiếu khảo sát */}
              <div>
                <strong
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '13px',
                    color: '#1e293b',
                  }}
                >
                  Toàn bộ câu trả lời trong phiếu:
                </strong>
                {detailLoading ? (
                  <div className="operations-empty" style={{ padding: '24px' }}>
                    <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                    <span>Đang tải các câu trả lời trong phiếu...</span>
                  </div>
                ) : responseDetail?.answers && responseDetail.answers.length > 0 ? (
                  <div
                    className="admin-import-table-scroll response-detail-table"
                    style={{ maxHeight: '320px', overflowY: 'auto' }}
                  >
                    <table style={{ width: '100%', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '36px', textAlign: 'center' }}>#</th>
                          <th style={{ textAlign: 'left' }}>Câu hỏi khảo sát</th>
                          <th style={{ width: '140px', textAlign: 'center' }}>Thang đánh giá</th>
                          <th style={{ width: '160px', textAlign: 'left' }}>Trả lời / Điểm số</th>
                        </tr>
                      </thead>
                      <tbody>
                        {responseDetail.answers.map((ans, idx) => {
                          const scale = responseDetail.answerScales?.find(
                            (s) => s.answerScaleId === ans.answerScaleId
                          );
                          return (
                            <tr key={ans.questionId}>
                              <td style={{ textAlign: 'center', color: '#68737d' }}>{idx + 1}</td>
                              <td className="response-detail-question" style={{ fontWeight: 500 }}>
                                {ans.questionText}
                              </td>
                              <td style={{ textAlign: 'center', color: '#68737d', fontSize: '12px' }}>
                                {scale?.answerScaleName || '—'}
                              </td>
                              <td>
                                {ans.scaleKind === 'Text' ? (
                                  <span style={{ fontStyle: 'italic', color: '#334155' }}>
                                    {ans.answerValue || 'Không trả lời.'}
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {ans.selectedText || '—'}
                                    {ans.selectedValue !== null && ans.selectedValue !== undefined && (
                                      <small style={{ color: '#0284c7', marginLeft: '4px' }}>
                                        ({ans.selectedValue})
                                      </small>
                                    )}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: '#68737d', fontStyle: 'italic', fontSize: '13px', padding: '12px 0' }}>
                    Phiếu không có bản ghi chi tiết từng câu hỏi.
                  </div>
                )}
              </div>

              {/* Nút đóng chân trang */}
              <div
                className="modal-footer catalog-form-actions"
                style={{
                  marginTop: '8px',
                  paddingTop: '12px',
                  borderTop: '1px solid #dfe4e8',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setActiveModalComment(null);
                    setResponseDetail(null);
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </Modal>,
          document.body
        )}
    </div>
  );
};
