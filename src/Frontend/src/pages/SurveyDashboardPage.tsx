import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSemester } from '../context/semesterContext';
import { NoteModalButton } from '../components/NoteModalButton';
import { ExportDropdown } from '../components/ExportDropdown';
import { UpdateScoresButton } from '../components/UpdateScoresButton';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { ApiError } from '../services/apiClient';
import { surveyApi, surveyErrorMessage } from '../services/surveyApi';
import type {
  DashboardFacultyScore,
  DashboardQuestionScore,
  SemesterSurveyDashboard,
} from '../services/surveyApi';
import type { SemesterSurvey } from '../types';
import '../styles/survey-operations.css';
import '../styles/survey-statistics.css';
import '../styles/catalogs.css';
import '../styles/survey-dashboard.css';

function messageFrom(error: unknown): string {
  return error instanceof ApiError ? surveyErrorMessage(error.errorCode) : surveyErrorMessage(null);
}

/*
  Ô chọn đợt khảo sát, viết riêng cho trang này.

  Không dùng <select> vì danh sách xổ xuống do trình duyệt vẽ, luôn giãn theo tên
  đợt dài nhất và tràn ra ngoài ô. Ở đây danh sách tự vẽ nên bám đúng bề rộng ô.

  Kiểu dáng nhúng thẳng trong tệp: trang được nạp lười, phụ thuộc vào tệp .css
  bên ngoài thì lần đầu vào trang ô chọn bung ra không còn hình hài gì.
*/
const campaignSelectCss = `
.campaign-select { position: relative; flex: 0 0 460px; min-width: 0; }
.campaign-select__trigger {
  width: 100%; min-height: 34px; display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border: 1px solid #d7dee2; background: #fff; color: #20262c;
  font: inherit; font-size: 12px; text-align: left; cursor: pointer;
}
.campaign-select__trigger:disabled { background: #f4f6f8; color: #8c969f; cursor: not-allowed; }
.campaign-select__trigger:focus-visible { outline: 2px solid rgba(7,136,184,.25); border-color: #0788b8; }
.campaign-select__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-select__caret { flex: 0 0 auto; width: 14px; height: 14px; color: #68737d; }
.campaign-select__list {
  position: fixed; z-index: 1000; margin: 0; padding: 4px 0; list-style: none;
  overflow-y: auto; border: 1px solid #d7dee2; background: #fff;
  box-shadow: 0 8px 24px rgba(15,30,45,.16);
}
.campaign-select__option {
  position: relative; overflow: hidden; container-type: inline-size;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; font-size: 12px; color: #20262c; cursor: pointer;
}
.campaign-select__option.is-active { background: #eef7fb; }
.campaign-select__option > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Rê chuột: chữ chạy đúng phần bị thừa. 100% là bề rộng chữ, 100cqw là bề rộng
   dòng — chữ ngắn hơn dòng thì hiệu số dương, min() kẹp về 0 nên đứng yên. */
.campaign-select__option:hover > span {
  flex: 0 0 max-content; overflow: visible; text-overflow: clip;
  animation: campaign-select-scroll 6s linear infinite;
}
@keyframes campaign-select-scroll {
  0%, 12% { transform: translateX(0); }
  88%, 100% { transform: translateX(min(0px, calc(100cqw - 100% - 26px))); }
}
.campaign-select__empty { padding: 10px 12px; color: #68737d; font-size: 12px; text-align: center; }
.campaign-select__hint {
  position: fixed; z-index: 1001; padding: 9px 12px; border: 1px solid #d7dee2;
  background: #fff; box-shadow: 0 8px 22px rgba(15,30,45,.2); color: #20262c;
  font-size: 16px; line-height: 1.45; overflow-wrap: anywhere; pointer-events: none;
}
`;

interface CampaignOption {
  value: string;
  label: string;
}

function CampaignSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
}: {
  id: string;
  value: string;
  options: CampaignOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});
  const [hint, setHint] = useState<{ label: string; style: React.CSSProperties } | null>(null);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!isOpen) return;

    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      setListStyle({
        top: rect.bottom + 3,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(96, Math.min(264, below)),
      });
    };

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setIsOpen(false);
      setHint(null);
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', closeOnOutside);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', closeOnOutside);
    };
  }, [isOpen]);

  // Ô ghi trọn tên bám theo con trỏ: góc trái trên của ô đặt đúng chỗ chuột đang
  // đứng, và chạy theo chuột chừng nào còn rê trong dòng đó. Kẹp lại trong màn
  // hình để ô không thò ra ngoài mép phải hoặc mép dưới.
  const showHintAt = (label: string, clientX: number, clientY: number) => {
    const width = Math.min(520, window.innerWidth * 0.6);
    setHint({
      label,
      style: {
        top: Math.min(clientY, window.innerHeight - 90),
        left: Math.min(clientX, window.innerWidth - width - 8),
        maxWidth: width,
      },
    });
  };

  return (
    <div className="campaign-select" ref={rootRef}>
      <style>{campaignSelectCss}</style>

      <button
        type="button"
        id={id}
        className="campaign-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="campaign-select__value">{selected ? selected.label : placeholder}</span>
        <ChevronDown className="campaign-select__caret" aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <>
          <ul className="campaign-select__list" role="listbox" ref={listRef} style={listStyle}>
            {options.length === 0 ? (
              <li className="campaign-select__empty">{placeholder}</li>
            ) : (
              options.map((option) => (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={option.value === value}
                  className={
                    option.value === value
                      ? 'campaign-select__option is-active'
                      : 'campaign-select__option'
                  }
                  onMouseEnter={(event) => showHintAt(option.label, event.clientX, event.clientY)}
                  onMouseMove={(event) => showHintAt(option.label, event.clientX, event.clientY)}
                  onMouseLeave={() => setHint(null)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(option.value);
                    setIsOpen(false);
                    setHint(null);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check aria-hidden="true" size={14} />}
                </li>
              ))
            )}
          </ul>

          {hint && (
            <div className="campaign-select__hint" role="tooltip" style={hint.style}>
              {hint.label}
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}

/** Mốc tô màu biểu đồ. Không phải mốc cảnh báo — mốc đó backend tính theo Z-Score. */
const lowScore = 3.2;

/** Thang màu cột biểu đồ, dùng chung ngưỡng với bảng để hai chỗ không nói ngược nhau. */
function barColor(score: number): string {
  if (score < lowScore) return '#d4544a';
  if (score < 3.5) return '#e0904a';
  if (score < 3.8) return '#d8b442';
  return '#3f9b5c';
}

/**
 * Trục điểm luôn để 0–5. Cắt trục cho "dễ nhìn chênh lệch" là cách nhanh nhất
 * biến chênh 0.2 điểm thành một biểu đồ trông như gấp đôi.
 */
const scoreAxis = { domain: [0, 5] as [number, number], ticks: [0, 1, 2, 3, 4, 5] };

const usageNotes = [
  'Khảo sát đo MỨC HÀI LÒNG của sinh viên, không đo trực tiếp chất lượng học thuật. Học phần khó thường bị chấm thấp hơn.',
  'Hệ thống không xuất bảng xếp hạng giảng viên. Chênh lệch dưới 1 độ lệch chuẩn không có ý nghĩa thống kê.',
  'Lớp có tỷ lệ phản hồi thấp thì số liệu không đại diện, phải đọc kèm cột tỷ lệ phản hồi.',
  'Cần kiểm định định kỳ tương quan giữa điểm sinh viên NHẬN và điểm sinh viên CHẤM. Tương quan dương mạnh là dấu hiệu động cơ ngược.',
  'Tỷ lệ phiếu trả lời một đáp án tăng qua các kỳ là tín hiệu sinh viên mất niềm tin — nên theo dõi như một chỉ số chính của hệ thống khảo sát.',
];

export const SurveyDashboardPage: React.FC = () => {
  const { academicYears, activeSemesterId } = useSemester();

  const [semesterId, setSemesterId] = useState<string>(() =>
    activeSemesterId ? String(activeSemesterId) : ''
  );
  useEffect(() => {
    if (activeSemesterId) setSemesterId(String(activeSemesterId));
  }, [activeSemesterId]);

  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [semesterSurveyId, setSemesterSurveyId] = useState<string>('');
  const [data, setData] = useState<SemesterSurveyDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!semesterId) {
        setSemesterSurveys([]);
        setSemesterSurveyId('');
        return;
      }
      try {
        const next = await surveyApi.semesterSurveys(Number(semesterId));
        if (cancelled) return;
        setSemesterSurveys(next);
        setSemesterSurveyId(next.length > 0 ? String(next[0].semesterSurveyId) : '');
        setLoadError(null);
      } catch (error) {
        if (!cancelled) setLoadError(messageFrom(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [semesterId]);

  const loadData = useCallback(async () => {
    if (!semesterSurveyId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await surveyApi.semesterSurveyDashboard(Number(semesterSurveyId)));
      setLoadError(null);
    } catch (error) {
      setLoadError(messageFrom(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [semesterSurveyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const semesterOptions = useMemo(
    () =>
      academicYears.flatMap((year) =>
        year.semesters.map((semester) => ({
          value: String(semester.semesterId),
          label: `${semester.semesterName} · ${year.academicYearName}`,
        }))
      ),
    [academicYears]
  );

  return (
    <div className="survey-operations-page survey-statistics-page">
      <section className="statistics-toolbar">
        <label className="form-group">
          <span>Học kỳ</span>
          <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">Chọn học kỳ</option>
            {semesterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* Danh sách xổ xuống của <select> do trình duyệt tự vẽ, luôn giãn theo tên
            đợt dài nhất. Danh sách tự vẽ mới bám đúng bề rộng ô chọn. */}
        <div className="form-group">
          <span>Đợt khảo sát</span>
          <CampaignSelect
            id="dashboard-campaign-select"
            value={semesterSurveyId}
            onChange={setSemesterSurveyId}
            disabled={semesterSurveys.length === 0}
            placeholder={semesterSurveys.length === 0 ? 'Chưa có đợt nào' : 'Chọn đợt khảo sát'}
            options={semesterSurveys.map((survey) => ({
              value: String(survey.semesterSurveyId),
              label: `${survey.surveyName} · ${survey.sectionSurveyCount} lớp`,
            }))}
          />
        </div>

        <div className="statistics-toolbar-actions">
          {data && (
            <ExportDropdown
              buttonLabel="Xuất báo cáo"
              size="sm"
              options={{
                fileName: `bao-cao-tong-quan-dot-khao-sat-${
                  semesterSurveys.find((item) => String(item.semesterSurveyId) === semesterSurveyId)
                    ?.surveyName || 'hoc-phan'
                }-${data.semesterName}-${data.academicYearName}`,
                metadata: {
                  title: 'BÁO CÁO TỔNG QUAN ĐỢT KHẢO SÁT HỌC PHẦN',
                  subtitle: `${data.templateName} — ${data.semesterName} năm học ${data.academicYearName}`,
                  subInstitution: 'PHÒNG ĐẢM BẢO CHẤT LƯỢNG',
                  info: {
                    'Bộ câu hỏi': data.templateName,
                    'Học kỳ': `${data.semesterName} · ${data.academicYearName}`,
                    'Số lớp học phần': data.sectionCount,
                    'Tổng sĩ số': data.totalClassSize,
                    'Số phiếu đã thu': data.totalResponseCount,
                    'Số phiếu hợp lệ': data.validResponseCount,
                    'Tỷ lệ phản hồi': `${data.responseRate.toFixed(1)}%`,
                    'Điểm trung bình toàn trường': data.overallScore !== null ? data.overallScore.toFixed(2) : '—',
                  },
                  summaryNotes: [
                    'Số liệu tính toán từ kết quả các phiếu khảo sát hợp lệ qua bộ lọc.',
                  ],
                },
                columns: [
                  { key: 'facultyName', header: 'Khoa / Viện', width: 28 },
                  { key: 'averageScore', header: 'Điểm TB', width: 14, type: 'number' as const, align: 'right' as const, format: (v: any) => Number(v).toFixed(2) },
                  { key: 'sectionsBelowThreshold', header: 'Số lớp dưới ngưỡng', width: 18, type: 'number' as const, align: 'right' as const },
                ],
                data: data.faculties,
              }}
            />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void loadData()}
            disabled={!semesterSurveyId || loading}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Tải lại
          </button>
          <UpdateScoresButton semesterSurveyId={semesterSurveyId} onUpdated={loadData} />
        </div>
      </section>

      <ScoringConfigNote />

      {loadError && (
        <div className="admin-alert" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {loading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tổng hợp số liệu...</strong>
        </div>
      ) : !semesterSurveyId ? (
        <div className="operations-empty">
          <strong>Chọn học kỳ và đợt khảo sát để xem tổng quan.</strong>
        </div>
      ) : data === null ? (
        <div className="operations-empty">
          <strong>Đợt này chưa có số liệu.</strong>
        </div>
      ) : (
        <DashboardReport data={data} />
      )}
    </div>
  );
};

const DashboardReport: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <div className="dashboard-report" tabIndex={0} aria-label="Tổng quan đợt khảo sát">
    <section className="statistics-summary">
      <span className="summary-title">
        Tổng quan khảo sát — {data.semesterName} năm học {data.academicYearName}
      </span>
      <span>{data.templateName}</span>
      <NoteModalButton title="Lưu ý khi sử dụng số liệu">
        <ul className="dashboard-notes">
          {usageNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="dashboard-report-note">
          Số lớp và tổng phiếu đếm mọi lượt nộp. Tỷ lệ hoàn thành và điểm chỉ tính trên phiếu
          hợp lệ, hiện có <strong>{data.scoredSectionCount}</strong> lớp đủ điều kiện tính điểm.
        </p>
        <p className="dashboard-report-note">
          Học phần cần rà soát: mọi lớp đều thấp thì nguyên nhân thuộc giáo trình / đề cương,
          không thuộc giảng viên.
        </p>
      </NoteModalButton>
    </section>

    <div className="dashboard-report-grid">
      <MainIndicators data={data} />
      <QuestionChart questions={data.questions} overallScore={data.overallScore} />
    </div>

    <WeakestQuestions rows={data.weakestQuestions} />

    <div className="dashboard-report-grid">
      <CourseReview data={data} />
      <FacultyChart faculties={data.faculties} overallScore={data.overallScore} />
    </div>
  </div>
);

// -------------------------------------------------------- Khối chỉ số chính

/*
  Sáu chỉ số, dùng đúng bộ từ vựng của các trang còn lại: "Số phiếu đã thu" tách hẳn
  khỏi "Số phiếu hợp lệ", và tỷ lệ là TỶ LỆ PHẢN HỒI (đã thu / sĩ số) — cùng công
  thức với vế thứ nhất của ngưỡng tính điểm. "Tỷ lệ hoàn thành" cũ lấy phiếu hợp lệ
  chia sĩ số nên đứng cạnh hai dòng phiếu ở trên là đọc ra một con số thứ ba không
  suy được từ đâu.
*/
const MainIndicators: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Chỉ số chính</h3>
    <dl className="dashboard-kpi-list">
      <div className="dashboard-kpi">
        <dt>Số lớp học phần được khảo sát</dt>
        <dd>{data.sectionCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Tổng sĩ số</dt>
        <dd>{data.totalClassSize.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Số phiếu đã thu</dt>
        <dd>{data.totalResponseCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Số phiếu hợp lệ</dt>
        <dd>{data.validResponseCount.toLocaleString('vi-VN')}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Tỷ lệ phản hồi</dt>
        <dd>{data.responseRate.toFixed(1)}%</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Điểm tổng hợp toàn trường</dt>
        <dd>{data.overallScore === null ? '—' : data.overallScore.toFixed(2)}</dd>
      </div>
    </dl>
  </section>
);

// --------------------------------------------- Biểu đồ điểm từng tiêu chí

interface ChartTooltipItem {
  payload: DashboardQuestionScore;
}

const QuestionTooltip: React.FC<{ active?: boolean; payload?: ChartTooltipItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>C{item.questionOrder}</strong>
      <span>{item.questionText}</span>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {item.averageScore.toFixed(2)} / 5.0
      </span>
      <span>
        {item.sectionsBelowThreshold} lớp chấm câu này thấp hơn trung bình của chính câu đó từ 1
        độ lệch chuẩn trở lên
      </span>
    </div>
  );
};

const QuestionChart: React.FC<{
  questions: DashboardQuestionScore[];
  overallScore: number | null;
}> = ({ questions, overallScore }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">
      Điểm trung bình {questions.length} tiêu chí — toàn trường
    </h3>
    {questions.length === 0 ? (
      <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để dựng biểu đồ.</p>
    ) : (
      <div className="dashboard-chart-frame">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={questions.map((x) => ({ ...x, label: `C${x.questionOrder}` }))}
          margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
            interval={0}
          />
          <YAxis
            domain={scoreAxis.domain}
            ticks={scoreAxis.ticks}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
          />
          <Tooltip content={<QuestionTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
          {overallScore !== null && (
            <ReferenceLine
              y={overallScore}
              stroke="#68737d"
              strokeDasharray="4 4"
              label={{
                value: `Toàn trường ${overallScore.toFixed(2)}`,
                position: 'insideTopRight',
                fill: '#68737d',
                fontSize: 11,
              }}
            />
          )}
          <Bar dataKey="averageScore" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {questions.map((item) => (
              <Cell key={item.questionOrder} fill={barColor(item.averageScore)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    )}
  </section>
);

// ------------------------------------------------ Năm tiêu chí yếu nhất

// Bảng dùng đúng theme .catalog-table, giống bảng phân bố ở màn phân tích.
const WeakestQuestions: React.FC<{ rows: DashboardQuestionScore[] }> = ({ rows }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">5 tiêu chí yếu nhất toàn trường</h3>
    {rows.length === 0 ? (
      <p className="dashboard-report-note">Chưa có phiếu hợp lệ nào để xếp hạng tiêu chí.</p>
    ) : (
      <div className="catalog-table-scroll" tabIndex={0} aria-label="Tiêu chí yếu nhất">
        <table className="catalog-table dashboard-weakest-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '8%' }}>Câu</th>
              <th scope="col" style={{ width: '62%' }}>Nội dung</th>
              <th scope="col" style={{ width: '15%' }}>Điểm trung bình</th>
              <th
                scope="col"
                style={{ width: '15%' }}
                title="Lớp chấm câu này thấp hơn trung bình của chính câu đó từ 1 độ lệch chuẩn trở lên"
              >
                Lớp cảnh báo
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.questionOrder}>
                <td className="catalog-table__index">C{row.questionOrder}</td>
                <td>
                  <span className="catalog-cell-primary">{row.questionText}</span>
                </td>
                <td className="num">{row.averageScore.toFixed(2)}</td>
                <td className={row.sectionsBelowThreshold > 0 ? 'num is-flagged' : 'num'}>
                  {row.sectionsBelowThreshold}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

// -------------------------------------- Học phần cần rà soát ở cấp học phần

const CourseReview: React.FC<{ data: SemesterSurveyDashboard }> = ({ data }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Học phần cần rà soát ở cấp học phần</h3>
    <dl className="dashboard-kpi-list dashboard-kpi-list--warning">
      <div className="dashboard-kpi">
        <dt>Số học phần mọi lớp đều dưới ngưỡng</dt>
        <dd>{data.courseIssueCount}</dd>
      </div>
      <div className="dashboard-kpi">
        <dt>Số học phần chênh lệch lớn giữa các lớp</dt>
        <dd>{data.lecturerVarianceCount}</dd>
      </div>
    </dl>
  </section>
);

// ------------------------------------------- Biểu đồ điểm theo khoa/viện

interface FacultyTooltipItem {
  payload: DashboardFacultyScore;
}

const FacultyTooltip: React.FC<{ active?: boolean; payload?: FacultyTooltipItem[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.facultyName}</strong>
      <span style={{ color: barColor(item.averageScore) }}>
        Điểm TB: {item.averageScore.toFixed(2)} / 5.0
      </span>
      <span>{item.sectionCount} lớp có phiếu hợp lệ</span>
    </div>
  );
};

const FacultyChart: React.FC<{
  faculties: DashboardFacultyScore[];
  overallScore: number | null;
}> = ({ faculties, overallScore }) => (
  <section className="dashboard-report-block">
    <h3 className="dashboard-report-title">Điểm tổng hợp theo khoa / viện</h3>
    {faculties.length === 0 ? (
      <p className="dashboard-report-note">Chưa có khoa/viện nào thu được phiếu hợp lệ.</p>
    ) : (
      <div className="dashboard-chart-frame">
      <ResponsiveContainer width="100%" height={Math.max(220, faculties.length * 34 + 40)}>
        <BarChart
          data={faculties}
          layout="vertical"
          margin={{ top: 8, right: 32, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
          <XAxis
            type="number"
            domain={scoreAxis.domain}
            ticks={scoreAxis.ticks}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
            tick={{ fontSize: 11, fill: '#68737d' }}
          />
          <YAxis
            type="category"
            dataKey="facultyName"
            width={170}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: '#40505a' }}
          />
          <Tooltip content={<FacultyTooltip />} cursor={{ fill: 'rgba(7,136,184,0.06)' }} />
          {overallScore !== null && (
            <ReferenceLine x={overallScore} stroke="#68737d" strokeDasharray="4 4" />
          )}
          <Bar dataKey="averageScore" isAnimationActive={false} radius={[0, 2, 2, 0]}>
            {faculties.map((item) => (
              <Cell key={item.facultyName} fill={barColor(item.averageScore)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    )}
  </section>
);
