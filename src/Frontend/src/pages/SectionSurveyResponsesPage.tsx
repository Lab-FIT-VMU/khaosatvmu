import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CircleAlert,
  Eraser,
  Eye,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import { QuestionAnalysisChart } from '../components/QuestionAnalysisChart';
import { useAuth } from '../auth/authContext';
import { isUnrestrictedRole } from '../auth/roles';
import { ApiError } from '../services/apiClient';
import { reportApi } from '../services/reportApi';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import { rejectionReasonTexts } from '../types';
import type {
  CourseSectionSurvey,
  SectionSurveyAnalysis,
  SurveyResponseDetail,
  SurveyResponseSummary,
} from '../types';
import '../styles/survey-operations.css';
import '../styles/reports.css';
import { foldVietnamese, toVietnameseFileSlug } from '../utils/vietnamese';
import { hasEnoughResponsesToScore } from '../utils/reportThresholds';
import type { QuestionAnalysisExportMetadata } from '../services/exportQuestionAnalysisService';

interface SectionSurveyResponsesPageProps {
  courseSectionSurveyId: number;
  onBack: () => void;
  /** Nhãn nút quay lại, mặc định dành cho màn quản lý khảo sát. */
  backLabel?: string;
  /** Bật phân tích từng câu hỏi của bài khảo sát (dùng trong Thống kê & Báo cáo). */
  showAnalysis?: boolean;
}

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const formatDateTime = (value: string) => dateTimeFormatter.format(new Date(value));

const dateFormatter = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' });

const formatDate = (value: string) => dateFormatter.format(new Date(value));

const countOfValue = (item: SurveyResponseSummary, value: number) =>
  item.valueCounts.find((entry) => entry.value === value)?.count ?? 0;

export const SectionSurveyResponsesPage: React.FC<SectionSurveyResponsesPageProps> = ({
  courseSectionSurveyId,
  onBack,
  backLabel = 'Quay lại danh sách lớp',
  showAnalysis = false,
}) => {
  const [sectionSurvey, setSectionSurvey] = useState<CourseSectionSurvey | null>(null);
  const [responses, setResponses] = useState<SurveyResponseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [analysis, setAnalysis] = useState<SectionSurveyAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(showAnalysis);

  const [detail, setDetail] = useState<SurveyResponseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Huỷ toàn bộ phiếu của lớp để yêu cầu lớp làm lại.
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { activeProfile } = useAuth();
  // Cùng mức quyền với tạo/xoá đợt: đây là thao tác bỏ dữ liệu đã thu của cả lớp.
  const canClearResponses = isUnrestrictedRole(activeProfile?.roleCode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [survey, nextResponses] = await Promise.all([
        surveyApi.courseSectionSurvey(courseSectionSurveyId),
        surveyApi.surveyResponses(courseSectionSurveyId),
      ]);
      setSectionSurvey(survey);
      setResponses(nextResponses);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [courseSectionSurveyId]);

  const handleClearResponses = async () => {
    setClearing(true);
    try {
      const result = await surveyApi.clearSectionSurveyResponses(courseSectionSurveyId);
      setIsClearOpen(false);
      // Nạp lại cả danh sách phiếu lẫn phần phân tích: cả hai vừa bị dọn sạch.
      await load();
      if (showAnalysis) {
        try {
          setAnalysis(await reportApi.sectionAnalysis(courseSectionSurveyId));
        } catch {
          setAnalysis(null);
        }
      }
      toast.success('Đã huỷ toàn bộ phiếu của lớp', {
        description:
          `${result.clearedResponseCount} phiếu · đã xoá điểm tổng hợp và `
          + `${result.clearedQuestionScoreCount} dòng điểm từng câu. `
          + 'Đường dẫn và mã QR giữ nguyên, lớp làm lại được ngay.',
      });
    } catch (error) {
      toast.error('Không huỷ được phiếu của lớp', { description: messageFrom(error) });
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (!showAnalysis) return;
    let cancelled = false;
    setAnalysisLoading(true);
    reportApi
      .sectionAnalysis(courseSectionSurveyId)
      .then((data) => {
        if (!cancelled) setAnalysis(data);
      })
      .catch(() => {
        // Phân tích là phần phụ; không làm hỏng danh sách phiếu.
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseSectionSurveyId, showAnalysis]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (responseId: number) => {
    setDetailLoading(true);
    try {
      setDetail(await surveyApi.surveyResponse(responseId));
    } catch (error) {
      toast.error('Không mở được phiếu trả lời', { description: messageFrom(error) });
    } finally {
      setDetailLoading(false);
    }
  };

  // Các mức của thang trả lời lấy từ chính phiếu đầu tiên, đủ cả mức không ai chọn.
  const scaleValues = responses[0]?.valueCounts ?? [];

  const validResponses = responses.filter((response) => response.isValid);

  /*
    Điểm của lớp lấy đúng con số đã chốt ở lần bấm "Tính lại điểm", không tự cộng
    lại từ danh sách phiếu bên dưới. Lớp chưa đủ điều kiện thì Bảng dữ liệu khảo sát
    đang để trống ô điểm, ở đây cũng phải để trống theo. Phần phân tích chỉ tải khi
    bật `showAnalysis`, nên màn quản lý khảo sát vẫn dùng cách cộng tại chỗ.
  */
  const snapshotAverageScore = analysis?.isScored ? analysis.averageScore : null;
  const liveAverageScore =
    validResponses.length === 0
      ? 0
      : validResponses.reduce((total, response) => total + response.score, 0) /
        validResponses.length;
  const displayAverageScore = showAnalysis ? snapshotAverageScore : liveAverageScore;

  const invalidCount = responses.filter((response) => !response.isValid).length;

  // Ý kiến của phiếu bị lọc không dùng được vào kết quả nào nên không đếm.
  const commentedCount = validResponses.filter((response) => response.additionalComments).length;

  const normalized = foldVietnamese(search);
  const filtered = responses.filter(
    (response) =>
      !normalized ||
      String(response.responseId).includes(normalized) ||
      (response.additionalComments ?? '').toLowerCase().includes(normalized)
  );

  // Mọi cột đều có menu lọc trên tiêu đề, thay cho ô lọc riêng phía trên bảng.
  const columns: Column<SurveyResponseSummary>[] = [
    {
      key: 'responseId',
      header: 'Mã phiếu',
      width: '86px',
      sortValue: (item) => item.responseId,
      filterValue: (item) => `#${item.responseId}`,
      render: (item) => <span className="catalog-code">#{item.responseId}</span>,
    },
    {
      key: 'submittedAt',
      header: 'Thời gian nộp',
      width: '132px',
      sortValue: (item) => item.submittedAt,
      // Lọc theo ngày: lọc tới từng phút thì mỗi phiếu một giá trị, gom được gì.
      filterValue: (item) => formatDate(item.submittedAt),
      render: (item) => (
        <span className="catalog-cell-primary">{formatDateTime(item.submittedAt)}</span>
      ),
    },
    {
      key: 'score',
      header: 'Điểm',
      width: '72px',
      numeric: true,
      sortValue: (item) => item.score,
      filterValue: (item) => item.score.toFixed(2),
      render: (item) => <span className="response-score">{item.score.toFixed(2)}</span>,
    },
    {
      key: 'isValid',
      header: 'Trạng thái',
      width: '136px',
      filterValue: (item) => (item.isValid ? 'Hợp lệ' : 'Không hợp lệ'),
      render: (item) =>
        item.isValid ? (
          <span className="response-validity">Hợp lệ</span>
        ) : (
          <span className="response-validity is-rejected">
            <TriangleAlert aria-hidden="true" size={13} />
            Không hợp lệ
          </span>
        ),
    },
    {
      key: 'rejectionReasons',
      header: 'Mô tả',
      width: '220px',
      // Dịch mã sang tiếng Việt, không phơi TOO_FAST ra màn hình.
      filterValue: (item) => rejectionReasonTexts(item.rejectionReasons).join(' · ') || '—',
      render: (item) => {
        const reasons = rejectionReasonTexts(item.rejectionReasons);
        if (reasons.length === 0) return <span className="response-comment is-empty">—</span>;
        // Gộp một dòng, đủ lý do nằm trong tooltip — bảng này rất dài.
        return (
          <span className="response-reasons" title={reasons.join(' · ')}>
            {reasons.join(' · ')}
          </span>
        );
      },
    },
    ...scaleValues.map((option) => ({
      key: `value-${option.value}`,
      header: `Mức ${option.value}`,
      width: '72px',
      numeric: true,
      sortValue: (item: SurveyResponseSummary) => countOfValue(item, option.value),
      filterValue: (item: SurveyResponseSummary) => String(countOfValue(item, option.value)),
      render: (item: SurveyResponseSummary) => {
        const count = countOfValue(item, option.value);
        return (
          <span className={count > 0 ? 'response-count' : 'response-count is-zero'}>{count}</span>
        );
      },
    })),
    {
      key: 'additionalComments',
      header: 'Ý kiến khác',
      filterValue: (item) => (item.additionalComments ? 'Có ý kiến' : 'Không có'),
      render: (item) =>
        item.additionalComments ? (
          <span className="response-comment" title={item.additionalComments}>
            {item.additionalComments}
          </span>
        ) : (
          <span className="response-comment is-empty">Không có</span>
        ),
    },
    {
      key: 'actions',
      header: 'Chi tiết',
      width: '92px',
      render: (item) => (
        <button
          type="button"
          className="btn btn-secondary btn-sm response-row-action"
          onClick={() => void openDetail(item.responseId)}
          disabled={detailLoading}
        >
          <Eye className="operation-icon" aria-hidden="true" />
          Xem
        </button>
      ),
    },
  ];

  const surveyExportMetadata = useMemo<QuestionAnalysisExportMetadata>(() => ({
    title: `BÁO CÁO PHÂN TÍCH KẾT QUẢ CÂU HỎI KHẢO SÁT · LỚP ${sectionSurvey?.sectionName || ''}`.trim(),
    subtitle: sectionSurvey
      ? `${sectionSurvey.courseCode} - ${sectionSurvey.courseName} · GV: ${sectionSurvey.lecturerName || 'Chưa gắn GV'}`
      : undefined,
    fileName: `bao-cao-cau-hoi-lop-${toVietnameseFileSlug(sectionSurvey?.sectionName || String(courseSectionSurveyId))}`,
    info: {
      'Học phần': sectionSurvey ? `${sectionSurvey.courseCode} - ${sectionSurvey.courseName}` : undefined,
      'Lớp học phần': sectionSurvey?.sectionName,
      'Giảng viên': sectionSurvey?.lecturerName || 'Chưa gắn GV',
      'Đơn vị': sectionSurvey ? `${sectionSurvey.departmentName || ''} · ${sectionSurvey.facultyName || ''}` : undefined,
      'Sĩ số': sectionSurvey?.classSize,
      'Phiếu hợp lệ': analysis?.responseCount ?? sectionSurvey?.validResponseCount,
      'Điểm trung bình': analysis?.averageScore ? `${analysis.averageScore.toFixed(2)} / 5.0` : undefined,
    },
  }), [sectionSurvey, analysis, courseSectionSurveyId]);

  return (
    <div className="survey-operations-page section-responses-page">
      {loadError && (
        <div className="operations-feedback operations-feedback--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {sectionSurvey && (
        <section className="section-responses-summary" aria-label="Thông tin bài khảo sát">
          {/* Nút quay lại nằm cùng hàng với tên lớp, đỡ một băng riêng phía trên. */}
          <div className="section-responses-heading">
            <button
              type="button"
              className="btn btn-secondary btn-sm section-responses-back"
              onClick={onBack}
              title={backLabel}
            >
              <ArrowLeft className="operation-icon" aria-hidden="true" />
            </button>
            <h2>
              {sectionSurvey.courseCode} - {sectionSurvey.courseName}
            </h2>
            <p>
              Lớp <strong>{sectionSurvey.sectionName}</strong> · GV:{' '}
              {sectionSurvey.lecturerName || 'Chưa phân công'} · Sĩ số {sectionSurvey.classSize}
            </p>
          </div>
          {/* Chỉ giữ icon ở ô cảnh báo, chỗ nó thực sự nói thêm được điều gì. */}
          <div className="section-responses-stats">
            <span>{responses.length} phiếu đã thu</span>
            <span>{validResponses.length} phiếu hợp lệ</span>
            <span>
              Điểm trung bình{' '}
              {displayAverageScore !== null ? displayAverageScore.toFixed(2) : '—'}
            </span>
            <span>{commentedCount} phiếu hợp lệ có ý kiến</span>
            <span className={invalidCount > 0 ? 'section-responses-stat--warning' : undefined}>
              {invalidCount > 0 && (
                <TriangleAlert className="operation-icon" aria-hidden="true" />
              )}
              {invalidCount} phiếu bị lọc nhiễu
            </span>
            <span>
              {formatDateTime(sectionSurvey.startTime)} → {formatDateTime(sectionSurvey.endTime)}
            </span>
            {/* Dùng khi số liệu của lớp không tin được — vd cả lớp nộp nhưng bộ lọc
                nhiễu loại sạch — và cần yêu cầu lớp làm lại. */}
            {canClearResponses && responses.length > 0 && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => setIsClearOpen(true)}
                disabled={clearing}
              >
                {clearing ? (
                  <>
                    <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
                    Đang huỷ...
                  </>
                ) : (
                  <>
                    <Eraser className="operation-icon" aria-hidden="true" />
                    Huỷ phiếu, cho làm lại
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        isOpen={isClearOpen}
        onClose={() => setIsClearOpen(false)}
        onConfirm={() => void handleClearResponses()}
        title="Huỷ toàn bộ phiếu của lớp"
        recordName={
          sectionSurvey
            ? `${sectionSurvey.courseCode} - ${sectionSurvey.courseName} · Lớp ${sectionSurvey.sectionName}`
            : ''
        }
        confirmText="Huỷ phiếu"
        message={
          <>
            Huỷ toàn bộ <strong>{responses.length} phiếu</strong> đã thu của lớp{' '}
            <strong>
              {sectionSurvey?.courseCode} - {sectionSurvey?.courseName} · Lớp{' '}
              {sectionSurvey?.sectionName}
            </strong>{' '}
            để yêu cầu lớp làm lại?
          </>
        }
        warning={
          'Điểm trung bình của lớp và điểm từng câu C1, C2… sẽ bị xoá khỏi hệ thống, '
          + 'các số liệu tổng hợp của bộ môn, khoa và toàn trường cũng đổi theo. '
          + 'Phiếu được xoá mềm nên vẫn lần lại được. Đường dẫn và mã QR giữ nguyên — '
          + 'lớp làm lại được ngay, nhưng phải báo cho lớp bằng kênh ngoài hệ thống.'
        }
      />

      {showAnalysis && analysisLoading && (
        <div className="operations-empty section-analysis-loading" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang phân tích kết quả theo câu hỏi...</strong>
        </div>
      )}

      {/*
        Lớp chưa qua hai vòng lọc thì không có điểm để phân tích. Nói thẳng lý do,
        không tự tính lấy một con số riêng — Bảng dữ liệu khảo sát đang để trống ô
        điểm của chính lớp này thì ở đây cũng không được hiện ra con số nào.
      */}
      {showAnalysis && !analysisLoading && analysis && !analysis.isScored && (
        <div className="operations-empty" role="status">
          <BarChart3 className="operation-icon" aria-hidden="true" />
          {hasEnoughResponsesToScore(sectionSurvey?.classSize || 0, responses.length, validResponses.length) ? (
            <>
              <strong>Lớp đã thu đủ phiếu (Đang chờ chốt điểm)</strong>
              <span>
                Lớp đã đạt đủ số lượng phiếu theo quy định. Vui lòng bấm &quot;Cập nhật điểm&quot; ở
                các trang thống kê để tạo báo cáo phân tích theo câu hỏi.
              </span>
            </>
          ) : (
            <>
              <strong>Lớp chưa đủ điều kiện tính điểm</strong>
              <span>
                Lớp phải qua cả ngưỡng tỷ lệ phản hồi và ngưỡng tỷ lệ phiếu hợp lệ, sau đó
                được chốt bằng nút &quot;Cập nhật điểm&quot; ở các trang thống kê thì mới có
                số liệu phân tích.
              </span>
            </>
          )}
        </div>
      )}

      {showAnalysis && !analysisLoading && analysis && analysis.isScored && (
        <QuestionAnalysisChart
          questions={analysis.questions}
          overallAverageScore={analysis.averageScore}
          responseCount={analysis.responseCount}
          title="Phân tích kết quả theo câu hỏi"
          showDistributionTable={true}
          exportMetadata={surveyExportMetadata}
        />
      )}

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm theo mã phiếu hoặc ý kiến..."
        exportConfig={{
          title: `BÁO CÁO KẾT QUẢ KHẢO SÁT LỚP ${sectionSurvey?.sectionName || ''}`.trim(),
          fileName: `ket-qua-khao-sat-lop-${sectionSurvey?.sectionName || 'hoc-phan'}-${
            sectionSurvey?.courseCode || ''
          }`,
          subtitle: `${sectionSurvey?.courseCode || ''} - ${sectionSurvey?.courseName || ''}`,
          subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
          info: {
            'Học phần': `${sectionSurvey?.courseCode || ''} - ${sectionSurvey?.courseName || ''}`,
            'Lớp học phần': sectionSurvey?.sectionName,
            'Giảng viên': sectionSurvey?.lecturerName || 'Chưa phân công',
            'Sĩ số sinh viên': sectionSurvey?.classSize,
            'Tổng số phiếu thu': responses.length,
            'Số phiếu hợp lệ': validResponses.length,
            'Điểm trung bình': displayAverageScore !== null && displayAverageScore > 0
              ? displayAverageScore.toFixed(2)
              : '—',
          },
          summaryNotes: [
            'Điểm trung bình chỉ tính trên các phiếu đánh giá hợp lệ qua bộ lọc.',
            'Ý kiến đóng góp của sinh viên được ghi nhận trung thực phục vụ nâng cao chất lượng giảng dạy.',
          ],
          columns: [
            { key: 'responseId', header: 'Mã phiếu', width: 12, align: 'center' as const },
            { key: 'submittedAt', header: 'Thời gian nộp', width: 18, format: (val: any) => formatDateTime(val) },
            { key: 'score', header: 'Điểm', width: 10, type: 'number' as const, align: 'right' as const, format: (val: any) => Number(val).toFixed(2) },
            { key: 'isValid', header: 'Trạng thái', width: 12, align: 'center' as const, format: (val: any) => (val ? 'Hợp lệ' : 'Không hợp lệ') },
            { key: 'rejectionReasons', header: 'Mô tả', width: 20, format: (_: any, item: any) => rejectionReasonTexts(item.rejectionReasons).join('; ') || '—' },
            { key: 'additionalComments', header: 'Ý kiến đóng góp', width: 35, format: (val: any) => val || '—' },
          ],
        }}
        emptyMessage={loading ? 'Đang tải phiếu trả lời...' : 'Lớp này chưa có phiếu trả lời nào.'}
        keyExtractor={(item) => String(item.responseId)}
        showIndex={false}
        pageSize={20}
      />

      <Modal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `Phiếu trả lời #${detail.responseId} (chỉ xem)` : ''}
      >
        {detail && (
          <div className="response-detail">
            <div className="response-detail-meta">
              <span>
                <strong>{detail.templateName}</strong>
              </span>
              <span>
                {detail.courseCode} - {detail.courseName} · Lớp {detail.sectionName} · GV:{' '}
                {detail.lecturerName || 'Chưa phân công'}
              </span>
              <span>
                Nộp lúc {formatDateTime(detail.submittedAt)} · Điểm trung bình{' '}
                <strong>{detail.score.toFixed(2)}</strong>
              </span>
            </div>

            {/* Mỗi câu có thang riêng nên liệt kê từng câu kèm đáp án thay vì
                dựng một bảng ma trận dùng chung các cột. */}
            <div className="admin-import-table-scroll response-detail-table">
              <table>
                <thead>
                  <tr>
                    <th>Câu hỏi</th>
                    <th>Thang trả lời</th>
                    <th>Trả lời</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.answers.map((answer, index) => {
                    const scale = detail.answerScales.find(
                      (item) => item.answerScaleId === answer.answerScaleId
                    );

                    return (
                      <tr key={answer.questionId}>
                        <td className="response-detail-question">
                          {index + 1}. {answer.questionText}
                        </td>
                        <td>{scale?.answerScaleName ?? '—'}</td>
                        <td>
                          {answer.scaleKind === 'Text' ? (
                            <span className="response-comment">
                              {answer.answerValue || 'Không trả lời.'}
                            </span>
                          ) : (
                            <span>
                              {answer.selectedText || '—'}
                              {answer.selectedValue !== null && (
                                <small> ({answer.selectedValue})</small>
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

            <div className="response-detail-comment">
              <strong>Ý kiến khác của sinh viên</strong>
              <p>{detail.additionalComments || 'Không có ý kiến.'}</p>
            </div>
          </div>
        )}

        <div className="modal-footer catalog-form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>
            Đóng
          </button>
        </div>
      </Modal>

      {detailLoading && (
        <div className="operations-feedback" role="status">
          <LoaderCircle className="auth-spin" aria-hidden="true" />
          <span>Đang mở phiếu trả lời...</span>
        </div>
      )}
    </div>
  );
};
