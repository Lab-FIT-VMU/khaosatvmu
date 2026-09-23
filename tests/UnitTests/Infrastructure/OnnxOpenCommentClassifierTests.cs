using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Application.Reports;
using Domain;
using FluentAssertions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SentimentWorker.Sentiment;
using Xunit;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// Chạy model ONNX thật qua bộ phân loại C# rồi đối chiếu với kết quả của engine Python.
///
/// Đây là chốt chặn cuối cùng của Giai đoạn 3. Đường suy luận gồm bốn chặng có thể lệch âm thầm:
/// tokenizer, thứ tự lớp logits, softmax, và quy tắc Mixed/Uncertain. Sai bất kỳ chặng nào thì
/// backend vẫn chạy, vẫn ra nhãn, chỉ có nhãn là sai. Bài test này so cả NHÃN lẫn ĐỘ TIN CẬY
/// trên 44 câu tổng hợp nên bắt được lệch ở từng chặng.
/// </summary>
public sealed class OnnxOpenCommentClassifierTests
{
    [RequireSentimentModelFact]
    public async Task ClassifyAsync_MatchesPythonEngine_OnSyntheticCorpus()
    {
        if (TestPaths.PredictionParityFixture is null || TestPaths.ModelBundleDirectory is null)
        {
            return;
        }

        var fixture = PredictionFixture.Load(TestPaths.PredictionParityFixture);

        using var classifier = BuildClassifier(fixture);

        var comments = fixture.Cases.Select(x => x.Text).ToList();
        var predictions = await classifier.ClassifyAsync(comments);

        predictions.Should().HaveCount(fixture.Cases.Count);

        var labelMismatches = new List<string>();
        var confidenceMismatches = new List<string>();

        for (var i = 0; i < fixture.Cases.Count; i++)
        {
            var expected = fixture.Cases[i];
            var actual = predictions[i];

            if (actual.Sentiment != expected.Label)
            {
                labelMismatches.Add(
                    $"{expected.CaseId}: engine Python nói {expected.Label} "
                    + $"nhưng backend C# nói {actual.Sentiment} (xác suất {actual.PositiveScore:F4}/"
                    + $"{actual.NegativeScore:F4}/{actual.NeutralScore:F4})");
            }

            if (Math.Abs(actual.Confidence - expected.Confidence) > ConfidenceTolerance)
            {
                confidenceMismatches.Add(
                    $"{expected.CaseId}: mong đợi {expected.Confidence:F6}, nhận {actual.Confidence:F6}");
            }
        }

        labelMismatches.Should().BeEmpty();
        confidenceMismatches.Should().BeEmpty();
    }

    [RequireSentimentModelFact]
    public async Task ClassifyAsync_PreservesInputOrder()
    {
        if (TestPaths.PredictionParityFixture is null || TestPaths.ModelBundleDirectory is null)
        {
            return;
        }

        var fixture = PredictionFixture.Load(TestPaths.PredictionParityFixture);
        using var classifier = BuildClassifier(fixture);

        // Chạy từng câu một rồi chạy cả lô: kết quả phải trùng nhau, nếu không thì việc gom lô
        // đang trộn kết quả giữa các câu.
        var batched = await classifier.ClassifyAsync(fixture.Cases.Select(x => x.Text).ToList());

        for (var i = 0; i < fixture.Cases.Count; i++)
        {
            var single = await classifier.ClassifyAsync([fixture.Cases[i].Text]);
            single[0].Sentiment.Should().Be(batched[i].Sentiment, $"ca {fixture.Cases[i].CaseId}");
            single[0].Confidence.Should().BeApproximately(
                batched[i].Confidence, ConfidenceTolerance, $"ca {fixture.Cases[i].CaseId}");
        }
    }

    [RequireBackendModelFact]
    public async Task ClassifyAsync_BlankComment_IsUncertainWithoutCallingTheModel()
    {
        if (TestPaths.ModelBundleDirectory is null)
        {
            return;
        }

        using var classifier = new OnnxOpenCommentClassifier(
            Options.Create(BuildOptions()),
            new StubHostEnvironment(TestPaths.Root!),
            NullLogger<OnnxOpenCommentClassifier>.Instance);

        var predictions = await classifier.ClassifyAsync(["   ", string.Empty]);

        predictions.Should().HaveCount(2);
        predictions.Should().OnlyContain(x => x.Sentiment == OpenCommentSentiments.Uncertain);
        predictions.Should().OnlyContain(x => x.Confidence == 0d);
    }

    private const double ConfidenceTolerance = 1e-4;

    private static OnnxOpenCommentClassifier BuildClassifier(PredictionFixture fixture)
    {
        var options = BuildOptions();
        options.ConfidenceThreshold = fixture.ConfidenceThreshold;
        options.MixedThreshold = fixture.MixedThreshold;
        options.MaxSequenceLength = fixture.MaxLength;

        return new OnnxOpenCommentClassifier(
            Options.Create(options),
            new StubHostEnvironment(TestPaths.Root!),
            NullLogger<OnnxOpenCommentClassifier>.Instance);
    }

    private static OpenCommentSentimentOptions BuildOptions() => new()
    {
        ModelDirectory = TestPaths.ModelBundleDirectory!,
        BatchSize = 16,
        MaxSequenceLength = 256,
    };

    private sealed class StubHostEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;

        public string ApplicationName { get; set; } = "UnitTests";

        public string ContentRootPath { get; set; } = contentRoot;

        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private sealed record PredictionFixture(
        decimal ConfidenceThreshold,
        decimal MixedThreshold,
        int MaxLength,
        IReadOnlyList<PredictionCase> Cases)
    {
        public static PredictionFixture Load(string path)
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            var root = document.RootElement;

            var cases = new List<PredictionCase>();
            foreach (var element in root.GetProperty("cases").EnumerateArray())
            {
                cases.Add(new PredictionCase(
                    element.GetProperty("case_id").GetString() ?? string.Empty,
                    element.GetProperty("text").GetString() ?? string.Empty,
                    element.GetProperty("label").GetString() ?? string.Empty,
                    element.GetProperty("confidence").GetDouble()));
            }

            return new PredictionFixture(
                root.GetProperty("confidence_threshold").GetDecimal(),
                root.GetProperty("mixed_threshold").GetDecimal(),
                root.GetProperty("max_length").GetInt32(),
                cases);
        }
    }

    private sealed record PredictionCase(string CaseId, string Text, string Label, double Confidence);
}
