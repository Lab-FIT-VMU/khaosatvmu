import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CircleAlert,
  LoaderCircle,
  Sigma,
  Users,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { catalogApi, type UnidentifiedLecturerReport } from '../services/catalogApi';
import { writeSemesterSurveysCache } from '../hooks/useSemesterSurveys';
import { surveyApi, type DepartmentDashboard } from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import { ExportDropdown } from '../components/ExportDropdown';
import { MarqueeText } from '../components/MarqueeText';
import {
  getActiveSemesterSurveyId,
  selectAvailableSemesterSurveyId,
  setActiveSemesterSurveyId,
} from '../utils/surveySelection';
import '../styles/dashboard.css';
import { formatDecimal, formatDecimalOrDash, formatPercent } from '../utils/formatNumber';

interface DepartmentDashboardPageProps {
  onNavigateTab: (tab: string) => void;
}

interface QuickAction {
  tab: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'blue' | 'teal' | 'green' | 'amber';
}

/**
 * Bốn thẻ chọn theo VIỆC PHẢI LÀM chứ không theo bản của quản trị. Đây là bốn thứ
 * trưởng bộ môn thực sự phải động vào: sửa lớp thiếu giảng viên, quản nhân sự bộ môn,
 * giục thu phiếu, xem chẩn đoán. Năm trang còn lại vẫn vào được từ menu bên trái.
 * Xem congviec2.md mục F2.
 */
const quickActions: QuickAction[] = [
  {
    tab: 'classes',
    title: 'Lớp học phần',
    description: 'Dữ liệu khảo sát của bộ môn',
    icon: BookOpen,
    tone: 'blue',
  },
  {
    tab: 'lecturers',
    title: 'Giảng viên',
    description: 'Nhân sự bộ môn',
    icon: Users,
    tone: 'teal',
  },
  {
    tab: 'progress',
    title: 'Tiến độ thu phiếu',
    description: 'Vận hành khảo sát',
    icon: BarChart3,
    tone: 'green',
  },
  {
    tab: 'survey-analysis',
    title: 'Phân tích chuyên sâu',
    description: 'Chuẩn hoá và chẩn đoán',
    icon: Sigma,
    tone: 'amber',
  },
];

const formatScore = (value: number | null) => (formatDecimalOrDash(value, 3));
const formatRate = (value: number) => `${formatPercent(value, 3)}`;

export const DepartmentDashboardPage: React.FC<DepartmentDashboardPageProps> = ({
  onNavigateTab,
}) => {
  const { activeSemesterId, activeSemesterLabel } = useSemester();
  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(
    Number(getActiveSemesterSurveyId()) || null,
  );
  const [metrics, setMetrics] = useState<DepartmentDashboard | null>(null);
  const [unidentified, setUnidentified] = useState<UnidentifiedLecturerReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeSemesterId === null) {
      setSemesterSurveys([]);
      setSelectedSurveyId(null);
      setMetrics(null);
      setUnidentified(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [surveys, report] = await Promise.all([
          surveyApi.semesterSurveys(activeSemesterId),
          catalogApi.unidentifiedLecturers(activeSemesterId),
        ]);
        if (cancelled) return;
        // Ghi vào cache dùng chung để ô chọn Đợt ở các trang khác mở lên là có ngay.
        writeSemesterSurveysCache(activeSemesterId, surveys);
        setSemesterSurveys(surveys);
        setUnidentified(report);
        setSelectedSurveyId((prev) =>
          Number(selectAvailableSemesterSurveyId(surveys, prev)) || null,
        );
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

  useEffect(() => {
    if (!selectedSurveyId) {
      setMetrics(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    surveyApi
      .departmentDashboard(selectedSurveyId)
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch(() => {
        if (!cancelled) setMetrics(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSurveyId]);

  const unidentifiedCount = unidentified?.sectionCount ?? 0;

  // Số liệu bộ môn chỉ trả về tên bộ câu hỏi, mà nhãn ở đây nói "Đợt khảo sát" —
  // tên đợt phải lấy từ chính danh sách đang đổ vào ô chọn.
  const selectedSurvey =
    semesterSurveys.find((survey) => survey.semesterSurveyId === selectedSurveyId) ?? null;

  return (
    <div className="dashboard-page department-dashboard">
      <section className="dashboard-block">
        <div className="dashboard-block-heading">
          <div>
            <h2>
              Bảng điều khiển
              {metrics?.departmentName && <> · Bộ môn {metrics.departmentName}</>}
            </h2>
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

      {/* Mỗi ô một số của bộ môn và một số toàn trường ngay dưới. Số toàn trường LUÔN
          tính trên toàn bộ dữ liệu, không tính lại trong phạm vi bộ môn — nếu không thì
          "so với mặt bằng" mất hết ý nghĩa. Xem congviec2.md mục D6. */}
      <section className="dashboard-block">
        <div className="dashboard-block-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>Chỉ số bộ môn</h2>
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
                <label htmlFor="dept-dashboard-survey-select" style={{ fontSize: '13px', color: '#000000', fontWeight: 600 }}>Đợt khảo sát:</label>
                <select
                  id="dept-dashboard-survey-select"
                  value={selectedSurveyId ?? ''}
                  onChange={(e) => {
                    const next = e.target.value ? Number(e.target.value) : null;
                    setSelectedSurveyId(next);
                    setActiveSemesterSurveyId(next);
                  }}
                  // Chặn bề rộng vì ô chọn tự giãn theo tên đợt dài nhất.
                  style={{
                    height: '32px',
                    maxWidth: 'min(320px, 40vw)',
                    padding: '0 8px',
                    fontSize: '13px',
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
              buttonLabel="Xuất báo cáo bộ môn"
              size="sm"
              options={{
                fileName: `bao-cao-tong-quan-bo-mon-${metrics.departmentName || 'bo-mon'}-${
                  selectedSurvey?.surveyName || 'dot-khao-sat'
                }-${activeSemesterLabel}`,
                metadata: {
                  title: `BÁO CÁO TỔNG QUAN BỘ MÔN ${(metrics.departmentName || '').toUpperCase()}`,
                  subtitle: `Học kỳ: ${activeSemesterLabel} — Đợt: ${selectedSurvey?.surveyName ?? '—'}`,
                  breadcrumb: ['Bảng điều khiển'],
                  info: {
                    'Bộ môn': metrics.departmentName || '—',
                    'Học kỳ': activeSemesterLabel,
                    'Đợt khảo sát': selectedSurvey?.surveyName ?? '—',
                    'Số lớp cần lưu ý': `${metrics.weakSectionCount} lớp`,
                    'Số lớp chưa xác định GV': `${unidentifiedCount} lớp`,
                  },
                },
                sheets: [
                  {
                    sheetName: 'Chi so Bo mon',
                    title: '1. CHỈ SỐ KHẢO SÁT BỘ MÔN SO VỚI MẶT BẰNG TOÀN TRƯỜNG',
                    columns: [
                      { key: 'metricName', header: 'Chỉ tiêu đánh giá', width: 28 },
                      { key: 'deptValue', header: 'Kết quả của bộ môn', width: 22, align: 'right' as const },
                      { key: 'schoolValue', header: 'Mặt bằng toàn trường', width: 22, align: 'right' as const },
                    ],
                    data: [
                      {
                        metricName: 'Tiến độ thu phiếu khảo sát',
                        deptValue: formatRate(metrics.completionRate),
                        schoolValue: formatRate(metrics.schoolCompletionRate),
                      },
                      {
                        metricName: 'Điểm hài lòng trung bình',
                        deptValue: formatScore(metrics.averageScore),
                        schoolValue: formatScore(metrics.schoolAverageScore),
                      },
                      {
                        metricName: 'Số lớp học phần cần lưu ý',
                        deptValue: `${metrics.weakSectionCount} lớp`,
                        // Chữ phải trùng ô "Dưới X điểm" trên màn hình, không phải
                        // "Ngưỡng điểm < X" — cùng một số mà hai cách gọi thì người
                        // đọc tệp phải đoán xem có phải cùng một ngưỡng không.
                        schoolValue: `Dưới ${formatDecimal(metrics.weakScoreThreshold, 3)} điểm`,
                      },
                      {
                        metricName: 'Số lớp chưa xác định giảng viên',
                        deptValue: `${unidentifiedCount} lớp`,
                        schoolValue: unidentified && unidentified.lecturerCount > 0
                          ? `Thuộc ${unidentified.lecturerCount} người`
                          : 'Yêu cầu cập nhật',
                      },
                    ],
                  },
                  ...(unidentified && unidentified.sections && unidentified.sections.length > 0 ? [
                    {
                      sheetName: 'Lop chua xac dinh GV',
                      title: `2. DANH SÁCH LỚP CHƯA XÁC ĐỊNH GIẢNG VIÊN (${unidentified.sections.length} LỚP)`,
                      subtitle: 'Các lớp cần bổ sung/cập nhật thông tin giảng viên và email để gửi khảo sát',
                      // Khai đúng những trường thật của lớp chưa gắn giảng viên; trước
                      // đây hai cột trỏ vào trường không tồn tại nên tệp xuất ra cột trắng.
                      columns: [
                        { key: 'courseCode', header: 'Mã học phần', width: 16, align: 'center' as const },
                        { key: 'courseName', header: 'Tên học phần', width: 30 },
                        { key: 'sectionName', header: 'Nhóm lớp', width: 12, align: 'center' as const },
                        { key: 'lecturerName', header: 'Giảng viên đọc từ tệp', width: 24 },
                        { key: 'credits', header: 'Số tín chỉ', width: 12, type: 'number' as const, align: 'right' as const },
                        { key: 'classSize', header: 'Tổng số phiếu phải thu', width: 14, type: 'number' as const, align: 'right' as const },
                        { key: 'departmentName', header: 'Bộ môn', width: 24, format: (val: any) => val || '—' },
                        { key: 'facultyName', header: 'Khoa / Viện', width: 24, format: (val: any) => val || '—' },
                      ],
                      data: unidentified.sections,
                      summaryNotes: ['Đề nghị Trưởng bộ môn rà soát và phân công giảng viên phụ trách trên hệ thống.'],
                    },
                  ] : []),
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
              <span className="department-metric__label">Tiến độ thu phiếu</span>
              <strong className="department-metric__value">
                {metrics ? formatRate(metrics.completionRate) : '—'}
              </strong>
              <span className="department-metric__compare">
                Toàn trường {metrics ? formatRate(metrics.schoolCompletionRate) : '—'}
              </span>
            </div>

            <div className="department-metric">
              <span className="department-metric__label">Điểm trung bình</span>
              <strong className="department-metric__value">
                {metrics ? formatScore(metrics.averageScore) : '—'}
              </strong>
              <span className="department-metric__compare">
                Toàn trường {metrics ? formatScore(metrics.schoolAverageScore) : '—'}
              </span>
            </div>

            <div className="department-metric">
              <span className="department-metric__label">Lớp cần lưu ý</span>
              <strong className="department-metric__value">
                {metrics ? metrics.weakSectionCount : '—'}
              </strong>
              <span className="department-metric__compare">
                Dưới {metrics ? formatDecimal(metrics.weakScoreThreshold, 3) : '—'} điểm
              </span>
            </div>

            <div className="department-metric">
              <span className="department-metric__label">Lớp chưa có giảng viên</span>
              <strong className="department-metric__value">{unidentifiedCount}</strong>
              <span className="department-metric__compare">
                {unidentified && unidentified.lecturerCount > 0
                  ? `Thuộc ${unidentified.lecturerCount} người`
                  : 'Đã đủ giảng viên'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Thông báo suy ra từ dữ liệu, không có bảng Notifications và không có trạng
          thái đã đọc: mở trang là tính lại, làm xong thì dòng tự biến mất. Đợt này chỉ
          một loại, hai loại còn lại ghi ở congviec2.md mục F3 để sau. */}
      <section className="dashboard-block">
        <div className="dashboard-block-heading">
          <div>
            <h2>Việc cần làm</h2>
            <p>Cập nhật theo dữ liệu hiện tại, không cần bấm làm mới</p>
          </div>
        </div>

        {unidentifiedCount > 0 ? (
          <ul className="department-feed">
            <li>
              <button
                type="button"
                className="department-feed__item"
                onClick={() => onNavigateTab('classes')}
              >
                <span className="department-feed__icon is-warning" aria-hidden="true">
                  <Bell />
                </span>
                <span className="department-feed__copy">
                  <strong>
                    {unidentifiedCount} lớp chưa xác định giảng viên
                    {unidentified && unidentified.lecturerCount > 0
                      && `, thuộc ${unidentified.lecturerCount} người`}
                  </strong>
                  <small>
                    Xin email của từng người rồi thêm vào trang Giảng viên, sau đó quay lại gán
                    cho lớp. Bấm để mở danh sách.
                  </small>
                </span>
                <ArrowRight className="dashboard-quick-arrow" aria-hidden="true" />
              </button>
            </li>
          </ul>
        ) : (
          <div className="department-feed__empty">
            <CircleAlert aria-hidden="true" size={18} />
            <span>Không có việc nào cần xử lý trong học kỳ này.</span>
          </div>
        )}
      </section>
    </div>
  );
};
