import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  LoaderCircle,
  MessageSquareText,
  Target,
} from 'lucide-react';
import { useSemester } from '../context/semesterContext';
import { ScoringConfigNote } from '../components/ScoringConfigNote';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import type { CourseSectionSurvey, SemesterSurvey } from '../types';
import {
  COMPLETED_COMPLETION_RATE,
  LAGGING_COMPLETION_RATE,
} from '../utils/reportThresholds';
import '../styles/survey-operations.css';
// Thanh chọn học kỳ / đợt dùng .statistics-toolbar nằm trong tệp này.
import '../styles/survey-statistics.css';
import '../styles/catalogs.css';
import {
  campaignPlaceholder,
  getActiveSemesterSurveyId,
  selectAvailableSemesterSurveyId,
  setActiveSemesterSurveyId,
} from '../utils/surveySelection';

/*
  Ô chọn đợt khảo sát, viết riêng cho trang này.

  Không dùng <select> vì danh sách xổ xuống do trình duyệt vẽ, luôn giãn theo tên
  đợt dài nhất và tràn ra ngoài ô. Ở đây danh sách tự vẽ nên bám đúng bề rộng ô.

  Kiểu dáng nhúng thẳng trong tệp: trang được nạp lười, phụ thuộc vào tệp .css
  bên ngoài thì lần đầu vào trang ô chọn bung ra không còn hình hài gì.
*/
const campaignSelectCss = `
/* Co lại được: cố định 460px thì khi phóng to trình duyệt, thanh công cụ hết chỗ
   và nút Cập nhật điểm bị đẩy xuống dòng thứ hai. */
.campaign-select { position: relative; flex: 0 1 380px; min-width: 200px; }
.campaign-select__trigger {
  width: 100%; min-height: 34px; display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border: 1px solid var(--field-border); background: #fff; color: #000000;
  font: inherit; font-size: 13px; text-align: left; cursor: pointer;
}
.campaign-select__trigger:disabled { background: #f4f6f8; color: #8c969f; cursor: not-allowed; }
.campaign-select__trigger:focus-visible { outline: 2px solid rgba(7,136,184,.25); border-color: #0788b8; }
.campaign-select__value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-select__caret { flex: 0 0 auto; width: 14px; height: 14px; color: #000000; }
.campaign-select__list {
  position: fixed; z-index: 1000; margin: 0; padding: 4px 0; list-style: none;
  overflow-y: auto; border: 1px solid var(--field-border); background: #fff;
  box-shadow: 0 8px 24px rgba(15,30,45,.16);
}
.campaign-select__option {
  position: relative; overflow: hidden; container-type: inline-size;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 8px 12px; font-size: 13px; color: #000000; cursor: pointer;
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
.campaign-select__empty { padding: 10px 12px; color: #000000; font-size: 13px; text-align: center; }
.campaign-select__hint {
  position: fixed; z-index: 1001; padding: 9px 12px; border: 1px solid var(--field-border);
  background: #fff; box-shadow: 0 8px 22px rgba(15,30,45,.2); color: #000000;
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

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

import { foldVietnamese } from '../utils/vietnamese';

interface SurveyProgressPageProps {
  semesterSurveys: SemesterSurvey[];
  sectionSurveys: CourseSectionSurvey[];
  isLoading: boolean;
  loadError: string | null;
}

/**
 * Trang này chỉ theo dõi tiến độ THU phiếu, nên không mang theo số phiếu hợp lệ
 * hay bị lọc — chuyện hợp lệ là việc của các trang thống kê kết quả.
 */
interface ProgressItem {
  id: string;
  code: string;
  name: string;
  groupCode: string;
  lecturerName: string;
  departmentName: string;
  facultyName: string;
  targetCount: number;
  /** Mọi lượt nộp của lớp. */
  actualCount: number;
  /** Số phiếu đã thu chia tổng số phiếu phải thu. */
  rate: number;
  status: 'Đạt chỉ tiêu' | 'Đang thu' | 'Chậm tiến độ';
}

const progressColumns = [
  { key: 'facultyName', header: 'Khoa / Viện', width: 22 },
  { key: 'departmentName', header: 'Bộ môn', width: 20 },
  { key: 'name', header: 'Học phần', width: 28 },
  { key: 'code', header: 'Lớp học phần', width: 14, align: 'center' as const },
  { key: 'lecturerName', header: 'Giảng viên', width: 24 },
  { key: 'targetCount', header: 'Tổng số phiếu phải thu', width: 10, type: 'number' as const, align: 'right' as const },
  { key: 'actualCount', header: 'Số phiếu đã thu', width: 14, type: 'number' as const, align: 'right' as const },
  {
    // Xuất SỐ kèm mã định dạng chứ không xuất chuỗi "18%": ô chữ thì Excel sắp
    // theo bảng chữ cái, 100% rơi xuống dưới 18%.
    //
    // Không có số lẻ: bảng trên màn hình in tỷ lệ đã làm tròn thành số nguyên ("77%"),
    // để '0.000"%"' thì tệp lại hiện "77.000%" — hai nơi nói hai con số khác nhau.
    key: 'rate',
    header: 'Tỷ lệ phản hồi',
    width: 12,
    type: 'number' as const,
    align: 'right' as const,
    numberFormat: '0"%"',
  },
  { key: 'status', header: 'Trạng thái', width: 14, align: 'center' as const },
];

export const SurveyProgressPage: React.FC<SurveyProgressPageProps> = ({
  semesterSurveys,
  sectionSurveys,
  isLoading,
  loadError,
}) => {
  const {
    academicYears,
    activeSemesterId,
    activeSemesterLabel,
    setActiveSemesterId,
  } = useSemester();
  const [selectedSurveyId, setSelectedSurveyId] = useState<string>(getActiveSemesterSurveyId);
  const [search, setSearch] = useState('');

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

  // Không còn lựa chọn "tất cả đợt": trang luôn bám đúng một đợt, mặc định là đợt
  // đầu danh sách và tự nhảy sang đợt khác khi danh sách đổi theo học kỳ.
  useEffect(() => {
    setSelectedSurveyId((prev) => selectAvailableSemesterSurveyId(semesterSurveys, prev));
  }, [semesterSurveys]);

  const displayedSections = useMemo(() => {
    if (!selectedSurveyId) return [];
    const targetId = Number(selectedSurveyId);
    return sectionSurveys.filter((s) => s.semesterSurveyId === targetId);
  }, [sectionSurveys, selectedSurveyId]);

  // Mỗi lớp học phần đã được phát phiếu là một dòng theo dõi. Các số phiếu đều do
  // API khảo sát đếm sống từ bảng "SurveyResponses", không phải số tạm.
  //
  // Tỷ lệ phản hồi tính trên MỌI phiếu đã thu chia tổng số phiếu phải thu: ở đây chỉ cần biết sinh
  // viên đã nộp tới đâu, còn phiếu có qua bộ lọc nhiễu hay không là chuyện của
  // các trang thống kê kết quả.
  const progressItems: ProgressItem[] = useMemo(() => {
    return displayedSections.map((section) => {
      const rate = Math.round((section.responseCount / (section.classSize || 1)) * 100);

      return {
        id: String(section.courseSectionSurveyId),
        code: section.sectionName,
        name: section.courseName,
        groupCode: section.sectionName,
        // API đã trả sẵn tên đọc từ tệp import cho lớp chưa gắn được mã giảng viên,
        // nên tên "giảng viên không xác định" cũng vào đúng cột này.
        lecturerName: section.lecturerName || 'Chưa phân công',
        departmentName: section.departmentName,
        facultyName: section.facultyName,
        targetCount: section.classSize,
        actualCount: section.responseCount,
        rate,
        status: rate >= COMPLETED_COMPLETION_RATE
          ? 'Đạt chỉ tiêu'
          : rate >= LAGGING_COMPLETION_RATE
            ? 'Đang thu'
            : 'Chậm tiến độ',
      };
    });
  }, [displayedSections]);

  // Calculate Overall Progress Metrics
  const totalTarget = progressItems.reduce((acc, curr) => acc + curr.targetCount, 0);
  const totalActual = progressItems.reduce((acc, curr) => acc + curr.actualCount, 0);
  const overallRate = Math.round((totalActual / (totalTarget || 1)) * 100);

  const completedCount = progressItems.filter((i) => i.status === 'Đạt chỉ tiêu').length;
  const laggingCount = progressItems.filter((i) => i.status === 'Chậm tiến độ').length;
  const openCommentCount = displayedSections.reduce(
    (total, section) => total + (Number(section.openCommentCount) || 0),
    0
  );

  const filtered = progressItems.filter(
    (item) =>
      foldVietnamese(item.code).includes(search.toLowerCase()) ||
      foldVietnamese(item.name).includes(search.toLowerCase()) ||
      foldVietnamese(item.lecturerName).includes(search.toLowerCase())
  );
  const selectedSurvey = semesterSurveys.find(
    (survey) => String(survey.semesterSurveyId) === selectedSurveyId
  );

  const exportConfig = useMemo(() => {
    const laggingItems = progressItems.filter((i) => i.status === 'Chậm tiến độ');
    const completedItems = progressItems.filter((i) => i.status === 'Đạt chỉ tiêu');

    return {
      fileName: `bao-cao-tien-do-thu-phieu-dot-khao-sat-${
        selectedSurvey?.surveyName || 'hoc-phan'
      }-${activeSemesterLabel}`,
      title: 'BÁO CÁO TIẾN ĐỘ THU PHIẾU KHẢO SÁT Ý KIẾN SINH VIÊN',
      subtitle: 'Hệ thống Khảo sát & Đảm bảo Chất lượng Đào tạo VMU',
      breadcrumb: ['Tiến độ thu phiếu'],
      info: {
        'Tổng số lớp khảo sát': progressItems.length,
        'Tổng số phiếu phải thu': totalTarget,
        'Số phiếu đã thu': `${totalActual} (đạt ${overallRate}%)`,
        [`Lớp đạt chỉ tiêu (≥${COMPLETED_COMPLETION_RATE}%)`]: completedCount,
        [`Lớp chậm tiến độ (<${LAGGING_COMPLETION_RATE}%)`]: laggingCount,
      },
      summaryNotes: [
        'Tỷ lệ phản hồi = Số phiếu đã thu ÷ Tổng số phiếu phải thu.',
        'Báo cáo này chỉ theo dõi tiến độ thu phiếu, không xét phiếu hợp lệ hay bị bộ lọc loại.',
      ],
      sheets: [
        {
          sheetName: 'Tien do toan bo lop',
          // Đúng những dòng đang nằm trên bảng sau ô tìm kiếm, không phải cả danh sách:
          // lọc xong rồi xuất mà tệp vẫn đầy đủ thì người nhận không đối chiếu được.
          title: `1. TIẾN ĐỘ THU PHIẾU TẤT CẢ CÁC LỚP HỌC PHẦN (${filtered.length} LỚP)`,
          columns: progressColumns,
          data: filtered,
        },
        {
          sheetName: 'Lop cham tien do',
          title: `2. DANH SÁCH LỚP CHẬM TIẾN ĐỘ CẦN ĐÔN ĐỐC (${laggingItems.length} LỚP)`,
          subtitle: `Các lớp có tỷ lệ phản hồi dưới ${LAGGING_COMPLETION_RATE}% - cần gửi thông báo nhắc nhở`,
          columns: progressColumns,
          data: laggingItems,
          summaryNotes: ['Đề nghị các Khoa/Viện và Bộ môn thông báo đến giảng viên nhắc nhở sinh viên tham gia khảo sát.'],
        },
        {
          sheetName: 'Lop da hoan thanh',
          title: `3. DANH SÁCH LỚP ĐẠT CHỈ TIÊU XUẤT SẮC (${completedItems.length} LỚP)`,
          subtitle: `Các lớp đã đạt tỷ lệ phản hồi từ ${COMPLETED_COMPLETION_RATE}% trở lên`,
          columns: progressColumns,
          data: completedItems,
        },
      ],
    };
  }, [
    progressItems,
    filtered,
    totalTarget,
    totalActual,
    overallRate,
    completedCount,
    laggingCount,
    selectedSurvey?.surveyName,
    activeSemesterLabel,
  ]);

  // Bề rộng theo phần trăm để tỷ lệ cột giữ nguyên trên mọi cỡ màn hình.
  const columns: Column<ProgressItem>[] = [
    {
      key: 'facultyName',
      header: 'Khoa / Viện',
      width: '16%',
      filterValue: (item) => item.facultyName,
      render: (item) => <span className="operations-primary-text">{item.facultyName}</span>,
    },
    {
      key: 'departmentName',
      header: 'Bộ môn',
      width: '14%',
      filterValue: (item) => item.departmentName,
      render: (item) => <span className="operations-primary-text">{item.departmentName}</span>,
    },
    {
      key: 'name',
      header: 'Học phần',
      width: '18%',
      filterValue: (item) => item.name,
      render: (item) => <strong className="operations-primary-text">{item.name}</strong>,
    },
    {
      key: 'code',
      header: 'Lớp học phần',
      width: '5%',
      filterValue: (item) => item.code,
      render: (item) => <span className="operations-code">{item.code}</span>,
    },
    {
      key: 'lecturerName',
      header: 'Giảng viên',
      width: '15%',
      filterValue: (item) => item.lecturerName,
      render: (item) => (
        <span className="operations-primary-text">{item.lecturerName}</span>
      ),
    },
    {
      key: 'targetCount',
      header: 'Tổng số phiếu phải thu',
      width: '5%',
      filterValue: (item) => String(item.targetCount),
      numeric: true,
      render: (item) => <span className="operations-primary-text">{item.targetCount}</span>,
    },
    {
      key: 'actualCount',
      header: 'Số phiếu đã thu',
      width: '7%',
      filterValue: (item) => String(item.actualCount),
      numeric: true,
      render: (item) => <span className="operations-primary-text">{item.actualCount}</span>,
    },
    {
      key: 'progress',
      header: 'Tỷ lệ phản hồi',
      width: '10%',
      filterValue: (item) => String(item.rate),
      numeric: true,
      quickFilters: [
        {
          label: `Đạt chỉ tiêu (≥${COMPLETED_COMPLETION_RATE}%)`,
          match: (value) => Number(value) >= COMPLETED_COMPLETION_RATE,
        },
        {
          label: `Đang thu (${LAGGING_COMPLETION_RATE}-${COMPLETED_COMPLETION_RATE - 1}%)`,
          match: (value) =>
            Number(value) >= LAGGING_COMPLETION_RATE
            && Number(value) < COMPLETED_COMPLETION_RATE,
        },
        {
          label: `Chậm tiến độ (<${LAGGING_COMPLETION_RATE}%)`,
          match: (value) => Number(value) < LAGGING_COMPLETION_RATE,
        },
      ],
      render: (item) => {
        const progressClass = item.rate >= COMPLETED_COMPLETION_RATE
          ? 'operations-progress-fill--success'
          : item.rate >= LAGGING_COMPLETION_RATE
            ? 'operations-progress-fill--warning'
            : '';

        return (
          <div className="operations-progress">
            <div className="operations-progress-meta">
              <strong>{item.rate}%</strong>
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
    },
    {
      key: 'status',
      header: 'Trạng thái',
      width: '10%',
      filterValue: (item) => item.status,
      render: (item) => {
        let statusClass = 'operations-status--danger';
        if (item.status === 'Đạt chỉ tiêu') statusClass = 'operations-status--success';
        else if (item.status === 'Đang thu') statusClass = 'operations-status--warning';

        return <span className={`operations-status ${statusClass}`}>{item.status}</span>;
      },
    },
  ];

  return (
    <div className="survey-operations-page operations-table-page survey-progress-page">
      {loadError && (
        <div className="operations-feedback operations-feedback--error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading ? (
        <div className="operations-empty" role="status">
          <LoaderCircle className="operation-icon auth-spin" aria-hidden="true" />
          <strong>Đang tải tiến độ thu phiếu...</strong>
        </div>
      ) : (
        <>
          {/* Cùng bố cục với trang Tổng quan khảo sát: bốn phần nằm ngang một hàng
              ở góc trái trên — nhãn Học kỳ, ô chọn kỳ, nhãn Đợt khảo sát, ô chọn đợt. */}
          <section className="statistics-toolbar" aria-label="Bộ lọc tiến độ">
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
                id="progress-campaign-select"
                value={selectedSurveyId}
                onChange={(value) => {
                  setSelectedSurveyId(value);
                  setActiveSemesterSurveyId(value);
                }}
                disabled={semesterSurveys.length === 0}
                placeholder={campaignPlaceholder(isLoading, semesterSurveys.length)}
                options={semesterSurveys.map((survey) => ({
                  value: String(survey.semesterSurveyId),
                  label: `${survey.surveyName} · ${survey.sectionSurveyCount} lớp`,
                }))}
              />
            </div>
          </section>

          <ScoringConfigNote />

          <section className="operations-metrics" aria-label="Tổng quan tiến độ">
            <div className="operation-metric">
              <span className="operation-metric-icon"><Target className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Số phiếu dự kiến thu về</span>
              <strong className="operation-metric-value">{totalTarget.toLocaleString()}</strong>
              <span className="operation-metric-note">Theo tổng số phiếu phải thu tất cả nhóm lớp</span>
            </div>
            <div className="operation-metric operation-metric--success">
              <span className="operation-metric-icon"><ClipboardCheck className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Số phiếu đã thu</span>
              <strong className="operation-metric-value">{totalActual.toLocaleString()}</strong>
              <span className="operation-metric-note">Tỷ lệ phản hồi đạt {overallRate}% theo số phiếu dự kiến thu về  </span>
            </div>
            <div className="operation-metric operation-metric--warning">
              <span className="operation-metric-icon"><CheckCircle2 className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Nhóm đạt chỉ tiêu (≥ {COMPLETED_COMPLETION_RATE}%)</span>
              <strong className="operation-metric-value">{completedCount} / {progressItems.length}</strong>
              <span className="operation-metric-note">Nhóm đạt chỉ tiêu thu phiếu</span>
            </div>
            <div className="operation-metric">
              <span className="operation-metric-icon"><MessageSquareText className="operation-icon" aria-hidden="true" /></span>
              <span className="operation-metric-label">Số ý kiến mở</span>
              <strong className="operation-metric-value">{(Number.isFinite(openCommentCount) ? openCommentCount : 0).toLocaleString()}</strong>
              <span className="operation-metric-note">Ý kiến khác do sinh viên nhập</span>
            </div>
          </section>

          {/* Main Table */}
          <DataTable
            columns={columns}
            data={filtered}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Tìm mã lớp HP, nhóm N01/N02, tên môn hoặc giảng viên..."
            exportConfig={exportConfig}
            emptyMessage="Chưa có lớp học phần nào được phát phiếu khảo sát."
            keyExtractor={(item) => item.id}
            showIndex={false}
          />
        </>
      )}
    </div>
  );
};
