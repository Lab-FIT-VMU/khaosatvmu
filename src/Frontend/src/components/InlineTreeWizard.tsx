import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CircleAlert,
  ClipboardList,
  FileSpreadsheet,
  GitBranch,
  GraduationCap,
  Info,
  Rocket,
  X,
} from 'lucide-react';
import type {
  SurveyCampaign,
  Course,
  CourseSection,
  Criterion,
  Lecturer,
  Major,
} from '../types';

interface InlineTreeWizardProps {
  surveyType: 'Học phần' | 'Chương trình đào tạo';
  initialSemester?: string;
  initialAcademicYear?: string;
  majors: Major[];
  sections: CourseSection[];
  courses: Course[];
  lecturers: Lecturer[];
  criteria: Criterion[];
  onCreateCampaigns: (newCampaigns: SurveyCampaign[]) => void;
  onCancel: () => void;
}

export const InlineTreeWizard: React.FC<InlineTreeWizardProps> = ({
  surveyType,
  initialSemester = 'Học kỳ II',
  initialAcademicYear = '2025-2026',
  majors,
  sections,
  courses,
  lecturers,
  criteria,
  onCreateCampaigns,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 States
  const [semester, setSemester] = useState(initialSemester);
  const [academicYear, setAcademicYear] = useState(initialAcademicYear);
  const [campaignTitle, setCampaignTitle] = useState(
    surveyType === 'Học phần'
      ? `Đợt Khảo sát Đánh giá Chất lượng Giảng dạy Học phần ${initialSemester} (${initialAcademicYear})`
      : `Đợt Khảo sát Đánh giá Chương trình Đào tạo Ngành ${initialAcademicYear}`
  );
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  // Step 2 States
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>(
    sections.map((section) => section.courseSectionId)
  );
  const [selectedMajorId, setSelectedMajorId] = useState<string>(
    majors[0] ? String(majors[0].majorId) : ''
  );
  const [isImported, setIsImported] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 3 States
  const [selectedCriterionTemplate, setSelectedCriterionTemplate] = useState<string>(
    surveyType === 'Học phần' ? 'Mẫu tiêu chuẩn KHP VMU 2026' : 'Mẫu chuẩn đầu ra PLO CTĐT 2026'
  );

  // Excel Import Simulation
  const handleSimulateExcelImport = () => {
    setIsImported(true);
    setValidationError(null);
  };

  const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedClassIds(sections.map((section) => section.courseSectionId));
    } else {
      setSelectedClassIds([]);
    }
    setValidationError(null);
  };

  const handleToggleClass = (id: number) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
    setValidationError(null);
  };

  const courseOf = (courseId: number) => courses.find((course) => course.courseId === courseId);
  const lecturerNamesOf = (section: CourseSection) =>
    lecturers.find((lecturer) => lecturer.lecturerId === section.lecturerId)?.fullName ?? '';

  // Generate campaigns and add directly to tree
  const handleCompleteWizard = () => {
    const timestamp = Date.now();
    const generated: SurveyCampaign[] = [];

    if (surveyType === 'Học phần') {
      const selectedSections = sections.filter((section) =>
        selectedClassIds.includes(section.courseSectionId)
      );

      selectedSections.forEach((section, idx) => {
        const course = courseOf(section.courseId);
        const courseName = course?.courseName ?? section.sectionName;
        const lecturerName = lecturerNamesOf(section) || 'Chưa phân công';
        const id = `cmp-wiz-${timestamp}-${idx}`;
        const surveyLink = `https://khaosat.vimaru.edu.vn/survey/${id}`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(surveyLink)}`;

        generated.push({
          id,
          title: `Khảo sát Đánh giá Lớp HP ${section.sectionName} - ${courseName}`,
          type: 'Học phần',
          semester,
          academicYear,
          courseId: String(section.courseId),
          courseCode: course?.courseCode,
          courseName,
          classId: String(section.courseSectionId),
          classCode: section.sectionName,
          lecturerName,
          startDate,
          endDate,
          status: 'Đang diễn ra',
          targetAudience: `Sinh viên Lớp HP ${section.sectionName} (${lecturerName}) - ${semester} ${academicYear}`,
          surveyLink,
          qrCodeUrl,
          totalTargetResponses: section.classSize,
          actualResponses: 0,
        });
      });
    } else {
      const selectedMajor =
        majors.find((m) => String(m.majorId) === selectedMajorId) || majors[0];
      const id = `cmp-wiz-prog-${timestamp}`;
      const surveyLink = `https://khaosat.vimaru.edu.vn/survey/${id}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(surveyLink)}`;

      generated.push({
        id,
        title: campaignTitle || `Khảo sát Đánh giá Chương trình Đào tạo Ngành ${selectedMajor?.majorName || ''}`,
        type: 'Chương trình đào tạo',
        semester,
        academicYear,
        majorId: selectedMajor ? String(selectedMajor.majorId) : undefined,
        majorName: selectedMajor?.majorName,
        startDate,
        endDate,
        status: 'Đang diễn ra',
        targetAudience: `Sinh viên khóa cuối & Cựu sinh viên Ngành ${selectedMajor?.majorName ?? ''}`,
        surveyLink,
        qrCodeUrl,
        totalTargetResponses: 150,
        actualResponses: 0,
      });
    }

    onCreateCampaigns(generated);
  };

  return (
    <section className="inline-tree-wizard" aria-label="Quy trình khởi tạo đợt khảo sát">
      <header className="wizard-header">
        <div className="wizard-header-title">
          <GitBranch className="operation-icon" aria-hidden="true" />
          <span>Khởi tạo đợt khảo sát</span>
          <span className="wizard-header-context">
            {semester} ({academicYear})
          </span>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
          title="Hủy khởi tạo trên cây"
        >
          <X className="operation-icon" aria-hidden="true" />
          Đóng
        </button>
      </header>

      <div className="wizard-steps-wrap">
        <ol className="wizard-steps">
          {[
            { num: 1, label: 'Thời gian và tên đợt' },
            { num: 2, label: surveyType === 'Học phần' ? 'Chọn lớp học phần' : 'Chọn ngành' },
            { num: 3, label: 'Chọn tiêu chí' },
            { num: 4, label: 'Xác nhận và tạo' },
          ].map((item) => (
            <li
              key={item.num}
              className={`wizard-step ${step === item.num ? 'is-active' : ''} ${step > item.num ? 'is-complete' : ''}`}
              aria-current={step === item.num ? 'step' : undefined}
            >
              <span className="wizard-step-number">
                {step > item.num ? <Check className="operation-icon" aria-hidden="true" /> : item.num}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </div>

      {step === 1 && (
        <div className="wizard-panel">
          <div className="wizard-notice">
            <Info className="operation-icon" aria-hidden="true" />
            <span>Thiết lập tên đợt, học kỳ và thời gian cho phép người tham gia quét mã QR.</span>
          </div>

          <div className="form-group">
            <label htmlFor="wizard-campaign-title">Tên đợt khảo sát</label>
            <input
              id="wizard-campaign-title"
              type="text"
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group wizard-form-grid">
            <div>
              <label htmlFor="wizard-semester">Học kỳ</label>
              <select
                id="wizard-semester"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              >
                <option value="Học kỳ I">Học kỳ I</option>
                <option value="Học kỳ II">Học kỳ II</option>
                <option value="Học kỳ Hè">Học kỳ Hè</option>
              </select>
            </div>
            <div>
              <label htmlFor="wizard-academic-year">Năm học</label>
              <select
                id="wizard-academic-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
              >
                <option value="2025-2026">2025-2026</option>
                <option value="2026-2027">2026-2027</option>
              </select>
            </div>
          </div>

          <div className="form-group wizard-form-grid">
            <div>
              <label htmlFor="wizard-start-date">Ngày bắt đầu quét QR</label>
              <input
                id="wizard-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="wizard-end-date">Ngày kết thúc quét QR</label>
              <input
                id="wizard-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="operations-actions wizard-actions">
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>
              Hủy
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setStep(2)}>
              Tiếp theo
              <ArrowRight className="operation-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-panel">
          {surveyType === 'Học phần' ? (
            <>
              <div className="wizard-notice">
                <FileSpreadsheet className="operation-icon" aria-hidden="true" />
                <span>Import danh sách lớp học phần của {semester} ({academicYear}) hoặc chọn trực tiếp bên dưới.</span>
              </div>

              <div className="wizard-import-row">
                <button className="btn btn-secondary btn-sm" onClick={handleSimulateExcelImport}>
                  <FileSpreadsheet className="operation-icon" aria-hidden="true" />
                  Import tệp Excel
                </button>
                {isImported && (
                  <span className="operations-status operations-status--success">
                    Đã kết nối dữ liệu đào tạo
                  </span>
                )}
              </div>

              <div className="wizard-table-scroll">
                <table className="wizard-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            sections.length > 0 && selectedClassIds.length === sections.length
                          }
                          onChange={handleToggleSelectAll}
                          aria-label="Chọn tất cả lớp học phần"
                        />
                      </th>
                      <th>Tên lớp</th>
                      <th>Tên học phần</th>
                      <th>Giảng viên</th>
                      <th>Sĩ số</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((section) => {
                      const isSelected = selectedClassIds.includes(section.courseSectionId);
                      const course = courseOf(section.courseId);
                      return (
                        <tr key={section.courseSectionId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleClass(section.courseSectionId)}
                              aria-label={`Chọn lớp ${section.sectionName}`}
                            />
                          </td>
                          <td><span className="operations-code">{section.sectionName}</span></td>
                          <td>{course?.courseName ?? '—'}</td>
                          <td>{lecturerNamesOf(section) || 'Chưa phân công'}</td>
                          <td style={{ textAlign: 'right' }}>{section.classSize}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="wizard-notice">
                <GraduationCap className="operation-icon" aria-hidden="true" />
                <span>Chọn ngành đào tạo để khởi tạo khảo sát chương trình đào tạo.</span>
              </div>

              <div className="form-group">
                <label htmlFor="wizard-major">Ngành học đánh giá</label>
                <select
                  id="wizard-major"
                  value={selectedMajorId}
                  onChange={(e) => setSelectedMajorId(e.target.value)}
                >
                  {majors.map((m) => (
                    <option key={m.majorId} value={String(m.majorId)}>
                      {m.majorName} (MajorId {m.majorId})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="operations-actions wizard-actions">
            {validationError && (
              <div className="operations-feedback operations-feedback--error wizard-validation" role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{validationError}</span>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
              <ArrowLeft className="operation-icon" aria-hidden="true" />
              Quay lại
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                if (surveyType === 'Học phần' && selectedClassIds.length === 0) {
                  setValidationError('Vui lòng chọn ít nhất một lớp học phần.');
                  return;
                }
                setStep(3);
              }}
            >
              Tiếp theo
              <ArrowRight className="operation-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-panel">
          <div className="wizard-notice">
            <ClipboardList className="operation-icon" aria-hidden="true" />
            <span>Chọn bộ tiêu chí đánh giá được áp dụng cho đợt khảo sát này.</span>
          </div>

          <div className="form-group">
            <label htmlFor="wizard-criteria-template">Mẫu phiếu khảo sát</label>
            <select
              id="wizard-criteria-template"
              value={selectedCriterionTemplate}
              onChange={(e) => setSelectedCriterionTemplate(e.target.value)}
            >
              <option value="Mẫu tiêu chuẩn KHP VMU 2026">
                Mẫu Tiêu Chuẩn Đánh Giá Học Phần Likert 1-5 (Nội dung, Giảng viên, CSVC)
              </option>
              <option value="Mẫu chuẩn đầu ra PLO CTĐT 2026">
                Mẫu Đánh Giá Chuẩn Đầu Ra (PLO) & Chương Trình Đào Tạo Ngành
              </option>
            </select>
          </div>

          <div className="wizard-criteria-preview">
            <h4>{criteria.length} tiêu chí sẽ được dùng trong phiếu khảo sát</h4>
            <ul>
              {criteria.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <strong>[{c.code}]</strong> {c.question}
                </li>
              ))}
            </ul>
          </div>

          <div className="operations-actions wizard-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
              <ArrowLeft className="operation-icon" aria-hidden="true" />
              Quay lại
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setStep(4)}>
              Tiếp theo
              <ArrowRight className="operation-icon" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="wizard-panel">
          <div className="wizard-notice">
            <BarChart3 className="operation-icon" aria-hidden="true" />
            <span>Kiểm tra thông tin trước khi tạo các đợt khảo sát trong thư mục đã chọn.</span>
          </div>

          <dl className="wizard-summary">
            <div><dt>Tên đợt</dt><dd>{campaignTitle}</dd></div>
            <div><dt>Học kỳ và năm</dt><dd>{semester} ({academicYear})</dd></div>
            <div><dt>Lịch quét QR</dt><dd>{startDate} đến {endDate}</dd></div>
            <div><dt>Bộ tiêu chí</dt><dd>{selectedCriterionTemplate}</dd></div>
            <div><dt>Số lớp hoặc nhóm</dt><dd>{selectedClassIds.length} đợt khảo sát</dd></div>
            <div><dt>Vị trí</dt><dd>Thư mục {semester} ({academicYear})</dd></div>
          </dl>

          <div className="operations-actions wizard-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(3)}>
              <ArrowLeft className="operation-icon" aria-hidden="true" />
              Quay lại
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleCompleteWizard}>
              <Rocket className="operation-icon" aria-hidden="true" />
              Khởi tạo đợt khảo sát
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
