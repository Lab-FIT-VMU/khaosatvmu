using Application.Auth;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Auth;

/// <summary>
/// Single source of truth for the effective owner of imported courses and sections.
/// Missing foreign keys fall back in this order: course, department, lecturer.
/// </summary>
internal static class AcademicScopeQuery
{
    private sealed class EffectiveSectionUnit
    {
        public int CourseSectionId { get; init; }
        public int CourseId { get; init; }
        public int? DepartmentId { get; init; }
        public int? FacultyId { get; init; }
    }

    private static IQueryable<EffectiveSectionUnit> EffectiveSectionUnits(AppDbContext db) =>
        from section in db.CourseSections.AsNoTracking()
        join course in db.Courses.AsNoTracking()
            on section.CourseId equals course.CourseId
        join lecturerRow in db.Lecturers.AsNoTracking()
            on section.LecturerId equals (int?)lecturerRow.LecturerId into lecturerRows
        from lecturer in lecturerRows.DefaultIfEmpty()
        let departmentId = course.DepartmentId
            ?? (lecturer == null ? null : lecturer.DepartmentId)
        join departmentRow in db.Departments.AsNoTracking()
            on departmentId equals (int?)departmentRow.DepartmentId into departmentRows
        from department in departmentRows.DefaultIfEmpty()
        select new EffectiveSectionUnit
        {
            CourseSectionId = section.CourseSectionId,
            CourseId = course.CourseId,
            DepartmentId = departmentId,
            FacultyId = course.FacultyId
                ?? (department == null ? null : department.FacultyId)
                ?? (lecturer == null ? null : lecturer.FacultyId),
        };

    public static IQueryable<CourseSection> CourseSectionsInScope(
        AppDbContext db,
        IQueryable<CourseSection> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;
        if (scope.SeesNothing) return query.Where(_ => false);
        if (scope.SeesOnlyOwn) return query.Where(x => x.LecturerId == scope.LecturerId);

        var units = EffectiveSectionUnits(db);
        if (scope.SeesWholeFaculty)
        {
            var facultyId = scope.FacultyId;
            return query.Where(section => units.Any(unit =>
                unit.CourseSectionId == section.CourseSectionId
                && unit.FacultyId == facultyId));
        }

        var departmentId = scope.DepartmentId;
        return query.Where(section => units.Any(unit =>
            unit.CourseSectionId == section.CourseSectionId
            && unit.DepartmentId == departmentId));
    }

    public static IQueryable<CourseSectionSurvey> SectionSurveysInScope(
        AppDbContext db,
        IQueryable<CourseSectionSurvey> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;
        if (scope.SeesNothing) return query.Where(_ => false);

        var visibleSections = CourseSectionsInScope(db, db.CourseSections.AsNoTracking(), scope);
        return query.Where(sectionSurvey => visibleSections.Any(section =>
            section.CourseSectionId == sectionSurvey.CourseSectionId));
    }

    public static IQueryable<Course> CoursesInScope(
        AppDbContext db,
        IQueryable<Course> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;
        if (scope.SeesNothing) return query.Where(_ => false);
        if (scope.SeesOnlyOwn)
        {
            return query.Where(course => db.CourseSections.Any(section =>
                section.CourseId == course.CourseId
                && section.LecturerId == scope.LecturerId));
        }

        var units = EffectiveSectionUnits(db);
        if (scope.SeesWholeFaculty)
        {
            var facultyId = scope.FacultyId;
            return query.Where(course =>
                course.FacultyId == facultyId
                || (course.FacultyId == null && db.Departments.Any(department =>
                    department.DepartmentId == course.DepartmentId
                    && department.FacultyId == facultyId))
                || units.Any(unit => unit.CourseId == course.CourseId
                    && unit.FacultyId == facultyId));
        }

        var departmentId = scope.DepartmentId;
        return query.Where(course =>
            course.DepartmentId == departmentId
            || (course.DepartmentId == null && units.Any(unit =>
                unit.CourseId == course.CourseId
                && unit.DepartmentId == departmentId)));
    }

    public static IQueryable<Lecturer> LecturersInScope(
        AppDbContext db,
        IQueryable<Lecturer> query,
        UserScope scope)
    {
        if (scope.SeesEverything) return query;
        if (scope.SeesNothing) return query.Where(_ => false);
        if (scope.SeesOnlyOwn) return query.Where(x => x.LecturerId == scope.LecturerId);

        if (scope.SeesWholeFaculty)
        {
            var facultyId = scope.FacultyId;
            return query.Where(lecturer =>
                lecturer.FacultyId == facultyId
                || (lecturer.FacultyId == null && db.Departments.Any(department =>
                    department.DepartmentId == lecturer.DepartmentId
                    && department.FacultyId == facultyId)));
        }

        return query.Where(x => x.DepartmentId == scope.DepartmentId);
    }
}
