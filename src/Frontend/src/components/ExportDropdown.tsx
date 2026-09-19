import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, File, LoaderCircle, ChevronDown } from 'lucide-react';
import {
  exportData,
  type AnyExportOptions,
  type ExportFormat,
} from '../services/exportDataService';

export interface ExportDropdownProps<T = any> {
  options?: AnyExportOptions<T> | (() => AnyExportOptions<T> | Promise<AnyExportOptions<T>>);
  onExport?: (format: ExportFormat) => void | Promise<void>;
  buttonLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export const ExportDropdown: React.FC<ExportDropdownProps> = ({
  options,
  onExport,
  buttonLabel = 'Xuất dữ liệu',
  className = '',
  size = 'sm',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectFormat = async (format: ExportFormat) => {
    setIsOpen(false);
    if (disabled || isExporting) return;

    setIsExporting(true);
    setActiveFormat(format);

    try {
      if (onExport) {
        await onExport(format);
      } else if (options) {
        const resolvedOptions = typeof options === 'function' ? await options() : options;
        await exportData(format, resolvedOptions);
      }
    } catch (error) {
      console.error('Export handler error:', error);
    } finally {
      setIsExporting(false);
      setActiveFormat(null);
    }
  };

  const btnSizeClass = size === 'sm' ? 'btn-sm' : '';

  return (
    <div className={`export-dropdown-wrapper ${className}`} ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`btn btn-secondary ${btnSizeClass} export-dropdown-trigger`}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Xuất dữ liệu ra Excel, Word hoặc PDF"
      >
        {isExporting ? (
          <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />
        ) : (
          <Download size={15} aria-hidden="true" />
        )}
        <span>{isExporting ? `Đang xuất ${activeFormat?.toUpperCase()}...` : buttonLabel}</span>
        <ChevronDown size={14} aria-hidden="true" className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {isOpen && (
        <div
          className="export-dropdown-menu"
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 1000,
            minWidth: '180px',
            backgroundColor: '#ffffff',
            borderRadius: '6px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.08)',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            onClick={() => handleSelectFormat('xlsx')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#000000',
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <FileSpreadsheet size={16} color="#16a34a" aria-hidden="true" />
            <span>Xuất Excel (<strong>.xlsx</strong>)</span>
          </button>

          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            onClick={() => handleSelectFormat('docx')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#000000',
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <FileText size={16} color="#2563eb" aria-hidden="true" />
            <span>Xuất Word (<strong>.docx</strong>)</span>
          </button>

          <button
            type="button"
            className="export-menu-item"
            role="menuitem"
            onClick={() => handleSelectFormat('pdf')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#000000',
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <File size={16} color="#dc2626" aria-hidden="true" />
            <span>Xuất PDF (<strong>.pdf</strong>)</span>
          </button>
        </div>
      )}
    </div>
  );
};
