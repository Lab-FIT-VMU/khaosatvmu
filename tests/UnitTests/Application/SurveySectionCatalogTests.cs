namespace UnitTests.ApplicationTests;

using System.Text;
using Application.Surveys;
using FluentAssertions;
using Xunit;

/// <summary>
/// Danh mục mục câu hỏi cố định. Mục trong CSDL nhận ra khoá bằng TÊN, không có cột
/// nào lưu khoá, nên chỗ dễ vỡ nhất là phép so tên — nhất là với mục 5 đang nằm sẵn
/// trong DB bị gõ thiếu dấu mà không được phép sửa.
/// </summary>
public class SurveySectionCatalogTests
{
    [Fact]
    public void Entries_DungBaMucTheoThuTuTrenPhieu()
    {
        SurveySectionCatalog.Entries.Select(x => x.Key).Should().Equal(
            SurveySectionCatalog.CourseContent,
            SurveySectionCatalog.Lecturer,
            SurveySectionCatalog.Facilities);
    }

    [Theory]
    [InlineData("Nội dung đánh giá học phần", SurveySectionCatalog.CourseContent)]
    [InlineData("Nội dung đánh giá về giảng viên", SurveySectionCatalog.Lecturer)]
    [InlineData("Nội dung đánh giá về cơ sở vật chất, phục vụ học tập", SurveySectionCatalog.Facilities)]
    // Đúng tên mục đang nằm trong DB: "cơ sơ" thiếu dấu hỏi.
    [InlineData("Nội dung đánh giá về cơ sơ vật chất, phục vụ học tập", SurveySectionCatalog.Facilities)]
    [InlineData("  NỘI DUNG   ĐÁNH GIÁ HỌC PHẦN ", SurveySectionCatalog.CourseContent)]
    [InlineData("Nội dung đánh giá về cơ sở vật chất phục vụ học tập", SurveySectionCatalog.Facilities)]
    [InlineData("noi dung danh gia ve giang vien", SurveySectionCatalog.Lecturer)]
    public void Resolve_NhanRaMucBatKeCachGoDau(string name, string expected)
    {
        SurveySectionCatalog.Resolve(name).Should().Be(expected);
    }

    [Fact]
    public void Resolve_NhanRaTenGoBangKyTuGhep()
    {
        // Bộ gõ khác nhau cho ra "ả" dựng sẵn hoặc "a" cộng dấu hỏi rời.
        var decomposed = "Nội dung đánh giá học phần".Normalize(NormalizationForm.FormD);

        SurveySectionCatalog.Resolve(decomposed).Should().Be(SurveySectionCatalog.CourseContent);
    }

    [Theory]
    [InlineData("Mục khác")]
    [InlineData("Nội dung đánh giá học phần và giảng viên")]
    [InlineData("Đánh giá giảng viên")]
    [InlineData("   ")]
    [InlineData("")]
    [InlineData(null)]
    public void Resolve_TenNgoaiDanhMuc_TraVeNull(string? name)
    {
        SurveySectionCatalog.Resolve(name).Should().BeNull();
    }

    [Fact]
    public void NameOf_TraVeTenChuan()
    {
        SurveySectionCatalog.NameOf(SurveySectionCatalog.Facilities)
            .Should().Be("Nội dung đánh giá về cơ sở vật chất, phục vụ học tập");
    }

    [Fact]
    public void Validate_BaMucTrongDanhMuc_HopLe()
    {
        SurveySectionCatalog.Validate(
            [
                "Nội dung đánh giá học phần",
                "Nội dung đánh giá về giảng viên",
                "Nội dung đánh giá về cơ sơ vật chất, phục vụ học tập",
            ])
            .Should().BeNull();
    }

    [Fact]
    public void Validate_CoMucNgoaiDanhMuc_BaoKhongChoPhep()
    {
        SurveySectionCatalog.Validate(["Nội dung đánh giá học phần", "Tiêu chí khác"])
            .Should().Be(SurveyErrorCodes.SectionNameNotAllowed);
    }

    [Fact]
    public void Validate_HaiTenQuyVeCungMotKhoa_BaoTrung()
    {
        // Chỉ lệch nhau một dấu hỏi nhưng vẫn là cùng một mục.
        SurveySectionCatalog.Validate(
            [
                "Nội dung đánh giá về cơ sở vật chất, phục vụ học tập",
                "Nội dung đánh giá về cơ sơ vật chất, phục vụ học tập",
            ])
            .Should().Be(SurveyErrorCodes.SectionNameExists);
    }
}
