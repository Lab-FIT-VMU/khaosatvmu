import React, { useState } from 'react';
import { BookOpen, GraduationCap, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable } from '../components/DataTable';
import type { Column } from '../components/DataTable';
import { ConfirmDialog, Modal } from '../components/Modal';
import type { Criterion } from '../types';
import '../styles/survey-operations.css';
import { foldVietnamese } from '../utils/vietnamese';

interface CriteriaPageProps {
  criteria: Criterion[];
  surveyType?: 'Học phần' | 'Chương trình đào tạo';
  onAddCriterion: (criterion: Criterion) => void;
  onDeleteCriterion: (id: string) => void;
}

export const CriteriaPage: React.FC<CriteriaPageProps> = ({
  criteria,
  surveyType,
  onAddCriterion,
  onDeleteCriterion,
}) => {
  const [activeTab, setActiveTab] = useState<'Học phần' | 'Chương trình đào tạo'>(
    surveyType || 'Học phần'
  );
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deletingCriterion, setDeletingCriterion] = useState<Criterion | null>(null);

  // Form states
  const [category, setCategory] = useState<'Học phần' | 'Chương trình đào tạo'>(activeTab);
  const [groupName, setGroupName] = useState('');
  const [code, setCode] = useState('');
  const [question, setQuestion] = useState('');
  const [weight, setWeight] = useState('1.0');

  // Keep category in form synced with activeTab when modal opens
  const handleOpenModal = () => {
    setValidationError(null);
    setCategory(activeTab);
    if (activeTab === 'Học phần') {
      setGroupName('Nội dung & Phương pháp giảng dạy');
    } else {
      setGroupName('Mục tiêu & Chuẩn đầu ra CTĐT (PLO)');
    }
    setIsModalOpen(true);
  };

  const filtered = criteria.filter((c) => {
    const matchesTab = c.category === activeTab;
    const matchesSearch =
      foldVietnamese(c.question).includes(search.toLowerCase()) ||
      foldVietnamese(c.groupName).includes(search.toLowerCase()) ||
      foldVietnamese(c.code).includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !question.trim()) {
      setValidationError('Vui lòng điền mã tiêu chí và nội dung câu hỏi khảo sát.');
      return;
    }
    const newCriterion: Criterion = {
      id: `cri-${Date.now()}`,
      category,
      groupName: groupName || (category === 'Học phần' ? 'Đánh giá môn học' : 'Chuẩn đầu ra CTĐT'),
      code,
      question,
      weight: parseFloat(weight) || 1.0,
      status: 'Kích hoạt',
    };
    onAddCriterion(newCriterion);
    toast.success('Đã thêm tiêu chí', { description: `${newCriterion.code} - ${newCriterion.groupName}` });
    setIsModalOpen(false);
    setCode('');
    setQuestion('');
  };

  const columns: Column<Criterion>[] = [
    {
      key: 'code',
      header: 'Mã Tiêu Chí',
      width: '110px',
      filterValue: (item) => item.code,
      render: (item) => <span className="operations-code">{item.code}</span>,
    },
    {
      key: 'groupName',
      header: 'Nhóm Tiêu Chí Đánh Giá',
      width: '240px',
      filterValue: (item) => item.groupName,
      render: (item) => <span className="operations-primary-text">{item.groupName}</span>,
    },
    {
      key: 'question',
      header: 'Nội Dung Câu Hỏi Khảo Sát (Mức độ đồng ý Likert 1-5)',
      render: (item) => <span className="operations-primary-text">{item.question}</span>,
    },
    {
      key: 'weight',
      header: 'Trọng Số',
      width: '90px',
      filterValue: (item) => String(item.weight),
      numeric: true,
      render: (item) => <span className="operations-primary-text">{item.weight}</span>,
    },
    {
      key: 'status',
      header: 'Trạng Thái',
      width: '110px',
      filterValue: (item) => item.status,
      render: (item) => (
        <span className={`operations-status ${item.status === 'Kích hoạt' ? 'operations-status--success' : 'operations-status--danger'}`}>
          {item.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao Tác',
      width: '90px',
      render: (item) => (
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={() => setDeletingCriterion(item)}
          aria-label={`Xóa tiêu chí ${item.code}`}
        >
          <Trash2 className="operation-icon" aria-hidden="true" />
          Xóa
        </button>
      ),
    },
  ];

  return (
    <div className="survey-operations-page operations-table-page criteria-page">
      <div className="operations-tabs-bar">
        <div className="operations-tabs" role="tablist" aria-label="Loại bộ tiêu chí">
        <button
          className={`operations-tab ${activeTab === 'Học phần' ? 'is-active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'Học phần'}
          onClick={() => setActiveTab('Học phần')}
        >
          <BookOpen className="operation-icon" aria-hidden="true" />
          Học phần
          <span className="operations-tab-count">
            {criteria.filter((c) => c.category === 'Học phần').length}
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
            {criteria.filter((c) => c.category === 'Chương trình đào tạo').length}
          </span>
        </button>
        </div>
        <div className="operations-tab-actions">
          <button className="btn btn-primary" onClick={handleOpenModal}>
            <Plus className="operation-icon" aria-hidden="true" />
            Thêm tiêu chí
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Tìm tiêu chí ${activeTab}...`}
        exportConfig={{
          title: `DANH SÁCH TIÊU CHÍ ĐÁNH GIÁ ${activeTab.toUpperCase()}`,
          fileName: activeTab === 'Học phần'
            ? 'danh-sach-tieu-chi-danh-gia-hoc-phan'
            : 'danh-sach-tieu-chi-danh-gia-chuong-trinh-dao-tao',
          breadcrumb: ['Tiêu chí CTĐT'],
        }}
        emptyMessage="Không tìm thấy tiêu chí phù hợp."
        keyExtractor={(item) => item.id}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setValidationError(null);
        }}
        title={`THÊM MỚI TIÊU CHÍ ĐÁNH GIÁ - ${activeTab.toUpperCase()}`}
      >
        <form onSubmit={handleSubmit}>
          {validationError && (
            <div className="operations-feedback operations-feedback--error" role="alert">
              {validationError}
            </div>
          )}
          <div className="form-group operations-form-grid">
            <div>
              <label>Phân loại tiêu chí</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as 'Học phần' | 'Chương trình đào tạo')}
                required
              >
                <option value="Học phần">Đánh giá Học phần (Môn học)</option>
                <option value="Chương trình đào tạo">Đánh giá Chương trình đào tạo</option>
              </select>
            </div>
            <div>
              <label>Mã tiêu chí</label>
              <input
                type="text"
                placeholder={category === 'Học phần' ? 'VD: HP06' : 'VD: CTDT05'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Nhóm đánh giá</label>
            <input
              type="text"
              placeholder={
                category === 'Học phần'
                  ? 'VD: Phương pháp giảng dạy & Học liệu'
                  : 'VD: Chuẩn đầu ra (PLO) & Cơ sở vật chất khoa'
              }
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Nội dung câu hỏi khảo sát (Likert 1-5)</label>
            <textarea
              rows={3}
              placeholder={
                category === 'Học phần'
                  ? 'VD: Giảng viên truyền đạt nội dung bài giảng rõ ràng, nhiệt tình...'
                  : 'VD: Chương trình đào tạo cung cấp đầy đủ kỹ năng nghề nghiệp thực tế...'
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Trọng số tiêu chí</label>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          <div className="operations-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              <Save className="operation-icon" aria-hidden="true" />
              Lưu tiêu chí
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deletingCriterion !== null}
        onClose={() => setDeletingCriterion(null)}
        onConfirm={() => {
          if (!deletingCriterion) return;
          onDeleteCriterion(deletingCriterion.id);
          toast.success('Đã xóa tiêu chí', { description: deletingCriterion.code });
          setDeletingCriterion(null);
        }}
        title="Xóa tiêu chí khảo sát"
        recordName={deletingCriterion ? `${deletingCriterion.code} - ${deletingCriterion.question}` : ''}
      />
    </div>
  );
};
