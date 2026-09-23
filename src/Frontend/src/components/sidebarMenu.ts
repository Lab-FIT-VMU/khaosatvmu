import {
  BarChart3,
  BookOpen,
  Building2,
  ChartColumn,
  ClipboardCheck,
  FileCheck2,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Network,
  Presentation,
  School,
  Sigma,
  Table2,
  Upload,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/*
  Mục điều hướng của sidebar: nhãn và thứ tự.

  Khai riêng khỏi component vì thanh trên cùng cũng đọc nhãn ở đây để mở đầu đường dẫn
  điều hướng. Một nguồn duy nhất nên đổi tên mục ở sidebar là đường dẫn đổi theo, không
  phải sửa hai chỗ rồi lệch nhau.
*/

export interface SidebarMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface SidebarMenuGroup {
  section: string;
  items: SidebarMenuItem[];
}

export const menuStructure: SidebarMenuGroup[] = [
  {
    section: 'TỔNG QUAN',
    items: [
      { id: 'overview', label: 'Bảng điều khiển', icon: LayoutDashboard },
      { id: 'survey-dashboard', label: 'Tổng quan khảo sát', icon: Gauge },
      { id: 'progress', label: 'Tiến độ thu phiếu', icon: ChartColumn },
      { id: 'survey-statistics', label: 'Bảng dữ liệu khảo sát', icon: Table2 },
      { id: 'reports', label: 'Thống kê & Báo cáo', icon: BarChart3 },
      { id: 'survey-analysis', label: 'Phân tích chuyên sâu', icon: Sigma },
    ],
  },
  {
    section: 'THỐNG KÊ TỐT NGHIỆP',
    items: [
      { id: 'graduation-data-upload', label: 'Tải lên dữ liệu', icon: Upload },
      { id: 'graduation-statistics', label: 'Thống kê chi tiết', icon: BarChart3 },
    ],
  },
  {
    section: 'DANH MỤC ĐÀO TẠO',
    items: [
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
    section: 'KHẢO SÁT HỌC PHẦN',
    items: [
      { id: 'course-question-sets', label: 'Danh sách bộ khảo sát', icon: ListChecks },
      { id: 'course-campaigns', label: 'Danh sách đợt khảo sát', icon: ClipboardCheck },
    ],
  },
  {
    section: 'KHẢO SÁT CHƯƠNG TRÌNH',
    items: [
      { id: 'program-campaigns', label: 'Đợt khảo sát CTĐT', icon: School },
      { id: 'program-criteria', label: 'Tiêu chí CTĐT', icon: FileCheck2 },
    ],
  },
  {
    section: 'QUẢN TRỊ',
    items: [
      { id: 'users-admin', label: 'Người dùng & phân quyền', icon: UserCog },
    ],
  },
];

/** Nhãn mục điều hướng theo mã tab — thanh trên cùng dùng để mở đầu đường dẫn. */
export const sidebarTabLabels: Record<string, string> = Object.fromEntries(
  menuStructure.flatMap((group) => group.items.map((item) => [item.id, item.label])),
);
