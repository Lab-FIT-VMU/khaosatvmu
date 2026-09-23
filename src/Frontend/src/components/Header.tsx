import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { roleDisplayName } from '../auth/roles';
import { useBreadcrumbTrail } from '../context/breadcrumbTrail';
import type { AuthProfile, AuthUser } from '../types';
import { ProfileSelectionDialog } from './ProfileSelectionDialog';
import { sidebarTabLabels } from './sidebarMenu';
import { UserAccountMenu } from './UserAccountMenu';

interface HeaderProps {
  currentTab: string;
  user: AuthUser;
  activeProfile: AuthProfile;
  availableProfiles: AuthProfile[];
  onSwitchProfile: (profileId: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

/**
 * Dòng 1 của thanh trên cùng, cố định cho mọi trang.
 */
const institutionName = 'Trường Đại học Hàng hải Việt Nam';

/**
 * Nhãn cho các mã tab cũ còn nằm trong bookmark mà sidebar không còn mục riêng.
 * Tab nào có mục trên sidebar thì lấy nhãn từ đó, khỏi phải khai lại hai nơi.
 */
const legacyTabLabels: Record<string, string> = {
  'graduation-analytics': 'Tải lên dữ liệu',
  'graduation-analytics-2': 'Tải lên dữ liệu',
  criteria: 'Danh sách bộ khảo sát',
  campaigns: 'Danh sách đợt khảo sát',
};

export function Header({
  currentTab,
  user,
  activeProfile,
  availableProfiles,
  onSwitchProfile,
  onLogout,
}: HeaderProps) {
  const [busy, setBusy] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
  /*
    Dòng 2 là đường dẫn điều hướng: mở đầu bằng tên mục đang chọn trên sidebar, rồi
    tới các cấp sâu hơn mà chính trang khai ra (tab con, khoa/viện, lớp...). Không có
    cụm "Hệ thống khảo sát" ở đầu — mục đầu tiên phải là mục người dùng vừa bấm.
  */
  const trail = useBreadcrumbTrail();
  const crumbs = [
    sidebarTabLabels[currentTab] ?? legacyTabLabels[currentTab] ?? 'Bảng điều khiển',
    ...trail,
  ].filter((crumb, index, all) => crumb.trim() !== '' && crumb !== all[index - 1]);
  const handleSwitch = async (profileId: string) => {
    if (profileId === activeProfile.id) return;
    setBusy(true);
    setSwitchingProfileId(profileId);
    try {
      await onSwitchProfile(profileId);
      const selectedProfile = availableProfiles.find((profile) => profile.id === profileId);
      toast.success('Đã chuyển hồ sơ làm việc', {
        description: selectedProfile?.name,
      });
      setIsProfileDialogOpen(false);
    } catch {
      toast.error('Không thể đổi hồ sơ', {
        description: 'Hãy kiểm tra lại phiên đăng nhập và thử lại.',
      });
    } finally {
      setBusy(false);
      setSwitchingProfileId(null);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await onLogout();
      toast.success('Đã đăng xuất');
    } catch {
      toast.error('Không thể đăng xuất', {
        description: 'Hãy thử lại sau ít phút.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="top-header">
      <div className="header-title-area">
        {/* Tên trường đứng trên, cố định cho mọi trang; đường dẫn điều hướng xuống dưới:
            đi vào trang nào thì dòng dưới hiện tới trang đó, vào sâu tiếp thì nối thêm. */}
        <h1>{institutionName}</h1>
        <nav className="header-breadcrumb" aria-label="Đường dẫn điều hướng">
          {crumbs.map((crumb, index) => (
            <Fragment key={crumb}>
              {index > 0 && <ChevronRight aria-hidden="true" />}
              <span>{crumb}</span>
            </Fragment>
          ))}
        </nav>
      </div>

      <div className="header-actions">
        <UserAccountMenu
          user={user}
          activeProfile={activeProfile}
          roleName={roleDisplayName(activeProfile.roleCode)}
          busy={busy}
          onChangeProfile={() => setIsProfileDialogOpen(true)}
          onLogout={() => void handleLogout()}
        />
      </div>

      {isProfileDialogOpen && (
        <ProfileSelectionDialog
          profiles={availableProfiles}
          selectedId={switchingProfileId}
          currentProfileId={activeProfile.id}
          dismissible
          title="Thay đổi phiên làm việc"
          description="Quyền và dữ liệu hiển thị sẽ được cập nhật theo profile bạn chọn."
          onSelect={(profileId) => void handleSwitch(profileId)}
          onClose={() => {
            if (!busy) setIsProfileDialogOpen(false);
          }}
        />
      )}
    </header>
  );
}
