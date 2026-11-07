import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  MessageSquareText,
  UsersRound,
} from 'lucide-react';
import { DataTable, type Column } from '../DataTable';
import type { UnitReportRow, UnitSurveyReport } from '../../types';
import { foldVietnamese } from '../../utils/vietnamese';
import { UnitReportBody, UnitReportToolbar, UnitScoringNote } from '../unitReports/UnitReportFrame';
import { useUnitSurveyReport } from '../unitReports/unitReportModel';
import '../../styles/survey-operations.css';
import '../../styles/survey-statistics.css';
import '../../styles/catalogs.css';

/*
  Tiến độ thu phiếu của khảo sát chương trình đào tạo, dựng theo đúng trang Tiến độ của
  học phần. CTĐT không có sĩ số nên không có tỷ lệ phản hồi hay chỉ tiêu: cột tỷ lệ nhường
  chỗ cho nhãn "Đã có phiếu / Chưa có phiếu".
*/

type ProgressStatus = 'Đã có phiếu' | 'Chưa có phiếu';

interface ProgressItem {
  id: string;
  facultyName: string;
  unitCode: string;
  unitName: string;
  cohortName: string;
  actualCount: number;
  status: ProgressStatus;
}

const statusClassOf = (status: ProgressStatus): string =>
  status === 'Đã có phiếu' ? 'operations-status--success' : 'operations-status--danger';

export const ProgramProgressView: React.FC = () => {
  const state = useUnitSurveyReport('PROGRAM');
  return (
    <div className="survey-operations-page operations-table-page survey-progress-page">
      <UnitReportToolbar surveyType="PROGRAM" state={state} idPrefix="program-progress" />
      <UnitScoringNote report={state.report} surveyType="PROGRAM" />
      <UnitReportBody surveyType="PROGRAM" state={state} loadingLabel="Đang tải tiến độ thu phiếu...">
        {(report) => <ProgressContent report={report} />}
      </UnitReportBody>
    </div>
  );
};

const ProgressContent: React.FC<{ report: UnitSurveyReport }> = ({ report }) => {
  const [search, setSearch] = useState('');

  const items = useMemo((): ProgressItem[] => report.units.map((row: UnitReportRow) => ({
    id: String(row.courseSectionSurveyId),
    facultyName: row.facultyName || 'Chưa gắn khoa',
    unitCode: row.unitCode,
    unitName: row.unitName,
    cohortName: row.cohortName,
    actualCount: row.responseCount,
    status: row.responseCount > 0 ? 'Đã có phiếu' : 'Chưa có phiếu',
  })), [report]);

  const totalActual = items.reduce((sum, item) => sum + item.actualCount, 0);
  const completedCount = items.filter((item) => item.status === 'Đã có phiếu').length;

  const searchKey = foldVietnamese(search);
  const filtered = items.filter((item) =>
    foldVietnamese([item.facultyName, item.unitCode, item.unitName, item.cohortName].join(' ')).includes(searchKey));

  const columns: Column<ProgressItem>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: '20%',
      filterValue: (item) => item.facultyName,
      render: (item) => <span className="operations-primary-text">{item.facultyName}</span>,
    },
    {
      key: 'unitName',
      header: 'Ngành',
      width: '24%',
      filterValue: (item) => item.unitName,
      render: (item) => <strong className="operations-primary-text">{item.unitName}</strong>,
    },
    {
      key: 'unitCode',
      header: 'Khoá ngành',
      width: '10%',
      filterValue: (item) => item.unitCode,
      render: (item) => <span className="operations-code">{item.unitCode}</span>,
    },
    {
      key: 'cohortName',
      header: 'Khoá',
      width: '10%',
      filterValue: (item) => item.cohortName,
      render: (item) => <span className="operations-primary-text">{item.cohortName}</span>,
    },
    {
      key: 'actualCount',
      header: 'Số phiếu đã thu',
      width: '12%',
      numeric: true,
      filterValue: (item) => String(item.actualCount),
      render: (item) => (
        <span className="operations-primary-text" style={{ justifyContent: 'flex-end' }}>{item.actualCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '14%',
      filterValue: (item) => item.status,
      render: (item) => (
        <span className={`operations-status ${statusClassOf(item.status)}`}>{item.status}</span>
      ),
    },
  ];

  const exportColumns = [
    { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
    { key: 'unitName', header: 'Ngành', width: 28 },
    { key: 'unitCode', header: 'Khoá ngành', width: 12, align: 'left' as const },
    { key: 'cohortName', header: 'Khoá', width: 12 },
    { key: 'actualCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
    { key: 'status', header: 'Trạng thái', width: 14, align: 'left' as const },
  ];

  return (
    <>
      <section className="operations-metrics" aria-label="Tổng quan tiến độ">
        <div className="operation-metric">
          <span className="operation-metric-icon"><UsersRound className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số khoá ngành được khảo sát</span>
          <strong className="operation-metric-value">{items.length.toLocaleString()}</strong>
          <span className="operation-metric-note">Không có sĩ số nên không có chỉ tiêu phiếu</span>
        </div>
        <div className="operation-metric operation-metric--success">
          <span className="operation-metric-icon"><ClipboardCheck className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số phiếu đã thu</span>
          <strong className="operation-metric-value">{totalActual.toLocaleString()}</strong>
          <span className="operation-metric-note">
            {`${report.summary.validResponseCount.toLocaleString()} phiếu hợp lệ qua bộ lọc nhiễu`}
          </span>
        </div>
        <div className="operation-metric operation-metric--warning">
          <span className="operation-metric-icon"><CheckCircle2 className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Khoá ngành đã có phiếu</span>
          <strong className="operation-metric-value">{completedCount} / {items.length}</strong>
          <span className="operation-metric-note">Khoá ngành có ít nhất một phiếu</span>
        </div>
        <div className="operation-metric">
          <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số ý kiến mở</span>
          <strong className="operation-metric-value">{report.comments.length.toLocaleString()}</strong>
          <span className="operation-metric-note">Ý kiến khác do người học nhập</span>
        </div>
      </section>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm khoa/viện, khoá ngành, ngành hoặc khoá..."
        exportConfig={{
          fileName: `bao-cao-tien-do-thu-phieu-${report.surveyName}`,
          title: 'BÁO CÁO TIẾN ĐỘ THU PHIẾU KHẢO SÁT CHƯƠNG TRÌNH ĐÀO TẠO',
          subtitle: 'Hệ thống Khảo sát & Đảm bảo Chất lượng Đào tạo VMU',
          breadcrumb: ['Tiến độ thu phiếu', 'Chương trình đào tạo'],
          info: {
            'Tổng số khoá ngành khảo sát': items.length,
            'Số phiếu đã thu': totalActual,
          },
          summaryNotes: ['Khảo sát chương trình đào tạo không có sĩ số nên không có tỷ lệ phản hồi.'],
          sheets: [{
            sheetName: 'Tien do',
            title: `TIẾN ĐỘ THU PHIẾU (${filtered.length} KHOÁ NGÀNH)`,
            columns: exportColumns,
            data: filtered,
          }],
        }}
        emptyMessage="Chưa có khoá ngành nào được phát phiếu khảo sát."
        keyExtractor={(item) => item.id}
        showIndex={false}
      />
    </>
  );
};
