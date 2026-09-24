import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import type { DepartmentOverview } from '../../types';
import { completionColor, scoreColor } from './theme';
import { formatDecimal, formatPercent } from '../../utils/formatNumber';

interface LaggingDepartmentsTableProps {
  departments: DepartmentOverview[];
  onSelect?: (departmentId: number) => void;
}

type SortKey = 'departmentName' | 'facultyName' | 'sectionCount' | 'completionRate' | 'averageScore';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 10;

/** Bảng các Bộ môn có tiến độ thu phiếu thấp nhất (sắp tăng dần theo % hoàn thành). */
export const LaggingDepartmentsTable: React.FC<LaggingDepartmentsTableProps> = ({
  departments,
  onSelect,
}) => {
  const [sortKey, setSortKey] = useState<SortKey | undefined>();
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  const sortedDepartments = useMemo(() => {
    if (!sortKey) return departments;
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...departments].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result = typeof left === 'string'
        ? left.localeCompare(String(right), 'vi')
        : Number(left) - Number(right);
      return result * direction;
    });
  }, [departments, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedDepartments.length / PAGE_SIZE));
  const pageItems = sortedDepartments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const changeSort = (nextKey: SortKey) => {
    if (sortKey !== nextKey) {
      setSortKey(nextKey);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortKey(undefined);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ArrowUp aria-hidden="true" />
      : <ArrowDown aria-hidden="true" />;
  };

  const sortableHeader = (key: SortKey, label: string) => (
    <button
      type="button"
      className="reports-sort-button"
      onClick={() => changeSort(key)}
      aria-label={`Sắp xếp ${label}: ${sortKey !== key ? 'tăng dần' : sortDirection === 'asc' ? 'giảm dần' : 'bỏ sắp xếp'}`}
    >
      {label}
      {sortIcon(key)}
    </button>
  );

  if (sortedDepartments.length === 0) {
    return (
      <div className="reports-chart-empty">
        Không có Bộ môn nào chậm tiến độ dưới 20%.
      </div>
    );
  }

  return (
    <div className="reports-lagging">
      <table className="campaign-table reports-lagging-table">
        <thead>
          <tr>
            <th>{sortableHeader('departmentName', 'Bộ môn')}</th>
            <th>{sortableHeader('facultyName', 'Thuộc Khoa')}</th>
            <th className="reports-lagging-num">{sortableHeader('sectionCount', 'Lớp')}</th>
            <th className="reports-lagging-progress-col">{sortableHeader('completionRate', 'Tiến độ')}</th>
            <th className="reports-lagging-num">{sortableHeader('averageScore', 'Điểm TB')}</th>
          </tr>
        </thead>
        <tbody>
          {pageItems.map((dept) => (
            <tr
              key={dept.departmentId}
              onClick={onSelect ? () => onSelect(dept.departmentId) : undefined}
              onKeyDown={onSelect ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(dept.departmentId);
                }
              } : undefined}
              tabIndex={onSelect ? 0 : undefined}
              className={onSelect ? 'reports-lagging-row is-clickable' : 'reports-lagging-row'}
              title={onSelect ? 'Click để lọc chi tiết theo Bộ môn này' : undefined}
            >
              <td>
                <span className="catalog-cell-primary">{dept.departmentName}</span>
                <span className="catalog-secondary-value">{dept.sectionCount} lớp khảo sát</span>
              </td>
              <td>
                <span className="reports-lagging-faculty">
                  <Building2 className="operation-icon" aria-hidden="true" />
                  {dept.facultyName}
                </span>
              </td>
              <td className="report-number-cell">{dept.sectionCount}</td>
              <td className="reports-lagging-progress">
                <div className="reports-progress">
                  <span
                    style={{
                      width: `${Math.min(100, dept.completionRate)}%`,
                      background: completionColor(dept.completionRate),
                    }}
                  />
                </div>
                <span style={{ color: completionColor(dept.completionRate), fontWeight: 700 }}>
                  {formatPercent(dept.completionRate, 3)}
                </span>
              </td>
              <td className="report-number-cell" style={{ color: scoreColor(dept.averageScore) }}>
                <span className="catalog-score">
                  <Star style={{ width: 12, height: 12, fill: 'currentColor' }} aria-hidden="true" />
                  {dept.averageScore > 0 ? formatDecimal(dept.averageScore, 3) : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="reports-pagination" aria-label="Phân trang danh sách Bộ môn">
        <span>
          Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedDepartments.length)}
          {' / '}{sortedDepartments.length} Bộ môn
        </span>
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            aria-label="Trang trước"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>Trang {page} / {pageCount}</strong>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            aria-label="Trang sau"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
