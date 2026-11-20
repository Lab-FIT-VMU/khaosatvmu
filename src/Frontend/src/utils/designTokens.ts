import { useSyncExternalStore } from 'react';
import { COLORS } from '../components/courseGrades/courseGradeFormat';

/*
  Bộ màu chung của hệ thống — trang "Design System" (mục riêng trên thanh điều hướng) là nơi
  chỉnh. Một bộ màu cho cả hai nơi:
  - các bảng thống kê khảo sát (màu trạng thái, màu số liệu Thống kê & Báo cáo): đi qua biến
    CSS `--status-<khoá>` đặt trên <html>, CSS của các trang đọc biến kèm màu mặc định;
  - Phân tích điểm học phần: màu thương hiệu / màu nhấn đi qua biến CSS `--ds-<khoá>` (tệp
    course-grade-reports.css), màu biểu đồ ghi đè thẳng vào object COLORS (courseGradeFormat).

  Mỗi người tự chỉnh: lưu trong trình duyệt (localStorage), không lên máy chủ. Nút "Màu" cạnh
  các bảng thống kê là lối tắt chỉnh vào chính bộ màu này (utils/statusColors.ts).
*/

export type DesignTone = 'success' | 'warning' | 'danger';

export interface DesignToken {
  key: string;
  label: string;
  group: DesignTokenGroup;
  defaultValue: string;
  /** Tông dùng khi áp bộ màu gợi ý; không có thì bộ gợi ý không đụng tới màu này. */
  tone?: DesignTone;
}

export type DesignTokenGroup =
  | 'survey-status'
  | 'survey-report'
  | 'brand'
  | 'grade-scale'
  | 'grade-direction'
  | 'grade-categories'
  | 'grade-other';

/** Màu mặc định chụp từ COLORS lúc nạp tệp, trước khi bộ màu của người dùng ghi đè. */
const gradeDefaults = {
  scale: [...COLORS.scale],
  categories: [...COLORS.categories],
  accents: [...COLORS.accents],
  up: COLORS.up,
  down: COLORS.down,
  middle: COLORS.middle,
  process: COLORS.process,
  exam: COLORS.exam,
  threshold: COLORS.threshold,
  muted: COLORS.muted,
};

export const designTokens: readonly DesignToken[] = [
  // Trạng thái trong bảng thống kê khảo sát (Tiến độ thu phiếu, Bảng dữ liệu, Ý kiến mở).
  { key: 'success', label: 'Đạt / Đủ điều kiện / Hợp lệ', group: 'survey-status', defaultValue: '#0f5e5e', tone: 'success' },
  { key: 'warning', label: 'Đang thu', group: 'survey-status', defaultValue: '#1450b8', tone: 'warning' },
  { key: 'danger', label: 'Không đạt / Không đủ điều kiện / Bị lọc', group: 'survey-status', defaultValue: '#7a6bb0', tone: 'danger' },

  // Số liệu của Thống kê & Báo cáo.
  { key: 'rate-high', label: 'Tỷ lệ phản hồi: đạt chỉ tiêu', group: 'survey-report', defaultValue: '#0f5e5e', tone: 'success' },
  { key: 'rate-mid', label: 'Tỷ lệ phản hồi: gần đạt', group: 'survey-report', defaultValue: '#1450b8', tone: 'warning' },
  { key: 'rate-low', label: 'Tỷ lệ phản hồi: thấp', group: 'survey-report', defaultValue: '#7a6bb0', tone: 'danger' },
  { key: 'score-high', label: 'Điểm trung bình từ 4,5', group: 'survey-report', defaultValue: '#0f5e5e', tone: 'success' },
  { key: 'score-mid', label: 'Điểm trung bình 4,0 – dưới 4,5', group: 'survey-report', defaultValue: '#1450b8', tone: 'warning' },
  { key: 'score-low', label: 'Điểm trung bình dưới 4,0', group: 'survey-report', defaultValue: '#7a6bb0', tone: 'danger' },
  { key: 'invalid', label: 'Số phiếu không hợp lệ', group: 'survey-report', defaultValue: '#7a6bb0', tone: 'danger' },

  // Nhận diện VMU và màu nhấn của thẻ số liệu (Phân tích điểm học phần).
  { key: 'brand-900', label: 'VMU 900', group: 'brand', defaultValue: '#0a2463' },
  { key: 'brand-800', label: 'VMU 800', group: 'brand', defaultValue: '#0d3b8c' },
  { key: 'brand-700', label: 'VMU 700', group: 'brand', defaultValue: '#1450b8' },
  { key: 'brand-100', label: 'VMU 100', group: 'brand', defaultValue: '#dce8fc' },
  ...gradeDefaults.accents.map((value, index): DesignToken => ({
    key: `accent-${index + 1}`,
    label: ['Nhấn xanh', 'Nhấn tím', 'Nhấn mòng két', 'Nhấn chàm'][index] ?? `Nhấn ${index + 1}`,
    group: 'brand',
    defaultValue: value.toLowerCase(),
  })),

  // Màu số liệu của Phân tích điểm học phần (bộ luật D mục 9.2).
  ...gradeDefaults.scale.map((value, index): DesignToken => ({
    key: `scale-${index + 1}`, label: `Độ lớn – mức ${index + 1}`, group: 'grade-scale', defaultValue: value.toLowerCase(),
  })),
  { key: 'up', label: 'Trên kỳ vọng', group: 'grade-direction', defaultValue: gradeDefaults.up.toLowerCase() },
  { key: 'middle', label: 'Gần kỳ vọng', group: 'grade-direction', defaultValue: gradeDefaults.middle.toLowerCase() },
  { key: 'down', label: 'Dưới kỳ vọng', group: 'grade-direction', defaultValue: gradeDefaults.down.toLowerCase() },
  ...gradeDefaults.categories.map((value, index): DesignToken => ({
    key: `category-${index + 1}`, label: `Phân loại – nhóm ${index + 1}`, group: 'grade-categories', defaultValue: value.toLowerCase(),
  })),
  { key: 'process', label: 'Điểm quá trình', group: 'grade-other', defaultValue: gradeDefaults.process.toLowerCase() },
  { key: 'exam', label: 'Điểm thi', group: 'grade-other', defaultValue: gradeDefaults.exam.toLowerCase() },
  { key: 'ok', label: 'Ổn định, đồng đều', group: 'grade-other', defaultValue: '#0f5e5e' },
  { key: 'threshold', label: 'Đường ngưỡng / trung vị', group: 'grade-other', defaultValue: gradeDefaults.threshold.toLowerCase() },
  { key: 'muted', label: 'Học phần không thuộc nhóm đang chọn', group: 'grade-other', defaultValue: gradeDefaults.muted.toLowerCase() },
];

const tokenByKey = new Map(designTokens.map((token) => [token.key, token]));
const storageKey = 'khaosatvmu.designTokens';
const hexColor = /^#[0-9a-fA-F]{6}$/;

/** Bộ màu gợi ý: đổi các màu có tông (trạng thái và số liệu của bảng khảo sát) một lần. */
export interface DesignPreset {
  name: string;
  colors: Record<DesignTone, string>;
}

export const designPresets: readonly DesignPreset[] = [
  { name: 'Mặc định (như phân tích điểm)', colors: { success: '#0f5e5e', warning: '#1450b8', danger: '#7a6bb0' } },
  // Màu cũ của hệ thống, ai quen đọc xanh = tốt, đỏ = xấu thì chọn bộ này.
  { name: 'Truyền thống (xanh lá · cam · đỏ)', colors: { success: '#137b3b', warning: '#b86216', danger: '#b52d2d' } },
  // Bảng Okabe–Ito: người mù màu đỏ – lục vẫn phân biệt được ba màu.
  { name: 'Dễ phân biệt cho người mù màu', colors: { success: '#0072b2', warning: '#e69f00', danger: '#d55e00' } },
  { name: 'Đơn sắc xanh dương', colors: { success: '#0a2463', warning: '#3b6fc4', danger: '#8fa3c7' } },
  { name: 'Trầm (xanh rêu · nâu · mận)', colors: { success: '#3f5f45', warning: '#8a6a3b', danger: '#7b3f5a' } },
  { name: 'Tương phản cao', colors: { success: '#005a32', warning: '#1f3fbf', danger: '#a50026' } },
];

// ------------------------------------------------------------------- Lưu trữ

function readStored(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (tokenByKey.has(key) && typeof value === 'string' && hexColor.test(value)) result[key] = value.toLowerCase();
    }
    return result;
  } catch {
    // Trình duyệt chặn lưu trữ hoặc dữ liệu hỏng: dùng màu mặc định.
    return {};
  }
}

function writeStored(value: Record<string, string>): void {
  try {
    if (Object.keys(value).length === 0) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Không lưu được thì màu chỉ giữ tới khi tải lại trang.
  }
}

let overrides: Record<string, string> = typeof window === 'undefined' ? {} : readStored();
let snapshot: Record<string, string> = buildSnapshot();
const listeners = new Set<() => void>();

function buildSnapshot(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of designTokens) result[token.key] = overrides[token.key] ?? token.defaultValue;
  return result;
}

/** Đổ bộ màu ra trang: biến CSS trên <html> và object COLORS của phân tích điểm. */
function applyColors(colors: Record<string, string>): void {
  if (typeof document !== 'undefined') {
    const root = document.documentElement.style;
    for (const token of designTokens) {
      const prefix = token.group === 'survey-status' || token.group === 'survey-report' ? '--status-' : '--ds-';
      root.setProperty(`${prefix}${token.key}`, colors[token.key]);
    }
  }
  COLORS.scale.forEach((_, index) => { COLORS.scale[index] = colors[`scale-${index + 1}`] ?? COLORS.scale[index]; });
  COLORS.categories.forEach((_, index) => { COLORS.categories[index] = colors[`category-${index + 1}`] ?? COLORS.categories[index]; });
  COLORS.accents.forEach((_, index) => { COLORS.accents[index] = colors[`accent-${index + 1}`] ?? COLORS.accents[index]; });
  COLORS.up = colors.up;
  COLORS.down = colors.down;
  COLORS.middle = colors.middle;
  COLORS.process = colors.process;
  COLORS.exam = colors.exam;
  COLORS.threshold = colors.threshold;
  COLORS.muted = colors.muted;
}

applyColors(snapshot);

function commit(next: Record<string, string>): void {
  overrides = next;
  writeStored(overrides);
  snapshot = buildSnapshot();
  applyColors(snapshot);
  listeners.forEach((listener) => listener());
}

// ------------------------------------------------------------------- Thao tác

/** Đổi một màu. Chọn lại đúng màu mặc định thì coi như chưa chỉnh. */
export function setDesignToken(key: string, value: string): void {
  const token = tokenByKey.get(key);
  if (!token || !hexColor.test(value)) return;
  const next = { ...overrides, [key]: value.toLowerCase() };
  if (value.toLowerCase() === token.defaultValue) delete next[key];
  commit(next);
}

/** Trả các màu (bỏ trống: mọi màu) về mặc định. */
export function resetDesignTokens(keys?: readonly string[]): void {
  if (!keys) { commit({}); return; }
  const next = { ...overrides };
  for (const key of keys) delete next[key];
  commit(next);
}

/** Áp bộ màu gợi ý cho các màu có tông; `keys` giới hạn phạm vi (bỏ trống: mọi màu có tông). */
export function applyDesignPreset(colors: Record<DesignTone, string>, keys?: readonly string[]): void {
  const next = { ...overrides };
  for (const token of designTokens) {
    if (!token.tone || (keys && !keys.includes(token.key))) continue;
    const value = colors[token.tone].toLowerCase();
    if (value === token.defaultValue) delete next[token.key];
    else next[token.key] = value;
  }
  commit(next);
}

export function isDesignTokenCustom(key: string): boolean {
  return key in overrides;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Bộ màu đang dùng (khoá → mã màu); component gọi hook này thì vẽ lại khi màu đổi. */
export function useDesignTokens(): Record<string, string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
