using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Application.Auth;
using Application.Catalog;
using Application.UserAdministration;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Catalog;

public sealed partial class EfCatalogService(AppDbContext db, IUserScopeResolver userScope) : ICatalogService
{
    // ---------------------------------------------------------------- Faculties

    public async Task<IReadOnlyList<FacultyDto>> GetFacultiesAsync(CancellationToken cancellationToken = default) =>
        await db.Faculties
            .OrderBy(x => x.FacultyName)
            .Select(x => new FacultyDto(x.FacultyId, x.FacultyName))
            .ToListAsync(cancellationToken);

    public async Task<CatalogOperationResult<FacultyDto>> CreateFacultyAsync(
        SaveFacultyCommand command,
        CancellationToken cancellationToken = default)
    {
        var name = command.FacultyName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<FacultyDto>(CatalogErrorCodes.FacultyNameRequired);
        }
        if (await FacultyNameTakenAsync(name, null, cancellationToken))
        {
            return Failed<FacultyDto>(CatalogErrorCodes.FacultyNameExists);
        }

        var faculty = new Faculty { FacultyName = name };
        db.Faculties.Add(faculty);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new FacultyDto(faculty.FacultyId, faculty.FacultyName));
    }

    public async Task<CatalogOperationResult<FacultyDto>> UpdateFacultyAsync(
        int facultyId,
        SaveFacultyCommand command,
        CancellationToken cancellationToken = default)
    {
        var faculty = await db.Faculties.FirstOrDefaultAsync(x => x.FacultyId == facultyId, cancellationToken);
        if (faculty is null)
        {
            return Failed<FacultyDto>(CatalogErrorCodes.FacultyNotFound);
        }

        var name = command.FacultyName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<FacultyDto>(CatalogErrorCodes.FacultyNameRequired);
        }
        if (await FacultyNameTakenAsync(name, facultyId, cancellationToken))
        {
            return Failed<FacultyDto>(CatalogErrorCodes.FacultyNameExists);
        }

        faculty.FacultyName = name;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new FacultyDto(faculty.FacultyId, faculty.FacultyName));
    }

    public async Task<CatalogOperationResult<bool>> DeleteFacultyAsync(
        int facultyId,
        CancellationToken cancellationToken = default)
    {
        var faculty = await db.Faculties.FirstOrDefaultAsync(x => x.FacultyId == facultyId, cancellationToken);
        if (faculty is null)
        {
            return Failed<bool>(CatalogErrorCodes.FacultyNotFound);
        }

        if (await db.Lecturers.AnyAsync(x => x.FacultyId == facultyId, cancellationToken)
            || await db.Courses.AnyAsync(x => x.FacultyId == facultyId, cancellationToken))
        {
            return Failed<bool>(CatalogErrorCodes.FacultyInUse);
        }

        // Cascade soft-delete: khoa viện → ngành học (trước đây ON DELETE CASCADE).
        var majors = await db.Majors.Where(x => x.FacultyId == facultyId).ToListAsync(cancellationToken);
        foreach (var major in majors)
            db.Majors.Remove(major);

        db.Faculties.Remove(faculty);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CatalogImportDto>> ImportFacultiesAsync(
        IReadOnlyList<ImportFacultyRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        // Kiểm trùng bằng khoá BỎ DẤU: "Công trình thuỷ" và "Công trình thủy" là cùng
        // một khoa gõ theo hai kiểu đặt dấu. Cho tạo cả hai thì mọi tệp import sau đó
        // tra tên khoa sẽ trúng nhầm cái này hoặc cái kia.
        var existingNames = (await db.Faculties.Select(x => x.FacultyName).ToListAsync(cancellationToken))
            .Select(NormalizeLooseKey)
            .ToHashSet();
        var seenInFile = new HashSet<string>();
        var items = new List<CatalogImportItemDto>(rows.Count);
        var created = new List<Faculty>();

        foreach (var row in rows)
        {
            var name = row.FacultyName?.Trim() ?? string.Empty;
            if (name.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, null, false, CatalogErrorCodes.FacultyNameRequired));
                continue;
            }

            var key = NormalizeLooseKey(name);
            if (existingNames.Contains(key))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, null, false, CatalogErrorCodes.FacultyNameExists));
                continue;
            }
            if (!seenInFile.Add(key))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, null, false, CatalogErrorCodes.FacultyDuplicateInFile));
                continue;
            }

            created.Add(new Faculty { FacultyName = name });
            items.Add(new CatalogImportItemDto(row.RowNumber, name, null, true, null));
        }

        if (created.Count > 0)
        {
            db.Faculties.AddRange(created);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Succeeded(new CatalogImportDto(rows.Count, created.Count, rows.Count - created.Count, items));
    }

    // -------------------------------------------------------------- Departments

    public async Task<IReadOnlyList<DepartmentDto>> GetDepartmentsAsync(CancellationToken cancellationToken = default) =>
        await db.Departments
            .OrderBy(x => x.DepartmentName)
            .Select(x => new DepartmentDto(x.DepartmentId, x.DepartmentName, x.FacultyId))
            .ToListAsync(cancellationToken);

    public async Task<CatalogOperationResult<DepartmentDto>> CreateDepartmentAsync(
        SaveDepartmentCommand command,
        CancellationToken cancellationToken = default)
    {
        var name = command.DepartmentName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentNameRequired);
        }
        // Mã bộ môn tự nhập nên phải kiểm tra thủ công, kể cả với bản ghi đã xóa mềm.
        if (command.DepartmentId <= 0)
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentIdRequired);
        }
        if (await db.Departments
            .IgnoreQueryFilters()
            .AnyAsync(x => x.DepartmentId == command.DepartmentId, cancellationToken))
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentIdExists);
        }
        if (command.FacultyId is { } facultyId && !await FacultyExistsAsync(facultyId, cancellationToken))
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.FacultyNotFound);
        }

        var department = new Department
        {
            DepartmentId = command.DepartmentId,
            DepartmentName = name,
            FacultyId = command.FacultyId
        };
        db.Departments.Add(department);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new DepartmentDto(department.DepartmentId, department.DepartmentName, department.FacultyId));
    }

    public async Task<CatalogOperationResult<DepartmentDto>> UpdateDepartmentAsync(
        int departmentId,
        SaveDepartmentCommand command,
        CancellationToken cancellationToken = default)
    {
        var department = await db.Departments.FirstOrDefaultAsync(x => x.DepartmentId == departmentId, cancellationToken);
        if (department is null)
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentNotFound);
        }

        var name = command.DepartmentName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentNameRequired);
        }
        if (command.FacultyId is { } facultyId && !await FacultyExistsAsync(facultyId, cancellationToken))
        {
            return Failed<DepartmentDto>(CatalogErrorCodes.FacultyNotFound);
        }

        department.DepartmentName = name;
        department.FacultyId = command.FacultyId;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new DepartmentDto(department.DepartmentId, department.DepartmentName, department.FacultyId));
    }

    public async Task<CatalogOperationResult<bool>> DeleteDepartmentAsync(
        int departmentId,
        CancellationToken cancellationToken = default)
    {
        var department = await db.Departments.FirstOrDefaultAsync(x => x.DepartmentId == departmentId, cancellationToken);
        if (department is null)
        {
            return Failed<bool>(CatalogErrorCodes.DepartmentNotFound);
        }

        if (await db.Lecturers.AnyAsync(x => x.DepartmentId == departmentId, cancellationToken)
            || await db.Courses.AnyAsync(x => x.DepartmentId == departmentId, cancellationToken))
        {
            return Failed<bool>(CatalogErrorCodes.DepartmentInUse);
        }

        db.Departments.Remove(department);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CatalogImportDto>> ImportDepartmentsAsync(
        IReadOnlyList<ImportDepartmentRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        var facultyIdByName = await LoadFacultyIdByNameAsync(cancellationToken);
        // Mã bộ môn do người dùng nhập nên phải tự kiểm tra trùng: trùng trong tệp và trùng dưới CSDL.
        var existingIds = await db.Departments
            .IgnoreQueryFilters()
            .Select(x => x.DepartmentId)
            .ToHashSetAsync(cancellationToken);
        var idsInFile = new HashSet<int>();
        var items = new List<CatalogImportItemDto>(rows.Count);
        var created = new List<Department>();

        foreach (var row in rows)
        {
            var name = row.DepartmentName?.Trim() ?? string.Empty;
            var facultyName = row.FacultyName?.Trim() ?? string.Empty;

            if (row.DepartmentId <= 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.DepartmentIdRequired));
                continue;
            }
            if (!idsInFile.Add(row.DepartmentId))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.DepartmentIdDuplicateInFile));
                continue;
            }
            if (existingIds.Contains(row.DepartmentId))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.DepartmentIdExists));
                continue;
            }

            if (name.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.DepartmentNameRequired));
                continue;
            }

            int? facultyId = null;
            if (facultyName.Length > 0)
            {
                if (!facultyIdByName.TryGet(facultyName, out var found))
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.FacultyNotFound));
                    continue;
                }
                facultyId = found;
            }

            created.Add(new Department { DepartmentId = row.DepartmentId, DepartmentName = name, FacultyId = facultyId });
            items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, true, null));
        }

        if (created.Count > 0)
        {
            db.Departments.AddRange(created);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Succeeded(new CatalogImportDto(rows.Count, created.Count, rows.Count - created.Count, items));
    }

    // --------------------------------------------------------------- Positions

    public async Task<IReadOnlyList<PositionDto>> GetPositionsAsync(CancellationToken cancellationToken = default) =>
        await db.Positions
            .OrderBy(x => x.PositionId)
            .Select(x => new PositionDto(x.PositionId, x.PositionName))
            .ToListAsync(cancellationToken);

    public async Task<CatalogOperationResult<PositionDto>> CreatePositionAsync(
        SavePositionCommand command,
        CancellationToken cancellationToken = default)
    {
        var name = command.PositionName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<PositionDto>(CatalogErrorCodes.PositionNameRequired);
        }
        if (await PositionNameTakenAsync(name, null, cancellationToken))
        {
            return Failed<PositionDto>(CatalogErrorCodes.PositionNameExists);
        }

        var position = new Position { PositionName = name };
        db.Positions.Add(position);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new PositionDto(position.PositionId, position.PositionName));
    }

    public async Task<CatalogOperationResult<PositionDto>> UpdatePositionAsync(
        int positionId,
        SavePositionCommand command,
        CancellationToken cancellationToken = default)
    {
        var position = await db.Positions.FirstOrDefaultAsync(x => x.PositionId == positionId, cancellationToken);
        if (position is null)
        {
            return Failed<PositionDto>(CatalogErrorCodes.PositionNotFound);
        }

        var name = command.PositionName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Failed<PositionDto>(CatalogErrorCodes.PositionNameRequired);
        }
        if (await PositionNameTakenAsync(name, positionId, cancellationToken))
        {
            return Failed<PositionDto>(CatalogErrorCodes.PositionNameExists);
        }

        position.PositionName = name;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new PositionDto(position.PositionId, position.PositionName));
    }

    public async Task<CatalogOperationResult<bool>> DeletePositionAsync(
        int positionId,
        CancellationToken cancellationToken = default)
    {
        var position = await db.Positions.FirstOrDefaultAsync(x => x.PositionId == positionId, cancellationToken);
        if (position is null)
        {
            return Failed<bool>(CatalogErrorCodes.PositionNotFound);
        }

        db.Positions.Remove(position);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    private async Task<bool> PositionNameTakenAsync(string name, int? exceptPositionId, CancellationToken cancellationToken)
    {
        // So bằng khoá BỎ DẤU nên phải tra trong bộ nhớ: "Thuỷ lực" và "Thủy lực" là
        // cùng một tên gõ theo hai kiểu đặt dấu, cho tạo cả hai là hỏng mọi phép tra
        // theo tên về sau. Danh mục chỉ vài trăm dòng nên tải hết về không tốn gì.
        var normalized = NormalizeLooseKey(name);
        var existing = await db.Positions
            .Where(x => exceptPositionId == null || x.PositionId != exceptPositionId)
            .Select(x => x.PositionName)
            .ToListAsync(cancellationToken);
        return existing.Any(x => NormalizeLooseKey(x) == normalized);
    }

    // ------------------------------------------------------------------ Majors

    public async Task<IReadOnlyList<MajorDto>> GetMajorsAsync(CancellationToken cancellationToken = default) =>
        await db.Majors
            .OrderBy(x => x.MajorName)
            .Select(x => new MajorDto(x.MajorId, x.MajorCode, x.MajorName, x.FacultyId))
            .ToListAsync(cancellationToken);

    public async Task<CatalogOperationResult<MajorDto>> CreateMajorAsync(
        SaveMajorCommand command,
        CancellationToken cancellationToken = default)
    {
        var code = NormalizeMajorCode(command.MajorCode);
        var name = command.MajorName?.Trim() ?? string.Empty;
        if (code.Length == 0)
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorCodeRequired);
        }
        if (name.Length == 0)
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorNameRequired);
        }
        if (!await FacultyExistsAsync(command.FacultyId, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.FacultyNotFound);
        }

        if (await MajorNameTakenAsync(name, command.FacultyId, null, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorExists);
        }
        if (await MajorCodeTakenAsync(code, null, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorCodeExists);
        }

        var major = new Major { MajorCode = code, MajorName = name, FacultyId = command.FacultyId };
        db.Majors.Add(major);
        await db.SaveChangesAsync(cancellationToken);
        await CatalogImportAliasSeeder.SeedAsync(db, cancellationToken);

        return Succeeded(new MajorDto(major.MajorId, major.MajorCode, major.MajorName, major.FacultyId));
    }

    public async Task<CatalogOperationResult<MajorDto>> UpdateMajorAsync(
        int majorId,
        SaveMajorCommand command,
        CancellationToken cancellationToken = default)
    {
        var major = await db.Majors.FirstOrDefaultAsync(x => x.MajorId == majorId, cancellationToken);
        if (major is null)
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorNotFound);
        }

        var code = NormalizeMajorCode(command.MajorCode);
        var name = command.MajorName?.Trim() ?? string.Empty;
        if (code.Length == 0)
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorCodeRequired);
        }
        if (name.Length == 0)
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorNameRequired);
        }
        if (!await FacultyExistsAsync(command.FacultyId, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.FacultyNotFound);
        }
        if (await MajorNameTakenAsync(name, command.FacultyId, majorId, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorExists);
        }
        if (await MajorCodeTakenAsync(code, majorId, cancellationToken))
        {
            return Failed<MajorDto>(CatalogErrorCodes.MajorCodeExists);
        }

        major.MajorCode = code;
        major.MajorName = name;
        major.FacultyId = command.FacultyId;
        await db.SaveChangesAsync(cancellationToken);
        await CatalogImportAliasSeeder.SeedAsync(db, cancellationToken);

        return Succeeded(new MajorDto(major.MajorId, major.MajorCode, major.MajorName, major.FacultyId));
    }

    public async Task<CatalogOperationResult<bool>> DeleteMajorAsync(
        int majorId,
        CancellationToken cancellationToken = default)
    {
        var major = await db.Majors.FirstOrDefaultAsync(x => x.MajorId == majorId, cancellationToken);
        if (major is null)
        {
            return Failed<bool>(CatalogErrorCodes.MajorNotFound);
        }

        db.Majors.Remove(major);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CatalogImportDto>> ImportMajorsAsync(
        IReadOnlyList<ImportMajorRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        var facultyIdByName = await LoadFacultyIdByNameAsync(cancellationToken);
        var items = new List<CatalogImportItemDto>(rows.Count);
        var created = new List<Major>();

        var existingMajors = await db.Majors
            .Select(x => new { x.FacultyId, x.MajorCode, x.MajorName })
            .ToListAsync(cancellationToken);
        var existingNames = existingMajors
            .Select(x => (x.FacultyId, Name: NormalizeLooseKey(x.MajorName)))
            .ToHashSet();
        var existingCodes = existingMajors
            .Select(x => NormalizeMajorCode(x.MajorCode))
            .ToHashSet(StringComparer.Ordinal);

        foreach (var row in rows)
        {
            var code = NormalizeMajorCode(row.MajorCode);
            var name = row.MajorName?.Trim() ?? string.Empty;
            var facultyName = row.FacultyName?.Trim() ?? string.Empty;

            if (code.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.MajorCodeRequired));
                continue;
            }
            if (name.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.MajorNameRequired));
                continue;
            }
            // "Majors"."FacultyId" là NOT NULL nên bắt buộc phải tra được khoa viện.
            if (facultyName.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.MajorFacultyRequired));
                continue;
            }
            if (!facultyIdByName.TryGet(facultyName, out var facultyId))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.FacultyNotFound));
                continue;
            }
            var normalizedName = NormalizeLooseKey(name);
            if (existingNames.Contains((facultyId, normalizedName)))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.MajorExists));
                continue;
            }
            if (!existingCodes.Add(code))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.MajorCodeExists));
                continue;
            }

            existingNames.Add((facultyId, normalizedName));

            var major = new Major { MajorCode = code, MajorName = name, FacultyId = facultyId };
            created.Add(major);
            items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, true, null));
        }

        if (created.Count > 0)
        {
            db.Majors.AddRange(created);
            await db.SaveChangesAsync(cancellationToken);
        }

        await CatalogImportAliasSeeder.SeedAsync(db, cancellationToken);

        return Succeeded(new CatalogImportDto(rows.Count, created.Count, rows.Count - created.Count, items));
    }

    // ----------------------------------------------- Năm học và học kỳ

    /// <summary>Ba học kỳ được sinh tự động cho mỗi năm học mới.</summary>
    private static readonly string[] DefaultSemesterNames = ["Học kỳ phụ", "Học kỳ 1", "Học kỳ 2"];

    /// <summary>
    /// Năm học kết thúc vào ngày liền trước mốc bắt đầu của năm sau, nên hai năm
    /// học liên tiếp khít nhau và không chồng lấn. Ngày 29/2 lùi về 28/2 rồi mới
    /// trừ một ngày, theo đúng cách <see cref="DateOnly.AddYears"/> xử lý.
    /// </summary>
    private static DateOnly AcademicYearEndDate(DateOnly startDate) =>
        startDate.AddYears(1).AddDays(-1);

    public async Task<IReadOnlyList<AcademicYearDto>> GetAcademicYearsAsync(
        CancellationToken cancellationToken = default)
    {
        var years = await db.AcademicYears
            .OrderByDescending(x => x.AcademicYearName)
            .ToListAsync(cancellationToken);
        var semesters = await db.Semesters
            .OrderBy(x => x.SemesterId)
            .ToListAsync(cancellationToken);

        return years
            .Select(year => new AcademicYearDto(
                year.AcademicYearId,
                year.AcademicYearName,
                year.StartDate,
                year.EndDate,
                semesters
                    .Where(semester => semester.AcademicYearId == year.AcademicYearId)
                    .Select(ToDto)
                    .ToList()))
            .ToList();
    }

    // Năm học và học kỳ là khung dùng chung cho cả trường, không thuộc bộ môn nào,
    // và xoá một năm học là xoá mềm lây xuống học kỳ rồi lớp học phần. Nên toàn bộ
    // nhóm này chỉ dành cho quản trị — trước đây không kiểm gì cả, ai có
    // COURSE_SECTIONS_ACCESS đều ghi được. Xem congviec3.md mục H4.
    public async Task<CatalogOperationResult<AcademicYearDto>> CreateAcademicYearAsync(
        SaveAcademicYearCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<AcademicYearDto>(adminOnly);
        }

        var validation = await ValidateAcademicYearAsync(null, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<AcademicYearDto>(validation);
        }

        var academicYearName = command.AcademicYearName.Trim();
        var startDate = command.StartDate!.Value;
        var endDate = AcademicYearEndDate(startDate);
        var year = new AcademicYear
        {
            AcademicYearName = academicYearName,
            StartDate = startDate,
            EndDate = endDate,
        };
        db.AcademicYears.Add(year);
        await db.SaveChangesAsync(cancellationToken);

        var semesters = DefaultSemesterNames
            .Select(name => new Semester { SemesterName = name, AcademicYearId = year.AcademicYearId })
            .ToList();
        db.Semesters.AddRange(semesters);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new AcademicYearDto(
            year.AcademicYearId,
            year.AcademicYearName,
            year.StartDate,
            year.EndDate,
            semesters.Select(ToDto).ToList()));
    }

    public async Task<CatalogOperationResult<AcademicYearDto>> UpdateAcademicYearAsync(
        int academicYearId,
        SaveAcademicYearCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<AcademicYearDto>(adminOnly);
        }

        var year = await db.AcademicYears
            .FirstOrDefaultAsync(x => x.AcademicYearId == academicYearId, cancellationToken);
        if (year is null)
        {
            return Failed<AcademicYearDto>(CatalogErrorCodes.AcademicYearNotFound);
        }

        var validation = await ValidateAcademicYearAsync(academicYearId, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<AcademicYearDto>(validation);
        }

        year.AcademicYearName = command.AcademicYearName.Trim();
        year.StartDate = command.StartDate!.Value;
        year.EndDate = AcademicYearEndDate(year.StartDate);
        await db.SaveChangesAsync(cancellationToken);

        var semesters = await db.Semesters
            .Where(x => x.AcademicYearId == academicYearId)
            .OrderBy(x => x.SemesterId)
            .ToListAsync(cancellationToken);

        return Succeeded(new AcademicYearDto(
            year.AcademicYearId,
            year.AcademicYearName,
            year.StartDate,
            year.EndDate,
            semesters.Select(ToDto).ToList()));
    }

    public async Task<CatalogOperationResult<bool>> DeleteAcademicYearAsync(
        int academicYearId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<bool>(adminOnly);
        }

        var year = await db.AcademicYears
            .FirstOrDefaultAsync(x => x.AcademicYearId == academicYearId, cancellationToken);
        if (year is null)
        {
            return Failed<bool>(CatalogErrorCodes.AcademicYearNotFound);
        }

        // Cascade soft-delete: năm học → học kỳ → lớp học phần.
        var semesters = await db.Semesters
            .Where(x => x.AcademicYearId == academicYearId).ToListAsync(cancellationToken);
        var semesterIds = semesters.Select(x => x.SemesterId).ToList();
        var sections = await db.CourseSections
            .Where(x => semesterIds.Contains(x.SemesterId)).ToListAsync(cancellationToken);
        foreach (var section in sections)
            db.CourseSections.Remove(section);
        foreach (var semester in semesters)
            db.Semesters.Remove(semester);

        db.AcademicYears.Remove(year);
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<SemesterDto>> CreateSemesterAsync(
        SaveSemesterCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<SemesterDto>(adminOnly);
        }

        var validation = await ValidateSemesterAsync(null, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<SemesterDto>(validation);
        }

        var semester = new Semester
        {
            SemesterName = command.SemesterName.Trim(),
            AcademicYearId = command.AcademicYearId
        };
        db.Semesters.Add(semester);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(semester));
    }

    public async Task<CatalogOperationResult<SemesterDto>> UpdateSemesterAsync(
        int semesterId,
        SaveSemesterCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<SemesterDto>(adminOnly);
        }

        var semester = await db.Semesters.FirstOrDefaultAsync(x => x.SemesterId == semesterId, cancellationToken);
        if (semester is null)
        {
            return Failed<SemesterDto>(CatalogErrorCodes.SemesterNotFound);
        }

        var validation = await ValidateSemesterAsync(semesterId, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<SemesterDto>(validation);
        }

        semester.SemesterName = command.SemesterName.Trim();
        semester.AcademicYearId = command.AcademicYearId;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(semester));
    }

    public async Task<CatalogOperationResult<bool>> DeleteSemesterAsync(
        int semesterId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<bool>(adminOnly);
        }

        var semester = await db.Semesters.FirstOrDefaultAsync(x => x.SemesterId == semesterId, cancellationToken);
        if (semester is null)
        {
            return Failed<bool>(CatalogErrorCodes.SemesterNotFound);
        }

        // Cascade soft-delete: học kỳ → lớp học phần.
        var sections = await db.CourseSections
            .Where(x => x.SemesterId == semesterId).ToListAsync(cancellationToken);
        foreach (var section in sections)
            db.CourseSections.Remove(section);

        db.Semesters.Remove(semester);
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }

    // ----------------------------------------------------------- Lớp học phần

    public async Task<IReadOnlyList<CourseSectionDto>> GetCourseSectionsAsync(
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesNothing) return [];

        var query = db.CourseSections.AsQueryable();
        if (semesterId is { } id)
        {
            query = query.Where(x => x.SemesterId == id);
        }

        // Hai mức phạm vi đi theo hai TRỤC khác nhau, không phải cùng một trục xiết
        // chặt dần. Giảng viên đi theo người dạy; trưởng bộ môn đi theo học phần sở
        // hữu (câu D-b) nên giảng viên bộ môn A dạy học phần của bộ môn B thì lớp đó
        // thuộc phạm vi của trưởng bộ môn B. Xem congviec3.md mục H2.
        if (scope.SeesOnlyOwn)
        {
            query = query.Where(x => x.LecturerId == scope.LecturerId);
        }
        else if (scope.SeesWholeFaculty)
        {
            query = query.Where(x => db.Courses
                .Any(course => course.CourseId == x.CourseId
                               && course.FacultyId == scope.FacultyId));
        }
        else if (!scope.SeesEverything)
        {
            query = query.Where(x => db.Courses
                .Any(course => course.CourseId == x.CourseId
                               && course.DepartmentId == scope.DepartmentId));
        }

        var sections = await query.OrderBy(x => x.SectionName).ToListAsync(cancellationToken);

        // Tra tên người dạy ngay tại đây, KHÔNG lọc theo bộ môn của người xem: đây là
        // giảng viên của chính những lớp mà họ đã được phép thấy, giấu tên đi thì cột
        // Giảng viên trống trơn mà lớp vẫn hiện.
        var lecturerIds = sections
            .Where(x => x.LecturerId.HasValue)
            .Select(x => x.LecturerId!.Value)
            .Distinct()
            .ToList();
        var lecturerById = lecturerIds.Count == 0
            ? []
            : await db.Lecturers.AsNoTracking()
                .Where(x => lecturerIds.Contains(x.LecturerId))
                .ToDictionaryAsync(x => x.LecturerId, x => x, cancellationToken);

        return sections
            .Select(section => ToDto(
                section,
                section.LecturerId is { } lecturerId
                    ? lecturerById.GetValueOrDefault(lecturerId)
                    : null))
            .ToList();
    }

    public async Task<CatalogOperationResult<CourseSectionDto>> CreateCourseSectionAsync(
        SaveCourseSectionCommand command,
        CancellationToken cancellationToken = default)
    {
        // Kiểm phạm vi TRƯỚC khi validate. Nếu validate trước thì người ngoài bộ môn
        // dò được dữ liệu của bộ môn khác qua chính mã lỗi trả về.
        // Lớp thuộc bộ môn nào là theo học phần sở hữu, nên chỉ được tạo lớp cho học
        // phần của bộ môn mình.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanManageCourseSections)
        {
            return Failed<CourseSectionDto>(CatalogErrorCodes.OutOfScope);
        }
        var departmentId = await DepartmentOfCourseAsync(command.CourseId, cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, departmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<CourseSectionDto>(outOfScope);
        }

        var validation = await ValidateCourseSectionAsync(null, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<CourseSectionDto>(validation);
        }

        var section = new CourseSection
        {
            CourseId = command.CourseId,
            SemesterId = command.SemesterId,
            LecturerId = command.LecturerId,
            SectionName = command.SectionName.Trim(),
            ClassSize = command.ClassSize,
            // Có mã giảng viên thì không giữ tên chưa xác định nữa.
            UnidentifiedLecturerName = command.LecturerId is null
                ? NullIfBlank(command.UnidentifiedLecturerName)
                : null
        };
        db.CourseSections.Add(section);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(section));
    }

    public async Task<CatalogOperationResult<CourseSectionDto>> UpdateCourseSectionAsync(
        int courseSectionId,
        SaveCourseSectionCommand command,
        CancellationToken cancellationToken = default)
    {
        var section = await db.CourseSections
            .FirstOrDefaultAsync(x => x.CourseSectionId == courseSectionId, cancellationToken);
        if (section is null)
        {
            return Failed<CourseSectionDto>(CatalogErrorCodes.CourseSectionNotFound);
        }

        // Kiểm cả học phần cũ lẫn học phần mới: không được lấy lớp của bộ môn khác về,
        // cũng không được đẩy lớp của mình sang bộ môn khác bằng cách đổi học phần.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanManageCourseSections)
        {
            return Failed<CourseSectionDto>(CatalogErrorCodes.OutOfScope);
        }
        var currentDepartmentId = await DepartmentOfCourseAsync(section.CourseId, cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, currentDepartmentId, cancellationToken) is { } currentOutOfScope)
        {
            return Failed<CourseSectionDto>(currentOutOfScope);
        }
        if (command.CourseId != section.CourseId)
        {
            var nextDepartmentId = await DepartmentOfCourseAsync(command.CourseId, cancellationToken);
            if (await CheckDepartmentInScopeAsync(scope, nextDepartmentId, cancellationToken) is { } nextOutOfScope)
            {
                return Failed<CourseSectionDto>(nextOutOfScope);
            }
        }

        var validation = await ValidateCourseSectionAsync(courseSectionId, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<CourseSectionDto>(validation);
        }

        section.CourseId = command.CourseId;
        section.SemesterId = command.SemesterId;
        section.LecturerId = command.LecturerId;
        section.SectionName = command.SectionName.Trim();
        section.ClassSize = command.ClassSize;
        section.UnidentifiedLecturerName = command.LecturerId is null
            ? NullIfBlank(command.UnidentifiedLecturerName)
            : null;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(section));
    }

    public async Task<CatalogOperationResult<bool>> DeleteCourseSectionAsync(
        int courseSectionId,
        CancellationToken cancellationToken = default)
    {
        var section = await db.CourseSections
            .FirstOrDefaultAsync(x => x.CourseSectionId == courseSectionId, cancellationToken);
        if (section is null)
        {
            return Failed<bool>(CatalogErrorCodes.CourseSectionNotFound);
        }

        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanManageCourseSections)
        {
            return Failed<bool>(CatalogErrorCodes.OutOfScope);
        }
        var departmentId = await DepartmentOfCourseAsync(section.CourseId, cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, departmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<bool>(outOfScope);
        }

        // Cascade soft-delete: lớp học phần → bài khảo sát lớp.
        var sectionSurveys = await db.CourseSectionSurveys
            .Where(x => x.CourseSectionId == courseSectionId).ToListAsync(cancellationToken);
        foreach (var ss in sectionSurveys)
            db.CourseSectionSurveys.Remove(ss);

        db.CourseSections.Remove(section);
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CourseSectionImportDto>> ImportCourseSectionsAsync(
        int semesterId,
        IReadOnlyList<ImportCourseSectionRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        // Import chỉ dành cho quản trị, đúng câu D-d. Mỗi dòng trong tệp mang bộ môn
        // riêng và còn tự tạo học phần lẫn giảng viên mới, nên không có cách nào ép
        // toàn bộ về một bộ môn mà vẫn giữ đúng nghĩa của tệp.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<CourseSectionImportDto>(adminOnly);
        }

        if (!await db.Semesters.AnyAsync(x => x.SemesterId == semesterId, cancellationToken))
        {
            return Failed<CourseSectionImportDto>(CatalogErrorCodes.SemesterNotFound);
        }

        // Các map tra ngược. Học phần và giảng viên được tạo giữa chừng cũng ghi
        // vào đây để dòng sau dùng lại, tránh tạo trùng trong cùng một tệp.
        var courseIdByCode = new Dictionary<string, int>();
        // Tên và số tín chỉ đi kèm để dòng thiếu email xuất lại được ĐÚNG cấu trúc
        // tệp import, gồm cả cột "Học phần" và "TCHT".
        var courseInfoById = new Dictionary<int, (string CourseName, int Credits)>();
        foreach (var course in await db.Courses
            .Select(x => new { x.CourseId, x.CourseCode, x.CourseName, x.Credits })
            .ToListAsync(cancellationToken))
        {
            courseIdByCode[NormalizeKey(course.CourseCode)] = course.CourseId;
            courseInfoById[course.CourseId] = (course.CourseName, course.Credits);
        }

        var departmentNameById = await db.Departments
            .ToDictionaryAsync(x => x.DepartmentId, x => x.DepartmentName, cancellationToken);
        var departmentIdByName = await LoadDepartmentIdByNameAsync(cancellationToken);
        var facultyIdByName = await LoadFacultyIdByNameAsync(cancellationToken);

        var lecturerIdByEmail = new Dictionary<string, int>();
        foreach (var lecturer in await db.Lecturers.Select(x => new { x.LecturerId, x.Email }).ToListAsync(cancellationToken))
        {
            if (!string.IsNullOrWhiteSpace(lecturer.Email))
            {
                lecturerIdByEmail[NormalizeKey(lecturer.Email)] = lecturer.LecturerId;
            }
        }

        // Giảng viên tạo tự động luôn mang chức vụ mặc định.
        var defaultPositionId = await db.Positions
            .Where(x => x.PositionName == CatalogDefaults.PositionName)
            .Select(x => (int?)x.PositionId)
            .FirstOrDefaultAsync(cancellationToken);

        // Trùng theo UNIQUE ("CourseId", "SemesterId", "SectionName").
        var existingSections = await db.CourseSections
            .Where(x => x.SemesterId == semesterId)
            .ToListAsync(cancellationToken);
        var sectionByKey = new Dictionary<string, CourseSection>();
        foreach (var section in existingSections)
        {
            sectionByKey[$"{section.CourseId}|{NormalizeKey(section.SectionName)}"] = section;
        }

        var seenInFile = new HashSet<string>();
        var itemsByRow = new Dictionary<int, CatalogImportItemDto>();
        var unidentifiedLecturers = new List<UnidentifiedLecturerDto>();
        var createdSections = new List<CourseSection>();
        var createdCourseCount = 0;
        var createdLecturerCount = 0;
        var updatedSectionCount = 0;

        var pendingCourses = new Dictionary<string, Course>();
        var pendingLecturers = new Dictionary<string, Lecturer>();

        // PASS 1: Kiểm tra hợp lệ và gom danh sách Học phần / Giảng viên mới cần tạo
        foreach (var row in rows)
        {
            var courseCode = row.CourseCode?.Trim() ?? string.Empty;
            var sectionName = row.SectionName?.Trim() ?? string.Empty;

            if (courseCode.Length == 0)
            {
                itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, null, false, CatalogErrorCodes.CourseCodeRequired);
                continue;
            }
            if (sectionName.Length == 0)
            {
                itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseSectionNameRequired);
                continue;
            }

            var classSizeText = row.ClassSize?.Trim() ?? string.Empty;
            var classSize = 0;
            if (classSizeText.Length > 0 && (!int.TryParse(classSizeText, out classSize) || classSize < 0))
            {
                itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseSectionSizeInvalid);
                continue;
            }

            // Bộ môn: ưu tiên cột "Mã BM", trống thì mới tra theo tên.
            int? departmentId = null;
            var departmentCode = row.DepartmentCode?.Trim() ?? string.Empty;
            var departmentName = row.DepartmentName?.Trim() ?? string.Empty;
            if (departmentCode.Length > 0)
            {
                if (!int.TryParse(departmentCode, out var parsedDepartmentId) || parsedDepartmentId <= 0)
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.DepartmentCodeInvalid);
                    continue;
                }
                if (!departmentNameById.ContainsKey(parsedDepartmentId))
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.DepartmentNotFound);
                    continue;
                }
                departmentId = parsedDepartmentId;
            }
            else if (departmentName.Length > 0)
            {
                if (!departmentIdByName.TryGet(departmentName, out var foundDepartment))
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.DepartmentNotFound);
                    continue;
                }
                departmentId = foundDepartment;
            }

            int? facultyId = null;
            var facultyName = row.FacultyName?.Trim() ?? string.Empty;
            if (facultyName.Length > 0)
            {
                if (!facultyIdByName.TryGet(facultyName, out var foundFaculty))
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.FacultyNotFound);
                    continue;
                }
                facultyId = foundFaculty;
            }

            var courseKey = NormalizeKey(courseCode);
            if (!courseIdByCode.ContainsKey(courseKey) && !pendingCourses.ContainsKey(courseKey))
            {
                var courseName = row.CourseName?.Trim() ?? string.Empty;
                if (courseName.Length == 0)
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseNameRequiredForAutoCreate);
                    continue;
                }

                var creditsText = row.Credits?.Trim() ?? string.Empty;
                var credits = 0;
                if (creditsText.Length > 0 && (!int.TryParse(creditsText, out credits) || credits < 0))
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseCreditsInvalid);
                    continue;
                }

                pendingCourses[courseKey] = new Course
                {
                    CourseCode = courseCode,
                    CourseName = courseName,
                    Credits = credits,
                    CourseType = null,
                    DepartmentId = departmentId,
                    FacultyId = facultyId
                };
            }

            var lecturerFullName = row.LecturerFullName?.Trim() ?? string.Empty;
            var lecturerEmail = row.LecturerEmail?.Trim() ?? string.Empty;
            if (lecturerEmail.Length > 0)
            {
                var emailKey = NormalizeKey(lecturerEmail);
                if (!lecturerIdByEmail.ContainsKey(emailKey) && !pendingLecturers.ContainsKey(emailKey))
                {
                    if (lecturerFullName.Length == 0)
                    {
                        itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.LecturerNameRequired);
                        continue;
                    }

                    pendingLecturers[emailKey] = new Lecturer
                    {
                        FullName = lecturerFullName,
                        Email = lecturerEmail,
                        DepartmentId = departmentId,
                        FacultyId = facultyId,
                        PositionId = defaultPositionId
                    };
                }
            }
        }

        // Tạo toàn bộ học phần mới trong 1 lượt lưu
        if (pendingCourses.Count > 0)
        {
            db.Courses.AddRange(pendingCourses.Values);
            await db.SaveChangesAsync(cancellationToken);
            foreach (var (codeKey, course) in pendingCourses)
            {
                courseIdByCode[codeKey] = course.CourseId;
                courseInfoById[course.CourseId] = (course.CourseName, course.Credits);
            }
            createdCourseCount = pendingCourses.Count;
        }

        // Tạo toàn bộ giảng viên mới & tài khoản người dùng theo mẻ (1 query + 1 save)
        if (pendingLecturers.Count > 0)
        {
            db.Lecturers.AddRange(pendingLecturers.Values);
            await db.SaveChangesAsync(cancellationToken);
            foreach (var (emailKey, lecturer) in pendingLecturers)
            {
                lecturerIdByEmail[emailKey] = lecturer.LecturerId;
            }
            await EnsureUsersForLecturersAsync(pendingLecturers.Values.ToList(), cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            createdLecturerCount = pendingLecturers.Count;
        }

        // PASS 2: Gắn và tạo danh sách lớp học phần
        foreach (var row in rows)
        {
            if (itemsByRow.ContainsKey(row.RowNumber))
            {
                continue;
            }

            var courseCode = row.CourseCode?.Trim() ?? string.Empty;
            var sectionName = row.SectionName?.Trim() ?? string.Empty;
            var classSizeText = row.ClassSize?.Trim() ?? string.Empty;
            int.TryParse(classSizeText, out var classSize);

            int? departmentId = null;
            var departmentCode = row.DepartmentCode?.Trim() ?? string.Empty;
            var departmentName = row.DepartmentName?.Trim() ?? string.Empty;
            if (departmentCode.Length > 0 && int.TryParse(departmentCode, out var parsedDepartmentId))
            {
                departmentId = parsedDepartmentId;
            }
            else if (departmentName.Length > 0 && departmentIdByName.TryGet(departmentName, out var foundDept))
            {
                departmentId = foundDept;
            }

            var facultyName = row.FacultyName?.Trim() ?? string.Empty;

            if (!courseIdByCode.TryGetValue(NormalizeKey(courseCode), out var courseId))
            {
                itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseNameRequiredForAutoCreate);
                continue;
            }

            int? lecturerId = null;
            string? unidentifiedLecturerName = null;
            var lecturerFullName = row.LecturerFullName?.Trim() ?? string.Empty;
            var lecturerEmail = row.LecturerEmail?.Trim() ?? string.Empty;

            if (lecturerEmail.Length > 0)
            {
                var emailKey = NormalizeKey(lecturerEmail);
                if (lecturerIdByEmail.TryGetValue(emailKey, out var foundLecturer))
                {
                    lecturerId = foundLecturer;
                }
            }
            else if (lecturerFullName.Length > 0)
            {
                unidentifiedLecturerName = lecturerFullName;
                var courseInfo = courseInfoById.TryGetValue(courseId, out var found)
                    ? found
                    : (CourseName: row.CourseName?.Trim() ?? string.Empty, Credits: 0);
                unidentifiedLecturers.Add(new UnidentifiedLecturerDto(
                    row.RowNumber,
                    lecturerFullName,
                    departmentId,
                    departmentId is { } deptId && departmentNameById.TryGetValue(deptId, out var deptName)
                        ? deptName
                        : NullIfBlank(departmentName),
                    NullIfBlank(facultyName),
                    courseCode,
                    sectionName,
                    courseInfo.CourseName,
                    courseInfo.Credits,
                    classSize));
            }

            var key = $"{courseId}|{NormalizeKey(sectionName)}";

            if (sectionByKey.TryGetValue(key, out var existingSection))
            {
                if (existingSection.LecturerId is null && lecturerId is not null)
                {
                    existingSection.LecturerId = lecturerId;
                    existingSection.UnidentifiedLecturerName = null;
                    updatedSectionCount++;
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, true, null);
                }
                else
                {
                    itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseSectionExists);
                }
                continue;
            }

            if (!seenInFile.Add(key))
            {
                itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, false, CatalogErrorCodes.CourseSectionDuplicateInFile);
                continue;
            }

            createdSections.Add(new CourseSection
            {
                CourseId = courseId,
                SemesterId = semesterId,
                LecturerId = lecturerId,
                UnidentifiedLecturerName = unidentifiedLecturerName,
                SectionName = sectionName,
                ClassSize = classSize
            });
            itemsByRow[row.RowNumber] = new CatalogImportItemDto(row.RowNumber, sectionName, courseCode, true, null);
        }

        if (createdSections.Count > 0)
        {
            db.CourseSections.AddRange(createdSections);
        }
        await db.SaveChangesAsync(cancellationToken);

        var items = rows
            .Select(r => itemsByRow.GetValueOrDefault(r.RowNumber, new CatalogImportItemDto(r.RowNumber, r.SectionName?.Trim() ?? string.Empty, r.CourseCode?.Trim(), false, null)))
            .ToList();

        var succeededCount = createdSections.Count + updatedSectionCount;
        return Succeeded(new CourseSectionImportDto(
            rows.Count,
            succeededCount,
            rows.Count - succeededCount,
            items,
            createdCourseCount,
            createdLecturerCount,
            updatedSectionCount,
            unidentifiedLecturers));
    }

    // ---------------------------------------------------------------- Lecturers

    /// <summary>
    /// Dựng lại danh sách giảng viên thiếu email từ chính dữ liệu, không phụ thuộc
    /// vào lần import nào. Trước đây danh sách này chỉ tồn tại trong trình duyệt của
    /// người import, đóng hộp thoại là mất — mà người đi xin email lại là trưởng bộ
    /// môn. Xem congviec2.md mục E2.
    /// </summary>
    public async Task<UnidentifiedLecturerReportDto> GetUnidentifiedLecturersAsync(
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        // Bị giới hạn theo bộ môn mà không biết bộ môn nào thì trả rỗng. Tuyệt đối
        // không rơi xuống nhánh không lọc bên dưới.
        //
        // Giảng viên cũng trả rỗng: đây là việc của trưởng bộ môn, không phải việc
        // của người dạy. Phải chặn riêng ở đây vì hàm này lọc theo BỘ MÔN chứ không
        // theo người, nên không tự hết như các danh sách khác. Xem congviec3.md H5.
        if (scope.SeesNothing || scope.SeesOnlyOwn)
        {
            return new UnidentifiedLecturerReportDto(0, 0, [], []);
        }

        var query =
            from section in db.CourseSections.AsNoTracking()
            join course in db.Courses.AsNoTracking() on section.CourseId equals course.CourseId
            where section.LecturerId == null
                  && section.UnidentifiedLecturerName != null
                  && section.UnidentifiedLecturerName != string.Empty
            select new
            {
                section.CourseSectionId,
                section.SemesterId,
                section.SectionName,
                section.ClassSize,
                LecturerName = section.UnidentifiedLecturerName!,
                course.CourseCode,
                course.CourseName,
                course.Credits,
                course.DepartmentId,
                course.FacultyId,
            };

        if (semesterId is { } filteredSemesterId)
        {
            query = query.Where(x => x.SemesterId == filteredSemesterId);
        }

        // Đơn vị của lớp đi theo học phần sở hữu, đúng như câu D-b đã chốt.
        if (scope.SeesWholeFaculty)
        {
            query = query.Where(x => x.FacultyId == scope.FacultyId);
        }
        else if (!scope.SeesEverything)
        {
            query = query.Where(x => x.DepartmentId == scope.DepartmentId);
        }

        var rows = await query
            .OrderBy(x => x.CourseCode)
            .ThenBy(x => x.SectionName)
            .ToListAsync(cancellationToken);

        var departmentNames = await db.Departments.AsNoTracking()
            .ToDictionaryAsync(x => x.DepartmentId, x => x.DepartmentName, cancellationToken);
        var facultyNames = await db.Faculties.AsNoTracking()
            .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);

        string? DepartmentNameOf(int? id) =>
            id is { } value && departmentNames.TryGetValue(value, out var name) ? name : null;
        string? FacultyNameOf(int? id) =>
            id is { } value && facultyNames.TryGetValue(value, out var name) ? name : null;

        var sections = rows
            .Select(x => new UnidentifiedSectionDto(
                x.CourseSectionId,
                x.LecturerName.Trim(),
                x.CourseCode,
                x.CourseName,
                x.SectionName,
                x.ClassSize,
                x.DepartmentId,
                DepartmentNameOf(x.DepartmentId),
                FacultyNameOf(x.FacultyId),
                x.Credits))
            .ToList();

        // Gom theo tên đã chuẩn hoá cộng bộ môn. Hai người trùng tên khác bộ môn thì
        // vẫn tách ra; trùng tên cùng bộ môn thì đành gộp, vì không có gì để phân biệt.
        var lecturers = sections
            .GroupBy(x => new { Key = NormalizeKey(x.LecturerName), x.DepartmentId })
            .Select(group => new UnidentifiedLecturerGroupDto(
                group.First().LecturerName,
                group.First().DepartmentName,
                group.Count(),
                group.Select(x => $"{x.CourseCode} / {x.SectionName}").ToList()))
            .OrderByDescending(x => x.SectionCount)
            .ThenBy(x => x.LecturerName)
            .ToList();

        return new UnidentifiedLecturerReportDto(
            sections.Count,
            lecturers.Count,
            sections,
            lecturers);
    }

    /// <summary>
    /// Bổ sung email cho giảng viên chưa xác định của một lớp, chạy lại đúng nhánh
    /// của <see cref="ImportCourseSectionsAsync"/> cho một dòng có email — chỉ khác
    /// là không đi qua tệp, và chỉ tác động lên đúng lớp được sửa.
    /// </summary>
    public async Task<CatalogOperationResult<ResolveUnidentifiedLecturerDto>> ResolveUnidentifiedLecturerAsync(
        int courseSectionId,
        ResolveUnidentifiedLecturerCommand command,
        CancellationToken cancellationToken = default)
    {
        var section = await db.CourseSections
            .FirstOrDefaultAsync(x => x.CourseSectionId == courseSectionId, cancellationToken);
        if (section is null)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.CourseSectionNotFound);
        }

        // Gác phạm vi trước mọi thứ khác, y như các hàm ghi còn lại: lớp thuộc bộ
        // môn nào là theo học phần sở hữu.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanResolveCourseSectionLecturer)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.OutOfScope);
        }
        var sectionDepartmentId = await DepartmentOfCourseAsync(section.CourseId, cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, sectionDepartmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(outOfScope);
        }

        // Nút này chỉ dành cho lớp còn treo. Lớp đã có mã giảng viên thì sửa bằng
        // hộp thoại sửa lớp bình thường, không đi đường này.
        if (section.LecturerId is not null)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.SectionLecturerAlreadySet);
        }

        var fullName = scope.SeesEverything
            ? command.FullName?.Trim() ?? string.Empty
            : section.UnidentifiedLecturerName?.Trim() ?? string.Empty;
        if (fullName.Length == 0)
        {
            // Tên đọc từ tệp là mặc định; bỏ trống hẳn thì không biết đang gắn cho ai.
            fullName = section.UnidentifiedLecturerName?.Trim() ?? string.Empty;
        }
        if (fullName.Length == 0)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.LecturerNameRequired);
        }

        var email = command.Email?.Trim() ?? string.Empty;
        if (email.Length == 0)
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.LecturerEmailRequired);
        }

        // Trưởng bộ môn chỉ được tạo người của bộ môn mình, giống CreateLecturerAsync.
        // Trưởng khoa/viện rộng hơn một bậc: bộ môn lấy theo học phần của lớp, miễn là
        // bộ môn đó nằm trong khoa của mình.
        var departmentId = command.DepartmentId;
        var facultyId = command.FacultyId;
        if (scope.SeesWholeFaculty)
        {
            if (scope.FacultyId is not { } ownFacultyId)
            {
                return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.OutOfScope);
            }
            departmentId = await db.Courses
                .Where(x => x.CourseId == section.CourseId)
                .Select(x => x.DepartmentId)
                .FirstOrDefaultAsync(cancellationToken);
            if (departmentId is { } courseDepartmentId
                && !await db.Departments.AnyAsync(
                    x => x.DepartmentId == courseDepartmentId && x.FacultyId == ownFacultyId,
                    cancellationToken))
            {
                return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.OutOfScope);
            }
            facultyId = ownFacultyId;
        }
        else if (!scope.SeesEverything)
        {
            if (scope.DepartmentId is not { } ownDepartmentId)
            {
                return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.OutOfScope);
            }
            departmentId = ownDepartmentId;
            facultyId = await db.Courses
                .Where(x => x.CourseId == section.CourseId)
                .Select(x => x.FacultyId)
                .FirstOrDefaultAsync(cancellationToken);
            facultyId ??= await db.Departments
                .Where(x => x.DepartmentId == ownDepartmentId)
                .Select(x => x.FacultyId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (departmentId is { } deptId
            && !await db.Departments.AnyAsync(x => x.DepartmentId == deptId, cancellationToken))
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.DepartmentNotFound);
        }
        if (facultyId is { } selectedFacultyId
            && !await FacultyExistsAsync(selectedFacultyId, cancellationToken))
        {
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.FacultyNotFound);
        }

        // Email là khoá định danh: đã có người mang email này thì gắn vào người đó,
        // không tạo trùng và cũng không ghi đè hồ sơ sẵn có — đúng như import.
        var normalizedEmail = NormalizeKey(email);
        var lecturer = await db.Lecturers
            .FirstOrDefaultAsync(x => x.Email.Trim().ToLower() == normalizedEmail, cancellationToken);
        var lecturerCreated = lecturer is null;

        if (lecturer is null)
        {
            var defaultPositionId = await db.Positions
                .Where(x => x.PositionName == CatalogDefaults.PositionName)
                .Select(x => (int?)x.PositionId)
                .FirstOrDefaultAsync(cancellationToken);

            lecturer = new Lecturer
            {
                FullName = fullName,
                Email = email,
                DepartmentId = departmentId,
                FacultyId = facultyId,
                PositionId = defaultPositionId
            };
            db.Lecturers.Add(lecturer);
            await db.SaveChangesAsync(cancellationToken);

            // Thêm giảng viên là tạo luôn tài khoản đăng nhập, một luật duy nhất
            // cho cả nhập tay, import lẫn đường này.
            await EnsureUserForLecturerAsync(lecturer, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }
        else if (!scope.SeesEverything
                 && (scope.SeesWholeFaculty
                     ? lecturer.FacultyId != scope.FacultyId
                     : lecturer.DepartmentId != departmentId))
        {
            // Trưởng bộ môn không được kéo người của bộ môn khác về lớp của mình;
            // trưởng khoa cũng vậy, nhưng ranh giới là khoa.
            return Failed<ResolveUnidentifiedLecturerDto>(CatalogErrorCodes.OutOfScope);
        }

        // Chỉ đúng lớp được sửa. Các lớp khác đang treo cùng một tên vẫn có thể là
        // người khác trùng tên, nên không gắn hộ — ai muốn làm cả loạt thì dùng
        // đường import lại tệp, ở đó mỗi dòng mang email của chính nó.
        section.LecturerId = lecturer.LecturerId;
        section.UnidentifiedLecturerName = null;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new ResolveUnidentifiedLecturerDto(ToDto(lecturer), lecturerCreated));
    }

    public async Task<IReadOnlyList<LecturerDto>> GetLecturersAsync(CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesNothing) return [];

        var query = db.Lecturers.AsQueryable();
        // Giảng viên không vào được trang Giảng viên, nhưng vẫn gọi được endpoint này
        // vì trang Lớp học phần cần nó để đọc tên người dạy. Mọi lớp của họ đều do
        // chính họ dạy nên chỉ cần đúng một bản ghi — trả cả bộ môn là lộ thừa 14 hồ
        // sơ kèm email cho một vai trò chỉ đọc.
        if (scope.SeesOnlyOwn)
        {
            query = query.Where(x => x.LecturerId == scope.LecturerId);
        }
        else if (scope.SeesWholeFaculty)
        {
            query = query.Where(x => x.FacultyId == scope.FacultyId);
        }
        else if (!scope.SeesEverything)
        {
            query = query.Where(x => x.DepartmentId == scope.DepartmentId);
        }

        return await query
            .OrderBy(x => x.FullName)
            .Select(x => new LecturerDto(
                x.LecturerId,
                x.FullName,
                x.DepartmentId,
                x.FacultyId,
                x.Email,
                x.PhoneNumber,
                x.PositionId))
            .ToListAsync(cancellationToken);
    }

    public async Task<CatalogOperationResult<LecturerDto>> CreateLecturerAsync(
        SaveLecturerCommand command,
        CancellationToken cancellationToken = default)
    {
        // Ép bộ môn về bộ môn của chính mình TRƯỚC khi validate, để validate chạy trên
        // đúng giá trị sẽ được lưu. Không ép thì trưởng bộ môn thêm được người vào bộ
        // môn khác, mà thêm xong lại không thấy để sửa.
        //
        // Trưởng khoa/viện chọn được bộ môn, nhưng phải là bộ môn trong khoa mình, và
        // khoa thì ép về khoa của mình.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckReadOnly(scope) is { } readOnly)
        {
            return Failed<LecturerDto>(readOnly);
        }
        if (scope.SeesWholeFaculty)
        {
            if (await CheckDepartmentInScopeAsync(scope, command.DepartmentId, cancellationToken)
                is { } facultyOutOfScope)
            {
                return Failed<LecturerDto>(facultyOutOfScope);
            }
            command = command with { FacultyId = scope.FacultyId };
        }
        else if (!scope.SeesEverything)
        {
            if (scope.DepartmentId is not { } ownDepartmentId)
            {
                return Failed<LecturerDto>(CatalogErrorCodes.OutOfScope);
            }
            command = command with { DepartmentId = ownDepartmentId };
        }

        var validation = await ValidateLecturerAsync(null, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<LecturerDto>(validation);
        }

        var lecturer = new Lecturer
        {
            FullName = command.FullName.Trim(),
            // Validate ở trên đã chặn email rỗng nên chỗ này chắc chắn có giá trị.
            Email = command.Email!.Trim(),
            PhoneNumber = NullIfBlank(command.PhoneNumber),
            DepartmentId = command.DepartmentId,
            FacultyId = command.FacultyId,
            PositionId = command.PositionId
        };
        db.Lecturers.Add(lecturer);
        await db.SaveChangesAsync(cancellationToken);

        // Lưu xong mới có LecturerId thật để gắn vào tài khoản.
        await EnsureUserForLecturerAsync(lecturer, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(lecturer));
    }

    public async Task<CatalogOperationResult<LecturerDto>> UpdateLecturerAsync(
        int lecturerId,
        SaveLecturerCommand command,
        CancellationToken cancellationToken = default)
    {
        var lecturer = await db.Lecturers.FirstOrDefaultAsync(x => x.LecturerId == lecturerId, cancellationToken);
        if (lecturer is null)
        {
            return Failed<LecturerDto>(CatalogErrorCodes.LecturerNotFound);
        }

        // Kiểm hai đầu: bản ghi đang sửa phải thuộc bộ môn mình, VÀ không được đổi
        // sang bộ môn khác. Thiếu vế thứ hai thì sửa một phát là đẩy người của mình
        // sang bộ môn khác, hoặc kéo người bộ môn khác về mình.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, lecturer.DepartmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<LecturerDto>(outOfScope);
        }
        // Trưởng khoa/viện được chuyển người giữa các bộ môn TRONG KHOA mình, nên vế
        // thứ hai của họ là "bộ môn đích cũng phải trong khoa" chứ không phải "y nguyên".
        if (scope.SeesWholeFaculty)
        {
            if (await CheckDepartmentInScopeAsync(scope, command.DepartmentId, cancellationToken)
                is { } targetOutOfScope)
            {
                return Failed<LecturerDto>(targetOutOfScope);
            }
            command = command with { FacultyId = scope.FacultyId };
        }
        else if (!scope.SeesEverything && command.DepartmentId != lecturer.DepartmentId)
        {
            return Failed<LecturerDto>(CatalogErrorCodes.OutOfScope);
        }

        var validation = await ValidateLecturerAsync(lecturerId, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<LecturerDto>(validation);
        }

        lecturer.FullName = command.FullName.Trim();
        lecturer.Email = command.Email!.Trim();
        lecturer.PhoneNumber = NullIfBlank(command.PhoneNumber);
        lecturer.DepartmentId = command.DepartmentId;
        lecturer.FacultyId = command.FacultyId;
        lecturer.PositionId = command.PositionId;

        // Bắt cả hai ca: giảng viên cũ chưa có tài khoản thì tạo bù, và đổi email
        // thì tài khoản chưa đăng nhập lần nào cũng đổi theo.
        await EnsureUserForLecturerAsync(lecturer, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(lecturer));
    }

    public async Task<CatalogOperationResult<bool>> DeleteLecturerAsync(
        int lecturerId,
        CancellationToken cancellationToken = default)
    {
        // Xoá giảng viên chỉ dành cho quản trị, đúng câu D-c. Trưởng bộ môn được thêm
        // và sửa nhưng không được xoá.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<bool>(adminOnly);
        }

        var lecturer = await db.Lecturers.FirstOrDefaultAsync(x => x.LecturerId == lecturerId, cancellationToken);
        if (lecturer is null)
        {
            return Failed<bool>(CatalogErrorCodes.LecturerNotFound);
        }

        if (await db.CourseSections.AnyAsync(x => x.LecturerId == lecturerId, cancellationToken))
        {
            return Failed<bool>(CatalogErrorCodes.LecturerInUse);
        }

        // Thứ tự ở đây có ý nghĩa. Phải khoá tài khoản, lưu, rồi GỠ nó khỏi change
        // tracker trước khi đánh dấu xoá giảng viên. Nếu bản ghi User còn nằm trong
        // tracker lúc Lecturer chuyển sang trạng thái xoá, EF sẽ tự set
        // Users.LecturerId = NULL và làm đứt liên kết vĩnh viễn — khôi phục giảng
        // viên xong sẽ còn lại một tài khoản mồ côi.
        var account = await db.Users
            .FirstOrDefaultAsync(x => x.LecturerId == lecturerId, cancellationToken);
        if (account is not null)
        {
            if (account.IsActive)
            {
                account.IsActive = false;
                account.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(cancellationToken);
            }
            db.Entry(account).State = EntityState.Detached;
        }

        db.Lecturers.Remove(lecturer);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CatalogImportDto>> ImportLecturersAsync(
        IReadOnlyList<ImportLecturerRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        // Cùng lý do với import lớp học phần: bộ môn của từng dòng lấy từ tệp nên
        // trưởng bộ môn có thể vô tình hoặc cố ý ghi sang bộ môn khác. Thêm từng
        // người một thì vẫn được, và chỗ đó đã ép bộ môn rồi.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<CatalogImportDto>(adminOnly);
        }

        var facultyIdByName = await LoadFacultyIdByNameAsync(cancellationToken);
        var departmentIdByName = await LoadDepartmentIdByNameAsync(cancellationToken);
        var positionIdByName = await LoadPositionIdByNameAsync(cancellationToken);
        var existingEmails = (await db.Lecturers.Select(x => x.Email).ToListAsync(cancellationToken))
            .Where(x => x != null)
            .Select(x => NormalizeKey(x!))
            .ToHashSet();
        var seenInFile = new HashSet<string>();
        var items = new List<CatalogImportItemDto>(rows.Count);
        var created = new List<Lecturer>();

        foreach (var row in rows)
        {
            var fullName = row.FullName?.Trim() ?? string.Empty;
            var email = row.Email?.Trim() ?? string.Empty;
            var facultyName = row.FacultyName?.Trim() ?? string.Empty;

            if (fullName.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.LecturerNameRequired));
                continue;
            }

            // Email là bắt buộc, cùng luật với thêm tay: không có email thì không
            // tạo được giảng viên, và cũng không có gì để tạo tài khoản đăng nhập.
            if (email.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.LecturerEmailRequired));
                continue;
            }

            var emailKey = NormalizeKey(email);
            if (existingEmails.Contains(emailKey))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.LecturerEmailExists));
                continue;
            }
            if (!seenInFile.Add(emailKey))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.LecturerEmailDuplicateInFile));
                continue;
            }

            int? facultyId = null;
            if (facultyName.Length > 0)
            {
                if (!facultyIdByName.TryGet(facultyName, out var foundFaculty))
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.FacultyNotFound));
                    continue;
                }
                facultyId = foundFaculty;
            }

            int? departmentId = null;
            var departmentName = row.DepartmentName?.Trim() ?? string.Empty;
            if (departmentName.Length > 0)
            {
                if (!departmentIdByName.TryGet(departmentName, out var foundDepartment))
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.DepartmentNotFound));
                    continue;
                }
                departmentId = foundDepartment;
            }

            // Cột chức vụ bỏ trống thì mặc định là "Giảng viên".
            var positionName = row.PositionName?.Trim() ?? string.Empty;
            if (positionName.Length == 0)
            {
                positionName = CatalogDefaults.PositionName;
            }
            if (!positionIdByName.TryGet(positionName, out var positionId))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, false, CatalogErrorCodes.PositionNotFound));
                continue;
            }

            created.Add(new Lecturer
            {
                FullName = fullName,
                Email = email,
                PhoneNumber = NullIfBlank(row.PhoneNumber),
                DepartmentId = departmentId,
                FacultyId = facultyId,
                PositionId = positionId
            });
            items.Add(new CatalogImportItemDto(row.RowNumber, fullName, facultyName, true, null));
        }

        if (created.Count > 0)
        {
            db.Lecturers.AddRange(created);
            await db.SaveChangesAsync(cancellationToken);

            // Lưu xong cả mẻ mới có LecturerId thật, giờ mới tạo tài khoản đi kèm trong 1 lần duy nhất.
            await EnsureUsersForLecturersAsync(created, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Succeeded(new CatalogImportDto(rows.Count, created.Count, rows.Count - created.Count, items));
    }

    // ------------------------------------------------------------------ Courses

    public async Task<IReadOnlyList<CourseDto>> GetCoursesAsync(CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesNothing) return [];

        var query = db.Courses.AsQueryable();
        // Giảng viên đi theo lớp mình dạy chứ không theo bộ môn — câu H-b đã chốt.
        // Nhờ vậy hai trang Học phần và Lớp học phần luôn khớp nhau: mọi học phần
        // hiện ở đây đều có ít nhất một lớp của mình ở trang bên cạnh, kể cả lớp dạy
        // chéo sang học phần của bộ môn khác. Xem congviec3.md mục H2.
        if (scope.SeesOnlyOwn)
        {
            query = query.Where(x => db.CourseSections
                .Any(section => section.CourseId == x.CourseId
                                && section.LecturerId == scope.LecturerId));
        }
        else if (scope.SeesWholeFaculty)
        {
            query = query.Where(x => x.FacultyId == scope.FacultyId);
        }
        else if (!scope.SeesEverything)
        {
            query = query.Where(x => x.DepartmentId == scope.DepartmentId);
        }

        return await query
            .OrderBy(x => x.CourseCode)
            .Select(x => new CourseDto(
                x.CourseId,
                x.CourseCode,
                x.CourseName,
                x.Credits,
                x.CourseType,
                x.DepartmentId,
                x.FacultyId,
                x.PrerequisiteCourseId))
            .ToListAsync(cancellationToken);
    }

    public async Task<CatalogOperationResult<CourseDto>> CreateCourseAsync(
        SaveCourseCommand command,
        CancellationToken cancellationToken = default)
    {
        // Cùng luật với giảng viên: ép bộ môn về bộ môn của mình trước khi validate;
        // trưởng khoa/viện chọn được bộ môn miễn là bộ môn đó thuộc khoa mình.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckReadOnly(scope) is { } readOnly)
        {
            return Failed<CourseDto>(readOnly);
        }
        if (scope.SeesWholeFaculty)
        {
            if (await CheckDepartmentInScopeAsync(scope, command.DepartmentId, cancellationToken)
                is { } facultyOutOfScope)
            {
                return Failed<CourseDto>(facultyOutOfScope);
            }
            command = command with { FacultyId = scope.FacultyId };
        }
        else if (!scope.SeesEverything)
        {
            if (scope.DepartmentId is not { } ownDepartmentId)
            {
                return Failed<CourseDto>(CatalogErrorCodes.OutOfScope);
            }
            command = command with { DepartmentId = ownDepartmentId };
        }

        var validation = await ValidateCourseAsync(null, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<CourseDto>(validation);
        }

        var course = new Course
        {
            CourseCode = command.CourseCode.Trim(),
            CourseName = command.CourseName.Trim(),
            Credits = command.Credits,
            CourseType = NormalizeCourseType(command.CourseType),
            DepartmentId = command.DepartmentId,
            FacultyId = command.FacultyId,
            PrerequisiteCourseId = command.PrerequisiteCourseId
        };
        db.Courses.Add(course);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(course));
    }

    public async Task<CatalogOperationResult<CourseDto>> UpdateCourseAsync(
        int courseId,
        SaveCourseCommand command,
        CancellationToken cancellationToken = default)
    {
        var course = await db.Courses.FirstOrDefaultAsync(x => x.CourseId == courseId, cancellationToken);
        if (course is null)
        {
            return Failed<CourseDto>(CatalogErrorCodes.CourseNotFound);
        }
        // Không cho học phần tự làm tiên quyết của chính nó.
        if (command.PrerequisiteCourseId == courseId)
        {
            return Failed<CourseDto>(CatalogErrorCodes.PrerequisiteNotFound);
        }

        // Kiểm hai đầu như khi sửa giảng viên: học phần đang sửa phải thuộc bộ môn
        // mình, và không được đổi sang bộ môn khác.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, course.DepartmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<CourseDto>(outOfScope);
        }
        // Trưởng khoa/viện chuyển được học phần giữa các bộ môn trong khoa mình.
        if (scope.SeesWholeFaculty)
        {
            if (await CheckDepartmentInScopeAsync(scope, command.DepartmentId, cancellationToken)
                is { } targetOutOfScope)
            {
                return Failed<CourseDto>(targetOutOfScope);
            }
            command = command with { FacultyId = scope.FacultyId };
        }
        else if (!scope.SeesEverything && command.DepartmentId != course.DepartmentId)
        {
            return Failed<CourseDto>(CatalogErrorCodes.OutOfScope);
        }

        var validation = await ValidateCourseAsync(courseId, command, cancellationToken);
        if (validation is not null)
        {
            return Failed<CourseDto>(validation);
        }

        course.CourseCode = command.CourseCode.Trim();
        course.CourseName = command.CourseName.Trim();
        course.Credits = command.Credits;
        course.CourseType = NormalizeCourseType(command.CourseType);
        course.DepartmentId = command.DepartmentId;
        course.FacultyId = command.FacultyId;
        course.PrerequisiteCourseId = command.PrerequisiteCourseId;
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(course));
    }

    public async Task<CatalogOperationResult<bool>> DeleteCourseAsync(
        int courseId,
        CancellationToken cancellationToken = default)
    {
        // Xoá học phần chỉ dành cho quản trị, cùng luật với xoá giảng viên ở câu D-c.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<bool>(adminOnly);
        }

        var course = await db.Courses.FirstOrDefaultAsync(x => x.CourseId == courseId, cancellationToken);
        if (course is null)
        {
            return Failed<bool>(CatalogErrorCodes.CourseNotFound);
        }

        if (await db.CourseSections.AnyAsync(x => x.CourseId == courseId, cancellationToken)
            || await db.Courses.AnyAsync(x => x.PrerequisiteCourseId == courseId, cancellationToken))
        {
            // Học phần khác đang dùng làm tiên quyết, hoặc đang có lớp học phần.
            return Failed<bool>(CatalogErrorCodes.CourseInUse);
        }

        db.Courses.Remove(course);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    public async Task<CatalogOperationResult<CatalogImportDto>> ImportCoursesAsync(
        IReadOnlyList<ImportCourseRowCommand> rows,
        CancellationToken cancellationToken = default)
    {
        // Cùng lý do với hai import kia: bộ môn của từng dòng lấy từ tệp. Import khoa,
        // bộ môn và ngành thì không cần gác ở đây vì tầng quyền module đã chặn —
        // trưởng bộ môn không có FACULTIES_ACCESS, DEPARTMENTS_ACCESS, MAJORS_ACCESS.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<CatalogImportDto>(adminOnly);
        }

        var facultyIdByName = await LoadFacultyIdByNameAsync(cancellationToken);
        var departmentIdByName = await LoadDepartmentIdByNameAsync(cancellationToken);
        var existingCodes = (await db.Courses.Select(x => x.CourseCode).ToListAsync(cancellationToken))
            .Select(NormalizeKey)
            .ToHashSet();
        var seenInFile = new HashSet<string>();
        var items = new List<CatalogImportItemDto>(rows.Count);
        var created = new List<Course>();

        foreach (var row in rows)
        {
            var code = row.CourseCode?.Trim() ?? string.Empty;
            var name = row.CourseName?.Trim() ?? string.Empty;
            var facultyName = row.FacultyName?.Trim() ?? string.Empty;

            if (code.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.CourseCodeRequired));
                continue;
            }
            if (name.Length == 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, code, facultyName, false, CatalogErrorCodes.CourseNameRequired));
                continue;
            }

            var codeKey = NormalizeKey(code);
            if (existingCodes.Contains(codeKey))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.CourseCodeExists));
                continue;
            }
            if (!seenInFile.Add(codeKey))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.CourseDuplicateInFile));
                continue;
            }

            if (!int.TryParse(row.Credits?.Trim(), out var credits) || credits < 0)
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.CourseCreditsInvalid));
                continue;
            }

            var courseType = NormalizeCourseType(row.CourseType);
            if (courseType is null && !string.IsNullOrWhiteSpace(row.CourseType))
            {
                items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.CourseTypeInvalid));
                continue;
            }

            int? facultyId = null;
            if (facultyName.Length > 0)
            {
                if (!facultyIdByName.TryGet(facultyName, out var foundFaculty))
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.FacultyNotFound));
                    continue;
                }
                facultyId = foundFaculty;
            }

            int? departmentId = null;
            var departmentName = row.DepartmentName?.Trim() ?? string.Empty;
            if (departmentName.Length > 0)
            {
                if (!departmentIdByName.TryGet(departmentName, out var foundDepartment))
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.DepartmentNotFound));
                    continue;
                }
                departmentId = foundDepartment;
            }

            // Học phần tiên quyết chỉ tra trong dữ liệu đã có, không tra sang dòng
            // khác trong cùng tệp vì những dòng đó chưa có id.
            int? prerequisiteId = null;
            var prerequisiteCode = row.PrerequisiteCourseCode?.Trim() ?? string.Empty;
            if (prerequisiteCode.Length > 0)
            {
                var prerequisite = await db.Courses
                    .Where(x => x.CourseCode.ToLower() == prerequisiteCode.ToLower())
                    .Select(x => (int?)x.CourseId)
                    .FirstOrDefaultAsync(cancellationToken);
                if (prerequisite is null)
                {
                    items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, false, CatalogErrorCodes.PrerequisiteNotFound));
                    continue;
                }
                prerequisiteId = prerequisite;
            }

            created.Add(new Course
            {
                CourseCode = code,
                CourseName = name,
                Credits = credits,
                CourseType = courseType,
                DepartmentId = departmentId,
                FacultyId = facultyId,
                PrerequisiteCourseId = prerequisiteId
            });
            items.Add(new CatalogImportItemDto(row.RowNumber, name, facultyName, true, null));
        }

        if (created.Count > 0)
        {
            db.Courses.AddRange(created);
            await db.SaveChangesAsync(cancellationToken);
        }

        return Succeeded(new CatalogImportDto(rows.Count, created.Count, rows.Count - created.Count, items));
    }

    // ------------------------------------------------------------------ Helpers

    private static string NormalizeKey(string value) => value.Trim().ToLowerInvariant();

    private static string NormalizeMajorCode(string? value)
    {
        var normalized = string.Concat((value ?? string.Empty).Normalize(NormalizationForm.FormKC)
                .Where(character => !char.IsWhiteSpace(character)))
            .Replace('_', '-')
            .Replace('.', '-')
            .ToUpperInvariant();
        return Regex.Replace(normalized, "-+", "-").Trim('-');
    }

    internal static string NormalizeImportAlias(string value)
    {
        var loose = NormalizeLooseKey(value);
        return string.Concat(loose.Where(char.IsLetterOrDigit));
    }

    private async Task<bool> MajorNameTakenAsync(
        string name,
        int facultyId,
        int? exceptMajorId,
        CancellationToken cancellationToken)
    {
        var normalized = NormalizeLooseKey(name);
        var existing = await db.Majors
            .Where(x => x.FacultyId == facultyId && (exceptMajorId == null || x.MajorId != exceptMajorId))
            .Select(x => x.MajorName)
            .ToListAsync(cancellationToken);
        return existing.Any(x => NormalizeLooseKey(x) == normalized);
    }

    private async Task<bool> MajorCodeTakenAsync(
        string code,
        int? exceptMajorId,
        CancellationToken cancellationToken)
    {
        var existing = await db.Majors
            .Where(x => exceptMajorId == null || x.MajorId != exceptMajorId)
            .Select(x => x.MajorCode)
            .ToListAsync(cancellationToken);
        return existing.Any(x => NormalizeMajorCode(x) == code);
    }

    /// <summary>
    /// Khoá tra cứu NỚI cho tên tiếng Việt: bỏ hết dấu thanh và đổi đ thành d.
    ///
    /// <para>
    /// Cùng một tên có thể được gõ ra hai chuỗi ký tự khác hẳn nhau:
    /// </para>
    /// <list type="bullet">
    /// <item>Đặt dấu theo kiểu cũ hay kiểu mới — "thuỷ" và "thủy", "hoà" và "hòa".</item>
    /// <item>Ký tự dựng sẵn hay ký tự ghép — "ủ" là một mã, hoặc "u" cộng dấu hỏi rời.</item>
    /// </list>
    /// <para>
    /// Người soạn tệp Excel dùng bộ gõ nào thì ra kiểu ấy, nên so chuỗi thẳng là trượt.
    /// Bỏ dấu đi thì cả hai kiểu về chung một khoá.
    /// </para>
    /// </summary>
    private static string NormalizeLooseKey(string value)
    {
        var decomposed = value.Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);

        foreach (var character in decomposed)
        {
            // Dấu thanh sau khi tách ra nằm ở nhóm NonSpacingMark.
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            // đ/Đ là chữ cái riêng, không tách ra dấu nên phải đổi tay.
            builder.Append(character switch
            {
                'đ' or 'Đ' => 'd',
                _ => character,
            });
        }

        return builder.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();
    }

    /// <summary>
    /// Bảng tra tên → mã của danh mục, chịu được khác biệt về dấu.
    ///
    /// <para>
    /// Tra đúng chuỗi trước; trượt thì mới tra theo khoá bỏ dấu. Chỉ nhận kết quả bỏ
    /// dấu khi nó trỏ tới DUY NHẤT một bản ghi — hai bộ môn khác nhau mà bỏ dấu ra
    /// giống nhau thì thà báo không tìm thấy còn hơn gán bừa vào một trong hai.
    /// </para>
    /// </summary>
    private sealed class NameLookup
    {
        private readonly Dictionary<string, int> exact = [];
        private readonly Dictionary<string, int> loose = [];
        private readonly HashSet<string> ambiguous = [];

        public void Add(string name, int id)
        {
            exact[NormalizeKey(name)] = id;

            var looseKey = NormalizeLooseKey(name);
            if (loose.TryGetValue(looseKey, out var existing) && existing != id)
            {
                ambiguous.Add(looseKey);
                return;
            }
            loose[looseKey] = id;
        }

        public bool TryGet(string name, out int id)
        {
            if (exact.TryGetValue(NormalizeKey(name), out id)) return true;

            var looseKey = NormalizeLooseKey(name);
            if (!ambiguous.Contains(looseKey) && loose.TryGetValue(looseKey, out id)) return true;

            id = 0;
            return false;
        }
    }

    // ------------------------------------------------------- Gác phạm vi khi ghi
    //
    // Lọc danh sách chỉ giấu dữ liệu đi, không chặn được gì: biết mã bản ghi là gọi
    // thẳng API sửa hay xoá được. Nên mọi endpoint ghi phải tự kiểm lại, không tin
    // vào chuyện nút đã bị ẩn trên giao diện.

    /// <summary>
    /// Vai trò chỉ đọc thì chặn mọi thao tác ghi. Gọi ở ĐẦU mọi hàm ghi, trước cả
    /// validate: kiểm sau validate thì người ngoài phạm vi dò được dữ liệu qua chính
    /// mã lỗi trả về. Xem congviec3.md mục H3.
    /// </summary>
    private static string? CheckReadOnly(UserScope scope) =>
        scope.IsReadOnly ? CatalogErrorCodes.OutOfScope : null;

    /// <summary>
    /// Bản ghi thuộc <paramref name="departmentId"/> có nằm trong phạm vi của người
    /// đang đăng nhập không. Trả về mã lỗi nếu không, null nếu được phép.
    /// <para>
    /// Trưởng khoa/viện phải tra CSDL để biết bộ môn đó có thuộc khoa mình không, nên
    /// hàm này là async chứ không còn thuần tính toán như trước.
    /// </para>
    /// </summary>
    private async Task<string?> CheckDepartmentInScopeAsync(
        UserScope scope,
        int? departmentId,
        CancellationToken cancellationToken)
    {
        // Chặn vai trò chỉ đọc ngay trong hàm này thay vì rải lời gọi ra từng endpoint:
        // giảng viên vẫn CÓ DepartmentId và Ban Giám hiệu thì thấy toàn trường, nên
        // thiếu dòng này chỉ cần quên một chỗ là họ ghi được. Gác một chỗ thì không quên.
        if (CheckReadOnly(scope) is { } readOnly) return readOnly;
        if (scope.SeesEverything) return null;

        if (scope.SeesWholeFaculty)
        {
            if (scope.FacultyId is not { } allowedFaculty) return CatalogErrorCodes.OutOfScope;
            if (departmentId is not { } target) return CatalogErrorCodes.OutOfScope;
            return await db.Departments.AnyAsync(
                x => x.DepartmentId == target && x.FacultyId == allowedFaculty,
                cancellationToken)
                ? null
                : CatalogErrorCodes.OutOfScope;
        }

        if (scope.DepartmentId is not { } allowed) return CatalogErrorCodes.OutOfScope;
        return departmentId == allowed ? null : CatalogErrorCodes.OutOfScope;
    }

    /// <summary>
    /// Hành động chỉ dành cho quản trị, ví dụ xoá giảng viên hay import theo tệp.
    /// Import bị chặn vì đơn vị của từng dòng lấy từ tệp, người nhập không kiểm soát
    /// được nên rất dễ ghi sang bộ môn khác.
    /// <para>
    /// Ban Giám hiệu tuy thấy toàn trường vẫn không qua được hàm này: đây là cổng ghi,
    /// mà vai trò đó chỉ đọc.
    /// </para>
    /// </summary>
    private static string? CheckAdminOnly(UserScope scope) =>
        scope.ManagesEverything ? null : CatalogErrorCodes.OutOfScope;

    /// <summary>Bộ môn sở hữu học phần của một lớp, dùng để quy phạm vi cho lớp.</summary>
    private Task<int?> DepartmentOfCourseAsync(int courseId, CancellationToken cancellationToken) =>
        db.Courses
            .Where(x => x.CourseId == courseId)
            .Select(x => x.DepartmentId)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Bảo đảm mỗi giảng viên có đúng một tài khoản đăng nhập và các hồ sơ làm việc
    /// tương ứng. Gọi SAU khi giảng viên đã được lưu, vì trước đó
    /// <c>LecturerId</c> vẫn là 0.
    /// <para>
    /// Mọi giảng viên có hồ sơ Giảng viên. Trưởng bộ môn có thêm hồ sơ Trưởng bộ môn,
    /// Phó Trưởng bộ môn có thêm hồ sơ Phó trưởng bộ môn; Trưởng khoa và Phó Trưởng khoa có thêm hồ sơ
    /// Trưởng khoa/viện. Hồ sơ Giảng viên là mặc định nếu tài khoản chưa có hồ sơ
    /// hoạt động nào.
    /// </para>
    /// Các truy vấn được gom theo cả mẻ để import không phát sinh một truy vấn tra cứu
    /// tài khoản hay hồ sơ cho từng dòng.
    /// </summary>
    private async Task EnsureUsersForLecturersAsync(
        IReadOnlyList<Lecturer> lecturers,
        CancellationToken cancellationToken)
    {
        var validLecturers = lecturers
            .Where(x => !string.IsNullOrWhiteSpace(x.Email))
            .ToList();
        if (validLecturers.Count == 0) return;

        var lecturerIds = validLecturers.Select(x => x.LecturerId).Distinct().ToList();
        var normalizedEmails = validLecturers
            .Select(x => x.Email!.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();

        // 1 query duy nhất để lấy toàn bộ tài khoản liên quan
        var existingUsers = await db.Users
            .Where(x => (x.LecturerId != null && lecturerIds.Contains(x.LecturerId.Value))
                     || normalizedEmails.Contains(x.Email.ToLower()))
            .ToListAsync(cancellationToken);

        var userByLecturerId = existingUsers
            .Where(x => x.LecturerId != null)
            .ToDictionary(x => x.LecturerId!.Value);
        var userByEmail = existingUsers
            .ToDictionary(x => x.Email.Trim().ToLowerInvariant(), x => x);

        var now = DateTime.UtcNow;
        var newUsers = new List<User>();

        foreach (var lecturer in validLecturers)
        {
            var email = lecturer.Email!.Trim();
            var normalizedEmail = email.ToLowerInvariant();

            if (userByLecturerId.TryGetValue(lecturer.LecturerId, out var linked))
            {
                if (linked.GoogleSubject is null
                    && !string.Equals(linked.Email, email, StringComparison.OrdinalIgnoreCase)
                    && !userByEmail.ContainsKey(normalizedEmail))
                {
                    userByEmail.Remove(linked.Email.Trim().ToLowerInvariant());
                    linked.Email = email;
                    linked.UpdatedAt = now;
                    userByEmail[normalizedEmail] = linked;
                }
                continue;
            }

            if (userByEmail.TryGetValue(normalizedEmail, out var existing))
            {
                if (existing.LecturerId is null)
                {
                    existing.LecturerId = lecturer.LecturerId;
                    existing.UpdatedAt = now;
                    userByLecturerId[lecturer.LecturerId] = existing;
                }
                continue;
            }

            var newUser = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                DisplayName = lecturer.FullName,
                GoogleSubject = null,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now,
                LecturerId = lecturer.LecturerId
            };
            newUsers.Add(newUser);
            userByEmail[normalizedEmail] = newUser;
            userByLecturerId[lecturer.LecturerId] = newUser;
        }

        if (newUsers.Count > 0)
        {
            db.Users.AddRange(newUsers);
        }

        await EnsureProfilesForLecturersAsync(validLecturers, userByLecturerId, cancellationToken);
    }

    private async Task EnsureProfilesForLecturersAsync(
        IReadOnlyList<Lecturer> lecturers,
        IReadOnlyDictionary<int, User> userByLecturerId,
        CancellationToken cancellationToken)
    {
        var users = lecturers
            .Where(x => userByLecturerId.ContainsKey(x.LecturerId))
            .Select(x => userByLecturerId[x.LecturerId])
            .DistinctBy(x => x.Id)
            .ToList();
        if (users.Count == 0) return;

        var roleCodes = new[]
        {
            RoleCodes.Lecturer,
            RoleCodes.DepartmentManager,
            RoleCodes.DeputyDepartmentManager,
            RoleCodes.FacultyManager
        };
        var rolesByCode = await db.Roles
            .Where(x => roleCodes.Contains(x.Code))
            .ToDictionaryAsync(x => x.Code, cancellationToken);
        var lecturerRole = rolesByCode[RoleCodes.Lecturer];
        var departmentManagerRole = rolesByCode[RoleCodes.DepartmentManager];
        var deputyDepartmentManagerRole = rolesByCode[RoleCodes.DeputyDepartmentManager];
        var facultyManagerRole = rolesByCode[RoleCodes.FacultyManager];

        var positions = await db.Positions
            .Select(x => new { x.PositionId, x.PositionName })
            .ToListAsync(cancellationToken);
        var departmentManagerPositionIds = positions
            .Where(x => IsDepartmentManagerPosition(x.PositionName))
            .Select(x => x.PositionId)
            .ToHashSet();
        var deputyDepartmentManagerPositionIds = positions
            .Where(x => IsDeputyDepartmentManagerPosition(x.PositionName))
            .Select(x => x.PositionId)
            .ToHashSet();
        var facultyManagerPositionIds = positions
            .Where(x => IsFacultyManagerPosition(x.PositionName))
            .Select(x => x.PositionId)
            .ToHashSet();

        var userIds = users.Select(x => x.Id).ToList();
        var existingProfiles = await db.UserProfiles
            .Where(x => userIds.Contains(x.UserId))
            .ToListAsync(cancellationToken);
        var profilesByRole = existingProfiles
            .GroupBy(x => (x.UserId, x.RoleId))
            .ToDictionary(x => x.Key, x => x.First());
        var usersWithActiveProfile = existingProfiles
            .Where(x => x.IsActive)
            .Select(x => x.UserId)
            .ToHashSet();
        var now = DateTime.UtcNow;

        foreach (var lecturer in lecturers)
        {
            if (!userByLecturerId.TryGetValue(lecturer.LecturerId, out var user)) continue;

            if (!profilesByRole.TryGetValue((user.Id, lecturerRole.Id), out var lecturerProfile))
            {
                var isDefault = !usersWithActiveProfile.Contains(user.Id);
                lecturerProfile = await AddAutomaticProfileAsync(
                    user,
                    lecturerRole,
                    isDefault,
                    now,
                    cancellationToken);
                profilesByRole[(user.Id, lecturerRole.Id)] = lecturerProfile;
                usersWithActiveProfile.Add(user.Id);
            }
            else if (!lecturerProfile.IsActive)
            {
                lecturerProfile.IsActive = true;
                lecturerProfile.UpdatedAt = now;
                usersWithActiveProfile.Add(user.Id);
            }

            var isDepartmentManager = lecturer.PositionId is { } positionId
                && departmentManagerPositionIds.Contains(positionId);
            var isDeputyDepartmentManager = lecturer.PositionId is { } deputyPositionId
                && deputyDepartmentManagerPositionIds.Contains(deputyPositionId);

            await ReconcileDepartmentLeadershipProfileAsync(
                user,
                lecturerProfile,
                isDepartmentManager ? departmentManagerRole
                    : isDeputyDepartmentManager ? deputyDepartmentManagerRole
                    : null,
                departmentManagerRole,
                deputyDepartmentManagerRole,
                profilesByRole,
                now,
                cancellationToken);

            if (lecturer.PositionId is not { } currentPositionId) continue;

            if (facultyManagerPositionIds.Contains(currentPositionId)
                && !profilesByRole.ContainsKey((user.Id, facultyManagerRole.Id)))
            {
                var facultyProfile = await AddAutomaticProfileAsync(
                    user,
                    facultyManagerRole,
                    isDefault: false,
                    now,
                    cancellationToken);
                profilesByRole[(user.Id, facultyManagerRole.Id)] = facultyProfile;
            }
        }
    }

    private async Task ReconcileDepartmentLeadershipProfileAsync(
        User user,
        UserProfile lecturerProfile,
        Role? desiredRole,
        Role departmentManagerRole,
        Role deputyDepartmentManagerRole,
        IDictionary<(Guid UserId, Guid RoleId), UserProfile> profilesByRole,
        DateTime now,
        CancellationToken cancellationToken)
    {
        profilesByRole.TryGetValue((user.Id, departmentManagerRole.Id), out var managerProfile);
        profilesByRole.TryGetValue((user.Id, deputyDepartmentManagerRole.Id), out var deputyProfile);

        if (desiredRole is null)
        {
            DeactivateAutomaticLeadershipProfile(managerProfile, lecturerProfile, now);
            DeactivateAutomaticLeadershipProfile(deputyProfile, lecturerProfile, now);
            return;
        }

        var desiredProfile = desiredRole.Id == departmentManagerRole.Id ? managerProfile : deputyProfile;
        var obsoleteProfile = desiredRole.Id == departmentManagerRole.Id ? deputyProfile : managerProfile;

        if (desiredProfile is null && obsoleteProfile is not null)
        {
            var oldKey = (user.Id, obsoleteProfile.RoleId);
            profilesByRole.Remove(oldKey);
            obsoleteProfile.RoleId = desiredRole.Id;
            obsoleteProfile.ProfileName = ProfileNaming.ByRoleCode[desiredRole.Code].Name;
            obsoleteProfile.ProfileCode = ReplaceProfileSuffix(
                obsoleteProfile.ProfileCode,
                ProfileNaming.ByRoleCode[desiredRole.Code].Suffix);
            obsoleteProfile.IsActive = true;
            obsoleteProfile.UpdatedAt = now;
            profilesByRole[(user.Id, desiredRole.Id)] = obsoleteProfile;
            return;
        }

        if (desiredProfile is null)
        {
            desiredProfile = await AddAutomaticProfileAsync(
                user,
                desiredRole,
                isDefault: false,
                now,
                cancellationToken);
            profilesByRole[(user.Id, desiredRole.Id)] = desiredProfile;
        }
        else if (!desiredProfile.IsActive)
        {
            desiredProfile.IsActive = true;
            desiredProfile.UpdatedAt = now;
        }

        if (obsoleteProfile?.IsDefault == true)
        {
            obsoleteProfile.IsDefault = false;
            desiredProfile.IsDefault = true;
        }
        DeactivateAutomaticLeadershipProfile(obsoleteProfile, lecturerProfile, now);
    }

    private static void DeactivateAutomaticLeadershipProfile(
        UserProfile? profile,
        UserProfile lecturerProfile,
        DateTime now)
    {
        if (profile is null || !profile.IsActive) return;
        if (profile.IsDefault)
        {
            profile.IsDefault = false;
            lecturerProfile.IsDefault = true;
        }
        profile.IsActive = false;
        profile.UpdatedAt = now;
    }

    private static string ReplaceProfileSuffix(string profileCode, string suffix) =>
        profileCode.Length >= 2 ? $"{profileCode[..^2]}{suffix}" : $"{profileCode}{suffix}";

    private async Task<UserProfile> AddAutomaticProfileAsync(
        User user,
        Role role,
        bool isDefault,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var naming = ProfileNaming.ByRoleCode[role.Code];
        var nextNumber = await db.Database
            .SqlQueryRaw<long>("SELECT nextval('\"UserProfileCodeSequence\"') AS \"Value\"")
            .SingleAsync(cancellationToken);

        var profile = new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            RoleId = role.Id,
            ProfileName = naming.Name,
            ProfileCode = ProfileNaming.CodeFor(nextNumber, naming.Suffix),
            IsActive = true,
            IsDefault = isDefault,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.UserProfiles.Add(profile);
        user.UpdatedAt = now;
        return profile;
    }

    private static bool IsDepartmentManagerPosition(string positionName) =>
        NormalizeLooseKey(positionName) is "truong bo mon";

    private static bool IsDeputyDepartmentManagerPosition(string positionName) =>
        NormalizeLooseKey(positionName) is "pho bo mon" or "pho truong bo mon";

    /// <summary>
    /// Trưởng khoa và Phó trưởng khoa đều nhận hồ sơ Trưởng khoa/viện, giống cách
    /// Trưởng và Phó khoa cùng nhận hồ sơ Trưởng khoa/viện.
    /// </summary>
    private static bool IsFacultyManagerPosition(string positionName) =>
        NormalizeLooseKey(positionName) is "truong khoa" or "pho khoa" or "pho truong khoa";

    private Task EnsureUserForLecturerAsync(
        Lecturer lecturer,
        CancellationToken cancellationToken) =>
        EnsureUsersForLecturersAsync([lecturer], cancellationToken);

    /// <summary>
    /// Khoá hoặc mở lại tài khoản theo trạng thái của giảng viên. Xoá giảng viên là
    /// xoá mềm nên tài khoản cũng chỉ tắt <c>IsActive</c> chứ không xoá đi.
    /// </summary>
    private async Task SetLecturerAccountActiveAsync(
        int lecturerId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        var linked = await db.Users
            .FirstOrDefaultAsync(x => x.LecturerId == lecturerId, cancellationToken);
        if (linked is null || linked.IsActive == isActive) return;

        linked.IsActive = isActive;
        linked.UpdatedAt = DateTime.UtcNow;
    }

    private static SemesterDto ToDto(Semester semester) =>
        new(semester.SemesterId, semester.SemesterName, semester.AcademicYearId);

    private static CourseSectionDto ToDto(CourseSection section, Lecturer? lecturer = null) =>
        new(
            section.CourseSectionId,
            section.CourseId,
            section.SemesterId,
            section.LecturerId,
            section.SectionName,
            section.ClassSize,
            section.UnidentifiedLecturerName,
            lecturer?.FullName,
            lecturer?.Email);

    private async Task<string?> ValidateAcademicYearAsync(
        int? academicYearId,
        SaveAcademicYearCommand command,
        CancellationToken cancellationToken)
    {
        var name = command.AcademicYearName?.Trim() ?? string.Empty;
        if (name.Length == 0) return CatalogErrorCodes.AcademicYearNameRequired;
        if (!IsAcademicYearNameWellFormed(name)) return CatalogErrorCodes.AcademicYearNameInvalid;

        if (command.StartDate is null) return CatalogErrorCodes.AcademicYearStartDateRequired;

        var normalized = NormalizeKey(name);
        var exists = await db.AcademicYears
            .Where(x => academicYearId == null || x.AcademicYearId != academicYearId)
            .AnyAsync(x => x.AcademicYearName.Trim().ToLower() == normalized, cancellationToken);
        return exists ? CatalogErrorCodes.AcademicYearNameExists : null;
    }

    /// <summary>
    /// Tên năm học phải đúng khuôn "n-(n+1)", ví dụ 2025-2026. Giao diện đã cho chọn
    /// sẵn nên chỉ còn API là đường vào, nhưng "2025-2027" hay "nam hoc 2025" lọt vào
    /// đây là hỏng cả thứ tự sắp xếp lẫn cách người dùng đọc cây năm học.
    /// </summary>
    private static bool IsAcademicYearNameWellFormed(string name)
    {
        var match = AcademicYearNameRegex().Match(name);
        return match.Success
            && int.Parse(match.Groups[2].Value) == int.Parse(match.Groups[1].Value) + 1;
    }

    [GeneratedRegex(@"^(\d{4})-(\d{4})$")]
    private static partial Regex AcademicYearNameRegex();

    private async Task<string?> ValidateSemesterAsync(
        int? semesterId,
        SaveSemesterCommand command,
        CancellationToken cancellationToken)
    {
        var name = command.SemesterName?.Trim() ?? string.Empty;
        if (name.Length == 0) return CatalogErrorCodes.SemesterNameRequired;
        if (!await db.AcademicYears.AnyAsync(x => x.AcademicYearId == command.AcademicYearId, cancellationToken))
        {
            return CatalogErrorCodes.AcademicYearNotFound;
        }

        var normalized = NormalizeKey(name);
        var exists = await db.Semesters
            .Where(x => x.AcademicYearId == command.AcademicYearId)
            .Where(x => semesterId == null || x.SemesterId != semesterId)
            .AnyAsync(x => x.SemesterName.Trim().ToLower() == normalized, cancellationToken);
        return exists ? CatalogErrorCodes.SemesterNameExists : null;
    }

    private async Task<string?> ValidateCourseSectionAsync(
        int? courseSectionId,
        SaveCourseSectionCommand command,
        CancellationToken cancellationToken)
    {
        var name = command.SectionName?.Trim() ?? string.Empty;
        if (name.Length == 0) return CatalogErrorCodes.CourseSectionNameRequired;
        if (command.ClassSize < 0) return CatalogErrorCodes.CourseSectionSizeInvalid;
        if (!await db.Courses.AnyAsync(x => x.CourseId == command.CourseId, cancellationToken))
        {
            return CatalogErrorCodes.CourseNotFound;
        }
        if (!await db.Semesters.AnyAsync(x => x.SemesterId == command.SemesterId, cancellationToken))
        {
            return CatalogErrorCodes.SemesterNotFound;
        }
        // Chỉ kiểm khi có mã. Để trống giảng viên là hợp lệ — đó chính là trạng thái
        // của lớp import từ tệp thiếu email. So sánh thẳng với null thì EF dịch ra
        // "LecturerId" = NULL, không bao giờ đúng, nên lưu lớp chưa xác định là dính
        // CATALOG_LECTURER_NOT_FOUND.
        if (command.LecturerId is { } lecturerId
            && !await db.Lecturers.AnyAsync(x => x.LecturerId == lecturerId, cancellationToken))
        {
            return CatalogErrorCodes.LecturerNotFound;
        }

        var normalized = NormalizeKey(name);
        var exists = await db.CourseSections
            .Where(x => x.CourseId == command.CourseId && x.SemesterId == command.SemesterId)
            .Where(x => courseSectionId == null || x.CourseSectionId != courseSectionId)
            .AnyAsync(x => x.SectionName.Trim().ToLower() == normalized, cancellationToken);
        return exists ? CatalogErrorCodes.CourseSectionExists : null;
    }

    private static string? NullIfBlank(string? value)
    {
        var text = value?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    private static LecturerDto ToDto(Lecturer lecturer) => new(
        lecturer.LecturerId,
        lecturer.FullName,
        lecturer.DepartmentId,
        lecturer.FacultyId,
        lecturer.Email,
        lecturer.PhoneNumber,
        lecturer.PositionId);

    private async Task<string?> ValidateLecturerAsync(
        int? lecturerId,
        SaveLecturerCommand command,
        CancellationToken cancellationToken)
    {
        var fullName = command.FullName?.Trim() ?? string.Empty;
        var email = command.Email?.Trim() ?? string.Empty;

        if (fullName.Length == 0) return CatalogErrorCodes.LecturerNameRequired;

        // Email là bắt buộc. Cột "Lecturers"."Email" vừa NOT NULL vừa UNIQUE nên bỏ
        // trống là không lưu được: NULL vướng NOT NULL, còn chuỗi rỗng thì người thứ
        // hai đụng UNIQUE. Đây cũng là điều kiện để tạo tài khoản đăng nhập đi kèm.
        if (email.Length == 0) return CatalogErrorCodes.LecturerEmailRequired;

        var normalizedEmail = NormalizeKey(email);
        var exists = await db.Lecturers
            .Where(x => lecturerId == null || x.LecturerId != lecturerId)
            .AnyAsync(x => x.Email.Trim().ToLower() == normalizedEmail, cancellationToken);
        if (exists)
        {
            return CatalogErrorCodes.LecturerEmailExists;
        }

        if (command.FacultyId is { } facultyId && !await FacultyExistsAsync(facultyId, cancellationToken))
        {
            return CatalogErrorCodes.FacultyNotFound;
        }
        if (command.DepartmentId is { } departmentId
            && !await db.Departments.AnyAsync(x => x.DepartmentId == departmentId, cancellationToken))
        {
            return CatalogErrorCodes.DepartmentNotFound;
        }
        if (command.PositionId is { } positionId
            && !await db.Positions.AnyAsync(x => x.PositionId == positionId, cancellationToken))
        {
            return CatalogErrorCodes.PositionNotFound;
        }

        return null;
    }

    private async Task<NameLookup> LoadPositionIdByNameAsync(CancellationToken cancellationToken)
    {
        var positions = await db.Positions
            .Select(x => new { x.PositionId, x.PositionName })
            .ToListAsync(cancellationToken);

        var map = new NameLookup();
        foreach (var position in positions)
        {
            map.Add(position.PositionName, position.PositionId);
        }
        return map;
    }

    private async Task<NameLookup> LoadDepartmentIdByNameAsync(CancellationToken cancellationToken)
    {
        var departments = await db.Departments
            .Select(x => new { x.DepartmentId, x.DepartmentName })
            .ToListAsync(cancellationToken);

        var map = new NameLookup();
        foreach (var department in departments)
        {
            map.Add(department.DepartmentName, department.DepartmentId);
        }
        return map;
    }

    private static CourseDto ToDto(Course course) => new(
        course.CourseId,
        course.CourseCode,
        course.CourseName,
        course.Credits,
        course.CourseType,
        course.DepartmentId,
        course.FacultyId,
        course.PrerequisiteCourseId);

    /// <summary>
    /// Chấp nhận cả tiếng Anh lẫn tiếng Việt, trả về giá trị lưu xuống cột.
    /// Trả null khi bỏ trống hoặc không nhận ra giá trị.
    /// </summary>
    private static string? NormalizeCourseType(string? value)
    {
        var text = value?.Trim() ?? string.Empty;
        if (text.Length == 0) return null;

        return NormalizeKey(text) switch
        {
            "required" or "bat buoc" or "bắt buộc" => "Required",
            "elective" or "tu chon" or "tự chọn" => "Elective",
            _ => null
        };
    }

    private async Task<string?> ValidateCourseAsync(
        int? courseId,
        SaveCourseCommand command,
        CancellationToken cancellationToken)
    {
        var code = command.CourseCode?.Trim() ?? string.Empty;
        var name = command.CourseName?.Trim() ?? string.Empty;

        if (code.Length == 0) return CatalogErrorCodes.CourseCodeRequired;
        if (name.Length == 0) return CatalogErrorCodes.CourseNameRequired;
        if (command.Credits < 0) return CatalogErrorCodes.CourseCreditsInvalid;

        var normalizedCode = NormalizeKey(code);
        var exists = await db.Courses
            .Where(x => courseId == null || x.CourseId != courseId)
            .AnyAsync(x => x.CourseCode.Trim().ToLower() == normalizedCode, cancellationToken);
        if (exists)
        {
            return CatalogErrorCodes.CourseCodeExists;
        }

        if (command.FacultyId is { } facultyId && !await FacultyExistsAsync(facultyId, cancellationToken))
        {
            return CatalogErrorCodes.FacultyNotFound;
        }
        if (command.DepartmentId is { } departmentId
            && !await db.Departments.AnyAsync(x => x.DepartmentId == departmentId, cancellationToken))
        {
            return CatalogErrorCodes.DepartmentNotFound;
        }
        if (command.PrerequisiteCourseId is { } prerequisiteId
            && !await db.Courses.AnyAsync(x => x.CourseId == prerequisiteId, cancellationToken))
        {
            return CatalogErrorCodes.PrerequisiteNotFound;
        }

        return null;
    }

    private static CatalogOperationResult<T> Succeeded<T>(T value) => new(true, null, value);

    private static CatalogOperationResult<T> Failed<T>(string errorCode) => new(false, errorCode, default);

    // --------------------------------------------------------------- Restore

    public async Task<CatalogOperationResult<FacultyDto>> RestoreFacultyAsync(
        int facultyId,
        CancellationToken cancellationToken = default)
    {
        var faculty = await db.Faculties.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.FacultyId == facultyId && x.IsDeleted, cancellationToken);
        if (faculty is null) return Failed<FacultyDto>(CatalogErrorCodes.FacultyNotFound);
        faculty.IsDeleted = false;
        faculty.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(new FacultyDto(faculty.FacultyId, faculty.FacultyName));
    }

    public async Task<CatalogOperationResult<DepartmentDto>> RestoreDepartmentAsync(
        int departmentId,
        CancellationToken cancellationToken = default)
    {
        var department = await db.Departments.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.DepartmentId == departmentId && x.IsDeleted, cancellationToken);
        if (department is null) return Failed<DepartmentDto>(CatalogErrorCodes.DepartmentNotFound);
        department.IsDeleted = false;
        department.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(new DepartmentDto(department.DepartmentId, department.DepartmentName, department.FacultyId));
    }

    public async Task<CatalogOperationResult<MajorDto>> RestoreMajorAsync(
        int majorId,
        CancellationToken cancellationToken = default)
    {
        var major = await db.Majors.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.MajorId == majorId && x.IsDeleted, cancellationToken);
        if (major is null) return Failed<MajorDto>(CatalogErrorCodes.MajorNotFound);
        major.IsDeleted = false;
        major.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(new MajorDto(major.MajorId, major.MajorCode, major.MajorName, major.FacultyId));
    }

    public async Task<CatalogOperationResult<AcademicYearDto>> RestoreAcademicYearAsync(
        int academicYearId,
        CancellationToken cancellationToken = default)
    {
        // Khôi phục đi cùng cặp với xoá: xoá chỉ dành cho quản trị thì khôi phục cũng vậy.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<AcademicYearDto>(adminOnly);
        }

        var year = await db.AcademicYears.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.AcademicYearId == academicYearId && x.IsDeleted, cancellationToken);
        if (year is null) return Failed<AcademicYearDto>(CatalogErrorCodes.AcademicYearNotFound);
        year.IsDeleted = false;
        year.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        var semesters = await db.Semesters.IgnoreQueryFilters()
            .Where(x => x.AcademicYearId == academicYearId)
            .OrderBy(x => x.SemesterId)
            .ToListAsync(cancellationToken);
        return Succeeded(new AcademicYearDto(
            year.AcademicYearId, year.AcademicYearName,
            year.StartDate, year.EndDate,
            semesters.Select(ToDto).ToList()));
    }

    public async Task<CatalogOperationResult<SemesterDto>> RestoreSemesterAsync(
        int semesterId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<SemesterDto>(adminOnly);
        }

        var semester = await db.Semesters.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.SemesterId == semesterId && x.IsDeleted, cancellationToken);
        if (semester is null) return Failed<SemesterDto>(CatalogErrorCodes.SemesterNotFound);
        semester.IsDeleted = false;
        semester.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(ToDto(semester));
    }

    public async Task<CatalogOperationResult<CourseSectionDto>> RestoreCourseSectionAsync(
        int courseSectionId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanManageCourseSections)
        {
            return Failed<CourseSectionDto>(CatalogErrorCodes.OutOfScope);
        }

        var section = await db.CourseSections.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.CourseSectionId == courseSectionId && x.IsDeleted, cancellationToken);
        if (section is null) return Failed<CourseSectionDto>(CatalogErrorCodes.CourseSectionNotFound);

        // Khôi phục đi cùng cặp với xoá và cũng chỉ dành cho quản trị.
        var departmentId = await DepartmentOfCourseAsync(section.CourseId, cancellationToken);
        if (await CheckDepartmentInScopeAsync(scope, departmentId, cancellationToken) is { } outOfScope)
        {
            return Failed<CourseSectionDto>(outOfScope);
        }

        section.IsDeleted = false;
        section.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(ToDto(section));
    }

    public async Task<CatalogOperationResult<LecturerDto>> RestoreLecturerAsync(
        int lecturerId,
        CancellationToken cancellationToken = default)
    {
        // Khôi phục đi cùng cặp với xoá, mà xoá chỉ dành cho quản trị.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<LecturerDto>(adminOnly);
        }

        var lecturer = await db.Lecturers.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.LecturerId == lecturerId && x.IsDeleted, cancellationToken);
        if (lecturer is null) return Failed<LecturerDto>(CatalogErrorCodes.LecturerNotFound);
        lecturer.IsDeleted = false;
        lecturer.DeletedAt = null;
        // Khôi phục giảng viên thì mở lại tài khoản, và tạo bù nếu chưa từng có.
        await SetLecturerAccountActiveAsync(lecturerId, isActive: true, cancellationToken);
        await EnsureUserForLecturerAsync(lecturer, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(ToDto(lecturer));
    }

    public async Task<CatalogOperationResult<CourseDto>> RestoreCourseAsync(
        int courseId,
        CancellationToken cancellationToken = default)
    {
        // Khôi phục đi cùng cặp với xoá, mà xoá học phần chỉ dành cho quản trị.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (CheckAdminOnly(scope) is { } adminOnly)
        {
            return Failed<CourseDto>(adminOnly);
        }

        var course = await db.Courses.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.CourseId == courseId && x.IsDeleted, cancellationToken);
        if (course is null) return Failed<CourseDto>(CatalogErrorCodes.CourseNotFound);
        course.IsDeleted = false;
        course.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(ToDto(course));
    }

    private Task<bool> FacultyExistsAsync(int facultyId, CancellationToken cancellationToken) =>
        db.Faculties.AnyAsync(x => x.FacultyId == facultyId, cancellationToken);

    private async Task<bool> FacultyNameTakenAsync(string name, int? exceptFacultyId, CancellationToken cancellationToken)
    {
        // Xem ghi chú ở PositionNameTakenAsync: so bằng khoá bỏ dấu.
        var normalized = NormalizeLooseKey(name);
        var existing = await db.Faculties
            .Where(x => exceptFacultyId == null || x.FacultyId != exceptFacultyId)
            .Select(x => x.FacultyName)
            .ToListAsync(cancellationToken);
        return existing.Any(x => NormalizeLooseKey(x) == normalized);
    }

    private async Task<NameLookup> LoadFacultyIdByNameAsync(CancellationToken cancellationToken)
    {
        var faculties = await db.Faculties
            .Select(x => new { x.FacultyId, x.FacultyName })
            .ToListAsync(cancellationToken);

        var map = new NameLookup();
        foreach (var faculty in faculties)
        {
            map.Add(faculty.FacultyName, faculty.FacultyId);
        }
        return map;
    }
}
