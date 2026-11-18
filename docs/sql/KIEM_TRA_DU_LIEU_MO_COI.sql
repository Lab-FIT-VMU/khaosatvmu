-- Read-only diagnostics for data created before the soft-delete fixes.
-- Review each result before choosing restoration or archival; this script changes no data.

-- Active links whose campaign/year/course parents are no longer available.
SELECT link."CourseSectionSurveyId", link."SemesterSurveyId", link."CourseSectionId",
       campaign."IsDeleted" AS "CampaignDeleted", semester."IsDeleted" AS "SemesterDeleted",
       year."IsDeleted" AS "YearDeleted", section."IsDeleted" AS "SectionDeleted",
       course."IsDeleted" AS "CourseDeleted"
FROM "CourseSectionSurveys" link
LEFT JOIN "SemesterSurveys" campaign ON campaign."SemesterSurveyId" = link."SemesterSurveyId"
LEFT JOIN "Semesters" semester ON semester."SemesterId" = campaign."SemesterId"
LEFT JOIN "AcademicYears" year ON year."AcademicYearId" = semester."AcademicYearId"
LEFT JOIN "CourseSections" section ON section."CourseSectionId" = link."CourseSectionId"
LEFT JOIN "Courses" course ON course."CourseId" = section."CourseId"
LEFT JOIN "SurveyTemplates" template ON template."SurveyTemplateId" = campaign."SurveyTemplateId"
WHERE NOT link."IsDeleted" AND (
    COALESCE(campaign."IsDeleted", true) OR COALESCE(semester."IsDeleted", true)
    OR COALESCE(year."IsDeleted", true) OR COALESCE(template."IsDeleted", true)
    OR (campaign."SurveyType" = 'COURSE' AND (
        COALESCE(section."IsDeleted", true) OR COALESCE(course."IsDeleted", true)
        OR section."SemesterId" IS DISTINCT FROM campaign."SemesterId")));

-- Active cohort majors hidden by joins to deleted catalogue records.
SELECT cm."CohortMajorId", cm."CohortId", cm."MajorId",
       cohort."IsDeleted" AS "CohortDeleted", year."IsDeleted" AS "YearDeleted",
       major."IsDeleted" AS "MajorDeleted", faculty."IsDeleted" AS "FacultyDeleted"
FROM "CohortMajors" cm
LEFT JOIN "Cohorts" cohort ON cohort."CohortId" = cm."CohortId"
LEFT JOIN "AcademicYears" year ON year."AcademicYearId" = cohort."AcademicYearId"
LEFT JOIN "Majors" major ON major."MajorId" = cm."MajorId"
LEFT JOIN "Faculties" faculty ON faculty."FacultyId" = major."FacultyId"
WHERE NOT cm."IsDeleted" AND (
    COALESCE(cohort."IsDeleted", true) OR COALESCE(year."IsDeleted", true)
    OR COALESCE(major."IsDeleted", true) OR COALESCE(faculty."IsDeleted", true));

-- Cohorts still reserving a code for a deleted year.
SELECT cohort."CohortId", cohort."CohortCode", cohort."AcademicYearId"
FROM "Cohorts" cohort
LEFT JOIN "AcademicYears" year ON year."AcademicYearId" = cohort."AcademicYearId"
WHERE NOT cohort."IsDeleted" AND COALESCE(year."IsDeleted", true);

-- Historical overflow: include invalid submissions, exclude cleared submissions.
SELECT link."CourseSectionSurveyId",
       COALESCE(link."TargetCount", section."ClassSize", 0) AS "Capacity",
       count(response."ResponseId") AS "Submitted"
FROM "CourseSectionSurveys" link
LEFT JOIN "CourseSections" section ON section."CourseSectionId" = link."CourseSectionId"
    AND NOT section."IsDeleted"
LEFT JOIN "SurveyResponses" response ON response."CourseSectionSurveyId" = link."CourseSectionSurveyId"
    AND NOT response."IsDeleted"
WHERE NOT link."IsDeleted"
GROUP BY link."CourseSectionSurveyId", link."TargetCount", section."ClassSize"
HAVING COALESCE(link."TargetCount", section."ClassSize", 0) > 0
   AND count(response."ResponseId") > COALESCE(link."TargetCount", section."ClassSize", 0);
