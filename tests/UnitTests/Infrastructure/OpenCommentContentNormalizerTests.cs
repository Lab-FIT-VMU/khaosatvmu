using System.IO;
using Application.Reports;
using FluentAssertions;
using SentimentWorker.Sentiment;
using Xunit;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// Chuẩn hoá nội dung để băm. Chỉ dùng phát hiện ý kiến bị sửa, KHÔNG dùng làm đầu vào model:
/// model phải nhận nguyên văn bản để chuỗi token trùng với lúc huấn luyện.
/// </summary>
public class OpenCommentContentNormalizerTests
{
    [Fact]
    public void ComputeHash_IsStableAcrossWhitespaceAndUnicodeForm()
    {
        var spaced = "  Thầy   giảng dễ hiểu.\n";
        var tight = "Thầy giảng dễ hiểu.";

        OpenCommentContentNormalizer.ComputeHash(spaced)
            .Should().Be(OpenCommentContentNormalizer.ComputeHash(tight));
    }

    [Fact]
    public void ComputeHash_ChangesWhenContentChanges()
    {
        OpenCommentContentNormalizer.ComputeHash("Bài giảng hay")
            .Should().NotBe(OpenCommentContentNormalizer.ComputeHash("Bài giảng dở"));
    }

    [Fact]
    public void ComputeHash_IsLowerCaseHexSha256()
    {
        var hash = OpenCommentContentNormalizer.ComputeHash("kiểm tra");

        hash.Should().HaveLength(64);
        hash.Should().MatchRegex("^[0-9a-f]{64}$");
    }

    [Fact]
    public void ComputeHash_EmptyInput_DoesNotThrow()
    {
        OpenCommentContentNormalizer.ComputeHash(string.Empty).Should().HaveLength(64);
    }

    [RequireBackendModelFact]
    public void ModelCardInBundle_DeclaresSameVersionAsDefaultOptions()
    {
        var modelCardPath = Path.Combine(TestPaths.ModelBundleDirectory!, "model-card.json");
        File.Exists(modelCardPath).Should().BeTrue(
            "bundle phải kèm model-card.json để biết phiên bản và ngưỡng đang chạy");

        using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllText(modelCardPath));
        var version = document.RootElement.GetProperty("model_version").GetString();

        version.Should().Be(new OpenCommentSentimentOptions().ModelVersion,
            "lệch phiên bản giữa model-card và cấu hình mặc định sẽ khiến worker ghi sai ModelVersion");
    }
}
