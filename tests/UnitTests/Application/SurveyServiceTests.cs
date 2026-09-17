namespace UnitTests.ApplicationTests;

using Application.Surveys;
using Domain;
using FluentAssertions;
using Xunit;

public class SurveyServiceTests
{
    private static SaveSurveyQuestionCommand Question(
        string text,
        int answerScaleId = 1,
        int? attentionCheckValue = null,
        int sectionIndex = 0) =>
        new(text, answerScaleId, attentionCheckValue, sectionIndex);

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
            [Section("Nội dung đánh giá học phần")],
            questions);

        command.Questions.Should().HaveCount(45);
    }

    [Fact]
    public void SaveSurveyTemplateCommand_MoiCauTroToiMucQuaSectionIndex()
    {
        var command = new SaveSurveyTemplateCommand(
            "Phiếu hai mục",
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
    public void SaveSurveyTemplateCommand_MixesAnswerScalesPerQuestion()
    {
        var command = new SaveSurveyTemplateCommand("Phiếu trộn thang", [Section("Mục duy nhất")], [
            Question("Giảng viên trình bày rõ ràng, dễ hiểu.", 1),
            Question("Bạn có biết về chuẩn đầu ra học phần không?", 2),
            Question("Ý kiến của bạn về học phần?", 4),
        ]);

        command.Questions.Select(x => x.AnswerScaleId).Should().Equal(1, 2, 4);
    }

    [Fact]
    public void SubmitSurveyResponseCommand_AverageScoreSkipsTextAnswers()
    {
        // Câu 4 thuộc thang 'Điền từ' nên không có giá trị số và không vào điểm.
        var answers = new List<SubmitSurveyAnswerCommand>
        {
            new(1, "5"),
            new(2, "4"),
            new(3, "5"),
            new(4, "Học phần rất bổ ích"),
        };
        var command = new SubmitSurveyResponseCommand(answers, "Bài giảng rất hay", 120);

        var scored = command.Answers
            .Select(a => int.TryParse(a.AnswerValue, out var value) ? value : (int?)null)
            .Where(x => x.HasValue)
            .Select(x => x!.Value)
            .ToList();

        scored.Should().HaveCount(3);
        ((decimal)scored.Average()).Should().BeApproximately(4.67m, 0.01m);
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
        var scale = new SaveAnswerScaleCommand("Thang đo Likert 5 mức", AnswerScaleKinds.Options, options);

        scale.Options.Should().HaveCount(5);
        scale.Options.Select(o => o.Value).Should().BeEquivalentTo([1, 2, 3, 4, 5]);
    }

    [Fact]
    public void SaveAnswerScaleCommand_YesNoUsesValuesOneAndFive()
    {
        // Có/Không dùng 1 và 5 để cùng dải điểm với thang mức độ hài lòng.
        var scale = new SaveAnswerScaleCommand("Có không", AnswerScaleKinds.Options, [
            new(1, "Không"),
            new(5, "Có"),
        ]);

        scale.Options.Select(o => o.Value).Should().Equal(1, 5);
    }

    [Fact]
    public void SaveAnswerScaleCommand_TextScaleHasNoOptions()
    {
        var scale = new SaveAnswerScaleCommand("Điền từ", AnswerScaleKinds.Text, []);

        scale.ScaleKind.Should().Be(AnswerScaleKinds.Text);
        scale.Options.Should().BeEmpty();
    }

    [Theory]
    [InlineData("Options", true)]
    [InlineData("Text", true)]
    [InlineData("options", false)]
    [InlineData("", false)]
    public void AnswerScaleKinds_IsValid_AcceptsOnlyKnownKinds(string kind, bool expected)
    {
        AnswerScaleKinds.IsValid(kind).Should().Be(expected);
    }
}
