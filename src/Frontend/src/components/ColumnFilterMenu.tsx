import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowDownZA, ListFilter, Search } from 'lucide-react';
import '../styles/column-filter.css';

export type SortDirection = 'asc' | 'desc';

interface ColumnFilterMenuProps {
  /** Tên cột, dùng cho nhãn trợ năng của nút mở menu. */
  label: string;
  /**
   * Các giá trị còn lại của cột sau khi đã áp bộ lọc của những cột khác, giống
   * Excel: đang lọc cột A thì danh sách của cột B chỉ liệt kê giá trị còn thấy.
   */
  values: string[];
  /** null nghĩa là chưa lọc, tức mọi giá trị đều được chọn. */
  selected: string[] | null;
  /**
   * Dòng lọc nhanh đặt ngay dưới hai nút sắp xếp: bấm là chọn đúng nhóm giá trị
   * đó rồi áp luôn, khỏi phải tự tích từng con số trong danh sách.
   */
  quickFilters?: { label: string; values: string[] }[];
  sortDirection: SortDirection | null;
  onApply: (selected: string[] | null) => void;
  onSort: (direction: SortDirection) => void;
}

/** Khoảng hở giữa nút mở và mép khung, đủ để không che mất tiêu đề cột. */
const panelGap = 4;
const panelWidth = 260;

export const ColumnFilterMenu: React.FC<ColumnFilterMenuProps> = ({
  label,
  values,
  selected,
  quickFilters,
  sortDirection,
  onApply,
  onSort,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** Bản nháp: chỉ ghi vào bộ lọc thật khi bấm OK, bấm Cancel thì bỏ. */
  const [draft, setDraft] = useState<string[]>(values);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ top: 0, left: 0 });

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isFiltered = selected !== null;

  const open = () => {
    setDraft(selected ?? values);
    setSearch('');
    setIsOpen(true);
  };

  const matching = (keyword: string) =>
    values.filter((value) => value.toLowerCase().includes(keyword));

  /**
   * Gõ vào Search là chọn lại đúng những giá trị khớp, giống Excel. Nếu chỉ ẩn
   * bớt dòng mà giữ nguyên bản nháp thì các giá trị đang bị ẩn vẫn còn được
   * chọn, bấm OK sẽ ra "chọn hết" tức bỏ lọc — không phải ý người dùng.
   * Xóa trắng ô Search thì trả bản nháp về trạng thái trước khi tìm.
   */
  const handleSearchChange = (next: string) => {
    setSearch(next);
    const keyword = next.trim().toLowerCase();
    setDraft(keyword ? matching(keyword) : (selected ?? values));
  };

  // Khung neo theo tọa độ màn hình vì bảng nằm trong vùng cuộn ngang, dùng
  // position tuyệt đối trong bảng sẽ bị cắt mất.
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - panelGap - viewportPadding;
    const spaceAbove = rect.top - panelGap - viewportPadding;
    const openAbove = spaceBelow < 300 && spaceAbove > spaceBelow;
    const availableHeight = openAbove ? spaceAbove : spaceBelow;
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - panelWidth - viewportPadding),
    );
    setPanelStyle({
      top: openAbove ? rect.top - panelGap : rect.bottom + panelGap,
      left,
      maxHeight: Math.min(440, Math.max(0, availableHeight)),
      transform: openAbove ? 'translateY(-100%)' : undefined,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    // Cuộn bảng hay cửa sổ thì khung sẽ lệch khỏi nút, đóng lại cho gọn.
    // Nhưng cuộn bên trong chính khung — kể cả cuộn tự động khi tích chọn một ô
    // ở mép danh sách — thì không được đóng, nếu không cú bấm đó mất luôn.
    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const visibleValues = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return values;
    return values.filter((value) => value.toLowerCase().includes(keyword));
  }, [values, search]);

  const checkedCount = visibleValues.filter((value) => draft.includes(value)).length;
  const allVisibleChecked = visibleValues.length > 0 && checkedCount === visibleValues.length;
  const someVisibleChecked = checkedCount > 0 && !allVisibleChecked;

  const toggleValue = (value: string) => {
    setDraft((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const toggleAllVisible = () => {
    setDraft((prev) => {
      if (allVisibleChecked) return prev.filter((value) => !visibleValues.includes(value));
      return [...new Set([...prev, ...visibleValues])];
    });
  };

  /** Chọn đủ mọi giá trị thì coi như bỏ lọc, để dấu hiệu "đang lọc" không bật oan. */
  const applySelection = (next: string[]) => {
    onApply(values.every((value) => next.includes(value)) ? null : next);
    setIsOpen(false);
  };

  const apply = () => applySelection(draft);

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={
          isFiltered ? 'column-filter-button column-filter-button--active' : 'column-filter-button'
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Lọc và sắp xếp cột ${label}${isFiltered ? ' (đang lọc)' : ''}`}
        title={`Lọc và sắp xếp cột ${label}`}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
      >
        <span className="column-filter-caret" aria-hidden="true" />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="column-filter-panel"
          role="dialog"
          aria-label={`Bộ lọc cột ${label}`}
          style={{ ...panelStyle, width: panelWidth }}
        >
          <button
            type="button"
            className={
              sortDirection === 'asc'
                ? 'column-filter-item column-filter-item--current'
                : 'column-filter-item'
            }
            onClick={() => {
              onSort('asc');
              setIsOpen(false);
            }}
          >
            <ArrowDownAZ aria-hidden="true" />
            Sort A to Z
          </button>
          <button
            type="button"
            className={
              sortDirection === 'desc'
                ? 'column-filter-item column-filter-item--current'
                : 'column-filter-item'
            }
            onClick={() => {
              onSort('desc');
              setIsOpen(false);
            }}
          >
            <ArrowDownZA aria-hidden="true" />
            Sort Z to A
          </button>

          {quickFilters && quickFilters.length > 0 && (
            <>
              <div className="column-filter-divider" />
              {quickFilters.map((quick) => (
                <button
                  key={quick.label}
                  type="button"
                  className="column-filter-item"
                  disabled={quick.values.length === 0}
                  onClick={() => applySelection(quick.values)}
                >
                  <ListFilter aria-hidden="true" />
                  {quick.label}
                </button>
              ))}
            </>
          )}

          <div className="column-filter-divider" />

          <div className="column-filter-search">
            <input
              type="text"
              value={search}
              placeholder="Search"
              aria-label={`Tìm giá trị trong cột ${label}`}
              onChange={(event) => handleSearchChange(event.target.value)}
            />
            <Search aria-hidden="true" />
          </div>

          <div className="column-filter-values" role="group" aria-label="Giá trị của cột">
            {visibleValues.length === 0 ? (
              <p className="column-filter-empty">Không có giá trị nào khớp.</p>
            ) : (
              <>
                <label className="column-filter-option">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    ref={(node) => {
                      if (node) node.indeterminate = someVisibleChecked;
                    }}
                    onChange={toggleAllVisible}
                  />
                  <span>(Select All)</span>
                </label>
                {visibleValues.map((value) => (
                  <label className="column-filter-option" key={value}>
                    <input
                      type="checkbox"
                      checked={draft.includes(value)}
                      onChange={() => toggleValue(value)}
                    />
                    {/* Giá trị rỗng vẫn phải bấm được, nếu không thì ô trống trơn. */}
                    <span>{value === '' ? '(trống)' : value}</span>
                  </label>
                ))}
              </>
            )}
          </div>

          <div className="column-filter-actions">
            <button
              type="button"
              className="column-filter-ok"
              disabled={draft.length === 0}
              title={draft.length === 0 ? 'Phải chọn ít nhất một giá trị' : undefined}
              onClick={apply}
            >
              OK
            </button>
            <button type="button" className="column-filter-cancel" onClick={() => setIsOpen(false)}>
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
