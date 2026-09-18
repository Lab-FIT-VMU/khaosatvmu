import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { ExportDropdown } from '../ExportDropdown';
import type { GraduationExploreResultV3 } from '../../types/graduationAnalytics';

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

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const direction = sortDirection === 'asc' ? 1 : -1;
    return rows
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
  }, [rows, sortDirection, sortKey]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    setSortKey(null);
    setSortDirection('asc');
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ArrowUp aria-hidden="true" />
      : <ArrowDown aria-hidden="true" />;
  };

  const nextSortLabel = (key: SortKey) => {
    if (sortKey !== key) return 'tăng dần';
    return sortDirection === 'asc' ? 'giảm dần' : 'bỏ sắp xếp';
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
                  <button
                    type="button"
                    className="graduation-sort-button"
                    onClick={() => changeSort(column.key)}
                    aria-label={`Sắp xếp ${column.label}: ${nextSortLabel(column.key)}`}
                  >
                    {column.label}
                    {sortIcon(column.key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
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
