import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ColumnFilterMenu } from '../ColumnFilterMenu';
import { ExportDropdown } from '../ExportDropdown';
import type { GraduationExploreResultV3 } from '../../types/graduationAnalytics2';

type SummaryRow = GraduationExploreResultV3['breakdown'][number];
type SortKey = keyof Pick<
  SummaryRow,
  | 'facultyName'
  | 'programName'
  | 'cohortCode'
  | 'graduated'
  | 'onTime'
  | 'workStudy'
  | 'excellent'
  | 'veryGood'
  | 'good'
  | 'average'
>;
type SortDirection = 'asc' | 'desc';

interface GraduationSummaryTableProps {
  rows: SummaryRow[];
  fileName: string;
  subtitle: string;
}

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'facultyName', label: 'Khoa' },
  { key: 'programName', label: 'Chuyên ngành' },
  { key: 'cohortCode', label: 'Khóa' },
  { key: 'graduated', label: 'Đã tốt nghiệp' },
  { key: 'onTime', label: 'Đúng hạn' },
  { key: 'workStudy', label: 'VLVH' },
  { key: 'excellent', label: 'Xuất sắc' },
  { key: 'veryGood', label: 'Giỏi' },
  { key: 'good', label: 'Khá' },
  { key: 'average', label: 'Trung bình' },
];

export function GraduationSummaryTable({ rows, fileName, subtitle }: GraduationSummaryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [columnFilters, setColumnFilters] = useState<Partial<Record<SortKey, string[]>>>({});

  const valueOf = (row: SummaryRow, key: SortKey) => String(row[key]);

  const filteredRows = useMemo(() => rows.filter((row) => columns.every((column) => {
    const selected = columnFilters[column.key];
    return !selected || selected.includes(valueOf(row, column.key));
  })), [columnFilters, rows]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const direction = sortDirection === 'asc' ? 1 : -1;
    return filteredRows
      .map((row, index) => ({ row, index }))
      .sort((leftItem, rightItem) => {
        const left = leftItem.row[sortKey];
        const right = rightItem.row[sortKey];
        const result = typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'vi', { numeric: true, sensitivity: 'base' });
        return result === 0 ? leftItem.index - rightItem.index : result * direction;
      })
      .map((item) => item.row);
  }, [filteredRows, sortDirection, sortKey]);

  const changeSort = (nextKey: SortKey, direction: SortDirection) => {
    setSortKey(nextKey);
    setSortDirection(direction);
  };

  const activeSortIcon = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDirection === 'asc'
      ? <ArrowUp aria-hidden="true" />
      : <ArrowDown aria-hidden="true" />;
  };

  const valuesFor = (key: SortKey) => {
    const numeric = typeof rows[0]?.[key] === 'number';
    return [...new Set(rows
      .filter((row) => columns.every((column) => {
        if (column.key === key) return true;
        const selected = columnFilters[column.key];
        return !selected || selected.includes(valueOf(row, column.key));
      }))
      .map((row) => valueOf(row, key)))]
      .sort((left, right) => numeric
        ? Number(left) - Number(right)
        : left.localeCompare(right, 'vi', { numeric: true, sensitivity: 'base' }));
  };

  const applyColumnFilter = (key: SortKey, selected: string[] | null) => {
    setColumnFilters((current) => {
      const next = { ...current };
      if (selected === null) delete next[key];
      else next[key] = selected;
      return next;
    });
  };

  return (
    <article className="graduation-v3-card graduation-v3-table">
      <header>
        <div>
          <span>BẢNG SỐ LƯỢNG TỔNG HỢP</span>
          <h2>Theo khoa, chuyên ngành và khóa</h2>
        </div>
        {rows.length > 0 && (
          <ExportDropdown
            buttonLabel="Xuất số liệu"
            size="sm"
            options={{
              fileName,
              metadata: {
                title: 'THỐNG KÊ KẾT QUẢ TỐT NGHIỆP',
                subtitle,
              },
              columns: [
                { key: 'facultyName', header: 'Khoa', width: 24 },
                { key: 'programName', header: 'Chuyên ngành', width: 28 },
                { key: 'cohortCode', header: 'Khóa', width: 10 },
                { key: 'graduated', header: 'Đã tốt nghiệp', type: 'number', width: 14 },
                { key: 'onTime', header: 'Đúng hạn', type: 'number', width: 12 },
                { key: 'workStudy', header: 'VLVH', type: 'number', width: 10 },
                { key: 'excellent', header: 'Xuất sắc', type: 'number', width: 10 },
                { key: 'veryGood', header: 'Giỏi', type: 'number', width: 10 },
                { key: 'good', header: 'Khá', type: 'number', width: 10 },
                { key: 'average', header: 'Trung bình', type: 'number', width: 12 },
              ],
              data: sortedRows,
            }}
          />
        )}
      </header>
      <div>
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  aria-sort={sortKey === column.key
                    ? (sortDirection === 'asc' ? 'ascending' : 'descending')
                    : 'none'}
                >
                  <span className="graduation-column-filterable">
                    <span className="graduation-column-label">
                      {column.label}
                      {activeSortIcon(column.key)}
                    </span>
                    <ColumnFilterMenu
                      label={column.label}
                      values={valuesFor(column.key)}
                      selected={columnFilters[column.key] ?? null}
                      sortDirection={sortKey === column.key ? sortDirection : null}
                      onSort={(direction) => changeSort(column.key, direction)}
                      onApply={(selected) => applyColumnFilter(column.key, selected)}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? <tr><td className="graduation-table-empty" colSpan={columns.length}>Không có dữ liệu phù hợp với bộ lọc.</td></tr> : sortedRows.map((row) => (
              <tr key={`${row.facultyKey}-${row.programKey}-${row.cohortCode}`}>
                <td>{row.facultyName}</td>
                <td>{row.programName}</td>
                <td>{row.cohortCode}</td>
                <td>{row.graduated}</td>
                <td>{row.onTime}</td>
                <td>{row.workStudy}</td>
                <td>{row.excellent}</td>
                <td>{row.veryGood}</td>
                <td>{row.good}</td>
                <td>{row.average}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
