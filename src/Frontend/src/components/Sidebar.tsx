import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { canAccessModule } from '../auth/modulePermissions';
import { useAuth } from '../auth/authContext';
import { canAccessDashboard, isUnrestrictedRole } from '../auth/roles';
import { HeaderSemesterPicker } from './HeaderSemesterPicker';
import { isMenuGroup, menuStructure } from './sidebarMenu';
import { parseUnitStatisticsTab } from './surveyStatisticsTabs';

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
  externalUrl?: string;
  section?: string;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: SidebarItem[];
}

type SidebarEntry = SidebarItem | SidebarGroup;

const isGroup = (entry: SidebarEntry): entry is SidebarGroup => 'items' in entry;

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
  const unrestricted = isUnrestrictedRole(activeProfile?.roleCode);

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

  const isItemVisible = (item: SidebarItem) => {
    // Bảng điều khiển (cả bản CTĐT / giảng viên) tạm đóng với giảng viên và các trưởng
    // đơn vị.
    const page = parseUnitStatisticsTab(item.id)?.page ?? item.id;
    return (
      // Tải lên dữ liệu tốt nghiệp có quyền module riêng (GRADUATION_UPLOAD_ACCESS)
      // nên không cần lọc thêm theo vai trò ở đây; vai trò chỉ đọc không được cấp
      // quyền đó, và backend vẫn từ chối nếu ai đó bật nhầm.
      canAccessModule(permissions, item.id)
      && (page !== 'overview' || dashboardAllowed)
    );
  };

  // Chỉ giữ mục người dùng mở được; nhóm rỗng thì ẩn luôn.
  const entries: SidebarEntry[] = menuStructure.flatMap<SidebarEntry>((entry) => {
    if (!isMenuGroup(entry)) return isItemVisible(entry) ? [entry] : [];
    if (entry.unrestrictedOnly && !unrestricted) return [];
    const items = entry.items
      .filter(isItemVisible)
      // Huy hiệu "đợt đang mở" chỉ có nghĩa với mục danh sách bài khảo sát.
      .map((item) => (item.id === 'course-campaigns' && activeCampaignsCount > 0
        ? { ...item, badge: activeCampaignsCount }
        : item));
    return items.length > 0 ? [{ ...entry, items }] : [];
  });

  const activeGroupId = entries.find(
    (entry) => isGroup(entry) && entry.items.some((item) => item.id === currentTab),
  )?.id ?? null;

  // Chỉ tự mở nhóm chứa trang đang xem; các nhóm khác người dùng tự bấm mở.
  const [expanded, setExpanded] = useState<string[]>(() => (activeGroupId ? [activeGroupId] : []));
  useEffect(() => {
    if (activeGroupId) {
      setExpanded((prev) => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]));
    }
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    // Đang thu gọn thì không có chỗ sổ danh sách: mở rộng thanh rồi mở đúng nhóm vừa bấm.
    if (isCollapsed) {
      setIsCollapsed(false);
      setExpanded([groupId]);
      return;
    }
    setExpanded((prev) => (prev.includes(groupId)
      ? prev.filter((id) => id !== groupId)
      : [...prev, groupId]));
  };

  const handleSelect = (tab: string) => {
    onSelectTab(tab);
    setIsMobileOpen(false);
  };

  const renderItem = (item: SidebarItem, isChild: boolean) => {
    const Icon = item.icon;
    const isActive = currentTab === item.id;
    const className = `menu-item${isChild ? ' menu-item--child' : ''}`;

    // Trang ngoài: liên kết thật mở tab mới, nên chuột giữa / Ctrl + bấm vẫn dùng được
    // như mọi đường link. noopener để trang kia không điều khiển được tab của hệ thống
    // qua window.opener.
    if (item.externalUrl) {
      return (
        <a
          key={item.id}
          className={className}
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.label} (mở trong tab mới)`}
          title={isCollapsed ? `${item.label} (mở tab mới)` : 'Mở trong tab mới'}
          onClick={() => setIsMobileOpen(false)}
        >
          <Icon className="menu-icon" aria-hidden="true" />
          <span className="menu-label">{item.label}</span>
          <ExternalLink className="menu-external-icon" aria-hidden="true" />
        </a>
      );
    }

    return (
      <button
        type="button"
        key={item.id}
        className={`${className}${isActive ? ' active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        // Thu gọn thì chỉ còn biểu tượng, tên trang chuyển thành chú thích của trình
        // duyệt để vẫn biết mình đang trỏ vào đâu.
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
          {entries.map((entry) => {
            if (!isGroup(entry)) return renderItem(entry, false);

            const GroupIcon = entry.icon;
            const isOpen = expanded.includes(entry.id) && !isCollapsed;
            const containsActive = entry.id === activeGroupId;
            const panelId = `sidebar-group-${entry.id}`;

            return (
              <div className="menu-group" key={entry.id}>
                <button
                  type="button"
                  className={`menu-item menu-group-toggle${containsActive ? ' contains-active' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  title={isCollapsed ? entry.label : undefined}
                  onClick={() => toggleGroup(entry.id)}
                >
                  <GroupIcon className="menu-icon" aria-hidden="true" />
                  <span className="menu-label">{entry.label}</span>
                  <ChevronDown
                    className={`menu-group-chevron${isOpen ? ' is-open' : ''}`}
                    aria-hidden="true"
                  />
                </button>

                {isOpen && (
                  <div className="menu-group-items" id={panelId}>
                    {entry.items.map((item, index) => {
                      // Tiêu đề nhỏ ("Báo cáo"…) đứng trước mục đầu tiên của mỗi phần.
                      const heading = item.section && item.section !== entry.items[index - 1]?.section
                        ? <div className="menu-section-label" key={`section-${item.section}`}>{item.section}</div>
                        : null;
                      return heading ? [heading, renderItem(item, true)] : renderItem(item, true);
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
