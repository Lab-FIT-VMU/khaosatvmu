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
  Tiến độ thu phiếu của khảo sát giảng viên, dựng theo đúng trang Tiến độ của học phần.
  Không xét sĩ số nên không có tỷ lệ phản hồi hay chỉ tiêu: cột tỷ lệ nhường chỗ cho nhãn
  "Đã có phiếu / Chưa có phiếu", như CTĐT.
*/

type ProgressStatus = 'Đã có phiếu' | 'Chưa có phiếu';

interface ProgressItem {
  id: string;
  facultyName: string;
  actualCount: number;
  status: ProgressStatus;
}

const statusClassOf = (status: ProgressStatus): string =>
  status === 'Đã có phiếu' ? 'operations-status--success' : 'operations-status--danger';

export const LecturerProgressView: React.FC = () => {
  const state = useUnitSurveyReport('LECTURER');
  return (
    <div className="survey-operations-page operations-table-page survey-progress-page">
      <UnitReportToolbar surveyType="LECTURER" state={state} idPrefix="lecturer-progress" />
      <UnitScoringNote report={state.report} surveyType="LECTURER" />
      <UnitReportBody surveyType="LECTURER" state={state} loadingLabel="Đang tải tiến độ thu phiếu...">
        {(report) => <ProgressContent report={report} />}
      </UnitReportBody>
    </div>
  );
};

const ProgressContent: React.FC<{ report: UnitSurveyReport }> = ({ report }) => {
  const [search, setSearch] = useState('');

  const items = useMemo((): ProgressItem[] => report.units.map((row: UnitReportRow) => ({
    id: String(row.courseSectionSurveyId),
    facultyName: row.unitName || row.facultyName || 'Chưa gắn khoa',
    actualCount: row.responseCount,
    status: row.responseCount > 0 ? 'Đã có phiếu' : 'Chưa có phiếu',
  })), [report]);

  const totalActual = items.reduce((sum, item) => sum + item.actualCount, 0);
  const completedCount = items.filter((item) => item.status === 'Đã có phiếu').length;

  const searchKey = foldVietnamese(search);
  const filtered = items.filter((item) =>
    foldVietnamese(item.facultyName).includes(searchKey));

  const columns: Column<ProgressItem>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: '50%',
      filterValue: (item) => item.facultyName,
      render: (item) => <strong className="operations-primary-text">{item.facultyName}</strong>,
    },
    {
      key: 'actualCount',
      header: 'Số phiếu đã thu',
      width: '20%',
      numeric: true,
      filterValue: (item) => String(item.actualCount),
      render: (item) => (
        <span className="operations-primary-text" style={{ justifyContent: 'flex-end' }}>{item.actualCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '20%',
      filterValue: (item) => item.status,
      render: (item) => (
        <span className={`operations-status ${statusClassOf(item.status)}`}>{item.status}</span>
      ),
    },
  ];

  const exportColumns = [
    { key: 'facultyName', header: 'Khoa / Viện', width: 24 },
    { key: 'actualCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
    { key: 'status', header: 'Trạng thái', width: 14, align: 'left' as const },
  ];

  return (
    <>
      <section className="operations-metrics" aria-label="Tổng quan tiến độ">
        <div className="operation-metric">
          <span className="operation-metric-icon"><UsersRound className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số khoa / viện được khảo sát</span>
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
          <span className="operation-metric-label">Khoa / viện đã có phiếu</span>
          <strong className="operation-metric-value">{completedCount} / {items.length}</strong>
          <span className="operation-metric-note">Khoa / viện có ít nhất một phiếu</span>
        </div>
        <div className="operation-metric">
          <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
          <span className="operation-metric-label">Số ý kiến mở</span>
          <strong className="operation-metric-value">{report.comments.length.toLocaleString()}</strong>
          <span className="operation-metric-note">Ý kiến khác do giảng viên nhập</span>
        </div>
      </section>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tìm khoa/viện..."
        exportConfig={{
          fileName: `bao-cao-tien-do-thu-phieu-${report.surveyName}`,
          title: 'BÁO CÁO TIẾN ĐỘ THU PHIẾU KHẢO SÁT GIẢNG VIÊN',
          subtitle: 'Hệ thống Khảo sát & Đảm bảo Chất lượng Đào tạo VMU',
          breadcrumb: ['Tiến độ thu phiếu', 'Giảng viên'],
          info: {
            'Tổng số khoa / viện khảo sát': items.length,
            'Số phiếu đã thu': totalActual,
          },
          summaryNotes: ['Khảo sát giảng viên không xét sĩ số nên không có tỷ lệ phản hồi.'],
          sheets: [{
            sheetName: 'Tien do',
            title: `TIẾN ĐỘ THU PHIẾU (${filtered.length} KHOA / VIỆN)`,
            columns: exportColumns,
            data: filtered,
          }],
        }}
        emptyMessage="Chưa có khoa / viện nào được phát phiếu khảo sát."
        keyExtractor={(item) => item.id}
        showIndex={false}
      />
    </>
  );
};
