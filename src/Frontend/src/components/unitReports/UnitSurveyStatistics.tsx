import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  LoaderCircle,
  MessageSquareText,
  Star,
  Target,
  UsersRound,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { useSemester } from '../../context/semesterContext';
import { ApiError } from '../../services/apiClient';
import { surveyApi, surveyErrorMessage, surveyTypeLabels } from '../../services/surveyApi';
import type {
  SemesterSurvey,
  SurveyType,
  UnitReportGroup,
  UnitReportRow,
  UnitSurveyReport,
} from '../../types';
import {
  formatDecimalOrDash,
  formatNumber,
  formatPercentOrDash,
} from '../../utils/formatNumber';
import { foldVietnamese } from '../../utils/vietnamese';
import { bandColor, completionColor, scoreColor } from '../reports/theme';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/unit-reports.css';

/*
  Thống kê đợt CTĐT và khảo sát giảng viên cho ba màn Tiến độ thu phiếu, Bảng dữ liệu và
  Thống kê & Báo cáo. Cả ba đọc chung một API tính sống ở server; mỗi màn chỉ khác phần
  trình bày. CTĐT không có sĩ số nên mọi cột sĩ số / tỷ lệ phản hồi đều vắng mặt.
*/

export type UnitSurveyType = Exclude<SurveyType, 'COURSE'>;

const unitNounOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'khoá ngành',
  LECTURER: 'khoa / viện',
};

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

interface UnitReportState {
  surveys: SemesterSurvey[];
  selectedId: string;
  setSelectedId: (id: string) => void;
  report: UnitSurveyReport | null;
  loading: boolean;
  error: string | null;
}

/** Danh sách đợt của loại đang xem trong học kỳ làm việc, và báo cáo của đợt đang chọn. */
function useUnitSurveyReport(surveyType: UnitSurveyType): UnitReportState {
  const { activeSemesterId } = useSemester();
  const [surveys, setSurveys] = useState<SemesterSurvey[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [report, setReport] = useState<UnitSurveyReport | null>(null);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSurveys([]);
    setSelectedId('');
    setReport(null);
    if (!activeSemesterId) return;
    const controller = new AbortController();
    setLoadingSurveys(true);
    surveyApi.semesterSurveys(activeSemesterId, controller.signal, surveyType)
      .then((next) => {
        setSurveys(next);
        // Mặc định đợt mới nhất, giống các trang thống kê học phần.
        setSelectedId(next.length > 0 ? String(next[0].semesterSurveyId) : '');
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSurveys(false);
      });
    return () => controller.abort();
  }, [activeSemesterId, surveyType]);

  useEffect(() => {
    setReport(null);
    if (!selectedId) return;
    const controller = new AbortController();
    setLoadingReport(true);
    surveyApi.unitSurveyReport(Number(selectedId), controller.signal)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) setError(messageFrom(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  return {
    surveys,
    selectedId,
    setSelectedId,
    report,
    loading: loadingSurveys || loadingReport,
    error,
  };
}

/** Học kỳ (dùng chung với cả ứng dụng) và đợt khảo sát của loại đang xem. */
const UnitReportToolbar: React.FC<{
  surveyType: UnitSurveyType;
  state: UnitReportState;
}> = ({ surveyType, state }) => {
  const { academicYears, activeSemesterId, setActiveSemesterId } = useSemester();
  return (
    <section className="statistics-toolbar" aria-label="Chọn đợt khảo sát">
      <label className="form-group">
        <span>Học kỳ</span>
        <select
          value={activeSemesterId ?? ''}
          onChange={(event) =>
            setActiveSemesterId(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">Chọn học kỳ</option>
          {academicYears.flatMap((year) =>
            year.semesters.map((semester) => (
              <option key={semester.semesterId} value={semester.semesterId}>
                {semester.semesterName} · {year.academicYearName}
              </option>
            )),
          )}
        </select>
      </label>
      <label className="form-group">
        <span>Đợt khảo sát {surveyTypeLabels[surveyType].toLowerCase()}</span>
        <select
          value={state.selectedId}
          disabled={state.surveys.length === 0}
          onChange={(event) => state.setSelectedId(event.target.value)}
        >
          {state.surveys.length === 0 && <option value="">Chưa có đợt nào</option>}
          {state.surveys.map((survey) => (
            <option key={survey.semesterSurveyId} value={survey.semesterSurveyId}>
              {survey.surveyName} · {survey.sectionSurveyCount} {unitNounOf[surveyType]}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
};

/**
 * Khung chung của ba màn: thanh chọn đợt, báo lỗi, trạng thái tải và màn trống. Phần thân
 * chỉ dựng khi đã có báo cáo.
 */
const UnitReportFrame: React.FC<{
  surveyType: UnitSurveyType;
  state: UnitReportState;
  children: (report: UnitSurveyReport) => React.ReactNode;
}> = ({ surveyType, state, children }) => (
  <div className="survey-operations-page operations-table-page unit-report-page">
    <UnitReportToolbar surveyType={surveyType} state={state} />

    {state.error && (
      <div className="operations-feedback operations-feedback--error" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{state.error}</span>
      </div>
    )}

    {state.loading && (
      <div className="operations-empty" role="status">
        <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
        <strong>Đang tải số liệu...</strong>
      </div>
    )}

    {!state.loading && !state.error && state.surveys.length === 0 && (
      <div className="operations-empty">
        <ClipboardCheck className="operation-icon" aria-hidden="true" />
        <strong>Học kỳ này chưa có đợt khảo sát {surveyTypeLabels[surveyType].toLowerCase()} nào</strong>
        <span>Tạo đợt ở Khảo sát › Danh sách đợt khảo sát, chọn loại {surveyTypeLabels[surveyType]}.</span>
      </div>
    )}

    {!state.loading && state.report && children(state.report)}
  </div>
);

/** Ghi chú ngưỡng đang áp, để người đọc biết vì sao một đơn vị không được tính điểm. */
const ThresholdNote: React.FC<{ report: UnitSurveyReport }> = ({ report }) => (
  <p className="unit-report-note">
    {report.surveyType === 'PROGRAM' ? (
      <>
        Khảo sát CTĐT không có sĩ số nên không tính tỷ lệ phản hồi. Một khoá ngành được tính
        điểm khi phiếu hợp lệ đạt từ <strong>{report.minimumValidRate}%</strong> số phiếu đã thu.
      </>
    ) : (
      <>
        Sĩ số là số giảng viên của khoa, chốt lúc tạo đợt. Một khoa được tính điểm khi phiếu đã
        thu đạt từ <strong>{report.minimumResponseRate}%</strong> sĩ số và phiếu hợp lệ đạt từ{' '}
        <strong>{report.minimumValidRate}%</strong> số phiếu đã thu.
      </>
    )}{' '}
    Điểm gộp là trung bình cộng điểm các đơn vị được tính, số liệu cập nhật theo phiếu mới nhất.
  </p>
);

/** Thanh tỷ lệ một màu kèm số; độ dài là thông tin phụ, con số mới là thông tin chính. */
const Meter: React.FC<{ value: number | null; max: number; color: string; label: string }> = ({
  value,
  max,
  color,
  label,
}) => (
  <span className="unit-report-meter" title={label}>
    <span className="unit-report-meter-track" aria-hidden="true">
      {value !== null && (
        <span
          className="unit-report-meter-fill"
          style={{ width: `${Math.min(100, Math.max(0, (value / max) * 100))}%`, background: color }}
        />
      )}
    </span>
    <span className="unit-report-meter-value">{label}</span>
  </span>
);

const ScoreCell: React.FC<{ score: number | null }> = ({ score }) =>
  score === null
    ? <span className="unit-report-muted">—</span>
    : <Meter value={score} max={5} color={scoreColor(score)} label={formatDecimalOrDash(score, 2)} />;

const RateCell: React.FC<{ rate: number | null }> = ({ rate }) =>
  rate === null
    ? <span className="unit-report-muted">—</span>
    : <Meter value={rate} max={100} color={completionColor(rate)} label={formatPercentOrDash(rate, 1)} />;

const ScoredBadge: React.FC<{ row: UnitReportRow }> = ({ row }) =>
  row.isScored ? (
    <span className="unit-report-badge unit-report-badge--ok">
      <CheckCircle2 size={13} aria-hidden="true" />
      Được tính
    </span>
  ) : (
    <span className="unit-report-badge">
      {row.responseCount === 0 ? 'Chưa có phiếu' : 'Chưa đủ ngưỡng'}
    </span>
  );

const searchRows = (rows: UnitReportRow[], search: string) => {
  const folded = foldVietnamese(search);
  return folded
    ? rows.filter((row) => foldVietnamese(
      [row.facultyName, row.unitCode, row.unitName, row.cohortName].join(' '),
    ).includes(folded))
    : rows;
};

/** Cột nhận diện đơn vị: CTĐT có thêm khoá ngành và khoá, khảo sát giảng viên chỉ có khoa. */
function unitIdentityColumns(isProgram: boolean): Column<UnitReportRow>[] {
  const faculty: Column<UnitReportRow> = {
    key: 'facultyName',
    header: 'Khoa / Viện',
    render: (row) => row.facultyName || 'Chưa gắn khoa',
    sortValue: (row) => row.facultyName,
    filterValue: (row) => row.facultyName || 'Chưa gắn khoa',
  };
  if (!isProgram) return [faculty];
  return [
    faculty,
    {
      key: 'unitCode',
      header: 'Khoá ngành',
      render: (row) => <strong>{row.unitCode}</strong>,
      sortValue: (row) => row.unitCode,
    },
    {
      key: 'unitName',
      header: 'Ngành',
      sortValue: (row) => row.unitName,
      filterValue: (row) => row.unitName,
    },
    {
      key: 'cohortName',
      header: 'Khoá',
      sortValue: (row) => row.cohortName,
      filterValue: (row) => row.cohortName,
    },
  ];
}

// ------------------------------------------------------------ Tiến độ thu phiếu

export const UnitProgressView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  const [search, setSearch] = useState('');
  const isProgram = surveyType === 'PROGRAM';

  const columns = useMemo((): Column<UnitReportRow>[] => [
    ...unitIdentityColumns(isProgram),
    ...(isProgram
      ? []
      : [{
        key: 'targetCount',
        header: 'Sĩ số',
        align: 'right' as const,
        numeric: true,
        render: (row: UnitReportRow) => formatNumber(row.targetCount ?? 0),
        sortValue: (row: UnitReportRow) => row.targetCount ?? 0,
      }]),
    {
      key: 'responseCount',
      header: 'Phiếu đã thu',
      align: 'right',
      numeric: true,
      render: (row) => formatNumber(row.responseCount),
      sortValue: (row) => row.responseCount,
    },
    {
      key: 'validResponseCount',
      header: 'Phiếu hợp lệ',
      align: 'right',
      numeric: true,
      render: (row) => formatNumber(row.validResponseCount),
      sortValue: (row) => row.validResponseCount,
    },
    ...(isProgram
      ? []
      : [{
        key: 'responseRate',
        header: 'Tỷ lệ phản hồi',
        width: '180px',
        render: (row: UnitReportRow) => <RateCell rate={row.responseRate} />,
        sortValue: (row: UnitReportRow) => row.responseRate ?? -1,
      }]),
    {
      key: 'openCommentCount',
      header: 'Ý kiến khác',
      align: 'right',
      numeric: true,
      render: (row) => formatNumber(row.openCommentCount),
      sortValue: (row) => row.openCommentCount,
    },
    {
      key: 'isScored',
      header: 'Tính điểm',
      render: (row) => <ScoredBadge row={row} />,
      filterValue: (row) => (row.isScored ? 'Được tính' : 'Chưa được tính'),
    },
  ], [isProgram]);

  return (
    <UnitReportFrame surveyType={surveyType} state={state}>
      {(report) => (
        <>
          <ThresholdNote report={report} />
          <section className="operations-metrics" aria-label="Tổng quan tiến độ">
            <div className="operation-metric">
              <span className="operation-metric-icon"><UsersRound className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Đơn vị đã có phiếu</span>
              <strong className="operation-metric-value">
                {report.summary.respondedUnitCount} / {report.summary.unitCount}
              </strong>
              <span className="operation-metric-note">Số {unitNounOf[surveyType]} đã có ít nhất một phiếu</span>
            </div>
            <div className="operation-metric operation-metric--success">
              <span className="operation-metric-icon"><ClipboardCheck className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Số phiếu đã thu</span>
              <strong className="operation-metric-value">{formatNumber(report.summary.responseCount)}</strong>
              <span className="operation-metric-note">
                {formatNumber(report.summary.validResponseCount)} phiếu qua bộ lọc nhiễu
              </span>
            </div>
            {isProgram ? (
              <div className="operation-metric operation-metric--warning">
                <span className="operation-metric-icon"><CheckCircle2 className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Đơn vị được tính điểm</span>
                <strong className="operation-metric-value">
                  {report.summary.scoredUnitCount} / {report.summary.unitCount}
                </strong>
                <span className="operation-metric-note">Không có sĩ số nên không có tỷ lệ phản hồi</span>
              </div>
            ) : (
              <div className="operation-metric operation-metric--warning">
                <span className="operation-metric-icon"><Target className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Tỷ lệ phản hồi</span>
                <strong className="operation-metric-value">
                  {formatPercentOrDash(report.summary.responseRate, 1)}
                </strong>
                <span className="operation-metric-note">
                  Trên tổng sĩ số {formatNumber(report.summary.targetCount ?? 0)} giảng viên
                </span>
              </div>
            )}
            <div className="operation-metric">
              <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Số ý kiến mở</span>
              <strong className="operation-metric-value">{formatNumber(report.comments.length)}</strong>
              <span className="operation-metric-note">Ý kiến khác người trả lời nhập</span>
            </div>
          </section>

          <DataTable
            columns={columns}
            data={searchRows(report.units, search)}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={isProgram ? 'Tìm khoa, khoá ngành, ngành...' : 'Tìm khoa / viện...'}
            exportConfig={{
              fileName: `tien-do-${isProgram ? 'ctdt' : 'giang-vien'}-${report.semesterSurveyId}`,
              title: `TIẾN ĐỘ THU PHIẾU ${surveyTypeLabels[surveyType].toUpperCase()}`,
              subtitle: report.surveyName,
            }}
            emptyMessage={`Đợt này chưa có ${unitNounOf[surveyType]} nào.`}
            keyExtractor={(row) => String(row.courseSectionSurveyId)}
            showIndex={false}
          />
        </>
      )}
    </UnitReportFrame>
  );
};

// ------------------------------------------------------------ Bảng dữ liệu

export const UnitStatisticsView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  const [search, setSearch] = useState('');
  const isProgram = surveyType === 'PROGRAM';
  const scoredQuestions = useMemo(
    () => state.report?.questions.filter((question) => question.isScored) ?? [],
    [state.report],
  );

  const columns = useMemo((): Column<UnitReportRow>[] => [
    ...unitIdentityColumns(isProgram),
    ...(isProgram
      ? []
      : [{
        key: 'targetCount',
        header: 'Sĩ số',
        align: 'right' as const,
        numeric: true,
        render: (row: UnitReportRow) => formatNumber(row.targetCount ?? 0),
        sortValue: (row: UnitReportRow) => row.targetCount ?? 0,
      }]),
    {
      key: 'responseCount',
      header: 'Phiếu',
      align: 'right',
      numeric: true,
      render: (row) => formatNumber(row.responseCount),
      sortValue: (row) => row.responseCount,
    },
    {
      key: 'validResponseCount',
      header: 'Hợp lệ',
      align: 'right',
      numeric: true,
      render: (row) => formatNumber(row.validResponseCount),
      sortValue: (row) => row.validResponseCount,
    },
    {
      key: 'averageScore',
      header: 'Điểm TB',
      align: 'right',
      numeric: true,
      render: (row) => formatDecimalOrDash(row.averageScore, 2),
      sortValue: (row) => row.averageScore ?? -1,
    },
    {
      key: 'isScored',
      header: 'Tính điểm',
      render: (row) => <ScoredBadge row={row} />,
      filterValue: (row) => (row.isScored ? 'Được tính' : 'Chưa được tính'),
    },
    // Một cột C cho mỗi câu có điểm, như bảng dữ liệu của khảo sát học phần.
    ...scoredQuestions.map((question): Column<UnitReportRow> => ({
      key: `q-${question.questionId}`,
      header: `C${question.order}`,
      headerHint: question.questionText,
      align: 'right',
      numeric: true,
      render: (row) => formatDecimalOrDash(
        row.questionScores.find((score) => score.questionId === question.questionId)?.averageScore,
        2,
      ),
      sortValue: (row) =>
        row.questionScores.find((score) => score.questionId === question.questionId)?.averageScore ?? -1,
    })),
  ], [isProgram, scoredQuestions]);

  return (
    <UnitReportFrame surveyType={surveyType} state={state}>
      {(report) => (
        <>
          <ThresholdNote report={report} />
          <DataTable
            columns={columns}
            data={searchRows(report.units, search)}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={isProgram ? 'Tìm khoa, khoá ngành, ngành...' : 'Tìm khoa / viện...'}
            exportConfig={{
              fileName: `bang-du-lieu-${isProgram ? 'ctdt' : 'giang-vien'}-${report.semesterSurveyId}`,
              title: `BẢNG DỮ LIỆU KHẢO SÁT ${surveyTypeLabels[surveyType].toUpperCase()}`,
              subtitle: report.surveyName,
            }}
            emptyMessage={`Đợt này chưa có ${unitNounOf[surveyType]} nào.`}
            keyExtractor={(row) => String(row.courseSectionSurveyId)}
            showIndex={false}
          />
          {scoredQuestions.length > 0 && (
            <section className="unit-report-card" aria-label="Danh sách câu hỏi">
              <h3>Câu hỏi tương ứng các cột C</h3>
              <ol className="unit-report-question-legend">
                {scoredQuestions.map((question) => (
                  <li key={question.questionId}>
                    <strong>C{question.order}.</strong> {question.questionText}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </UnitReportFrame>
  );
};

// ------------------------------------------------------------ Thống kê & Báo cáo

const groupColumns = (
  firstHeader: string,
  withTarget: boolean,
): Column<UnitReportGroup>[] => [
  { key: 'name', header: firstHeader, sortValue: (row) => row.name },
  {
    key: 'unitCount',
    header: 'Đơn vị tính điểm',
    align: 'right',
    numeric: true,
    render: (row) => `${row.scoredUnitCount} / ${row.unitCount}`,
    sortValue: (row) => row.scoredUnitCount,
  },
  {
    key: 'responseCount',
    header: 'Phiếu (hợp lệ)',
    align: 'right',
    numeric: true,
    render: (row) => `${formatNumber(row.responseCount)} (${formatNumber(row.validResponseCount)})`,
    sortValue: (row) => row.responseCount,
  },
  ...(withTarget
    ? [{
      key: 'responseRate',
      header: 'Tỷ lệ phản hồi',
      width: '180px',
      render: (row: UnitReportGroup) => <RateCell rate={row.responseRate} />,
      sortValue: (row: UnitReportGroup) => row.responseRate ?? -1,
    }]
    : []),
  {
    key: 'averageScore',
    header: 'Điểm trung bình',
    width: '200px',
    render: (row) => <ScoreCell score={row.averageScore} />,
    sortValue: (row) => row.averageScore ?? -1,
  },
];

export const UnitReportView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  const isProgram = surveyType === 'PROGRAM';
  const [groupBy, setGroupBy] = useState<'faculty' | 'major' | 'cohort'>('faculty');

  return (
    <UnitReportFrame surveyType={surveyType} state={state}>
      {(report) => {
        const groups = groupBy === 'major'
          ? report.majors
          : groupBy === 'cohort'
            ? report.cohorts
            : report.faculties;
        const groupHeader = groupBy === 'major' ? 'Ngành' : groupBy === 'cohort' ? 'Khoá' : 'Khoa / Viện';
        const rankedQuestions = report.questions
          .filter((question) => question.isScored && question.averageScore !== null)
          .sort((a, b) => (a.averageScore ?? 0) - (b.averageScore ?? 0));

        return (
          <>
            <ThresholdNote report={report} />
            <section className="operations-metrics" aria-label="Kết quả chung">
              <div className="operation-metric operation-metric--success">
                <span className="operation-metric-icon"><Star className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Điểm trung bình</span>
                <strong className="operation-metric-value">
                  {formatDecimalOrDash(report.summary.averageScore, 2)}
                </strong>
                <span className="operation-metric-note">Thang 5, trên các đơn vị được tính điểm</span>
              </div>
              <div className="operation-metric">
                <span className="operation-metric-icon"><CheckCircle2 className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Đơn vị được tính điểm</span>
                <strong className="operation-metric-value">
                  {report.summary.scoredUnitCount} / {report.summary.unitCount}
                </strong>
                <span className="operation-metric-note">Số {unitNounOf[surveyType]} qua đủ ngưỡng</span>
              </div>
              <div className="operation-metric">
                <span className="operation-metric-icon"><ClipboardCheck className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Phiếu hợp lệ</span>
                <strong className="operation-metric-value">
                  {formatNumber(report.summary.validResponseCount)}
                </strong>
                <span className="operation-metric-note">
                  Trên {formatNumber(report.summary.responseCount)} phiếu đã thu
                </span>
              </div>
              <div className="operation-metric">
                <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
                <span className="operation-metric-label">Ý kiến mở</span>
                <strong className="operation-metric-value">{formatNumber(report.comments.length)}</strong>
                <span className="operation-metric-note">Ý kiến khác người trả lời nhập</span>
              </div>
            </section>

            <section className="unit-report-card" aria-label="Kết quả theo nhóm">
              <div className="unit-report-card-head">
                <h3>Kết quả theo {groupHeader.toLowerCase()}</h3>
                {isProgram && (
                  <div className="operations-tabs" role="tablist" aria-label="Gộp theo">
                    {([['faculty', 'Khoa / Viện'], ['major', 'Ngành'], ['cohort', 'Khoá']] as const).map(
                      ([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={groupBy === value}
                          className={`operations-tab${groupBy === value ? ' is-active' : ''}`}
                          onClick={() => setGroupBy(value)}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <DataTable
                columns={groupColumns(groupHeader, !isProgram)}
                data={groups}
                exportConfig={{
                  fileName: `ket-qua-${groupBy}-${report.semesterSurveyId}`,
                  title: `KẾT QUẢ KHẢO SÁT ${surveyTypeLabels[surveyType].toUpperCase()} THEO ${groupHeader.toUpperCase()}`,
                  subtitle: report.surveyName,
                }}
                emptyMessage="Chưa có số liệu."
                keyExtractor={(row) => row.key || row.name}
                showIndex={false}
              />
            </section>

            <section className="unit-report-card" aria-label="Điểm từng câu hỏi">
              <h3>Điểm từng câu hỏi, thấp nhất trước</h3>
              {rankedQuestions.length === 0 ? (
                <p className="unit-report-muted">Chưa có đơn vị nào được tính điểm.</p>
              ) : (
                <>
                  <ul className="unit-report-legend" aria-label="Chú thích mức trả lời">
                    {[5, 4, 3, 2].map((band) => (
                      <li key={band}>
                        <span className="unit-report-legend-dot" style={{ background: bandColor(band) }} />
                        {band === 2 ? 'Mức 1–2' : `Mức ${band}`}
                      </li>
                    ))}
                  </ul>
                  <ol className="unit-report-questions">
                    {rankedQuestions.map((question) => {
                      const total = question.distribution.reduce((sum, item) => sum + item.count, 0);
                      return (
                        <li key={question.questionId}>
                          <div className="unit-report-question-text">
                            <strong>C{question.order}.</strong> {question.questionText}
                            <span className="unit-report-muted"> · {question.sectionName}</span>
                          </div>
                          <ScoreCell score={question.averageScore} />
                          {/* Phân bố mức: mỗi đoạn có số và tỷ lệ trong title, và cả dòng chữ bên dưới. */}
                          <div className="unit-report-distribution" aria-hidden="true">
                            {[...question.distribution]
                              .sort((a, b) => b.value - a.value)
                              .filter((item) => item.count > 0)
                              .map((item) => (
                                <span
                                  key={item.value}
                                  style={{
                                    flexGrow: item.count,
                                    background: bandColor(item.value),
                                  }}
                                  title={`${item.displayText}: ${item.count} (${Math.round((item.count / total) * 100)}%)`}
                                />
                              ))}
                          </div>
                          <div className="unit-report-distribution-text">
                            {[...question.distribution]
                              .sort((a, b) => b.value - a.value)
                              .map((item) => `${item.displayText}: ${item.count}`)
                              .join(' · ')}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>

            <section className="unit-report-card" aria-label="Ý kiến mở">
              <h3>Ý kiến mở ({formatNumber(report.comments.length)})</h3>
              {report.comments.length === 0 ? (
                <p className="unit-report-muted">Chưa có ý kiến nào.</p>
              ) : (
                <ul className="unit-report-comments">
                  {report.comments.map((comment) => (
                    <li key={comment.responseId}>
                      <p>{comment.comment}</p>
                      <span className="unit-report-muted">
                        {isProgram ? `${comment.unitCode} – ${comment.unitName}` : comment.unitName}
                        {isProgram && comment.facultyName ? ` · ${comment.facultyName}` : ''}
                        {' · '}
                        {new Date(comment.submittedAt).toLocaleString('vi-VN')}
                        {!comment.isValid && ' · phiếu bị bộ lọc nhiễu loại'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        );
      }}
    </UnitReportFrame>
  );
};
