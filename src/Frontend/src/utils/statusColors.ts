import { useCallback, useMemo } from 'react';
import type React from 'react';
import {
  applyDesignPreset,
  designPresets,
  designTokens,
  isDesignTokenCustom,
  resetDesignTokens,
  setDesignToken,
  useDesignTokens,
  type DesignTone,
} from './designTokens';

/*
  Màu theo ngưỡng của các bảng thống kê khảo sát (Đạt chỉ tiêu / Đang thu / Không đạt,
  Đủ điều kiện / Không đủ điều kiện, Hợp lệ / Bị lọc, màu số liệu Thống kê & Báo cáo).

  Màu thuộc bộ màu chung ở trang Design System (utils/designTokens.ts): chỉnh ở đó thì
  mọi trang đổi theo. Mỗi người tự
  chỉnh, lưu trên trình duyệt. Màu tới trang qua biến CSS `--status-<khoá>` đặt trên <html>.
*/

export type StatusTone = DesignTone;

export const defaultStatusColors: Readonly<Record<StatusTone, string>> = designPresets[0].colors;

export interface StatusColorPreset {
  name: string;
  colors: Record<StatusTone, string>;
}

export const statusColorPresets: readonly StatusColorPreset[] = designPresets;

/**
 * Một màu chỉnh được trên trang, kèm nhãn đúng như chữ trong bảng.
 * `key` là khoá trong bộ màu chung (biến CSS `--status-<key>`); bỏ trống thì dùng `tone`
 * (ba màu trạng thái "success" / "warning" / "danger"). `group` gom các màu cùng một chỉ số
 * thành một nhóm trong bảng chọn.
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

/**
 * Màu của các mục trên một trang, cùng cách đổi, áp bộ gợi ý, trả mặc định — tất cả ghi vào
 * bộ màu chung. `pageKey` giữ lại để biết trang nào gọi, không còn tách màu theo trang.
 * `items` phải là hằng số (khai ngoài component).
 */
export function useStatusColors(pageKey: string, items: readonly StatusColorItem[] = toneItems) {
  void pageKey;
  const tokens = useDesignTokens();
  const keys = useMemo(() => items.map(statusColorKeyOf), [items]);

  const colors = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of keys) result[key] = tokens[key];
    return result;
  }, [keys, tokens]);

  const setColor = useCallback((key: string, value: string) => setDesignToken(key, value), []);
  const applyPreset = useCallback((preset: Record<StatusTone, string>) => applyDesignPreset(preset, keys), [keys]);
  const reset = useCallback(() => resetDesignTokens(keys), [keys]);
  const isCustom = keys.some((key) => isDesignTokenCustom(key));

  // Biến màu đã đặt trên <html> nên trang không cần đặt thêm; giữ `style` để chỗ gọi cũ không đổi.
  const style = useMemo(() => ({}) as React.CSSProperties, []);

  return { colors, setColor, applyPreset, reset, isCustom, style };
}

/**
 * Màu số liệu của bảng báo cáo (Thống kê & Báo cáo): tỷ lệ phản hồi và điểm trung bình mỗi
 * thứ ba mức, số phiếu không hợp lệ một màu.
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

const defaultOf = (key: string) => designTokens.find((token) => token.key === key)?.defaultValue ?? '#000000';
const statusVar = (key: string) => `var(--status-${key}, ${defaultOf(key)})`;

/** Màu điểm trung bình trong bảng báo cáo (thang 5): ≥4,5 / ≥4,0 / còn lại. */
export const reportScoreColor = (score: number): string =>
  score >= 4.5 ? statusVar('score-high') : score >= 4.0 ? statusVar('score-mid') : statusVar('score-low');

/** Màu tỷ lệ phản hồi trong bảng báo cáo theo hai mốc đạt / gần đạt. */
export const reportCompletionColor = (rate: number, completed: number, lagging: number): string =>
  rate >= completed ? statusVar('rate-high') : rate >= lagging ? statusVar('rate-mid') : statusVar('rate-low');
