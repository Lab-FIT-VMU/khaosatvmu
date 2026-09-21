import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface GraduationFilterOption {
  value: string;
  label: string;
}

interface GraduationFilterMultiSelectProps {
  options: GraduationFilterOption[];
  value: string[];
  onChange: (value: string[]) => void;
  allLabel: string;
  selectedLabel: (count: number) => string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  dialogAriaLabel: string;
  emptyMessage: string;
}

export function GraduationFilterMultiSelect({
  options,
  value,
  onChange,
  allLabel,
  selectedLabel,
  searchPlaceholder,
  searchAriaLabel,
  dialogAriaLabel,
  emptyMessage,
}: GraduationFilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [listStyle, setListStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(value), [value]);
  const sortedOptions = useMemo(() => [...options]
    .sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true })), [options]);
  const optionByValue = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const visibleOptions = useMemo(() => {
    const term = keyword.trim().toLocaleLowerCase('vi');
    return term
      ? sortedOptions.filter((option) => option.label.toLocaleLowerCase('vi').includes(term))
      : sortedOptions;
  }, [keyword, sortedOptions]);
  const buttonLabel = value.length === 0
    ? allLabel
    : value.length === 1
      ? optionByValue.get(value[0])?.label ?? value[0]
      : selectedLabel(value.length);

  const close = () => {
    setOpen(false);
    setKeyword('');
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 8;
      const gap = 3;
      const preferredHeight = 340;
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPadding;
      const spaceAbove = rect.top - gap - viewportPadding;
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - viewportPadding * 2);
      const left = Math.max(
        viewportPadding,
        Math.min(rect.left, window.innerWidth - width - viewportPadding),
      );
      setListStyle({
        top: openAbove ? rect.top - gap : rect.bottom + gap,
        left,
        width,
        maxHeight: Math.max(180, Math.min(preferredHeight, availableHeight)),
        transform: openAbove ? 'translateY(-100%)' : undefined,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const sortValues = (items: string[]) => [...items].sort((a, b) => {
    const first = optionByValue.get(a)?.label ?? a;
    const second = optionByValue.get(b)?.label ?? b;
    return first.localeCompare(second, 'vi', { numeric: true });
  });

  const toggle = (optionValue: string) => {
    onChange(selected.has(optionValue)
      ? value.filter((item) => item !== optionValue)
      : sortValues([...value, optionValue]));
  };

  const selectVisible = () => {
    onChange(sortValues([...new Set([...value, ...visibleOptions.map((option) => option.value)])]));
  };

  return <div ref={rootRef} className="graduation-cohort-select">
    <button
      type="button"
      className={open ? 'graduation-cohort-select__trigger is-open' : 'graduation-cohort-select__trigger'}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <span>{buttonLabel}</span><ChevronDown aria-hidden="true" />
    </button>
    {open && createPortal(<div
      ref={listRef}
      className="graduation-cohort-select__popover"
      style={listStyle}
      role="dialog"
      aria-label={dialogAriaLabel}
    >
      <div className="graduation-cohort-select__search">
        <Search aria-hidden="true" />
        <input
          autoFocus
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
        />
      </div>
      <div className="graduation-cohort-select__toolbar">
        <button type="button" onClick={selectVisible} disabled={visibleOptions.length === 0}>Chọn tất cả</button>
        <button type="button" onClick={() => onChange([])} disabled={value.length === 0}>Bỏ chọn</button>
      </div>
      <div className="graduation-cohort-select__options" role="listbox" aria-multiselectable="true">
        {visibleOptions.map((option) => <label key={option.value} className={selected.has(option.value) ? 'is-selected' : ''} role="option" aria-selected={selected.has(option.value)}>
          <input type="checkbox" checked={selected.has(option.value)} onChange={() => toggle(option.value)} />
          <span>{option.label}</span>
          {selected.has(option.value) && <Check aria-hidden="true" />}
        </label>)}
        {visibleOptions.length === 0 && <p>{emptyMessage}</p>}
      </div>
      <footer>{value.length === 0 ? allLabel : selectedLabel(value.length)}</footer>
    </div>, document.body)}
  </div>;
}
