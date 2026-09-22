using System.Globalization;
using Application.Reports;
using FluentAssertions;
using Xunit;

namespace UnitTests.ApplicationTests;

/// <summary>
/// Kiểm tra "phiên bản quy tắc" — thứ tách khỏi phiên bản model để kết quả cũ không nằm im khi
/// quy tắc hoặc ngưỡng đổi.
///
/// Bối cảnh: nhãn lưu trong cơ sở dữ liệu sinh ra từ hai thứ độc lập nhau — model ba lớp và quy
/// tắc suy ra Mixed/Uncertain. Trước khi có cột RuleVersion, chỉ có ModelVersion nên bản sửa quy
/// tắc ngày 20/09/2026 (xét khối xác suất thay vì đòi argmax) không làm kết quả cũ thành "còn nợ",
/// và một lần chạy lại không ép buộc sẽ bỏ qua hết trong im lặng.
/// </summary>
public class OpenCommentRuleVersionTests
{
    /// <summary>Độ dài cột RuleVersion trong bảng OpenCommentAnalysisResults.</summary>
    private const int ColumnMaxLength = 64;

    [Fact]
    public void EffectiveRuleVersion_ShouldCarryRuleNameAndBothThresholds()
    {
        var options = new OpenCommentSentimentOptions
        {
            RuleVersion = "rules-v2",
            ConfidenceThreshold = 0.45m,
            MixedThreshold = 0.2m,
        };

        options.EffectiveRuleVersion.Should().Be("rules-v2:c0.45:m0.2");
    }

    /// <summary>
    /// Đây là lý do gộp ngưỡng vào phiên bản quy tắc: ngưỡng nằm trong cấu hình, nên đổi
    /// <c>appsettings.json</c> là đổi kết quả phân loại mà không phải sửa một dòng mã nào. Nếu
    /// phiên bản quy tắc chỉ là một cái tên thì lần đổi ngưỡng đó lại rơi đúng vào cái bẫy im lặng.
    /// </summary>
    [Fact]
    public void ChangingEitherThreshold_ShouldChangeTheEffectiveRuleVersion()
    {
        var baseline = new OpenCommentSentimentOptions();

        var differentConfidence = new OpenCommentSentimentOptions { ConfidenceThreshold = 0.3m };
        var differentMixed = new OpenCommentSentimentOptions { MixedThreshold = 0.35m };

        differentConfidence.EffectiveRuleVersion.Should().NotBe(baseline.EffectiveRuleVersion);
        differentMixed.EffectiveRuleVersion.Should().NotBe(baseline.EffectiveRuleVersion);

        // Và đổi tên quy tắc cũng vậy — đó là trường hợp người sửa mã phải tự tăng.
        new OpenCommentSentimentOptions { RuleVersion = "rules-v3" }
            .EffectiveRuleVersion.Should().NotBe(baseline.EffectiveRuleVersion);
    }

    /// <summary>
    /// Chuỗi này đi thẳng vào cơ sở dữ liệu rồi được so bằng dấu bằng, nên dấu thập phân phải cố
    /// định. Nếu để nó theo văn hoá của máy thì một máy chủ đặt <c>vi-VN</c> sẽ ghi
    /// <c>rules-v2:c0,45:m0,2</c> còn máy khác ghi <c>rules-v2:c0.45:m0.2</c> — hai giá trị khác
    /// nhau cho cùng một quy tắc, và worker sẽ phân tích lại toàn bộ dữ liệu mỗi lần đổi máy.
    /// </summary>
    [Theory]
    [InlineData("vi-VN")]
    [InlineData("de-DE")]
    [InlineData("fr-FR")]
    public void EffectiveRuleVersion_ShouldNotDependOnMachineCulture(string cultureName)
    {
        var original = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo(cultureName);

            var options = new OpenCommentSentimentOptions
            {
                RuleVersion = "rules-v2",
                ConfidenceThreshold = 0.45m,
                MixedThreshold = 0.2m,
            };

            options.EffectiveRuleVersion.Should().Be(
                "rules-v2:c0.45:m0.2",
                "dấu thập phân phải luôn là dấu chấm, không phụ thuộc văn hoá của máy chủ");
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    /// <summary>
    /// Cột <c>RuleVersion</c> là <c>varchar(64)</c>. Giá trị mặc định phải nằm gọn trong đó, nếu
    /// không thì lỗi chỉ xuất hiện lúc worker ghi dòng đầu tiên trên máy chủ thật.
    /// </summary>
    [Fact]
    public void DefaultEffectiveRuleVersion_ShouldFitTheColumn()
    {
        var options = new OpenCommentSentimentOptions();

        options.EffectiveRuleVersion.Length.Should().BeLessThanOrEqualTo(ColumnMaxLength);
        options.RuleVersion.Length.Should().BeLessThanOrEqualTo(ColumnMaxLength);
    }
}
