namespace UnitTests.ApplicationTests;

using Application.Surveys;
using FluentAssertions;
using Xunit;

public class SurveyServiceTests
{
    private static SaveSurveyQuestionCommand Question(
        string text,
        int? attentionCheckValue = null,
        int sectionIndex = 0) =>
        new(text, attentionCheckValue, sectionIndex);

    private static SaveSurveyQuestionSectionCommand Section(string name, int? sectionId = null) =>
        new(sectionId, name);

    [Fact]
    public void SurveyRules_MaximumSectionsPerTemplate_ShouldBeThree()
    {
        SurveyRules.MaximumSectionsPerTemplate.Should().Be(3);
    }

    [Fact]
    public void SaveSurveyTemplateCommand_KeepsEveryQuestion_KhongCoTranSoCau()
    {
        // Giới hạn 30 câu đã bỏ: bộ dài bao nhiêu là việc của người soạn phiếu.
        var questions = Enumerable.Range(1, 45)
            .Select(i => Question($"Tiêu chí đánh giá số {i}"))
            .ToList();
        var command = new SaveSurveyTemplateCommand(
            "Phiếu khảo sát chuẩn VMU",
            1,
            [Section("Nội dung đánh giá học phần")],
            questions);

        command.Questions.Should().HaveCount(45);
    }

    [Fact]
    public void SaveSurveyTemplateCommand_MoiCauTroToiMucQuaSectionIndex()
    {
        var command = new SaveSurveyTemplateCommand(
            "Phiếu hai mục",
            1,
            [Section("Nội dung đánh giá học phần"), Section("Nội dung đánh giá về giảng viên")],
            [
                Question("Học phần trang bị đủ kiến thức?", sectionIndex: 0),
                Question("Giảng viên trình bày rõ ràng, dễ hiểu.", sectionIndex: 1),
            ]);

        command.Sections.Should().HaveCount(2);
        command.Questions.Select(x => x.SectionIndex).Should().Equal(0, 1);
    }

    [Fact]
    public void SaveSurveyQuestionSectionCommand_SectionIdNull_LaMucMoi()
    {
        // Mục đã có thì gửi kèm mã để backend UPDATE tên tại chỗ, giữ nguyên
        // "SectionId" cho báo cáo cũ; mục mới thì để null.
        Section("Mục mới").SectionId.Should().BeNull();
        Section("Mục đã có", sectionId: 7).SectionId.Should().Be(7);
    }

    [Fact]
    public void SaveSurveyTemplateCommand_MotThangChoCaBo_CauKhongMangThangRieng()
    {
        var command = new SaveSurveyTemplateCommand("Phiếu một thang", 3, [Section("Mục duy nhất")], [
            Question("Giảng viên trình bày rõ ràng, dễ hiểu."),
            Question("Câu bẫy: chọn mức 3", attentionCheckValue: 3),
        ]);

        command.AnswerScaleId.Should().Be(3);
        command.Questions.Select(x => x.AttentionCheckValue).Should().Equal(null, 3);
    }

    [Fact]
    public void SaveAnswerScaleCommand_WithFiveOptions_ShouldHaveCorrectScaleValues()
    {
        var options = new List<SaveAnswerScaleOptionCommand>
        {
            new(1, "Rất không hài lòng"),
            new(2, "Không hài lòng"),
            new(3, "Bình thường"),
            new(4, "Hài lòng"),
            new(5, "Rất hài lòng")
        };
        var scale = new SaveAnswerScaleCommand("Thang đo Likert 5 mức", options);

        scale.Options.Should().HaveCount(5);
        scale.Options.Select(o => o.Value).Should().BeEquivalentTo([1, 2, 3, 4, 5]);
    }

    [Fact]
    public void SaveAnswerScaleCommand_YesNoUsesValuesOneAndFive()
    {
        // Có/Không dùng 1 và 5 để cùng dải điểm với thang mức độ hài lòng.
        var scale = new SaveAnswerScaleCommand("Có không", [
            new(1, "Không"),
            new(5, "Có"),
        ]);

        scale.Options.Select(o => o.Value).Should().Equal(1, 5);
    }
}
