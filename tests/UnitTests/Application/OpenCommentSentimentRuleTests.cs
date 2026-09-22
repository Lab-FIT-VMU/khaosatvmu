using Application.Reports;
using Domain;
using FluentAssertions;
using Xunit;

namespace UnitTests.ApplicationTests;

/// <summary>
/// Kiểm tra quy tắc suy ra nhãn Hỗn hợp và Chưa chắc chắn. Đây là phần nghiệp vụ dễ sai nhất của
/// tính năng: model chỉ trả ba xác suất, còn hai nhãn kia do quy tắc quyết định.
/// </summary>
public class OpenCommentSentimentRuleTests
{
    private const double ConfidenceThreshold = 0.45d;
    private const double MixedThreshold = 0.20d;

    // Thứ tự xác suất là [Negative, Neutral, Positive] — đúng thứ tự logits của model.
    private static double[] Negative(double value) => [value, 1d - value, 0d];

    private static double[] Positive(double value) => [0d, 1d - value, value];

    [Fact]
    public void SplitClauses_SplitsOnContrastConjunction()
    {
        var clauses = OpenCommentSentimentRules.SplitClauses(
            "Cô hướng dẫn rất tận tâm nhưng lịch kiểm tra thay đổi quá nhiều.");

        clauses.Should().HaveCount(2);
        clauses[0].Should().Be("Cô hướng dẫn rất tận tâm");
        clauses[1].Should().Be("lịch kiểm tra thay đổi quá nhiều");
    }

    [Fact]
    public void SplitClauses_DoesNotSplitOnDecimalPoint()
    {
        var clauses = OpenCommentSentimentRules.SplitClauses("Điểm 9.5/10 là hợp lý và công bằng.");

        clauses.Should().HaveCount(1);
    }

    [Fact]
    public void SplitClauses_SplitsOnSentenceDelimiterWithTrailingSpace()
    {
        var clauses = OpenCommentSentimentRules.SplitClauses("Phòng học chật. Máy chiếu bị mờ.");

        clauses.Should().HaveCount(2);
    }

    [Fact]
    public void SplitClauses_KeepsWholeTextWhenNothingIsWorthSplitting()
    {
        var clauses = OpenCommentSentimentRules.SplitClauses("Nội dung ổn.");

        clauses.Should().HaveCount(1);
        // Dấu chấm cuối câu bị cắt cùng bộ ký tự bao quanh mệnh đề — giống bản Python, và không
        // ảnh hưởng kết quả vì câu một mệnh đề không tách thì dùng luôn xác suất toàn câu.
        clauses[0].Should().Be("Nội dung ổn");
    }

    [Fact]
    public void SplitClauses_EmptyTextHasNoClause()
    {
        OpenCommentSentimentRules.SplitClauses("   ").Should().BeEmpty();
    }

    [Theory]
    [InlineData("Thầy dạy hay nhưng bài tập quá nhiều", true)]
    [InlineData("Hay và bổ ích", false)]
    [InlineData("Cần thêm bài tập; nên có buổi chữa", true)]
    [InlineData("Tuy nhiên em thấy chưa ổn", true)]
    public void ContainsContrastMarker_DetectsTwoSidedText(string text, bool expected)
    {
        OpenCommentSentimentRules.ContainsContrastMarker(text).Should().Be(expected);
    }

    [Fact]
    public void Resolve_ConfidentBase_ReturnsBaseLabel()
    {
        var resolved = OpenCommentSentimentRules.Resolve(
            Positive(0.7d), [Positive(0.7d)], ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Positive);
        resolved.Confidence.Should().BeApproximately(0.7d, 1e-9);
    }

    [Fact]
    public void Resolve_BaseBelowConfidenceThreshold_ReturnsUncertain()
    {
        var resolved = OpenCommentSentimentRules.Resolve(
            [0.4d, 0.35d, 0.25d], [[0.4d, 0.35d, 0.25d]], ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Uncertain);
        resolved.Confidence.Should().BeApproximately(0.4d, 1e-9);
    }

    [Fact]
    public void Resolve_OnePolarityPerClause_ReturnsMixed()
    {
        double[][] clauses = [Positive(0.7d), Negative(0.8d)];

        var resolved = OpenCommentSentimentRules.Resolve(
            [0.35d, 0.30d, 0.35d], clauses, ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Mixed);
        // Độ tin cậy của Hỗn hợp là vế YẾU hơn: kết luận chỉ chắc bằng vế yếu nhất.
        resolved.Confidence.Should().BeApproximately(0.7d, 1e-9);
    }

    [Fact]
    public void Resolve_MixedWinsOverLowBaseConfidence()
    {
        // Câu bị cắt vụn nên model không chắc ở cấp toàn câu, nhưng từng vế lại rất rõ.
        double[][] clauses = [Positive(0.9d), Negative(0.9d)];

        var resolved = OpenCommentSentimentRules.Resolve(
            [0.34d, 0.33d, 0.33d], clauses, ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Mixed);
    }

    [Fact]
    public void Resolve_ClauseWithBothPolaritiesBelowThreshold_DoesNotTriggerMixed()
    {
        // Mệnh đề "hơi nhạt": cả hai cực đều dưới ngưỡng 0,20 nên không vế nào được tính.
        double[] tooWeakToCount = [0.15d, 0.70d, 0.15d];
        double[] strongNegative = Negative(0.6d);

        var resolved = OpenCommentSentimentRules.Resolve(
            Negative(0.6d), [tooWeakToCount, strongNegative], ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Negative);
    }

    [Fact]
    public void Resolve_NeutralClauseWithNegativeClause_IsNotMixed()
    {
        // Mệnh đề trung tính thật (cả hai cực đều yếu) thì đứng cạnh vế tiêu cực vẫn không thành
        // hai chiều: câu chỉ có một phía.
        double[] neutral = [0.15d, 0.70d, 0.15d];
        double[] negative = Negative(0.7d);

        var resolved = OpenCommentSentimentRules.Resolve(
            Negative(0.7d), [neutral, negative], ConfidenceThreshold, MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Negative);
    }

    [Fact]
    public void Resolve_ClauseWhoseArgmaxIsNeutral_StillCountsAsAPole()
    {
        // Đây là khác biệt cốt lõi so với quy tắc cũ: mệnh đề phàn nàn mà model gọi là Neutral
        // nhưng cho p(Negative) = 0,40 VẪN được tính là vế tiêu cực. Quy tắc cũ đòi argmax nên bỏ
        // qua vế này, và đó là lý do 30/58 câu hai chiều của tập gold bị ghi thành Tích cực.
        double[] complaintArgmaxNeutral = [0.40d, 0.45d, 0.15d];
        double[] praise = [0.10d, 0.15d, 0.75d];

        var resolved = OpenCommentSentimentRules.Resolve(
            [0.40d, 0.45d, 0.15d],
            [complaintArgmaxNeutral, praise],
            ConfidenceThreshold,
            MixedThreshold);

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Mixed);
        // Độ tin cậy lấy vế yếu hơn, ở đây là vế tiêu cực 0,40.
        resolved.Confidence.Should().BeApproximately(0.40d, 1e-9);
    }

    [Fact]
    public void ArgMax_OnTie_ReturnsFirstPositionLikeNumpy()
    {
        OpenCommentSentimentRules.ArgMax([0.5d, 0.5d, 0.0d]).Should().Be(0);
        OpenCommentSentimentRules.ArgMax([0.1d, 0.5d, 0.5d]).Should().Be(1);
    }

    [Fact]
    public void EmptyResult_IsUncertainWithZeroConfidence()
    {
        var resolved = OpenCommentSentimentRules.EmptyResult();

        resolved.Sentiment.Should().Be(OpenCommentSentiments.Uncertain);
        resolved.Confidence.Should().Be(0d);
    }

    [Fact]
    public void Resolve_WrongProbabilityCount_Throws()
    {
        var act = () => OpenCommentSentimentRules.Resolve(
            [0.5d, 0.5d], [[0.5d, 0.5d]], ConfidenceThreshold, MixedThreshold);

        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void ToDisplay_CoversEveryLabel()
    {
        foreach (var sentiment in OpenCommentSentiments.All)
        {
            OpenCommentSentimentLabels.ToDisplay(sentiment).Should().NotBe(sentiment);
        }
    }
}
