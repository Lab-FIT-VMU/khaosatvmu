import React, { type ReactNode } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { ScoringConfigNote } from '../ScoringConfigNote';
import { useSemester } from '../../context/semesterContext';
import { surveyTypeLabels } from '../../services/surveyApi';
import type { UnitSurveyReport } from '../../types';
import { campaignPlaceholder } from '../../utils/surveySelection';
import { CampaignSelect } from './CampaignSelect';
import {
  unitNounOf,
  useSemesterOptions,
  type UnitReportState,
  type UnitSurveyType,
} from './unitReportModel';

/*
  Khung chung của các trang thống kê CTĐT / giảng viên, dựng đúng như trang học phần:
  thanh chọn Học kỳ · Đợt khảo sát ở góc trái trên, dòng cấu hình tính điểm ngay dưới,
  rồi các trạng thái đang tải / lỗi / trống dùng cùng lớp CSS.
*/

interface UnitReportToolbarProps {
  surveyType: UnitSurveyType;
  state: UnitReportState;
  idPrefix: string;
  /** Nút bên phải thanh công cụ, như Xuất báo cáo của trang học phần. */
  actions?: ReactNode;
}

export const UnitReportToolbar: React.FC<UnitReportToolbarProps> = ({
  surveyType,
  state,
  idPrefix,
  actions,
}) => {
  const { activeSemesterId, setActiveSemesterId } = useSemester();
  const semesterOptions = useSemesterOptions();

  return (
    <section className="statistics-toolbar">
      <label className="form-group">
        <span>Học kỳ</span>
        <select
          value={activeSemesterId ?? ''}
          onChange={(event) =>
            setActiveSemesterId(event.target.value ? Number(event.target.value) : null)
          }
        >
          <option value="">Chọn học kỳ</option>
          {semesterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="form-group">
        <span>Đợt khảo sát</span>
        <CampaignSelect
          id={`${idPrefix}-campaign-select`}
          value={state.selectedId}
          onChange={state.setSelectedId}
          disabled={state.surveys.length === 0}
          placeholder={campaignPlaceholder(state.surveysLoading, state.surveys.length)}
          options={state.surveys.map((survey) => ({
            value: String(survey.semesterSurveyId),
            label: `${survey.surveyName} · ${survey.sectionSurveyCount} ${unitNounOf[surveyType]}`,
          }))}
        />
      </div>

      {actions && <div className="statistics-toolbar-actions">{actions}</div>}
    </section>
  );
};

/**
 * Dòng cấu hình tính điểm, cùng thành phần với trang học phần nhưng câu chữ theo loại:
 * CTĐT không có sĩ số nên chỉ có tiêu chí phiếu hợp lệ.
 */
export const UnitScoringNote: React.FC<{ report: UnitSurveyReport | null; surveyType: UnitSurveyType }> = ({
  report,
  surveyType,
}) => (
  <ScoringConfigNote>
    {report === null ? undefined : surveyType === 'PROGRAM' ? (
      <>
        Số liệu chỉ sử dụng phiếu của các khoá ngành hợp lệ (tỷ lệ phiếu hợp lệ ≥{' '}
        <strong>{report.minimumValidRate}%</strong>). Khảo sát chương trình đào tạo không có sĩ số
        nên không xét tỷ lệ phản hồi. Số liệu tính trực tiếp từ phiếu, không cần Cập nhật điểm.
      </>
    ) : (
      <>
        Số liệu chỉ sử dụng phiếu của các khoa/viện hợp lệ (đảm bảo hai tiêu chí: tỷ lệ phản hồi ≥{' '}
        <strong>{report.minimumResponseRate}%</strong> và tỷ lệ phiếu hợp lệ ≥{' '}
        <strong>{report.minimumValidRate}%</strong>). Sĩ số là số giảng viên của khoa, chốt lúc tạo
        đợt. Số liệu tính trực tiếp từ phiếu, không cần Cập nhật điểm.
      </>
    )}
  </ScoringConfigNote>
);

interface UnitReportBodyProps {
  surveyType: UnitSurveyType;
  state: UnitReportState;
  loadingLabel: string;
  children: (report: UnitSurveyReport) => ReactNode;
}

/** Báo lỗi, đang tải và màn trống theo đúng lớp CSS của trang học phần. */
export const UnitReportBody: React.FC<UnitReportBodyProps> = ({
  surveyType,
  state,
  loadingLabel,
  children,
}) => (
  <>
    {state.error && (
      <div className="admin-alert" role="alert">
        <CircleAlert aria-hidden="true" />
        <span>{state.error}</span>
      </div>
    )}

    {state.loading || state.surveysLoading ? (
      <div className="operations-empty" role="status">
        <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
        <strong>{loadingLabel}</strong>
      </div>
    ) : !state.selectedId ? (
      <div className="operations-empty">
        <strong>
          {state.surveys.length === 0
            ? `Học kỳ này chưa có đợt khảo sát ${surveyTypeLabels[surveyType].toLowerCase()} nào.`
            : 'Chọn học kỳ và đợt khảo sát để xem số liệu.'}
        </strong>
      </div>
    ) : state.report === null ? (
      state.error ? null : (
        <div className="operations-empty">
          <strong>Đợt này chưa có số liệu.</strong>
        </div>
      )
    ) : (
      children(state.report)
    )}
  </>
);
