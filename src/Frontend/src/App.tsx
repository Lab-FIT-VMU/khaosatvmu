import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from './auth/authContext';
import { canAccessModule } from './auth/modulePermissions';
import { canAccessDashboard, isReadOnlyRole, isUnrestrictedRole } from './auth/roles';
import { AuthLoading } from './components/AuthLoading';
import { getHashRoot } from './pages/reportRoute';

// Shared Components
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ScoringChangeNotifier } from './components/ScoringChangeNotifier';

/**
 * Các trang thống kê, báo cáo đọc điểm theo cấu hình tính điểm. Đang mở một trong
 * các trang này thì nhận thông báo khi người khác đổi cấu hình hoặc cập nhật điểm.
 */
const scoringNotificationTabs = new Set([
  'overview',
  'survey-dashboard',
  'progress',
  'survey-statistics',
  'reports',
  'survey-analysis',
  'survey-section-scores',
]);
import { QRCodeModal } from './components/QRCodeModal';

// Lazy-loaded Pages (Code Splitting for Production Performance)
const DashboardOverview = lazy(() => import('./pages/DashboardOverview').then(m => ({ default: m.DashboardOverview })));
const DepartmentDashboardPage = lazy(() => import('./pages/DepartmentDashboardPage').then(m => ({ default: m.DepartmentDashboardPage })));
const LecturerDashboardPage = lazy(() => import('./pages/LecturerDashboardPage').then(m => ({ default: m.LecturerDashboardPage })));
const FacultiesPage = lazy(() => import('./pages/FacultiesPage').then(m => ({ default: m.FacultiesPage })));
const DepartmentsPage = lazy(() => import('./pages/DepartmentsPage').then(m => ({ default: m.DepartmentsPage })));
const LecturersPage = lazy(() => import('./pages/LecturersPage').then(m => ({ default: m.LecturersPage })));
const MajorsPage = lazy(() => import('./pages/MajorsPage').then(m => ({ default: m.MajorsPage })));
const CoursesPage = lazy(() => import('./pages/CoursesPage').then(m => ({ default: m.CoursesPage })));
const ClassesPage = lazy(() => import('./pages/ClassesPage').then(m => ({ default: m.ClassesPage })));
const CriteriaPage = lazy(() => import('./pages/CriteriaPage').then(m => ({ default: m.CriteriaPage })));
const SurveyTemplatesPage = lazy(() => import('./pages/SurveyTemplatesPage').then(m => ({ default: m.SurveyTemplatesPage })));
const CourseSurveysPage = lazy(() => import('./pages/CourseSurveysPage').then(m => ({ default: m.CourseSurveysPage })));
const PublicSurveyPage = lazy(() => import('./pages/PublicSurveyPage').then(m => ({ default: m.PublicSurveyPage })));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage').then(m => ({ default: m.CampaignsPage })));
const SurveyProgressPage = lazy(() => import('./pages/SurveyProgressPage').then(m => ({ default: m.SurveyProgressPage })));
const ReportsOverviewPage = lazy(() => import('./pages/ReportsOverviewPage').then(m => ({ default: m.ReportsOverviewPage })));
const SurveyStatisticsPage = lazy(() => import('./pages/SurveyStatisticsPage').then(m => ({ default: m.SurveyStatisticsPage })));
const SurveyAnalysisPage = lazy(() => import('./pages/SurveyAnalysisPage').then(m => ({ default: m.SurveyAnalysisPage })));
const SurveyDashboardPage = lazy(() => import('./pages/SurveyDashboardPage').then(m => ({ default: m.SurveyDashboardPage })));
const SurveySectionScoresPage = lazy(() => import('./pages/SurveySectionScoresPage').then(m => ({ default: m.SurveySectionScoresPage })));
const GraduationAnalyticsPage = lazy(() => import('./pages/GraduationAnalyticsPage').then(m => ({ default: m.GraduationAnalyticsPage })));
const StudentSurveyView = lazy(() => import('./pages/StudentSurveyView').then(m => ({ default: m.StudentSurveyView })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ProfileSelectionPage = lazy(() => import('./pages/ProfileSelectionPage').then(m => ({ default: m.ProfileSelectionPage })));
const UsersAdminPage = lazy(() => import('./pages/UsersAdminPage').then(m => ({ default: m.UsersAdminPage })));

// Services & Types
import { useSemester } from './context/semesterContext';
import { ApiError } from './services/apiClient';
import {
  catalogApi,
  type SaveCoursePayload,
  type SaveLecturerPayload,
} from './services/catalogApi';
import type { ImportFacultyRow } from './utils/facultyImportExcel';
import type { ImportDepartmentRow } from './utils/departmentImportExcel';
import type { ImportMajorRow } from './utils/majorImportExcel';
import type { ImportCourseRow } from './utils/courseImportExcel';
import type { ImportLecturerRow } from './utils/lecturerImportExcel';
import { surveyApi, surveyErrorMessage } from './services/surveyApi';
import type {
  Faculty,
  Department,
  Lecturer,
  Major,
  Course,
  CourseSection,
  CourseSectionSurvey,
  Curriculum,
  CurriculumCourse,
  Criterion,
  SemesterSurvey,
  SurveyCampaign,
  SystemStats,
} from './types';

/** Link cũ mở thẳng trang chi tiết của module Thống kê chi tiết. */
const legacyScopeHashPattern = /^#\/?survey-analysis\/(faculty|department|course)\/(\d+)/;

/**
 * Trang chi tiết theo phạm vi đã chuyển sang module Thống kê & Báo cáo. Link cũ
 * được đổi trước khi chọn tab, không thì thanh điều hướng tô sáng mục Thống kê
 * chi tiết rồi mới nhảy sang mục đúng.
 */
function redirectLegacyScopeHash() {
  const match = legacyScopeHashPattern.exec(window.location.hash);
  if (!match) return;
  const [, scopeType, scopeId] = match;
  // Bỏ `tab` của trang cũ: cấp chi tiết suy ra từ chính đường dẫn, không từ tab.
  const query = new URLSearchParams(window.location.hash.slice(match[0].length).replace(/^\?/, ''));
  query.delete('tab');
  const queryString = query.toString();
  window.history.replaceState(
    null,
    '',
    `#/reports/scope/${scopeType}/${scopeId}${queryString ? `?${queryString}` : ''}`,
  );
}

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'overview';
  redirectLegacyScopeHash();
  return getHashRoot();
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center p-12 text-slate-400">
      <div className="flex items-center gap-3">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        <span>Đang nạp dữ liệu...</span>
      </div>
    </div>
  );
}

const EMPTY_PERMISSIONS: readonly string[] = [];

function DashboardApp() {
  const auth = useAuth();
  const { activeSemesterId } = useSemester();
  const [currentTab, setCurrentTabState] = useState<string>(getInitialTab);
  const [isStudentView, setIsStudentView] = useState<boolean>(false);
  const permissions = auth.access?.permissions ?? EMPTY_PERMISSIONS;
  const canLoadFaculties = [
    'faculties', 'departments', 'lecturers', 'majors', 'courses', 'classes',
  ].some((moduleId) => canAccessModule(permissions, moduleId));
  const canLoadDepartments = ['faculties', 'departments', 'lecturers', 'courses', 'classes']
    .some((moduleId) => canAccessModule(permissions, moduleId));
  const canLoadMajors = ['faculties', 'majors']
    .some((moduleId) => canAccessModule(permissions, moduleId));
  const canLoadCourses = ['departments', 'courses', 'classes']
    .some((moduleId) => canAccessModule(permissions, moduleId));
  const canLoadLecturers = ['departments', 'lecturers', 'classes']
    .some((moduleId) => canAccessModule(permissions, moduleId));
  const canLoadCourseSections = canAccessModule(permissions, 'classes');
  const canLoadSurveyOperations = [
    'progress', 'reports', 'survey-dashboard', 'survey-statistics', 'survey-analysis',
    'course-campaigns',
  ].some((moduleId) => canAccessModule(permissions, moduleId));

  const setCurrentTab = useCallback((tab: string) => {
    setCurrentTabState(tab);
    window.location.hash = tab;
  }, []);

  const handleOpenSurveyReport = useCallback(
    (courseSectionSurveyId: number) => {
      setCurrentTabState('reports');
      window.location.hash = `/reports/surveys/${courseSectionSurveyId}`;
    },
    [],
  );

  useEffect(() => {
    const handleHashChange = () => {
      redirectLegacyScopeHash();
      const tab = getHashRoot();
      if (tab !== currentTab) {
        setCurrentTabState(tab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentTab]);

  // Bảng điều khiển tạm đóng với giảng viên và trưởng bộ môn, nên hai vai trò đó
  // phải đáp xuống trang khác — cả khi mới vào lẫn khi gõ thẳng địa chỉ cũ.
  const dashboardAllowed = canAccessDashboard(auth.activeProfile?.roleCode);
  const landingTab = dashboardAllowed
    ? 'overview'
    : ['progress', 'course-campaigns', 'survey-statistics', 'reports', 'classes', 'users-admin']
        .find((moduleId) => canAccessModule(permissions, moduleId)) ?? 'progress';

  // Thống kê theo mục tạm thời chỉ dành cho quản trị.
  const sectionScoresAllowed = isUnrestrictedRole(auth.activeProfile?.roleCode);

  useEffect(() => {
    const blocked =
      !canAccessModule(permissions, currentTab)
      || (currentTab === 'overview' && !dashboardAllowed)
      || (currentTab === 'survey-section-scores' && !sectionScoresAllowed);
    if (blocked) {
      setCurrentTab(landingTab);
    }
  }, [currentTab, permissions, setCurrentTab, dashboardAllowed, sectionScoresAllowed, landingTab]);

  // Nạp danh mục đã lưu trong database khi vào hệ thống.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [
          nextFaculties,
          nextDepartments,
          nextMajors,
          nextCourses,
          nextLecturers,
          nextSections,
        ] = await Promise.all([
          canLoadFaculties ? catalogApi.faculties() : Promise.resolve([]),
          canLoadDepartments ? catalogApi.departments() : Promise.resolve([]),
          canLoadMajors ? catalogApi.majors() : Promise.resolve([]),
          canLoadCourses ? catalogApi.courses() : Promise.resolve([]),
          canLoadLecturers ? catalogApi.lecturers() : Promise.resolve([]),
          canLoadCourseSections ? catalogApi.courseSections() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setFaculties(nextFaculties);
        setDepartments(nextDepartments);
        setMajors(nextMajors);
        setCourses(nextCourses);
        setLecturers(nextLecturers);
        setSections(nextSections);
      } catch {
        if (!cancelled) {
          toast.error('Không tải được danh mục từ máy chủ');
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    canLoadCourseSections,
    canLoadCourses,
    canLoadDepartments,
    canLoadFaculties,
    canLoadLecturers,
    canLoadMajors,
  ]);

  // Danh mục đào tạo. Mọi danh mục bắt đầu rỗng, dữ liệu chỉ nằm trong phiên
  // làm việc cho tới khi backend có API cho các bảng này.
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<CourseSection[]>([]);
  // Hai bảng khung chương trình, cần để đếm số nhóm lớp của một ngành học.
  // Chưa có màn hình quản lý nên hiện luôn rỗng.
  const [curricula] = useState<Curriculum[]>([]);
  const [curriculumCourses] = useState<CurriculumCourse[]>([]);
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [campaigns, setCampaigns] = useState<SurveyCampaign[]>([]);
  const [surveyCounters, setSurveyCounters] = useState({ qrScanCount: 0 });

  // Số phiếu đã thu nằm ở "CourseSectionSurveys". Nạp một lần tại đây để bảng
  // điều khiển và trang tiến độ thu phiếu luôn đọc cùng một con số.
  const [semesterSurveys, setSemesterSurveys] = useState<SemesterSurvey[]>([]);
  const [sectionSurveys, setSectionSurveys] = useState<CourseSectionSurvey[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(true);
  const [surveyLoadError, setSurveyLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!canLoadSurveyOperations || !activeSemesterId) {
      setSemesterSurveys([]);
      setSectionSurveys([]);
      setSurveyLoadError(null);
      setSurveyLoading(false);
      return;
    }

    let cancelled = false;
    setSurveyLoading(true);

    const load = async () => {
      try {
        const [surveys, allSections] = await Promise.all([
          surveyApi.semesterSurveys(activeSemesterId),
          surveyApi.allCourseSectionSurveys({ semesterId: activeSemesterId }),
        ]);
        if (cancelled) return;
        setSemesterSurveys(surveys);
        setSectionSurveys(allSections);
        setSurveyLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setSurveyLoadError(
          surveyErrorMessage(error instanceof ApiError ? error.errorCode : null)
        );
      } finally {
        if (!cancelled) setSurveyLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [canLoadSurveyOperations, activeSemesterId]);

  const stats: SystemStats = useMemo(
    () => ({
      totalFaculties: faculties.length,
      totalMajors: majors.length,
      totalCourses: courses.length,
      totalClasses: sections.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.status === 'Đang diễn ra').length,
      // Chỉ phiếu hợp lệ, giống mọi chỗ khác đo tiến độ.
      totalResponses: sectionSurveys.reduce((total, item) => total + item.validResponseCount, 0),
      totalTargetResponses: sectionSurveys.reduce((total, item) => total + item.classSize, 0),
      overallSatisfaction: 0,
      qrScanCount: surveyCounters.qrScanCount,
    }),
    [faculties, majors, courses, sections, campaigns, sectionSurveys, surveyCounters]
  );

  // QR Modal state
  const [qrModalData, setQrModalData] = useState<{
    isOpen: boolean;
    title: string;
    subtitle: string;
    qrUrl: string;
    surveyLink: string;
  }>({
    isOpen: false,
    title: '',
    subtitle: '',
    qrUrl: '',
    surveyLink: '',
  });

  // ---------------------------------------------------------------------------
  // Danh mục khoa viện / bộ môn / ngành học đi qua API /api/catalog và được lưu
  // trong PostgreSQL. Sau mỗi thao tác ghi, danh sách được nạp lại từ server để
  // id do database sinh ra luôn khớp với những gì đang hiển thị.
  // ---------------------------------------------------------------------------
  const errorCodeOf = (error: unknown): string =>
    error instanceof ApiError ? error.errorCode : 'API_REQUEST_FAILED';

  const handleSaveFaculty = async (
    facultyId: number | null,
    facultyName: string
  ): Promise<string | null> => {
    try {
      if (facultyId === null) {
        await catalogApi.createFaculty(facultyName);
      } else {
        await catalogApi.updateFaculty(facultyId, facultyName);
      }
      setFaculties(await catalogApi.faculties());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleImportFaculties = async (rows: ImportFacultyRow[]) => {
    const result = await catalogApi.importFaculties(rows);
    setFaculties(await catalogApi.faculties());
    return result;
  };

  const handleDeleteFaculty = async (facultyId: number): Promise<string | null> => {
    try {
      await catalogApi.deleteFaculty(facultyId);
      // Departments.FacultyId là ON DELETE SET NULL, Majors là CASCADE.
      const [nextFaculties, nextDepartments, nextMajors] = await Promise.all([
        catalogApi.faculties(),
        catalogApi.departments(),
        catalogApi.majors(),
      ]);
      setFaculties(nextFaculties);
      setDepartments(nextDepartments);
      setMajors(nextMajors);
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleSaveDepartment = async (
    editingDepartmentId: number | null,
    departmentId: number,
    departmentName: string,
    facultyId: number | null
  ): Promise<string | null> => {
    try {
      if (editingDepartmentId === null) {
        await catalogApi.createDepartment(departmentId, departmentName, facultyId);
      } else {
        await catalogApi.updateDepartment(editingDepartmentId, departmentName, facultyId);
      }
      setDepartments(await catalogApi.departments());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleImportDepartments = async (rows: ImportDepartmentRow[]) => {
    const result = await catalogApi.importDepartments(rows);
    setDepartments(await catalogApi.departments());
    return result;
  };

  const handleDeleteDepartment = async (departmentId: number): Promise<string | null> => {
    try {
      await catalogApi.deleteDepartment(departmentId);
      setDepartments(await catalogApi.departments());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleSaveLecturer = async (
    lecturerId: number | null,
    lecturer: SaveLecturerPayload
  ): Promise<string | null> => {
    try {
      if (lecturerId === null) {
        await catalogApi.createLecturer(lecturer);
      } else {
        await catalogApi.updateLecturer(lecturerId, lecturer);
      }
      setLecturers(await catalogApi.lecturers());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleImportLecturers = async (rows: ImportLecturerRow[]) => {
    const result = await catalogApi.importLecturers(rows);
    setLecturers(await catalogApi.lecturers());
    return result;
  };

  const handleDeleteLecturer = async (lecturerId: number): Promise<string | null> => {
    try {
      await catalogApi.deleteLecturer(lecturerId);
      setLecturers(await catalogApi.lecturers());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleSaveMajor = async (
    majorId: number | null,
    majorName: string,
    facultyId: number
  ): Promise<string | null> => {
    try {
      if (majorId === null) {
        await catalogApi.createMajor(majorName, facultyId);
      } else {
        await catalogApi.updateMajor(majorId, majorName, facultyId);
      }
      setMajors(await catalogApi.majors());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleImportMajors = async (rows: ImportMajorRow[]) => {
    const result = await catalogApi.importMajors(rows);
    setMajors(await catalogApi.majors());
    return result;
  };

  const handleDeleteMajor = async (majorId: number): Promise<string | null> => {
    try {
      await catalogApi.deleteMajor(majorId);
      setMajors(await catalogApi.majors());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleSaveCourse = async (
    courseId: number | null,
    course: SaveCoursePayload
  ): Promise<string | null> => {
    try {
      if (courseId === null) {
        await catalogApi.createCourse(course);
      } else {
        await catalogApi.updateCourse(courseId, course);
      }
      setCourses(await catalogApi.courses());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleImportCourses = async (rows: ImportCourseRow[]) => {
    const result = await catalogApi.importCourses(rows);
    setCourses(await catalogApi.courses());
    return result;
  };

  /**
   * Import lớp học phần có thể tạo thêm học phần và giảng viên, nên phải nạp lại
   * hai danh mục này. Không nạp thì bảng Học phần vẫn cũ và cột Giảng viên của
   * lớp mới tra không ra tên.
   */
  const reloadCoursesAndLecturers = async () => {
    const [nextCourses, nextLecturers] = await Promise.all([
      catalogApi.courses(),
      catalogApi.lecturers(),
    ]);
    setCourses(nextCourses);
    setLecturers(nextLecturers);
  };

  const handleDeleteCourse = async (courseId: number): Promise<string | null> => {
    try {
      await catalogApi.deleteCourse(courseId);
      setCourses(await catalogApi.courses());
      return null;
    } catch (error) {
      return errorCodeOf(error);
    }
  };

  const handleAddCriterion = (criterion: Omit<Criterion, 'id'>) => {
    const newCriterion: Criterion = {
      ...criterion,
      id: `crit_${Date.now()}`,
    };
    setCriteria([...criteria, newCriterion]);
  };

  const handleDeleteCriterion = (id: string) => {
    setCriteria(criteria.filter((c) => c.id !== id));
  };

  const handleAddCampaign = (campaign: Omit<SurveyCampaign, 'id'>) => {
    const newId = `camp_${Date.now()}`;
    const newCampaign: SurveyCampaign = {
      ...campaign,
      id: newId,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://khaosat.vimaru.edu.vn/survey/${newId}`,
      surveyLink: `https://khaosat.vimaru.edu.vn/survey/${newId}`,
    };
    setCampaigns([newCampaign, ...campaigns]);
  };

  const handleAddMultipleCampaigns = (campaignsToAdd: Omit<SurveyCampaign, 'id'>[]) => {
    const newCampaigns: SurveyCampaign[] = campaignsToAdd.map((c, index) => {
      const newId = `camp_${Date.now()}_${index}`;
      return {
        ...c,
        id: newId,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://khaosat.vimaru.edu.vn/survey/${newId}`,
        surveyLink: `https://khaosat.vimaru.edu.vn/survey/${newId}`,
      };
    });
    setCampaigns([...newCampaigns, ...campaigns]);
  };

  const handleDeleteCampaign = (id: string) => {
    setCampaigns(campaigns.filter((c) => c.id !== id));
  };

  const handleUpdateCampaignDates = (id: string, startDate: string, endDate: string) => {
    setCampaigns(
      campaigns.map((c) => (c.id === id ? { ...c, startDate, endDate } : c))
    );
  };

  const handleOpenCampaignQR = (campaign: SurveyCampaign) => {
    setQrModalData({
      isOpen: true,
      title: campaign.title,
      subtitle: `${campaign.courseName || campaign.majorName || ''} • ${campaign.lecturerName || ''}`,
      qrUrl: campaign.qrCodeUrl || '',
      surveyLink: campaign.surveyLink || '',
    });
    setSurveyCounters((prev) => ({ ...prev, qrScanCount: prev.qrScanCount + 1 }));
  };

  if (isStudentView) {
    return (
      <div className="student-preview-wrapper">
        <Suspense fallback={<PageFallback />}>
          <StudentSurveyView
            criteria={criteria}
            onCloseStudentView={() => setIsStudentView(false)}
            onSurveySubmitted={() => setIsStudentView(false)}
          />
        </Suspense>
      </div>
    );
  }

  // Render Main Dashboard Layout
  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        activeCampaignsCount={stats.activeCampaigns}
        permissions={permissions}
      />

      <ScoringChangeNotifier active={scoringNotificationTabs.has(currentTab)} />

      {/* Main Content Area */}
      <div className="main-wrapper">
        <Header
          currentTab={currentTab}
          user={auth.user!}
          activeProfile={auth.activeProfile!}
          availableProfiles={auth.availableProfiles}
          onSwitchProfile={auth.switchProfile}
          onLogout={auth.logout}
        />

        <main className="content-area">
          <Suspense fallback={<PageFallback />}>
            {canAccessModule(permissions, currentTab) && <>
            {/* Tab `overview` vốn không đòi quyền và đã là tab mặc định, nên mọi vai
                trò tự đáp xuống đúng đây. Chỉ cần chọn component theo vai trò: bookmark
                cũ vẫn chạy, đường dẫn không đổi. Nhánh giảng viên phải đứng TRƯỚC nhánh
                mặc định, không thì lại rơi vào trang của trưởng bộ môn.
                Xem congviec2.md mục F1 và congviec3.md mục I1. */}
            {currentTab === 'overview' && (
              isUnrestrictedRole(auth.activeProfile?.roleCode) ? (
                <DashboardOverview
                  semesterSurveys={semesterSurveys}
                  sectionSurveys={sectionSurveys}
                  surveyLoading={surveyLoading}
                  surveyLoadError={surveyLoadError}
                  permissions={permissions}
                  onNavigateTab={(tab) => setCurrentTab(tab)}
                />
              ) : isReadOnlyRole(auth.activeProfile?.roleCode) ? (
                <LecturerDashboardPage onNavigateTab={(tab) => setCurrentTab(tab)} />
              ) : (
                <DepartmentDashboardPage onNavigateTab={(tab) => setCurrentTab(tab)} />
              )
            )}

            {currentTab === 'survey-dashboard' && (
              <SurveyDashboardPage />
            )}

            {currentTab === 'progress' && (
              <SurveyProgressPage
                semesterSurveys={semesterSurveys}
                sectionSurveys={sectionSurveys}
                isLoading={surveyLoading}
                loadError={surveyLoadError}
              />
            )}

            {currentTab === 'reports' && (
              <ReportsOverviewPage />
            )}

            {currentTab === 'survey-statistics' && (
              <SurveyStatisticsPage />
            )}

            {currentTab === 'survey-analysis' && (
              <SurveyAnalysisPage />
            )}

            {currentTab === 'survey-section-scores' && sectionScoresAllowed && (
              <SurveySectionScoresPage />
            )}

            {currentTab === 'graduation-analytics' && (
              <GraduationAnalyticsPage />
            )}

            {currentTab === 'faculties' && (
              <FacultiesPage
                faculties={faculties}
                departments={departments}
                onSaveFaculty={handleSaveFaculty}
                onDeleteFaculty={handleDeleteFaculty}
                onImportFaculties={handleImportFaculties}
              />
            )}

            {currentTab === 'departments' && (
              <DepartmentsPage
                departments={departments}
                faculties={faculties}
                courses={courses}
                lecturers={lecturers}
                onSaveDepartment={handleSaveDepartment}
                onDeleteDepartment={handleDeleteDepartment}
                onImportDepartments={handleImportDepartments}
              />
            )}

            {currentTab === 'lecturers' && (
              <LecturersPage
                lecturers={lecturers}
                faculties={faculties}
                departments={departments}
                onSaveLecturer={handleSaveLecturer}
                onDeleteLecturer={handleDeleteLecturer}
                onImportLecturers={handleImportLecturers}
              />
            )}

            {currentTab === 'majors' && (
              <MajorsPage
                majors={majors}
                faculties={faculties}
                curricula={curricula}
                curriculumCourses={curriculumCourses}
                sections={sections}
                onSaveMajor={handleSaveMajor}
                onDeleteMajor={handleDeleteMajor}
                onImportMajors={handleImportMajors}
              />
            )}

            {currentTab === 'courses' && (
              <CoursesPage
                courses={courses}
                faculties={faculties}
                departments={departments}
                onSaveCourse={handleSaveCourse}
                onDeleteCourse={handleDeleteCourse}
                onImportCourses={handleImportCourses}
              />
            )}

            {currentTab === 'classes' && (
              <ClassesPage
                courses={courses}
                lecturers={lecturers}
                departments={departments}
                faculties={faculties}
                onCatalogChanged={reloadCoursesAndLecturers}
              />
            )}

            {(currentTab === 'course-question-sets' || currentTab === 'criteria') && (
              <SurveyTemplatesPage />
            )}

            {currentTab === 'program-criteria' && (
              <CriteriaPage
                criteria={criteria}
                surveyType="Chương trình đào tạo"
                onAddCriterion={handleAddCriterion}
                onDeleteCriterion={handleDeleteCriterion}
              />
            )}

            {(currentTab === 'course-campaigns' || currentTab === 'campaigns') && (
              <CourseSurveysPage
                onOpenSurveyReport={handleOpenSurveyReport}
                onOpenClasses={
                  canLoadCourseSections ? () => setCurrentTab('classes') : undefined
                }
              />
            )}

            {currentTab === 'program-campaigns' && (
              <CampaignsPage
                campaigns={campaigns}
                majors={majors}
                sections={sections}
                courses={courses}
                lecturers={lecturers}
                criteria={criteria}
                surveyType="Chương trình đào tạo"
                onAddCampaign={handleAddCampaign}
                onAddMultipleCampaigns={handleAddMultipleCampaigns}
                onDeleteCampaign={handleDeleteCampaign}
                onUpdateCampaignDates={handleUpdateCampaignDates}
                onOpenQR={handleOpenCampaignQR}
              />
            )}

            {currentTab === 'users-admin' && <UsersAdminPage />}
            </>}
          </Suspense>
        </main>
      </div>

      {/* Shared QR Code Modal */}
      <QRCodeModal
        isOpen={qrModalData.isOpen}
        onClose={() => setQrModalData((prev) => ({ ...prev, isOpen: false }))}
        title={qrModalData.title}
        subtitle={qrModalData.subtitle}
        qrUrl={qrModalData.qrUrl}
        surveyLink={qrModalData.surveyLink}
        onOpenSurveySimulator={() => {
          setIsStudentView(true);
        }}
      />
    </div>
  );
}

export function App() {
  const auth = useAuth();
  const isProfileSelection = window.location.pathname === '/select-profile';

  // Link và mã QR của từng lớp học phần trỏ vào /survey/{LinkToken}. Sinh viên
  // làm bài ẩn danh nên màn hình này đứng trước mọi bước kiểm tra đăng nhập.
  const publicSurveyToken = window.location.pathname.startsWith('/survey/')
    ? decodeURIComponent(window.location.pathname.slice('/survey/'.length))
    : '';
  if (publicSurveyToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PublicSurveyPage linkToken={publicSurveyToken} />
      </Suspense>
    );
  }

  if (auth.status === 'loading') {
    return <AuthLoading />;
  }

  if (isProfileSelection && auth.status !== 'authenticated') {
    return (
      <Suspense fallback={<PageFallback />}>
        <ProfileSelectionPage />
      </Suspense>
    );
  }

  if (auth.status !== 'authenticated') {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  /*
    Khoá theo hồ sơ đang dùng. Đổi hồ sơ là đổi luôn phạm vi dữ liệu được thấy,
    nhưng các trang nạp dữ liệu trong useEffect chỉ phụ thuộc học kỳ / bộ lọc chứ
    không phụ thuộc hồ sơ, nên chuyển từ quản trị sang trưởng bộ môn xong bảng vẫn
    giữ nguyên danh sách cũ cho tới khi người dùng tự F5 — đọc ra là sai quyền.
    Đổi key thì React tháo cả cây và dựng lại, mọi trang tự gọi lại API của mình.
  */
  return <DashboardApp key={auth.activeProfile?.id ?? 'none'} />;
}

export default App;
