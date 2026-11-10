import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  RadioTower,
} from 'lucide-react';
import { canAccessModule } from '../auth/modulePermissions';
import { unitStatisticsTabId } from '../components/surveyStatisticsTabs';
import { messageFrom, type UnitSurveyType } from '../components/unitReports/unitReportModel';
import { useSemester } from '../context/semesterContext';
import { surveyApi } from '../services/surveyApi';
import type {
  CourseSectionSurvey,
  SemesterSurvey,
} from '../types';
import '../styles/dashboard.css';
import '../styles/survey-statistics.css';

/*
  Bảng điều khiển chung của ba loại khảo sát: học phần, chương trình đào tạo, giảng viên.
  Trước là ba trang riêng giống hệt nhau, chỉ khác loại; giờ gộp vào một bảng, phân biệt
  bằng cột Phân loại. CTĐT và giảng viên không có sĩ số nên cột tiến độ chỉ in số phiếu
  hợp lệ, không có thanh tiến độ.
*/

interface DashboardOverviewProps {
  semesterSurveys: SemesterSurvey[];
  sectionSurveys: CourseSectionSurvey[];
  surveyLoading: boolean;
  surveyLoadError: string | null;
  onNavigateTab: (tab: string) => void;
  permissions?: readonly string[];
  /**
   * Có hiện đợt khảo sát CTĐT / giảng viên không. Chỉ quản trị toàn trường xem được hai
   * loại này (backend cũng chỉ trả số liệu cho họ); mỗi loại còn đòi quyền
   * PROGRAM_DASHBOARD_ACCESS / LECTURER_DASHBOARD_ACCESS.
   */
  showUnitSurveys?: boolean;
}

type CampaignStatus = 'Sắp diễn ra' | 'Đang diễn ra' | 'Đã kết thúc';

interface DashboardCampaign {
  key: string;
  title: string;
  semester: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  typeLabel: string;
  /** Dòng phụ dưới tên đợt, ví dụ "12 lớp" hay "8 khoá ngành". */
  unitLabel: string;
  actualResponses: number;
  /** Sĩ số cần thu; null với loại không xét sĩ số. */
  targetResponses: number | null;
  /** Trang Danh sách bài khảo sát, mở thẳng vào tab của loại này. */
  campaignTab: string;
}

const unitSurveyKinds: {
  surveyType: UnitSurveyType;
  typeLabel: string;
  unitNoun: string;
  campaignTab: string;
}[] = [
  { surveyType: 'PROGRAM', typeLabel: 'Chương trình đào tạo', unitNoun: 'khoá ngành', campaignTab: 'program-campaigns' },
  { surveyType: 'LECTURER', typeLabel: 'Giảng viên', unitNoun: 'khoa / viện', campaignTab: 'lecturer-campaigns' },
];

const formatDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN');
};

const statusOf = (startTime: string, endTime: string, now: number): CampaignStatus => {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (Number.isFinite(start) && now < start) return 'Sắp diễn ra';
  if (Number.isFinite(end) && now > end) return 'Đã kết thúc';
  return 'Đang diễn ra';
};

const statusClass = (status: CampaignStatus) =>
  status === 'Đang diễn ra' ? 'is-active' : status === 'Sắp diễn ra' ? 'is-upcoming' : 'is-complete';

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  semesterSurveys,
  sectionSurveys,
  surveyLoading,
  surveyLoadError,
  onNavigateTab,
  permissions,
  showUnitSurveys = false,
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

  const visibleUnitKinds = useMemo(
    () => (showUnitSurveys
      ? unitSurveyKinds.filter(({ surveyType }) =>
          canAccessModule(permissions, unitStatisticsTabId(surveyType, 'overview')))
      : []),
    [permissions, showUnitSurveys],
  );

  // Đợt CTĐT / giảng viên của học kỳ đang chọn. Một đợt chỉ vài chục đơn vị nên nạp đơn vị
  // của từng đợt để có số phiếu hợp lệ.
  const [unitCampaigns, setUnitCampaigns] = useState<DashboardCampaign[]>([]);
  const [unitLoading, setUnitLoading] = useState(false);
  const [unitLoadError, setUnitLoadError] = useState<string | null>(null);

  useEffect(() => {
    setUnitCampaigns([]);
    setUnitLoadError(null);
    if (!activeSemesterId || visibleUnitKinds.length === 0) {
      setUnitLoading(false);
      return;
    }
    const controller = new AbortController();
    setUnitLoading(true);
    const load = async () => {
      try {
        const now = Date.now();
        const perKind = await Promise.all(visibleUnitKinds.map(async (kind) => {
          const surveys = await surveyApi.semesterSurveys(activeSemesterId, controller.signal, kind.surveyType);
          const units = await Promise.all(
            surveys.map((survey) => surveyApi.surveyUnits(survey.semesterSurveyId, controller.signal)),
          );
          return surveys.map((survey, index): DashboardCampaign => ({
            key: `${kind.surveyType}-${survey.semesterSurveyId}`,
            title: survey.surveyName,
            semester: survey.semesterName,
            academicYear: survey.academicYearName,
            startDate: survey.startTime,
            endDate: survey.endTime,
            status: statusOf(survey.startTime, survey.endTime, now),
            typeLabel: kind.typeLabel,
            unitLabel: `${survey.sectionSurveyCount} ${kind.unitNoun}`,
            actualResponses: units[index].reduce((sum, unit) => sum + unit.validResponseCount, 0),
            targetResponses: null,
            campaignTab: kind.campaignTab,
          }));
        }));
        setUnitCampaigns(perKind.flat());
      } catch (error) {
        if (!controller.signal.aborted) setUnitLoadError(messageFrom(error));
      } finally {
        if (!controller.signal.aborted) setUnitLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeSemesterId, visibleUnitKinds]);

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

  // Đợt học phần dựng từ dữ liệu đã tải sẵn, gộp lớp bằng một danh sách chứ không gọi API
  // theo từng đợt; sau đó nối đợt CTĐT / giảng viên vào cuối.
  const displayedCampaigns = useMemo(() => {
    const sectionsBySurvey = new Map<number, CourseSectionSurvey[]>();
    sectionSurveys.forEach((section) => {
      const sections = sectionsBySurvey.get(section.semesterSurveyId) ?? [];
      sections.push(section);
      sectionsBySurvey.set(section.semesterSurveyId, sections);
    });

    const now = Date.now();
    const courseCampaigns = currentSemesterSurveys.map((survey): DashboardCampaign => {
      const sections = sectionsBySurvey.get(survey.semesterSurveyId) ?? [];
      return {
        key: `COURSE-${survey.semesterSurveyId}`,
        title: survey.surveyName,
        semester: survey.semesterName,
        academicYear: survey.academicYearName,
        startDate: survey.startTime,
        endDate: survey.endTime,
        status: statusOf(survey.startTime, survey.endTime, now),
        typeLabel: 'Học phần',
        unitLabel: `${sections.length} lớp`,
        actualResponses: sections.reduce((sum, section) => sum + section.validResponseCount, 0),
        targetResponses: sections.reduce((sum, section) => sum + section.classSize, 0),
        campaignTab: 'course-campaigns',
      };
    });
    return [...courseCampaigns, ...unitCampaigns];
  }, [currentSemesterSurveys, sectionSurveys, unitCampaigns]);

  const loading = surveyLoading || unitLoading;
  const loadError = [surveyLoadError, unitLoadError].filter(Boolean).join(' · ') || null;

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
              {loading ? 'Đang tải...' : `${displayedCampaigns.length} đợt khảo sát`}
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <LoaderCircle className="auth-spin" aria-hidden="true" />
                    <strong>Đang nạp các đợt khảo sát</strong>
                    <span>Hệ thống đang tổng hợp tiến độ phiếu hợp lệ của học kỳ.</span>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Một loại lỗi không che mất đợt của các loại còn lại. */}
                  {loadError && (
                    <tr>
                      <td colSpan={6} className="dashboard-empty-cell">
                        <CircleAlert aria-hidden="true" />
                        <strong>Không tải được dữ liệu đợt khảo sát</strong>
                        <span>{loadError}</span>
                      </td>
                    </tr>
                  )}
                  {!loadError && displayedCampaigns.length === 0 && (
                    <tr>
                      <td colSpan={6} className="dashboard-empty-cell">
                        <RadioTower aria-hidden="true" />
                        <strong>Chưa có đợt khảo sát đang mở</strong>
                        <span>Các đợt khảo sát mới sẽ xuất hiện tại đây.</span>
                      </td>
                    </tr>
                  )}
                  {displayedCampaigns.map((campaign) => {
                    const target = campaign.targetResponses;
                    const progress = target !== null && target > 0
                      ? Math.min(100, Math.round((campaign.actualResponses / target) * 100))
                      : 0;
                    return (
                      <tr
                        key={campaign.key}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onNavigateTab(campaign.campaignTab)}
                      >
                        <td className="dashboard-campaign-name">
                          <strong title={campaign.title}>{campaign.title}</strong>
                          <span>
                            {campaign.semester} · {campaign.academicYear} · {campaign.unitLabel}
                          </span>
                        </td>
                        <td>
                          <span className="dashboard-type-label">{campaign.typeLabel}</span>
                        </td>
                        <td className="dashboard-date-cell">
                          {formatDate(campaign.startDate)}
                          <span aria-hidden="true"> - </span>
                          {formatDate(campaign.endDate)}
                        </td>
                        <td>
                          {target !== null ? (
                            <div
                              className="dashboard-progress"
                              aria-label={`Đã thu ${campaign.actualResponses} trên ${target} phiếu, đạt ${progress}%`}
                            >
                              <div className="dashboard-progress-track" aria-hidden="true">
                                <span style={{ width: `${progress}%` }} />
                              </div>
                              <span className="dashboard-progress-value">
                                {campaign.actualResponses.toLocaleString('vi-VN')}
                                <small> / {target.toLocaleString('vi-VN')}</small>
                              </span>
                            </div>
                          ) : (
                            // Không có sĩ số: chỉ có số phiếu hợp lệ, không có thanh tiến độ.
                            <div
                              className="dashboard-progress"
                              aria-label={`Đã thu ${campaign.actualResponses} phiếu hợp lệ`}
                            >
                              <span className="dashboard-progress-value">
                                {campaign.actualResponses.toLocaleString('vi-VN')}
                                <small> phiếu hợp lệ</small>
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`dashboard-status ${statusClass(campaign.status)}`}>
                            <span aria-hidden="true" />
                            {campaign.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="executive-action-link"
                            aria-label={`Vào đợt khảo sát ${campaign.title}`}
                            title="Vào đợt khảo sát"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateTab(campaign.campaignTab);
                            }}
                          >
                            Vào khảo sát
                            <ChevronRight style={{ width: 14, height: 14 }} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
