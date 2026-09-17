import { useEffect, useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  School,
  Sigma,
  Table2,
  UserCog,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { canAccessModule } from '../auth/modulePermissions';
import { useAuth } from '../auth/authContext';
import { canAccessDashboard } from '../auth/roles';
import { HeaderSemesterPicker } from './HeaderSemesterPicker';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeCampaignsCount: number;
  permissions: readonly string[];
}

interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface SidebarGroup {
  section: string;
  items: SidebarItem[];
}

/** Nhớ trạng thái thu gọn giữa các lần mở web. */
const collapsedStorageKey = 'khaosatvmu.sidebar.collapsed';

export function Sidebar({
  currentTab,
  onSelectTab,
  activeCampaignsCount,
  permissions,
}: SidebarProps) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { activeProfile } = useAuth();
  const dashboardAllowed = canAccessDashboard(activeProfile?.roleCode);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(collapsedStorageKey) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(collapsedStorageKey, isCollapsed ? '1' : '0');
    // Bề rộng thật nằm ở biến CSS của thẻ gốc để phần nội dung bên phải giãn theo.
    document.documentElement.classList.toggle('has-collapsed-sidebar', isCollapsed);
  }, [isCollapsed]);

  useEffect(() => {
    if (!isMobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMobileOpen]);

  const menuGroups: SidebarGroup[] = [
    {
      section: 'TỔNG QUAN',
      items: [
        { id: 'overview', label: 'Bảng điều khiển', icon: LayoutDashboard },
        { id: 'survey-dashboard', label: 'Tổng quan khảo sát', icon: Gauge },
        { id: 'progress', label: 'Tiến độ thu phiếu', icon: ChartColumn },
        { id: 'survey-statistics', label: 'Bảng dữ liệu khảo sát', icon: Table2 },
        { id: 'reports', label: 'Thống kê & Báo cáo', icon: BarChart3 },
        { id: 'survey-analysis', label: 'Thống kê chi tiết', icon: Sigma },
        { id: 'graduation-analytics', label: 'Thống kê tốt nghiệp', icon: GraduationCap },
      ],
    },
    {
      section: 'DANH MỤC ĐÀO TẠO',
      items: [
        { id: 'faculties', label: 'Khoa / Viện', icon: Building2 },
        { id: 'departments', label: 'Bộ môn', icon: Network },
        { id: 'lecturers', label: 'Giảng viên', icon: Presentation },
        { id: 'majors', label: 'Ngành đào tạo', icon: GraduationCap },
        { id: 'courses', label: 'Học phần', icon: BookOpen },
        { id: 'classes', label: 'Lớp học phần', icon: UsersRound },
      ],
    },
    {
      section: 'KHẢO SÁT HỌC PHẦN',
      items: [
        { id: 'course-question-sets', 
          label: 'Danh sách bộ khảo sát', icon: ListChecks },
        {
          id: 'course-campaigns',
          label: 'Danh sách đợt khảo sát',
          icon: ClipboardCheck,
          badge: activeCampaignsCount > 0 ? activeCampaignsCount : undefined,
        },
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
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          canAccessModule(permissions, item.id)
          // Bảng điều khiển tạm đóng với giảng viên và trưởng bộ môn.
          && (item.id !== 'overview' || dashboardAllowed)
      ),
    }))
    .filter((group) => group.items.length > 0);

  const handleSelect = (tab: string) => {
    onSelectTab(tab);
    setIsMobileOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        aria-controls="main-sidebar"
        aria-expanded={isMobileOpen}
        aria-label="Mở điều hướng"
        title="Mở điều hướng"
        onClick={() => setIsMobileOpen(true)}
      >
        <PanelLeftOpen aria-hidden="true" />
      </button>

      <button
        type="button"
        className={`sidebar-overlay ${isMobileOpen ? 'is-visible' : ''}`}
        aria-label="Đóng điều hướng"
        tabIndex={isMobileOpen ? 0 : -1}
        onClick={() => setIsMobileOpen(false)}
      />

      <aside
        id="main-sidebar"
        className={`sidebar ${isMobileOpen ? 'is-mobile-open' : ''} ${
          isCollapsed ? 'is-collapsed' : ''
        }`}
      >
        <div className="sidebar-header">
          <img className="vmu-logo-icon" src="/vmu-logo.png" alt="" aria-hidden="true" />
          <div className="sidebar-header-text">
            <h2>KHẢO SÁT VMU</h2>
            <p>Quản lý chất lượng đào tạo</p>
          </div>
          <button
            type="button"
            className="sidebar-close-button"
            aria-label="Đóng điều hướng"
            title="Đóng điều hướng"
            onClick={() => setIsMobileOpen(false)}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {/* Học kỳ làm việc chi phối gần như mọi trang bên dưới, nên đứng ngay đầu
            thanh điều hướng thay vì nằm cuối, nơi người dùng phải cuộn mới thấy. */}
        <div className="sidebar-semester-bar">
          <HeaderSemesterPicker />
        </div>

        <nav className="sidebar-menu" aria-label="Điều hướng chính">
          {menuGroups.map((group) => (
            <section className="menu-section" key={group.section}>
              <h3 className="menu-section-title">{group.section}</h3>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`menu-item ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    // Thu gọn thì chỉ còn biểu tượng, tên trang chuyển thành chú
                    // thích của trình duyệt để vẫn biết mình đang trỏ vào đâu.
                    title={isCollapsed ? item.label : undefined}
                    onClick={() => handleSelect(item.id)}
                  >
                    <Icon className="menu-icon" aria-hidden="true" />
                    <span className="menu-label">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="menu-count" aria-label={`${item.badge} đợt đang mở`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-collapse-bar">
          <button
            type="button"
            className="sidebar-collapse-button"
            aria-label={isCollapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
            title={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="menu-icon" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="menu-icon" aria-hidden="true" />
            )}
            <span className="menu-label">Thu gọn</span>
          </button>
        </div>
      </aside>
    </>
  );
}
