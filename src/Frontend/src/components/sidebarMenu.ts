import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CalendarRange,
  ChartColumn,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FolderTree,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Network,
  Presentation,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Table2,
  Upload,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { UnitSurveyType } from './unitReports/unitReportModel';
import { unitStatisticsTabId, type SurveyStatisticsPage } from './surveyStatisticsTabs';

/*
  Mục điều hướng của sidebar: nhãn và thứ tự.

  Tối đa hai tầng: nhóm (bấm để sổ xuống) → mục. Mục đứng một mình ở tầng trên cũng
  được. Mục trong nhóm cũng có thể là trang ngoài (externalUrl).

  Khai riêng khỏi component vì thanh trên cùng cũng đọc nhãn ở đây để mở đầu đường dẫn
  điều hướng. Một nguồn duy nhất nên đổi tên mục ở sidebar là đường dẫn đổi theo, không
  phải sửa hai chỗ rồi lệch nhau.
*/

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Trang ngoài hệ thống: bấm vào mở tab mới tới địa chỉ này thay vì chuyển trang bên
   * trong. Mục loại này không có quyền module riêng nên mọi vai trò đều thấy.
   */
  externalUrl?: string;
}

export interface SidebarMenuGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: SidebarMenuItem[];
  /**
   * Chỉ quản trị toàn trường thấy nhóm này, kể cả khi vai trò khác được bật quyền —
   * thống kê CTĐT và khảo sát giảng viên chưa có cách bó dữ liệu theo khoa / bộ môn,
   * và backend cũng chỉ trả số liệu cho quản trị toàn trường.
   */
  unrestrictedOnly?: boolean;
}

export type SidebarMenuEntry = SidebarMenuItem | SidebarMenuGroup;

export const isMenuGroup = (entry: SidebarMenuEntry): entry is SidebarMenuGroup =>
  'items' in entry;

/** Sáu trang thống kê, cùng nhãn và biểu tượng ở cả ba nhóm thống kê khảo sát. */
const statisticsPageItems: { page: SurveyStatisticsPage; label: string; icon: LucideIcon }[] = [
  { page: 'overview', label: 'Bảng điều khiển', icon: LayoutDashboard },
  { page: 'survey-dashboard', label: 'Tổng quan khảo sát', icon: Gauge },
  { page: 'progress', label: 'Tiến độ thu phiếu', icon: ChartColumn },
  { page: 'survey-statistics', label: 'Bảng dữ liệu khảo sát', icon: Table2 },
  { page: 'reports', label: 'Thống kê & Báo cáo', icon: BarChart3 },
  { page: 'survey-analysis', label: 'Phân tích chuyên sâu', icon: Sigma },
];

const unitStatisticsGroup = (
  surveyType: UnitSurveyType,
  label: string,
  icon: LucideIcon,
): SidebarMenuGroup => ({
  id: `${surveyType.toLowerCase()}-statistics`,
  label,
  icon,
  unrestrictedOnly: true,
  items: statisticsPageItems.map(({ page, label: itemLabel, icon: itemIcon }) => ({
    id: unitStatisticsTabId(surveyType, page),
    label: itemLabel,
    icon: itemIcon,
  })),
});

export const menuStructure: SidebarMenuEntry[] = [
  {
    // Nhóm học phần giữ mã tab cũ để bookmark và đường dẫn con của từng trang vẫn chạy.
    id: 'course-statistics',
    label: 'Thống kê khảo sát học phần',
    icon: BookOpen,
    items: statisticsPageItems.map(({ page, label, icon }) => ({ id: page, label, icon })),
  },
  unitStatisticsGroup('PROGRAM', 'Thống kê khảo sát chương trình đào tạo', GraduationCap),
  unitStatisticsGroup('LECTURER', 'Thống kê khảo sát giảng viên', Presentation),
  {
    // Ba mục, ba quyền riêng (docs/plans/tich-hop-phan-tich-diem-hoc-phan.md). Báo cáo nay là
    // trang trong hệ thống, thay cho trang chỉ xem bên ngoài của module audit.
    id: 'course-grade-analysis',
    label: 'Phân tích điểm học phần',
    icon: ChartNoAxesCombined,
    items: [
      { id: 'course-grade-upload', label: 'Tải lên dữ liệu điểm', icon: Upload },
      { id: 'course-grade-thresholds', label: 'Ngưỡng phân tích', icon: SlidersHorizontal },
      { id: 'course-grade-reports', label: 'Báo cáo phân tích', icon: BarChart3 },
    ],
  },
  {
    id: 'graduation',
    label: 'Thống kê tốt nghiệp',
    icon: Award,
    items: [
      { id: 'graduation-data-upload', label: 'Tải lên dữ liệu', icon: Upload },
      { id: 'graduation-statistics', label: 'Thống kê chi tiết', icon: BarChart3 },
    ],
  },
  {
    // Một nhóm cho cả ba loại khảo sát: loại chọn ngay ở bước đầu hộp thoại tạo đợt, và
    // trang đợt có thanh tab theo loại.
    id: 'surveys',
    label: 'Khảo sát',
    icon: ClipboardList,
    items: [
      { id: 'course-question-sets', label: 'Danh sách bộ câu hỏi', icon: ListChecks },
      { id: 'course-campaigns', label: 'Danh sách bài khảo sát', icon: ClipboardCheck },
    ],
  },
  {
    id: 'catalogs',
    label: 'Danh mục đào tạo',
    icon: FolderTree,
    items: [
      { id: 'academic-years', label: 'Năm học & học kỳ', icon: CalendarRange },
      { id: 'faculties', label: 'Khoa / Viện', icon: Building2 },
      { id: 'departments', label: 'Bộ môn', icon: Network },
      { id: 'lecturers', label: 'Giảng viên', icon: Presentation },
      { id: 'majors', label: 'Ngành đào tạo', icon: GraduationCap },
      { id: 'cohort-majors', label: 'Khoá ngành đào tạo', icon: UsersRound },
      { id: 'courses', label: 'Học phần', icon: BookOpen },
      { id: 'classes', label: 'Lớp học phần', icon: UsersRound },
    ],
  },
  {
    id: 'administration',
    label: 'Quản trị',
    icon: ShieldCheck,
    items: [
      { id: 'users-admin', label: 'Người dùng & phân quyền', icon: UserCog },
    ],
  },
];

/** Nhãn mục điều hướng theo mã tab — thanh trên cùng dùng để mở đầu đường dẫn. */
export const sidebarTabLabels: Record<string, string> = Object.fromEntries(
  menuStructure.flatMap((entry) =>
    (isMenuGroup(entry) ? entry.items : [entry]).map((item) => [item.id, item.label])),
);

/**
 * Nhãn nhóm chứa mục, theo mã tab. Ba nhóm thống kê khảo sát có mục trùng tên nhau
 * ("Tiến độ thu phiếu"...), nên đường dẫn trên cùng phải mở đầu bằng tên nhóm mới biết
 * đang xem loại nào.
 */
export const sidebarTabGroupLabels: Record<string, string> = Object.fromEntries(
  menuStructure.flatMap((entry) =>
    isMenuGroup(entry) ? entry.items.map((item) => [item.id, entry.label]) : []),
);
