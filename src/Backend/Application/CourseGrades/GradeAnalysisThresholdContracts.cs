namespace Application.CourseGrades;

public sealed record GradeAnalysisThresholdDto(
    string Code,
    string GroupCode,
    string GroupName,
    string DisplayName,
    string? Description,
    string? RuleReference,
    string ValueType,
    decimal? NumericValue,
    bool? BooleanValue,
    IReadOnlyList<string>? TextListValue,
    decimal? DefaultNumericValue,
    bool? DefaultBooleanValue,
    IReadOnlyList<string>? DefaultTextListValue,
    decimal? MinValue,
    decimal? MaxValue,
    string? Unit,
    short SortOrder,
    int Version,
    DateTime UpdatedAtUtc);

public sealed record GradeAnalysisThresholdSetDto(
    int Version,
    /// <summary>Người xem có được sửa không (có quyền và không phải vai trò chỉ đọc).</summary>
    bool CanEdit,
    IReadOnlyList<GradeAnalysisThresholdDto> Thresholds);

/// <summary>Kết quả lưu: phiên bản mới và lượt tính lại vừa xếp (null nếu không có gì thay đổi).</summary>
public sealed record GradeAnalysisThresholdSaveResultDto(
    int Version,
    int ChangedCount,
    GradeAnalysisRunDto? QueuedRun);

/// <summary>Giá trị mới của một ngưỡng, đúng một trường có giá trị theo loại ngưỡng.</summary>
public sealed record GradeAnalysisThresholdUpdate(
    string Code,
    decimal? NumericValue,
    bool? BooleanValue,
    IReadOnlyList<string>? TextListValue);

public interface IGradeAnalysisThresholdService
{
    Task<GradeAnalysisThresholdSetDto> GetAsync(CancellationToken cancellationToken = default);

    Task<GradeAnalysisThresholdSaveResultDto> UpdateAsync(
        IReadOnlyList<GradeAnalysisThresholdUpdate> updates, CancellationToken cancellationToken = default);

    Task<GradeAnalysisThresholdSaveResultDto> ResetToDefaultsAsync(CancellationToken cancellationToken = default);
}
