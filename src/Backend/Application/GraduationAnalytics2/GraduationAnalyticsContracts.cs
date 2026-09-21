namespace Application.GraduationAnalytics2;

public static class GraduationAnalyticsErrorCodes
{
    public const string InvalidImport = "GRADUATION_IMPORT_INVALID";
    public const string TooManyRows = "GRADUATION_IMPORT_TOO_LARGE";
    public const string LegacyStructureUnsupported = "LEGACY_STRUCTURE_UNSUPPORTED";
    public const string InvalidQuery = "GRADUATION_QUERY_INVALID";
}

/// <summary>Một dòng hỏng của tệp nguồn, kèm nguyên nội dung để người dùng dò lại.</summary>
public sealed record GraduationImportRowError(
    int RowNumber,
    string Reason,
    IReadOnlyList<string> Values);

public sealed class GraduationAnalyticsException(string errorCode, string message)
    : Exception(message)
{
    public string ErrorCode { get; } = errorCode;

    /// <summary>Tiêu đề các cột của sheet nguồn, để dựng bảng lỗi ngoài giao diện.</summary>
    public IReadOnlyList<string> SourceColumns { get; init; } = [];

    public IReadOnlyList<GraduationImportRowError> RowErrors { get; init; } = [];
}
