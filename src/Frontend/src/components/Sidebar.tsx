import { useEffect, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { canAccessModule } from '../auth/modulePermissions';
import { useAuth } from '../auth/authContext';
import { canAccessDashboard } from '../auth/roles';
import { HeaderSemesterPicker } from './HeaderSemesterPicker';
import { menuStructure } from './sidebarMenu';

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

  const menuGroups: SidebarGroup[] = menuStructure
    .map((group) => ({
      ...group,
      items: group.items
        .filter(
          (item) =>
            // Tải lên dữ liệu tốt nghiệp có quyền module riêng (GRADUATION_UPLOAD_ACCESS)
            // nên không cần lọc thêm theo vai trò ở đây; vai trò chỉ đọc không được cấp
            // quyền đó, và backend vẫn từ chối nếu ai đó bật nhầm.
            canAccessModule(permissions, item.id)
            // Bảng điều khiển tạm đóng với giảng viên và các trưởng đơn vị.
            && (item.id !== 'overview' || dashboardAllowed)
        )
        // Huy hiệu "đợt đang mở" chỉ có nghĩa với mục danh sách đợt khảo sát học phần.
        .map((item) => (item.id === 'course-campaigns' && activeCampaignsCount > 0
          ? { ...item, badge: activeCampaignsCount }
          : item)),
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
