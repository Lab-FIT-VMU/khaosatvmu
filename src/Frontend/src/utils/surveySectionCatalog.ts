import { surveySectionCatalog, type SurveySectionKey } from '../types';
import { foldVietnamese } from './vietnamese';

/**
 * Khoá so tên mục: bỏ dấu, hạ chữ thường, mọi chuỗi ký tự không phải chữ/số gộp
 * thành một dấu cách. Bản sao của `SurveySectionCatalog.MatchKey` bên backend — hai
 * nơi phải cho ra cùng kết quả, không thì giao diện nhận một mục mà backend từ chối.
 */
function sectionMatchKey(value: string): string {
  return foldVietnamese(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const keyByMatchKey = new Map<string, SurveySectionKey>(
  surveySectionCatalog.map((entry) => [sectionMatchKey(entry.name), entry.key])
);

/**
 * Khoá danh mục của một tên mục; null khi tên không thuộc danh mục. Tên gõ lệch dấu
 * như "cơ sơ vật chất" vẫn quy đúng về mục cơ sở vật chất.
 */
export function resolveSurveySectionKey(name: string | null | undefined): SurveySectionKey | null {
  if (!name) return null;
  return keyByMatchKey.get(sectionMatchKey(name)) ?? null;
}

/** Tên chuẩn của một khoá trong danh mục. */
export function surveySectionName(key: SurveySectionKey): string {
  return surveySectionCatalog.find((entry) => entry.key === key)?.name ?? key;
}
