import React, { useState } from 'react';
import {
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Folder,
  FolderOpen,
  GraduationCap,
  Info,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog, Modal } from '../components/Modal';
import { InlineTreeWizard } from '../components/InlineTreeWizard';
import { TablePagination } from '../components/TablePagination';
import { useSemester } from '../context/semesterContext';
import { useSetBreadcrumbTrail } from '../context/breadcrumbTrail';
import { usePaginatedItems } from '../hooks/usePaginatedItems';
import type {
  SurveyCampaign,
  Major,
  Course,
  CourseSection,
  Lecturer,
  Criterion,
} from '../types';
import '../styles/survey-operations.css';
import { foldVietnamese, toVietnameseFileSlug } from '../utils/vietnamese';

interface CampaignsPageProps {
  campaigns: SurveyCampaign[];
  majors: Major[];
  sections: CourseSection[];
  courses: Course[];
  lecturers: Lecturer[];
  criteria: Criterion[];
  surveyType?: 'Học phần' | 'Chương trình đào tạo';
  onAddCampaign: (campaign: SurveyCampaign) => void;
  onAddMultipleCampaigns?: (campaigns: SurveyCampaign[]) => void;
  onDeleteCampaign: (id: string) => void;
  onUpdateCampaignDates: (id: string, startDate: string, endDate: string) => void;
  onOpenQR: (campaign: SurveyCampaign) => void;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({
  campaigns,
  majors,
  sections,
  courses,
  lecturers,
  criteria,
  surveyType,
  onAddCampaign,
  onAddMultipleCampaigns,
  onDeleteCampaign,
  onUpdateCampaignDates,
  onOpenQR,
}) => {
  const { activeSemester, activeYear } = useSemester();
  const [activeTab, setActiveTab] = useState<'Học phần' | 'Chương trình đào tạo'>(
    surveyType || 'Học phần'
  );

  // Loại khảo sát đang xem là cấp dưới của mục trên thanh điều hướng.
  useSetBreadcrumbTrail([activeTab]);

  // Filter States
  const [search, setSearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [academicYearFilter, setAcademicYearFilter] = useState('');

  // Tree View Expand / Collapse state (Default open all)
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    '2025-2026_Học kỳ II': true,
    '2025-2026_Học kỳ I': true,
    '2026-2027_Học kỳ I': true,
  });

  // Tự động mở thư mục của học kỳ đang kích hoạt
  React.useEffect(() => {
    if (activeYear && activeSemester) {
      const folderKey = `${activeYear.academicYearName}_${activeSemester.semesterName}`;
      setExpandedFolders((prev) => ({ ...prev, [folderKey]: true }));
    }
  }, [activeYear, activeSemester]);

  // Inline Tree Wizard State (specifies target semester & academic year on the tree)
  const [activeWizardTarget, setActiveWizardTarget] = useState<{
    semester?: string;
    academicYear?: string;
  } | null>(null);

  // Edit QR Time Modal State
  const [editingCampaign, setEditingCampaign] = useState<SurveyCampaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<SurveyCampaign | null>(null);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const handleOpenWizard = (semester?: string, academicYear?: string) => {
    if (academicYear && semester) {
      const folderKey = `${academicYear}_${semester}`;
      setExpandedFolders((prev) => ({ ...prev, [folderKey]: true }));
    }
    setActiveWizardTarget({ semester, academicYear });
  };

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [folderKey]: !prev[folderKey],
    }));
  };

  const handleCreateMultipleFromWizard = (newCampaigns: SurveyCampaign[]) => {
    if (onAddMultipleCampaigns) {
      onAddMultipleCampaigns(newCampaigns);
    } else {
      newCampaigns.forEach((cmp) => onAddCampaign(cmp));
    }
    setActiveWizardTarget(null);
    toast.success('Đã tạo đợt khảo sát', {
      description: `${newCampaigns.length} bài khảo sát đã được thêm vào thư mục đã chọn.`,
    });
  };

  const handleSaveDateEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCampaign) {
      onUpdateCampaignDates(editingCampaign.id, editStartDate, editEndDate);
      toast.success('Đã cập nhật lịch khảo sát', {
        description: editingCampaign.title,
      });
      setEditingCampaign(null);
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Đã sao chép đường dẫn khảo sát');
    } catch {
      toast.error('Không thể sao chép tự động', {
        description: 'Hãy chọn đường dẫn trong bảng và sao chép thủ công.',
      });
    }
  };

  const handleExportCampaigns = () => {
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = filteredCampaigns.map((campaign) => [
      campaign.title,
      campaign.classCode ?? '',
      campaign.startDate,
      campaign.endDate,
      campaign.surveyLink ?? `https://khaosat.vimaru.edu.vn/survey/${campaign.id}`,
    ]);
    const csv = [
      ['Đợt khảo sát', 'Lớp', 'Ngày bắt đầu', 'Ngày kết thúc', 'Đường dẫn'],
      ...rows,
    ].map((row) => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${toVietnameseFileSlug(
      `danh sach duong dan khao sat ${activeTab} ${semesterFilter || activeSemester?.semesterName || ''} ${academicYearFilter || activeYear?.academicYearName || ''}`
    )}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Đã xuất danh sách khảo sát', {
      description: `${filteredCampaigns.length} đường dẫn theo bộ lọc hiện tại.`,
    });
  };

  // Filter Campaigns Data by Tab, Search, Semester & Academic Year
  const filteredCampaigns = React.useMemo(() => campaigns.filter((cmp) => {
      const matchesTab = cmp.type === activeTab;
      const matchesSearch =
        foldVietnamese(cmp.title).includes(search.toLowerCase()) ||
        (cmp.classCode && foldVietnamese(cmp.classCode).includes(search.toLowerCase())) ||
        (cmp.courseName && foldVietnamese(cmp.courseName).includes(search.toLowerCase())) ||
        (cmp.majorName && foldVietnamese(cmp.majorName).includes(search.toLowerCase()));

      const matchesSemester = semesterFilter ? cmp.semester === semesterFilter : true;
      const matchesAcademicYear = academicYearFilter ? cmp.academicYear === academicYearFilter : true;

      return matchesTab && matchesSearch && matchesSemester && matchesAcademicYear;
    }), [campaigns, activeTab, search, semesterFilter, academicYearFilter]);
  const campaignPagination = usePaginatedItems(filteredCampaigns, 20);

  // Group Campaigns by Academic Year -> Semester for Tree View
  const treeData = campaignPagination.visibleItems.reduce((acc, cmp) => {
    const year = cmp.academicYear || '2025-2026';
    const sem = cmp.semester || 'Học kỳ II';

    if (!acc[year]) acc[year] = {};
    if (!acc[year][sem]) acc[year][sem] = [];

    acc[year][sem].push(cmp);
    return acc;
  }, {} as Record<string, Record<string, SurveyCampaign[]>>);

  return (
    <div className="survey-operations-page campaigns-page">
      <div className="operations-tabs-bar">
        <div className="operations-tabs" role="tablist" aria-label="Loại khảo sát">
          <button
            className={`operations-tab ${activeTab === 'Học phần' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'Học phần'}
            onClick={() => setActiveTab('Học phần')}
          >
            <BookOpen className="operation-icon" aria-hidden="true" />
            Học phần
            <span className="operations-tab-count">
              {campaigns.filter((c) => c.type === 'Học phần').length}
            </span>
          </button>
          <button
            className={`operations-tab ${activeTab === 'Chương trình đào tạo' ? 'is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'Chương trình đào tạo'}
            onClick={() => setActiveTab('Chương trình đào tạo')}
          >
            <GraduationCap className="operation-icon" aria-hidden="true" />
            Chương trình đào tạo
            <span className="operations-tab-count">
              {campaigns.filter((c) => c.type === 'Chương trình đào tạo').length}
            </span>
          </button>
        </div>
        <div className="operations-tab-actions">
          <button className="btn btn-secondary" onClick={handleExportCampaigns}>
            <Download className="operation-icon" aria-hidden="true" />
            Xuất danh sách
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenWizard('Học kỳ II', '2025-2026')}>
            <Plus className="operation-icon" aria-hidden="true" />
            Tạo đợt khảo sát
          </button>
        </div>
      </div>

      <section className="operations-toolbar" aria-label="Bộ lọc chiến dịch">
        <span className="operations-filter-title">
          <Search className="operation-icon" aria-hidden="true" />
          Bộ lọc
        </span>
        <div className="operations-field operations-field--search">
          <label htmlFor="campaign-search">Tìm kiếm</label>
          <input
            id="campaign-search"
            type="search"
            placeholder="Tên bài, mã lớp, môn học hoặc giảng viên"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="operations-field">
          <label htmlFor="campaign-semester">Học kỳ</label>
          <select
            id="campaign-semester"
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
          >
            <option value="">Tất cả học kỳ</option>
            <option value="Học kỳ I">Học kỳ I</option>
            <option value="Học kỳ II">Học kỳ II</option>
            <option value="Học kỳ Hè">Học kỳ Hè</option>
          </select>
        </div>
        <div className="operations-field">
          <label htmlFor="campaign-year">Năm học</label>
          <select
            id="campaign-year"
            value={academicYearFilter}
            onChange={(e) => setAcademicYearFilter(e.target.value)}
          >
            <option value="">Tất cả năm học</option>
            <option value="2025-2026">Năm học 2025-2026</option>
            <option value="2026-2027">Năm học 2026-2027</option>
          </select>
        </div>

        {(semesterFilter || academicYearFilter || search) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearch('');
              setSemesterFilter('');
              setAcademicYearFilter('');
            }}
          >
            <X className="operation-icon" aria-hidden="true" />
            Xóa bộ lọc
          </button>
        )}
      </section>

      <section className="campaign-tree" aria-label="Cây đợt khảo sát">
        {Object.keys(treeData).length === 0 ? (
          <div className="operations-empty">
            <Info className="operation-icon" aria-hidden="true" />
            Không tìm thấy bài khảo sát phù hợp với bộ lọc.
          </div>
        ) : (
          Object.entries(treeData).map(([year, semesters]) => (
            <section className="campaign-year" key={year}>
              <header className="campaign-year-header">
                <div className="campaign-year-title">
                  <Folder className="operation-icon" aria-hidden="true" />
                  <span>Năm học <strong>{year}</strong></span>
                </div>
                <div className="campaign-year-actions">
                  <span className="operations-count">
                    {Object.values(semesters).reduce((sum, list) => sum + list.length, 0)} bài
                  </span>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenWizard(undefined, year)}
                    title={`Khởi tạo đợt khảo sát cho Năm học ${year}`}
                  >
                    <Plus className="operation-icon" aria-hidden="true" />
                    Tạo khảo sát
                  </button>
                </div>
              </header>

              <div className="campaign-semesters">
                {Object.entries(semesters).map(([semesterName, campaignList]) => {
                  const folderKey = `${year}_${semesterName}`;
                  const isExpanded = expandedFolders[folderKey] !== false;

                  return (
                    <section className="campaign-semester" key={folderKey}>
                      <header className="campaign-semester-header">
                        <button
                          type="button"
                          className="campaign-semester-toggle"
                          onClick={() => toggleFolder(folderKey)}
                          aria-expanded={isExpanded}
                          aria-controls={`campaign-folder-${folderKey}`}
                        >
                          {isExpanded ? (
                            <FolderOpen className="operation-icon" aria-hidden="true" />
                          ) : (
                            <Folder className="operation-icon" aria-hidden="true" />
                          )}
                          <span className="campaign-semester-title">
                            {semesterName} ({year})
                          </span>
                          <span className="operations-count">{campaignList.length}</span>
                          {isExpanded ? (
                            <ChevronUp className="operation-icon" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="operation-icon" aria-hidden="true" />
                          )}
                        </button>
                        <div className="campaign-semester-actions">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenWizard(semesterName, year);
                            }}
                            title={`Khởi tạo bài khảo sát cho ${semesterName} (${year})`}
                          >
                            <Plus className="operation-icon" aria-hidden="true" />
                            Thêm bài khảo sát
                          </button>
                        </div>
                      </header>

                      {isExpanded && (
                        <div className="campaign-semester-body" id={`campaign-folder-${folderKey}`}>
                          {activeWizardTarget &&
                            (activeWizardTarget.semester === semesterName || !activeWizardTarget.semester) &&
                            (activeWizardTarget.academicYear === year || !activeWizardTarget.academicYear) && (
                              <InlineTreeWizard
                                surveyType={activeTab}
                                initialSemester={activeWizardTarget.semester || semesterName}
                                initialAcademicYear={activeWizardTarget.academicYear || year}
                                majors={majors}
                                sections={sections}
                                courses={courses}
                                lecturers={lecturers}
                                criteria={criteria}
                                onCreateCampaigns={handleCreateMultipleFromWizard}
                                onCancel={() => setActiveWizardTarget(null)}
                              />
                            )}
                          <div className="campaign-table-scroll">
                            <table className="campaign-table">
                              <thead>
                                <tr>
                                  <th>Đợt khảo sát</th>
                                  <th>Liên kết</th>
                                  <th>Lịch và trạng thái</th>
                                  <th>Thao tác</th>
                                </tr>
                              </thead>
                              <tbody>
                                {campaignList.map((row) => {
                                  const today = new Date().toISOString().split('T')[0];
                                  const isActive = today >= row.startDate && today <= row.endDate;
                                  const surveyLink = row.surveyLink || `https://khaosat.vimaru.edu.vn/survey/${row.id}`;

                                  return (
                                    <tr key={row.id}>
                                      <td className="campaign-primary-cell">
                                        <div className="campaign-primary-value">
                                          <FileText className="operation-icon" aria-hidden="true" />
                                          <span>{row.title}</span>
                                        </div>
                                        <div className="campaign-secondary-value">
                                          <Building2 className="operation-icon" aria-hidden="true" />
                                          <span>
                                            Lớp: <strong>{row.classCode || 'Toàn khóa'}</strong>; GV: {row.lecturerName || 'Chưa phân công'}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="campaign-link-cell">
                                        <div className="campaign-link-row">
                                          <input
                                            className="campaign-link-input"
                                            aria-label={`Liên kết ${row.title}`}
                                            type="text"
                                            readOnly
                                            value={surveyLink}
                                          />
                                          <button
                                            className="btn btn-secondary operation-icon-button"
                                            onClick={() => void handleCopyLink(surveyLink)}
                                            title="Sao chép liên kết"
                                            aria-label={`Sao chép liên kết ${row.title}`}
                                          >
                                            <Copy className="operation-icon" aria-hidden="true" />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="campaign-schedule-cell">
                                        <div className="campaign-date">
                                          <CalendarDays className="operation-icon" aria-hidden="true" />
                                          <span>{row.startDate} đến {row.endDate}</span>
                                        </div>
                                        <div className="campaign-status-row">
                                          <span className={`operations-status ${isActive ? 'operations-status--success' : 'operations-status--warning'}`}>
                                            {isActive ? 'Đang mở' : 'Quá hạn'}
                                          </span>
                                          <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => {
                                              setEditingCampaign(row);
                                              setEditStartDate(row.startDate);
                                              setEditEndDate(row.endDate);
                                            }}
                                          >
                                            <Pencil className="operation-icon" aria-hidden="true" />
                                            Sửa lịch
                                          </button>
                                        </div>
                                      </td>
                                      <td>
                                        <div className="campaign-row-actions">
                                          <button className="btn btn-secondary btn-sm" onClick={() => onOpenQR(row)}>
                                            <QrCode className="operation-icon" aria-hidden="true" />
                                            Mã QR
                                          </button>
                                          <button
                                            className="btn btn-danger operation-icon-button"
                                            onClick={() => setDeletingCampaign(row)}
                                            title="Xóa đợt khảo sát"
                                            aria-label={`Xóa ${row.title}`}
                                          >
                                            <Trash2 className="operation-icon" aria-hidden="true" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </section>

      <TablePagination
        page={campaignPagination.page}
        pageSize={20}
        totalItems={filteredCampaigns.length}
        itemLabel="bài khảo sát"
        onPageChange={campaignPagination.setPage}
      />

      {/* Edit QR Scanning Validity Period Modal */}
      {editingCampaign && (
        <Modal
          isOpen={!!editingCampaign}
          onClose={() => setEditingCampaign(null)}
          title={`ĐỔI LỊCH QUÉT MÃ QR CODE - ${editingCampaign.title}`}
        >
          <form onSubmit={handleSaveDateEdit}>
            <div className="operations-info-band">
              <CalendarClock className="operation-icon" aria-hidden="true" />
              <span>Điều chỉnh khoảng thời gian hệ thống mở mã QR cho người tham gia.</span>
            </div>

            <div className="operations-form-grid">
              <div className="form-group">
                <label>Ngày bắt đầu cho phép quét QR</label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Ngày kết thúc cho phép quét QR</label>
                <input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="operations-form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingCampaign(null)}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                <CalendarClock className="operation-icon" aria-hidden="true" />
                Lưu Thay Đổi
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={deletingCampaign !== null}
        onClose={() => setDeletingCampaign(null)}
        onConfirm={() => {
          if (!deletingCampaign) return;
          onDeleteCampaign(deletingCampaign.id);
          toast.success('Đã xóa đợt khảo sát', {
            description: deletingCampaign.title,
          });
          setDeletingCampaign(null);
        }}
        title="Xóa đợt khảo sát"
        recordName={deletingCampaign?.title ?? ''}
      />
    </div>
  );
};
