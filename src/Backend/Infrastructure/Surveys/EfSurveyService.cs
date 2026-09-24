using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Infrastructure.Reports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Infrastructure.Surveys;

public sealed class EfSurveyService(
    AppDbContext db,
    IMemoryCache cache,
    IUserScopeResolver userScope,
    IScoringThresholdProvider scoringThresholds,
    ISurveyPublicationService publication,
    SchoolOverviewCacheVersion schoolOverviewCache) : ISurveyService
{
    private const int MaximumScaleOptions = 5;
    private const int MaximumCommentLength = 1000;

    // ------------------------------------------------------------ Answer scales

    public async Task<IReadOnlyList<AnswerScaleDto>> GetAnswerScalesAsync(
        CancellationToken cancellationToken = default)
    {
        var scales = await db.AnswerScales
            .OrderBy(x => x.AnswerScaleName)
            .ToListAsync(cancellationToken);
        var options = await db.AnswerScaleOptions
            .OrderBy(x => x.Value)
            .ToListAsync(cancellationToken);

        return scales
            .Select(scale => ToDto(
                scale,
                options.Where(option => option.AnswerScaleId == scale.AnswerScaleId).ToList()))
            .ToList();
    }

    public async Task<SurveyOperationResult<AnswerScaleDto>> CreateAnswerScaleAsync(
        SaveAnswerScaleCommand command,
        CancellationToken cancellationToken = default)
    {
        var validation = await ValidateAnswerScaleAsync(command, null, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failed<AnswerScaleDto>(validation.ErrorCode);
        }

        var scale = new AnswerScale
        {
            AnswerScaleName = validation.Name,
            ScaleKind = validation.ScaleKind,
        };
        db.AnswerScales.Add(scale);
        await db.SaveChangesAsync(cancellationToken);

        var options = validation.Options
            .Select(option => new AnswerScaleOption
            {
                AnswerScaleId = scale.AnswerScaleId,
                Value = option.Value,
                DisplayText = option.DisplayText,
            })
            .ToList();
        db.AnswerScaleOptions.AddRange(options);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(scale, options));
    }

    public async Task<SurveyOperationResult<AnswerScaleDto>> UpdateAnswerScaleAsync(
        int answerScaleId,
        SaveAnswerScaleCommand command,
        CancellationToken cancellationToken = default)
    {
        var scale = await db.AnswerScales
            .FirstOrDefaultAsync(x => x.AnswerScaleId == answerScaleId, cancellationToken);
        if (scale is null)
        {
            return Failed<AnswerScaleDto>(SurveyErrorCodes.AnswerScaleNotFound);
        }

        var validation = await ValidateAnswerScaleAsync(command, answerScaleId, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failed<AnswerScaleDto>(validation.ErrorCode);
        }

        // Đổi loại thang khi đã có câu hỏi dùng nó sẽ làm các phiếu đã thu không đọc
        // lại được (số đang lưu bỗng bị hiểu thành chữ và ngược lại).
        if (scale.ScaleKind != validation.ScaleKind
            && await db.SurveyQuestions.AnyAsync(x => x.AnswerScaleId == answerScaleId, cancellationToken))
        {
            return Failed<AnswerScaleDto>(SurveyErrorCodes.AnswerScaleKindLocked);
        }

        scale.AnswerScaleName = validation.Name;
        scale.ScaleKind = validation.ScaleKind;

        // Ghi đè các mức: giữ lại dòng cùng Value để không phá "SurveyResponseAnswers".
        var existing = await db.AnswerScaleOptions
            .Where(x => x.AnswerScaleId == answerScaleId)
            .ToListAsync(cancellationToken);

        foreach (var option in validation.Options)
        {
            var current = existing.FirstOrDefault(x => x.Value == option.Value);
            if (current is null)
            {
                db.AnswerScaleOptions.Add(new AnswerScaleOption
                {
                    AnswerScaleId = answerScaleId,
                    Value = option.Value,
                    DisplayText = option.DisplayText,
                });
            }
            else
            {
                current.DisplayText = option.DisplayText;
            }
        }

        var keptValues = validation.Options.Select(x => x.Value).ToHashSet();
        db.AnswerScaleOptions.RemoveRange(existing.Where(x => !keptValues.Contains(x.Value)));

        await db.SaveChangesAsync(cancellationToken);

        var options = await db.AnswerScaleOptions
            .Where(x => x.AnswerScaleId == answerScaleId)
            .OrderBy(x => x.Value)
            .ToListAsync(cancellationToken);

        return Succeeded(ToDto(scale, options));
    }

    public async Task<SurveyOperationResult<bool>> DeleteAnswerScaleAsync(
        int answerScaleId,
        CancellationToken cancellationToken = default)
    {
        var scale = await db.AnswerScales
            .FirstOrDefaultAsync(x => x.AnswerScaleId == answerScaleId, cancellationToken);
        if (scale is null)
        {
            return Failed<bool>(SurveyErrorCodes.AnswerScaleNotFound);
        }

        // "SurveyQuestions"."AnswerScaleId" là ON DELETE RESTRICT.
        if (await db.SurveyQuestions.AnyAsync(x => x.AnswerScaleId == answerScaleId, cancellationToken))
        {
            return Failed<bool>(SurveyErrorCodes.AnswerScaleInUse);
        }

        db.AnswerScales.Remove(scale);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    // --------------------------------------------------------- Survey templates

    public async Task<IReadOnlyList<SurveyTemplateDto>> GetSurveyTemplatesAsync(
        CancellationToken cancellationToken = default)
    {
        var templates = await db.SurveyTemplates
            .OrderByDescending(x => x.SurveyTemplateId)
            .ToListAsync(cancellationToken);
        var sections = await db.SurveyQuestionSections
            .ToListAsync(cancellationToken);
        var questions = await db.SurveyQuestions
            .OrderBy(x => x.QuestionId)
            .ToListAsync(cancellationToken);

        // Nhìn cả phiếu đã huỷ: câu trả lời của phiếu xoá mềm vẫn nằm nguyên trong
        // bảng, nên câu hỏi của nó vẫn không được phép dịch chỗ.
        var answeredQuestionIds = (await db.SurveyResponseAnswers
                .IgnoreQueryFilters()
                .Select(x => x.QuestionId)
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToHashSet();

        // Câu không trỏ thẳng vào bộ nữa nên gom theo bộ phải đi qua mục.
        var templateIdBySection = sections.ToDictionary(x => x.SectionId, x => x.SurveyTemplateId);

        return templates
            .Select(template =>
            {
                var ownQuestions = questions
                    .Where(q => templateIdBySection.TryGetValue(q.SectionId, out var templateId)
                        && templateId == template.SurveyTemplateId)
                    .ToList();

                return ToDto(
                    template,
                    sections.Where(x => x.SurveyTemplateId == template.SurveyTemplateId).ToList(),
                    ownQuestions,
                    ownQuestions.Any(q => answeredQuestionIds.Contains(q.QuestionId)));
            })
            .ToList();
    }

    public async Task<SurveyOperationResult<SurveyTemplateDto>> CreateSurveyTemplateAsync(
        SaveSurveyTemplateCommand command,
        CancellationToken cancellationToken = default)
    {
        var validation = await ValidateTemplateAsync(command, null, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failed<SurveyTemplateDto>(validation.ErrorCode);
        }

        var template = new SurveyTemplate
        {
            TemplateName = validation.Name,
            CreatedAt = DateTime.UtcNow,
        };
        db.SurveyTemplates.Add(template);
        await db.SaveChangesAsync(cancellationToken);

        // Mục phải có "SectionId" thật trước đã, vì câu hỏi trỏ vào nó bằng khoá
        // ngoại mà quan hệ ở đây khai bằng HasForeignKey chứ không có navigation
        // để EF tự nối Id sau khi lưu.
        var sections = validation.Sections
            .Select(section => new SurveyQuestionSection
            {
                SurveyTemplateId = template.SurveyTemplateId,
                SectionName = section.SectionName,
            })
            .ToList();
        db.SurveyQuestionSections.AddRange(sections);
        await db.SaveChangesAsync(cancellationToken);

        var questions = validation.Questions
            .Select(question => new SurveyQuestion
            {
                SectionId = sections[question.SectionIndex].SectionId,
                QuestionText = question.QuestionText,
                AnswerScaleId = question.AnswerScaleId,
                AttentionCheckValue = question.AttentionCheckValue,
            })
            .ToList();
        db.SurveyQuestions.AddRange(questions);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(ToDto(template, sections, questions));
    }

    public async Task<SurveyOperationResult<SurveyTemplateDto>> UpdateSurveyTemplateAsync(
        int surveyTemplateId,
        SaveSurveyTemplateCommand command,
        CancellationToken cancellationToken = default)
    {
        var template = await db.SurveyTemplates
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == surveyTemplateId, cancellationToken);
        if (template is null)
        {
            return Failed<SurveyTemplateDto>(SurveyErrorCodes.TemplateNotFound);
        }

        var validation = await ValidateTemplateAsync(command, surveyTemplateId, cancellationToken);
        if (validation.ErrorCode is not null)
        {
            return Failed<SurveyTemplateDto>(validation.ErrorCode);
        }

        // Ghi đè danh sách câu hỏi nhưng dùng lại dòng cũ theo thứ tự để giữ
        // "QuestionId" cho những câu đã có câu trả lời.
        var existing = await QuestionsOfTemplate(surveyTemplateId)
            .OrderBy(x => x.QuestionId)
            .ToListAsync(cancellationToken);
        var existingSections = await db.SurveyQuestionSections
            .Where(x => x.SurveyTemplateId == surveyTemplateId)
            .OrderBy(x => x.SectionId)
            .ToListAsync(cancellationToken);

        // CỐ Ý nhìn cả phiếu đã huỷ (IgnoreQueryFilters): câu trả lời của phiếu xoá
        // mềm vẫn nằm nguyên trong bảng kèm "AnswerValue", sửa câu là làm hỏng
        // chính dữ liệu đang giữ để lưu vết. Đừng bỏ IgnoreQueryFilters ở đây.
        var existingIds = existing.Select(x => x.QuestionId).ToList();
        var answeredIds = existingIds.Count == 0
            ? []
            : await db.SurveyResponseAnswers
                .IgnoreQueryFilters()
                .Where(x => existingIds.Contains(x.QuestionId))
                .Select(x => x.QuestionId)
                .Distinct()
                .ToListAsync(cancellationToken);

        // Bộ đã thu phiếu thì chỉ được sửa chữ. Thêm, bớt hay đảo chỗ đều làm nội
        // dung dịch sang "QuestionId" khác trong khi phiếu cũ vẫn trỏ Id cũ, và số
        // thứ tự C1..Cn của mọi báo cáo đã xuất lệch theo. Chặn ở đây chứ không chỉ
        // ẩn nút ngoài giao diện: gọi thẳng API thì vẫn hỏng như thường.
        if (answeredIds.Count > 0)
        {
            if (validation.Questions.Count != existing.Count)
            {
                return Failed<SurveyTemplateDto>(SurveyErrorCodes.TemplateInUse);
            }

            for (var index = 0; index < validation.Questions.Count; index++)
            {
                var current = existing[index];
                if (!answeredIds.Contains(current.QuestionId)) continue;

                // Đổi thang làm "AnswerValue" đã lưu bị hiểu sai (số thành chữ hoặc
                // ngược lại); đổi mục làm điểm theo mục của các đợt cũ đổi nghĩa.
                var sent = validation.Questions[index];
                if (current.AnswerScaleId != sent.AnswerScaleId
                    || validation.Sections[sent.SectionIndex].SectionId != current.SectionId)
                {
                    return Failed<SurveyTemplateDto>(SurveyErrorCodes.TemplateInUse);
                }
            }
        }

        // Hai lượt ghi (mục trước, câu sau) phải cùng sống hoặc cùng chết: lưu được
        // mục mà hỏng ở câu là bộ đề có mục rỗng, đúng thứ ValidateTemplateAsync
        // vừa từ chối ở đầu vào.
        var ownTransaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        await using var transactionScope = ownTransaction;

        template.TemplateName = validation.Name;

        // Mục nhận diện bằng Id gửi lên chứ không đoán theo vị trí: đảo chỗ hai mục
        // mà ghép theo vị trí thì hai mục đổi tên cho nhau, báo cáo cũ đọc ra nhãn
        // của mục khác. Mục không kèm Id là mục mới.
        var sectionById = existingSections.ToDictionary(x => x.SectionId);
        var sections = new List<SurveyQuestionSection>(validation.Sections.Count);
        foreach (var sent in validation.Sections)
        {
            if (sent.SectionId is { } sectionId && sectionById.TryGetValue(sectionId, out var current))
            {
                current.SectionName = sent.SectionName;
                sections.Add(current);
            }
            else
            {
                var created = new SurveyQuestionSection
                {
                    SurveyTemplateId = surveyTemplateId,
                    SectionName = sent.SectionName,
                };
                db.SurveyQuestionSections.Add(created);
                sections.Add(created);
            }
        }

        // Mục mới phải có Id thật trước khi câu hỏi trỏ vào.
        await db.SaveChangesAsync(cancellationToken);

        for (var index = 0; index < validation.Questions.Count; index++)
        {
            var question = validation.Questions[index];
            var sectionId = sections[question.SectionIndex].SectionId;

            if (index < existing.Count)
            {
                var current = existing[index];
                current.QuestionText = question.QuestionText;
                current.AnswerScaleId = question.AnswerScaleId;
                current.AttentionCheckValue = question.AttentionCheckValue;
                current.SectionId = sectionId;
            }
            else
            {
                db.SurveyQuestions.Add(new SurveyQuestion
                {
                    SectionId = sectionId,
                    QuestionText = question.QuestionText,
                    AnswerScaleId = question.AnswerScaleId,
                    AttentionCheckValue = question.AttentionCheckValue,
                });
            }
        }

        // Câu và mục bỏ đi đều là xoá mềm — AuditInterceptor tự chuyển Remove()
        // thành gán "IsDeleted" nên dòng vẫn nằm nguyên cho phiếu cũ và cho báo
        // cáo còn đọc ra được nhãn mục.
        if (existing.Count > validation.Questions.Count)
        {
            db.SurveyQuestions.RemoveRange(existing.Skip(validation.Questions.Count));
        }

        var keptSectionIds = sections.Select(x => x.SectionId).ToHashSet();
        var droppedSections = existingSections
            .Where(x => !keptSectionIds.Contains(x.SectionId))
            .ToList();
        if (droppedSections.Count > 0)
        {
            db.SurveyQuestionSections.RemoveRange(droppedSections);
        }

        await db.SaveChangesAsync(cancellationToken);

        if (ownTransaction is not null)
        {
            await ownTransaction.CommitAsync(cancellationToken);
        }

        var questions = await QuestionsOfTemplate(surveyTemplateId)
            .OrderBy(x => x.QuestionId)
            .ToListAsync(cancellationToken);

        return Succeeded(ToDto(template, sections, questions, answeredIds.Count > 0));
    }

    public async Task<SurveyOperationResult<bool>> DeleteSurveyTemplateAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken = default)
    {
        var template = await db.SurveyTemplates
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == surveyTemplateId, cancellationToken);
        if (template is null)
        {
            return Failed<bool>(SurveyErrorCodes.TemplateNotFound);
        }

        // "SemesterSurveys"."SurveyTemplateId" là ON DELETE RESTRICT.
        if (await db.SemesterSurveys.AnyAsync(x => x.SurveyTemplateId == surveyTemplateId, cancellationToken))
        {
            return Failed<bool>(SurveyErrorCodes.TemplateInUse);
        }

        db.SurveyTemplates.Remove(template);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    // ------------------------------------------------- Đợt khảo sát theo học kỳ

    public async Task<IReadOnlyList<SemesterSurveyDto>> GetSemesterSurveysAsync(
        int? semesterId,
        CancellationToken cancellationToken = default)
    {
        var query = db.SemesterSurveys.AsQueryable();
        if (semesterId is { } id)
        {
            query = query.Where(x => x.SemesterId == id);
        }

        var surveys = await query
            .OrderByDescending(x => x.SemesterSurveyId)
            .ToListAsync(cancellationToken);
        if (surveys.Count == 0)
        {
            return [];
        }

        var semesterIds = surveys.Select(x => x.SemesterId).Distinct().ToList();
        var semesters = await db.Semesters
            .Where(x => semesterIds.Contains(x.SemesterId))
            .ToListAsync(cancellationToken);
        var academicYearIds = semesters.Select(x => x.AcademicYearId).Distinct().ToList();
        var academicYears = await db.AcademicYears
            .Where(x => academicYearIds.Contains(x.AcademicYearId))
            .ToListAsync(cancellationToken);

        var templateIds = surveys.Select(x => x.SurveyTemplateId).Distinct().ToList();
        var templates = await db.SurveyTemplates
            .Where(x => templateIds.Contains(x.SurveyTemplateId))
            .ToListAsync(cancellationToken);
        var questionCounts = await (
            from question in db.SurveyQuestions
            join section in db.SurveyQuestionSections
                on question.SectionId equals section.SectionId
            where templateIds.Contains(section.SurveyTemplateId)
            group question by section.SurveyTemplateId into grouped
            select new { SurveyTemplateId = grouped.Key, Count = grouped.Count() })
            .ToListAsync(cancellationToken);

        var surveyIds = surveys.Select(x => x.SemesterSurveyId).ToList();
        var sectionSurveys = await db.CourseSectionSurveys
            .Where(x => surveyIds.Contains(x.SemesterSurveyId))
            .ToListAsync(cancellationToken);
        var responseCounts = await ResponseCountsAsync(
            sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList(),
            cancellationToken);

        // Lớp thêm vào kỳ sau khi đợt đã tạo thì chưa có bài khảo sát nào. Chỉ đếm
        // trong PHẠM VI của chính đợt, không đếm cả kỳ: một đợt cố ý chỉ phát cho
        // một khoa mà đem so với toàn kỳ thì lúc nào cũng "thiếu" hàng nghìn lớp.
        // Phạm vi không được lưu ở đâu cả, nên suy ngược từ tập bộ môn mà các lớp
        // đang có trong đợt thuộc về.
        var allUnits = await ResolveSectionUnitsAsync(semesterIds, cancellationToken);
        var unitsBySemester = allUnits.ToLookup(x => x.SemesterId);
        var departmentOfSection = allUnits
            .ToDictionary(x => x.CourseSectionId, x => x.DepartmentId);
        var sectionSurveysBySurveyId = sectionSurveys.ToLookup(x => x.SemesterSurveyId);

        return surveys
            .Select(survey =>
            {
                var semester = semesters.FirstOrDefault(x => x.SemesterId == survey.SemesterId);
                var academicYear = academicYears
                    .FirstOrDefault(x => x.AcademicYearId == semester?.AcademicYearId);
                var sections = sectionSurveysBySurveyId[survey.SemesterSurveyId].ToList();
                var coveredSectionIds = sections.Select(x => x.CourseSectionId).ToHashSet();
                var coveredDepartmentIds = coveredSectionIds
                    .Select(id => departmentOfSection.GetValueOrDefault(id))
                    .OfType<int>()
                    .ToHashSet();
                // Lớp không quy được về bộ môn nào thì không phạm vi nào với tới, nên
                // cũng không bao giờ bị tính là thiếu.
                var missingSectionCount = unitsBySemester[survey.SemesterId]
                    .Count(unit => !coveredSectionIds.Contains(unit.CourseSectionId)
                        && unit.DepartmentId is { } departmentId
                        && coveredDepartmentIds.Contains(departmentId));

                return new SemesterSurveyDto(
                    survey.SemesterSurveyId,
                    survey.SurveyName,
                    survey.SemesterId,
                    semester?.SemesterName ?? string.Empty,
                    academicYear?.AcademicYearName ?? string.Empty,
                    survey.SurveyTemplateId,
                    templates.FirstOrDefault(x => x.SurveyTemplateId == survey.SurveyTemplateId)?.TemplateName
                        ?? string.Empty,
                    questionCounts
                        .FirstOrDefault(x => x.SurveyTemplateId == survey.SurveyTemplateId)?.Count ?? 0,
                    survey.CreatedAt,
                    survey.StartTime,
                    survey.EndTime,
                    sections.Count,
                    sections.Sum(section =>
                        responseCounts.TryGetValue(section.CourseSectionSurveyId, out var count) ? count : 0),
                    missingSectionCount,
                    SurveyFormConfig.Parse(survey.FormConfigJson));
            })
            .ToList();
    }

    // Đợt khảo sát phát phiếu cho TOÀN BỘ lớp của học kỳ, không thuộc bộ môn nào, và
    // xoá đợt là xoá lây phiếu đã thu. Nên tạo và xoá đợt chỉ dành cho quản trị —
    // trước đây không kiểm gì cả, ai có COURSE_CAMPAIGNS_ACCESS đều làm được.
    // Xem congviec3.md mục H4.
    public async Task<SurveyOperationResult<SemesterSurveyDto>> CreateSemesterSurveyAsync(
        CreateSemesterSurveyCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.OutOfScope);
        }

        var surveyName = command.SurveyName?.Trim() ?? string.Empty;
        if (surveyName.Length == 0)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNameRequired);
        }

        var scopeType = (command.ScopeType ?? string.Empty).Trim().ToLowerInvariant();
        if (ValidateScope(scopeType, command.ScopeId) is { } scopeError)
        {
            return Failed<SemesterSurveyDto>(scopeError);
        }

        var startTime = ToUtc(command.StartTime);
        var endTime = ToUtc(command.EndTime);
        if (endTime <= startTime)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.ScheduleInvalid);
        }

        // Hình thức phiếu chỉ nhận đúng ở đây, lúc tạo. Sai mã màu hay chữ quá dài thì
        // chặn ngay, đừng để lưu vào rồi mới vỡ lúc sinh viên mở phiếu.
        var formConfigError = SurveyFormConfig.Validate(command.FormConfig);
        if (formConfigError is not null)
        {
            return Failed<SemesterSurveyDto>(formConfigError);
        }

        if (!await db.Semesters.AnyAsync(x => x.SemesterId == command.SemesterId, cancellationToken))
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterNotFound);
        }
        if (!await db.SurveyTemplates
            .AnyAsync(x => x.SurveyTemplateId == command.SurveyTemplateId, cancellationToken))
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.TemplateNotFound);
        }

        var units = await ResolveSectionUnitsAsync([command.SemesterId], cancellationToken);
        if (units.Count == 0)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterHasNoSections);
        }

        // Kỳ có lớp nhưng phạm vi được chọn lại rỗng là hai chuyện khác nhau, báo
        // tách ra để người dùng biết là chọn nhầm khoa chứ không phải kỳ trống.
        var sectionIds = SectionIdsInScope(units, scopeType, command.ScopeId);
        if (sectionIds.Count == 0)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.ScopeHasNoSections);
        }

        var now = DateTime.UtcNow;
        var survey = new SemesterSurvey
        {
            SurveyName = surveyName,
            SemesterId = command.SemesterId,
            SurveyTemplateId = command.SurveyTemplateId,
            StartTime = startTime,
            EndTime = endTime,
            FormConfigJson = SurveyFormConfig.Serialize(command.FormConfig),
            CreatedAt = now,
        };
        db.SemesterSurveys.Add(survey);
        await db.SaveChangesAsync(cancellationToken);

        // Mỗi lớp học phần một bài khảo sát riêng, LinkToken riêng để dựng link và QR.
        db.CourseSectionSurveys.AddRange(sectionIds.Select(sectionId => new CourseSectionSurvey
        {
            SemesterSurveyId = survey.SemesterSurveyId,
            CourseSectionId = sectionId,
            LinkToken = Guid.NewGuid().ToString("N"),
            StartTime = startTime,
            EndTime = endTime,
            CreatedAt = now,
        }));
        await db.SaveChangesAsync(cancellationToken);

        var created = (await GetSemesterSurveysAsync(command.SemesterId, cancellationToken))
            .FirstOrDefault(x => x.SemesterSurveyId == survey.SemesterSurveyId);
        return created is null
            ? Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNotFound)
            : Succeeded(created);
    }

    public async Task<SurveyOperationResult<SemesterSurveyDto>> UpdateSemesterSurveyAsync(
        int semesterSurveyId,
        UpdateSemesterSurveyCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.OutOfScope);
        }

        var surveyName = command.SurveyName?.Trim() ?? string.Empty;
        if (surveyName.Length == 0)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNameRequired);
        }

        var startTime = ToUtc(command.StartTime);
        var endTime = ToUtc(command.EndTime);
        if (endTime <= startTime)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.ScheduleInvalid);
        }

        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(
                System.Data.IsolationLevel.Serializable,
                cancellationToken)
            : null;

        var survey = await FindSemesterSurveyForUpdateAsync(semesterSurveyId, cancellationToken);
        if (survey is null)
        {
            return Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Sửa lịch toàn đợt thì lịch lớp đi theo. Lớp đang dùng đúng lịch tổng cũ nhận lịch
        // tổng mới; lớp có lịch riêng chỉ bị thu lại cho nằm trong lịch mới, phần còn nằm
        // trong thì giữ; lịch riêng nằm hẳn ngoài lịch mới thì nhận trọn lịch mới. Trước đây
        // chặn hẳn để khỏi vô tình đóng sớm hàng loạt lớp — nay giao diện hỏi xác nhận, kèm
        // số lớp đổi lịch và số lớp đóng sớm hơn. Phiếu đã thu không bị động tới.
        var oldStartTime = survey.StartTime;
        var oldEndTime = survey.EndTime;
        var sectionSurveys = await db.CourseSectionSurveys
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        foreach (var sectionSurvey in sectionSurveys)
        {
            if (sectionSurvey.StartTime == oldStartTime && sectionSurvey.EndTime == oldEndTime)
            {
                sectionSurvey.StartTime = startTime;
                sectionSurvey.EndTime = endTime;
                continue;
            }

            var clampedStart = sectionSurvey.StartTime < startTime ? startTime : sectionSurvey.StartTime;
            var clampedEnd = sectionSurvey.EndTime > endTime ? endTime : sectionSurvey.EndTime;
            if (clampedEnd <= clampedStart)
            {
                clampedStart = startTime;
                clampedEnd = endTime;
            }
            sectionSurvey.StartTime = clampedStart;
            sectionSurvey.EndTime = clampedEnd;
        }

        survey.SurveyName = surveyName;
        survey.StartTime = startTime;
        survey.EndTime = endTime;
        await db.SaveChangesAsync(cancellationToken);

        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }

        var links = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => x.LinkToken)
            .ToListAsync(cancellationToken);
        foreach (var link in links)
        {
            cache.Remove($"survey:public:{link}");
        }

        var updated = (await GetSemesterSurveysAsync(survey.SemesterId, cancellationToken))
            .FirstOrDefault(x => x.SemesterSurveyId == semesterSurveyId);
        return updated is null
            ? Failed<SemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNotFound)
            : Succeeded(updated);
    }

    public async Task<SurveyOperationResult<SurveyFormConfigDto?>> SaveSemesterSurveyFormConfigAsync(
        int semesterSurveyId,
        SurveyFormConfigDto? config,
        CancellationToken cancellationToken = default)
    {
        var configError = SurveyFormConfig.Validate(config);
        if (configError is not null)
        {
            return Failed<SurveyFormConfigDto?>(configError);
        }

        var survey = await db.SemesterSurveys
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (survey is null)
        {
            return Failed<SurveyFormConfigDto?>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Khoá từ lúc phiếu ĐẦU TIÊN mở, không phải từ giờ mở ghi trên đợt: dữ liệu cũ
        // còn những đợt mà từng lớp có lịch riêng. Đang thu phiếu mà đổi màu đổi chữ
        // giữa chừng là một kiểu hỏng khó lần ra.
        var earliestStart = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => (DateTime?)x.StartTime)
            .MinAsync(cancellationToken) ?? survey.StartTime;
        if (DateTime.UtcNow >= earliestStart)
        {
            return Failed<SurveyFormConfigDto?>(SurveyErrorCodes.FormConfigLocked);
        }

        survey.FormConfigJson = SurveyFormConfig.Serialize(config);
        await db.SaveChangesAsync(cancellationToken);

        // Chưa tới giờ mở không có nghĩa là chưa ai mở link: mỗi lần mở là một bản cache
        // 15 phút, và màn chặn cũng đọc cấu hình từ đó. Xoá sạch cho chắc.
        var links = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => x.LinkToken)
            .ToListAsync(cancellationToken);
        foreach (var link in links)
        {
            cache.Remove($"survey:public:{link}");
        }

        return Succeeded<SurveyFormConfigDto?>(SurveyFormConfig.Parse(survey.FormConfigJson));
    }

    public async Task<SurveyOperationResult<bool>> DeleteSemesterSurveyAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<bool>(SurveyErrorCodes.OutOfScope);
        }

        var survey = await db.SemesterSurveys
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (survey is null)
        {
            return Failed<bool>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Xóa đợt sẽ xóa lây phiếu đã thu (ON DELETE CASCADE) nên chặn lại.
        var sectionSurveys = await db.CourseSectionSurveys
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        var sectionSurveyIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        if (await db.SurveyResponses
            .AnyAsync(x => sectionSurveyIds.Contains(x.CourseSectionSurveyId), cancellationToken))
        {
            return Failed<bool>(SurveyErrorCodes.SemesterSurveyHasResponses);
        }

        // Cascade soft-delete: đợt khảo sát → bài khảo sát lớp học phần.
        foreach (var sectionSurvey in sectionSurveys)
            db.CourseSectionSurveys.Remove(sectionSurvey);

        db.SemesterSurveys.Remove(survey);
        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(true);
    }

    // --------------------------------------- Phạm vi lớp được phát phiếu

    /// <summary>
    /// Một lớp học phần cùng đơn vị đã quy được. <c>DepartmentId</c> / <c>FacultyId</c>
    /// vẫn có thể null khi cả học phần lẫn giảng viên đều không ghi đơn vị.
    /// </summary>
    private readonly record struct SectionUnit(
        int SemesterId,
        int CourseSectionId,
        int? DepartmentId,
        int? FacultyId);

    /// <summary>
    /// Quy từng lớp của các học kỳ về bộ môn và khoa. Không có khoá ngoại trực tiếp
    /// từ lớp lên đơn vị, nên phải lần theo học phần rồi mới tới giảng viên — GIỮ
    /// ĐÚNG thứ tự của <see cref="LoadAnalysedSectionsAsync"/> và trang Lớp học phần,
    /// nếu không cùng một lớp sẽ bị xếp vào hai khoa khác nhau ở hai màn hình.
    ///
    /// Khác hai chỗ kia ở chỗ chạy trên toàn bộ lớp của kỳ, không lọc theo phiếu đã
    /// thu — vì lúc chọn phạm vi thì chưa có phiếu nào.
    /// </summary>
    private async Task<List<SectionUnit>> ResolveSectionUnitsAsync(
        IReadOnlyCollection<int> semesterIds,
        CancellationToken cancellationToken)
    {
        if (semesterIds.Count == 0) return [];

        var sections = await db.CourseSections.AsNoTracking()
            .Where(x => semesterIds.Contains(x.SemesterId))
            .Select(x => new { x.CourseSectionId, x.SemesterId, x.CourseId, x.LecturerId })
            .ToListAsync(cancellationToken);
        if (sections.Count == 0) return [];

        var courseIds = sections.Select(x => x.CourseId).Distinct().ToList();
        var courses = await db.Courses.AsNoTracking()
            .Where(x => courseIds.Contains(x.CourseId))
            .Select(x => new { x.CourseId, x.DepartmentId, x.FacultyId })
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);

        var lecturerIds = sections
            .Where(x => x.LecturerId != null)
            .Select(x => x.LecturerId!.Value)
            .Distinct()
            .ToList();
        var lecturers = await db.Lecturers.AsNoTracking()
            .Where(x => lecturerIds.Contains(x.LecturerId))
            .Select(x => new { x.LecturerId, x.DepartmentId, x.FacultyId })
            .ToDictionaryAsync(x => x.LecturerId, x => x, cancellationToken);

        var facultyOfDepartment = await db.Departments.AsNoTracking()
            .Select(x => new { x.DepartmentId, x.FacultyId })
            .ToDictionaryAsync(x => x.DepartmentId, x => x.FacultyId, cancellationToken);

        var units = new List<SectionUnit>(sections.Count);
        foreach (var section in sections)
        {
            int? courseDepartmentId = null;
            int? courseFacultyId = null;
            if (courses.TryGetValue(section.CourseId, out var course))
            {
                courseDepartmentId = course.DepartmentId;
                courseFacultyId = course.FacultyId;
            }

            int? lecturerDepartmentId = null;
            int? lecturerFacultyId = null;
            if (section.LecturerId is { } lecturerId && lecturers.TryGetValue(lecturerId, out var lecturer))
            {
                lecturerDepartmentId = lecturer.DepartmentId;
                lecturerFacultyId = lecturer.FacultyId;
            }

            var departmentId = courseDepartmentId ?? lecturerDepartmentId;
            var facultyId = courseFacultyId;
            if (facultyId is null && departmentId is { } dId
                && facultyOfDepartment.TryGetValue(dId, out var owningFacultyId))
            {
                facultyId = owningFacultyId;
            }
            facultyId ??= lecturerFacultyId;

            units.Add(new SectionUnit(section.SemesterId, section.CourseSectionId, departmentId, facultyId));
        }

        return units;
    }

    /// <summary>Trả mã lỗi nếu phạm vi không dùng được, null nếu hợp lệ.</summary>
    private static string? ValidateScope(string scopeType, int? scopeId)
    {
        if (!SurveyScopeTypes.IsValid(scopeType)) return SurveyErrorCodes.ScopeTypeUnsupported;
        if (SurveyScopeTypes.RequiresScopeId(scopeType) && scopeId is null)
        {
            return SurveyErrorCodes.ScopeIdRequired;
        }
        return null;
    }

    private static List<int> SectionIdsInScope(
        IEnumerable<SectionUnit> units,
        string scopeType,
        int? scopeId) =>
        scopeType switch
        {
            SurveyScopeTypes.All => units.Select(x => x.CourseSectionId).ToList(),
            SurveyScopeTypes.Faculty => units
                .Where(x => x.FacultyId == scopeId).Select(x => x.CourseSectionId).ToList(),
            SurveyScopeTypes.Department => units
                .Where(x => x.DepartmentId == scopeId).Select(x => x.CourseSectionId).ToList(),
            SurveyScopeTypes.Section => units
                .Where(x => x.CourseSectionId == scopeId).Select(x => x.CourseSectionId).ToList(),
            _ => []
        };

    public async Task<SurveyOperationResult<SurveyScopePreviewDto>> PreviewSectionScopeAsync(
        int semesterId,
        string scopeType,
        int? scopeId,
        int? semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanAddSurveyScope)
        {
            return Failed<SurveyScopePreviewDto>(SurveyErrorCodes.OutOfScope);
        }

        var normalized = (scopeType ?? string.Empty).Trim().ToLowerInvariant();
        if (ValidateScope(normalized, scopeId) is { } scopeError)
        {
            return Failed<SurveyScopePreviewDto>(scopeError);
        }

        var units = await ResolveSectionUnitsAsync([semesterId], cancellationToken);
        units = UnitsInScope(scope, units);
        var scopedSectionIds = SectionIdsInScope(units, normalized, scopeId);

        var newSectionCount = scopedSectionIds.Count;
        if (semesterSurveyId is { } surveyId)
        {
            var covered = (await db.CourseSectionSurveys.AsNoTracking()
                    .Where(x => x.SemesterSurveyId == surveyId)
                    .Select(x => x.CourseSectionId)
                    .ToListAsync(cancellationToken))
                .ToHashSet();
            newSectionCount = scopedSectionIds.Count(id => !covered.Contains(id));
        }

        return Succeeded(new SurveyScopePreviewDto(
            normalized,
            scopeId,
            scopedSectionIds.Count,
            newSectionCount));
    }

    // Bổ sung lớp vào đợt đã có theo phạm vi tự chọn. Người gọi được chọn khung giờ riêng
    // cho lớp mới, nhưng khoảng đó bắt buộc nằm trọn trong lịch tổng của đợt.
    public async Task<SurveyOperationResult<AddSectionsToSemesterSurveyDto>> AddSectionsToSemesterSurveyAsync(
        int semesterSurveyId,
        AddSectionsToSemesterSurveyCommand command,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanAddSurveyScope)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.OutOfScope);
        }

        var scopeType = (command.ScopeType ?? string.Empty).Trim().ToLowerInvariant();
        if (ValidateScope(scopeType, command.ScopeId) is { } scopeError)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(scopeError);
        }

        var startTime = ToUtc(command.StartTime);
        var endTime = ToUtc(command.EndTime);
        if (endTime <= startTime)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.ScheduleInvalid);
        }

        await using var transaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(
                System.Data.IsolationLevel.Serializable,
                cancellationToken)
            : null;

        var survey = await FindSemesterSurveyForUpdateAsync(semesterSurveyId, cancellationToken);
        if (survey is null)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }
        if (startTime < survey.StartTime || endTime > survey.EndTime)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(
                SurveyErrorCodes.SectionScheduleOutsideSemesterSurvey);
        }

        var units = await ResolveSectionUnitsAsync([survey.SemesterId], cancellationToken);
        units = UnitsInScope(scope, units);
        var scopedSectionIds = SectionIdsInScope(units, scopeType, command.ScopeId);
        if (scopedSectionIds.Count == 0)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.ScopeHasNoSections);
        }

        // Phạm vi chồng nhau là chuyện bình thường (thêm bộ môn sau khi đã thêm cả
        // khoa), nên lớp đã có bài thì bỏ qua chứ không báo lỗi.
        var coveredSectionIds = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .Select(x => x.CourseSectionId)
            .ToListAsync(cancellationToken);
        var covered = coveredSectionIds.ToHashSet();
        var newSectionIds = scopedSectionIds.Where(id => !covered.Contains(id)).ToList();
        if (newSectionIds.Count == 0)
        {
            return Failed<AddSectionsToSemesterSurveyDto>(SurveyErrorCodes.ScopeSectionsAlreadyAdded);
        }

        var now = DateTime.UtcNow;
        db.CourseSectionSurveys.AddRange(newSectionIds.Select(sectionId => new CourseSectionSurvey
        {
            SemesterSurveyId = semesterSurveyId,
            CourseSectionId = sectionId,
            LinkToken = Guid.NewGuid().ToString("N"),
            StartTime = startTime,
            EndTime = endTime,
            CreatedAt = now,
        }));
        await db.SaveChangesAsync(cancellationToken);

        if (transaction is not null)
        {
            await transaction.CommitAsync(cancellationToken);
        }

        return Succeeded(new AddSectionsToSemesterSurveyDto(
            semesterSurveyId,
            survey.SurveyName,
            newSectionIds.Count,
            scopedSectionIds.Count - newSectionIds.Count,
            startTime,
            endTime));
    }

    public Task<IReadOnlyList<CourseSectionSurveyDto>> GetCourseSectionSurveysAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default) =>
        GetCourseSectionSurveysAsync(semesterSurveyId, null, cancellationToken);

    public async Task<IReadOnlyList<CourseSectionSurveyDto>> GetCourseSectionSurveysAsync(
        int? semesterSurveyId = null,
        int? semesterId = null,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (scope.SeesNothing) return [];

        // Bắt buộc phải lọc theo đợt khảo sát hoặc học kỳ để tránh quét toàn bộ dữ liệu lịch sử
        if (!semesterSurveyId.HasValue && !semesterId.HasValue)
        {
            return [];
        }

        var query = db.CourseSectionSurveys.AsNoTracking().AsQueryable();

        if (semesterSurveyId.HasValue)
        {
            query = query.Where(x => x.SemesterSurveyId == semesterSurveyId.Value);
        }
        else if (semesterId.HasValue)
        {
            query = query.Where(x => db.SemesterSurveys
                .Any(s => s.SemesterSurveyId == x.SemesterSurveyId && s.SemesterId == semesterId.Value));
        }

        // Bài khảo sát đi theo lớp, nên thừa hưởng đúng phạm vi của lớp: giảng viên
        // lấy lớp mình dạy, trưởng bộ môn lấy lớp có học phần thuộc bộ môn mình.
        // Trang Tiến độ thu phiếu cũng ăn theo hàm này nên lọc một chỗ là xong cả hai.
        if (scope.SeesOnlyOwn)
        {
            query = query.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && section.LecturerId == scope.LecturerId));
        }
        else if (scope.SeesWholeFaculty)
        {
            query = query.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && db.Courses.Any(course =>
                                    course.CourseId == section.CourseId
                                    && course.FacultyId == scope.FacultyId)));
        }
        else if (!scope.SeesEverything)
        {
            query = query.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && db.Courses.Any(course =>
                                    course.CourseId == section.CourseId
                                    && course.DepartmentId == scope.DepartmentId)));
        }

        var sectionSurveys = await query.ToListAsync(cancellationToken);
        if (sectionSurveys.Count == 0)
        {
            return [];
        }

        // Đếm sống từ "SurveyResponses" chứ không đọc cột đã chốt trên
        // "CourseSectionSurveys": mấy cột đó chỉ đúng tới lần bấm Tính lại điểm gần
        // nhất, còn trang Tiến độ phải phản ánh phiếu vừa về.
        var courseSectionSurveyIds = sectionSurveys
            .Select(x => x.CourseSectionSurveyId)
            .ToList();
        var responseCounts = await ResponseValidityCountsAsync(
            courseSectionSurveyIds,
            cancellationToken);
        var openCommentCounts = await db.SurveyResponses.AsNoTracking()
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId)
                && x.AdditionalComments != null
                && x.AdditionalComments != "")
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(group => new { CourseSectionSurveyId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(x => x.CourseSectionSurveyId, x => x.Count, cancellationToken);
        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).Distinct().ToList();
        var sections = await db.CourseSections.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);
        var courses = await db.Courses.AsNoTracking()
            .Where(x => sections.Select(section => section.CourseId).Contains(x.CourseId))
            .ToListAsync(cancellationToken);
        var lecturers = await db.Lecturers.AsNoTracking()
            .Where(x => sections.Select(section => section.LecturerId).Contains(x.LecturerId))
            .ToListAsync(cancellationToken);
        var departments = await db.Departments.AsNoTracking()
            .ToDictionaryAsync(x => x.DepartmentId, x => x, cancellationToken);
        var faculties = await db.Faculties.AsNoTracking()
            .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);

        var sectionById = sections.ToDictionary(x => x.CourseSectionId);
        var courseById = courses.ToDictionary(x => x.CourseId);
        var lecturerById = lecturers
            .GroupBy(x => x.LecturerId)
            .ToDictionary(g => g.Key, g => g.First());

        return sectionSurveys
            .Select(sectionSurvey =>
            {
                sectionById.TryGetValue(sectionSurvey.CourseSectionId, out var section);
                Course? course = null;
                if (section != null)
                {
                    courseById.TryGetValue(section.CourseId, out course);
                }
                Lecturer? lecturer = null;
                if (section?.LecturerId != null)
                {
                    lecturerById.TryGetValue(section.LecturerId.Value, out lecturer);
                }

                // Cùng thứ tự quy thuộc đơn vị với LoadAnalysedSectionsAsync và trang
                // Lớp học phần, để ba màn hình không xếp một lớp vào ba khoa khác nhau.
                var departmentId = course?.DepartmentId ?? lecturer?.DepartmentId;
                var facultyId = course?.FacultyId;
                if (facultyId is null && departmentId is { } dId
                    && departments.TryGetValue(dId, out var owningDepartment))
                {
                    facultyId = owningDepartment.FacultyId;
                }
                facultyId ??= lecturer?.FacultyId;

                var tally = responseCounts
                    .GetValueOrDefault(sectionSurvey.CourseSectionSurveyId, (Total: 0, Valid: 0));

                return new CourseSectionSurveyDto(
                    sectionSurvey.CourseSectionSurveyId,
                    sectionSurvey.SemesterSurveyId,
                    sectionSurvey.CourseSectionId,
                    sectionSurvey.LinkToken,
                    sectionSurvey.StartTime,
                    sectionSurvey.EndTime,
                    course?.CourseCode ?? string.Empty,
                    course?.CourseName ?? string.Empty,
                    section?.SectionName ?? string.Empty,
                    // Lớp chưa gắn được mã giảng viên vẫn có tên đọc từ tệp import ở
                    // UnidentifiedLecturerName. Bỏ qua nó thì cả bảng lẫn tệp Excel
                    // xuất ra đều ghi "Chưa phân công" cho một lớp thật ra có người dạy.
                    lecturer?.FullName ?? section?.UnidentifiedLecturerName ?? string.Empty,
                    departmentId is { } dId2 && departments.TryGetValue(dId2, out var department)
                        ? department.DepartmentName
                        : "Chưa thuộc bộ môn",
                    facultyId is { } fId && faculties.TryGetValue(fId, out var facultyName)
                        ? facultyName
                        : "Chưa thuộc khoa",
                    section?.ClassSize ?? 0,
                    tally.Total,
                    tally.Valid,
                    tally.Total - tally.Valid,
                    openCommentCounts.GetValueOrDefault(sectionSurvey.CourseSectionSurveyId));
            })
            .OrderBy(x => x.CourseCode)
            .ThenBy(x => x.SectionName)
            .ToList();
    }

    public async Task<SurveyOperationResult<CourseSectionSurveyDto>> GetCourseSectionSurveyAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default)
    {
        var sectionSurvey = await db.CourseSectionSurveys
            .FirstOrDefaultAsync(x => x.CourseSectionSurveyId == courseSectionSurveyId, cancellationToken);
        if (sectionSurvey is null)
        {
            return Failed<CourseSectionSurveyDto>(SurveyErrorCodes.SectionSurveyNotFound);
        }

        var dto = (await GetCourseSectionSurveysAsync(sectionSurvey.SemesterSurveyId, cancellationToken))
            .FirstOrDefault(x => x.CourseSectionSurveyId == courseSectionSurveyId);
        return dto is null
            ? Failed<CourseSectionSurveyDto>(SurveyErrorCodes.SectionSurveyNotFound)
            : Succeeded(dto);
    }

    // Huỷ toàn bộ phiếu của một lớp để lớp làm lại. Cùng mức quyền với tạo/xoá đợt:
    // đây là thao tác bỏ đi dữ liệu đã thu của cả một lớp.
    public async Task<SurveyOperationResult<ClearSectionSurveyResponsesDto>> ClearSectionSurveyResponsesAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<ClearSectionSurveyResponsesDto>(SurveyErrorCodes.OutOfScope);
        }

        var sectionSurvey = await db.CourseSectionSurveys
            .FirstOrDefaultAsync(x => x.CourseSectionSurveyId == courseSectionSurveyId, cancellationToken);
        if (sectionSurvey is null)
        {
            return Failed<ClearSectionSurveyResponsesDto>(SurveyErrorCodes.SectionSurveyNotFound);
        }

        // Query filter đã bỏ phiếu huỷ trước đó, nên bấm lần hai trên lớp đã sạch
        // sẽ báo "không có gì để huỷ" chứ không âm thầm chạy không.
        var responses = await db.SurveyResponses
            .Where(x => x.CourseSectionSurveyId == courseSectionSurveyId)
            .ToListAsync(cancellationToken);
        if (responses.Count == 0)
        {
            return Failed<ClearSectionSurveyResponsesDto>(SurveyErrorCodes.SectionSurveyHasNoResponses);
        }

        var clearedAt = DateTime.UtcNow;

        // Phiếu và số dẫn xuất phải cùng ăn hoặc cùng bỏ: dọn được phiếu mà điểm cũ
        // còn đứng lại thì bảng đọc ra "0 phiếu, 4.17 điểm". Hai câu lệnh dưới đây
        // chạy riêng (SaveChanges và ExecuteDelete) nên cần transaction bao ngoài.
        //
        // Người gọi đã mở transaction sẵn thì tham gia vào đó chứ không mở lồng —
        // Npgsql không cho lồng, và hàm này phải ghép được vào một thao tác lớn hơn.
        var ownTransaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        await using var transactionScope = ownTransaction;

        // Gán tay chứ KHÔNG gọi Remove(): AuditInterceptor loại SurveyResponse khỏi
        // vòng xử lý nên nó không chuyển Remove() thành xoá mềm, gọi vào là mất
        // sạch dữ liệu thật.
        foreach (var response in responses)
        {
            response.IsDeleted = true;
            response.DeletedAt = clearedAt;
        }

        // Ảnh chụp điểm không tự tính lại nên phải dọn tay. Ba cột đếm về 0 chứ
        // không giữ số cũ — lớp này coi như chưa ai làm.
        sectionSurvey.AverageScore = null;
        sectionSurvey.TotalResponseCount = 0;
        sectionSurvey.ValidResponseCount = 0;
        sectionSurvey.InvalidResponseCount = 0;
        sectionSurvey.ScoreCalculatedAt = null;

        // Điểm từng câu (các cột C1, C2… của bảng dữ liệu) là mặt còn lại của cùng
        // một lần chốt điểm, xoá hẳn dòng chứ không để lại số mồ côi.
        var clearedQuestionScores = await db.CourseSectionSurveyQuestionScores
            .Where(x => x.CourseSectionSurveyId == courseSectionSurveyId)
            .ExecuteDeleteAsync(cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        if (ownTransaction is not null)
        {
            await ownTransaction.CommitAsync(cancellationToken);
        }

        // Tổng quan toàn trường có cache 90 giây; không dọn thì bấm xong mở báo cáo
        // vẫn thấy điểm cũ hơn một phút, trông như hệ thống hỏng.
        schoolOverviewCache.Bump();
        cache.Remove($"survey:public:{sectionSurvey.LinkToken}");

        var section = await db.CourseSections.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CourseSectionId == sectionSurvey.CourseSectionId, cancellationToken);
        var course = section is null
            ? null
            : await db.Courses.AsNoTracking()
                .FirstOrDefaultAsync(x => x.CourseId == section.CourseId, cancellationToken);

        return Succeeded(new ClearSectionSurveyResponsesDto(
            courseSectionSurveyId,
            course?.CourseCode ?? string.Empty,
            course?.CourseName ?? string.Empty,
            section?.SectionName ?? string.Empty,
            responses.Count,
            clearedQuestionScores,
            clearedAt));
    }

    /// <summary>
    /// Người dùng hiện tại có được xem bài khảo sát của lớp này không. Đi qua chính
    /// hàm danh sách đã lọc phạm vi thay vì viết lại điều kiện lần nữa: chỉ cần một
    /// chỗ định nghĩa "lớp nào thuộc về ai".
    ///
    /// Cần thiết vì danh sách phiếu nhận thẳng courseSectionSurveyId từ URL. Không
    /// kiểm thì một giảng viên chỉ việc đổi số trên thanh địa chỉ là đọc được nhận
    /// xét sinh viên viết về lớp của đồng nghiệp.
    /// </summary>
    private async Task<bool> CanSeeSectionSurveyAsync(
        CourseSectionSurvey sectionSurvey,
        CancellationToken cancellationToken) =>
        // Hai lớp chặn: đúng phạm vi của vai trò, và đợt đã được phát hành (quản trị
        // thì luôn qua được lớp thứ hai).
        await publication.CanSeeResultsAsync(sectionSurvey.SemesterSurveyId, cancellationToken)
        && (await GetCourseSectionSurveysAsync(sectionSurvey.SemesterSurveyId, cancellationToken))
            .Any(x => x.CourseSectionSurveyId == sectionSurvey.CourseSectionSurveyId);

    public async Task<SurveyOperationResult<IReadOnlyList<SurveyResponseSummaryDto>>> GetSurveyResponsesAsync(
        int courseSectionSurveyId,
        CancellationToken cancellationToken = default)
    {
        var sectionSurvey = await db.CourseSectionSurveys
            .FirstOrDefaultAsync(x => x.CourseSectionSurveyId == courseSectionSurveyId, cancellationToken);
        if (sectionSurvey is null
            || !await CanSeeSectionSurveyAsync(sectionSurvey, cancellationToken))
        {
            // Ngoài phạm vi thì trả "không tìm thấy" chứ không phải "không có quyền":
            // đừng để người gọi dò ra lớp nào có thật bằng cách so hai mã lỗi.
            return Failed<IReadOnlyList<SurveyResponseSummaryDto>>(SurveyErrorCodes.SectionSurveyNotFound);
        }

        var responses = await db.SurveyResponses
            .Where(x => x.CourseSectionSurveyId == courseSectionSurveyId)
            .OrderByDescending(x => x.ResponseId)
            .ToListAsync(cancellationToken);

        var scales = await ScalesOfSectionSurveyAsync(sectionSurvey, cancellationToken);
        var mergedValues = MergedOptionValues(scales);
        var scaleOfQuestion = await ScaleByQuestionAsync(sectionSurvey, scales, cancellationToken);

        var responseIds = responses.Select(x => x.ResponseId).ToList();
        var answers = responseIds.Count == 0
            ? []
            : await db.SurveyResponseAnswers
                .Where(x => responseIds.Contains(x.ResponseId))
                .ToListAsync(cancellationToken);

        var summaries = responses
            .Select(response =>
            {
                var responseAnswers = answers.Where(x => x.ResponseId == response.ResponseId).ToList();
                var selectedValues = responseAnswers
                    .Select(answer => SelectedValueOf(
                        scaleOfQuestion.GetValueOrDefault(answer.QuestionId),
                        answer.AnswerValue))
                    .Where(value => value.HasValue)
                    .Select(value => value!.Value)
                    .ToList();

                return new SurveyResponseSummaryDto(
                    response.ResponseId,
                    response.CourseSectionSurveyId,
                    response.SubmittedAt,
                    response.Score,
                    response.AdditionalComments,
                    responseAnswers.Count,
                    // Giữ đủ các mức của thang, mức không ai chọn hiển thị 0.
                    mergedValues
                        .Select(option => new SurveyResponseValueCountDto(
                            option.Value,
                            option.DisplayText,
                            selectedValues.Count(value => value == option.Value)))
                        .ToList(),
                    response.IsValid,
                    response.RejectionReasons);
            })
            .ToList();

        return Succeeded<IReadOnlyList<SurveyResponseSummaryDto>>(summaries);
    }

    public async Task<SurveyOperationResult<SurveyResponseDetailDto>> GetSurveyResponseAsync(
        int responseId,
        CancellationToken cancellationToken = default)
    {
        var response = await db.SurveyResponses
            .FirstOrDefaultAsync(x => x.ResponseId == responseId, cancellationToken);
        if (response is null)
        {
            return Failed<SurveyResponseDetailDto>(SurveyErrorCodes.ResponseNotFound);
        }

        var sectionSurvey = await db.CourseSectionSurveys
            .FirstOrDefaultAsync(x => x.CourseSectionSurveyId == response.CourseSectionSurveyId, cancellationToken);
        if (sectionSurvey is not null
            && !await CanSeeSectionSurveyAsync(sectionSurvey, cancellationToken))
        {
            return Failed<SurveyResponseDetailDto>(SurveyErrorCodes.ResponseNotFound);
        }
        if (sectionSurvey is null)
        {
            return Failed<SurveyResponseDetailDto>(SurveyErrorCodes.SectionSurveyNotFound);
        }

        var semesterSurvey = await db.SemesterSurveys
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == sectionSurvey.SemesterSurveyId, cancellationToken);
        var template = semesterSurvey is null
            ? null
            : await db.SurveyTemplates
                .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);

        var scales = await ScalesOfSectionSurveyAsync(sectionSurvey, cancellationToken);
        var scaleById = scales.ToDictionary(x => x.AnswerScaleId);
        var questions = template is null
            ? []
            : await QuestionsOfTemplate(template.SurveyTemplateId)
                .OrderBy(x => x.QuestionId)
                .ToListAsync(cancellationToken);
        var answers = await db.SurveyResponseAnswers
            .Where(x => x.ResponseId == responseId)
            .ToListAsync(cancellationToken);

        var section = await db.CourseSections
            .FirstOrDefaultAsync(x => x.CourseSectionId == sectionSurvey.CourseSectionId, cancellationToken);
        var course = section is null
            ? null
            : await db.Courses.FirstOrDefaultAsync(x => x.CourseId == section.CourseId, cancellationToken);
        var lecturer = section is null
            ? null
            : await db.Lecturers.FirstOrDefaultAsync(x => x.LecturerId == section.LecturerId, cancellationToken);

        return Succeeded(new SurveyResponseDetailDto(
            response.ResponseId,
            response.CourseSectionSurveyId,
            response.SubmittedAt,
            response.Score,
            response.AdditionalComments,
            template?.TemplateName ?? string.Empty,
            course?.CourseCode ?? string.Empty,
            course?.CourseName ?? string.Empty,
            section?.SectionName ?? string.Empty,
            lecturer?.FullName ?? string.Empty,
            scales,
            questions
                .Select(question =>
                {
                    var answer = answers.FirstOrDefault(x => x.QuestionId == question.QuestionId);
                    var scale = scaleById.GetValueOrDefault(question.AnswerScaleId);
                    var selectedValue = SelectedValueOf(scale, answer?.AnswerValue);

                    return new SurveyResponseAnswerDto(
                        question.QuestionId,
                        question.QuestionText,
                        question.AnswerScaleId,
                        scale?.ScaleKind ?? AnswerScaleKinds.Options,
                        answer?.AnswerValue ?? string.Empty,
                        selectedValue,
                        scale?.Options.FirstOrDefault(option => option.Value == selectedValue)?.DisplayText
                            ?? string.Empty);
                })
                .ToList()));
    }

    /// <summary>
    /// Khóa dòng đợt trong transaction để thao tác sửa lịch tổng, sửa lịch lớp và thêm lớp không
    /// thể chạy xuyên qua nhau rồi cùng vượt qua bước kiểm tra bằng dữ liệu cũ.
    /// </summary>
    private Task<SemesterSurvey?> FindSemesterSurveyForUpdateAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken) =>
        db.SemesterSurveys
            .FromSqlInterpolated(
                $"""
                SELECT *
                FROM "SemesterSurveys"
                WHERE "SemesterSurveyId" = {semesterSurveyId}
                FOR UPDATE
                """)
            .FirstOrDefaultAsync(cancellationToken);

    // -------------------------------------------------- Phiếu khảo sát công khai

    public async Task<SurveyOperationResult<PublicSurveyDto>> GetPublicSurveyAsync(
        string linkToken,
        CancellationToken cancellationToken = default)
    {
        var token = linkToken?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(token))
        {
            return Failed<PublicSurveyDto>(SurveyErrorCodes.LinkNotFound);
        }

        var cacheKey = $"survey:public:{token}";
        var cached = await cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15);

            var sectionSurvey = await db.CourseSectionSurveys
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.LinkToken == token, cancellationToken);
            if (sectionSurvey is null) return null;

            var semesterSurvey = await db.SemesterSurveys
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.SemesterSurveyId == sectionSurvey.SemesterSurveyId, cancellationToken);
            if (semesterSurvey is null) return null;

            var template = await db.SurveyTemplates
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);
            if (template is null) return null;

            var questions = await QuestionsOfTemplate(template.SurveyTemplateId)
                .AsNoTracking()
                .OrderBy(x => x.QuestionId)
                .Select(x => new PublicSurveyQuestionDto(
                    x.QuestionId,
                    x.QuestionText,
                    x.AnswerScaleId,
                    x.SectionId))
                .ToListAsync(cancellationToken);

            // Mục xếp theo vị trí câu đầu tiên của nó, đúng thứ tự phiếu sẽ hiện.
            var sectionOrder = questions
                .Select((question, index) => (question.SectionId, Index: index))
                .GroupBy(x => x.SectionId)
                .ToDictionary(group => group.Key, group => group.Min(x => x.Index));
            var sectionIds = sectionOrder.Keys.ToList();
            var sections = (await db.SurveyQuestionSections
                    .AsNoTracking()
                    .Where(x => sectionIds.Contains(x.SectionId))
                    .Select(x => new PublicSurveySectionDto(x.SectionId, x.SectionName))
                    .ToListAsync(cancellationToken))
                .OrderBy(x => sectionOrder[x.SectionId])
                .ToList();

            // Trả về mọi thang mà bộ đang dùng; mỗi câu tự trỏ tới thang của nó.
            var scales = await ScalesOfTemplateAsync(template.SurveyTemplateId, cancellationToken);

            var section = await db.CourseSections
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.CourseSectionId == sectionSurvey.CourseSectionId, cancellationToken);
            var course = section is null
                ? null
                : await db.Courses.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.CourseId == section.CourseId, cancellationToken);
            var lecturer = section is null
                ? null
                : await db.Lecturers.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.LecturerId == section.LecturerId, cancellationToken);
            var semester = section is null
                ? null
                : await db.Semesters.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.SemesterId == section.SemesterId, cancellationToken);
            var academicYear = semester is null
                ? null
                : await db.AcademicYears.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.AcademicYearId == semester.AcademicYearId, cancellationToken);

            // Khoa và bộ môn lấy theo HỌC PHẦN. Lớp học phần không có hai cột này, và
            // phiếu chỉ hiện chúng khi quản trị bật trong màn soạn phiếu.
            var faculty = course?.FacultyId is not { } facultyId
                ? null
                : await db.Faculties.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.FacultyId == facultyId, cancellationToken);
            var department = course?.DepartmentId is not { } departmentId
                ? null
                : await db.Departments.AsNoTracking()
                    .FirstOrDefaultAsync(x => x.DepartmentId == departmentId, cancellationToken);

            return new PublicSurveyDto(
                sectionSurvey.LinkToken,
                template.TemplateName,
                course?.CourseCode ?? string.Empty,
                course?.CourseName ?? string.Empty,
                section?.SectionName ?? string.Empty,
                lecturer?.FullName ?? string.Empty,
                semester?.SemesterName ?? string.Empty,
                academicYear?.AcademicYearName ?? string.Empty,
                sectionSurvey.StartTime,
                sectionSurvey.EndTime,
                true,
                scales,
                sections,
                questions,
                semesterSurvey.SurveyName,
                // Cấu hình hỏng hay thuộc phiên bản lạ thì Parse trả null và phiếu về
                // mẫu mặc định — không bao giờ chặn sinh viên làm bài vì lỗi hình thức.
                SurveyFormConfig.Parse(semesterSurvey.FormConfigJson),
                course?.Credits ?? 0,
                faculty?.FacultyName ?? string.Empty,
                department?.DepartmentName ?? string.Empty);
        });

        if (cached is null)
        {
            return Failed<PublicSurveyDto>(SurveyErrorCodes.LinkNotFound);
        }

        // Ngoài khung giờ thì coi như không có link: chặn ngay ở đây nên phiếu
        // không mở ra được nữa, và bộ câu hỏi cũng không lọt ra ngoài.
        var now = DateTime.UtcNow;
        // Tách hai đầu của khung giờ: "chưa mở" và "đã hết hạn" là hai chuyện khác
        // nhau với người vào link, gộp chung một mã thì thông báo phải nói nước đôi.
        if (now < cached.StartTime)
        {
            return Blocked(SurveyErrorCodes.LinkNotStarted, cached);
        }

        if (now > cached.EndTime)
        {
            return Blocked(SurveyErrorCodes.LinkExpired, cached);
        }

        // Chặn theo sĩ số. KHÔNG đưa vào DTO đang cache 15 phút: số phiếu đổi liên
        // tục, cache lại thì lớp đã đủ vẫn mở thêm được cả một khắc đồng hồ.
        //
        // Đếm mọi lượt nộp chưa bị huỷ, kể cả phiếu bị bộ lọc nhiễu loại — một người
        // đã nộp là đã dùng một suất, không cho làm lại. Huỷ phiếu của lớp thì suất
        // được trả lại vì bộ lọc IsDeleted của EF loại chúng khỏi phép đếm.
        var capacity = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.LinkToken == token)
            .Select(x => new
            {
                ClassSize = db.CourseSections
                    .Where(section => section.CourseSectionId == x.CourseSectionId)
                    .Select(section => section.ClassSize)
                    .FirstOrDefault(),
                Submitted = db.SurveyResponses
                    .Count(response => response.CourseSectionSurveyId == x.CourseSectionSurveyId),
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (capacity is not null && capacity.ClassSize > 0 && capacity.Submitted >= capacity.ClassSize)
        {
            return Blocked(SurveyErrorCodes.ClassFull, cached);
        }

        return Succeeded(cached with { IsOpen = true });
    }

    /// <summary>
    /// Phiếu bị chặn: chưa tới giờ mở, đã hết hạn, hoặc lớp đã thu đủ phiếu. Kết quả là
    /// THẤT BẠI nhưng vẫn mang theo hình thức của đợt, để màn chặn hiện đúng màu và đúng
    /// câu chữ quản trị đã đặt lúc tạo đợt.
    ///
    /// Câu hỏi, thang và mục bị cắt sạch trước khi trả: link chưa mở hay đã hết hạn thì
    /// bộ câu hỏi không được lọt ra ngoài, kể cả khi người gọi sau này có đọc Value.
    /// </summary>
    private static SurveyOperationResult<PublicSurveyDto> Blocked(
        string errorCode,
        PublicSurveyDto cached) =>
        new(false, errorCode, cached with
        {
            IsOpen = false,
            AnswerScales = [],
            Sections = [],
            Questions = [],
        });

    public async Task<SurveyOperationResult<SubmitSurveyResponseDto>> SubmitSurveyResponseAsync(
        string linkToken,
        SubmitSurveyResponseCommand command,
        CancellationToken cancellationToken = default)
    {
        var token = linkToken?.Trim() ?? string.Empty;
        var publicSurveyResult = await GetPublicSurveyAsync(token, cancellationToken);
        if (!publicSurveyResult.Succeeded || publicSurveyResult.Value is not { } publicSurvey)
        {
            return Failed<SubmitSurveyResponseDto>(publicSurveyResult.ErrorCode ?? SurveyErrorCodes.LinkNotFound);
        }

        if (!publicSurvey.IsOpen)
        {
            return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.LinkNotOpen);
        }

        var sectionSurvey = await db.CourseSectionSurveys
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.LinkToken == token, cancellationToken);
        if (sectionSurvey is null)
        {
            return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.LinkNotFound);
        }

        // Mỗi câu có thang riêng nên tra được thang nào cho câu nào trước khi kiểm.
        var scaleById = publicSurvey.AnswerScales.ToDictionary(x => x.AnswerScaleId);
        var scaleOfQuestion = publicSurvey.Questions
            .Where(x => scaleById.ContainsKey(x.AnswerScaleId))
            .ToDictionary(x => x.QuestionId, x => scaleById[x.AnswerScaleId]);
        var questionIds = publicSurvey.Questions.Select(x => x.QuestionId).ToHashSet();

        // Mức bắt buộc của câu bẫy không nằm trong DTO công khai — để lộ ra thì
        // sinh viên biết luôn câu nào là bẫy — nên phải tra thẳng từ cơ sở dữ liệu.
        var attentionCheckByQuestion = await db.SurveyQuestions
            .AsNoTracking()
            .Where(x => questionIds.Contains(x.QuestionId) && x.AttentionCheckValue != null)
            .ToDictionaryAsync(x => x.QuestionId, x => x.AttentionCheckValue!.Value, cancellationToken);

        var answers = (command.Answers ?? [])
            .GroupBy(x => x.QuestionId)
            .Select(group => group.Last())
            .Select(x => new SubmitSurveyAnswerCommand(x.QuestionId, x.AnswerValue?.Trim() ?? string.Empty))
            .ToList();

        if (questionIds.Count == 0
            || answers.Count != questionIds.Count
            || answers.Any(answer => !questionIds.Contains(answer.QuestionId))
            || answers.Any(answer => answer.AnswerValue.Length == 0))
        {
            return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.AnswersIncomplete);
        }

        // Câu thang 'Options' phải gửi lên một mức có thật; câu thang 'Text' nhận
        // nguyên nội dung, chỉ giới hạn độ dài.
        var scoredValues = new List<int>();
        foreach (var answer in answers)
        {
            if (!scaleOfQuestion.TryGetValue(answer.QuestionId, out var scale))
            {
                return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.AnswerValueInvalid);
            }

            if (scale.ScaleKind == AnswerScaleKinds.Text)
            {
                if (answer.AnswerValue.Length > SurveyRules.MaximumTextAnswerLength)
                {
                    return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.AnswerTextTooLong);
                }
                continue;
            }

            if (!int.TryParse(answer.AnswerValue, out var selectedValue)
                || scale.Options.All(option => option.Value != selectedValue))
            {
                return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.AnswerValueInvalid);
            }

            // Câu bẫy vẫn phải là một mức hợp lệ nhưng không vào điểm trung bình.
            if (attentionCheckByQuestion.ContainsKey(answer.QuestionId)) continue;

            scoredValues.Add(selectedValue);
        }

        var comments = command.AdditionalComments?.Trim();
        if (comments is { Length: > MaximumCommentLength })
        {
            return Failed<SubmitSurveyResponseDto>(SurveyErrorCodes.CommentsTooLong);
        }

        // Lọc phiếu làm ẩu. Phiếu bị lọc vẫn được nhận và vẫn là một lượt nộp,
        // chỉ không tham gia vào điểm trung bình của lớp.
        var filterQuestions = publicSurvey.Questions
            .Select(question => new FilterQuestion(
                question.QuestionId,
                scaleOfQuestion.TryGetValue(question.QuestionId, out var scale)
                    ? scale.ScaleKind
                    : AnswerScaleKinds.Options,
                attentionCheckByQuestion.TryGetValue(question.QuestionId, out var required)
                    ? required
                    : null))
            .ToList();
        var filterAnswers = answers
            .Select(answer => new FilterAnswer(answer.QuestionId, answer.AnswerValue))
            .ToList();
        var filterResult = ResponseFilter.Evaluate(filterQuestions, filterAnswers, command.ElapsedSeconds);

        var now = DateTime.UtcNow;
        var response = new SurveyResponse
        {
            CourseSectionSurveyId = sectionSurvey.CourseSectionSurveyId,
            AdditionalComments = string.IsNullOrEmpty(comments) ? null : comments,
            Score = ComputeScore(scoredValues),
            IsValid = filterResult.IsValid,
            RejectionReasons = filterResult.RejectionReasons,
            SubmittedAt = now,
        };

        db.SurveyResponses.Add(response);
        db.SurveyResponseAnswers.AddRange(answers.Select(answer => new SurveyResponseAnswer
        {
            SurveyResponse = response,
            QuestionId = answer.QuestionId,
            AnswerValue = answer.AnswerValue,
        }));

        await db.SaveChangesAsync(cancellationToken);

        return Succeeded(new SubmitSurveyResponseDto(response.ResponseId, response.Score, response.SubmittedAt));
    }

    // ------------------------------------------------------------------ Helpers

    /// <summary>Các thang mà bộ câu hỏi của bài khảo sát đang dùng.</summary>
    private async Task<IReadOnlyList<AnswerScaleDto>> ScalesOfSectionSurveyAsync(
        CourseSectionSurvey sectionSurvey,
        CancellationToken cancellationToken)
    {
        var surveyTemplateId = await db.SemesterSurveys
            .Where(x => x.SemesterSurveyId == sectionSurvey.SemesterSurveyId)
            .Select(x => x.SurveyTemplateId)
            .FirstOrDefaultAsync(cancellationToken);

        return surveyTemplateId == 0
            ? []
            : await ScalesOfTemplateAsync(surveyTemplateId, cancellationToken);
    }

    /// <summary>
    /// Gộp các mức của mọi thang 'Options' theo giá trị số. Cùng một mức mà các
    /// thang đặt nhãn khác nhau thì hiển thị chung là "Mức n".
    /// </summary>
    private static IReadOnlyList<(int Value, string DisplayText)> MergedOptionValues(
        IReadOnlyList<AnswerScaleDto> scales)
    {
        return scales
            .Where(scale => scale.ScaleKind == AnswerScaleKinds.Options)
            .SelectMany(scale => scale.Options)
            .GroupBy(option => option.Value)
            .OrderBy(group => group.Key)
            .Select(group =>
            {
                var labels = group.Select(x => x.DisplayText).Distinct().ToList();
                return (group.Key, labels.Count == 1 ? labels[0] : $"Mức {group.Key}");
            })
            .ToList();
    }

    /// <summary>Đọc "AnswerValue" ra số mức; null nếu câu không thuộc thang 'Options'.</summary>
    private static int? SelectedValueOf(AnswerScaleDto? scale, string? answerValue)
    {
        if (scale is null || scale.ScaleKind != AnswerScaleKinds.Options) return null;
        return int.TryParse(answerValue, out var value) ? value : null;
    }

    /// <summary>Bảng tra thang trả lời theo từng câu hỏi của bài khảo sát một lớp.</summary>
    private async Task<Dictionary<int, AnswerScaleDto>> ScaleByQuestionAsync(
        CourseSectionSurvey sectionSurvey,
        IReadOnlyList<AnswerScaleDto> scales,
        CancellationToken cancellationToken)
    {
        if (scales.Count == 0) return [];

        var surveyTemplateId = await db.SemesterSurveys
            .AsNoTracking()
            .Where(x => x.SemesterSurveyId == sectionSurvey.SemesterSurveyId)
            .Select(x => x.SurveyTemplateId)
            .FirstOrDefaultAsync(cancellationToken);
        if (surveyTemplateId == 0) return [];

        var scaleById = scales.ToDictionary(x => x.AnswerScaleId);
        var pairs = await QuestionsOfTemplate(surveyTemplateId)
            .AsNoTracking()
            .Select(x => new { x.QuestionId, x.AnswerScaleId })
            .ToListAsync(cancellationToken);

        return pairs
            .Where(x => scaleById.ContainsKey(x.AnswerScaleId))
            .ToDictionary(x => x.QuestionId, x => scaleById[x.AnswerScaleId]);
    }

    /// <summary>
    /// Tổng lượt nộp và số phiếu qua được bộ lọc, gộp trong một lượt truy vấn.
    /// Trang Tiến độ thu phiếu cần cả hai để tính tiến độ trên phiếu hợp lệ.
    /// </summary>
    private async Task<Dictionary<int, (int Total, int Valid)>> ResponseValidityCountsAsync(
        IReadOnlyList<int> courseSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (courseSectionSurveyIds.Count == 0)
        {
            return [];
        }

        // Đọc lại "RejectionReasons" thay vì dùng cột "IsValid" đã chốt lúc nộp: luật
        // nào đang được áp là do quản trị bật tắt. Viết thẳng ra đây chứ không gọi
        // ResponseInclusion.CountsTowardScore() vì EF không dịch được một Expression
        // lồng trong Count(...) của GroupBy.
        var thresholds = await scoringThresholds.GetAsync(cancellationToken);
        var rejectTooFast = thresholds.RejectTooFast;
        var rejectSingleAnswer = thresholds.RejectSingleAnswer;
        var rejectAttentionCheck = thresholds.RejectAttentionCheckFailed;

        var counts = await db.SurveyResponses
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId) && !x.IsDeleted)
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(group => new
            {
                CourseSectionSurveyId = group.Key,
                Total = group.Count(),
                Valid = group.Count(x =>
                    x.RejectionReasons == null
                    || ((!rejectTooFast
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.TooFast))
                        && (!rejectSingleAnswer
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.SingleAnswer))
                        && (!rejectAttentionCheck
                            || !x.RejectionReasons.Contains(RejectionReasonCodes.AttentionCheckFailed))))
            })
            .ToListAsync(cancellationToken);

        return counts.ToDictionary(x => x.CourseSectionSurveyId, x => (x.Total, x.Valid));
    }

    private async Task<Dictionary<int, int>> ResponseCountsAsync(
        IReadOnlyList<int> courseSectionSurveyIds,
        CancellationToken cancellationToken)
    {
        if (courseSectionSurveyIds.Count == 0)
        {
            return [];
        }

        var counts = await db.SurveyResponses
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId) && !x.IsDeleted)
            .GroupBy(x => x.CourseSectionSurveyId)
            .Select(group => new { CourseSectionSurveyId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return counts.ToDictionary(x => x.CourseSectionSurveyId, x => x.Count);
    }

    // ------------------------------------------- Tính điểm lớp theo mẻ (nhóm C)

    public async Task<SurveyOperationResult<RecalculateScoresDto>> RecalculateSemesterSurveyScoresAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        // Ghi đè điểm của MỌI lớp trong đợt, không có cách nào giới hạn theo đơn vị.
        // Cùng mức quyền với tạo/xoá đợt: trưởng bộ môn không được chốt điểm cho cả
        // trường chỉ vì họ mở được trang bảng dữ liệu.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return Failed<RecalculateScoresDto>(SurveyErrorCodes.OutOfScope);
        }

        var exists = await db.SemesterSurveys
            .AnyAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (!exists)
        {
            return Failed<RecalculateScoresDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Đã phát hành thì trưởng khoa, trưởng bộ môn, giảng viên đang đọc đúng bộ điểm
        // này; tính lại là đổi số dưới chân họ. Phải thu hồi phát hành rồi mới tính lại.
        var publicationState = await publication.GetAsync(semesterSurveyId, cancellationToken);
        if (publicationState.Value?.IsPublished == true)
        {
            return Failed<RecalculateScoresDto>(SurveyErrorCodes.ResultsPublishedLocked);
        }

        var calculatedAt = DateTime.UtcNow;

        // Cả ba câu phải cùng ăn hoặc cùng bỏ: điểm tổng hợp của lớp và điểm từng
        // câu là hai mặt của cùng một lần chốt, lệch nhau thì bảng đọc ra số vô lý.
        //
        // Người gọi đã mở transaction sẵn thì tham gia vào đó chứ không mở lồng —
        // Npgsql không cho lồng transaction.
        var ownTransaction = db.Database.CurrentTransaction is null
            ? await db.Database.BeginTransactionAsync(cancellationToken)
            : null;
        await using var transactionScope = ownTransaction;

        // CẢNH BÁO: cả ba câu dưới đây là SQL THÔ nên KHÔNG hưởng query filter của
        // EF. Mọi điều kiện lọc phải viết tay, kể cả NOT "IsDeleted" của phiếu —
        // thiếu nó thì bấm tính lại sau khi huỷ phiếu sẽ hồi sinh đúng đám vừa xoá.
        //
        // Một câu UPDATE ... FROM chạy trọn trong Postgres: dù đợt có bao nhiêu
        // nghìn phiếu cũng không kéo dòng nào về bộ nhớ ứng dụng.
        // LEFT JOIN để lớp chưa có phiếu nào cũng được ghi về 0 thay vì giữ số cũ.
        //
        // Số ĐẾM phiếu ghi cho mọi lớp — đếm thì không méo. Riêng ĐIỂM chỉ chốt cho
        // lớp đã thu đủ phiếu: điểm của lớp hai người đánh giá không so được với lớp
        // ba mươi người, gộp vào là kéo lệch mọi con số tổng hợp phía trên. Lớp chưa
        // đủ nhận NULL, bảng đọc ra "chưa đủ phiếu".
        // Điều kiện phải trùng khít ScoringThresholds.HasEnoughResponsesToScore:
        // hai vòng lọc, không có ngoại lệ nào khác.
        var thresholds = await scoringThresholds.GetAsync(cancellationToken);
        var minimumResponseRate = thresholds.MinimumResponseRate;
        var minimumValidRate = thresholds.MinimumValidRate;

        // Ba cờ bật tắt từng luật của bộ lọc nhiễu. Phiếu "được tính" là phiếu không
        // dính bất kỳ luật nào ĐANG BẬT — đọc từ "RejectionReasons" ghi lúc nộp, nên
        // bật tắt lại bao nhiêu lần cũng không ghi đè một dòng phiếu nào.
        //
        // Tính sẵn thành cột `counted` trong một bảng dẫn xuất để biểu thức chỉ phải
        // viết một lần, dù phía dưới dùng tới ba lần (đếm, điểm trung bình, vòng 2).
        var rejectTooFast = thresholds.RejectTooFast;
        var rejectSingleAnswer = thresholds.RejectSingleAnswer;
        var rejectAttentionCheck = thresholds.RejectAttentionCheckFailed;
        var updated = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE "CourseSectionSurveys" AS css
            SET "TotalResponseCount"   = agg.total_count,
                "ValidResponseCount"   = agg.valid_count,
                "InvalidResponseCount" = agg.total_count - agg.valid_count,
                "AverageScore"         = CASE WHEN agg.has_enough THEN agg.average_score END,
                "ScoreCalculatedAt"    = {calculatedAt}
            FROM (
                SELECT c."CourseSectionSurveyId" AS id,
                       count(r.*)                                        AS total_count,
                       count(r.*) FILTER (WHERE r.counted)               AS valid_count,
                       round(avg(r."Score") FILTER (WHERE r.counted), 2) AS average_score,
                       s."ClassSize" > 0
                       AND count(r.*) > 0
                       AND count(r.*)::numeric / s."ClassSize" * 100 >= {minimumResponseRate}
                       AND count(r.*) FILTER (WHERE r.counted)::numeric
                           / count(r.*) * 100 >= {minimumValidRate} AS has_enough
                FROM "CourseSectionSurveys" c
                JOIN "CourseSections" s ON s."CourseSectionId" = c."CourseSectionId"
                LEFT JOIN (
                    SELECT sr."CourseSectionSurveyId",
                           sr."Score",
                           (sr."RejectionReasons" IS NULL
                            OR ((NOT {rejectTooFast}
                                 OR position('TOO_FAST' in sr."RejectionReasons") = 0)
                            AND (NOT {rejectSingleAnswer}
                                 OR position('SINGLE_ANSWER' in sr."RejectionReasons") = 0)
                            AND (NOT {rejectAttentionCheck}
                                 OR position('ATTENTION_CHECK_FAILED' in sr."RejectionReasons") = 0)))
                           AS counted
                    FROM "SurveyResponses" sr
                    WHERE NOT sr."IsDeleted"
                ) r ON r."CourseSectionSurveyId" = c."CourseSectionSurveyId"
                WHERE c."SemesterSurveyId" = {semesterSurveyId}
                  AND NOT c."IsDeleted"
                GROUP BY c."CourseSectionSurveyId", s."ClassSize"
            ) AS agg
            WHERE css."CourseSectionSurveyId" = agg.id
            """, cancellationToken);

        // Xoá trắng rồi ghi lại thay vì UPSERT: câu bị gỡ khỏi bộ câu hỏi, hoặc
        // lớp bị xoá hết phiếu, thì dòng cũ phải biến mất chứ không được đứng lại.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            DELETE FROM "CourseSectionSurveyQuestionScores" AS q
            USING "CourseSectionSurveys" AS c
            WHERE q."CourseSectionSurveyId" = c."CourseSectionSurveyId"
              AND c."SemesterSurveyId" = {semesterSurveyId}
            """, cancellationToken);

        // Gộp điểm từng câu ngay trong Postgres. Cùng bộ điều kiện với điểm phiếu:
        // chỉ phiếu hợp lệ, bỏ câu bẫy và câu tự nhập chữ. Câu chưa ai trả lời thì
        // không sinh dòng — bảng hiển thị sẽ đọc ra "chưa có số".
        //
        // Điều kiện đủ phiếu đọc lại từ "AverageScore" mà câu UPDATE ở trên vừa ghi,
        // chứ không viết lại phép so ngưỡng lần thứ hai: hai câu nằm trong cùng một
        // transaction, nên lớp nào bị bỏ điểm tổng hợp thì cũng bị bỏ điểm từng câu,
        // không có cách nào lệch nhau.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "CourseSectionSurveyQuestionScores"
                ("CourseSectionSurveyId", "QuestionId", "AverageScore", "AnswerCount")
            SELECT r."CourseSectionSurveyId",
                   a."QuestionId",
                   round(avg(a."AnswerValue"::numeric), 2),
                   count(*)
            FROM "SurveyResponses" AS r
            JOIN "SurveyResponseAnswers" AS a ON a."ResponseId" = r."ResponseId"
            JOIN "CourseSectionSurveys" AS c ON c."CourseSectionSurveyId" = r."CourseSectionSurveyId"
            JOIN "SurveyQuestions" AS q ON q."QuestionId" = a."QuestionId"
            JOIN "AnswerScales" AS s ON s."AnswerScaleId" = q."AnswerScaleId"
            WHERE c."SemesterSurveyId" = {semesterSurveyId}
              AND NOT c."IsDeleted"
              AND NOT r."IsDeleted"
              AND c."AverageScore" IS NOT NULL
              AND (r."RejectionReasons" IS NULL
                   OR ((NOT {rejectTooFast}
                        OR position('TOO_FAST' in r."RejectionReasons") = 0)
                   AND (NOT {rejectSingleAnswer}
                        OR position('SINGLE_ANSWER' in r."RejectionReasons") = 0)
                   AND (NOT {rejectAttentionCheck}
                        OR position('ATTENTION_CHECK_FAILED' in r."RejectionReasons") = 0)))
              AND NOT q."IsDeleted"
              AND q."AttentionCheckValue" IS NULL
              AND s."ScaleKind" = {AnswerScaleKinds.Options}
            GROUP BY r."CourseSectionSurveyId", a."QuestionId"
            """, cancellationToken);

        // Ghi lại lần tính này cùng bộ cấu hình vừa dùng, trong cùng transaction: các
        // trang thống kê dựa vào đây để báo cho người khác biết điểm đã đổi theo cấu
        // hình nào.
        await scoringThresholds.RecordRecalculationAsync(
            semesterSurveyId, thresholds, calculatedAt, cancellationToken);

        if (ownTransaction is not null)
        {
            await ownTransaction.CommitAsync(cancellationToken);
        }

        // Tổng quan toàn trường có cache 90 giây. Đây là thao tác làm điểm đổi trên
        // diện rộng nhất của cả hệ thống, không dọn cache thì bấm xong mở Thống kê &
        // Báo cáo hay Bảng điều khiển vẫn thấy số của lần chốt trước tới một phút
        // rưỡi — mọi hồ sơ đều dính, không riêng người vừa bấm.
        schoolOverviewCache.Bump();

        return Succeeded(new RecalculateScoresDto(semesterSurveyId, updated, calculatedAt));
    }

    public async Task<SurveyOperationResult<SemesterSurveyStatisticsDto>> GetSemesterSurveyStatisticsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);

        var semesterSurvey = await db.SemesterSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (semesterSurvey is null)
        {
            return Failed<SemesterSurveyStatisticsDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SemesterSurveyStatisticsDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        var template = await db.SurveyTemplates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);
        var semester = await db.Semesters.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterId == semesterSurvey.SemesterId, cancellationToken);
        var academicYear = semester is null
            ? null
            : await db.AcademicYears.AsNoTracking()
                .FirstOrDefaultAsync(x => x.AcademicYearId == semester.AcademicYearId, cancellationToken);

        // Bỏ câu bẫy ra TRƯỚC rồi mới đánh số, nên bộ 26 câu có hai bẫy cho ra
        // C1..C24 liền mạch. Câu tự nhập vẫn giữ số của nó, chỉ không thành cột
        // điểm. Cách đánh này phải giống hệt QuestionOrderMapAsync.
        var allQuestions = await (
            from q in QuestionsOfTemplate(semesterSurvey.SurveyTemplateId).AsNoTracking()
            join s in db.AnswerScales.AsNoTracking() on q.AnswerScaleId equals s.AnswerScaleId
            orderby q.QuestionId
            select new { q.QuestionId, q.QuestionText, q.AttentionCheckValue, s.ScaleKind })
            .ToListAsync(cancellationToken);

        var questionColumns = allQuestions
            .Where(x => x.AttentionCheckValue == null)
            .Select((q, index) => new { Question = q, Order = index + 1 })
            .Where(x => x.Question.ScaleKind == AnswerScaleKinds.Options)
            .Select(x => new StatisticsQuestionColumnDto(
                x.Question.QuestionId,
                x.Order,
                x.Question.QuestionText))
            .ToList();
        var scoredQuestionIds = questionColumns.Select(x => x.QuestionId).ToList();

        var attentionCheckCount = allQuestions.Count(x => x.AttentionCheckValue != null);

        // Bảng dữ liệu đi theo lớp nên thừa hưởng đúng phạm vi của lớp, giống hệt
        // GetCourseSectionSurveysAsync: giảng viên chỉ thấy lớp mình dạy, trưởng bộ
        // môn chỉ thấy lớp có học phần thuộc bộ môn mình. Bảng này không có con số
        // mặt bằng nào để giữ — dòng "Tổng kết" là tổng của đúng phần đang hiện —
        // nên lọc thẳng ở đây chứ không phải lọc ở bước cuối như các sheet phân tích.
        var sectionSurveyQuery = db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId);
        if (scope.SeesNothing)
        {
            sectionSurveyQuery = sectionSurveyQuery.Where(_ => false);
        }
        else if (scope.SeesOnlyOwn)
        {
            sectionSurveyQuery = sectionSurveyQuery.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && section.LecturerId == scope.LecturerId));
        }
        else if (scope.SeesWholeFaculty)
        {
            sectionSurveyQuery = sectionSurveyQuery.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && db.Courses.Any(course =>
                                    course.CourseId == section.CourseId
                                    && course.FacultyId == scope.FacultyId)));
        }
        else if (!scope.SeesEverything)
        {
            sectionSurveyQuery = sectionSurveyQuery.Where(x => db.CourseSections
                .Any(section => section.CourseSectionId == x.CourseSectionId
                                && db.Courses.Any(course =>
                                    course.CourseId == section.CourseId
                                    && course.DepartmentId == scope.DepartmentId)));
        }

        var sectionSurveys = await sectionSurveyQuery.ToListAsync(cancellationToken);
        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();

        var sections = await db.CourseSections.AsNoTracking()
            .Where(x => sectionSurveys.Select(s => s.CourseSectionId).Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);
        var courses = await db.Courses.AsNoTracking()
            .Where(x => sections.Select(s => s.CourseId).Contains(x.CourseId))
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);
        var lecturers = await db.Lecturers.AsNoTracking().ToDictionaryAsync(x => x.LecturerId, x => x, cancellationToken);
        var departments = await db.Departments.AsNoTracking().ToDictionaryAsync(x => x.DepartmentId, x => x.DepartmentName, cancellationToken);
        // Khoa/viện của dòng suy từ bộ môn của dòng, để giao diện tìm theo khoa/viện.
        var facultyIdOfDepartment = await db.Departments.AsNoTracking()
            .Where(x => x.FacultyId != null)
            .ToDictionaryAsync(x => x.DepartmentId, x => x.FacultyId!.Value, cancellationToken);
        var facultyNames = await db.Faculties.AsNoTracking()
            .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);

        // Điểm từng câu: đọc bảng đã gộp sẵn, KHÔNG gộp lại từ phiếu. Đây là lý do
        // mở trang không còn phải đụng tới "SurveyResponseAnswers" — bảng nặng nhất
        // hệ thống. Lớp nào chưa được chốt điểm thì đơn giản là chưa có dòng nào.
        var questionScores = cssIds.Count == 0 || scoredQuestionIds.Count == 0
            ? []
            : await db.CourseSectionSurveyQuestionScores.AsNoTracking()
                .Where(x => cssIds.Contains(x.CourseSectionSurveyId)
                    && scoredQuestionIds.Contains(x.QuestionId))
                .ToListAsync(cancellationToken);

        var scoresBySection = questionScores
            .GroupBy(x => x.CourseSectionSurveyId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(x => x.QuestionId, x => x));

        // Số phiếu đếm TRỰC TIẾP từ "SurveyResponses" để phản ánh số phiếu thực tế
        // sinh viên đã nộp tại thời điểm xem.
        // Riêng điểm trung bình và điểm từng câu vẫn đọc từ ảnh chụp đã chốt
        // để đảm bảo không bị nhảy múa khi chưa bấm nút "Tính lại điểm".
        var liveValidityCounts = await ResponseValidityCountsAsync(cssIds, cancellationToken);
        var responseTallies = sectionSurveys.ToDictionary(
            x => x.CourseSectionSurveyId,
            x => liveValidityCounts.TryGetValue(x.CourseSectionSurveyId, out var counts)
                ? new { Total = counts.Total, Valid = counts.Valid }
                : new { Total = 0, Valid = 0 });

        // Số phiếu có điền ô "Ý kiến khác" — chỉ đếm ô cuối bài, không đếm câu
        // thuộc thang tự nhập chữ.
        var commentCounts = cssIds.Count == 0
            ? []
            : await db.SurveyResponses.AsNoTracking()
                .Where(x => cssIds.Contains(x.CourseSectionSurveyId)
                    && x.AdditionalComments != null
                    && x.AdditionalComments != "")
                .GroupBy(x => x.CourseSectionSurveyId)
                .Select(g => new { CourseSectionSurveyId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.CourseSectionSurveyId, x => x.Count, cancellationToken);

        var lastCalculatedAt = sectionSurveys
            .Where(x => x.ScoreCalculatedAt is not null)
            .Select(x => x.ScoreCalculatedAt!.Value)
            .DefaultIfEmpty()
            .Max();
        var lastCalculated = lastCalculatedAt == default ? (DateTime?)null : lastCalculatedAt;
        var lastCalculatedByEmail = lastCalculated is null
            ? null
            : await (
                from change in db.SurveyScoringChangeLogs.AsNoTracking()
                join user in db.Users.AsNoTracking()
                    on change.ChangedByUserId equals user.Id into users
                from user in users.DefaultIfEmpty()
                where change.SemesterSurveyId == semesterSurveyId
                    && change.Kind == ScoringChangeKinds.ScoresRecalculated
                orderby change.ChangedAt descending, change.SurveyScoringChangeLogId descending
                select user != null ? user.Email : null)
                .FirstOrDefaultAsync(cancellationToken);

        // Phiếu về sau lần tính gần nhất: dấu hiệu con số đang xem đã cũ.
        var responsesSince = lastCalculated is null || cssIds.Count == 0
            ? 0
            : await db.SurveyResponses.AsNoTracking()
                .CountAsync(x => cssIds.Contains(x.CourseSectionSurveyId)
                    && x.SubmittedAt > lastCalculated.Value, cancellationToken);

        var rows = new List<SectionStatisticsRowDto>(sectionSurveys.Count);
        foreach (var css in sectionSurveys)
        {
            var section = sections.FirstOrDefault(x => x.CourseSectionId == css.CourseSectionId);
            var course = section is not null && courses.TryGetValue(section.CourseId, out var c) ? c : null;
            var lecturer = section?.LecturerId is { } lecId && lecturers.TryGetValue(lecId, out var l) ? l : null;
            var departmentId = course?.DepartmentId ?? lecturer?.DepartmentId;

            // Câu chưa được chốt điểm trả về AnswerCount = 0; giao diện đọc đúng
            // dấu hiệu đó để hiện gạch ngang thay vì số 0 gây hiểu nhầm là điểm kém.
            var perQuestion = scoresBySection.GetValueOrDefault(css.CourseSectionSurveyId);
            var columnScores = questionColumns
                .Select(column =>
                {
                    var stat = perQuestion?.GetValueOrDefault(column.QuestionId);
                    return new SectionQuestionScoreDto(
                        column.QuestionId,
                        stat?.AverageScore ?? 0m,
                        stat?.AnswerCount ?? 0);
                })
                .ToList();

            var weakest = columnScores
                .Where(x => x.AnswerCount > 0)
                .OrderBy(x => x.AverageScore)
                .FirstOrDefault();

            var tally = responseTallies.GetValueOrDefault(css.CourseSectionSurveyId);
            var totalResponses = tally?.Total ?? 0;
            var validResponses = tally?.Valid ?? 0;

            var classSize = section?.ClassSize ?? 0;
            rows.Add(new SectionStatisticsRowDto(
                css.CourseSectionId,
                css.CourseSectionSurveyId,
                course?.CourseCode ?? string.Empty,
                course?.CourseName ?? string.Empty,
                section?.SectionName ?? string.Empty,
                departmentId is { } dId && departments.TryGetValue(dId, out var dn) ? dn : "Chưa thuộc bộ môn",
                // Lớp import thiếu email giảng viên thì hiện tên đọc được từ tệp.
                lecturer?.FullName ?? section?.UnidentifiedLecturerName ?? "Chưa phân công",
                classSize,
                totalResponses,
                validResponses,
                totalResponses - validResponses,
                // Chỉ đếm phiếu hợp lệ: phiếu bị bộ lọc nhiễu loại vẫn là một lượt
                // nộp nhưng không dùng được vào kết quả nào, tính nó vào tỷ lệ là
                // tự huyễn hoặc. Cùng cách tính với bảng tiến độ và tra cứu chi tiết.
                classSize > 0 ? Math.Round((decimal)validResponses / classSize * 100, 3) : 0m,
                css.AverageScore,
                css.ScoreCalculatedAt,
                commentCounts.GetValueOrDefault(css.CourseSectionSurveyId),
                weakest?.QuestionId,
                weakest?.AverageScore,
                columnScores,
                departmentId is { } fdId
                    && facultyIdOfDepartment.TryGetValue(fdId, out var facultyId)
                    && facultyNames.TryGetValue(facultyId, out var facultyName)
                    ? facultyName
                    : string.Empty));
        }

        return Succeeded(new SemesterSurveyStatisticsDto(
            semesterSurveyId,
            template?.TemplateName ?? string.Empty,
            semester?.SemesterName ?? string.Empty,
            academicYear?.AcademicYearName ?? string.Empty,
            lastCalculated,
            lastCalculatedByEmail,
            responsesSince,
            questionColumns,
            attentionCheckCount,
            rows.OrderBy(x => x.CourseCode).ThenBy(x => x.SectionName).ToList()));
    }

    // ------------------------------- Sheet 1 và 3: phân tích chuyên sâu

    /// <summary>
    /// Một lớp đã có phiếu, kèm đủ thông tin quy về khoa/bộ môn. Dùng chung cho
    /// cả hai sheet để chỉ phải viết một lần phần quy thuộc đơn vị.
    /// </summary>
    private sealed record AnalysedSection(
        int CourseSectionSurveyId,
        int CourseSectionId,
        int CourseId,
        string CourseCode,
        string CourseName,
        string SectionName,
        string LecturerName,
        int? LecturerId,
        /// <summary>Tên đọc từ tệp import khi lớp chưa gắn được mã giảng viên.</summary>
        string? UnidentifiedLecturerName,
        int ClassSize,
        int ResponseCount,
        /// <summary>Số phiếu qua được bộ lọc nhiễu.</summary>
        int ValidResponseCount,
        decimal ValidTotalScore,
        decimal AverageScore,
        int? FacultyId,
        string FacultyName,
        int? DepartmentId,
        string DepartmentName);

    /// <summary>
    /// Điểm trung bình của một nhóm lớp: cộng dồn tử số và mẫu số rồi mới chia, không
    /// lấy trung bình của các trung bình — lớp 50 phiếu phải nặng hơn lớp 5 phiếu.
    /// Đúng công thức của điểm toàn trường ở trang Tổng quan và của bảng xếp hạng
    /// Khoa / Bộ môn.
    ///
    /// Cột Z-Score thì KHÔNG dùng hàm này: ở đó mỗi LỚP là một quan sát chứ không
    /// phải mỗi phiếu, nên mặt bằng phải là trung bình không trọng số.
    /// </summary>
    private static decimal? WeightedAverageScore(IEnumerable<AnalysedSection> sections)
    {
        decimal scoreSum = 0;
        int responseSum = 0;

        foreach (var section in sections)
        {
            scoreSum += section.AverageScore * section.ValidResponseCount;
            responseSum += section.ValidResponseCount;
        }

        return responseSum > 0 ? Math.Round(scoreSum / responseSum, 3) : null;
    }

    /// <summary>
    /// Lọc danh sách lớp xuống phạm vi người xem.
    /// <para>
    /// Chỉ được gọi ở BƯỚC CUỐI, khi dựng danh sách trả về. Mọi con số mặt bằng —
    /// điểm trung bình toàn trường, độ lệch chuẩn, z-score — phải tính TRƯỚC đó trên
    /// toàn bộ dữ liệu. Lọc sớm thì mặt bằng bị tính lại trên vài chục lớp của một bộ
    /// môn, ra con số hoàn toàn khác và mất hết ý nghĩa: lớp yếu của một bộ môn yếu sẽ
    /// hoá thành "đạt mặt bằng". Xem congviec2.md mục D6.
    /// </para>
    /// </summary>
    private static List<AnalysedSection> VisibleTo(UserScope scope, List<AnalysedSection> sections) =>
        scope.SeesEverything
            ? sections
            : scope.SeesWholeFaculty
                ? scope.FacultyId is { } facultyId
                    ? sections.Where(x => x.FacultyId == facultyId).ToList()
                    : []
                : scope.DepartmentId is { } departmentId
                    ? sections.Where(x => x.DepartmentId == departmentId).ToList()
                    : [];

    /// <summary>
    /// Lọc danh sách lớp của một học kỳ về phạm vi người xem, dùng khi dựng và mở rộng
    /// phạm vi phát phiếu. Trưởng khoa/viện lấy cả khoa, trưởng bộ môn lấy một bộ môn.
    /// </summary>
    private static List<SectionUnit> UnitsInScope(UserScope scope, List<SectionUnit> units) =>
        scope.SeesEverything
            ? units
            : scope.SeesWholeFaculty
                ? units.Where(x => x.FacultyId == scope.FacultyId).ToList()
                : units.Where(x => x.DepartmentId == scope.DepartmentId).ToList();

    /// <summary>
    /// Đếm giảng viên của một nhóm lớp. Lớp chưa gắn được mã vẫn tính nếu đọc
    /// được tên từ tệp import, vì đó vẫn là một người dạy thật; chỉ lớp không có
    /// cả mã lẫn tên mới bị bỏ qua. Nhóm theo tên nên hai người trùng tên chưa
    /// xác định bị đếm gộp làm một — không tránh được khi thiếu email.
    /// </summary>
    private static int CountLecturers(IEnumerable<AnalysedSection> sections) =>
        sections
            .Select(x => x.LecturerId is { } lecturerId
                ? $"id:{lecturerId}"
                : string.IsNullOrWhiteSpace(x.UnidentifiedLecturerName)
                    ? null
                    : $"name:{x.UnidentifiedLecturerName.Trim().ToLowerInvariant()}")
            .Where(x => x is not null)
            .Distinct()
            .Count();

    /// <summary>
    /// Nạp các lớp của một đợt kèm điểm tính TRỰC TIẾP từ phiếu hợp lệ. Cố ý
    /// không đọc cột <c>AverageScore</c> đã lưu, vì đó là ảnh chụp của lần bấm
    /// nút gần nhất; báo cáo thì phải phản ánh dữ liệu tại thời điểm xem.
    ///
    /// Lớp chưa thu đủ phiếu bị loại khỏi MỌI phép tính mặt bằng, theo đúng
    /// <see cref="ReportThresholds.HasEnoughResponsesToScore"/> — cùng ngưỡng với
    /// nút tính điểm theo mẻ. Một lớp hai người đánh giá mà đứng ngang hàng với
    /// lớp ba mươi người thì trung bình khoa, độ lệch chuẩn và mọi z-score dựng
    /// trên đó đều lệch.
    /// </summary>
    private async Task<List<AnalysedSection>> LoadAnalysedSectionsAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken)
    {
        var sectionSurveys = await db.CourseSectionSurveys.AsNoTracking()
            .Where(x => x.SemesterSurveyId == semesterSurveyId)
            .ToListAsync(cancellationToken);
        if (sectionSurveys.Count == 0) return [];

        var cssIds = sectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();

        // Ảnh chụp của lần chốt gần nhất, không gộp lại từ bảng phiếu — xem ghi chú
        // ở GetSemesterSurveyStatisticsAsync. Lớp chưa được chốt điểm có
        // AverageScore null và bị loại ngay bên dưới.
        var tallies = sectionSurveys.ToDictionary(
            x => x.CourseSectionSurveyId,
            x => new
            {
                x.CourseSectionSurveyId,
                TotalCount = x.TotalResponseCount,
                ValidCount = x.ValidResponseCount,
                ValidTotal = (x.AverageScore ?? 0m) * x.ValidResponseCount,
                IsScored = x.AverageScore is not null,
            });

        var sectionIds = sectionSurveys.Select(x => x.CourseSectionId).ToList();
        var sections = await db.CourseSections.AsNoTracking()
            .Where(x => sectionIds.Contains(x.CourseSectionId))
            .ToListAsync(cancellationToken);
        var courses = await db.Courses.AsNoTracking()
            .Where(x => sections.Select(s => s.CourseId).Contains(x.CourseId))
            .ToDictionaryAsync(x => x.CourseId, x => x, cancellationToken);
        var lecturers = await db.Lecturers.AsNoTracking()
            .ToDictionaryAsync(x => x.LecturerId, x => x, cancellationToken);
        var departments = await db.Departments.AsNoTracking()
            .ToDictionaryAsync(x => x.DepartmentId, x => x, cancellationToken);
        var faculties = await db.Faculties.AsNoTracking()
            .ToDictionaryAsync(x => x.FacultyId, x => x.FacultyName, cancellationToken);

        var result = new List<AnalysedSection>(sectionSurveys.Count);
        foreach (var css in sectionSurveys)
        {
            if (!tallies.TryGetValue(css.CourseSectionSurveyId, out var tally)
                || tally.ValidCount == 0)
            {
                continue;
            }

            var section = sections.FirstOrDefault(x => x.CourseSectionId == css.CourseSectionId);

            // Không được chốt điểm ở lần tính gần nhất thì lớp không góp vào bất kỳ
            // con số nào của trang phân tích.
            if (!tally.IsScored)
            {
                continue;
            }

            var course = section is not null && courses.TryGetValue(section.CourseId, out var c) ? c : null;
            var lecturer = section?.LecturerId is { } lecId && lecturers.TryGetValue(lecId, out var l) ? l : null;

            // Quy thuộc đơn vị: ưu tiên đơn vị sở hữu học phần, không có thì lấy
            // theo giảng viên. Khoa suy từ bộ môn nếu học phần không ghi khoa.
            var departmentId = course?.DepartmentId ?? lecturer?.DepartmentId;
            var facultyId = course?.FacultyId;
            if (facultyId is null && departmentId is { } dId && departments.TryGetValue(dId, out var dept))
            {
                facultyId = dept.FacultyId;
            }
            facultyId ??= lecturer?.FacultyId;

            result.Add(new AnalysedSection(
                css.CourseSectionSurveyId,
                css.CourseSectionId,
                section?.CourseId ?? 0,
                course?.CourseCode ?? string.Empty,
                course?.CourseName ?? string.Empty,
                section?.SectionName ?? string.Empty,
                lecturer?.FullName ?? section?.UnidentifiedLecturerName ?? "Chưa phân công",
                section?.LecturerId,
                section?.UnidentifiedLecturerName,
                section?.ClassSize ?? 0,
                tally.TotalCount,
                tally.ValidCount,
                tally.ValidTotal,
                Math.Round(tally.ValidTotal / tally.ValidCount, 3),
                facultyId,
                facultyId is { } fId && faculties.TryGetValue(fId, out var fn) ? fn : "Chưa thuộc khoa",
                departmentId,
                departmentId is { } dId2 && departments.TryGetValue(dId2, out var dp)
                    ? dp.DepartmentName
                    : "Chưa thuộc bộ môn"));
        }

        return result;
    }

    /// <summary>Điểm của một câu trong phạm vi một lớp, dạng thô để còn gộp tiếp.</summary>
    private sealed record SectionQuestionStat(
        int CourseSectionSurveyId,
        int QuestionId,
        int AnswerCount,
        decimal Total)
    {
        public decimal Average => AnswerCount == 0 ? 0m : Total / AnswerCount;
    }

    /// <summary>
    /// Điểm từng câu của từng lớp, gộp một lượt trong SQL. Chỉ phiếu hợp lệ.
    /// Đây là đơn vị nhỏ nhất mà sheet 3, 4, 5 đều gộp lên từ đó.
    /// </summary>
    private async Task<List<SectionQuestionStat>> SectionQuestionStatsAsync(
        IReadOnlyCollection<int> courseSectionSurveyIds,
        IReadOnlyCollection<int> questionIds,
        CancellationToken cancellationToken)
    {
        if (courseSectionSurveyIds.Count == 0 || questionIds.Count == 0) return [];

        // Chỉ phiếu qua được những luật lọc nhiễu đang bật.
        var statThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var countedResponseIds = db.SurveyResponses.AsNoTracking()
            .Where(x => courseSectionSurveyIds.Contains(x.CourseSectionSurveyId))
            .Where(statThresholds.CountsTowardScore())
            .Select(x => x.ResponseId);

        var rows = await (
            from r in db.SurveyResponses.AsNoTracking()
            join a in db.SurveyResponseAnswers.AsNoTracking() on r.ResponseId equals a.ResponseId
            where courseSectionSurveyIds.Contains(r.CourseSectionSurveyId)
              && countedResponseIds.Contains(r.ResponseId)
              && questionIds.Contains(a.QuestionId)
            group a by new { r.CourseSectionSurveyId, a.QuestionId } into g
            select new
            {
                g.Key.CourseSectionSurveyId,
                g.Key.QuestionId,
                Count = g.Count(),
                Total = g.Sum(x => Convert.ToDecimal(x.AnswerValue))
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(x => new SectionQuestionStat(x.CourseSectionSurveyId, x.QuestionId, x.Count, x.Total))
            .ToList();
    }

    /// <summary>
    /// Mốc "lớp cảnh báo": điểm ứng với Z-Score = −1 so với mặt bằng toàn đợt, tức
    /// <c>Trung bình − Độ lệch chuẩn</c>. Thay cho ngưỡng cứng 3.20 cũ — con số đó
    /// chép tay từ bản mô phỏng Excel, không tự trôi theo mặt bằng từng kỳ và áp
    /// chung một mức cho mọi khoa dù độ tản của các khoa khác nhau.
    /// Null khi chưa đủ hai lớp để có độ lệch chuẩn.
    /// </summary>
    private static decimal? WarningScoreCutoff(IReadOnlyList<decimal> scores)
    {
        var sd = SampleStandardDeviation(scores);
        return sd is > 0
            ? Math.Round(scores.Average() - ReportThresholds.NotableZScore * sd.Value, 3)
            : null;
    }

    /// <summary>
    /// Dựng sẵn hàm tính Z-Score cho một nhóm lớp: <c>(Điểm lớp − Trung bình nhóm)
    /// ÷ Độ lệch chuẩn nhóm</c>. Trả về hàm luôn ra null khi nhóm không đủ lớp hoặc
    /// mọi lớp cùng điểm, thay vì chia cho 0.
    /// </summary>
    private static Func<decimal, decimal?> ZScorerOver(IReadOnlyList<decimal> groupScores)
    {
        var sd = SampleStandardDeviation(groupScores);
        if (groupScores.Count < ReportThresholds.MinimumSectionsForNormalization || sd is not > 0)
        {
            return _ => null;
        }

        var mean = groupScores.Average();
        return score => Math.Round((score - mean) / sd.Value, 3);
    }

    /// <summary>
    /// Mặt bằng từng khoa (điểm trung bình và độ lệch chuẩn các lớp) trên một tập lớp —
    /// truyền vào TOÀN BỘ lớp của đợt, trước khi lọc phạm vi người xem. Khoa có ít hơn
    /// ngưỡng chuẩn hoá thì không có độ lệch chuẩn.
    /// </summary>
    private static Dictionary<(int? FacultyId, string FacultyName), (decimal Mean, decimal? Sd)> FacultyStatsOf(
        IEnumerable<AnalysedSection> allSections) =>
        allSections
            .GroupBy(x => (x.FacultyId, x.FacultyName))
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var scores = g.Select(x => x.AverageScore).ToList();
                    return (
                        Math.Round(scores.Average(), 3),
                        scores.Count >= ReportThresholds.MinimumSectionsForNormalization
                            ? SampleStandardDeviation(scores)
                            : null);
                });

    /// <summary>
    /// Mặt bằng một nhóm n lớp (bộ môn, học phần) lệch mặt bằng khoa của nó bao nhiêu lần
    /// sai số chuẩn σ_khoa/√n — cùng công thức với Z-Score so toàn trường. Null khi khoa
    /// quá ít lớp hoặc mọi lớp của khoa cùng điểm.
    /// </summary>
    private static decimal? FacultyMeanZ(
        Dictionary<(int? FacultyId, string FacultyName), (decimal Mean, decimal? Sd)> facultyStats,
        int? facultyId,
        string facultyName,
        decimal groupAverage,
        int groupSectionCount) =>
        facultyStats.TryGetValue((facultyId, facultyName), out var faculty)
        && faculty.Sd is > 0
        && groupSectionCount > 0
            ? Math.Round(
                (groupAverage - faculty.Mean) / (faculty.Sd.Value / (decimal)Math.Sqrt(groupSectionCount)),
                2)
            : null;

    private static decimal? SampleStandardDeviation(IReadOnlyList<decimal> values)
    {
        if (values.Count < 2) return null;
        var mean = values.Average();
        var sumSquares = values.Sum(x => (x - mean) * (x - mean));
        return Math.Round((decimal)Math.Sqrt((double)(sumSquares / (values.Count - 1))), 3);
    }

    /// <summary>
    /// Tử số chia mẫu số theo phần trăm, làm tròn một chữ số; mẫu số 0 thì trả 0.
    ///
    /// Dùng cho hai cột của các tab thống kê chi tiết: Tỷ lệ phản hồi (phiếu thu về ÷
    /// sĩ số) và Tỷ lệ phiếu hợp lệ (phiếu hợp lệ ÷ phiếu thu về). Nhóm nhiều lớp thì
    /// cộng tử số và mẫu số của cả nhóm rồi mới chia — lớp đông phải nặng hơn lớp ít.
    /// </summary>
    private static decimal Percentage(int part, int whole) =>
        whole == 0 ? 0m : Math.Round((decimal)part / whole * 100, 3);

    public async Task<SurveyOperationResult<SemesterSurveyNormalizationDto>> GetSemesterSurveyNormalizationAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default,
        int? questionSectionId = null)
    {
        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<SemesterSurveyNormalizationDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SemesterSurveyNormalizationDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        var questionSections = await QuestionSectionsOfTemplateAsync(header.SurveyTemplateId, cancellationToken);
        if (questionSectionId is { } selectedSectionId
            && questionSections.All(x => x.SectionId != selectedSectionId))
        {
            return Failed<SemesterSurveyNormalizationDto>(SurveyErrorCodes.SectionNotFound);
        }

        var sections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        if (questionSectionId is { } sectionId)
        {
            sections = await WithSectionScoresAsync(semesterSurveyId, sections, sectionId, cancellationToken);
        }

        var schoolScores = sections.Select(x => x.AverageScore).ToList();
        var schoolAverage = schoolScores.Count == 0 ? 0m : Math.Round(schoolScores.Average(), 3);
        var schoolSd = SampleStandardDeviation(schoolScores);

        // Cùng mốc cảnh báo với bảng tổng hợp theo bộ môn: tính trên TOÀN BỘ lớp của
        // đợt, để cột "Lớp cảnh báo" của hai tab đếm bằng cùng một thước.
        var warningCutoff = WarningScoreCutoff(schoolScores);

        NormalizationGroupDto BuildGroup(int? facultyId, string facultyName, IReadOnlyList<AnalysedSection> g)
        {
            var scores = g.Select(x => x.AverageScore).ToList();
            var groupAverage = scores.Average();
            var groupClassSize = g.Sum(x => x.ClassSize);
            var groupResponses = g.Sum(x => x.ResponseCount);
            var groupValidResponses = g.Sum(x => x.ValidResponseCount);

            // So MẶT BẰNG của khoa với mặt bằng trường thì mẫu số là sai số chuẩn
            // σ/√n, không phải σ. σ đo độ tản của một lớp lẻ; trung bình của n lớp
            // ổn định hơn đúng √n lần vì lớp cao và lớp thấp triệt tiêu nhau. Chia
            // nhầm sang σ thì cả 14 khoa đều nằm trong ±0.25 và không khoa nào chạm
            // một bậc nào. Xem docs/plans/phan-tich-chuyen-sau-cach-tinh-tung-cot.md.
            decimal? meanZ = schoolSd is > 0
                ? Math.Round(
                    (groupAverage - schoolAverage) / (schoolSd.Value / (decimal)Math.Sqrt(scores.Count)),
                    2)
                : null;

            return new NormalizationGroupDto(
                facultyId,
                facultyName,
                scores.Count,
                Math.Round(groupAverage, 3),
                SampleStandardDeviation(scores),
                scores.Count >= ReportThresholds.MinimumSectionsForNormalization,
                meanZ,
                CountLecturers(g),
                groupClassSize,
                groupResponses,
                groupValidResponses,
                Percentage(groupResponses, groupClassSize),
                Percentage(groupValidResponses, groupResponses),
                warningCutoff is { } cutoff ? scores.Count(x => x <= cutoff) : 0);
        }

        List<NormalizationGroupDto> BuildGroups(IEnumerable<AnalysedSection> source) => source
            .GroupBy(x => new { x.FacultyId, x.FacultyName })
            .Select(g => BuildGroup(g.Key.FacultyId, g.Key.FacultyName, g.ToList()))
            .OrderByDescending(x => x.SectionCount)
            .ThenBy(x => x.FacultyName)
            .ToList();

        var groups = BuildGroups(sections);
        var groupByFaculty = groups.ToDictionary(x => x.FacultyName);

        // Mặt bằng đã tính xong ở trên trên TOÀN BỘ lớp. Từ đây mới lọc xuống phạm vi
        // người xem để dựng bảng chi tiết; z-score vẫn so với mặt bằng toàn trường.
        var scope = await userScope.ResolveAsync(cancellationToken);
        var visibleSections = VisibleTo(scope, sections);

        // Dòng khoa cũng thu về phạm vi: người xem bị giới hạn chỉ thấy khoa của mình, và
        // số trên dòng chỉ gộp lớp mình được xem — trưởng khoa là cả khoa, trưởng bộ môn
        // là phần bộ môn mình. Z-Score của dòng vẫn so với mặt bằng toàn trường ở trên.
        var visibleGroups = scope.SeesEverything ? groups : BuildGroups(visibleSections);

        var rows = visibleSections
            .Select(section =>
            {
                var group = groupByFaculty[section.FacultyName];

                // SD bằng 0 nghĩa là mọi lớp cùng điểm: Z không xác định, để null
                // thay vì chia cho 0.
                decimal? zSchool = schoolSd is > 0
                    ? Math.Round((section.AverageScore - schoolAverage) / schoolSd.Value, 3)
                    : null;
                decimal? zFaculty = group.CanNormalize && group.StandardDeviation is > 0
                    ? Math.Round((section.AverageScore - group.AverageScore) / group.StandardDeviation.Value, 3)
                    : null;

                var verdict = Verdict(group, zSchool, zFaculty);

                return new NormalizedSectionDto(
                    section.CourseSectionSurveyId,
                    section.CourseCode,
                    section.CourseName,
                    section.SectionName,
                    section.LecturerName,
                    section.DepartmentName,
                    section.FacultyName,
                    section.ClassSize,
                    section.AverageScore,
                    zSchool,
                    zFaculty,
                    zSchool is not null && zFaculty is not null
                        ? Math.Round(zFaculty.Value - zSchool.Value, 3)
                        : null,
                    verdict,
                    section.ResponseCount,
                    section.ValidResponseCount,
                    Percentage(section.ResponseCount, section.ClassSize),
                    Percentage(section.ValidResponseCount, section.ResponseCount));
            })
            .OrderBy(x => x.FacultyName)
            .ThenBy(x => x.CourseCode)
            .ThenBy(x => x.SectionName)
            .ToList();

        return Succeeded(new SemesterSurveyNormalizationDto(
            semesterSurveyId,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            sections.Count,
            schoolAverage,
            schoolSd,
            visibleGroups,
            rows,
            questionSections,
            questionSectionId));
    }

    /// <summary>
    /// Các mục của một bộ câu hỏi, theo thứ tự trên phiếu (vị trí câu đầu tiên của mục),
    /// kèm số câu được chấm điểm của từng mục: không đếm câu bẫy và câu tự nhập, đúng
    /// tập câu dùng để tính điểm mục. Mục chưa có câu nào xếp cuối.
    /// </summary>
    private async Task<List<NormalizationQuestionSectionDto>> QuestionSectionsOfTemplateAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken)
    {
        var sectionRows = await db.SurveyQuestionSections.AsNoTracking()
            .Where(x => x.SurveyTemplateId == surveyTemplateId)
            .Select(x => new { x.SectionId, x.SectionName })
            .ToListAsync(cancellationToken);
        var sectionIds = sectionRows.Select(x => x.SectionId).ToList();
        var questionRows = await (
            from question in db.SurveyQuestions.AsNoTracking()
            join scale in db.AnswerScales.IgnoreQueryFilters().AsNoTracking()
                on question.AnswerScaleId equals scale.AnswerScaleId
            where sectionIds.Contains(question.SectionId)
            select new
            {
                question.SectionId,
                question.QuestionId,
                IsScored = question.AttentionCheckValue == null && scale.ScaleKind == AnswerScaleKinds.Options,
            })
            .ToListAsync(cancellationToken);
        var firstQuestionOfSection = questionRows
            .GroupBy(x => x.SectionId)
            .ToDictionary(g => g.Key, g => g.Min(x => x.QuestionId));
        var scoredCountOfSection = questionRows
            .Where(x => x.IsScored)
            .GroupBy(x => x.SectionId)
            .ToDictionary(g => g.Key, g => g.Count());

        return sectionRows
            .OrderBy(x => firstQuestionOfSection.TryGetValue(x.SectionId, out var first) ? first : int.MaxValue)
            .ThenBy(x => x.SectionId)
            .Select(x => new NormalizationQuestionSectionDto(
                x.SectionId,
                x.SectionName,
                scoredCountOfSection.GetValueOrDefault(x.SectionId)))
            .ToList();
    }

    /// <summary>
    /// Thay điểm của từng lớp bằng điểm CHỈ gộp các câu thuộc một mục, lấy từ ảnh chụp
    /// điểm từng câu của lần Cập nhật điểm gần nhất — cùng lần chốt với điểm toàn bài
    /// nên cùng một tập lớp, cùng bộ lọc phiếu hợp lệ, không có câu bẫy và câu tự nhập.
    ///
    /// Điểm mục = tổng (điểm câu × số lượt trả lời) ÷ tổng số lượt trả lời, để câu nhiều
    /// người trả lời nặng hơn. Lớp không có lượt trả lời nào cho mục thì bỏ khỏi mặt
    /// bằng của mục đó. Không đọc hay ghi gì thêm vào CSDL.
    /// </summary>
    private async Task<List<AnalysedSection>> WithSectionScoresAsync(
        int semesterSurveyId,
        List<AnalysedSection> sections,
        int questionSectionId,
        CancellationToken cancellationToken)
    {
        // Bỏ bộ lọc xoá mềm của câu: ảnh chụp ghi câu nào thì tính câu đó, xoá câu về
        // sau không được làm điểm mục lệch khỏi lần chốt.
        var totals = await (
            from score in db.CourseSectionSurveyQuestionScores.AsNoTracking()
            join sectionSurvey in db.CourseSectionSurveys.AsNoTracking()
                on score.CourseSectionSurveyId equals sectionSurvey.CourseSectionSurveyId
            join question in db.SurveyQuestions.IgnoreQueryFilters().AsNoTracking()
                on score.QuestionId equals question.QuestionId
            where sectionSurvey.SemesterSurveyId == semesterSurveyId
                && question.SectionId == questionSectionId
                // Câu bẫy không bao giờ được tính vào điểm mục. Bảng ảnh chụp vốn đã
                // loại câu bẫy lúc Cập nhật điểm, lọc lại ở đây cho chắc.
                && question.AttentionCheckValue == null
            group score by score.CourseSectionSurveyId into g
            select new
            {
                CourseSectionSurveyId = g.Key,
                WeightedScore = g.Sum(x => x.AverageScore * x.AnswerCount),
                AnswerCount = g.Sum(x => x.AnswerCount),
            })
            .ToDictionaryAsync(x => x.CourseSectionSurveyId, cancellationToken);

        return sections
            .Where(x => totals.TryGetValue(x.CourseSectionSurveyId, out var total) && total.AnswerCount > 0)
            .Select(x =>
            {
                var total = totals[x.CourseSectionSurveyId];
                return x with { AverageScore = Math.Round(total.WeightedScore / total.AnswerCount, 3) };
            })
            .ToList();
    }

    /// <summary>
    /// Kết luận cho một lớp. Ưu tiên nêu bật trường hợp hai cách so cho kết luận
    /// trái ngược — đó mới là thứ chuẩn hoá sinh ra để phát hiện.
    /// </summary>
    private static string Verdict(NormalizationGroupDto group, decimal? zSchool, decimal? zFaculty)
    {
        if (!group.CanNormalize || zFaculty is null) return NormalizationVerdicts.FacultyTooSmall;

        var notable = ReportThresholds.NotableZScore;
        if (zSchool is { } zs
            && ((zs >= notable && zFaculty <= -notable) || (zs <= -notable && zFaculty >= notable)))
        {
            return NormalizationVerdicts.ConclusionFlips;
        }

        if (zFaculty >= notable) return NormalizationVerdicts.AboveFaculty;
        if (zFaculty <= -notable) return NormalizationVerdicts.BelowFaculty;
        return NormalizationVerdicts.Normal;
    }

    public async Task<SurveyOperationResult<SemesterSurveyDepartmentSummaryDto>> GetSemesterSurveyDepartmentSummaryAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default,
        int? questionSectionId = null)
    {
        // Bảng tổng hợp theo khoa/viện là công cụ của cấp quản lý bộ môn trở lên;
        // giảng viên không có tab này nên chặn luôn ở đây, ẩn nút không phải là khoá.
        var summaryScope = await userScope.ResolveAsync(cancellationToken);
        if (summaryScope.SeesOnlyOwn)
        {
            return Failed<SemesterSurveyDepartmentSummaryDto>(SurveyErrorCodes.OutOfScope);
        }

        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<SemesterSurveyDepartmentSummaryDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SemesterSurveyDepartmentSummaryDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        // Cùng ô chọn mục với tab Phân tích theo lớp học phần: chọn mục thì điểm của
        // mỗi lớp chỉ gộp các câu thuộc mục đó, mặt bằng và Z-Score tính lại theo đó.
        var questionSections = await QuestionSectionsOfTemplateAsync(header.SurveyTemplateId, cancellationToken);
        if (questionSectionId is { } selectedSectionId
            && questionSections.All(x => x.SectionId != selectedSectionId))
        {
            return Failed<SemesterSurveyDepartmentSummaryDto>(SurveyErrorCodes.SectionNotFound);
        }

        var sections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        if (questionSectionId is { } scoredSectionId)
        {
            sections = await WithSectionScoresAsync(semesterSurveyId, sections, scoredSectionId, cancellationToken);
        }

        // Mốc cảnh báo tính trên TOÀN BỘ lớp của đợt, không phải trên từng bộ môn:
        // bộ môn nào cũng phải so với cùng một mặt bằng thì cột mới đọc ngang được.
        var schoolScores = sections.Select(x => x.AverageScore).ToList();
        var warningCutoff = WarningScoreCutoff(schoolScores);

        // Mặt bằng toàn đợt để tính Z-Score của từng bộ môn — cùng công thức σ/√n với
        // cột Z-Score của khoa ở tab Phân tích theo khoa/viện, để hai tab đọc ngang nhau.
        var schoolMean = schoolScores.Count == 0 ? 0m : Math.Round(schoolScores.Average(), 3);
        var schoolSd = SampleStandardDeviation(schoolScores);
        var facultyStats = FacultyStatsOf(sections);

        var rows = sections
            .GroupBy(x => new { x.FacultyId, x.FacultyName, x.DepartmentId, x.DepartmentName })
            .Select(g =>
            {
                var scores = g.Select(x => x.AverageScore).ToList();
                var totalResponses = g.Sum(x => x.ResponseCount);
                var validResponses = g.Sum(x => x.ValidResponseCount);
                var totalClassSize = g.Sum(x => x.ClassSize);
                var departmentAverage = Math.Round(scores.Average(), 3);
                decimal? departmentMeanZ = schoolSd is > 0
                    ? Math.Round(
                        (departmentAverage - schoolMean) / (schoolSd.Value / (decimal)Math.Sqrt(scores.Count)),
                        2)
                    : null;

                return new DepartmentSummaryRowDto(
                    g.Key.FacultyId,
                    g.Key.FacultyName,
                    g.Key.DepartmentId,
                    g.Key.DepartmentName,
                    g.Count(),
                    CountLecturers(g),
                    totalClassSize,
                    totalResponses,
                    validResponses,
                    Percentage(totalResponses, totalClassSize),
                    Percentage(validResponses, totalResponses),
                    WeightedAverageScore(g),
                    warningCutoff is { } cutoff ? scores.Count(x => x <= cutoff) : 0,
                    SampleStandardDeviation(scores),
                    departmentMeanZ,
                    FacultyMeanZ(facultyStats, g.Key.FacultyId, g.Key.FacultyName, departmentAverage, scores.Count));
            })
            .OrderBy(x => x.FacultyName)
            .ThenBy(x => x.DepartmentName)
            .ToList();

        // Dòng tổng ở chân bảng tính trên TẤT CẢ các dòng, trước khi lọc. Trưởng bộ
        // môn chỉ còn một dòng của mình nhưng vẫn có mặt bằng toàn trường mà so.
        var schoolDepartmentCount = rows.Count;
        var schoolSectionCount = sections.Count;
        var schoolResponseCount = sections.Sum(x => x.ResponseCount);
        var schoolAverageScore = schoolScores.Count == 0 ? (decimal?)null : Math.Round(schoolScores.Average(), 3);
        var schoolWarningCount = rows.Sum(x => x.WarningSectionCount);

        // Trưởng khoa/viện xem mọi bộ môn trong khoa mình; trưởng bộ môn chỉ còn dòng của
        // bộ môn mình. Mặt bằng ở chân bảng vẫn là toàn trường nên vẫn có mốc để đối chiếu.
        //
        // Giảng viên không mở được tab này; nếu gọi thẳng API thì vẫn giữ mức hẹp nhất.
        var scope = summaryScope;
        var visibleRows = scope.SeesEverything
            ? rows
            : scope.SeesWholeFaculty
                ? scope.FacultyId is { } scopeFacultyId
                    ? rows.Where(x => x.FacultyId == scopeFacultyId).ToList()
                    : []
                : scope.DepartmentId is { } scopeDepartmentId
                    ? rows.Where(x => x.DepartmentId == scopeDepartmentId).ToList()
                    : [];

        return Succeeded(new SemesterSurveyDepartmentSummaryDto(
            semesterSurveyId,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            visibleRows,
            schoolDepartmentCount,
            schoolSectionCount,
            schoolResponseCount,
            schoolAverageScore,
            schoolWarningCount,
            questionSections,
            questionSectionId));
    }

    public async Task<SurveyOperationResult<SemesterSurveyCourseDiagnosisDto>> GetSemesterSurveyCourseDiagnosisAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default,
        int? questionSectionId = null)
    {
        // Cùng lý do với bảng tổng hợp theo khoa/viện: giảng viên không mở tab này.
        var diagnosisScope = await userScope.ResolveAsync(cancellationToken);
        if (diagnosisScope.SeesOnlyOwn)
        {
            return Failed<SemesterSurveyCourseDiagnosisDto>(SurveyErrorCodes.OutOfScope);
        }

        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<SemesterSurveyCourseDiagnosisDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SemesterSurveyCourseDiagnosisDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        // Cùng ô chọn mục với tab Phân tích theo lớp học phần: chọn mục thì điểm của
        // mỗi lớp chỉ gộp các câu thuộc mục đó, và câu yếu nhất cũng chỉ xét trong mục.
        var questionSections = await QuestionSectionsOfTemplateAsync(header.SurveyTemplateId, cancellationToken);
        if (questionSectionId is { } selectedSectionId
            && questionSections.All(x => x.SectionId != selectedSectionId))
        {
            return Failed<SemesterSurveyCourseDiagnosisDto>(SurveyErrorCodes.SectionNotFound);
        }

        var sections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        if (questionSectionId is { } scoredSectionId)
        {
            sections = await WithSectionScoresAsync(semesterSurveyId, sections, scoredSectionId, cancellationToken);
        }

        // Chẩn đoán so các lớp TRONG CÙNG một học phần với nhau, không dùng mặt bằng
        // toàn trường, nên lọc trước khi dựng bảng là đúng. Lọc sau cũng ra cùng kết
        // quả vì mỗi học phần chỉ thuộc một bộ môn, nhưng lọc trước thì đỡ tính thừa.
        var scope = await userScope.ResolveAsync(cancellationToken);
        var diagnosisScores = sections.Select(x => x.AverageScore).ToList();
        var rows = await BuildCourseDiagnosisAsync(
            header.SurveyTemplateId,
            VisibleTo(scope, sections),
            WarningScoreCutoff(diagnosisScores),
            diagnosisScores.Count == 0 ? 0m : Math.Round(diagnosisScores.Average(), 3),
            SampleStandardDeviation(diagnosisScores),
            sections,
            cancellationToken,
            questionSectionId);

        return Succeeded(new SemesterSurveyCourseDiagnosisDto(
            semesterSurveyId,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            rows,
            questionSections,
            questionSectionId));
    }

    /// <summary>
    /// Gộp các lớp theo học phần và ra kết luận cho từng học phần. Tách riêng vì
    /// màn hình tổng quan cũng cần đúng phép đếm này, và hai chỗ mà tính lệch
    /// nhau thì người dùng sẽ thấy hai con số khác nhau cho cùng một việc.
    /// </summary>
    /// <param name="warningCutoff">
    /// Mốc cảnh báo tính trên TOÀN BỘ lớp của đợt, truyền từ ngoài vào vì
    /// <paramref name="sections"/> ở đây có thể đã lọc theo phạm vi người xem.
    /// </param>
    /// <param name="schoolAverageScore">
    /// Mặt bằng toàn đợt, cũng phải tính TRƯỚC khi lọc phạm vi — cùng lý do với
    /// <paramref name="warningCutoff"/>. Dùng cho cột Z-Score của học phần.
    /// </param>
    /// <param name="schoolStandardDeviation">
    /// Độ lệch chuẩn toàn đợt; bằng 0 hoặc null thì cột Z-Score để trống.
    /// </param>
    /// <param name="allSections">
    /// Mọi lớp của đợt, TRƯỚC khi lọc phạm vi — để tính mặt bằng khoa cho cột Z-Score so
    /// với khoa, cùng lý do với <paramref name="warningCutoff"/>.
    /// </param>
    /// <param name="questionSectionId">
    /// Đang xem theo riêng một mục câu hỏi thì cột Câu yếu nhất chỉ xét các câu của mục
    /// đó — điểm của lớp đã tính theo mục, cột này mà lấy câu ngoài mục là lệch nguồn.
    /// </param>
    private async Task<List<CourseDiagnosisRowDto>> BuildCourseDiagnosisAsync(
        int surveyTemplateId,
        List<AnalysedSection> sections,
        decimal? warningCutoff,
        decimal schoolAverageScore,
        decimal? schoolStandardDeviation,
        IReadOnlyList<AnalysedSection> allSections,
        CancellationToken cancellationToken,
        int? questionSectionId = null)
    {
        if (sections.Count == 0) return [];

        var facultyStats = FacultyStatsOf(allSections);

        var questionOrder = await QuestionOrderMapAsync(surveyTemplateId, cancellationToken);
        if (questionSectionId is { } sectionId)
        {
            var sectionQuestionIds = await db.SurveyQuestions.AsNoTracking()
                .Where(x => x.SectionId == sectionId)
                .Select(x => x.QuestionId)
                .ToListAsync(cancellationToken);
            questionOrder = questionOrder
                .Where(x => sectionQuestionIds.Contains(x.Key))
                .ToDictionary(x => x.Key, x => x.Value);
        }
        var cssIds = sections.Select(x => x.CourseSectionSurveyId).ToList();
        var perQuestion = await SectionQuestionStatsAsync(
            cssIds, questionOrder.Keys.ToList(), cancellationToken);

        var courseOfCss = sections
            .ToDictionary(
                x => x.CourseSectionSurveyId,
                x => x.CourseId);

        // Câu yếu nhất của từng học phần: gộp mọi lớp của học phần đó.
        var weakestByCourse = perQuestion
            .Where(x => courseOfCss.ContainsKey(x.CourseSectionSurveyId))
            .GroupBy(x => new { CourseId = courseOfCss[x.CourseSectionSurveyId], x.QuestionId })
            .Select(g => new
            {
                g.Key.CourseId,
                g.Key.QuestionId,
                Score = g.Sum(x => x.Total) / g.Sum(x => x.AnswerCount)
            })
            .GroupBy(x => x.CourseId)
            .ToDictionary(g => g.Key, g => g.OrderBy(x => x.Score).First());

        return sections
            .GroupBy(x => x.CourseId)
            .Select(g =>
            {
                var scores = g.Select(x => x.AverageScore).ToList();
                var min = scores.Min();
                var max = scores.Max();
                var spread = Math.Round(max - min, 3);
                var first = g.First();
                var weakest = weakestByCourse.GetValueOrDefault(g.Key);
                var totalClassSize = g.Sum(x => x.ClassSize);
                var totalResponses = g.Sum(x => x.ResponseCount);
                var validResponses = g.Sum(x => x.ValidResponseCount);
                var courseAverage = Math.Round(scores.Average(), 3);
                decimal? courseMeanZ = schoolStandardDeviation is > 0
                    ? Math.Round(
                        (courseAverage - schoolAverageScore)
                            / (schoolStandardDeviation.Value / (decimal)Math.Sqrt(scores.Count)),
                        2)
                    : null;
                // Cùng công thức σ/√n nhưng so với mặt bằng khoa của học phần.
                var courseFacultyMeanZ = FacultyMeanZ(
                    facultyStats, first.FacultyId, first.FacultyName, courseAverage, scores.Count);

                return new CourseDiagnosisRowDto(
                    g.Key,
                    first.CourseCode,
                    first.CourseName,
                    first.DepartmentName,
                    first.FacultyName,
                    g.Count(),
                    CountLecturers(g),
                    // Cột điểm của học phần gộp theo phiếu; min/max/spread bên dưới
                    // mới là thống kê trên từng lớp.
                    WeightedAverageScore(g) ?? 0m,
                    min,
                    max,
                    spread,
                    weakest is null ? null : questionOrder[weakest.QuestionId].Order,
                    weakest is null ? null : Math.Round(weakest.Score, 3),
                    weakest is null ? null : questionOrder[weakest.QuestionId].Text,
                    DiagnoseCourse(min, max, spread, warningCutoff),
                    totalClassSize,
                    totalResponses,
                    validResponses,
                    Percentage(totalResponses, totalClassSize),
                    Percentage(validResponses, totalResponses),
                    courseMeanZ,
                    warningCutoff is { } cutoff ? scores.Count(x => x <= cutoff) : 0,
                    courseFacultyMeanZ);
            })
            .OrderBy(x => x.CourseCode)
            .ToList();
    }

    /// <summary>
    /// Bốn kết luận, xét theo thứ tự ưu tiên. "Mọi lớp đều thấp" xét trước vì đó
    /// là tín hiệu mạnh nhất: lớp tốt nhất còn dưới ngưỡng thì biên độ rộng hay
    /// hẹp cũng không đổi được kết luận.
    /// Học phần một lớp có biên độ bằng 0 nên không bao giờ rơi vào nhóm quy cho
    /// giảng viên — đúng, vì một lớp thì không có gì để so.
    /// </summary>
    private static string DiagnoseCourse(
        decimal min,
        decimal max,
        decimal spread,
        decimal? warningCutoff)
    {
        // Lớp cao điểm nhất của học phần vẫn nằm dưới mốc cảnh báo (Z-Score = −1 so
        // với mặt bằng toàn đợt) thì vấn đề nằm ở học phần chứ không ở giảng viên.
        if (warningCutoff is { } cutoff && max <= cutoff) return CourseDiagnosisVerdicts.CourseIssue;
        if (min >= ReportThresholds.GoodScore) return CourseDiagnosisVerdicts.AllGood;
        if (spread >= ReportThresholds.WideSpread) return CourseDiagnosisVerdicts.LecturerVariance;
        return CourseDiagnosisVerdicts.Inconclusive;
    }

    public async Task<SurveyOperationResult<DepartmentDashboardDto>> GetDepartmentDashboardAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<DepartmentDashboardDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<DepartmentDashboardDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        var scope = await userScope.ResolveAsync(cancellationToken);

        // Nạp TOÀN BỘ lớp của đợt, không lọc. Mặt bằng toàn trường phải tính trên tất
        // cả; lọc ở đây thì con số so sánh mất hết ý nghĩa. Việc lọc theo bộ môn để ở
        // ngay dưới, sau khi mặt bằng đã tính xong.
        var allSections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);

        var mine = VisibleTo(scope, allSections);

        static decimal CompletionRateOf(IReadOnlyList<AnalysedSection> sections)
        {
            var withClassSize = sections.Where(x => x.ClassSize > 0).ToList();
            // Phiếu HỢP LỆ chia sĩ số, giống mọi tỷ lệ hoàn thành khác trong hệ thống.
            return withClassSize.Count == 0
                ? 0m
                : Math.Round(
                    withClassSize.Average(x => (decimal)x.ValidResponseCount / x.ClassSize) * 100, 1);
        }

        static decimal? AverageScoreOf(IReadOnlyList<AnalysedSection> sections) =>
            sections.Count == 0 ? null : Math.Round(sections.Average(x => x.AverageScore), 3);

        var dashboardCutoff = WarningScoreCutoff(allSections.Select(x => x.AverageScore).ToList());

        return Succeeded(new DepartmentDashboardDto(
            semesterSurveyId,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            // Trưởng khoa/viện xem cả khoa nên nhãn đơn vị phải là tên khoa, ghi tên
            // bộ môn của dòng đầu tiên là nói sai phạm vi đang hiển thị.
            scope.SeesEverything
                ? null
                : scope.SeesWholeFaculty
                    ? mine.FirstOrDefault()?.FacultyName
                    : mine.FirstOrDefault()?.DepartmentName,
            mine.Count,
            allSections.Count,
            CompletionRateOf(mine),
            CompletionRateOf(allSections),
            AverageScoreOf(mine),
            AverageScoreOf(allSections),
            // Mốc lấy trên toàn bộ lớp của đợt, không lấy riêng trong bộ môn.
            dashboardCutoff is { } cutoff ? mine.Count(x => x.AverageScore <= cutoff) : 0,
            dashboardCutoff ?? 0m));
    }

    public async Task<SurveyOperationResult<SemesterSurveyDashboardDto>> GetSemesterSurveyDashboardAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        // Thu về phạm vi người xem, giống tab Tổng quan của Thống kê & Báo cáo: trưởng
        // khoa thấy số của khoa mình, trưởng bộ môn của bộ môn mình. Riêng các mốc cảnh
        // báo vẫn tính trên toàn bộ lớp của đợt (congviec2.md mục D6), để một lớp bị
        // gắn "cảnh báo" theo cùng một thước dù ai đang xem.
        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<SemesterSurveyDashboardDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SemesterSurveyDashboardDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        // Bốn chỉ số đầu là TIẾN ĐỘ: đếm mọi lớp của đợt và mọi phiếu thu được,
        // kể cả phiếu bị lọc nhiễu — đó vẫn là phiếu sinh viên đã nộp. Phần điểm
        // bên dưới mới lọc phiếu hợp lệ.
        var scope = await userScope.ResolveAsync(cancellationToken);
        var allSectionSurveys = await VisibleSurveyScope.InScope(
                db,
                db.CourseSectionSurveys.AsNoTracking()
                    .Where(x => x.SemesterSurveyId == semesterSurveyId),
                scope)
            .Select(x => new { x.CourseSectionSurveyId, x.CourseSectionId })
            .ToListAsync(cancellationToken);

        var allSectionIds = allSectionSurveys.Select(x => x.CourseSectionId).ToList();
        var totalClassSize = await db.CourseSections.AsNoTracking()
            .Where(x => allSectionIds.Contains(x.CourseSectionId))
            .SumAsync(x => (int?)x.ClassSize, cancellationToken) ?? 0;

        var allCssIds = allSectionSurveys.Select(x => x.CourseSectionSurveyId).ToList();
        var totalResponseCount = await db.SurveyResponses.AsNoTracking()
            .CountAsync(x => allCssIds.Contains(x.CourseSectionSurveyId), cancellationToken);
        // Tiến độ tính trên phiếu hợp lệ: phiếu bị bộ lọc nhiễu loại vẫn là một
        // lượt nộp nhưng không dùng được vào kết quả nào. "Hợp lệ" ở đây xét theo
        // những luật đang bật, không phải cờ đã chốt lúc nộp.
        var dashboardThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var validResponseCount = await db.SurveyResponses.AsNoTracking()
            .Where(x => allCssIds.Contains(x.CourseSectionSurveyId))
            .Where(dashboardThresholds.CountsTowardScore())
            .CountAsync(cancellationToken);

        // Toàn bộ lớp của đợt để tính mốc; phần hiển thị chỉ lấy lớp trong phạm vi.
        var allSections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        var sections = VisibleTo(scope, allSections);
        var visibleCssIds = sections.Select(x => x.CourseSectionSurveyId).ToHashSet();

        var questionOrder = await QuestionOrderMapAsync(header.SurveyTemplateId, cancellationToken);
        var perQuestion = await SectionQuestionStatsAsync(
            allSections.Select(x => x.CourseSectionSurveyId).ToList(),
            questionOrder.Keys.ToList(),
            cancellationToken);

        var questions = perQuestion
            .GroupBy(x => x.QuestionId)
            .Where(g => g.Where(x => visibleCssIds.Contains(x.CourseSectionSurveyId)).Sum(x => x.AnswerCount) > 0)
            .Select(g =>
            {
                // Mốc riêng của TỪNG CÂU: câu khó vốn điểm thấp hơn câu dễ, nên so
                // mọi câu với một mốc chung sẽ dồn hết cảnh báo vào mấy câu khó.
                var cutoff = WarningScoreCutoff(g.Where(x => x.AnswerCount > 0).Select(x => x.Average).ToList());
                var mine = g.Where(x => visibleCssIds.Contains(x.CourseSectionSurveyId)).ToList();
                var scored = mine.Where(x => x.AnswerCount > 0).Select(x => x.Average).ToList();

                return new DashboardQuestionScoreDto(
                    questionOrder[g.Key].Order,
                    questionOrder[g.Key].Text,
                    Math.Round(mine.Sum(x => x.Total) / mine.Sum(x => x.AnswerCount), 3),
                    // Đếm theo LỚP chứ không theo phiếu: một câu bị nhiều lớp chấm
                    // thấp là vấn đề hệ thống, còn một lớp chấm thấp thì chỉ là cá biệt.
                    cutoff is { } c ? scored.Count(x => x <= c) : 0);
            })
            .OrderBy(x => x.QuestionOrder)
            .ToList();

        var faculties = sections
            .GroupBy(x => new { x.FacultyId, x.FacultyName })
            .Select(g => new DashboardFacultyScoreDto(
                g.Key.FacultyId,
                g.Key.FacultyName,
                g.Count(),
                WeightedAverageScore(g) ?? 0m))
            .OrderByDescending(x => x.AverageScore)
            .ToList();

        var dashboardScores = allSections.Select(x => x.AverageScore).ToList();
        var courseRows = await BuildCourseDiagnosisAsync(
            header.SurveyTemplateId,
            sections,
            WarningScoreCutoff(dashboardScores),
            dashboardScores.Count == 0 ? 0m : Math.Round(dashboardScores.Average(), 3),
            SampleStandardDeviation(dashboardScores),
            allSections,
            cancellationToken);

        return Succeeded(new SemesterSurveyDashboardDto(
            semesterSurveyId,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            allSectionSurveys.Count,
            totalResponseCount,
            validResponseCount,
            totalClassSize == 0
                ? 0m
                : Math.Round((decimal)validResponseCount / totalClassSize * 100, 3),
            WeightedAverageScore(sections),
            sections.Count,
            questions,
            questions.OrderBy(x => x.AverageScore).Take(5).ToList(),
            faculties,
            courseRows.Count(x => x.Verdict == CourseDiagnosisVerdicts.CourseIssue),
            courseRows.Count(x => x.Verdict == CourseDiagnosisVerdicts.LecturerVariance),
            totalClassSize,
            totalClassSize == 0
                ? 0m
                : Math.Round((decimal)totalResponseCount / totalClassSize * 100, 3)));
    }

    public async Task<SurveyOperationResult<SurveyScopeAnalysisDto>> GetSurveyScopeAnalysisAsync(
        int semesterSurveyId,
        string scopeType,
        int scopeId,
        CancellationToken cancellationToken = default)
    {
        var normalizedScopeType = (scopeType ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizedScopeType != "faculty" && normalizedScopeType != "department" && normalizedScopeType != "course")
        {
            return Failed<SurveyScopeAnalysisDto>(SurveyErrorCodes.ScopeTypeInvalid);
        }

        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<SurveyScopeAnalysisDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<SurveyScopeAnalysisDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        var allSections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        var sections = normalizedScopeType switch
        {
            "faculty" => allSections.Where(x => x.FacultyId == scopeId).ToList(),
            "department" => allSections.Where(x => x.DepartmentId == scopeId).ToList(),
            "course" => allSections.Where(x => x.CourseId == scopeId).ToList(),
            _ => []
        };

        if (sections.Count == 0)
        {
            return Failed<SurveyScopeAnalysisDto>(SurveyErrorCodes.ScopeNotFound);
        }

        // Phạm vi lấy thẳng từ query string nên phải kiểm: không có chỗ này thì
        // trưởng bộ môn chỉ việc đổi scopeId là đọc được phân tích của khoa khác.
        //
        // Thu về đúng phần lớp người xem được thấy, giống dòng khoa ở các bảng xếp hạng:
        // trưởng bộ môn mở khoa của mình thì chỉ thấy phần bộ môn mình. Không còn lớp
        // nào thì coi như không có phạm vi này. Mọi mặt bằng so sánh bên dưới vẫn tính
        // trên toàn bộ lớp của đợt (allSections).
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.SeesEverything)
        {
            sections = VisibleTo(scope, sections);
            if (sections.Count == 0)
            {
                return Failed<SurveyScopeAnalysisDto>(SurveyErrorCodes.ScopeNotFound);
            }
        }

        var scopeName = normalizedScopeType switch
        {
            "faculty" => sections[0].FacultyName,
            "department" => sections[0].DepartmentName,
            "course" => $"{sections[0].CourseCode} - {sections[0].CourseName}",
            _ => string.Empty
        };

        var cssIds = sections.Select(x => x.CourseSectionSurveyId).ToList();

        var questions = await (
            from q in QuestionsOfTemplate(header.SurveyTemplateId).AsNoTracking()
            join s in db.AnswerScales.AsNoTracking() on q.AnswerScaleId equals s.AnswerScaleId
            orderby q.QuestionId
            select new
            {
                q.QuestionId,
                q.QuestionText,
                q.AttentionCheckValue,
                q.AnswerScaleId,
                s.ScaleKind,
                s.AnswerScaleName
            })
            .ToListAsync(cancellationToken);

        var scoredQuestionIds = questions
            .Where(x => x.AttentionCheckValue == null && x.ScaleKind == AnswerScaleKinds.Options)
            .Select(x => x.QuestionId)
            .ToList();

        // Trung bình có TRỌNG SỐ theo số lượt trả lời. Lấy thẳng Average của các
        // AverageScore là trung bình của trung bình: lớp 5 phiếu nặng ngang lớp 50
        // phiếu, và con số ra không khớp với chính điểm chung của phạm vi ngay trên
        // đầu trang.
        var scoresByQuestion = cssIds.Count == 0 || scoredQuestionIds.Count == 0
            ? []
            : await db.CourseSectionSurveyQuestionScores.AsNoTracking()
                .Where(x => cssIds.Contains(x.CourseSectionSurveyId) && scoredQuestionIds.Contains(x.QuestionId))
                .GroupBy(x => x.QuestionId)
                .Select(g => new
                {
                    QuestionId = g.Key,
                    WeightedScore = g.Sum(x => x.AverageScore * x.AnswerCount),
                    TotalAnswers = g.Sum(x => x.AnswerCount)
                })
                .ToDictionaryAsync(x => x.QuestionId, x => x, cancellationToken);

        // Phân bố lựa chọn không có bảng chốt nào lưu, nên vẫn gộp từ phiếu gốc —
        // nhưng chỉ trên đúng các lớp đã chốt điểm ở trên, để hai cột của cùng một
        // dòng không nói về hai tập lớp khác nhau. Trước đây phần này bỏ trống hẳn
        // nên bảng "tỷ lệ phân bố" không có cột mức nào.
        var scopeThresholds = await scoringThresholds.GetAsync(cancellationToken);
        var scopeCountedResponseIds = db.SurveyResponses.AsNoTracking()
            .Where(x => cssIds.Contains(x.CourseSectionSurveyId))
            .Where(scopeThresholds.CountsTowardScore())
            .Select(x => x.ResponseId);

        var optionCounts = cssIds.Count == 0 || scoredQuestionIds.Count == 0
            ? []
            : await (from r in db.SurveyResponses.AsNoTracking()
                     join a in db.SurveyResponseAnswers.AsNoTracking()
                         on r.ResponseId equals a.ResponseId
                     where cssIds.Contains(r.CourseSectionSurveyId)
                           && scopeCountedResponseIds.Contains(r.ResponseId)
                           && scoredQuestionIds.Contains(a.QuestionId)
                     group a by new { a.QuestionId, a.AnswerValue } into g
                     select new { g.Key.QuestionId, g.Key.AnswerValue, Count = g.Count() })
                .ToListAsync(cancellationToken);

        var countsByQuestion = optionCounts
            .GroupBy(x => x.QuestionId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .Where(x => int.TryParse(x.AnswerValue, out _))
                    .ToDictionary(x => int.Parse(x.AnswerValue!), x => x.Count));

        var scaleIds = questions.Select(x => x.AnswerScaleId).Distinct().ToList();
        var optionsByScaleId = (await db.AnswerScaleOptions.AsNoTracking()
                .Where(x => scaleIds.Contains(x.AnswerScaleId))
                .ToListAsync(cancellationToken))
            .ToLookup(x => x.AnswerScaleId);

        // Bỏ câu bẫy TRƯỚC rồi mới đánh số, giống QuestionOrderMapAsync, trang Bảng dữ
        // liệu khảo sát và trang kết quả của một lớp: câu bẫy không được đánh số nên
        // C1..C24 chạy liền mạch. Đánh số trước khi bỏ thì nhảy cóc qua đúng vị trí câu
        // bẫy (không có C11, C23) và lệch số với các màn kia.
        var questionRows = questions
            .Where(q => q.AttentionCheckValue == null)
            .Select((q, index) => new { Question = q, Order = index + 1 })
            .Select(x =>
            {
                var q = x.Question;
                int index = x.Order - 1;
                var stat = scoresByQuestion.GetValueOrDefault(q.QuestionId);
                var counts = countsByQuestion.GetValueOrDefault(q.QuestionId) ?? [];
                int answeredTotal = counts.Values.Sum();

                IReadOnlyList<ScopeAnalysisOptionDto> distribution = q.ScaleKind != AnswerScaleKinds.Options
                    ? []
                    : optionsByScaleId[q.AnswerScaleId]
                        .OrderBy(option => option.Value)
                        .Select(option =>
                        {
                            int count = counts.GetValueOrDefault(option.Value);
                            return new ScopeAnalysisOptionDto(
                                option.Value,
                                option.DisplayText,
                                count,
                                answeredTotal > 0
                                    ? Math.Round((decimal)count / answeredTotal * 100, 3)
                                    : 0m);
                        })
                        .ToList();

                return new ScopeAnalysisQuestionDto(
                    q.QuestionId,
                    index + 1,
                    q.QuestionText,
                    stat is not null && stat.TotalAnswers > 0
                        ? Math.Round(stat.WeightedScore / stat.TotalAnswers, 3)
                        : 0m,
                    stat?.TotalAnswers ?? 0,
                    distribution,
                    q.ScaleKind,
                    q.AnswerScaleName,
                    null);
            })
            .ToList();

        List<DepartmentSummaryRowDto>? scopeDepartments = null;
        List<CourseDiagnosisRowDto>? scopeCourses = null;
        List<NormalizedSectionDto>? scopeSections = null;

        if (normalizedScopeType == "faculty")
        {
            var scopeSchoolScores = allSections.Select(x => x.AverageScore).ToList();
            var warningCutoff = WarningScoreCutoff(scopeSchoolScores);
            var scopeSchoolMean = scopeSchoolScores.Count == 0
                ? 0m
                : Math.Round(scopeSchoolScores.Average(), 3);
            var scopeSchoolSd = SampleStandardDeviation(scopeSchoolScores);
            var scopeFacultyStats = FacultyStatsOf(allSections);
            scopeDepartments = sections
                .GroupBy(x => new { x.FacultyId, x.FacultyName, x.DepartmentId, x.DepartmentName })
                .Select(g =>
                {
                    var scores = g.Select(x => x.AverageScore).ToList();
                    var totalResponses = g.Sum(x => x.ResponseCount);
                    var validResponses = g.Sum(x => x.ValidResponseCount);
                    var totalClassSize = g.Sum(x => x.ClassSize);
                    var departmentAverage = Math.Round(scores.Average(), 3);
                    decimal? departmentMeanZ = scopeSchoolSd is > 0
                        ? Math.Round(
                            (departmentAverage - scopeSchoolMean)
                                / (scopeSchoolSd.Value / (decimal)Math.Sqrt(scores.Count)),
                            2)
                        : null;

                    return new DepartmentSummaryRowDto(
                        g.Key.FacultyId,
                        g.Key.FacultyName,
                        g.Key.DepartmentId,
                        g.Key.DepartmentName,
                        g.Count(),
                        CountLecturers(g),
                        totalClassSize,
                        totalResponses,
                        validResponses,
                        Percentage(totalResponses, totalClassSize),
                        Percentage(validResponses, totalResponses),
                        WeightedAverageScore(g),
                        warningCutoff is { } cutoff ? scores.Count(x => x <= cutoff) : 0,
                        SampleStandardDeviation(scores),
                        departmentMeanZ,
                        FacultyMeanZ(
                            scopeFacultyStats, g.Key.FacultyId, g.Key.FacultyName, departmentAverage, scores.Count));
                })
                .OrderBy(x => x.DepartmentName)
                .ToList();
        }
        else if (normalizedScopeType == "department")
        {
            var departmentScopeScores = allSections.Select(x => x.AverageScore).ToList();
            scopeCourses = await BuildCourseDiagnosisAsync(
                header.SurveyTemplateId,
                sections,
                WarningScoreCutoff(departmentScopeScores),
                departmentScopeScores.Count == 0 ? 0m : Math.Round(departmentScopeScores.Average(), 3),
                SampleStandardDeviation(departmentScopeScores),
                allSections,
                cancellationToken);
        }
        else if (normalizedScopeType == "course")
        {
            var schoolScores = allSections.Select(x => x.AverageScore).ToList();
            var schoolAverage = schoolScores.Count == 0 ? 0m : Math.Round(schoolScores.Average(), 3);
            var schoolSd = SampleStandardDeviation(schoolScores);

            var facultySections = allSections.Where(x => x.FacultyId == sections[0].FacultyId).ToList();
            var facultyScores = facultySections.Select(x => x.AverageScore).ToList();
            var facultyAverage = facultyScores.Count == 0 ? 0m : Math.Round(facultyScores.Average(), 3);
            var facultySd = SampleStandardDeviation(facultyScores);
            var canNormalizeFaculty = facultyScores.Count >= ReportThresholds.MinimumSectionsForNormalization;
            var facultyWarningCutoff = WarningScoreCutoff(schoolScores);
            var facultyClassSize = facultySections.Sum(x => x.ClassSize);
            var facultyResponses = facultySections.Sum(x => x.ResponseCount);
            var facultyValidResponses = facultySections.Sum(x => x.ValidResponseCount);

            var facultyGroup = new NormalizationGroupDto(
                sections[0].FacultyId,
                sections[0].FacultyName,
                facultySections.Count,
                facultyAverage,
                facultySd,
                canNormalizeFaculty,
                schoolSd is > 0 && facultyScores.Count > 0
                    ? Math.Round(
                        (facultyAverage - schoolAverage) / (schoolSd.Value / (decimal)Math.Sqrt(facultyScores.Count)),
                        2)
                    : null,
                CountLecturers(facultySections),
                facultyClassSize,
                facultyResponses,
                facultyValidResponses,
                Percentage(facultyResponses, facultyClassSize),
                Percentage(facultyValidResponses, facultyResponses),
                facultyWarningCutoff is { } facultyCutoff
                    ? facultyScores.Count(x => x <= facultyCutoff)
                    : 0);

            scopeSections = sections
                .Select(section =>
                {
                    decimal? zSchool = schoolSd is > 0
                        ? Math.Round((section.AverageScore - schoolAverage) / schoolSd.Value, 3)
                        : null;
                    decimal? zFaculty = canNormalizeFaculty && facultySd is > 0
                        ? Math.Round((section.AverageScore - facultyAverage) / facultySd.Value, 3)
                        : null;

                    var verdict = Verdict(facultyGroup, zSchool, zFaculty);

                    return new NormalizedSectionDto(
                        section.CourseSectionSurveyId,
                        section.CourseCode,
                        section.CourseName,
                        section.SectionName,
                        section.LecturerName,
                        section.DepartmentName,
                        section.FacultyName,
                        section.ClassSize,
                        section.AverageScore,
                        zSchool,
                        zFaculty,
                        zSchool is not null && zFaculty is not null
                            ? Math.Round(zFaculty.Value - zSchool.Value, 3)
                            : null,
                        verdict,
                        section.ResponseCount,
                        section.ValidResponseCount,
                        Percentage(section.ResponseCount, section.ClassSize),
                        Percentage(section.ValidResponseCount, section.ResponseCount));
                })
                .OrderBy(x => x.SectionName)
                .ToList();
        }

        return Succeeded(new SurveyScopeAnalysisDto(
            semesterSurveyId,
            normalizedScopeType,
            scopeId,
            scopeName,
            header.TemplateName,
            header.SemesterName,
            header.AcademicYearName,
            sections.Count,
            sections.Sum(x => x.ClassSize),
            sections.Sum(x => x.ValidResponseCount),
            Math.Round(sections.Average(x => x.AverageScore), 3),
            questionRows,
            Departments: scopeDepartments,
            Courses: scopeCourses,
            Sections: scopeSections));
    }

    public async Task<SurveyOperationResult<IReadOnlyList<LecturerOptionDto>>> GetSemesterSurveyLecturersAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<IReadOnlyList<LecturerOptionDto>>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<IReadOnlyList<LecturerOptionDto>>(SurveyErrorCodes.ResultsNotPublished);
        }

        var allSections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);

        // Danh sách chọn giảng viên lọc theo phạm vi, nhưng báo cáo mở ra từ đó vẫn so
        // với mặt bằng bộ môn và khoa tính trên toàn trường — phần đó nằm ở
        // GetLecturerReportAsync và cố ý không đụng tới.
        var scope = await userScope.ResolveAsync(cancellationToken);
        var sections = VisibleTo(scope, allSections);
        var warningCutoff = WarningScoreCutoff(allSections.Select(x => x.AverageScore).ToList());

        // Lớp chưa gắn được giảng viên thì không có ai để làm báo cáo cá nhân.
        // Gom theo mã giảng viên và chỉ theo mã. Bộ môn/khoa của một lớp suy từ
        // đơn vị sở hữu học phần chứ không từ hồ sơ giảng viên, nên người dạy học
        // phần của nhiều đơn vị có nhiều giá trị khác nhau; đưa chúng vào khóa gom
        // thì cùng một người bị tách thành nhiều dòng trùng mã và số lớp bị chia
        // nhỏ. Đơn vị lấy theo lớp đầu tiên, chỉ dùng để hiển thị và lọc.
        var options = sections
            .Where(x => x.LecturerId is not null)
            .GroupBy(x => x.LecturerId!.Value)
            .Select(g =>
            {
                int totalClassSize = g.Sum(x => x.ClassSize);
                int totalResponses = g.Sum(x => x.ResponseCount);
                int validResponses = g.Sum(x => x.ValidResponseCount);
                return new LecturerOptionDto(
                    g.Key,
                    g.First().LecturerName,
                    g.First().DepartmentName,
                    g.First().FacultyName,
                    g.Count(),
                    totalClassSize,
                    totalResponses,
                    validResponses,
                    Percentage(totalResponses, totalClassSize),
                    Percentage(validResponses, totalResponses),
                    validResponses > 0
                        ? Math.Round(g.Sum(x => x.ValidTotalScore) / validResponses, 3)
                        : null,
                    g.Min(x => (decimal?)x.AverageScore),
                    g.Max(x => (decimal?)x.AverageScore),
                    warningCutoff is null
                        ? 0
                        : g.Count(x => x.AverageScore <= warningCutoff.Value));
            })
            .OrderBy(x => x.FacultyName)
            .ThenBy(x => x.DepartmentName)
            .ThenBy(x => x.FullName)
            .ToList();

        return Succeeded<IReadOnlyList<LecturerOptionDto>>(options);
    }

    public async Task<SurveyOperationResult<LecturerReportDto>> GetLecturerSurveyReportAsync(
        int semesterSurveyId,
        int lecturerId,
        CancellationToken cancellationToken = default)
    {
        var header = await LoadSurveyHeaderAsync(semesterSurveyId, cancellationToken);
        if (header is null)
        {
            return Failed<LecturerReportDto>(SurveyErrorCodes.SemesterSurveyNotFound);
        }

        // Chốt chặn phát hành: chưa phát hành thì chỉ quản trị xem được số liệu
        // của đợt, bất kể quyền vào module đang mở hay đóng.
        if (!await publication.CanSeeResultsAsync(semesterSurveyId, cancellationToken))
        {
            return Failed<LecturerReportDto>(SurveyErrorCodes.ResultsNotPublished);
        }

        var sections = await LoadAnalysedSectionsAsync(semesterSurveyId, cancellationToken);
        var mine = sections.Where(x => x.LecturerId == lecturerId).ToList();
        if (mine.Count == 0)
        {
            return Failed<LecturerReportDto>(SurveyErrorCodes.LecturerHasNoSections);
        }

        // Báo cáo cá nhân là dữ liệu nhạy cảm nhất của một giảng viên. Trưởng bộ môn
        // chỉ xem được người trong bộ môn mình, giảng viên chỉ xem được chính mình.
        // Trả "không có lớp nào" chứ không phải "không có quyền": không để người gọi
        // dò ra ai đang dạy gì bằng cách so hai mã lỗi.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.SeesEverything)
        {
            var allowed = scope.SeesOnlyOwn
                ? scope.LecturerId == lecturerId
                : scope.SeesWholeFaculty
                    ? scope.FacultyId is { } facultyId && mine.All(x => x.FacultyId == facultyId)
                    : scope.DepartmentId is { } departmentId
                        && mine.All(x => x.DepartmentId == departmentId);
            if (!allowed)
            {
                return Failed<LecturerReportDto>(SurveyErrorCodes.LecturerHasNoSections);
            }
        }

        var facultyName = mine[0].FacultyName;
        var departmentName = mine[0].DepartmentName;

        // Z trong khoa dùng đúng mặt bằng khoa như sheet 1, để hai màn hình không
        // nói hai con số khác nhau cho cùng một lớp.
        // Ba mốc so, từ rộng đến hẹp. Cùng công thức và cùng mặt bằng với tab Phân
        // tích theo lớp, để hai màn hình không ra hai con số khác nhau cho một lớp.
        var schoolZ = ZScorerOver(sections.Select(x => x.AverageScore).ToList());
        var facultyZ = ZScorerOver(
            sections.Where(x => x.FacultyName == facultyName).Select(x => x.AverageScore).ToList());
        var departmentZ = ZScorerOver(
            sections.Where(x => x.DepartmentName == departmentName)
                .Select(x => x.AverageScore).ToList());

        // Điểm trung bình của mọi lớp cùng học phần, kể cả lớp người khác dạy. Đây
        // là phép so công bằng nhất vì cùng nội dung và cùng giáo trình.
        var courseIdBySection = await db.CourseSections.AsNoTracking()
            .Where(x => sections.Select(s => s.CourseSectionId).Contains(x.CourseSectionId))
            .ToDictionaryAsync(x => x.CourseSectionId, x => x.CourseId, cancellationToken);
        var courseStats = sections
            .Where(x => courseIdBySection.ContainsKey(x.CourseSectionId))
            .GroupBy(x => courseIdBySection[x.CourseSectionId])
            .ToDictionary(
                g => g.Key,
                g => (Count: g.Count(), Mean: Math.Round(g.Average(x => x.AverageScore), 3)));

        var sectionRows = mine
            .Select(x =>
            {
                // Học phần chỉ có đúng lớp này thì không có gì để so.
                decimal? courseMean = courseIdBySection.TryGetValue(x.CourseSectionId, out var courseId)
                    && courseStats.TryGetValue(courseId, out var stat)
                    && stat.Count > 1
                        ? stat.Mean
                        : null;

                return new LecturerSectionDto(
                    x.CourseSectionSurveyId,
                    x.CourseCode,
                    x.CourseName,
                    x.SectionName,
                    x.ClassSize,
                    x.ResponseCount,
                    x.ValidResponseCount,
                    Percentage(x.ResponseCount, x.ClassSize),
                    Percentage(x.ValidResponseCount, x.ResponseCount),
                    x.AverageScore,
                    courseMean,
                    courseMean is { } mean ? Math.Round(x.AverageScore - mean, 3) : null,
                    schoolZ(x.AverageScore),
                    facultyZ(x.AverageScore),
                    departmentZ(x.AverageScore));
            })
            .OrderBy(x => x.CourseCode)
            .ThenBy(x => x.SectionName)
            .ToList();

        return Succeeded(new LecturerReportDto(
            lecturerId,
            mine[0].LecturerName,
            departmentName,
            facultyName,
            mine.Count,
            mine.Sum(x => x.ResponseCount),
            Math.Round(mine.Average(x => x.AverageScore), 3),
            sectionRows));
    }

    private sealed record SurveyHeader(
        int SurveyTemplateId,
        string TemplateName,
        string SemesterName,
        string AcademicYearName);

    private async Task<SurveyHeader?> LoadSurveyHeaderAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken)
    {
        var semesterSurvey = await db.SemesterSurveys.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId, cancellationToken);
        if (semesterSurvey is null) return null;

        var template = await db.SurveyTemplates.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == semesterSurvey.SurveyTemplateId, cancellationToken);
        var semester = await db.Semesters.AsNoTracking()
            .FirstOrDefaultAsync(x => x.SemesterId == semesterSurvey.SemesterId, cancellationToken);
        var academicYear = semester is null
            ? null
            : await db.AcademicYears.AsNoTracking()
                .FirstOrDefaultAsync(x => x.AcademicYearId == semester.AcademicYearId, cancellationToken);

        return new SurveyHeader(
            semesterSurvey.SurveyTemplateId,
            template?.TemplateName ?? string.Empty,
            semester?.SemesterName ?? string.Empty,
            academicYear?.AcademicYearName ?? string.Empty);
    }

    /// <summary>
    /// Các câu chấm điểm của một bộ, kèm số thứ tự dùng cho các cột C1, C2…
    ///
    /// Câu bẫy KHÔNG được đánh số: bỏ nó ra rồi mới đánh, nên bộ 26 câu có hai bẫy
    /// cho ra C1..C24 liền mạch. Câu tự nhập thì vẫn chiếm số như câu thường — nó
    /// là câu thật sinh viên phải trả lời, chỉ không có điểm để mà chấm.
    ///
    /// Mọi màn quản trị phải đánh số cùng một kiểu này, lệch nhau thì C16 ở màn
    /// này là C15 ở màn kia.
    /// </summary>
    private async Task<Dictionary<int, (int Order, string Text)>> QuestionOrderMapAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken)
    {
        var all = await (
            from q in QuestionsOfTemplate(surveyTemplateId).AsNoTracking()
            join s in db.AnswerScales.AsNoTracking() on q.AnswerScaleId equals s.AnswerScaleId
            orderby q.QuestionId
            select new { q.QuestionId, q.QuestionText, q.AttentionCheckValue, s.ScaleKind })
            .ToListAsync(cancellationToken);

        return all
            .Where(x => x.AttentionCheckValue == null)
            .Select((q, index) => new { Question = q, Order = index + 1 })
            .Where(x => x.Question.ScaleKind == AnswerScaleKinds.Options)
            .ToDictionary(
                x => x.Question.QuestionId,
                x => (x.Order, x.Question.QuestionText));
    }

    /// <summary>Cột timestamptz của Npgsql chỉ nhận DateTime có Kind = Utc.</summary>
    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Local).ToUniversalTime(),
    };

    private sealed record AnswerScaleValidation(
        string? ErrorCode,
        string Name,
        string ScaleKind,
        IReadOnlyList<SaveAnswerScaleOptionCommand> Options);

    private async Task<AnswerScaleValidation> ValidateAnswerScaleAsync(
        SaveAnswerScaleCommand command,
        int? exceptAnswerScaleId,
        CancellationToken cancellationToken)
    {
        var name = command.AnswerScaleName?.Trim() ?? string.Empty;
        var kind = command.ScaleKind?.Trim() ?? string.Empty;

        if (name.Length == 0)
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleNameRequired, name, kind, []);
        }
        if (!AnswerScaleKinds.IsValid(kind))
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleKindInvalid, name, kind, []);
        }

        var names = await db.AnswerScales
            .Where(x => exceptAnswerScaleId == null || x.AnswerScaleId != exceptAnswerScaleId)
            .Select(x => x.AnswerScaleName)
            .ToListAsync(cancellationToken);
        if (names.Any(x => NormalizeKey(x) == NormalizeKey(name)))
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleNameExists, name, kind, []);
        }

        var options = (command.Options ?? [])
            .Select(option => new SaveAnswerScaleOptionCommand(
                option.Value,
                option.DisplayText?.Trim() ?? string.Empty))
            .ToList();

        // Thang tự nhập chữ không có mức nào để chọn.
        if (kind == AnswerScaleKinds.Text)
        {
            return options.Count > 0
                ? new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleTextHasOptions, name, kind, [])
                : new AnswerScaleValidation(null, name, kind, []);
        }

        if (options.Count < 2 || options.Count > MaximumScaleOptions)
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleOptionsInvalid, name, kind, []);
        }
        // Value không cần liên tiếp: thang 'Có/Không' dùng 1 và 5 để cùng dải điểm
        // với thang mức độ hài lòng.
        if (options.Any(x => x.Value is < 1 or > MaximumScaleOptions)
            || options.Select(x => x.Value).Distinct().Count() != options.Count)
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleOptionsInvalid, name, kind, []);
        }
        if (options.Any(x => x.DisplayText.Length == 0))
        {
            return new AnswerScaleValidation(SurveyErrorCodes.AnswerScaleOptionTextRequired, name, kind, []);
        }

        return new AnswerScaleValidation(null, name, kind, options.OrderBy(x => x.Value).ToList());
    }

    private sealed record TemplateValidation(
        string? ErrorCode,
        string Name,
        IReadOnlyList<SaveSurveyQuestionSectionCommand> Sections,
        IReadOnlyList<SaveSurveyQuestionCommand> Questions);

    private async Task<TemplateValidation> ValidateTemplateAsync(
        SaveSurveyTemplateCommand command,
        int? exceptTemplateId,
        CancellationToken cancellationToken)
    {
        var name = command.TemplateName?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            return Invalid(SurveyErrorCodes.TemplateNameRequired, name);
        }

        var names = await db.SurveyTemplates
            .Where(x => exceptTemplateId == null || x.SurveyTemplateId != exceptTemplateId)
            .Select(x => x.TemplateName)
            .ToListAsync(cancellationToken);
        if (names.Any(x => NormalizeKey(x) == NormalizeKey(name)))
        {
            return Invalid(SurveyErrorCodes.TemplateNameExists, name);
        }

        var sections = (command.Sections ?? [])
            .Select(section => new SaveSurveyQuestionSectionCommand(
                section.SectionId,
                section.SectionName?.Trim() ?? string.Empty))
            .ToList();

        if (sections.Count == 0)
        {
            return Invalid(SurveyErrorCodes.TemplateSectionsRequired, name);
        }
        if (sections.Count > SurveyRules.MaximumSectionsPerTemplate)
        {
            return Invalid(SurveyErrorCodes.TemplateTooManySections, name);
        }
        if (sections.Any(x => x.SectionName.Length == 0))
        {
            return Invalid(SurveyErrorCodes.SectionNameRequired, name);
        }
        // Tên mục đặt tuỳ ý (tối đa MaximumSectionsPerTemplate mục). Chuẩn hoá rồi mới
        // so trùng: "Đánh giá học phần" và "Đánh giá  học phần" chỉ khác nhau một dấu
        // cách, để lọt thành hai mục thì người dùng không hiểu vì sao mục bị tách đôi.
        var sectionKeys = sections.Select(x => NormalizeKey(x.SectionName)).ToList();
        if (sectionKeys.Distinct().Count() != sectionKeys.Count)
        {
            return Invalid(SurveyErrorCodes.SectionNameExists, name);
        }

        // Mục gửi lên kèm Id phải là mục có thật của CHÍNH bộ này. Bộ tạo mới thì
        // chưa có mục nào nên mọi Id đều sai.
        var sentSectionIds = sections
            .Where(x => x.SectionId is not null)
            .Select(x => x.SectionId!.Value)
            .ToList();
        if (sentSectionIds.Count > 0)
        {
            if (exceptTemplateId is not { } templateId)
            {
                return Invalid(SurveyErrorCodes.SectionNotFound, name);
            }

            var ownSectionIds = await db.SurveyQuestionSections
                .Where(x => x.SurveyTemplateId == templateId)
                .Select(x => x.SectionId)
                .ToListAsync(cancellationToken);
            if (sentSectionIds.Distinct().Count() != sentSectionIds.Count
                || sentSectionIds.Any(id => !ownSectionIds.Contains(id)))
            {
                return Invalid(SurveyErrorCodes.SectionNotFound, name);
            }
        }

        var questions = (command.Questions ?? [])
            .Select(question => new SaveSurveyQuestionCommand(
                question.QuestionText?.Trim() ?? string.Empty,
                question.AnswerScaleId,
                question.AttentionCheckValue,
                question.SectionIndex))
            .Where(question => question.QuestionText.Length > 0)
            .ToList();

        if (questions.Count == 0)
        {
            return Invalid(SurveyErrorCodes.TemplateQuestionsRequired, name);
        }
        if (questions.Any(x => x.SectionIndex < 0 || x.SectionIndex >= sections.Count))
        {
            return Invalid(SurveyErrorCodes.QuestionSectionInvalid, name);
        }
        if (Enumerable.Range(0, sections.Count).Any(index => questions.All(q => q.SectionIndex != index)))
        {
            return Invalid(SurveyErrorCodes.SectionEmpty, name);
        }
        // Tiêu đề mục hiện ra ngay trước câu đầu tiên của mục, nên một mục quay
        // lại sau khi đã sang mục khác là không đặt tiêu đề vào đâu được.
        var visitedSections = new HashSet<int>();
        var previousSection = -1;
        foreach (var question in questions)
        {
            if (question.SectionIndex == previousSection) continue;
            if (!visitedSections.Add(question.SectionIndex))
            {
                return Invalid(SurveyErrorCodes.SectionQuestionsNotContiguous, name);
            }
            previousSection = question.SectionIndex;
        }

        // Mỗi câu mang thang riêng nên phải kiểm tất cả mã thang được dùng.
        var scaleIds = questions.Select(x => x.AnswerScaleId).Distinct().ToList();
        var scales = await db.AnswerScales
            .Where(x => scaleIds.Contains(x.AnswerScaleId))
            .Select(x => new { x.AnswerScaleId, x.ScaleKind })
            .ToListAsync(cancellationToken);
        if (scales.Count != scaleIds.Count)
        {
            return Invalid(SurveyErrorCodes.QuestionScaleNotFound, name);
        }

        // Câu bẫy phải đặt được: thang có mức chọn sẵn, và mức bắt buộc phải là
        // một mức có thật của chính thang đó. Không thể bắt "chọn mức 3" trên
        // thang Có/Không vì thang đó chỉ có mức 1 và 5.
        if (questions.Any(x => x.AttentionCheckValue is not null))
        {
            var kindByScale = scales.ToDictionary(x => x.AnswerScaleId, x => x.ScaleKind);
            var optionValuesByScale = (await db.AnswerScaleOptions
                    .Where(x => scaleIds.Contains(x.AnswerScaleId))
                    .Select(x => new { x.AnswerScaleId, x.Value })
                    .ToListAsync(cancellationToken))
                .GroupBy(x => x.AnswerScaleId)
                .ToDictionary(group => group.Key, group => group.Select(x => x.Value).ToHashSet());

            foreach (var question in questions)
            {
                if (question.AttentionCheckValue is not { } required) continue;

                if (kindByScale[question.AnswerScaleId] != AnswerScaleKinds.Options)
                {
                    return Invalid(SurveyErrorCodes.AttentionCheckOnTextScale, name);
                }
                if (!optionValuesByScale.TryGetValue(question.AnswerScaleId, out var values)
                    || !values.Contains(required))
                {
                    return Invalid(SurveyErrorCodes.AttentionCheckValueInvalid, name);
                }
            }
        }

        return new TemplateValidation(null, name, sections, questions);

        static TemplateValidation Invalid(string errorCode, string name) =>
            new(errorCode, name, [], []);
    }

    private static AnswerScaleDto ToDto(AnswerScale scale, IReadOnlyList<AnswerScaleOption> options) =>
        new(
            scale.AnswerScaleId,
            scale.AnswerScaleName,
            scale.ScaleKind,
            options
                .OrderBy(x => x.Value)
                .Select(x => new AnswerScaleOptionDto(
                    x.AnswerScaleOptionId,
                    x.AnswerScaleId,
                    x.Value,
                    x.DisplayText))
                .ToList());

    /// <summary>
    /// Các câu của một bộ câu hỏi. "SurveyQuestions" không còn khoá ngoại thẳng
    /// tới "SurveyTemplates" nên mọi chỗ hỏi "câu của bộ X" đều phải đi vòng qua
    /// mục. Bộ lọc xoá mềm áp cho cả hai bảng nên câu và mục đã xoá không lọt ra.
    /// </summary>
    private IQueryable<SurveyQuestion> QuestionsOfTemplate(int surveyTemplateId) =>
        from question in db.SurveyQuestions
        join section in db.SurveyQuestionSections
            on question.SectionId equals section.SectionId
        where section.SurveyTemplateId == surveyTemplateId
        select question;

    private static SurveyTemplateDto ToDto(
        SurveyTemplate template,
        IReadOnlyList<SurveyQuestionSection> sections,
        IReadOnlyList<SurveyQuestion> questions,
        bool hasResponses = false)
    {
        var ordered = questions.OrderBy(x => x.QuestionId).ToList();

        // Mục không có cột thứ tự: thứ tự hiển thị là thứ tự câu đầu tiên của từng
        // mục. Mục chưa có câu nào xếp xuống cuối — lưu xong thì không còn mục nào
        // như vậy, nhưng ToDto cũng được gọi trên dữ liệu đọc lên nên đừng để nó
        // rơi mất dòng.
        var firstQuestionOfSection = ordered
            .Select((question, index) => (question.SectionId, Index: index))
            .GroupBy(x => x.SectionId)
            .ToDictionary(group => group.Key, group => group.Min(x => x.Index));

        return new SurveyTemplateDto(
            template.SurveyTemplateId,
            template.TemplateName,
            template.CreatedAt,
            sections
                .OrderBy(x => firstQuestionOfSection.TryGetValue(x.SectionId, out var index)
                    ? index
                    : int.MaxValue)
                .ThenBy(x => x.SectionId)
                .Select(x => new SurveyQuestionSectionDto(x.SectionId, x.SectionName))
                .ToList(),
            ordered
                .Select(x => new SurveyQuestionDto(
                    x.QuestionId,
                    template.SurveyTemplateId,
                    x.SectionId,
                    x.QuestionText,
                    x.AnswerScaleId,
                    x.AttentionCheckValue))
                .ToList(),
            hasResponses);
    }

    /// <summary>Các thang (kèm mức) mà một bộ câu hỏi đang dùng.</summary>
    private async Task<IReadOnlyList<AnswerScaleDto>> ScalesOfTemplateAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken)
    {
        var scaleIds = await QuestionsOfTemplate(surveyTemplateId)
            .AsNoTracking()
            .Select(x => x.AnswerScaleId)
            .Distinct()
            .ToListAsync(cancellationToken);
        if (scaleIds.Count == 0) return [];

        var scales = await db.AnswerScales
            .AsNoTracking()
            .Where(x => scaleIds.Contains(x.AnswerScaleId))
            .ToListAsync(cancellationToken);
        var options = await db.AnswerScaleOptions
            .AsNoTracking()
            .Where(x => scaleIds.Contains(x.AnswerScaleId))
            .OrderBy(x => x.Value)
            .ToListAsync(cancellationToken);

        return scales
            .OrderBy(x => x.AnswerScaleId)
            .Select(scale => ToDto(
                scale,
                options.Where(option => option.AnswerScaleId == scale.AnswerScaleId).ToList()))
            .ToList();
    }

    /// <summary>
    /// Điểm của một phiếu: trung bình các câu thuộc thang 'Options' và không phải
    /// câu bẫy. Câu thang 'Text' không có giá trị số nên không tham gia; câu bẫy
    /// ép chọn một mức cố định nên điểm của nó vô nghĩa, tính vào sẽ kéo lệch.
    /// </summary>
    private static decimal ComputeScore(IReadOnlyList<int> scoredValues) =>
        scoredValues.Count == 0
            ? 0m
            : Math.Round((decimal)scoredValues.Average(), 3);

    private static string NormalizeKey(string value) => value.Trim().ToLowerInvariant();

    private static SurveyOperationResult<T> Succeeded<T>(T value) => new(true, null, value);

    private static SurveyOperationResult<T> Failed<T>(string errorCode) => new(false, errorCode, default);

    // --------------------------------------------------------------- Restore

    public async Task<SurveyOperationResult<bool>> RestoreAnswerScaleAsync(
        int answerScaleId,
        CancellationToken cancellationToken = default)
    {
        var scale = await db.AnswerScales.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.AnswerScaleId == answerScaleId && x.IsDeleted, cancellationToken);
        if (scale is null) return Failed<bool>(SurveyErrorCodes.AnswerScaleNotFound);
        scale.IsDeleted = false;
        scale.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }

    public async Task<SurveyOperationResult<bool>> RestoreSurveyTemplateAsync(
        int surveyTemplateId,
        CancellationToken cancellationToken = default)
    {
        var template = await db.SurveyTemplates.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.SurveyTemplateId == surveyTemplateId && x.IsDeleted, cancellationToken);
        if (template is null) return Failed<bool>(SurveyErrorCodes.TemplateNotFound);
        template.IsDeleted = false;
        template.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }

    public async Task<SurveyOperationResult<bool>> RestoreSemesterSurveyAsync(
        int semesterSurveyId,
        CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.CanManageSurveyCampaigns)
        {
            return Failed<bool>(SurveyErrorCodes.OutOfScope);
        }

        var survey = await db.SemesterSurveys.IgnoreQueryFilters()
            .FirstOrDefaultAsync(x => x.SemesterSurveyId == semesterSurveyId && x.IsDeleted, cancellationToken);
        if (survey is null) return Failed<bool>(SurveyErrorCodes.SemesterSurveyNotFound);
        survey.IsDeleted = false;
        survey.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);
        return Succeeded(true);
    }
}
