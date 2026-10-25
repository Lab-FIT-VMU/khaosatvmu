import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, LoaderCircle, RadioTower } from 'lucide-react';
import { useSemester } from '../../context/semesterContext';
import { surveyApi, surveyTypeLabels } from '../../services/surveyApi';
import type { SemesterSurvey, SurveyUnit } from '../../types';
import { messageFrom, unitNounOf, useSemesterOptions, type UnitSurveyType } from './unitReportModel';
import '../../styles/dashboard.css';
import '../../styles/survey-statistics.css';

/*
  Bảng điều khiển của CTĐT / giảng viên, dựng theo đúng bảng "Đợt khảo sát đang tiếp nhận
  phản hồi" của tab học phần. Khảo sát giảng viên có sĩ số nên tiến độ là phiếu hợp lệ trên
  tổng sĩ số; CTĐT không có sĩ số nên cột tiến độ chỉ in số phiếu hợp lệ.
*/

const formatDate = (value: string) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN');
};

/** Hash của trang Danh sách đợt khảo sát, mở thẳng vào tab của loại. */
const campaignTabOf: Record<UnitSurveyType, string> = {
  PROGRAM: 'program-campaigns',
  LECTURER: 'lecturer-campaigns',
};

interface UnitDashboardViewProps {
  surveyType: UnitSurveyType;
  onNavigateTab: (tab: string) => void;
}

export const UnitDashboardView: React.FC<UnitDashboardViewProps> = ({ surveyType, onNavigateTab }) => {
  const { activeSemesterId, setActiveSemesterId } = useSemester();
  const semesterOptions = useSemesterOptions();
  const [surveys, setSurveys] = useState<SemesterSurvey[]>([]);
  const [unitsBySurvey, setUnitsBySurvey] = useState<Record<number, SurveyUnit[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setSurveys([]);
    setUnitsBySurvey({});
    if (!activeSemesterId) return;
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      try {
        const next = await surveyApi.semesterSurveys(activeSemesterId, controller.signal, surveyType);
        // Một đợt chỉ vài chục đơn vị nên nạp đơn vị của từng đợt để có số phiếu hợp lệ và sĩ số.
        const units = await Promise.all(
          next.map((survey) => surveyApi.surveyUnits(survey.semesterSurveyId, controller.signal)),
        );
        setSurveys(next);
        setUnitsBySurvey(Object.fromEntries(next.map((survey, index) => [survey.semesterSurveyId, units[index]])));
        setLoadError(null);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(messageFrom(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [activeSemesterId, surveyType]);

  const campaigns = useMemo(() => {
    const now = Date.now();
    return surveys.map((survey) => {
      const units = unitsBySurvey[survey.semesterSurveyId] ?? [];
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
        target: surveyType === 'LECTURER'
          ? units.reduce((sum, unit) => sum + (unit.targetCount ?? 0), 0)
          : null,
        actual: units.reduce((sum, unit) => sum + unit.validResponseCount, 0),
        unitCount: survey.sectionSurveyCount,
      };
    });
  }, [surveys, unitsBySurvey, surveyType]);

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

      <section className="dashboard-block dashboard-campaigns" aria-labelledby="unit-dashboard-campaigns-title">
        <header className="dashboard-block-heading dashboard-campaigns-heading">
          <div>
            <h2 id="unit-dashboard-campaigns-title">Đợt khảo sát đang tiếp nhận phản hồi</h2>
            <p>Theo dõi tiến độ phát phiếu và điều hướng trực tiếp tới từng đợt khảo sát</p>
          </div>
          <div className="dashboard-heading-actions">
            <span className="dashboard-result-count">
              {loading ? 'Đang tải...' : `${campaigns.length} đợt khảo sát`}
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
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <CircleAlert aria-hidden="true" />
                    <strong>Không tải được dữ liệu đợt khảo sát</strong>
                    <span>{loadError}</span>
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="dashboard-empty-cell">
                    <RadioTower aria-hidden="true" />
                    <strong>Chưa có đợt khảo sát {surveyTypeLabels[surveyType].toLowerCase()} nào</strong>
                    <span>Các đợt khảo sát mới sẽ xuất hiện tại đây.</span>
                  </td>
                </tr>
              ) : (
                campaigns.map((campaign) => {
                  const progress = campaign.target
                    ? Math.min(100, Math.round((campaign.actual / campaign.target) * 100))
                    : 0;
                  return (
                    <tr
                      key={campaign.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onNavigateTab(campaignTabOf[surveyType])}
                    >
                      <td className="dashboard-campaign-name">
                        <strong title={campaign.title}>{campaign.title}</strong>
                        <span>
                          {campaign.semester} · {campaign.academicYear} · {campaign.unitCount} {unitNounOf[surveyType]}
                        </span>
                      </td>
                      <td>
                        <span className="dashboard-type-label">{surveyTypeLabels[surveyType]}</span>
                      </td>
                      <td className="dashboard-date-cell">
                        {formatDate(campaign.startDate)}
                        <span aria-hidden="true"> - </span>
                        {formatDate(campaign.endDate)}
                      </td>
                      <td>
                        {campaign.target === null ? (
                          // CTĐT không có sĩ số: chỉ có số phiếu hợp lệ, không có thanh tiến độ.
                          <div
                            className="dashboard-progress"
                            aria-label={`Đã thu ${campaign.actual} phiếu hợp lệ`}
                          >
                            <span className="dashboard-progress-value">
                              {campaign.actual.toLocaleString('vi-VN')}
                              <small> phiếu hợp lệ</small>
                            </span>
                          </div>
                        ) : (
                          <div
                            className="dashboard-progress"
                            aria-label={`Đã thu ${campaign.actual} trên ${campaign.target} phiếu, đạt ${progress}%`}
                          >
                            <div className="dashboard-progress-track" aria-hidden="true">
                              <span style={{ width: `${progress}%` }} />
                            </div>
                            <span className="dashboard-progress-value">
                              {campaign.actual.toLocaleString('vi-VN')}
                              <small> / {campaign.target.toLocaleString('vi-VN')}</small>
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`dashboard-status ${campaign.status === 'Đang diễn ra' ? 'is-active' : campaign.status === 'Sắp diễn ra' ? 'is-upcoming' : 'is-complete'}`}>
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
                          onClick={(event) => {
                            event.stopPropagation();
                            onNavigateTab(campaignTabOf[surveyType]);
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
