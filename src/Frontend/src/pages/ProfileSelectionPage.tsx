import { useEffect, useState } from 'react';
import { useAuth } from '../auth/authContext';
import { ApiError } from '../services/apiClient';
import { ProfileSelectionDialog } from '../components/ProfileSelectionDialog';
import type { AuthProfile } from '../types';
import '../styles/auth-admin.css';

export function ProfileSelectionPage() {
  const auth = useAuth();
  const [profiles, setProfiles] = useState<AuthProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorTraceId, setErrorTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.loadPendingProfiles()
      .then(setProfiles)
      .catch(error => {
        setErrorCode(error instanceof ApiError ? error.errorCode : 'AUTH_REQUEST_FAILED');
        setErrorTraceId(error instanceof ApiError ? error.traceId : null);
      })
      .finally(() => setLoading(false));
  }, [auth]);

  const selectProfile = async (profileId: string) => {
    setSelectedId(profileId);
    setErrorCode(null);
    setErrorTraceId(null);
    try {
      await auth.selectPendingProfile(profileId);
    } catch (error) {
      setErrorCode(error instanceof ApiError ? error.errorCode : 'AUTH_REQUEST_FAILED');
      setErrorTraceId(error instanceof ApiError ? error.traceId : null);
      setSelectedId(null);
    }
  };

  return (
    <main className="profile-selection-shell">
      <div className="profile-workspace-preview" aria-hidden="true">
        <aside className="profile-workspace-preview__sidebar">
          <div className="profile-workspace-preview__brand">
            <img src="/vmu-logo.png" alt="" />
            <span />
          </div>
          <div className="profile-workspace-preview__nav">
            {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
          </div>
        </aside>
        <div className="profile-workspace-preview__main">
          <div className="profile-workspace-preview__topbar">
            <span />
            <span />
          </div>
          <div className="profile-workspace-preview__content">
            <div className="profile-workspace-preview__toolbar">
              <span />
              <span />
            </div>
            <div className="profile-workspace-preview__table">
              {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
            </div>
          </div>
        </div>
      </div>

      <ProfileSelectionDialog
        profiles={profiles}
        loading={loading}
        selectedId={selectedId}
        errorCode={errorCode}
        errorTraceId={errorTraceId}
        title="Chọn phiên làm việc"
        description="Chọn vai trò và phạm vi bạn sẽ sử dụng trong phiên này."
        onSelect={(profileId) => void selectProfile(profileId)}
      />
    </main>
  );
}
