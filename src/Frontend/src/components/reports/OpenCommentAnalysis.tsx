import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  LoaderCircle,
  X,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { Modal } from '../Modal';
import { reportApi } from '../../services/reportApi';
import { surveyApi } from '../../services/surveyApi';
import type {
  Department,
  Faculty,
  Lecturer,
  OpenCommentAnalysisReport,
  OpenCommentItem,
  SurveyResponseDetail,
} from '../../types';
import { foldVietnamese } from '../../utils/vietnamese';
import { formatDecimal } from '../../utils/formatNumber';

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

  // Tải dữ liệu ý kiến mở từ backend
  useEffect(() => {
    let isCancelled = false;
    const loadComments = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await reportApi.openComments({
          semesterId,
          semesterSurveyId,
        });
        if (!isCancelled) {
          setReport(data);
        }
      } catch {
        if (!isCancelled) {
          setError('Không tải được danh sách ý kiến mở. Vui lòng thử lại sau.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void loadComments();
    return () => {
      isCancelled = true;
    };
  }, [semesterId, semesterSurveyId]);

  // Mở chi tiết phiếu khảo sát và nạp toàn bộ câu trả lời
  const handleOpenDetail = async (item: OpenCommentItem) => {
    setActiveModalComment(item);
    setDetailLoading(true);
    setResponseDetail(null);
    try {
      const data = await surveyApi.surveyResponse(item.responseId);
      setResponseDetail(data);
    } catch {
      // Nếu API trả lời thất bại thì modal vẫn hiển thị thông tin ý kiến
    } finally {
      setDetailLoading(false);
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
        width: '120px',
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
        width: '145px',
        sortValue: (item) => item.facultyName,
        filterValue: (item) => item.facultyName,
        render: (item) => <span className="operations-primary-text">{item.facultyName}</span>,
      },
      {
        key: 'departmentName',
        header: 'Bộ môn',
        width: '135px',
        sortValue: (item) => item.departmentName,
        filterValue: (item) => item.departmentName,
        render: (item) => <span>{item.departmentName}</span>,
      },
      {
        key: 'courseName',
        header: 'Lớp học phần',
        width: '190px',
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
                {item.courseName}
              </strong>
              <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '2px', fontWeight: 500 }}>
                <span>{item.courseCode}</span>
                {' · '}
                <span>Lớp {item.sectionName}</span>
              </div>
            </button>
          ) : (
            <div>
              <strong className="operations-primary-text" style={{ display: 'block', lineHeight: 1.35 }}>
                {item.courseName}
              </strong>
              <div style={{ fontSize: '12px', color: '#68737d', marginTop: '2px' }}>
                <span className="operations-code">{item.courseCode}</span>
                {' · '}
                <span>Lớp {item.sectionName}</span>
              </div>
            </div>
          )
        ),
      },
      {
        key: 'lecturerName',
        header: 'Giảng viên',
        width: '140px',
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
        width: '135px',
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
        key: 'isValid',
        header: 'Trạng thái',
        width: '85px',
        align: 'center',
        sortValue: (item) => (item.isValid ? 1 : 0),
        filterValue: (item) => (item.isValid ? 'Hợp lệ' : 'Bị lọc'),
        render: (item) => (
          <span className={`response-validity${item.isValid ? '' : ' is-rejected'}`}>
            {item.isValid ? 'Hợp lệ' : 'Bị lọc'}
          </span>
        ),
      },
      {
        key: 'additionalComments',
        header: 'Nội dung ý kiến đóng góp',
        render: (item) => (
          <div
            style={{ padding: '3px 0' }}
            title="Bấm vào dòng để xem chi tiết phiếu khảo sát"
          >
            <div
              className="response-comment"
              style={{
                lineHeight: 1.5,
                color: '#1a1f24',
                fontSize: '13px',
                maxHeight: '48px',
                WebkitLineClamp: 2,
                fontStyle: 'normal',
              }}
            >
              "{item.additionalComments}"
            </div>
            {item.additionalComments.length > 90 && (
              <span style={{ fontSize: '11px', color: '#0788b8', fontWeight: 500, display: 'inline-block', marginTop: '2px' }}>
                Xem chi tiết phiếu...
              </span>
            )}
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
      subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
      info: {
        'Học kỳ': semesterLabel,
        'Đợt khảo sát': surveyName || 'Tất cả các đợt',
        'Tổng số ý kiến thu thập': report?.totalComments ?? 0,
        'Tỷ lệ phiếu có ý kiến': `${report?.commentRate ?? 0}%`,
        'Số lớp học phần có ý kiến': report?.sectionCountWithComments ?? 0,
        'Số giảng viên nhận ý kiến': report?.lecturerCountWithComments ?? 0,
      },
      summaryNotes: [
        'Dữ liệu bao gồm các ý kiến mở do sinh viên phản hồi trong bài khảo sát học phần.',
        'Hệ thống bảo đảm hoàn toàn tính ẩn danh: không lưu thông tin người gửi.',
      ],
      columns: [
        { key: 'submittedAt', header: 'Thời gian gửi', width: 18, format: (val: unknown) => formatDateTime(String(val)) },
        { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
        { key: 'departmentName', header: 'Bộ môn', width: 22 },
        { key: 'courseCode', header: 'Mã học phần', width: 14, align: 'center' as const },
        { key: 'courseName', header: 'Tên học phần', width: 28 },
        { key: 'sectionName', header: 'Lớp học phần', width: 14, align: 'center' as const },
        { key: 'lecturerName', header: 'Giảng viên', width: 24 },
        { key: 'score', header: 'Điểm của phiếu khảo sát', width: 18, type: 'number' as const, align: 'right' as const, format: (val: unknown) => Number(Number(val || 0).toFixed(3)) },
        { key: 'isValid', header: 'Tính hợp lệ', width: 14, align: 'center' as const, format: (val: unknown) => (val ? 'Hợp lệ' : 'Bị bộ lọc loại') },
        { key: 'additionalComments', header: 'Nội dung ý kiến đóng góp', width: 45 },
      ],
    }),
    [semesterLabel, surveyName, report]
  );

  return (
    <div className="reports-comments-workspace" role="tabpanel" aria-label="Phân tích ý kiến mở">
      {/* 1. Dải số liệu KPI đặt lên trên cùng */}
      <div className="reports-kpi-band" aria-label="Tổng quan số liệu ý kiến mở">
        <span className="reports-kpi-item" title="Tổng số ý kiến nhận xét mở do sinh viên nhập">
          Tổng số ý kiến mở
          <strong>{loading ? '...' : (report?.totalComments ?? 0).toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Tỷ lệ phiếu có ý kiến trên tổng số lượt nộp">
          Tỷ lệ phiếu có ý kiến
          <strong>
            {loading ? '...' : (report && report.totalComments > 0 && report.commentRate === 0 ? '< 0,1%' : `${report?.commentRate ?? 0}%`)}
          </strong>
        </span>
        <span className="reports-kpi-item" title="Số lớp học phần nhận được ý kiến phản hồi mở">
          Lớp học phần có ý kiến
          <strong>{loading ? '...' : (report?.sectionCountWithComments ?? 0).toLocaleString('vi-VN')}</strong>
        </span>
        <span className="reports-kpi-item" title="Số giảng viên nhận được ý kiến phản hồi mở">
          Giảng viên nhận ý kiến
          <strong>{loading ? '...' : (report?.lecturerCountWithComments ?? 0).toLocaleString('vi-VN')}</strong>
        </span>
      </div>

      {/* 2. Danh sách dữ liệu & DataTable (có sẵn tìm kiếm, sắp xếp và lọc cột) */}
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

      {/* 3. Modal xem toàn văn ý kiến & chi tiết phiếu khảo sát */}
      {activeModalComment &&
        createPortal(
          <Modal
            isOpen={true}
            onClose={() => {
              setActiveModalComment(null);
              setResponseDetail(null);
            }}
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
