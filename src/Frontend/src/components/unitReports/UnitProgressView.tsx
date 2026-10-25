import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  Target,
  UsersRound,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import { surveyApi, surveyTypeLabels } from '../../services/surveyApi';
import type { UnitReportRow, UnitSurveyReport } from '../../types';
import { COMPLETED_COMPLETION_RATE } from '../../utils/reportThresholds';
import { foldVietnamese } from '../../utils/vietnamese';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from './UnitReportFrame';
import {
  respondentNounOf,
  unitNounOf,
  useUnitSurveyReport,
  type UnitSurveyType,
} from './unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';

/*
  Tiến độ thu phiếu của CTĐT / giảng viên, dựng theo đúng trang Tiến độ của học phần.
  Khảo sát giảng viên có sĩ số nên giữ nguyên tỷ lệ phản hồi và nhãn chỉ tiêu (cùng chỉ
  tiêu với trang học phần). CTĐT không có sĩ số: cột tỷ lệ nhường chỗ cho nhãn "Đã có
  phiếu / Chưa có phiếu".
*/

type ProgressStatus = 'Đạt chỉ tiêu' | 'Đang thu' | 'Không đạt chỉ tiêu' | 'Đã có phiếu' | 'Chưa có phiếu';

interface ProgressItem {
  id: string;
  facultyName: string;
  unitCode: string;
  unitName: string;
  cohortName: string;
  targetCount: number;
  actualCount: number;
  rate: number;
  status: ProgressStatus;
}

const statusClassOf = (status: ProgressStatus): string =>
  status === 'Đạt chỉ tiêu' || status === 'Đã có phiếu'
    ? 'operations-status--success'
    : status === 'Đang thu'
      ? 'operations-status--warning'
      : 'operations-status--danger';

export const UnitProgressView: React.FC<{ surveyType: UnitSurveyType }> = ({ surveyType }) => {
  const state = useUnitSurveyReport(surveyType);
  return (
    <div className="survey-operations-page operations-table-page survey-progress-page">
      <UnitReportToolbar surveyType={surveyType} state={state} idPrefix="unit-progress" />
      <UnitScoringNote report={state.report} surveyType={surveyType} />
      <UnitReportBody surveyType={surveyType} state={state} loadingLabel="Đang tải tiến độ thu phiếu...">
        {(report) => <ProgressContent surveyType={surveyType} report={report} />}
      </UnitReportBody>
    </div>
  );
};

const ProgressContent: React.FC<{ surveyType: UnitSurveyType; report: UnitSurveyReport }> = ({
  surveyType,
  report,
}) => {
  const isProgram = surveyType === 'PROGRAM';
  const noun = unitNounOf[surveyType];
  const [search, setSearch] = useState('');
  // Chỉ tiêu tỷ lệ phản hồi dùng chung với trang Tiến độ của học phần; đổi ở tab đó.
  const [targetRate, setTargetRate] = useState(COMPLETED_COMPLETION_RATE);
  useEffect(() => {
    if (isProgram) return;
    let cancelled = false;
    surveyApi.progressTarget()
      .then(({ responseRate }) => {
        if (!cancelled) setTargetRate(responseRate);
      })
      .catch(() => {
        // Không đọc được thì dùng mặc định.
      });
    return () => {
      cancelled = true;
    };
  }, [isProgram]);

  // Hết giờ thu phiếu thì đơn vị chưa tới chỉ tiêu không còn "đang thu" nữa.
  const collectionClosed = new Date(report.endTime).getTime() < Date.now();

  const items = useMemo((): ProgressItem[] => report.units.map((row: UnitReportRow) => {
    const target = row.targetCount ?? 0;
    const rate = target > 0 ? Math.round((row.responseCount / target) * 100) : 0;
    const status: ProgressStatus = isProgram
      ? (row.responseCount > 0 ? 'Đã có phiếu' : 'Chưa có phiếu')
      : rate >= targetRate
        ? 'Đạt chỉ tiêu'
        : collectionClosed
          ? 'Không đạt chỉ tiêu'
          : 'Đang thu';
    return {
      id: String(row.courseSectionSurveyId),
      facultyName: row.facultyName || 'Chưa gắn khoa',
      unitCode: row.unitCode,
      unitName: row.unitName,
      cohortName: row.cohortName,
      targetCount: target,
      actualCount: row.responseCount,
      rate,
      status,
    };
  }), [report, isProgram, targetRate, collectionClosed]);

  const totalTarget = items.reduce((sum, item) => sum + item.targetCount, 0);
  const totalActual = items.reduce((sum, item) => sum + item.actualCount, 0);
  const overallRate = Math.round((totalActual / (totalTarget || 1)) * 100);
  const completedCount = items.filter((item) => item.status === 'Đạt chỉ tiêu' || item.status === 'Đã có phiếu').length;
  const pendingStatus: ProgressStatus = collectionClosed ? 'Không đạt chỉ tiêu' : 'Đang thu';

  const searchKey = foldVietnamese(search);
  const filtered = items.filter((item) =>
    foldVietnamese([item.facultyName, item.unitCode, item.unitName, item.cohortName].join(' ')).includes(searchKey));

  const columns: Column<ProgressItem>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: isProgram ? '20%' : '34%',
      filterValue: (item) => item.facultyName,
      render: (item) => isProgram
        ? <span className="operations-primary-text">{item.facultyName}</span>
        : <strong className="operations-primary-text">{item.facultyName}</strong>,
    },
    ...(isProgram
      ? [
        {
          key: 'unitName',
          header: 'Ngành',
          width: '24%',
          filterValue: (item: ProgressItem) => item.unitName,
          render: (item: ProgressItem) => <strong className="operations-primary-text">{item.unitName}</strong>,
        },
        {
          key: 'unitCode',
          header: 'Khoá ngành',
          width: '10%',
          filterValue: (item: ProgressItem) => item.unitCode,
          render: (item: ProgressItem) => <span className="operations-code">{item.unitCode}</span>,
        },
        {
          key: 'cohortName',
          header: 'Khoá',
          width: '10%',
          filterValue: (item: ProgressItem) => item.cohortName,
          render: (item: ProgressItem) => <span className="operations-primary-text">{item.cohortName}</span>,
        },
      ]
      : [{
        key: 'targetCount',
        header: 'Tổng số phiếu phải thu',
        width: '10%',
        numeric: true,
        filterValue: (item: ProgressItem) => String(item.targetCount),
        render: (item: ProgressItem) => (
          <span className="operations-primary-text" style={{ justifyContent: 'flex-end' }}>{item.targetCount}</span>
        ),
      }]),
    {
      key: 'actualCount',
      header: 'Số phiếu đã thu',
      width: isProgram ? '12%' : '10%',
      numeric: true,
      filterValue: (item) => String(item.actualCount),
      render: (item) => (
        <span className="operations-primary-text" style={{ justifyContent: 'flex-end' }}>{item.actualCount}</span>
      ),
    },
    ...(isProgram
      ? []
      : [{
        key: 'progress',
        header: 'Tỷ lệ phản hồi (%)',
        width: '20%',
        numeric: true,
        filterValue: (item: ProgressItem) => String(item.rate),
        quickFilters: [
          { label: `Đạt chỉ tiêu (≥${targetRate}%)`, match: (value: string) => Number(value) >= targetRate },
          { label: `${pendingStatus} (<${targetRate}%)`, match: (value: string) => Number(value) < targetRate },
        ],
        render: (item: ProgressItem) => {
          const progressClass = item.status === 'Đạt chỉ tiêu'
            ? 'operations-progress-fill--success'
            : item.status === 'Đang thu'
              ? 'operations-progress-fill--warning'
              : '';
          return (
            <div className="operations-progress">
              <div className="operations-progress-meta">
                <strong>{item.rate}</strong>
                <span>{item.actualCount}/{item.targetCount} phiếu</span>
              </div>
              <div
                className="operations-progress-track"
                role="progressbar"
                aria-label={`Tiến độ ${item.rate}%`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(item.rate, 100)}
              >
                <div
                  className={`operations-progress-fill ${progressClass}`}
                  style={{ width: `${Math.min(item.rate, 100)}%` }}
                />
              </div>
            </div>
          );
        },
      }]),
    {
      key: 'status',
      header: 'Trạng thái',
      width: isProgram ? '14%' : '16%',
      filterValue: (item) => item.status,
      render: (item) => (
        <span className={`operations-status ${statusClassOf(item.status)}`}>{item.status}</span>
      ),
    },
  ];

  const exportColumns = [
    { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
    ...(isProgram
      ? [
        { key: 'unitName', header: 'Ngành', width: 28 },
        { key: 'unitCode', header: 'Khoá ngành', width: 12, align: 'left' as const },
        { key: 'cohortName', header: 'Khoá', width: 12 },
      ]
      : [{ key: 'targetCount', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const }]),
    { key: 'actualCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
    ...(isProgram
      ? []
      : [{ key: 'rate', header: 'Tỷ lệ phản hồi (%)', width: 12, type: 'number' as const, align: 'right' as const, numberFormat: '0' }]),
    { key: 'status', header: 'Trạng thái', width: 14, align: 'left' as const },
  ];

  return (
    <>
      <section className="operations-metrics" aria-label="Tổng quan tiến độ">
        {isProgram ? (
          <div className="operation-metric">
            <span className="operation-metric-icon"><UsersRound className="operation-icon" aria-hidden="true" /></span>
            <span className="operation-metric-label">Số khoá ngành được khảo sát</span>
            <strong className="operation-metric-value">{items.length.toLocaleString()}</strong>
            <span className="operation-metric-note">Không có sĩ số nên không có chỉ tiêu phiếu</span>
          </div>
        ) : (
          <div className="operation-metric">
            <span className="operation-metric-icon"><Target className="operation-icon" aria-hidden="true" /></span>
            <span className="operation-metric-label">Số phiếu dự kiến thu về</span>
            <strong className="operation-metric-value">{totalTarget.toLocaleString()}</strong>
            <span className="operation-metric-note">Theo số giảng viên của các khoa / viện</span>
          </div>
        )}
        <div className="operation-metric operation-metric--success">
          <span className="operation-metric-icon"><ClipboardCheck className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số phiếu đã thu</span>
          <strong className="operation-metric-value">{totalActual.toLocaleString()}</strong>
          <span className="operation-metric-note">
            {isProgram
              ? `${report.summary.validResponseCount.toLocaleString()} phiếu hợp lệ qua bộ lọc nhiễu`
              : `Tỷ lệ phản hồi đạt ${overallRate}% theo số phiếu dự kiến thu về`}
          </span>
        </div>
        <div className="operation-metric operation-metric--warning">
          <span className="operation-metric-icon"><CheckCircle2 className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">
            {isProgram ? 'Khoá ngành đã có phiếu' : `Khoa / viện đạt chỉ tiêu (≥ ${targetRate}%)`}
          </span>
          <strong className="operation-metric-value">{completedCount} / {items.length}</strong>
          <span className="operation-metric-note">
            {isProgram ? 'Khoá ngành có ít nhất một phiếu' : 'Khoa / viện đạt chỉ tiêu thu phiếu'}
          </span>
        </div>
        <div className="operation-metric">
          <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số ý kiến mở</span>
          <strong className="operation-metric-value">{report.comments.length.toLocaleString()}</strong>
          <span className="operation-metric-note">Ý kiến khác do {respondentNounOf[surveyType]} nhập</span>
        </div>
      </section>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={isProgram ? 'Tìm khoa/viện, khoá ngành, ngành hoặc khoá...' : 'Tìm khoa/viện...'}
        exportConfig={{
          fileName: `bao-cao-tien-do-thu-phieu-${report.surveyName}`,
          title: `BÁO CÁO TIẾN ĐỘ THU PHIẾU KHẢO SÁT ${surveyTypeLabels[surveyType].toUpperCase()}`,
          subtitle: 'Hệ thống Khảo sát & Đảm bảo Chất lượng Đào tạo VMU',
          breadcrumb: ['Tiến độ thu phiếu', surveyTypeLabels[surveyType]],
          info: {
            [`Tổng số ${noun} khảo sát`]: items.length,
            ...(isProgram ? {} : { 'Tổng số phiếu phải thu': totalTarget }),
            'Số phiếu đã thu': isProgram ? totalActual : `${totalActual} (đạt ${overallRate}%)`,
          },
          summaryNotes: isProgram
            ? ['Khảo sát chương trình đào tạo không có sĩ số nên không có tỷ lệ phản hồi.']
            : [
              'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu (số giảng viên của khoa).',
              `Chỉ tiêu tỷ lệ phản hồi: ${targetRate}%, chỉ dùng để gắn nhãn trạng thái.`,
            ],
          sheets: [{
            sheetName: 'Tien do',
            title: `TIẾN ĐỘ THU PHIẾU (${filtered.length} ${noun.toUpperCase()})`,
            columns: exportColumns,
            data: filtered,
          }],
        }}
        toolbarActions={isProgram ? undefined : (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 650 }}>
            <span style={{ whiteSpace: 'nowrap' }}>Tỷ lệ phản hồi (%)</span>
            <input
              type="number"
              value={targetRate}
              disabled
              title="Chỉ tiêu dùng chung với tab Học phần; đổi ở tab đó."
              style={{
                width: 80,
                minHeight: 34,
                padding: '6px 10px',
                border: '1px solid var(--field-border)',
                background: '#f4f6f8',
                color: '#000000',
                fontSize: 13,
                fontWeight: 400,
                textAlign: 'right',
              }}
            />
          </label>
        )}
        emptyMessage={`Chưa có ${noun} nào được phát phiếu khảo sát.`}
        keyExtractor={(item) => item.id}
        showIndex={false}
      />
    </>
  );
};
