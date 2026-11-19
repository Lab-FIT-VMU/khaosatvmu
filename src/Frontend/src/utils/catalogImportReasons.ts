import { catalogErrorMessage } from '../services/catalogApi';
import type { Department, Faculty } from '../types';

/*
  Lý do bỏ qua từng dòng khi import vào Danh mục đào tạo, viết cụ thể: nêu đúng giá trị gây
  lỗi của dòng đó và gợi ý giá trị đúng nếu tìm được trong danh mục. Câu chung của mã lỗi
  (catalogErrorMessage) chỉ dùng khi không có gì cụ thể hơn để nói.

  Danh mục truyền vào là danh mục đang dùng (chưa xoá); thứ đã xoá không còn trong danh mục
  nên chỉ nói được là "không có".
*/

/** Bỏ dấu, gộp khoảng trắng, chữ thường: so tên trong tệp với tên trong danh mục. */
export const foldKey = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Tên trong danh mục gần nhất với tên gõ trong tệp: trùng khi bỏ dấu, hoặc tên này chứa tên kia. */
export function closestName<T>(typed: string, items: readonly T[], nameOf: (item: T) => string): T | undefined {
  const key = foldKey(typed);
  if (key.length === 0) return undefined;
  return items.find((item) => foldKey(nameOf(item)) === key)
    ?? items.find((item) => {
      const other = foldKey(nameOf(item));
      return other.length > 0 && (other.includes(key) || key.includes(other));
    });
}

/** Câu "Không có khoa / viện …", kèm tên đúng nếu đoán được. */
export function facultyNotFoundReason(typed: string, faculties: readonly Faculty[]): string {
  const value = typed.trim();
  if (!value) return catalogErrorMessage('CATALOG_FACULTY_NOT_FOUND');
  const suggestion = closestName(value, faculties, (item) => item.facultyName);
  return suggestion
    ? `Không có khoa / viện "${value}". Tên đúng trong danh mục: "${suggestion.facultyName}".`
    : `Không có khoa / viện "${value}" trong danh mục.`;
}

/** Câu "Không có bộ môn …" theo mã hoặc theo tên, kèm mã / tên đúng nếu đoán được. */
export function departmentNotFoundReason(
  typedName: string,
  typedCode: string,
  departments: readonly Department[],
): string {
  const name = typedName.trim();
  const code = typedCode.trim();
  const byName = name ? closestName(name, departments, (item) => item.departmentName) : undefined;
  const hint = byName ? ` Bộ môn "${byName.departmentName}" hiện có mã ${byName.departmentId}.` : '';
  if (code) return `Không có bộ môn mã ${code} trong danh mục (mã sai hoặc bộ môn đã bị xoá).${hint}`;
  if (name) {
    return byName && foldKey(byName.departmentName) !== foldKey(name)
      ? `Không có bộ môn "${name}". Tên đúng trong danh mục: "${byName.departmentName}" (mã ${byName.departmentId}).`
      : `Không có bộ môn "${name}" trong danh mục.`;
  }
  return catalogErrorMessage('CATALOG_DEPARTMENT_NOT_FOUND');
}

/** Dòng trước đó trong tệp có cùng khoá (dùng cho lỗi "lặp trong tệp"). */
export function firstDuplicateRow<Row extends { rowNumber: number }>(
  row: Row,
  rows: readonly Row[],
  keyOf: (item: Row) => string,
): Row | undefined {
  const key = keyOf(row);
  if (!key) return undefined;
  return rows.find((other) => other.rowNumber < row.rowNumber && keyOf(other) === key);
}

/** Câu "… lặp lại; đã có ở dòng N". */
export function duplicateReason<Row extends { rowNumber: number }>(
  label: string,
  row: Row,
  rows: readonly Row[],
  keyOf: (item: Row) => string,
): string {
  const first = firstDuplicateRow(row, rows, keyOf);
  return first ? `${label} lặp lại; đã có ở dòng ${first.rowNumber} của tệp.` : `${label} lặp lại trong tệp.`;
}
