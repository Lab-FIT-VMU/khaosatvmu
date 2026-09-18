import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import { QuestionAnalysisChart } from '../QuestionAnalysisChart';
import { TablePagination } from '../TablePagination';
import { useColumnFilters, type FilterableColumn } from '../../hooks/useColumnFilters';
import { usePaginatedItems } from '../../hooks/usePaginatedItems';
import { ApiError } from '../../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../../services/surveyApi';
import type {
  CourseDiagnosisRow,
  DepartmentSummaryRow,
  NormalizedSection,
  SurveyAnalysisScopeType,
  SurveyScopeAnalysis,
} from '../../services/surveyApi';
import { scoreBandClass, scoreDeltaClass } from '../../utils/reportThresholds';
import { toVietnameseFileSlug } from '../../utils/vietnamese';
import type { QuestionAnalysisExportMetadata } from '../../services/exportQuestionAnalysisService';

/** Phạm vi đang mở trang chi tiết: một khoa/viện, một bộ môn hay một học phần. */
export interface ScopeSelection {
  type: SurveyAnalysisScopeType;
  id: number;
}

const scopeLabels: Record<SurveyAnalysisScopeType, string> = {
  faculty: 'Khoa / Viện',
  department: 'Bộ môn',
  course: 'Học phần',
};

const scopePageSize = 20;

const messageFrom = (error: unknown): string =>
  error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);

/**
 * Một dòng của bảng chi tiết.
 *
 * Ba cấp dùng chung một bộ cột, nhưng backend trả về ba kiểu dữ liệu khác nhau:
 * cấp bộ môn có sĩ số lẫn phiếu thu, cấp học phần chỉ có điểm, cấp lớp có sĩ số
 * mà không có phiếu thu. Chỗ này san phẳng cả ba về cùng một hình dạng rồi mới
 * dựng bảng, nhờ vậy chỉ cần viết một bảng và chỉ ẩn những cột mà cấp đó thật sự
 * không có số liệu — thay vì mỗi cấp một bộ cột riêng như trước.
 */
interface ScopeDetailRow {
  id: string;
  /** Tên đơn vị đang đếm. */
  label: string;
  /** Mã đi kèm, hiện nhỏ phía dưới tên. */
  sublabel?: string;
  /** Người phụ trách — chỉ cấp lớp học phần mới có. */
  owner?: string;
  sectionCount?: number;
  lecturerCount?: number;
  classSize?: number;
  responseCount?: number;
  validResponseCount?: number;
  /** Phiếu hợp lệ chia phiếu thu, theo phần trăm. */
  validRate?: number | null;
  averageScore: number | null;
  /** Bấm vào tên để mở cấp dưới; thiếu thì dòng đứng yên. */
  onOpen?: () => void;
}

const toDepartmentRows = (
  rows: DepartmentSummaryRow[],
  onOpen: (selection: ScopeSelection) => void,
): ScopeDetailRow[] =>
  rows.map((row) => ({
    id: String(row.departmentId ?? row.departmentName),
    label: row.departmentName,
    sectionCount: row.sectionCount,
    lecturerCount: row.lecturerCount,
    classSize: row.totalClassSize,
    responseCount: row.responseCount,
    validResponseCount: row.validResponseCount,
    validRate: row.validResponseRate,
    averageScore: row.averageScore,
    onOpen: row.departmentId === null
      ? undefined
      : () => onOpen({ type: 'department', id: row.departmentId! }),
  }));

const toCourseRows = (
  rows: CourseDiagnosisRow[],
  onOpen: (selection: ScopeSelection) => void,
): ScopeDetailRow[] =>
  rows.map((row) => ({
    id: String(row.courseId),
    label: row.courseName,
    sublabel: row.courseCode,
    sectionCount: row.sectionCount,
    lecturerCount: row.lecturerCount,
    classSize: row.totalClassSize,
    responseCount: row.responseCount,
    validResponseCount: row.validResponseCount,
    validRate: row.validResponseRate,
    averageScore: row.averageScore,
    onOpen: () => onOpen({ type: 'course', id: row.courseId }),
  }));

/** Cấp lớp không có cấp con trong trang này, nên bấm vào là mở bài khảo sát của lớp. */
const toSectionRows = (
  rows: NormalizedSection[],
  onOpen: (courseSectionSurveyId: number) => void,
): ScopeDetailRow[] =>
  rows.map((row) => ({
    id: String(row.courseSectionSurveyId),
    label: row.sectionName,
    owner: row.lecturerName,
    classSize: row.classSize,
    responseCount: row.responseCount,
    validResponseCount: row.validResponseCount,
    validRate: row.validResponseRate,
    averageScore: row.averageScore,
    onOpen: () => onOpen(row.courseSectionSurveyId),
  }));

/**
 * Bề rộng từng cột, viết thẳng số phần trăm ở chỗ gọi bảng. Ba cấp hiện ba bộ cột
 * khác nhau nên mỗi bảng tự cộng cho đủ 100% — cột nào cấp đó không có thì bỏ trống.
 */
interface ScopeColumnWidths {
  unit: string;
  sublabel?: string;
  owner?: string;
  sectionCount?: string;
  lecturerCount?: string;
  classSize?: string;
  responseCount?: string;
  validResponseCount?: string;
  validRate?: string;
  averageScore: string;
  delta: string;
}

const ScopeRowsTable: React.FC<{
  title: string;
  hint: string;
  itemLabel: string;
  emptyMessage: string;
  rows: ScopeDetailRow[];
  /** Điểm trung bình của cả phạm vi đang xem — mốc để tính cột Chênh lệch. */
  scopeAverageScore: number | null;
  /** Tên phạm vi đang xem, in thẳng vào tiêu đề cột Chênh lệch để không phải đoán. */
  compareLabel: string;
  /** Tên cột đầu: mỗi cấp gọi một kiểu (Bộ môn, Học phần, Lớp học phần). */
  unitHeader: string;
  /** Có giá trị thì mã đi kèm tách thành cột riêng thay vì nằm sau tên. */
  sublabelHeader?: string;
  /** Có giá trị thì người phụ trách tách thành cột riêng thay vì nằm dưới tên. */
  ownerHeader?: string;
  widths: ScopeColumnWidths;
  openTitle: (row: ScopeDetailRow) => string;
}> = ({
  title,
  hint,
  itemLabel,
  emptyMessage,
  rows,
  scopeAverageScore,
  compareLabel,
  unitHeader,
  sublabelHeader,
  ownerHeader,
  widths,
  openTitle,
}) => {
  const columns = useMemo<FilterableColumn<ScopeDetailRow>[]>(() => [
    {
      key: 'label',
      // Mã và người phụ trách đã có cột riêng thì không gộp vào ô lọc của cột tên nữa.
      value: (row) => [
        row.label,
        sublabelHeader ? '' : row.sublabel,
        ownerHeader ? '' : row.owner,
      ].filter(Boolean).join(' '),
    },
    { key: 'sublabel', value: (row) => row.sublabel ?? '' },
    { key: 'owner', value: (row) => row.owner ?? '' },
    { key: 'sectionCount', value: (row) => String(row.sectionCount ?? 0), numeric: true },
    { key: 'lecturerCount', value: (row) => String(row.lecturerCount ?? 0), numeric: true },
    { key: 'classSize', value: (row) => String(row.classSize ?? 0), numeric: true },
    { key: 'responseCount', value: (row) => String(row.responseCount ?? 0), numeric: true },
    {
      key: 'validResponseCount',
      value: (row) => String(row.validResponseCount ?? 0),
      numeric: true,
    },
    {
      key: 'validRate',
      value: (row) => (row.validRate == null ? '—' : `${row.validRate.toFixed(1)}%`),
      sortValue: (row) => row.validRate ?? null,
    },
    {
      key: 'averageScore',
      value: (row) => (row.averageScore === null ? '—' : row.averageScore.toFixed(2)),
      sortValue: (row) => row.averageScore,
    },
    {
      key: 'delta',
      value: (row) => {
        const delta = deltaOf(row.averageScore, scopeAverageScore);
        return delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
      },
      sortValue: (row) => deltaOf(row.averageScore, scopeAverageScore),
    },
  ], [scopeAverageScore, sublabelHeader, ownerHeader]);

  const filters = useColumnFilters(rows, columns);
  const pagination = usePaginatedItems(filters.visibleRows, scopePageSize);

  // Cột nào không cấp nào có số liệu thì bỏ hẳn, không để lại một cột toàn "—".
  const showsSectionCount = rows.some((row) => row.sectionCount !== undefined);
  const showsLecturerCount = rows.some((row) => row.lecturerCount !== undefined);
  const showsClassSize = rows.some((row) => row.classSize !== undefined);
  const showsResponses = rows.some((row) => row.responseCount !== undefined);
  const showsValidResponses = rows.some((row) => row.validResponseCount !== undefined);
  const showsValidRate = rows.some((row) => row.validRate != null);

  const widthOf = (key: keyof ScopeColumnWidths) => widths[key];

  return (
    <div className="analysis-scope-subtable">
      <div className="analysis-subtable-heading">
        <h3>{title} ({rows.length})</h3>
        <p className="analysis-subtable-hint">{hint}</p>
      </div>
      <div className="statistics-table-scroll" tabIndex={0} aria-label={title}>
        <table className="statistics-table statistics-table--fixed">
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: 'left', width: widthOf('unit') }}>
                {filters.filterHeader('label', unitHeader)}
              </th>
              {sublabelHeader && (
                <th scope="col" style={{ width: widthOf('sublabel') }}>
                  {filters.filterHeader('sublabel', sublabelHeader)}
                </th>
              )}
              {ownerHeader && (
                <th scope="col" style={{ textAlign: 'left', width: widthOf('owner') }}>
                  {filters.filterHeader('owner', ownerHeader)}
                </th>
              )}
              {showsSectionCount && (
                <th scope="col" style={{ width: widthOf('sectionCount') }}>
                  {filters.filterHeader('sectionCount', 'Số lớp')}
                </th>
              )}
              {showsLecturerCount && (
                <th scope="col" style={{ width: widthOf('lecturerCount') }}>
                  {filters.filterHeader('lecturerCount', 'Số giảng viên')}
                </th>
              )}
              {showsClassSize && (
                <th scope="col" style={{ width: widthOf('classSize') }}>
                  {filters.filterHeader('classSize', 'Sĩ số')}
                </th>
              )}
              {showsResponses && (
                <th scope="col" style={{ width: widthOf('responseCount') }}>
                  {filters.filterHeader('responseCount', 'Phiếu thu')}
                </th>
              )}
              {showsValidResponses && (
                <th scope="col" style={{ width: widthOf('validResponseCount') }}>
                  {filters.filterHeader('validResponseCount', 'Phiếu hợp lệ')}
                </th>
              )}
              {showsValidRate && (
                <th
                  scope="col"
                  style={{ width: widthOf('validRate') }}
                  title="Số phiếu hợp lệ chia số phiếu thu, theo phần trăm"
                >
                  {filters.filterHeader('validRate', 'Tỷ lệ phiếu hợp lệ')}
                </th>
              )}
              <th scope="col" style={{ width: widthOf('averageScore') }}>
                {filters.filterHeader('averageScore', 'Điểm trung bình')}
              </th>
              <th
                scope="col"
                style={{ width: widthOf('delta') }}
                title={`Điểm trung bình của dòng trừ điểm trung bình cả ${compareLabel} đang xem`}
              >
                {filters.filterHeader('delta', `Chênh lệch so với trung bình ${compareLabel}`)}
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.visibleItems.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{ textAlign: 'center', color: '#000000', padding: '18px 12px' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {pagination.visibleItems.map((row) => {
              const delta = deltaOf(row.averageScore, scopeAverageScore);
              return (
                <tr
                  key={row.id}
                  className={row.onOpen ? 'analysis-drill-row' : undefined}
                  onClick={row.onOpen}
                >
                  <td style={{ textAlign: 'left' }} title={row.label}>
                    {row.onOpen ? (
                      <button
                        type="button"
                        className="analysis-drill-link"
                        title={openTitle(row)}
                        onClick={(event) => {
                          event.stopPropagation();
                          row.onOpen?.();
                        }}
                      >
                        {row.label}
                      </button>
                    ) : row.label}
                    {!sublabelHeader && row.sublabel && (
                      <span className="catalog-secondary-value"> {row.sublabel}</span>
                    )}
                    {!ownerHeader && row.owner && (
                      <span className="catalog-secondary-value reports-progress-sub">
                        {row.owner}
                      </span>
                    )}
                  </td>
                  {sublabelHeader && (
                    <td className="num" title={row.sublabel}>
                      <span className="operations-code">{row.sublabel ?? '—'}</span>
                    </td>
                  )}
                  {ownerHeader && (
                    <td style={{ textAlign: 'left' }} title={row.owner}>
                      {row.owner ?? '—'}
                    </td>
                  )}
                  {showsSectionCount && <td className="num">{row.sectionCount}</td>}
                  {showsLecturerCount && <td className="num">{row.lecturerCount}</td>}
                  {showsClassSize && <td className="num">{row.classSize}</td>}
                  {showsResponses && <td className="num">{row.responseCount}</td>}
                  {showsValidResponses && <td className="num">{row.validResponseCount}</td>}
                  {showsValidRate && (
                    <td className="num">
                      {row.validRate == null ? '—' : `${row.validRate.toFixed(1)}%`}
                    </td>
                  )}
                  <td className={scoreBandClass(row.averageScore)}>
                    {row.averageScore === null ? '—' : row.averageScore.toFixed(2)}
                  </td>
                  <td className={scoreDeltaClass(delta)}>
                    {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <TablePagination
          page={pagination.page}
          pageSize={scopePageSize}
          totalItems={filters.visibleRows.length}
          itemLabel={itemLabel}
          onPageChange={pagination.setPage}
        />
      </div>
    </div>
  );
};

/** Chênh lệch của một dòng so với mặt bằng phạm vi. Thiếu một trong hai đầu thì bỏ trống. */
function deltaOf(score: number | null, scopeAverageScore: number | null): number | null {
  if (score === null || scopeAverageScore === null) return null;
  return score - scopeAverageScore;
}

/**
 * Trang chi tiết của một phạm vi, mở từ nút "Xem KQ" trên các bảng xếp hạng của
 * module Thống kê & Báo cáo. Đi từ trên xuống: khoa/viện → bộ môn → học phần →
 * lớp học phần, mỗi cấp là một bảng cùng bộ cột.
 */
export const ScopeAnalysisDetail: React.FC<{
  semesterSurveyId: number;
  selection: ScopeSelection;
  onBack: () => void;
  onDrillDown: (selection: ScopeSelection) => void;
  onOpenSurvey: (courseSectionSurveyId: number) => void;
}> = ({ semesterSurveyId, selection, onBack, onDrillDown, onOpenSurvey }) => {
  const [data, setData] = useState<SurveyScopeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await surveyApi.semesterSurveyScopeAnalysis(
        semesterSurveyId,
        selection.type,
        selection.id,
      ));
      setError(null);
    } catch (nextError) {
      setData(null);
      setError(messageFrom(nextError));
    } finally {
      setLoading(false);
    }
  }, [semesterSurveyId, selection.id, selection.type]);

  useEffect(() => {
    void load();
  }, [load]);

  const scopeExportMetadata = useMemo<QuestionAnalysisExportMetadata | undefined>(() => {
    if (!data) return undefined;
    return {
      title: 'BÁO CÁO PHÂN TÍCH KẾT QUẢ CÂU HỎI KHẢO SÁT',
      subtitle: data.templateName,
      fileName: `bao-cao-cau-hoi-${data.scopeType}-${toVietnameseFileSlug(data.scopeName)}`,
      info: {
        'Phạm vi': `${scopeLabels[data.scopeType]} - ${data.scopeName}`,
        'Đợt khảo sát': data.templateName,
        'Học kỳ': `${data.semesterName} (${data.academicYearName})`,
        'Số lớp học phần': data.sectionCount,
        'Tổng sĩ số': data.totalClassSize.toLocaleString('vi-VN'),
        'Phiếu hợp lệ': data.responseCount.toLocaleString('vi-VN'),
        'Điểm trung bình': `${data.averageScore.toFixed(2)} / 5.0`,
      },
    };
  }, [data]);

  if (loading) {
    return (
      <div className="operations-empty" role="status">
        <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
        <strong>Đang tải thống kê điểm chi tiết...</strong>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="analysis-scope-error">
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{error ?? 'Không có dữ liệu chi tiết cho dòng này.'}</span>
        </div>
        <div className="analysis-scope-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={16} />
            Quay lại bảng
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" size={16} />
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-scope-detail">
      <section className="section-responses-summary" aria-label="Thông tin phạm vi phân tích">
        <div className="section-responses-heading">
          <button
            type="button"
            className="btn btn-secondary btn-sm section-responses-back"
            onClick={onBack}
            title="Quay lại bảng phân tích"
            aria-label="Quay lại bảng phân tích"
          >
            <ArrowLeft className="operation-icon" aria-hidden="true" />
          </button>
          <h2>{data.scopeName}</h2>
          <p>
            {scopeLabels[data.scopeType]} · {data.templateName} · {data.semesterName} · {data.academicYearName}
          </p>
        </div>
        <div className="section-responses-stats">
          <span>{data.sectionCount} lớp · tổng sĩ số {data.totalClassSize.toLocaleString('vi-VN')}</span>
          <span title="Mốc để tính cột Chênh lệch ở bảng bên dưới">
            Điểm trung bình {data.averageScore.toFixed(2)}
          </span>
          <span>{data.responseCount.toLocaleString('vi-VN')} phiếu hợp lệ</span>
        </div>
      </section>

      {/* Chỉ xem toàn bài, đã bỏ hai tab Học phần / Giảng viên theo yêu cầu. */}
      <QuestionAnalysisChart
        questions={data.questions}
        overallAverageScore={data.averageScore}
        responseCount={data.responseCount}
        title="Phân tích điểm chi tiết theo câu hỏi"
        showDistributionTable
        exportMetadata={scopeExportMetadata}
      />

      {data.scopeType === 'faculty' && data.departments && data.departments.length > 0 && (
        <ScopeRowsTable
          title="Danh sách các bộ môn"
          hint="Bấm vào tên bộ môn để xem chi tiết thống kê và các học phần của bộ môn đó."
          itemLabel="bộ môn"
          emptyMessage="Không có bộ môn nào khớp với bộ lọc hiện tại."
          rows={toDepartmentRows(data.departments, onDrillDown)}
          scopeAverageScore={data.averageScore}
          compareLabel={scopeLabels[data.scopeType]}
          unitHeader="Bộ môn"
          // 9 cột, cộng đủ 100%.
          widths={{
            unit: '26%',
            sectionCount: '8%',
            lecturerCount: '10%',
            classSize: '8%',
            responseCount: '10%',
            validResponseCount: '10%',
            validRate: '11%',
            averageScore: '9%',
            delta: '8%',
          }}
          openTitle={(row) => `Xem chi tiết bộ môn ${row.label}`}
        />
      )}

      {data.scopeType === 'department' && data.courses && data.courses.length > 0 && (
        <ScopeRowsTable
          title="Danh sách các học phần"
          hint="Bấm vào tên học phần để xem chi tiết thống kê và các lớp học phần của học phần đó."
          itemLabel="học phần"
          emptyMessage="Không có học phần nào khớp với bộ lọc hiện tại."
          rows={toCourseRows(data.courses, onDrillDown)}
          scopeAverageScore={data.averageScore}
          compareLabel={scopeLabels[data.scopeType]}
          unitHeader="Học phần"
          sublabelHeader="Mã học phần"
          // 10 cột, cộng đủ 100%.
          widths={{
            unit: '22%',
            sublabel: '9%',
            sectionCount: '7%',
            lecturerCount: '9%',
            classSize: '7%',
            responseCount: '9%',
            validResponseCount: '9%',
            validRate: '10%',
            averageScore: '9%',
            delta: '9%',
          }}
          openTitle={(row) => `Xem chi tiết học phần ${row.label}`}
        />
      )}

      {data.scopeType === 'course' && data.sections && data.sections.length > 0 && (
        <ScopeRowsTable
          title="Danh sách các lớp học phần"
          hint="Bấm vào mã hoặc lớp để xem toàn bộ kết quả và phiếu khảo sát của lớp."
          itemLabel="lớp"
          emptyMessage="Không có lớp học phần nào khớp với bộ lọc hiện tại."
          rows={toSectionRows(data.sections, onOpenSurvey)}
          compareLabel={scopeLabels[data.scopeType]}
          scopeAverageScore={data.averageScore}
          unitHeader="Lớp học phần"
          ownerHeader="Giảng viên"
          // 8 cột, cộng đủ 100%.
          widths={{
            unit: '14%',
            owner: '22%',
            classSize: '9%',
            responseCount: '11%',
            validResponseCount: '11%',
            validRate: '11%',
            averageScore: '11%',
            delta: '11%',
          }}
          openTitle={(row) => `Xem kết quả lớp ${row.label}`}
        />
      )}
    </div>
  );
};
