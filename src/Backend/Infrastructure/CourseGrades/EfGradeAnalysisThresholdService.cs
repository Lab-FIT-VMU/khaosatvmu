using Application;
using Application.Auth;
using Application.CourseGrades;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.CourseGrades;

/// <summary>
/// Ngưỡng của bộ luật D, E. Ai sửa được do quyền COURSE_GRADE_THRESHOLDS_ACCESS quyết định; vai trò
/// chỉ đọc (Ban giám hiệu, giảng viên) không sửa được kể cả khi được cấp nhầm quyền. Mỗi lần lưu
/// có thay đổi: tăng phiên bản chung, ghi nhật ký (AuditInterceptor), xếp lượt tính lại mọi kỳ.
/// </summary>
public sealed class EfGradeAnalysisThresholdService(
    AppDbContext db,
    ICurrentUserAccessor currentUser,
    IUserScopeResolver userScope) : IGradeAnalysisThresholdService
{
    public async Task<GradeAnalysisThresholdSetDto> GetAsync(CancellationToken cancellationToken = default)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        var rows = await db.GradeAnalysisThresholds.AsNoTracking()
            .OrderBy(x => x.GroupCode).ThenBy(x => x.SortOrder)
            .ToListAsync(cancellationToken);
        var groupOrder = GradeAnalysisThresholdCatalog.GroupNames.Keys.Select((code, index) => (code, index))
            .ToDictionary(x => x.code, x => x.index);
        return new GradeAnalysisThresholdSetDto(
            rows.Count == 0 ? 0 : rows.Max(x => x.Version),
            CanEdit(scope),
            rows.OrderBy(x => groupOrder.GetValueOrDefault(x.GroupCode, int.MaxValue)).ThenBy(x => x.SortOrder)
                .Select(ToDto).ToList());
    }

    public async Task<GradeAnalysisThresholdSaveResultDto> UpdateAsync(
        IReadOnlyList<GradeAnalysisThresholdUpdate> updates, CancellationToken cancellationToken = default)
    {
        var byCode = updates.GroupBy(x => x.Code).ToDictionary(g => g.Key, g => g.Last());
        return await SaveAsync(row => byCode.TryGetValue(row.ThresholdCode, out var update)
            ? new GradeAnalysisThresholdValue(update.NumericValue, update.BooleanValue, update.TextListValue)
            : null, cancellationToken, unknownCodes: byCode.Keys);
    }

    public Task<GradeAnalysisThresholdSaveResultDto> ResetToDefaultsAsync(CancellationToken cancellationToken = default) =>
        SaveAsync(row => new GradeAnalysisThresholdValue(row.DefaultNumericValue, row.DefaultBooleanValue, row.DefaultTextListValue),
            cancellationToken, unknownCodes: []);

    private async Task<GradeAnalysisThresholdSaveResultDto> SaveAsync(
        Func<GradeAnalysisThreshold, GradeAnalysisThresholdValue?> newValueOf,
        CancellationToken cancellationToken,
        IEnumerable<string> unknownCodes)
    {
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!CanEdit(scope))
        {
            throw new CourseGradeException(CourseGradeErrorCodes.OutOfScope, "Vai trò của bạn chỉ được xem ngưỡng phân tích.");
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var rows = await db.GradeAnalysisThresholds.ToListAsync(cancellationToken);
        var unknown = unknownCodes.Where(code => rows.All(r => r.ThresholdCode != code)).ToList();
        if (unknown.Count > 0)
        {
            throw new CourseGradeException(CourseGradeErrorCodes.InvalidQuery, "Không có ngưỡng: " + string.Join(", ", unknown));
        }

        // Giá trị sau khi áp thay đổi, để kiểm tra cả các ràng buộc giữa các ngưỡng.
        var merged = new Dictionary<string, GradeAnalysisThresholdValue>();
        var changed = new List<(GradeAnalysisThreshold Row, GradeAnalysisThresholdValue Value)>();
        foreach (var row in rows)
        {
            var current = new GradeAnalysisThresholdValue(row.NumericValue, row.BooleanValue, row.TextListValue);
            var proposed = newValueOf(row) is { } value ? Normalize(row.ValueType, value) : current;
            merged[row.ThresholdCode] = proposed;
            if (!SameValue(current, proposed))
            {
                changed.Add((row, proposed));
            }
        }

        var errors = GradeAnalysisThresholdRules.Validate(merged);
        if (errors.Count > 0)
        {
            throw new CourseGradeException(CourseGradeErrorCodes.InvalidQuery, string.Join(" ", errors));
        }

        var version = rows.Count == 0 ? 0 : rows.Max(x => x.Version);
        if (changed.Count == 0)
        {
            return new GradeAnalysisThresholdSaveResultDto(version, 0, null);
        }

        var newVersion = version + 1;
        var now = DateTime.UtcNow;
        foreach (var (row, value) in changed)
        {
            row.NumericValue = value.Numeric;
            row.BooleanValue = value.Boolean;
            row.TextListValue = value.TextList?.ToList();
            row.Version = newVersion;
            row.UpdatedAtUtc = now;
            row.UpdatedByUserId = currentUser.UserId;
        }
        await db.SaveChangesAsync(cancellationToken);

        var run = await GradeAnalysisRunQueue.QueueAsync(
            db, GradeAnalysisRunTriggers.ThresholdChange, currentUser.UserId ?? Guid.Empty, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new GradeAnalysisThresholdSaveResultDto(newVersion, changed.Count, GradeAnalysisRunMapping.ToDto(run));
    }

    private static bool CanEdit(UserScope scope) => !scope.IsReadOnly && !scope.SeesNothing;

    /// <summary>Chỉ giữ trường đúng loại ngưỡng; danh sách chữ được cắt khoảng trắng, bỏ trùng.</summary>
    private static GradeAnalysisThresholdValue Normalize(string valueType, GradeAnalysisThresholdValue value) => valueType switch
    {
        GradeAnalysisThresholdValueTypes.Boolean => new(null, value.Boolean, null),
        GradeAnalysisThresholdValueTypes.TextList => new(null, null, value.TextList?
            .Select(x => x.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList()),
        _ => new(value.Numeric, null, null),
    };

    private static bool SameValue(GradeAnalysisThresholdValue a, GradeAnalysisThresholdValue b) =>
        a.Numeric == b.Numeric
        && a.Boolean == b.Boolean
        && (a.TextList ?? []).SequenceEqual(b.TextList ?? []);

    private static GradeAnalysisThresholdDto ToDto(GradeAnalysisThreshold x) => new(
        x.ThresholdCode,
        x.GroupCode,
        GradeAnalysisThresholdCatalog.GroupNames.GetValueOrDefault(x.GroupCode, x.GroupCode),
        x.DisplayName,
        x.Description,
        x.RuleReference,
        x.ValueType,
        x.NumericValue,
        x.BooleanValue,
        x.TextListValue,
        x.DefaultNumericValue,
        x.DefaultBooleanValue,
        x.DefaultTextListValue,
        x.MinValue,
        x.MaxValue,
        x.Unit,
        x.SortOrder,
        x.Version,
        x.UpdatedAtUtc);
}
