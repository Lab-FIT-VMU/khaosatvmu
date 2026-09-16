import { useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../auth/authContext';
import { publishScoringThresholds } from '../hooks/useScoringThresholds';
import { surveyApi, type ScoringChange } from '../services/surveyApi';

/** Hỏi lại máy chủ mỗi 30 giây khi đang mở một trang thống kê, báo cáo. */
const pollIntervalMs = 30_000;

const storageKey = (userId: string) => `citad:scoring-change-seen:${userId}`;

function readSeenId(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeSeenId(userId: string, id: number): void {
  try {
    window.localStorage.setItem(storageKey(userId), String(id));
  } catch {
    // Không ghi được thì lần sau báo lại, không sao.
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(value));
}

function describeConfig(change: ScoringChange): string {
  const traps = [
    change.rejectSingleAnswer && 'Chọn cùng đáp án',
    change.rejectAttentionCheckFailed && 'Sai câu độ tập trung',
    change.rejectTooFast && 'Làm bài quá nhanh',
  ].filter(Boolean);
  return `Tỷ lệ phản hồi ≥ ${change.minimumResponseRate}% · `
    + `Tỷ lệ phiếu hợp lệ ≥ ${change.minimumValidRate}% · `
    + `Bẫy lỗi áp: ${traps.length > 0 ? traps.join(', ') : 'không áp bẫy lỗi nào'}`;
}

function notify(change: ScoringChange): void {
  const at = formatDateTime(change.changedAt);
  // Không tự tắt: mục đích là để người xem không bỏ lỡ, họ tự đóng khi đã đọc.
  const options = { duration: Infinity };

  if (change.kind === 'SCORES_RECALCULATED') {
    const survey = change.semesterSurveyName ? `"${change.semesterSurveyName}"` : 'khảo sát';
    toast.warning('Điểm đã được cập nhật', {
      ...options,
      description:
        `${change.changedByName} vừa cập nhật điểm đợt ${survey} lúc ${at}, theo cấu hình: `
        + `${describeConfig(change)}. Tải lại trang để xem số mới.`,
    });
    return;
  }

  toast.warning('Cấu hình tính điểm đã thay đổi', {
    ...options,
    description:
      `${change.changedByName} vừa đổi cấu hình lúc ${at}: ${describeConfig(change)}. `
      + 'Đợt nào chưa được cập nhật điểm lại thì số liệu vẫn theo cấu hình cũ.',
  });
}

/**
 * Báo cho người đang xem các trang thống kê, báo cáo khi NGƯỜI KHÁC đổi cấu hình tính
 * điểm hoặc cập nhật điểm — để không ai nhầm số đang xem thuộc cấu hình nào.
 *
 * Hệ thống chưa có kênh đẩy thời gian thực nên trang tự hỏi lại định kỳ. Mốc đã xem
 * lưu theo từng tài khoản trên trình duyệt: lần đầu chỉ ghi mốc, không dội lịch sử;
 * rời trang một lúc rồi quay lại thì vẫn nhận các thay đổi đã xảy ra trong lúc vắng.
 */
export function ScoringChangeNotifier({ active }: { active: boolean }) {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!active || !userId) return;

    let cancelled = false;
    let running = false;

    const check = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        const seenId = readSeenId(userId);
        const feed = await surveyApi.scoringChanges(seenId ?? undefined);
        if (cancelled) return;

        feed.items.forEach(notify);
        writeSeenId(userId, feed.latestId);

        // Cấu hình đã đổi thì mọi dòng ghi chú ngưỡng trên trang phải đổi theo ngay.
        if (feed.items.some((item) => item.kind === 'CONFIG_UPDATED')) {
          const thresholds = await surveyApi.scoringThresholds();
          if (!cancelled) publishScoringThresholds(thresholds);
        }
      } catch {
        // Lỗi mạng hoặc không có quyền: lần sau hỏi lại, không làm phiền người xem.
      } finally {
        running = false;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), pollIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, userId]);

  return null;
}
