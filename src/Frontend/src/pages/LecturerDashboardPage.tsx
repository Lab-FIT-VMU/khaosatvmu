import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardCheck,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { catalogApi } from '../services/catalogApi';
import { writeSemesterSurveysCache } from '../hooks/useSemesterSurveys';
import { surveyApi } from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import { ExportDropdown } from '../components/ExportDropdown';
import { MarqueeText } from '../components/MarqueeText';
import {
  getActiveSemesterSurveyId,
  selectAvailableSemesterSurveyId,
  setActiveSemesterSurveyId,
} from '../utils/surveySelection';
import '../styles/dashboard.css';
import { formatPercent } from '../utils/formatNumber';

interface LecturerDashboardPageProps {
  onNavigateTab: (tab: string) => void;
}

interface QuickAction {
  tab: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'blue' | 'teal' | 'green';
}

/**
 * Đúng ba thẻ, và cả ba đều nằm trong quyền giảng viên đang có nên không thẻ nào bấm
 * vào lại bị đá ra. Trang Học phần không lên thẻ, vẫn vào được từ menu bên trái.
 * Xem congviec3.md mục I2.
 */
const quickActions: QuickAction[] = [
  {
    tab: 'classes',
    title: 'Lớp học phần',
    description: 'Các lớp đang phụ trách',
    icon: BookOpen,
    tone: 'blue',
  },
  {
    tab: 'course-campaigns',
    title: 'Danh sách đợt khảo sát',
    description: 'Phiếu khảo sát của các lớp',
    icon: ClipboardCheck,
    tone: 'teal',
  },
  {
    tab: 'progress',
    title: 'Tiến độ thu phiếu',
    description: 'Vận hành khảo sát',
    icon: BarChart3,
    tone: 'green',
  },
];

interface LecturerMetrics {
  /** Lớp mình dạy trong học kỳ, kể cả lớp chưa được phát phiếu. */
  sectionCount: number;
  /** Lớp đã được phát phiếu trong đợt được chọn. */
  surveyedCount: number;
  responseCount: number;
  targetCount: number;
}

export const LecturerDashboardPage: React.FC<LecturerDashboardPageProps> = ({
  onNavigateTab,
}) => {
  const { activeSemesterId, activeSemesterLabel } = useSemester();
  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(
    Number(getActiveSemesterSurveyId()) || null,
  );
  const [metrics, setMetrics] = useState<LecturerMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeSemesterId === null) {
      setSemesterSurveys([]);
      setSelectedSurveyId(null);
      setMetrics(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [sections, surveys] = await Promise.all([
          catalogApi.courseSections(activeSemesterId),
          surveyApi.semesterSurveys(activeSemesterId),
        ]);
        if (cancelled) return;
        // Thiếu dòng này thì danh sách đợt luôn rỗng: ô chọn đợt không bao giờ hiện
        // ra và dòng mô tả báo "chưa có đợt nào" ngay cả khi số liệu bên dưới đã có.
        // Ghi vào cache dùng chung để ô chọn Đợt ở các trang khác mở lên là có ngay.
        writeSemesterSurveysCache(activeSemesterId, surveys);
        setSemesterSurveys(surveys);
        const chosenSurveyId = Number(
          selectAvailableSemesterSurveyId(surveys, getActiveSemesterSurveyId()),
        ) || null;
        setSelectedSurveyId(chosenSurveyId);

        const sectionSurveys = chosenSurveyId
          ? await surveyApi.courseSectionSurveys(chosenSurveyId)
          : [];
        if (cancelled) return;

        setMetrics({
          sectionCount: sections.length,
          surveyedCount: sectionSurveys.length,
          // Tiến độ đo bằng phiếu HỢP LỆ, giống bảng tiến độ và báo cáo.
          responseCount: sectionSurveys.reduce((total, item) => total + item.validResponseCount, 0),
          targetCount: sectionSurveys.reduce((total, item) => total + item.classSize, 0),
        });
      } catch {
        if (!cancelled) {
          setSemesterSurveys([]);
          setMetrics(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSemesterId]);

  const handleSelectSurvey = async (surveyId: number | null) => {
    setSelectedSurveyId(surveyId);
    setActiveSemesterSurveyId(surveyId);
    if (!activeSemesterId) return;
    setLoading(true);
    try {
      const [sections, sectionSurveys] = await Promise.all([
        catalogApi.courseSections(activeSemesterId),
        surveyId ? surveyApi.courseSectionSurveys(surveyId) : Promise.resolve([]),
      ]);
      setMetrics({
        sectionCount: sections.length,
        surveyedCount: sectionSurveys.length,
        responseCount: sectionSurveys.reduce((total, item) => total + item.validResponseCount, 0),
        targetCount: sectionSurveys.reduce((total, item) => total + item.classSize, 0),
      });
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const selectedSurvey = semesterSurveys.find((s) => s.semesterSurveyId === selectedSurveyId);
  const completionRate = metrics && metrics.targetCount > 0
    ? (metrics.responseCount / metrics.targetCount) * 100
    : null;

  return (
    <div className="dashboard-page department-dashboard">
      <section className="dashboard-block">
        <div className="dashboard-block-heading">
          <div>
            <h2>Bảng điều khiển</h2>
            <p>Học kỳ đang xem: {activeSemesterLabel}</p>
          </div>
        </div>

        <div className="dashboard-quick-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                type="button"
                key={action.tab}
                className={`dashboard-quick-action is-${action.tone}`}
                onClick={() => onNavigateTab(action.tab)}
              >
                <span className="dashboard-quick-icon" aria-hidden="true">
                  <Icon />
                </span>
                <span className="dashboard-quick-copy">
                  <strong>{action.title}</strong>
                  <small>{action.description}</small>
                </span>
                <ArrowRight className="dashboard-quick-arrow" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Hai ô, không có ô điểm và không có số toàn trường để so: câu H-e chốt giảng
          viên chỉ xem tiến độ thu phiếu. Xem congviec3.md mục I3. */}
      <section className="dashboard-block">
        <div className="dashboard-block-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>Lớp học phần phụ trách</h2>
            <p>
              {selectedSurvey ? (
                <>
                  Đợt khảo sát:{' '}
                  <MarqueeText className="dashboard-heading-survey">
                    {selectedSurvey.surveyName}
                  </MarqueeText>
                </>
              ) : (
                'Học kỳ này chưa có đợt khảo sát nào'
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {semesterSurveys.length > 0 && (
              <div className="executive-compare-select" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label htmlFor="lec-dashboard-survey-select" style={{ fontSize: '13px', color: '#000000', fontWeight: 600 }}>Đợt khảo sát:</label>
                <select
                  id="lec-dashboard-survey-select"
                  value={selectedSurveyId ?? ''}
                  onChange={(e) => void handleSelectSurvey(e.target.value ? Number(e.target.value) : null)}
                  // Chặn bề rộng vì ô chọn tự giãn theo tên đợt dài nhất.
                  style={{
                    height: '34px',
                    maxWidth: 'min(320px, 40vw)',
                    padding: '0 8px',
                    fontSize: '13px',
                    color: '#000000',
                    border: '1px solid var(--field-border)',
                    borderRadius: '3px',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {semesterSurveys.map((survey) => (
                    <option key={survey.semesterSurveyId} value={survey.semesterSurveyId}>
                      {survey.surveyName} ({survey.sectionSurveyCount} lớp)
                    </option>
                  ))}
                </select>
              </div>
            )}
          {metrics && (
            <ExportDropdown
              buttonLabel="Xuất số liệu"
              size="sm"
              options={{
                fileName: `bao-cao-tien-do-khao-sat-giang-vien-${
                  selectedSurvey?.surveyName || 'hoc-phan'
                }-${activeSemesterLabel}`,
                metadata: {
                  title: 'BÁO CÁO TIẾN ĐỘ THU PHIẾU KHẢO SÁT CÁ NHÂN GIẢNG VIÊN',
                  subtitle: `Học kỳ: ${activeSemesterLabel}${selectedSurvey ? ` — Đợt: ${selectedSurvey.surveyName}` : ''}`,
                  subInstitution: 'GIẢNG VIÊN',
                  info: {
                    'Học kỳ': activeSemesterLabel,
                    'Đợt khảo sát': selectedSurvey?.surveyName || '—',
                    'Tổng số lớp giảng dạy': metrics.sectionCount,
                    'Số lớp đã phát phiếu': metrics.surveyedCount,
                    'Tiến độ thu phiếu': completionRate !== null ? `${formatPercent(completionRate, 3)}` : '—',
                  },
                },
                columns: [
                  { key: 'metricName', header: 'Chỉ tiêu theo dõi', width: 30 },
                  { key: 'metricValue', header: 'Kết quả thực tế', width: 25, align: 'right' as const },
                ],
                data: [
                  {
                    metricName: 'Tổng số lớp học phần giảng dạy',
                    metricValue: `${metrics.sectionCount} lớp`,
                  },
                  {
                    metricName: 'Số lớp học phần đã phát phiếu khảo sát',
                    metricValue: `${metrics.surveyedCount} lớp`,
                  },
                  {
                    metricName: 'Số phiếu đã thu / Tổng số phiếu phải thu',
                    metricValue: `${metrics.responseCount} / ${metrics.targetCount} phiếu`,
                  },
                  {
                    metricName: 'Tỷ lệ hoàn thành thu phiếu',
                    metricValue: completionRate !== null ? `${formatPercent(completionRate, 3)}` : '—',
                  },
                ],
              }}
            />
          )}
          </div>
        </div>

        {loading ? (
          <div className="dashboard-empty-cell" role="status">
            <LoaderCircle className="auth-spin" aria-hidden="true" />
            <span>Đang nạp số liệu...</span>
          </div>
        ) : (
          <div className="department-metric-grid">
            <div className="department-metric">
              <span className="department-metric__label">Lớp học phần phụ trách</span>
              <strong className="department-metric__value">
                {metrics ? metrics.sectionCount : '—'}
              </strong>
              <span className="department-metric__compare">
                {metrics ? `${metrics.surveyedCount} lớp đã phát phiếu` : '—'}
              </span>
            </div>

            <div className="department-metric">
              <span className="department-metric__label">Tiến độ thu phiếu</span>
              <strong className="department-metric__value">
                {completionRate === null ? '—' : `${formatPercent(completionRate, 3)}`}
              </strong>
              <span className="department-metric__compare">
                {metrics
                  ? `${metrics.responseCount} / ${metrics.targetCount} phiếu`
                  : '—'}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
