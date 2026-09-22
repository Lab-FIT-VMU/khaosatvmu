import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, File, FileSpreadsheet, FileText, Image, LoaderCircle } from 'lucide-react';
import {
  exportGraduationReport,
  type GraduationReportExportOptions,
  type GraduationReportFormat,
} from '../../services/exportGraduationReportService';

interface GraduationReportExportProps {
  getOptions: () => GraduationReportExportOptions | null;
  disabled?: boolean;
}

const entries: Array<{
  format: GraduationReportFormat;
  label: string;
  detail: string;
  icon: typeof File;
  color: string;
}> = [
  { format: 'pdf', label: 'Xuất PDF', detail: 'kèm biểu đồ in ấn', icon: File, color: '#dc2626' },
  { format: 'docx', label: 'Xuất Word', detail: 'kèm biểu đồ .docx', icon: FileText, color: '#2563eb' },
  { format: 'xlsx', label: 'Xuất Excel', detail: 'bảng số liệu & biểu đồ', icon: FileSpreadsheet, color: '#16a34a' },
  { format: 'png', label: 'Tải ảnh biểu đồ', detail: '.png', icon: Image, color: '#8b5cf6' },
];

export function GraduationReportExport({ getOptions, disabled = false }: GraduationReportExportProps) {
  const [open, setOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<GraduationReportFormat | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const runExport = async (format: GraduationReportFormat) => {
    setOpen(false);
    const options = getOptions();
    if (!options) return;
    setActiveFormat(format);
    try {
      await exportGraduationReport(format, options);
    } finally {
      setActiveFormat(null);
    }
  };

  return <div ref={rootRef} className="export-dropdown-wrapper graduation-report-export">
    <button
      type="button"
      className="btn btn-secondary btn-sm export-dropdown-trigger"
      disabled={disabled || activeFormat !== null}
      onClick={() => setOpen((current) => !current)}
      aria-haspopup="true"
      aria-expanded={open}
      title="Xuất kết quả thống kê kèm biểu đồ"
    >
      {activeFormat ? <LoaderCircle className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
      <span>{activeFormat ? `Đang xuất ${activeFormat.toUpperCase()}...` : 'Xuất kết quả & biểu đồ'}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {open && <div className="export-dropdown-menu" role="menu">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return <button key={entry.format} type="button" className="export-menu-item" role="menuitem" onClick={() => void runExport(entry.format)}>
          <Icon size={16} color={entry.color} aria-hidden="true" />
          <span>{entry.label} (<strong>{entry.detail}</strong>)</span>
        </button>;
      })}
    </div>}
  </div>;
}
