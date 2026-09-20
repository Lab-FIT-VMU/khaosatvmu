import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Plus, Search } from 'lucide-react';
import { ColumnFilterMenu } from './ColumnFilterMenu';
import { TablePagination } from './TablePagination';
import { ExportDropdown } from './ExportDropdown';
import type { AnyExportOptions, ExportColumn, ExportSheet } from '../services/exportDataService';
import '../styles/catalogs.css';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortValue?: (item: T) => string | number | null | undefined;
  /**
   * Giá trị dùng cho menu lọc kiểu Excel. Cột nào không khai báo thì không có
   * nút lọc — dùng cho cột thao tác, hoặc cột mà mỗi dòng một giá trị riêng
   * nên lọc không gom nhóm được gì.
   */
  filterValue?: (item: T) => string;
  /**
   * Dòng lọc nhanh trong menu lọc, gom các giá trị lẻ thành nhóm có nghĩa —
   * ví dụ cột tỷ lệ gom theo mức tiến độ thay vì bắt tích từng con số.
   */
  quickFilters?: { label: string; match: (value: string) => boolean }[];
  /** Đặt true cho cột số để sắp xếp danh sách giá trị theo trị số. */
  numeric?: boolean;
  width?: string;
  /** Tùy chọn hàm định dạng riêng khi xuất Excel / Word / PDF */
  exportFormat?: (item: T) => string | number | boolean | null | undefined;
  /** Ẩn cột này khi xuất dữ liệu */
  exportable?: boolean;
}

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableExportConfig<T> {
  fileName?: string;
  title?: string;
  subtitle?: string;
  subInstitution?: string;
  info?: Record<string, string | number | undefined | null>;
  summaryNotes?: string[];
  columns?: ExportColumn<T>[];
  sheets?: ExportSheet<any>[];
  scope?: 'filtered' | 'all';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  filterOptions?: { label: string; value: string }[];
  currentFilter?: string;
  onFilterChange?: (val: string) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  toolbarActions?: ReactNode;
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
  /**
   * Báo ra ngoài những dòng còn lại sau bộ lọc cột, để một bảng khác bám theo.
   * Hàm truyền vào phải ổn định (useCallback), nếu không sẽ gọi lại mỗi lần render.
   */
  onVisibleDataChange?: (rows: T[]) => void;
  /** Cột STT. Tắt khi bảng đã đủ rộng và số thứ tự không nói lên điều gì. */
  showIndex?: boolean;
  /** Số dòng mỗi trang. Mặc định 20 để các trang mới không vô tình hiển thị toàn bộ dữ liệu. */
  pageSize?: number;
  sortKey?: string;
  sortDirection?: DataTableSortDirection;
  onSortChange?: (key?: string, direction?: DataTableSortDirection) => void;
  /** Bật tính năng xuất file .xlsx, .docx, .pdf. Mặc định: true */
  enableExport?: boolean;
  exportConfig?: DataTableExportConfig<T>;
  /** Nhận sự kiện bấm vào dòng dữ liệu */
  onRowClick?: (item: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Tìm kiếm danh mục...',
  searchValue = '',
  onSearchChange,
  filterOptions,
  currentFilter = '',
  onFilterChange,
  onAddNew,
  addNewLabel = 'Thêm mới',
  toolbarActions,
  emptyMessage = 'Chưa có dữ liệu trong danh mục này.',
  keyExtractor,
  onVisibleDataChange,
  showIndex = true,
  pageSize = 20,
  sortKey,
  sortDirection = 'asc',
  onSortChange,
  enableExport = true,
  exportConfig,
  onRowClick,
}: DataTableProps<T>) {
  const resolvedAddLabel = addNewLabel.replace(/^\+\s*/, '');

  const [page, setPage] = useState(1);
  /** Không có khóa nghĩa là cột đó chưa lọc. */
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  /**
   * Sắp xếp nội bộ, dùng khi trang không truyền onSortChange. Các trang danh mục
   * đều không truyền, nếu chỉ dựa vào prop thì nút sắp xếp trong menu lọc sẽ chết.
   */
  const [innerSort, setInnerSort] = useState<{
    key: string;
    direction: DataTableSortDirection;
  } | null>(null);

  const isControlledSort = Boolean(onSortChange);
  const activeSortKey = isControlledSort ? sortKey : innerSort?.key;
  const activeSortDirection = isControlledSort ? sortDirection : (innerSort?.direction ?? 'asc');

  const changeSortTo = (key: string | undefined, direction?: DataTableSortDirection) => {
    if (isControlledSort) {
      onSortChange?.(key, direction);
      return;
    }
    setInnerSort(key ? { key, direction: direction ?? 'asc' } : null);
  };

  const filterableColumns = useMemo(
    () => columns.filter((column) => column.filterValue),
    [columns]
  );

  /** Dòng có qua bộ lọc không, bỏ qua cột `except` để dựng danh sách cho chính cột đó. */
  const passesFilters = (item: T, except?: string) =>
    filterableColumns.every((column) => {
      if (column.key === except) return true;
      const allowed = columnFilters[column.key];
      return !allowed || allowed.includes(column.filterValue!(item));
    });

  const filteredData = useMemo(
    () => data.filter((item) => passesFilters(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, filterableColumns, columnFilters]
  );

  const hasQuery = Boolean(
    searchValue.trim() || currentFilter || Object.keys(columnFilters).length > 0
  );

  const sortedData = useMemo(() => {
    if (!activeSortKey) return filteredData;
    const column = columns.find(
      (item) => item.key === activeSortKey && (item.sortValue || item.filterValue)
    );
    if (!column) return filteredData;
    // Cột chỉ khai báo filterValue vẫn sắp xếp được: dùng luôn giá trị đó, đổi
    // sang số khi cột đánh dấu numeric.
    const valueOf = column.sortValue
      ? column.sortValue
      : (item: T) => (column.numeric ? Number(column.filterValue!(item)) : column.filterValue!(item));
    const direction = activeSortDirection === 'asc' ? 1 : -1;
    return [...filteredData].sort((leftItem, rightItem) => {
      const left = valueOf(leftItem);
      const right = valueOf(rightItem);
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      const result = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
      return result * direction;
    });
  }, [columns, filteredData, activeSortDirection, activeSortKey]);

  useEffect(() => {
    onVisibleDataChange?.(filteredData);
  }, [filteredData, onVisibleDataChange]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  // Lọc hoặc xóa bớt dòng có thể làm trang hiện tại vượt quá số trang còn lại.
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [activeSortDirection, activeSortKey]);

  useEffect(() => {
    setPage(1);
  }, [currentFilter, searchValue]);

  const firstIndex = (page - 1) * pageSize;
  const visibleRows = sortedData.slice(firstIndex, firstIndex + pageSize);

  const exportColumns = useMemo<ExportColumn<T>[]>(() => {
    if (exportConfig?.columns) {
      return exportConfig.columns;
    }
    return columns
      .filter((col) => col.exportable !== false && col.key !== 'actions' && col.header.trim().length > 0)
      .map((col) => ({
        key: col.key,
        header: col.header,
        type: col.numeric ? 'number' : 'string',
        align: col.numeric ? 'right' : 'left',
        format: (val: any, item: T) => {
          if (col.exportFormat) {
            return col.exportFormat(item);
          }
          if (col.filterValue) {
            return col.filterValue(item);
          }
          if (col.sortValue) {
            const sv = col.sortValue(item);
            return sv !== null && sv !== undefined ? sv : '';
          }
          if (val === null || val === undefined) return '';
          if (typeof val === 'object') return '';
          return val;
        },
      }));
  }, [columns, exportConfig?.columns]);

  const exportDataPayload = useMemo<AnyExportOptions<T>>(() => {
    const exportDataset = exportConfig?.scope === 'all' ? data : sortedData;
    // Placeholder chỉ hướng dẫn tìm kiếm, không mô tả nội dung báo cáo. Dùng nó làm
    // tên tệp từng tạo ra các tên sai như "tim-nhanh-theo-ten-bo-mon.xlsx".
    const resolvedTitle = exportConfig?.title || 'DANH SÁCH DỮ LIỆU';
    const resolvedFileName =
      exportConfig?.fileName ||
      'danh-sach-du-lieu';

    if (exportConfig?.sheets && exportConfig.sheets.length > 0) {
      return {
        fileName: resolvedFileName,
        metadata: {
          title: resolvedTitle,
          subtitle: exportConfig?.subtitle,
          subInstitution: exportConfig?.subInstitution,
          info: exportConfig?.info,
          summaryNotes: exportConfig?.summaryNotes,
        },
        sheets: exportConfig.sheets,
      };
    }

    return {
      fileName: resolvedFileName,
      metadata: {
        title: resolvedTitle,
        subtitle: exportConfig?.subtitle,
        subInstitution: exportConfig?.subInstitution,
        info: exportConfig?.info,
        summaryNotes: exportConfig?.summaryNotes,
      },
      columns: exportColumns,
      data: exportDataset,
    };
  }, [data, exportColumns, exportConfig, sortedData]);

  const changeSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    if (activeSortKey !== column.key) {
      changeSortTo(column.key, 'asc');
    } else if (activeSortDirection === 'asc') {
      changeSortTo(column.key, 'desc');
    } else {
      changeSortTo(undefined, undefined);
    }
  };

  const nextSortAction = (column: Column<T>): string => {
    if (activeSortKey !== column.key) return 'tăng dần';
    return activeSortDirection === 'asc' ? 'giảm dần' : 'bỏ sắp xếp';
  };

  /** Giá trị cho menu của một cột, đã trừ các dòng bị cột khác lọc mất. */
  const valuesFor = (column: Column<T>) =>
    [...new Set(
      data.filter((item) => passesFilters(item, column.key)).map((item) => column.filterValue!(item))
    )].sort((left, right) =>
      column.numeric ? Number(left) - Number(right) : left.localeCompare(right, 'vi')
    );

  const applyColumnFilter = (key: string, selected: string[] | null) => {
    setPage(1);
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (selected === null) delete next[key];
      else next[key] = selected;
      return next;
    });
  };

  return (
    <section className="catalog-table-shell" aria-label="Danh sách danh mục">
      <div className="catalog-toolbar">
        <div className="catalog-toolbar__search">
          {onSearchChange && (
            <label className="catalog-search">
              <span className="catalog-sr-only">Tìm kiếm</span>
              <Search aria-hidden="true" size={16} />
              <input
                type="search"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
          )}
          <span className="catalog-result-count" aria-live="polite">
            {sortedData.length} kết quả
          </span>
        </div>

        <div className="catalog-toolbar__actions">
          {filterOptions && onFilterChange && (
            <label className="catalog-filter">
              <span className="catalog-sr-only">Lọc danh mục</span>
              <select
                value={currentFilter}
                onChange={(event) => onFilterChange(event.target.value)}
                aria-label="Lọc danh mục"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {enableExport && exportColumns.length > 0 && (
            <ExportDropdown options={exportDataPayload} size="sm" />
          )}

          {onAddNew && (
            <button className="btn btn-primary btn-sm catalog-add-button" onClick={onAddNew}>
              <Plus aria-hidden="true" size={16} />
              <span>{resolvedAddLabel}</span>
            </button>
          )}

          {toolbarActions}
        </div>
      </div>

      <div className="catalog-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu, có thể cuộn ngang">
        <table className="catalog-table">
          <thead>
            <tr>
              {showIndex && <th className="catalog-table__index" scope="col">STT</th>}
              {columns.map((column) => {
                const filterValues = column.filterValue ? valuesFor(column) : [];

                return (
                <th key={column.key} scope="col" style={{ width: column.width }}>
                  <span className={column.filterValue ? 'catalog-th-filterable' : undefined}>
                    {/* Cột nào có menu lọc thì sắp xếp nằm sẵn trong menu đó, khỏi
                        cần thêm nút mũi tên; chỉ giữ dấu chỉ hướng đang sắp xếp. */}
                    {column.sortValue && !column.filterValue ? (
                      <button
                        type="button"
                        className="catalog-sort-button catalog-th-label"
                        onClick={() => changeSort(column)}
                        aria-label={`Sắp xếp ${column.header}: ${nextSortAction(column)}`}
                      >
                        {column.header}
                        {activeSortKey !== column.key
                          ? <ArrowUpDown aria-hidden="true" />
                          : activeSortDirection === 'asc'
                            ? <ArrowUp aria-hidden="true" />
                            : <ArrowDown aria-hidden="true" />}
                      </button>
                    ) : (
                      <span className="catalog-th-label">
                        {column.header}
                        {activeSortKey === column.key && (
                          activeSortDirection === 'asc'
                            ? <ArrowUp aria-hidden="true" />
                            : <ArrowDown aria-hidden="true" />
                        )}
                      </span>
                    )}
                    {column.filterValue && (
                      <ColumnFilterMenu
                        label={column.header}
                        values={filterValues}
                        selected={columnFilters[column.key] ?? null}
                        quickFilters={column.quickFilters?.map((quick) => ({
                          label: quick.label,
                          values: filterValues.filter(quick.match),
                        }))}
                        // Sắp xếp vẫn đi qua một đường duy nhất của bảng, dù là
                        // sắp xếp nội bộ hay do trang điều khiển.
                        sortDirection={activeSortKey === column.key ? activeSortDirection : null}
                        onSort={(direction) => changeSortTo(column.key, direction)}
                        onApply={(selected) => applyColumnFilter(column.key, selected)}
                      />
                    )}
                  </span>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td className="catalog-empty" colSpan={columns.length + (showIndex ? 1 : 0)}>
                  <Inbox aria-hidden="true" size={24} />
                  <strong>{hasQuery ? 'Không tìm thấy kết quả phù hợp' : emptyMessage}</strong>
                  {hasQuery && <span>Thử thay đổi từ khóa hoặc bộ lọc hiện tại.</span>}
                </td>
              </tr>
            ) : (
              visibleRows.map((item, index) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={
                    onRowClick
                      ? (e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, select, textarea')) return;
                          onRowClick(item);
                        }
                      : undefined
                  }
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {showIndex && (
                    <td className="catalog-table__index">{firstIndex + index + 1}</td>
                  )}
                  {columns.map((column) => (
                    // Cột số căn phải để hàng đơn vị thẳng cột, dễ so số dài ngắn.
                    // Chỉ ô dữ liệu; tiêu đề vẫn căn giữa như mọi cột khác.
                    <td key={column.key} className={column.numeric ? 'catalog-cell-numeric' : undefined}>
                      {column.render
                        ? column.render(item)
                        : (item as Record<string, unknown>)[column.key] as ReactNode}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        page={page}
        pageSize={pageSize}
        totalItems={sortedData.length}
        onPageChange={setPage}
      />
    </section>
  );
}
