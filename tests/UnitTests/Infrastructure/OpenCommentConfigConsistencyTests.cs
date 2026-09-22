using System;
using System.IO;
using System.Text.Json;
using Application.Reports;
using FluentAssertions;
using Xunit;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// Cấu hình phân loại cảm xúc tồn tại ở ba chỗ và chúng **phải khớp nhau**:
/// <list type="number">
/// <item>giá trị mặc định trong <see cref="OpenCommentSentimentOptions"/> (mã nguồn);</item>
/// <item><c>appsettings.json</c> của worker — nơi ghi nhãn;</item>
/// <item><c>appsettings.json</c> của API — nơi đánh giá một kết quả là "còn nợ" hay "đã xong";</item>
/// </list>
/// cộng thêm <c>model-card.json</c> trong bundle, là bản mô tả mà người khác đọc để biết hệ thống đang
/// chạy cấu hình gì.
///
/// <para>
/// Vì sao cần test này: ngưỡng và phiên bản quy tắc nằm trong <c>EffectiveRuleVersion</c>, mà
/// <c>EffectiveRuleVersion</c> là điều kiện để worker coi một dòng kết quả là còn dùng được. Chỉ cần
/// worker và API lệch nhau một ngưỡng, hệ thống sẽ ghi nhãn theo một cấu hình và xếp hàng chạy lại
/// theo một cấu hình khác — không có lỗi nào hiện ra. Tệ hơn nữa, <c>model-card.json</c> từng ghi
/// <c>mixed_clause_min_confidence = 0,35</c> trong khi sản phẩm chạy <c>0,20</c>, vì model card lấy
/// ngưỡng từ một artifact cân chỉnh cũ thay vì từ cấu hình đang chạy.
/// </para>
/// </summary>
public class OpenCommentConfigConsistencyTests
{
    [Fact]
    public void WorkerAndApiSettings_ShouldDeclareTheSameSentimentConfig()
    {
        var worker = ReadSentimentConfig(TestPaths.WorkerSettingsFile, "worker", requireMaxSequenceLength: true);
        var api = ReadSentimentConfig(TestPaths.ApiSettingsFile, "API", requireMaxSequenceLength: false);

        api.ModelVersion.Should().Be(worker.ModelVersion);
        api.RuleVersion.Should().Be(worker.RuleVersion);
        api.ConfidenceThreshold.Should().Be(worker.ConfidenceThreshold);
        api.MixedThreshold.Should().Be(worker.MixedThreshold);
    }

    [Fact]
    public void WorkerSettings_ShouldMatchCodeDefaults()
    {
        var worker = ReadSentimentConfig(TestPaths.WorkerSettingsFile, "worker", requireMaxSequenceLength: true);
        var defaults = new OpenCommentSentimentOptions();

        worker.ModelVersion.Should().Be(defaults.ModelVersion);
        worker.RuleVersion.Should().Be(defaults.RuleVersion);
        worker.ConfidenceThreshold.Should().Be(defaults.ConfidenceThreshold);
        worker.MixedThreshold.Should().Be(defaults.MixedThreshold);
        worker.MaxSequenceLength.Should().Be(defaults.MaxSequenceLength);

        // Tài liệu, fixture đối chiếu và các test khác đều viết theo giá trị mặc định. Đổi ngưỡng chỉ
        // trong appsettings sẽ làm những chỗ đó nói sai về hệ thống đang chạy, nên phải đổi ở cả hai nơi.
    }

    [RequireBackendModelFact]
    public void ModelCard_ShouldMirrorTheRunningConfig()
    {
        var cardPath = TestPaths.ModelCardFile;
        cardPath.Should().NotBeNull("bundle phải kèm model-card.json");

        var worker = ReadSentimentConfig(TestPaths.WorkerSettingsFile, "worker", requireMaxSequenceLength: true);
        using var document = JsonDocument.Parse(File.ReadAllText(cardPath!));
        var card = document.RootElement;

        var options = new OpenCommentSentimentOptions
        {
            ModelVersion = worker.ModelVersion,
            RuleVersion = worker.RuleVersion,
            ConfidenceThreshold = worker.ConfidenceThreshold,
            MixedThreshold = worker.MixedThreshold,
            MaxSequenceLength = worker.MaxSequenceLength!.Value,
        };

        card.GetProperty("model_version").GetString().Should().Be(options.ModelVersion);
        card.GetProperty("rule_version").GetString().Should().Be(options.RuleVersion);

        // So bằng chuỗi phiên bản hiệu lực chứ không so từng phần, để bắt luôn cả lỗi định dạng số:
        // "c0.45" và "c0.4500" là hai chuỗi khác nhau, và cột RuleVersion trong DB lưu chuỗi.
        card.GetProperty("effective_rule_version").GetString()
            .Should().Be(options.EffectiveRuleVersion);

        card.GetProperty("thresholds").GetProperty("confidence_threshold").GetDecimal()
            .Should().Be(options.ConfidenceThreshold);
        card.GetProperty("thresholds").GetProperty("mixed_clause_min_confidence").GetDecimal()
            .Should().Be(options.MixedThreshold);
        card.GetProperty("max_sequence_length").GetInt32().Should().Be(options.MaxSequenceLength);

        card.GetProperty("runtime_config").GetProperty("effective_rule_version").GetString()
            .Should().Be(options.EffectiveRuleVersion);
    }

    private sealed record SentimentConfig(
        string ModelVersion,
        string RuleVersion,
        decimal ConfidenceThreshold,
        decimal MixedThreshold,
        int? MaxSequenceLength);

    /// <summary>
    /// Đọc mục <c>OpenCommentSentiment</c> trong appsettings.json. Bốn khóa dùng chung là bắt buộc;
    /// <c>MaxSequenceLength</c> chỉ bắt buộc với worker, vì API không nạp model nên không cần.
    /// </summary>
    private static SentimentConfig ReadSentimentConfig(
        string? path,
        string label,
        bool requireMaxSequenceLength)
    {
        path.Should().NotBeNull($"không tìm thấy appsettings.json của {label}");

        using var document = JsonDocument.Parse(File.ReadAllText(path!));
        document.RootElement.TryGetProperty("OpenCommentSentiment", out var section)
            .Should().BeTrue($"appsettings của {label} phải có mục OpenCommentSentiment");

        return new SentimentConfig(
            ReadString(section, "ModelVersion", label),
            ReadString(section, "RuleVersion", label),
            ReadDecimal(section, "ConfidenceThreshold", label),
            ReadDecimal(section, "MixedThreshold", label),
            ReadOptionalInt(section, "MaxSequenceLength", label, requireMaxSequenceLength));
    }

    /// <summary>
    /// Đọc một khóa dạng chuỗi. Bốn khóa dùng chung phải được khai báo tường minh ở cả hai tệp: model
    /// card lấy phiên bản và ngưỡng từ đó, nên không được để giá trị mặc định trong mã nguồn gánh thay.
    /// </summary>
    private static string ReadString(JsonElement section, string key, string label)
    {
        section.TryGetProperty(key, out var element)
            .Should().BeTrue($"appsettings của {label} phải khai báo {key} tường minh");
        element.ValueKind.Should().Be(JsonValueKind.String);
        return element.GetString() ?? string.Empty;
    }

    private static decimal ReadDecimal(JsonElement section, string key, string label)
    {
        section.TryGetProperty(key, out var element)
            .Should().BeTrue($"appsettings của {label} phải khai báo {key} tường minh");
        element.ValueKind.Should().Be(JsonValueKind.Number);
        return element.GetDecimal();
    }

    private static int? ReadOptionalInt(
        JsonElement section,
        string key,
        string label,
        bool required)
    {
        if (!section.TryGetProperty(key, out var element))
        {
            required.Should().BeFalse($"appsettings của {label} phải khai báo {key}");
            return null;
        }

        element.ValueKind.Should().Be(JsonValueKind.Number);
        return element.GetInt32();
    }
}
