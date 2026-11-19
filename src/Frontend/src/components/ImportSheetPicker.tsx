import type { ImportSheetChoice } from '../utils/importSheets';

interface ImportSheetPickerProps {
  choice: ImportSheetChoice | null;
  disabled?: boolean;
  /** Tên các cột bắt buộc, để ghi chú sheet thiếu cột (vd "Mã HP / Nhóm"). */
  requiredColumnsLabel: string;
  onChange: (sheetName: string) => void;
}

/**
 * Dòng "Tệp có N sheet, đang đọc sheet [ô chọn]" của hộp thoại import. Chỉ hiện khi tệp có
 * từ hai sheet trở lên: trước đây tệp có sheet nháp đứng đầu bị nạp nhầm mà không ai biết.
 */
export function ImportSheetPicker({ choice, disabled, requiredColumnsLabel, onChange }: ImportSheetPickerProps) {
  if (!choice || choice.sheetNames.length < 2) return null;

  return (
    <div className="catalog-context-band import-sheet-picker">
      <label>
        <span>
          Tệp có <strong>{choice.sheetNames.length} sheet</strong>, đang đọc sheet
        </span>
        <select value={choice.sheetName} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {choice.sheetNames.map((name) => (
            <option key={name} value={name}>
              {name}
              {choice.usableSheetNames.includes(name) ? '' : ` (không có cột ${requiredColumnsLabel})`}
            </option>
          ))}
        </select>
      </label>
      {choice.usableSheetNames.length > 1 && (
        <small>
          Có {choice.usableSheetNames.length} sheet đủ cột {requiredColumnsLabel} (
          {choice.usableSheetNames.join(', ')}). Kiểm tra đúng sheet cần nạp trước khi import; mỗi
          lần chỉ nạp một sheet.
        </small>
      )}
    </div>
  );
}
