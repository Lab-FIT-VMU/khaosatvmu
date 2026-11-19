import React, { useEffect, useId, useRef, useState } from 'react';
import { Palette, RotateCcw } from 'lucide-react';
import {
  statusColorKeyOf,
  statusColorPresets,
  type StatusColorItem,
  type StatusTone,
} from '../utils/statusColors';
import '../styles/status-color-settings.css';

interface StatusColorSettingsProps {
  /** Các màu chỉnh được trên trang này, theo đúng thứ tự hiện. */
  items: readonly StatusColorItem[];
  /** Màu đang dùng, theo khoá của từng mục (xem statusColorKeyOf). */
  colors: Record<string, string>;
  isCustom: boolean;
  onChange: (key: string, value: string) => void;
  /** Áp một bộ màu gợi ý: mỗi mục lấy màu theo tông của nó. */
  onApplyPreset: (colors: Record<StatusTone, string>) => void;
  onReset: () => void;
}

/**
 * Nút "Màu" cạnh bảng thống kê: mở bảng nhỏ chọn màu cho từng trạng thái / mức. Màu chỉ lưu
 * trên trình duyệt của người đang xem (xem utils/statusColors.ts).
 */
export const StatusColorSettings: React.FC<StatusColorSettingsProps> = ({
  items,
  colors,
  isCustom,
  onChange,
  onApplyPreset,
  onReset,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Bộ đang dùng (nếu trùng khít một bộ gợi ý trên mọi màu của trang này).
  const sameColor = (left: string | undefined, right: string) => left?.toLowerCase() === right.toLowerCase();
  const activePreset = statusColorPresets.find((preset) =>
    items.every((item) => sameColor(colors[statusColorKeyOf(item)], preset.colors[item.tone])));
  // Ô mẫu của bộ gợi ý: mỗi tông một ô, theo thứ tự xuất hiện.
  const tones = [...new Set(items.map((item) => item.tone))];

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="status-color-settings" ref={rootRef}>
      <button
        type="button"
        className="btn btn-secondary status-color-settings__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        title="Chọn màu cho các trạng thái trong bảng (chỉ áp trên máy này)"
      >
        <Palette className="operation-icon" aria-hidden="true" />
        Màu
      </button>

      {open && (
        <div className="status-color-settings__panel" id={panelId} role="dialog" aria-label="Màu trạng thái trong bảng">
          <strong className="status-color-settings__title">Màu trạng thái trong bảng</strong>
          <p className="status-color-settings__hint">Chỉ áp cho trang này, trên máy của bạn.</p>

          <span className="status-color-settings__subtitle">Bộ màu gợi ý</span>
          <div className="status-color-settings__presets" role="group" aria-label="Bộ màu gợi ý">
            {statusColorPresets.map((preset) => (
              <button
                type="button"
                key={preset.name}
                className={`status-color-settings__preset${activePreset === preset ? ' is-active' : ''}`}
                aria-pressed={activePreset === preset}
                title={preset.name}
                onClick={() => onApplyPreset(preset.colors)}
              >
                <span className="status-color-settings__swatches" aria-hidden="true">
                  {tones.map((tone) => (
                    <i key={tone} style={{ background: preset.colors[tone] }} />
                  ))}
                </span>
                <span className="status-color-settings__preset-name">{preset.name}</span>
              </button>
            ))}
          </div>

          <span className="status-color-settings__subtitle">Tự chọn từng màu</span>
          <ul className="status-color-settings__list">
            {items.map((item, index) => {
              const key = statusColorKeyOf(item);
              const startsGroup = item.group && item.group !== items[index - 1]?.group;
              return (
                <React.Fragment key={key}>
                  {startsGroup && <li className="status-color-settings__group">{item.group}</li>}
                  <li>
                    <label>
                      <input
                        type="color"
                        value={colors[key]}
                        onChange={(event) => onChange(key, event.target.value)}
                        aria-label={item.group ? `Màu của "${item.group}: ${item.label}"` : `Màu của "${item.label}"`}
                      />
                      <span className="status-color-settings__sample" style={{ color: colors[key] }}>
                        {item.label}
                      </span>
                    </label>
                  </li>
                </React.Fragment>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-secondary btn-sm status-color-settings__reset"
            disabled={!isCustom}
            onClick={onReset}
          >
            <RotateCcw className="operation-icon" aria-hidden="true" />
            Về mặc định
          </button>
        </div>
      )}
    </div>
  );
};
