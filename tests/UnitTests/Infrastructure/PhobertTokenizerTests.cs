using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using FluentAssertions;
using SentimentWorker.Sentiment;
using Xunit;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// Đối chiếu bản port tokenizer C# với tokenizer Python dùng lúc huấn luyện.
///
/// Đây là bài test quan trọng nhất của tầng suy luận: sai một quy tắc BPE thì model vẫn chạy,
/// vẫn ra nhãn, nhưng nhãn đó được tính trên chuỗi token khác với lúc huấn luyện nên sai âm thầm.
/// Fixture được sinh bằng scripts/export_tokenizer_parity_fixture.py và chỉ chứa câu tổng hợp.
/// </summary>
public sealed class PhobertTokenizerTests
{
    private const int MaxLength = 256;

    [RequireBackendModelFact]
    public void Tokenize_MatchesPythonTokenizer_OnSyntheticCorpus()
    {
        var fixture = LoadFixture();
        var tokenizer = LoadTokenizer();

        var mismatches = new List<string>();

        foreach (var testCase in fixture)
        {
            // Ca bị cắt ở max_length thì danh sách token trong fixture đã cắt sẵn, không so được.
            if (testCase.InputIds.Count >= MaxLength)
            {
                continue;
            }

            var actual = tokenizer.Tokenize(testCase.Text);
            if (!actual.SequenceEqual(testCase.Tokens))
            {
                mismatches.Add(
                    $"{testCase.CaseId}: mong đợi [{string.Join(", ", testCase.Tokens)}] "
                    + $"nhưng nhận [{string.Join(", ", actual)}]");
            }
        }

        mismatches.Should().BeEmpty();
    }

    [RequireBackendModelFact]
    public void Encode_MatchesPythonTokenizer_OnSyntheticCorpus()
    {
        var fixture = LoadFixture();
        var tokenizer = LoadTokenizer();

        var mismatches = new List<string>();

        foreach (var testCase in fixture)
        {
            var actual = tokenizer.Encode(testCase.Text, MaxLength);
            if (!actual.SequenceEqual(testCase.InputIds))
            {
                mismatches.Add(
                    $"{testCase.CaseId}: mong đợi {testCase.InputIds.Count} id "
                    + $"nhưng nhận {actual.Count} id "
                    + $"(id đầu tiên khác nhau: {FirstDifference(testCase.InputIds, actual)})");
            }
        }

        mismatches.Should().BeEmpty();
    }

    [RequireBackendModelFact]
    public void Encode_WrapsSequenceWithBosAndEos()
    {
        var tokenizer = LoadTokenizer();

        var ids = tokenizer.Encode("Giảng viên nhiệt tình.", MaxLength);

        ids[0].Should().Be(PhobertTokenizer.BosTokenId);
        ids[^1].Should().Be(PhobertTokenizer.EosTokenId);
    }

    [RequireBackendModelFact]
    public void Encode_TruncatesToMaxLength()
    {
        var tokenizer = LoadTokenizer();
        var longText = string.Join(' ', Enumerable.Repeat(
            "Sinh viên ghi nhận giảng viên hướng dẫn tận tình và giải đáp thắc mắc đầy đủ.", 40));

        var ids = tokenizer.Encode(longText, MaxLength);

        ids.Should().HaveCount(MaxLength);
        ids[0].Should().Be(PhobertTokenizer.BosTokenId);
        ids[^1].Should().Be(PhobertTokenizer.EosTokenId);
    }

    [RequireBackendModelFact]
    public void Encode_BlankText_ProducesOnlySpecialTokens()
    {
        var tokenizer = LoadTokenizer();

        var ids = tokenizer.Encode("   ", MaxLength);

        ids.Should().Equal(PhobertTokenizer.BosTokenId, PhoBertEos());
    }

    [RequireTokenizerFixtureFact]
    public void ParityFixture_OnlyContainsSyntheticSentences()
    {
        var fixturePath = TestPaths.TokenizerParityFixture!;
        using var document = JsonDocument.Parse(File.ReadAllText(fixturePath));

        document.RootElement.GetProperty("is_synthetic").GetBoolean().Should().BeTrue();

        var cases = document.RootElement.GetProperty("cases");
        cases.GetArrayLength().Should().BeGreaterThan(0);
        foreach (var element in cases.EnumerateArray())
        {
            element.GetProperty("text").GetString().Should().NotBeNull();
            element.GetProperty("input_ids").GetArrayLength().Should().BeGreaterThan(0);
        }
    }

    private static int PhoBertEos() => PhobertTokenizer.EosTokenId;

    private static PhobertTokenizer LoadTokenizer() => PhobertTokenizer.Load(
        TestPaths.TokenizerVocabFile!,
        TestPaths.TokenizerMergesFile!,
        Path.Combine(TestPaths.ModelBundleDirectory!, "added_tokens.json"));

    private static IReadOnlyList<TokenizerCase> LoadFixture()
    {
        var json = File.ReadAllText(TestPaths.TokenizerParityFixture!);
        using var document = JsonDocument.Parse(json);

        var cases = new List<TokenizerCase>();
        foreach (var element in document.RootElement.GetProperty("cases").EnumerateArray())
        {
            cases.Add(new TokenizerCase(
                element.GetProperty("case_id").GetString() ?? string.Empty,
                element.GetProperty("text").GetString() ?? string.Empty,
                element.GetProperty("tokens").EnumerateArray()
                    .Select(x => x.GetString() ?? string.Empty).ToList(),
                element.GetProperty("input_ids").EnumerateArray()
                    .Select(x => x.GetInt32()).ToList()));
        }

        return cases;
    }

    private static string FirstDifference(IReadOnlyList<int> expected, IReadOnlyList<int> actual)
    {
        var limit = System.Math.Min(expected.Count, actual.Count);
        for (var i = 0; i < limit; i++)
        {
            if (expected[i] != actual[i])
            {
                return $"vị trí {i}, mong đợi {expected[i]}, nhận {actual[i]}";
            }
        }

        return "không có, chỉ khác độ dài";
    }

    private sealed record TokenizerCase(
        string CaseId,
        string Text,
        IReadOnlyList<string> Tokens,
        IReadOnlyList<int> InputIds);
}
