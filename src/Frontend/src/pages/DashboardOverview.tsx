import React, { useEffect, useMemo } from 'react';
import {
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  RadioTower,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import type {
  CourseSectionSurvey,
  SemesterSurvey,
} from '../types';
import '../styles/dashboard.css';
import '../styles/survey-statistics.css';

interface DashboardOverviewProps {
  semesterSurveys: SemesterSurvey[];
  sectionSurveys: CourseSectionSurvey[];
  surveyLoading: boolean;
  surveyLoadError: string | null;
  onNavigateTab: (tab: string) => void;
  permissions?: readonly string[];
}

const formatDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN');
};

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  semesterSurveys,
  sectionSurveys,
  surveyLoading,
  surveyLoadError,
  onNavigateTab,
}) => {
  const { academicYears, activeSemesterId, setActiveSemesterId } = useSemester();

  // Tự động chọn học kỳ có đợt khảo sát nếu chưa chọn
  useEffect(() => {
    if (!activeSemesterId && semesterSurveys.length > 0) {
      const firstWithSurvey = semesterSurveys[0].semesterId;
      if (firstWithSurvey) {
        setActiveSemesterId(firstWithSurvey);
      }
    }
  }, [activeSemesterId, semesterSurveys, setActiveSemesterId]);

  const currentSemesterSurveys = useMemo(
    () => (activeSemesterId ? semesterSurveys.filter((survey) => survey.semesterId === activeSemesterId) : semesterSurveys),
    [activeSemesterId, semesterSurveys],
  );

  const semesterOptions = useMemo(
    () =>
      academicYears.flatMap((year) =>
        year.semesters.map((semester) => ({
          value: String(semester.semesterId),
          label: `${semester.semesterName} · ${year.academicYearName}`,
        }))
      ),
    [academicYears],
  );

  // Dựng các đợt từ dữ liệu backend thật; gộp lớp bằng một danh sách đã tải sẵn, không gọi API theo từng đợt.
  const displayedCampaigns = useMemo(() => {
    const sectionsBySurvey = new Map<number, CourseSectionSurvey[]>();
    sectionSurveys.forEach((section) => {
      const sections = sectionsBySurvey.get(section.semesterSurveyId) ?? [];
      sections.push(section);
      sectionsBySurvey.set(section.semesterSurveyId, sections);
    });

    const now = Date.now();
    return currentSemesterSurveys.map((survey) => {
      const sections = sectionsBySurvey.get(survey.semesterSurveyId) ?? [];
      const start = new Date(survey.startTime).getTime();
      const end = new Date(survey.endTime).getTime();
      const status = Number.isFinite(start) && now < start
        ? 'Sắp diễn ra'
        : Number.isFinite(end) && now > end
          ? 'Đã kết thúc'
          : 'Đang diễn ra';
      return {
        id: survey.semesterSurveyId,
        title: survey.surveyName,
        semester: survey.semesterName,
        academicYear: survey.academicYearName,
        startDate: survey.startTime,
        endDate: survey.endTime,
        status,
        totalTargetResponses: sections.reduce((sum, section) => sum + section.classSize, 0),
        actualResponses: sections.reduce((sum, section) => sum + section.validResponseCount, 0),
        sectionCount: sections.length,
      };
    });
  }, [currentSemesterSurveys, sectionSurveys]);

  return (
    <div className="executive-dashboard">
      <section className="statistics-toolbar" aria-label="Bộ lọc bảng điều khiển">
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
      </section>

      {/* ĐỢT KHẢO SÁT ĐANG MỞ (CAMPAIGNS) */}
      <section className="dashboard-block dashboard-campaigns" aria-labelledby="dashboard-campaigns-title">
        <header className="dashboard-block-heading dashboard-campaigns-heading">
          <div>
            <h2 id="dashboard-campaigns-title">Đợt khảo sát đang tiếp nhận phản hồi</h2>
            <p>Theo dõi tiến độ phát phiếu và điều hướng trực tiếp tới từng đợt khảo sát</p>
          </div>
          <div className="dashboard-heading-actions">
            <span className="dashboard-result-count">
              {surveyLoading ? 'Đang tải...' : `${displayedCampaigns.length} đợt khảo sát`}
            </span>
          </div>
        </header>

        <div className="dashboard-table-scroll">
          <table className="dashboard-campaign-table">
            <thead>
              <tr>
                <th scope="col">Đợt khảo sát</th>
                <th scope="col">Phân loại</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Tiến độ thu phiếu</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {surveyLoading ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <LoaderCircle className="auth-spin" aria-hidden="true" />
                    <strong>Đang nạp các đợt khảo sát</strong>
                    <span>Hệ thống đang tổng hợp tiến độ phiếu hợp lệ của học kỳ.</span>
                  </td>
                </tr>
              ) : surveyLoadError ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <CircleAlert aria-hidden="true" />
                    <strong>Không tải được dữ liệu đợt khảo sát</strong>
                    <span>{surveyLoadError}</span>
                  </td>
                </tr>
              ) : displayedCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <RadioTower aria-hidden="true" />
                    <strong>Chưa có đợt khảo sát đang mở</strong>
                    <span>Các đợt khảo sát mới sẽ xuất hiện tại đây.</span>
                  </td>
                </tr>
              ) : (
                displayedCampaigns.map((campaign) => {
                  const progress = campaign.totalTargetResponses > 0
                    ? Math.min(100, Math.round(
                        (campaign.actualResponses / campaign.totalTargetResponses) * 100,
                      ))
                    : 0;
                  return (
                    <tr
                      key={campaign.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onNavigateTab('course-campaigns')}
                    >
                      <td className="dashboard-campaign-name">
                        <strong title={campaign.title}>{campaign.title}</strong>
                        <span>
                          {campaign.semester} · {campaign.academicYear} · {campaign.sectionCount} lớp
                        </span>
                      </td>
                      <td>
                        <span className="dashboard-type-label">Học phần</span>
                      </td>
                      <td className="dashboard-date-cell">
                        {formatDate(campaign.startDate)}
                        <span aria-hidden="true"> - </span>
                        {formatDate(campaign.endDate)}
                      </td>
                      <td>
                        <div
                          className="dashboard-progress"
                          aria-label={`Đã thu ${campaign.actualResponses} trên ${campaign.totalTargetResponses} phiếu, đạt ${progress}%`}
                        >
                          <div className="dashboard-progress-track" aria-hidden="true">
                            <span style={{ width: `${progress}%` }} />
                          </div>
                          <span className="dashboard-progress-value">
                            {campaign.actualResponses.toLocaleString('vi-VN')}
                            <small> / {campaign.totalTargetResponses.toLocaleString('vi-VN')}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`dashboard-status ${campaign.status === 'Đang diễn ra' ? 'is-active' : campaign.status === 'Sắp diễn ra' ? 'is-upcoming' : 'is-complete'}`}>
                          <span aria-hidden="true" />
                          {campaign.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="executive-action-link"
                          aria-label={`Vào đợt khảo sát ${campaign.title}`}
                          title="Vào đợt khảo sát"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateTab('course-campaigns');
                          }}
                        >
                          Vào khảo sát
                          <ChevronRight style={{ width: 14, height: 14 }} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
