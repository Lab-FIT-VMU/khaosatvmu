namespace UnitTests.InfrastructureTests;

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Application.CourseGrades;
using DocumentFormat.OpenXml.Packaging;
using FluentAssertions;
using global::Infrastructure.CourseGrades;
using Xunit;
using Xunit.Abstractions;

/// <summary>
/// Nghiệm thu bộ luật A bằng C# trên 4 file điểm thật: số dòng giữ / loại theo từng luật phải
/// đúng bằng bản Python (docs/plans/tich-hop-phan-tich-diem-hoc-phan.md mục 8.1).
///
/// Dữ liệu thật KHÔNG nằm trong repo. Đặt biến môi trường <c>COURSE_GRADE_REAL_DATA_DIR</c> trỏ
/// tới thư mục "Diem hoc tap cua SV theo ky" thì test mới chạy; không thì tự bỏ qua. Test chỉ
/// so số đếm, và in một mã băm SHA-256 của (mã SV, mã HP, X, Y, Z) để đối chiếu từng dòng với
/// bản Python mà không phải xuất dữ liệu ra ngoài.
/// </summary>
public class GradeRuleARealDataTests(ITestOutputHelper output)
{
    public static TheoryData<string, int, int, string> Terms => new()
    {
        // kỳ, dòng gốc, dòng giữ lại, "luật=số" của các dòng bị loại
        { "2425_HK1", 98473, 81559, "L1=5983;L2=418;L3=5088;L4=207;L5=2;L6=751;L7=4371;L8=46;T=48" },
        { "2425_HK2", 104192, 72220, "L1=8146;L3=1622;L4=16114;L6=4662;L7=1353;L8=74;T=1" },
        { "2526_HK1", 112024, 89624, "L1=7154;L2=417;L3=7455;L4=1868;L5=31;L6=1056;L7=4393;T=26" },
        { "2526_HK2", 117195, 82601, "L1=7785;L2=1;L3=984;L4=19488;L5=9;L6=4774;L7=1522;T=31" },
    };

    [Theory]
    [MemberData(nameof(Terms))]
    public void RealFile_MatchesPythonCounts(string term, int sourceRows, int keptRows, string excluded)
    {
        var directory = Environment.GetEnvironmentVariable("COURSE_GRADE_REAL_DATA_DIR");
        if (string.IsNullOrWhiteSpace(directory)) return;
        var path = Path.Combine(directory, term + ".xlsx");
        if (!File.Exists(path)) return;

        using var document = SpreadsheetDocument.Open(path, false);
        var sheet = GradeWorkbookReader.ReadFirstSheet(document);
        sheet.Headers.Should().Contain(GradeRuleA.RequiredColumns);

        var result = GradeRuleA.Process(sheet.Rows);

        result.SourceRowCount.Should().Be(sourceRows);
        result.UsableRowCount.Should().Be(keptRows);
        result.UnreadableRowNumbers.Should().BeEmpty();
        var expected = excluded.Split(';')
            .Select(pair => pair.Split('='))
            .ToDictionary(pair => pair[0], pair => int.Parse(pair[1], CultureInfo.InvariantCulture));
        result.ExcludedCounts.Should().BeEquivalentTo(expected);

        var lines = result.Rows
            .Where(x => x.ExclusionRule is null)
            .Select(x => string.Create(CultureInfo.InvariantCulture,
                $"{x.StudentCode}|{x.CourseCode}|{x.X:F4}|{x.Y:F4}|{x.Z:F4}"))
            .OrderBy(x => x, StringComparer.Ordinal);
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\n', lines))));
        output.WriteLine($"{term} digest {digest}");
    }
}
