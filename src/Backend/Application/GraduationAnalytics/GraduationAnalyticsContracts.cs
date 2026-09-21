namespace Application.GraduationAnalytics;

public static class GraduationAnalyticsErrorCodes
{
    public const string InvalidImport = "GRADUATION_IMPORT_INVALID";
    public const string TooManyRows = "GRADUATION_IMPORT_TOO_LARGE";
    public const string LegacyStructureUnsupported = "LEGACY_STRUCTURE_UNSUPPORTED";
    public const string InvalidQuery = "GRADUATION_QUERY_INVALID";
}

public sealed class GraduationAnalyticsException(string errorCode, string message)
    : Exception(message)
{
    public string ErrorCode { get; } = errorCode;
}
