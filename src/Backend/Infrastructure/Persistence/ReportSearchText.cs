using System.Globalization;
using System.Text;

namespace Infrastructure.Persistence;

/// <summary>Vietnamese search folding, translated to PostgreSQL's built-in translate().</summary>
public static class ReportSearchText
{
    public const string Accented = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
    public static readonly string From = Accented + string.Concat(Enumerable.Range(0x300, 0x70).Select(x => (char)x));
    public const string To = "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd";

    public static string Fold(string value) => string.Concat(value.Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark))
        .Replace('đ', 'd').Replace('Đ', 'D').Trim().ToLowerInvariant();

    // Also usable by EF's in-memory provider in tests.
    public static string Translate(string value, string from, string to) => string.Concat(value.Select(c =>
    {
        var index = from.IndexOf(c);
        return index < 0 ? c.ToString() : index < to.Length ? to[index].ToString() : string.Empty;
    }));
}
