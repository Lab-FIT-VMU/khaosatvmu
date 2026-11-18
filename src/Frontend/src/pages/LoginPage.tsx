import { useEffect, useState } from 'react';
import {
  Building2,
  CircleAlert,
  FlaskConical,
  GraduationCap,
  LogIn,
  Mail,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { authMessage } from '../auth/authMessages';
import { useAuth } from '../auth/authContext';
import { Modal } from '../components/Modal';
import { AuthApiError } from '../services/authApi';
import '../styles/auth-admin.css';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || 'kdcldhhh@vimaru.edu.vn';
const supportMailTo = `mailto:${supportEmail}?subject=${encodeURIComponent(
  'Yêu cầu cấp hồ sơ làm việc - Hệ thống Khảo sát VMU',
)}`;

export function LoginPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localTraceId, setLocalTraceId] = useState<string | null>(null);
  const [isNoProfileDialogOpen, setIsNoProfileDialogOpen] = useState(false);
  const queryError = new URLSearchParams(window.location.search).get('error');
  const errorCode = localError ?? queryError ?? auth.errorCode;
  const error = authMessage(errorCode, localError ? localTraceId : queryError ? null : auth.errorTraceId);
  const hasNoProfile = errorCode === 'AUTH_NO_PROFILE';
  const googleAvailable = auth.configuration?.googleConfigured === true;

  useEffect(() => {
    if (hasNoProfile) setIsNoProfileDialogOpen(true);
  }, [hasNoProfile]);

  const handleDevLogin = async () => {
    setBusy(true);
    setLocalError(null);
    setLocalTraceId(null);
    try {
      await auth.devLogin();
    } catch (requestError) {
      setLocalError(requestError instanceof AuthApiError ? requestError.errorCode : 'AUTH_REQUEST_FAILED');
      setLocalTraceId(requestError instanceof AuthApiError ? requestError.traceId : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell auth-login-shell">
      <header className="auth-site-header" aria-label="Trường Đại học Hàng hải Việt Nam">
        <div className="auth-brand-lockup">
          <img className="auth-brand-mark" src="/vmu-logo.png" alt="" aria-hidden="true" />
          <div>
            <p>TRƯỜNG ĐẠI HỌC HÀNG HẢI VIỆT NAM</p>
            <span>Hệ thống Đánh giá chất lượng đào tạo</span>
          </div>
        </div>
        <div className="auth-secure-label">
          <ShieldCheck aria-hidden="true" />
          Cổng truy cập an toàn
        </div>
      </header>

      <section className="auth-login-content" aria-labelledby="login-title">
        <div className="auth-context-panel">
          <span className="auth-section-label">HỆ THỐNG NỘI BỘ</span>
          <h1>Quản lý khảo sát và chất lượng đào tạo</h1>
          <p>
            Không gian làm việc dành cho cán bộ, giảng viên và đơn vị quản lý được cấp quyền.
          </p>
          <div className="auth-context-list" aria-label="Phạm vi hệ thống">
            <div>
              <GraduationCap aria-hidden="true" />
              <span>Khảo sát học phần</span>
            </div>
            <div>
              <Building2 aria-hidden="true" />
              <span>Đánh giá chương trình đào tạo</span>
            </div>
          </div>
        </div>

        <div className="auth-panel" aria-busy={busy}>
          <div className="auth-panel-heading">
            <span className="auth-section-label">XÁC THỰC TÀI KHOẢN</span>
            <h2 id="login-title">Đăng nhập hệ thống</h2>
          </div>

          <p className="auth-panel-copy">
            Tiếp tục bằng tài khoản Google đã được quản trị viên cấp quyền.
          </p>

          {error && (
            <div className={`auth-alert${hasNoProfile ? ' auth-alert--no-profile' : ''}`} role="alert">
              <CircleAlert aria-hidden="true" />
              {hasNoProfile ? (
                <div>
                  <strong>Chưa thể truy cập hệ thống</strong>
                  <span>
                    {error} Vui lòng liên hệ{' '}
                    <a href={`mailto:${supportEmail}`}>{supportEmail}</a> để được hỗ trợ.
                  </span>
                </div>
              ) : (
                <span>{error}</span>
              )}
            </div>
          )}

          <div className="auth-actions">
            <button
              type="button"
              className="auth-google-button"
              onClick={() => window.location.assign('/api/auth/login')}
              disabled={!googleAvailable || busy}
            >
              <LogIn aria-hidden="true" />
              Tiếp tục với Google
            </button>

            {!googleAvailable && auth.configuration && (
              <p className="auth-inline-status" role="status">
                Đăng nhập Google hiện chưa khả dụng.
              </p>
            )}

            {auth.configuration?.development && (
              <button
                type="button"
                className="auth-dev-button"
                onClick={() => void handleDevLogin()}
                disabled={busy}
              >
                <FlaskConical aria-hidden="true" />
                {busy ? 'Đang đăng nhập...' : 'Tài khoản thử nghiệm'}
              </button>
            )}

            {auth.status === 'error' && (
              <button
                type="button"
                className="auth-dev-button"
                onClick={() => void auth.refresh()}
                disabled={busy}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại kết nối
              </button>
            )}
          </div>

          <div className="auth-domain-note">
            Chỉ tài khoản Google có trong danh sách được cấp quyền mới có thể truy cập.
          </div>
        </div>
      </section>

      <footer className="auth-site-footer">
        <span>VMU Survey Operations</span>
        <span>Phiên truy cập được bảo vệ</span>
      </footer>

      <Modal
        isOpen={isNoProfileDialogOpen}
        onClose={() => setIsNoProfileDialogOpen(false)}
        title="Cần cấp hồ sơ làm việc"
        size="compact"
      >
        <div className="auth-access-dialog">
          <div className="auth-access-dialog__status" aria-hidden="true">
            <ShieldAlert />
          </div>
          <div className="auth-access-dialog__content">
            <span className="auth-section-label">QUYỀN TRUY CẬP</span>
            <h4>Chưa thể vào hệ thống</h4>
            <p>
              Tài khoản Google của bạn đã được xác thực, nhưng chưa có hồ sơ làm việc đang hoạt
              động trên hệ thống.
            </p>
            <p>
              Vui lòng gửi email tới Phòng Khảo thí và Đảm bảo chất lượng, kèm theo họ tên, đơn
              vị công tác và địa chỉ Google vừa đăng nhập để được kiểm tra và cấp quyền.
            </p>
          </div>

          <a className="auth-access-dialog__contact" href={supportMailTo}>
            <Mail aria-hidden="true" />
            <span>
              <small>Email hỗ trợ</small>
              <strong>{supportEmail}</strong>
            </span>
          </a>

          <div className="auth-access-dialog__actions">
            <button
              type="button"
              className="auth-access-dialog__dismiss"
              onClick={() => setIsNoProfileDialogOpen(false)}
            >
              Đóng thông báo
            </button>
            <a className="auth-access-dialog__email" href={supportMailTo}>
              <Mail aria-hidden="true" />
              Gửi email hỗ trợ
            </a>
          </div>
        </div>
      </Modal>
    </main>
  );
}
