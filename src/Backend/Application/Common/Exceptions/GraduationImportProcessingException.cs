namespace Application.Common.Exceptions;

/// <summary>An unexpected processing failure, distinct from a user's invalid workbook.</summary>
public sealed class GraduationImportProcessingException(Exception innerException)
    : Exception("An unexpected error occurred while processing the graduation workbook.", innerException);
