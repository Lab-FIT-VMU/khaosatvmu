import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { AuthProfile, AuthUser } from '../types';
import { ProfileSelectionDialog } from './ProfileSelectionDialog';
import { UserAccountMenu } from './UserAccountMenu';

interface HeaderProps {
  currentTab: string;
  user: AuthUser;
  activeProfile: AuthProfile;
  availableProfiles: AuthProfile[];
  onSwitchProfile: (profileId: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

interface TabContext {
  section: string;
  title: string;
}

const tabContexts: Record<string, TabContext> = {
  overview: { section: 'Tổng quan', title: 'Bảng điều khiển' },
  progress: { section: 'Tổng quan', title: 'Tiến độ thu phiếu' },
  'survey-analysis': { section: 'Tổng quan', title: 'Thống kê chi tiết' },
  faculties: { section: 'Danh mục đào tạo', title: 'Khoa / Viện' },
  departments: { section: 'Danh mục đào tạo', title: 'Bộ môn' },
  lecturers: { section: 'Danh mục đào tạo', title: 'Giảng viên' },
  majors: { section: 'Danh mục đào tạo', title: 'Ngành đào tạo' },
  courses: { section: 'Danh mục đào tạo', title: 'Học phần' },
  classes: { section: 'Danh mục đào tạo', title: 'Lớp học phần' },
  criteria: { section: 'Khảo sát học phần', title: 'Bộ câu hỏi khảo sát' },
  campaigns: { section: 'Khảo sát học phần', title: 'Khảo sát học phần' },
  'course-question-sets': { section: 'Khảo sát học phần', title: 'Bộ câu hỏi khảo sát' },
  'course-campaigns': { section: 'Khảo sát học phần', title: 'Khảo sát học phần' },
  'program-criteria': { section: 'Khảo sát chương trình', title: 'Tiêu chí CTĐT' },
  'program-campaigns': { section: 'Khảo sát chương trình', title: 'Đợt khảo sát CTĐT' },
  'users-admin': { section: 'Quản trị', title: 'Người dùng & phân quyền' },
};

const roleNames: Record<string, string> = {
  ADMIN: 'Quản trị hệ thống',
  LECTURER: 'Giảng viên',
  DEPARTMENT_MANAGER: 'Quản lý đơn vị',
  SURVEY_ADMIN: 'Quản trị khảo sát',
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
  const context = tabContexts[currentTab] ?? {
    section: 'Hệ thống khảo sát',
    title: 'Trường Đại học Hàng hải Việt Nam',
  };
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
        <div className="header-breadcrumb">
          <span>Hệ thống khảo sát</span>
          <ChevronRight aria-hidden="true" />
          <span>{context.section}</span>
        </div>
        <h1>{context.title}</h1>
      </div>

      <div className="header-actions">
        <UserAccountMenu
          user={user}
          activeProfile={activeProfile}
          roleName={roleNames[activeProfile.roleCode] ?? activeProfile.roleCode}
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
