import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CircleAlert, Info, LoaderCircle } from 'lucide-react';
import { reportApi } from '../../services/reportApi';
import type {
  QuestionRating,
  SchoolSurveyOverview as SchoolSurveyOverviewData,
} from '../../types';
import { ExportDropdown } from '../ExportDropdown';
import { NoteModalButton } from '../NoteModalButton';
import { FacultyScoreChart } from './FacultyScoreChart';
import { FacultyCompletionChart } from './FacultyCompletionChart';
import { WeakestQuestionsPanel } from './WeakestQuestionsPanel';
import { SchoolCriteriaChart } from './SchoolCriteriaChart';
import { formatNumber } from './theme';
import type { ReportAnalysisView } from '../../pages/reportRoute';
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../../utils/reportThresholds';

export interface SchoolOverviewDrillDown {
  facultyId?: number;
  departmentId?: number;
}

interface SchoolSurveyOverviewProps {
  semesterId: number;
  /** Chỉ phân tích một bài khảo sát của kỳ; bỏ trống là gộp cả kỳ. */
  semesterSurveyId?: number;
  analysisView: ReportAnalysisView;
  onAnalysisViewChange: (view: ReportAnalysisView) => void;
  onDrillDown?: (filter: SchoolOverviewDrillDown) => void;
}

/** Dưới ngưỡng này thì một đơn vị bị coi là chậm tiến độ thu phiếu. */
const laggingThreshold = 20;

/** Số tiêu chí mặc định của bảng xếp hạng câu hỏi. */
const defaultQuestionCount = 5;

/** Trần số tiêu chí, khớp với giới hạn phía API. */
const maxQuestionCount = 50;

/** Bảng tổng quan toàn trường — executive dashboard đặt đầu trang Thống kê & Báo cáo. */
export const SchoolSurveyOverview: React.FC<SchoolSurveyOverviewProps> = ({
  semesterId,
  semesterSurveyId,
  analysisView,
  onAnalysisViewChange,
  onDrillDown,
}) => {
  const [data, setData] = useState<SchoolSurveyOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bảng xếp hạng tiêu chí tự gọi API riêng: đổi số lượng hay đổi đầu bảng thì
  // chỉ nạp lại đúng khối đó, không dựng lại cả trang tổng quan.
  const [questionCount, setQuestionCount] = useState(defaultQuestionCount);
  const [questionInput, setQuestionInput] = useState(String(defaultQuestionCount));
  const [questionLowest, setQuestionLowest] = useState(true);
  const [rankedQuestions, setRankedQuestions] = useState<QuestionRating[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [criteriaQuestions, setCriteriaQuestions] = useState<QuestionRating[] | null>(null);
  const [criteriaLoading, setCriteriaLoading] = useState(false);

  const load = useCallback(async () => {
    if (!semesterId) return;
    setLoading(true);
    setError(null);
    try {
      const overview = await reportApi.schoolOverview(semesterId, undefined, semesterSurveyId);
      setData(overview);
    } catch {
      setError('Không thể tải bảng tổng quan kết quả khảo sát toàn trường.');
    } finally {
      setLoading(false);
    }
  }, [semesterId, semesterSurveyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Bộ tham số của danh sách đang hiển thị, để không gọi lại API cho đúng thứ đã có.
  const rankingKeyRef = useRef<string | null>(null);

  // Chỉ tải khi tab chất lượng đang mở, và bỏ luôn lần gọi thừa khi người dùng
  // còn đang gõ dở số lượng.
  useEffect(() => {
    if (analysisView !== 'quality' || !semesterId) return;

    const key = `${semesterId}|${semesterSurveyId ?? ''}|${questionCount}|${questionLowest ? 'low' : 'high'}`;

    // Mở lại tab không phải là lý do để gọi API: danh sách đang hiển thị vẫn đúng
    // bộ tham số này. Trước đây mỗi lần bấm vào tab là một lần gọi lại, bảng mờ đi
    // rồi sáng lại đúng bằng dữ liệu cũ.
    if (rankingKeyRef.current === key) return;

    // Mặc định của tab (5 tiêu chí điểm thấp nhất) trùng đúng phần bảng tổng quan
    // đã tải sẵn, nên dùng luôn dữ liệu đó thay vì đi một vòng API cho ra cùng kết quả.
    if (questionCount === defaultQuestionCount && questionLowest) {
      rankingKeyRef.current = key;
      setRankedQuestions(null);
      setQuestionsLoading(false);
      return;
    }

    let cancelled = false;
    setQuestionsLoading(true);
    reportApi
      .questionRanking({
        semesterId,
        semesterSurveyId,
        count: questionCount,
        lowest: questionLowest,
      })
      .then((questions) => {
        if (cancelled) return;
        rankingKeyRef.current = key;
        setRankedQuestions(questions);
      })
      .catch(() => {
        if (!cancelled) setRankedQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisView, semesterId, semesterSurveyId, questionCount, questionLowest]);

  const criteriaKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (analysisView !== 'criteria' || !semesterId) return;

    const key = `${semesterId}|${semesterSurveyId ?? ''}`;
    if (criteriaKeyRef.current === key && criteriaQuestions !== null) return;

    let cancelled = false;
    setCriteriaLoading(true);

    reportApi
      .questionRanking({
        semesterId,
        semesterSurveyId,
        count: maxQuestionCount,
        lowest: false,
      })
      .then((questions) => {
        if (cancelled) return;
        criteriaKeyRef.current = key;
        const sorted = [...(questions || [])].sort((a, b) => a.questionOrder - b.questionOrder);
        setCriteriaQuestions(sorted);
      })
      .catch(() => {
        if (!cancelled) setCriteriaQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setCriteriaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [analysisView, semesterId, semesterSurveyId, criteriaQuestions]);

  /** Ô số nhận mọi thao tác gõ, nhưng chỉ chốt lại khi giá trị nằm trong khoảng hợp lệ. */
  const changeQuestionCount = (value: string) => {
    setQuestionInput(value);
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= maxQuestionCount) {
      setQuestionCount(parsed);
    }
  };

  if (loading) {
    return (
      <section className="reports-exec reports-exec--loading" aria-label="Đang tải bảng tổng quan">
        <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
        <strong>Đang tổng hợp số liệu toàn trường...</strong>
      </section>
    );
  }

  if (error) {
    return (
      <section className="reports-exec reports-exec--error" role="alert">
        <CircleAlert className="operation-icon" aria-hidden="true" />
        <span>{error}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
          Thử lại
        </button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const hasData = data.totalSections > 0;
  const laggingDepartments = data.departments.filter(
    (department) => department.completionRate < laggingThreshold,
  );

  const exportOverviewPayload = {
    fileName: `bao-cao-tong-quan-khao-sat-toan-truong-${data.semesterName}-${data.academicYearName}`,
    metadata: {
      title: 'BÁO CÁO TỔNG QUAN KẾT QUẢ KHẢO SÁT TOÀN TRƯỜNG',
      subtitle: `${data.academicYearName} · ${data.semesterName}`,
      subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
      info: {
        'Năm học / Học kỳ': `${data.academicYearName} · ${data.semesterName}`,
        'Tổng số phiếu phải thu': `${formatNumber(data.totalTargetResponses)} phiếu`,
        'Số phiếu đã thu': `${formatNumber(data.totalSubmittedResponses)} lượt`,
        'Số phiếu hợp lệ': `${formatNumber(data.totalResponses)} phiếu`,
        'Tỷ lệ phản hồi': `${data.responseRate.toFixed(1)}%`,
        'Điểm trung bình': `${data.overallAverageScore.toFixed(3)} / 5.0`,
        'Lớp đủ điều kiện tính điểm':
          `${formatNumber(data.scoredSectionCount)} / ${formatNumber(data.totalSections)} lớp`,
        'Số phiếu hợp lệ dùng để tính điểm': formatNumber(data.scoredValidResponseCount),
        [`Lớp hoàn thành (≥${COMPLETED_COMPLETION_RATE}%)`]: data.completedSectionCount,
        [`Lớp đang thu (${LAGGING_COMPLETION_RATE}-${COMPLETED_COMPLETION_RATE - 1}%)`]: data.inProgressSectionCount,
      },
      summaryNotes: [
        'Điểm trung bình chỉ gộp phiếu hợp lệ của lớp qua được hai vòng lọc tính điểm.',
        'Lớp chưa đủ điều kiện vẫn được đếm vào tổng số lớp nhưng không góp vào điểm.',
      ],
    },
    sheets: [
      {
        sheetName: 'Tong quan Khoa - Vien',
        title: `1. TIẾN ĐỘ & ĐIỂM SỐ THEO KHOA / VIỆN (${data.faculties.length} ĐƠN VỊ)`,
        columns: [
          { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
          { key: 'sectionCount', header: 'Số lớp', width: 12, type: 'number' as const, align: 'right' as const },
          { key: 'totalResponses', header: 'Số phiếu hợp lệ', width: 14, type: 'number' as const, align: 'right' as const },
          { key: 'totalTargetResponses', header: 'Chỉ tiêu', width: 12, type: 'number' as const, align: 'right' as const },
          {
            key: 'completionRate',
            header: 'Tỷ lệ',
            width: 12,
            type: 'string' as const,
            align: 'right' as const,
            format: (val: any) => `${Number(val).toFixed(1)}%`,
          },
          {
            key: 'averageScore',
            header: 'Điểm TB',
            width: 12,
            type: 'number' as const,
            align: 'right' as const,
            format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(2) : '—'),
          },
        ],
        data: data.faculties,
      },
      {
        sheetName: 'Bo mon cham tien do',
        title: `2. DANH SÁCH BỘ MÔN CHẬM TIẾN ĐỘ THU PHIẾU (${laggingDepartments.length} BỘ MÔN)`,
        subtitle: `Các bộ môn có tỷ lệ thu phiếu dưới ${laggingThreshold}% chỉ tiêu`,
        columns: [
          { key: 'departmentName', header: 'Bộ môn', width: 24 },
          { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
          { key: 'sectionCount', header: 'Số lớp', width: 10, type: 'number' as const, align: 'right' as const },
          { key: 'totalResponses', header: 'Số phiếu đã thu', width: 12, type: 'number' as const, align: 'right' as const },
          { key: 'totalTargetResponses', header: 'Chỉ tiêu', width: 12, type: 'number' as const, align: 'right' as const },
          {
            key: 'completionRate',
            header: 'Tỷ lệ',
            width: 12,
            type: 'string' as const,
            align: 'right' as const,
            format: (val: any) => `${Number(val).toFixed(1)}%`,
          },
          {
            key: 'averageScore',
            header: 'Điểm TB',
            width: 12,
            type: 'number' as const,
            align: 'right' as const,
            format: (val: any) => (Number(val) > 0 ? Number(val).toFixed(2) : '—'),
          },
        ],
        data: laggingDepartments,
        summaryNotes: ['Đề nghị các Khoa chủ quản đôn đốc các bộ môn tăng cường hướng dẫn sinh viên làm khảo sát.'],
      },
      {
        sheetName: 'Tieu chi can cai thien',
        title: '3. DANH SÁCH CÁC TIÊU CHÍ CÂU HỎI CẦN CẢI THIỆN TOÀN TRƯỜNG',
        subtitle: 'Các câu hỏi khảo sát có điểm trung bình đánh giá thấp nhất trong kỳ',
        columns: [
          { key: 'order', header: 'Mã câu', width: 10, align: 'center' as const, format: (v: any) => `C${v}` },
          { key: 'content', header: 'Nội dung tiêu chí câu hỏi', width: 45 },
          { key: 'groupName', header: 'Nhóm tiêu chí', width: 24, format: (v: any) => v || 'Tiêu chuẩn chung' },
          {
            key: 'averageScore',
            header: 'Điểm TB',
            width: 12,
            type: 'number' as const,
            align: 'right' as const,
            format: (val: any) => Number(val).toFixed(2),
          },
          { key: 'responseCount', header: 'Số lượt đánh giá', width: 16, type: 'number' as const, align: 'right' as const },
        ],
        data: data.weakestQuestions || [],
      },
    ],
  };

  return (
    <section className="reports-exec" aria-label="Bảng tổng quan kết quả khảo sát toàn trường">
      <header className="reports-exec-header">
        <div className="reports-exec-heading">
          <div>
            <h2>Bảng tổng quan kết quả khảo sát toàn trường</h2>
          </div>
        </div>
        {hasData && (
          <div className="reports-exec-actions">
            <ExportDropdown options={exportOverviewPayload} size="sm" buttonLabel="Xuất báo cáo tổng quan" />
          </div>
        )}
      </header>

      {!hasData ? (
        <div className="reports-exec-empty">
          <AlertTriangle className="operation-icon" aria-hidden="true" />
          <strong>Chưa có dữ liệu cho học kỳ này</strong>
          <span>Hệ thống chưa phát đợt khảo sát nào hoặc chưa có phiếu trả lời.</span>
        </div>
      ) : (
        <>
          {/*
            Lưới thẻ KPI tổng quan: phân cấp rõ ràng giữa 2 nhóm chỉ số:
            1. Tiến độ thu thập phiếu (Quy mô khảo sát)
            2. Kết quả đánh giá & Lọc tính điểm
          */}
          <div className="reports-overview-sections">
            <div className="reports-overview-group">
              <div className="reports-overview-group-header">
                <span className="reports-overview-group-title">Tiến độ thu thập phiếu</span>
              </div>
              <div className="reports-overview-kpis" role="region" aria-label="Tiến độ thu thập phiếu">
                <div
                  className="reports-overview-kpi-card"
                  title="Tổng số sinh viên thuộc diện khảo sát theo danh sách lớp"
                >
                  <span className="reports-overview-kpi-label">Tổng số phiếu phải thu</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(data.totalTargetResponses)}</strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Chỉ tiêu sinh viên cần khảo sát</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Tổng số lượt sinh viên đã hoàn thành và gửi phiếu khảo sát"
                >
                  <span className="reports-overview-kpi-label">Số phiếu đã thu</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(data.totalSubmittedResponses)}</strong>
                    <span className="reports-overview-kpi-unit">lượt</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Tổng số lượt phiếu đã nộp</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Số phiếu hợp lệ sau khi loại bỏ phiếu trả lời ẩu, làm quá nhanh hoặc chọn đồng loạt"
                >
                  <span className="reports-overview-kpi-label">Số phiếu hợp lệ</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(data.totalResponses)}</strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                    {data.totalSubmittedResponses > 0 && (
                      <span className="reports-overview-kpi-badge">
                        {((data.totalResponses / data.totalSubmittedResponses) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="reports-overview-kpi-sub">Vượt qua các bộ lọc chất lượng</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Tỷ lệ sinh viên phản hồi trên tổng số phiếu cần thu (phiếu đã thu / phải thu)"
                >
                  <span className="reports-overview-kpi-label">Tỷ lệ phản hồi</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{data.responseRate.toFixed(1)}%</strong>
                  </div>
                  <span className="reports-overview-kpi-sub">Phiếu đã thu trên chỉ tiêu</span>
                </div>
              </div>
            </div>

            <div className="reports-overview-group">
              <div className="reports-overview-group-header">
                <span className="reports-overview-group-title">Kết quả đánh giá & Lọc tính điểm</span>
              </div>
              <div className="reports-overview-kpis" role="region" aria-label="Kết quả đánh giá và tính điểm">
                <div
                  className="reports-overview-kpi-card"
                  title="Điểm trung bình chỉ tính từ phiếu hợp lệ của các lớp đạt đủ hai tiêu chí"
                >
                  <span className="reports-overview-kpi-label">Điểm trung bình</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{data.overallAverageScore.toFixed(3)}</strong>
                    <span className="reports-overview-kpi-scale">/ 5.0</span>
                  </div>
                  <span className="reports-overview-kpi-sub">
                    Chỉ tính các phiếu hợp lệ thuộc các lớp đủ 2 tiêu chí
                  </span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Lớp qua được hai vòng lọc trên tổng số lớp đã phát phiếu"
                >
                  <span className="reports-overview-kpi-label">Lớp đủ điều kiện</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">
                      {formatNumber(data.scoredSectionCount)}
                      <span className="reports-overview-kpi-denom"> / {formatNumber(data.totalSections)}</span>
                    </strong>
                    {data.totalSections > 0 && (
                      <span className="reports-overview-kpi-badge">
                        {((data.scoredSectionCount / data.totalSections) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <span className="reports-overview-kpi-sub">Lớp qua cả 2 vòng lọc</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Số phiếu hợp lệ thực sự được dùng để tính điểm"
                >
                  <span className="reports-overview-kpi-label">Phiếu dùng để tính điểm</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">{formatNumber(data.scoredValidResponseCount)}</strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Phiếu hợp lệ của lớp đủ điều kiện</span>
                </div>

                <div
                  className="reports-overview-kpi-card"
                  title="Phiếu hợp lệ của những lớp không qua vòng lọc, không góp vào điểm"
                >
                  <span className="reports-overview-kpi-label">Phiếu bị loại khỏi tính điểm</span>
                  <div className="reports-overview-kpi-value">
                    <strong className="reports-overview-kpi-num">
                      {formatNumber(Math.max(0, data.totalResponses - data.scoredValidResponseCount))}
                    </strong>
                    <span className="reports-overview-kpi-unit">phiếu</span>
                  </div>
                  <span className="reports-overview-kpi-sub">Phiếu hợp lệ của lớp chưa đủ ĐK</span>
                </div>
              </div>
            </div>
          </div>

          {/*
            Hộp ghi chú định nghĩa các khái niệm mấu chốt, đóng khung gọn gàng, có icon và cấu trúc mạch lạc
          */}
          <div className="reports-exec-note">
            <Info className="operation-icon" aria-hidden="true" />
            <div className="reports-exec-note-content">
              <span>
                <strong>Phiếu hợp lệ:</strong> Phiếu không bị lọc nhiễu (trả lời sai câu kiểm tra chú ý, chọn cùng một mức cho mọi câu, làm nhanh bất thường).
              </span>
              <span className="reports-exec-note-sep" aria-hidden="true">•</span>
              <span>
                <strong>Lớp đủ điều kiện:</strong> Lớp qua cả hai ngưỡng tỷ lệ phản hồi và tỷ lệ phiếu hợp lệ; chỉ những lớp này mới được tính vào điểm trung bình.
              </span>
            </div>
          </div>

          <div className="reports-analysis-tabs" role="tablist" aria-label="Chọn nhóm phân tích">
            <button
              type="button"
              role="tab"
              aria-selected={analysisView === 'faculties'}
              className={analysisView === 'faculties' ? 'is-active' : ''}
              onClick={() => onAnalysisViewChange('faculties')}
            >
              So sánh theo Khoa
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={analysisView === 'quality'}
              className={analysisView === 'quality' ? 'is-active' : ''}
              onClick={() => onAnalysisViewChange('quality')}
            >
              Chất lượng phản hồi
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={analysisView === 'criteria'}
              className={analysisView === 'criteria' ? 'is-active' : ''}
              onClick={() => onAnalysisViewChange('criteria')}
            >
              Điểm theo tiêu chí
            </button>
          </div>

          {/* Hàng biểu đồ: điểm TB + tiến độ theo Khoa */}
          {analysisView === 'faculties' && (
          <div className="reports-exec-grid reports-analysis-panel" role="tabpanel">
            <div className="reports-exec-card">
              <header className="reports-exec-card-head">
                <h3>Điểm TB theo Khoa / Viện</h3>
                <span className="reports-exec-card-note">Đường nét đứt = điểm TB toàn trường</span>
              </header>
              <FacultyScoreChart
                faculties={data.faculties}
                schoolAverage={data.schoolAverageScore}
                onSelect={onDrillDown ? (facultyId) => onDrillDown({ facultyId }) : undefined}
              />
            </div>

            <div className="reports-exec-card">
              <header className="reports-exec-card-head">
                <h3>Tỷ lệ hoàn thành theo Khoa / Viện</h3>
              </header>
              <FacultyCompletionChart
                faculties={data.faculties}
                onSelect={onDrillDown ? (facultyId) => onDrillDown({ facultyId }) : undefined}
              />
            </div>
          </div>
          )}

          {/* Hàng thứ 2: xếp hạng tiêu chí, số lượng và đầu bảng do người dùng chọn */}
          {analysisView === 'quality' && (
          <div className="reports-exec-card reports-analysis-panel reports-quality-card" role="tabpanel">
            <header className="reports-exec-card-head">
              <h3>{questionLowest ? 'Tiêu chí cần cải tiến' : 'Tiêu chí được đánh giá cao'}</h3>
              <div className="reports-question-controls">
                <label htmlFor="reports-question-count">Hiển thị</label>
                <input
                  id="reports-question-count"
                  type="number"
                  min={1}
                  max={maxQuestionCount}
                  value={questionInput}
                  onChange={(event) => changeQuestionCount(event.target.value)}
                  onBlur={() => setQuestionInput(String(questionCount))}
                />
                <label className="catalog-sr-only" htmlFor="reports-question-order">
                  Đầu bảng điểm
                </label>
                <select
                  id="reports-question-order"
                  value={questionLowest ? 'lowest' : 'highest'}
                  onChange={(event) => setQuestionLowest(event.target.value === 'lowest')}
                >
                  <option value="lowest">tiêu chí điểm thấp nhất</option>
                  <option value="highest">tiêu chí điểm cao nhất</option>
                </select>
              </div>
            </header>
            {/* Giữ nguyên danh sách đang xem trong lúc nạp, chỉ làm mờ đi cho biết. */}
            <div
              className={questionsLoading ? 'reports-question-body is-loading' : 'reports-question-body'}
              aria-busy={questionsLoading}
            >
              <WeakestQuestionsPanel
                questions={rankedQuestions ?? data.weakestQuestions}
                validResponseCount={data.scoredValidResponseCount}
                lowestFirst={questionLowest}
              />
            </div>
          </div>
          )}

          {/* Hàng thứ 3: Biểu đồ điểm trung bình các tiêu chí câu hỏi toàn trường */}
          {analysisView === 'criteria' && (
          <div className="reports-exec-card reports-analysis-panel" role="tabpanel">
            <header className="reports-exec-card-head">
              <div>
                <h3>
                  Điểm trung bình {criteriaQuestions && criteriaQuestions.length > 0
                    ? `${criteriaQuestions.length} tiêu chí — toàn trường`
                    : 'tiêu chí — toàn trường'}
                </h3>
                <span className="reports-exec-card-note">
                  Đường nét đứt = điểm TB toàn trường ({data.overallAverageScore.toFixed(3)})
                </span>
              </div>
              <div className="reports-exec-actions">
                <NoteModalButton title="Lưu ý khi sử dụng số liệu">
                  <ul className="dashboard-notes" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    <li>Trục hoành hiển thị các tiêu chí đánh giá từ C1 đến C{criteriaQuestions?.length || 24}.</li>
                    <li>Trục tung biểu thị điểm trung bình đánh giá theo thang điểm từ 0 đến 5.</li>
                    <li>Đường nét đứt ngang thể hiện điểm trung bình chung toàn trường ({data.overallAverageScore.toFixed(3)}).</li>
                    <li>Màu sắc cột: Xanh lá (≥ 3.8), Vàng (3.5 – 3.79), Cam (3.2 – 3.49), Đỏ (&lt; 3.2).</li>
                    <li>Số lượt đánh giá của từng tiêu chí được tính dựa trên số phiếu dùng để tính điểm (phiếu hợp lệ của các lớp đủ điều kiện).</li>
                  </ul>
                </NoteModalButton>
              </div>
            </header>
            <SchoolCriteriaChart
              questions={criteriaQuestions ?? []}
              schoolAverage={data.overallAverageScore}
              loading={criteriaLoading}
            />
          </div>
          )}
        </>
      )}
    </section>
  );
};
