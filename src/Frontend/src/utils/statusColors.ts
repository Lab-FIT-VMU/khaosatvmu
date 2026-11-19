import { useCallback, useMemo, useState } from 'react';
import type React from 'react';

/**
 * Màu theo ngưỡng của các bảng thống kê khảo sát (Đạt chỉ tiêu / Đang thu / Không đạt,
 * Đủ điều kiện / Không đủ điều kiện, Hợp lệ / Bị lọc...). Mỗi người tự chỉnh trên máy
 * mình, lưu trong trình duyệt theo từng trang; không lưu lên máy chủ nên người khác không
 * thấy màu mình chọn.
 *
 * Màu đi vào trang bằng biến CSS `--status-success`, `--status-warning`, `--status-danger`;
 * CSS (survey-operations.css, survey-statistics.css) đọc biến kèm màu mặc định nên trang nào
 * chưa chỉnh vẫn hiện đúng như cũ.
 */
export type StatusTone = 'success' | 'warning' | 'danger';

/**
 * Mặc định theo bảng màu của Phân tích điểm học phần (course-grade-reports.css): không đỏ /
 * cam / xanh lá, màu không gợi ý tốt xấu.
 */
export const defaultStatusColors: Readonly<Record<StatusTone, string>> = {
  success: '#0f5e5e',
  warning: '#1450b8',
  danger: '#7a6bb0',
};

/** Bộ màu gợi ý: bấm một lần là đổi cả ba trạng thái. */
export interface StatusColorPreset {
  name: string;
  colors: Record<StatusTone, string>;
}

export const statusColorPresets: readonly StatusColorPreset[] = [
  { name: 'Mặc định (như phân tích điểm)', colors: { ...defaultStatusColors } },
  // Màu cũ của hệ thống, ai quen đọc xanh = tốt, đỏ = xấu thì chọn bộ này.
  { name: 'Truyền thống (xanh lá · cam · đỏ)', colors: { success: '#137b3b', warning: '#b86216', danger: '#b52d2d' } },
  // Bảng Okabe–Ito: người mù màu đỏ – lục vẫn phân biệt được ba màu.
  { name: 'Dễ phân biệt cho người mù màu', colors: { success: '#0072b2', warning: '#e69f00', danger: '#d55e00' } },
  { name: 'Đơn sắc xanh dương', colors: { success: '#0a2463', warning: '#3b6fc4', danger: '#8fa3c7' } },
  { name: 'Trầm (xanh rêu · nâu · mận)', colors: { success: '#3f5f45', warning: '#8a6a3b', danger: '#7b3f5a' } },
  { name: 'Tương phản cao', colors: { success: '#005a32', warning: '#1f3fbf', danger: '#a50026' } },
];

/**
 * Một màu chỉnh được trên trang, kèm nhãn đúng như chữ trong bảng.
 * `key` là tên biến CSS (`--status-<key>`); bỏ trống thì dùng luôn `tone`. `tone` quyết định
 * màu mặc định và màu lấy từ bộ gợi ý. `group` gom các màu cùng một chỉ số (ví dụ "Điểm
 * trung bình") thành một nhóm trong bảng chọn.
 */
export interface StatusColorItem {
  tone: StatusTone;
  label: string;
  key?: string;
  group?: string;
}

export const statusColorKeyOf = (item: StatusColorItem): string => item.key ?? item.tone;

/** Ba trạng thái quen thuộc, dùng khi trang không khai danh sách riêng. */
const toneItems: readonly StatusColorItem[] = [
  { tone: 'success', label: 'Đạt' },
  { tone: 'warning', label: 'Đang thu' },
  { tone: 'danger', label: 'Không đạt' },
];

const storagePrefix = 'khaosatvmu.statusColors.';
const hexColor = /^#[0-9a-fA-F]{6}$/;

function readStored(pageKey: string, keys: readonly string[]): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storagePrefix + pageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const key of keys) {
      const value = parsed[key];
      if (typeof value === 'string' && hexColor.test(value)) result[key] = value;
    }
    return result;
  } catch {
    // Trình duyệt chặn lưu trữ, hoặc dữ liệu hỏng: dùng màu mặc định.
    return {};
  }
}

function writeStored(pageKey: string, value: Record<string, string>): void {
  try {
    if (Object.keys(value).length === 0) {
      window.localStorage.removeItem(storagePrefix + pageKey);
    } else {
      window.localStorage.setItem(storagePrefix + pageKey, JSON.stringify(value));
    }
  } catch {
    // Không lưu được thì màu chỉ giữ tới khi tải lại trang.
  }
}

/**
 * Màu đang dùng của một trang, cùng cách đổi và trả về mặc định. `items` phải là hằng số
 * (khai ngoài component) để không dựng lại mỗi lần vẽ.
 */
export function useStatusColors(pageKey: string, items: readonly StatusColorItem[] = toneItems) {
  const toneOfKey = useMemo(
    () => new Map(items.map((item) => [statusColorKeyOf(item), item.tone] as const)),
    [items],
  );
  const [custom, setCustom] = useState<Record<string, string>>(
    () => readStored(pageKey, items.map(statusColorKeyOf)),
  );

  const colors = useMemo<Record<string, string>>(() => {
    const result: Record<string, string> = {};
    for (const [key, tone] of toneOfKey) result[key] = custom[key] ?? defaultStatusColors[tone];
    return result;
  }, [custom, toneOfKey]);

  const setColor = useCallback((key: string, value: string) => {
    const tone = toneOfKey.get(key);
    if (!tone || !hexColor.test(value)) return;
    setCustom((prev) => {
      const next = { ...prev, [key]: value };
      // Chọn lại đúng màu mặc định thì coi như chưa chỉnh, khỏi lưu.
      if (value.toLowerCase() === defaultStatusColors[tone]) delete next[key];
      writeStored(pageKey, next);
      return next;
    });
  }, [pageKey, toneOfKey]);

  /** Đổi cả bộ màu một lần (bộ gợi ý): mỗi màu lấy theo tông của nó. Trùng mặc định thì không lưu. */
  const applyPreset = useCallback((preset: Record<StatusTone, string>) => {
    const next: Record<string, string> = {};
    for (const [key, tone] of toneOfKey) {
      const value = preset[tone];
      if (hexColor.test(value) && value.toLowerCase() !== defaultStatusColors[tone]) next[key] = value;
    }
    writeStored(pageKey, next);
    setCustom(next);
  }, [pageKey, toneOfKey]);

  const reset = useCallback(() => {
    writeStored(pageKey, {});
    setCustom({});
  }, [pageKey]);

  const style = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(colors)) vars[`--status-${key}`] = value;
    return vars as React.CSSProperties;
  }, [colors]);

  return { colors, setColor, applyPreset, reset, isCustom: Object.keys(custom).length > 0, style };
}

/**
 * Màu số liệu của bảng báo cáo (Thống kê & Báo cáo): tỷ lệ phản hồi và điểm trung bình mỗi
 * thứ ba mức, số phiếu không hợp lệ một màu. Hàm tô màu trả về `var(--status-…)` để nút
 * "Màu" của trang đổi được; ngoài trang đó thì rơi về màu mặc định.
 */
export const reportTableColorItems: readonly StatusColorItem[] = [
  { key: 'rate-high', tone: 'success', label: 'Đạt chỉ tiêu', group: 'Tỷ lệ phản hồi' },
  { key: 'rate-mid', tone: 'warning', label: 'Gần đạt', group: 'Tỷ lệ phản hồi' },
  { key: 'rate-low', tone: 'danger', label: 'Thấp', group: 'Tỷ lệ phản hồi' },
  { key: 'score-high', tone: 'success', label: 'Từ 4,5 trở lên', group: 'Điểm trung bình' },
  { key: 'score-mid', tone: 'warning', label: 'Từ 4,0 đến dưới 4,5', group: 'Điểm trung bình' },
  { key: 'score-low', tone: 'danger', label: 'Dưới 4,0', group: 'Điểm trung bình' },
  { key: 'invalid', tone: 'danger', label: 'Số phiếu không hợp lệ', group: 'Phiếu không hợp lệ' },
];

const statusVar = (key: string, tone: StatusTone) => `var(--status-${key}, ${defaultStatusColors[tone]})`;

/** Màu điểm trung bình trong bảng báo cáo (thang 5): ≥4,5 / ≥4,0 / còn lại. */
export const reportScoreColor = (score: number): string =>
  score >= 4.5 ? statusVar('score-high', 'success')
    : score >= 4.0 ? statusVar('score-mid', 'warning')
      : statusVar('score-low', 'danger');

/** Màu tỷ lệ phản hồi trong bảng báo cáo theo hai mốc đạt / gần đạt. */
export const reportCompletionColor = (rate: number, completed: number, lagging: number): string =>
  rate >= completed ? statusVar('rate-high', 'success')
    : rate >= lagging ? statusVar('rate-mid', 'warning')
      : statusVar('rate-low', 'danger');
