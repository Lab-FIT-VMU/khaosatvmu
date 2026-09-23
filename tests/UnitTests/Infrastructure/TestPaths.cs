using System;
using System.IO;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// Định vị các tệp nằm ngoài thư mục build (fixture, bundle model ONNX).
/// </summary>
/// <remarks>
/// Máy nào cũng có mã nguồn, nhưng bundle model ONNX nặng hơn 500 MB nên không nằm trong Git.
/// Bài test nào cần model phải tự bỏ qua khi thiếu bundle thay vì báo lỗi đỏ, nếu không CI sẽ
/// đỏ vì lý do không liên quan tới mã nguồn.
/// </remarks>
internal static class TestPaths
{
    private static readonly Lazy<string?> RepositoryRoot = new(FindRepositoryRoot);

    public static string? Root => RepositoryRoot.Value;

    public static string? ModelBundleDirectory
    {
        get
        {
            if (Root is null)
            {
                return null;
            }

            var directory = Path.Combine(Root, "models", "open-comment-sentiment");
            return Directory.Exists(directory) ? directory : null;
        }
    }

    public static string? TokenizerVocabFile => ResolveModelFile("vocab.txt");

    public static string? TokenizerMergesFile => ResolveModelFile("bpe.codes");

    /// <summary>appsettings.json của worker — nơi khai báo ngưỡng và phiên bản quy tắc đang chạy.</summary>
    public static string? WorkerSettingsFile => ResolveBackendFile("SentimentWorker", "appsettings.json");

    /// <summary>appsettings.json của API — phải khai báo cùng ngưỡng và cùng phiên bản quy tắc.</summary>
    public static string? ApiSettingsFile => ResolveBackendFile("API", "appsettings.json");

    /// <summary>model-card.json trong bundle — phải phản chiếu cấu hình đang chạy.</summary>
    public static string? ModelCardFile => ResolveModelFile("model-card.json");

    public static string? TokenizerParityFixture
    {
        get
        {
            if (Root is null)
            {
                return null;
            }

            var path = Path.Combine(
                Root, "ml", "open_comment_sentiment", "data", "fixtures", "tokenizer-parity.json");
            return File.Exists(path) ? path : null;
        }
    }

    public static string? PredictionParityFixture
    {
        get
        {
            if (Root is null)
            {
                return null;
            }

            var path = Path.Combine(
                Root, "ml", "open_comment_sentiment", "data", "fixtures",
                "phobert-prediction-parity.json");
            return File.Exists(path) ? path : null;
        }
    }

    private static string? ResolveModelFile(string fileName)
    {
        var directory = ModelBundleDirectory;
        if (directory is null)
        {
            return null;
        }

        var path = Path.Combine(directory, fileName);
        return File.Exists(path) ? path : null;
    }

    private static string? ResolveBackendFile(string project, string fileName)
    {
        if (Root is null)
        {
            return null;
        }

        var path = Path.Combine(Root, "src", "Backend", project, fileName);
        return File.Exists(path) ? path : null;
    }

    private static string? FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            // Dấu hiệu duy nhất đúng cho mọi máy: thư mục gốc có cả src/ lẫn ml/.
            // Không dò .git vì bản sao mã nguồn không kèm Git vẫn phải chạy được test.
            if (Directory.Exists(Path.Combine(directory.FullName, "src"))
                && Directory.Exists(Path.Combine(directory.FullName, "ml")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        return null;
    }
}
