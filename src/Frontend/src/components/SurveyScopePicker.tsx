import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { catalogApi } from '../services/catalogApi';
import { surveyApi, type SurveyScopeType } from '../services/surveyApi';
import type { Course, CourseSection, Department, Faculty } from '../types';

const scopeChoices: { value: CourseScopeType; label: string }[] = [
  { value: 'all', label: 'Tất cả lớp học phần' },
  { value: 'faculty', label: 'Khoa / Viện' },
  { value: 'department', label: 'Bộ môn' },
  { value: 'section', label: 'Lớp học phần' },
];

/** Bộ chọn này chỉ phục vụ khảo sát học phần; CTĐT và giảng viên chọn phạm vi trong hộp thoại tạo đợt. */
type CourseScopeType = Extract<SurveyScopeType, 'all' | 'faculty' | 'department' | 'section'>;

const unitLabel: Record<CourseScopeType, string> = {
  all: '',
  faculty: 'Khoa / Viện cần phát phiếu',
  department: 'Bộ môn cần phát phiếu',
  section: 'Lớp học phần cần phát phiếu',
};

const unitPlaceholder: Record<CourseScopeType, string> = {
  all: '',
  faculty: 'Gõ tên khoa/viện để tìm',
  department: 'Gõ tên bộ môn để tìm',
  section: 'Gõ mã học phần, tên học phần hoặc tên lớp',
};

interface SurveyScopePickerProps {
  /** Học kỳ đang chọn. Null thì chưa nạp được danh mục nào. */
  semesterId: number | null;
  scopeType: CourseScopeType;
  onScopeTypeChange: (scopeType: CourseScopeType) => void;
  /** Chuỗi rỗng nghĩa là chưa chọn đơn vị nào. */
  scopeId: string;
  onScopeIdChange: (scopeId: string) => void;
  /**
   * Truyền vào khi đang bổ sung cho một đợt đã có, để ô xem trước nói được bao
   * nhiêu lớp trong phạm vi là lớp MỚI chứ không phải tổng số lớp của phạm vi.
   */
  semesterSurveyId?: number;
  /** Cho id các ô không đụng nhau khi hai hộp thoại cùng nằm trong DOM. */
  idPrefix: string;
  disabled?: boolean;
  /** Giới hạn lựa chọn vào các lớp backend đã lọc theo bộ môn của hồ sơ. */
  departmentScoped?: boolean;
}

/**
 * Chọn phạm vi lớp được phát phiếu: cả kỳ, một khoa/viện, một bộ môn, hoặc đúng
 * một lớp. Dùng chung cho hộp thoại tạo đợt và hộp thoại bổ sung vào đợt đã có,
 * để hai nơi không bao giờ hiểu "khoa X" theo hai kiểu.
 *
 * Số lớp xem trước LUÔN hỏi server. Quy một lớp về khoa/bộ môn là chuỗi fallback
 * qua học phần rồi tới giảng viên; đếm lại ở client là tự chuốc lấy hai con số
 * lệch nhau giữa lúc xem trước và lúc tạo thật.
 */
export const SurveyScopePicker: React.FC<SurveyScopePickerProps> = ({
  semesterId,
  scopeType,
  onScopeTypeChange,
  scopeId,
  onScopeIdChange,
  semesterSurveyId,
  idPrefix,
  disabled = false,
  departmentScoped = false,
}) => {
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [preview, setPreview] = useState<{ scope: number; fresh: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Khoa và bộ môn là danh mục nhỏ, nạp một lần. Lớp học phần thì theo học kỳ.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [nextFaculties, nextDepartments] = await Promise.all([
          catalogApi.faculties(),
          catalogApi.departments(),
        ]);
        if (cancelled) return;
        setFaculties(nextFaculties);
        setDepartments(nextDepartments);
      } catch {
        if (!cancelled) setCatalogError('Không tải được danh mục khoa/viện và bộ môn.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Nhãn của lớp cần mã và tên học phần, mà API lớp học phần chỉ trả courseId —
  // nên phải nạp kèm danh mục học phần rồi ghép ở đây.
  useEffect(() => {
    if (semesterId === null || scopeType !== 'section') return;
    let cancelled = false;
    const load = async () => {
      try {
        const [nextSections, nextCourses] = await Promise.all([
          catalogApi.courseSections(semesterId),
          catalogApi.courses(),
        ]);
        if (cancelled) return;
        setSections(nextSections);
        setCourses(nextCourses);
      } catch {
        if (!cancelled) setCatalogError('Không tải được danh sách lớp học phần.');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [semesterId, scopeType]);

  // Xem trước số lớp. Bỏ qua khi phạm vi cần đơn vị mà chưa chọn đơn vị nào.
  useEffect(() => {
    if (semesterId === null) {
      setPreview(null);
      return;
    }
    if (scopeType !== 'all' && !scopeId) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewing(true);
    const load = async () => {
      try {
        const result = await surveyApi.previewSectionScope({
          semesterId,
          scopeType,
          scopeId: scopeType === 'all' ? null : Number(scopeId),
          semesterSurveyId,
        });
        if (cancelled) return;
        setPreview({ scope: result.scopeSectionCount, fresh: result.newSectionCount });
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [semesterId, scopeType, scopeId, semesterSurveyId]);

  const facultyNameById = useMemo(
    () => new Map(faculties.map((faculty) => [faculty.facultyId, faculty.facultyName])),
    [faculties]
  );
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.courseId, course])),
    [courses]
  );

  const unitOptions = useMemo(() => {
    if (scopeType === 'faculty') {
      return faculties.map((faculty) => ({
        value: String(faculty.facultyId),
        label: faculty.facultyName,
      }));
    }
    if (scopeType === 'department') {
      // Kèm tên khoa vì nhiều bộ môn trùng tên giữa các khoa.
      return departments.map((department) => ({
        value: String(department.departmentId),
        label: department.facultyId
          ? `${department.departmentName} — ${facultyNameById.get(department.facultyId) ?? 'Chưa rõ khoa'}`
          : department.departmentName,
      }));
    }
    if (scopeType === 'section') {
      return sections.map((section) => {
        const course = courseById.get(section.courseId);
        const prefix = course ? `[${course.courseCode}] ${course.courseName}` : 'Học phần chưa rõ';
        return {
          value: String(section.courseSectionId),
          label: `${prefix} — ${section.sectionName}`,
        };
      });
    }
    return [];
  }, [scopeType, faculties, departments, sections, facultyNameById, courseById]);

  const previewText = () => {
    if (scopeType !== 'all' && !scopeId) return 'Chọn một đơn vị để xem số lớp.';
    if (previewing) return 'Đang đếm số lớp...';
    if (!preview) return null;
    if (preview.scope === 0) return 'Phạm vi này không có lớp học phần nào trong kỳ.';
    if (semesterSurveyId === undefined) {
      return `Sẽ tạo bài khảo sát cho ${preview.scope} lớp học phần.`;
    }
    if (preview.fresh === 0) {
      return `Cả ${preview.scope} lớp của phạm vi này đều đã có bài trong đợt.`;
    }
    return `Phạm vi có ${preview.scope} lớp, trong đó ${preview.fresh} lớp chưa có bài và sẽ được tạo thêm.`;
  };

  const message = previewText();
  const visibleScopeChoices = departmentScoped
    ? [
        { value: 'all' as const, label: 'Tất cả lớp trong bộ môn' },
        { value: 'section' as const, label: 'Lớp học phần' },
      ]
    : scopeChoices;

  return (
    <>
      <div className="form-group">
        <span className="form-label">Phạm vi phát phiếu</span>
        <div className="scope-choice-row" role="radiogroup" aria-label="Phạm vi phát phiếu">
          {visibleScopeChoices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={scopeType === choice.value}
              className={`scope-choice${scopeType === choice.value ? ' scope-choice--active' : ''}`}
              disabled={disabled}
              onClick={() => {
                onScopeTypeChange(choice.value);
                onScopeIdChange('');
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      {scopeType !== 'all' && (
        <div className="form-group">
          <label htmlFor={`${idPrefix}-scope-unit`}>{unitLabel[scopeType]}</label>
          <SearchableSelect
            id={`${idPrefix}-scope-unit`}
            value={scopeId}
            onChange={onScopeIdChange}
            required
            disabled={disabled}
            placeholder={unitPlaceholder[scopeType]}
            options={unitOptions}
          />
        </div>
      )}

      {catalogError && (
        <div className="catalog-validation-error" role="alert">{catalogError}</div>
      )}
      {message && <div className="scope-preview">{message}</div>}
    </>
  );
};
