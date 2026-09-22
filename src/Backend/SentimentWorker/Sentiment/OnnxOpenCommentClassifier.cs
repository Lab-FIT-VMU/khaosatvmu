using Application.Reports;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace SentimentWorker.Sentiment;

/// <summary>
/// Chạy model PhoBERT đã xuất ONNX ngay trong tiến trình backend.
///
/// Vì sao phải tự viết thay vì gọi một dịch vụ suy luận bên ngoài: nội dung ý kiến của sinh viên
/// không được rời khỏi hạ tầng nhà trường. Model nằm trên đĩa, ONNX Runtime chạy CPU, không có
/// lời gọi mạng nào trong đường suy luận.
///
/// Model chỉ được nạp MỘT LẦN cho cả tiến trình (đăng ký singleton). Nạp lại cho từng request sẽ
/// đọc lại hơn 500 MB và làm sập thời gian phản hồi.
///
/// Không ghi nội dung ý kiến vào log, kể cả khi lỗi — chỉ ghi loại lỗi và số lượng bản ghi.
/// </summary>
public sealed class OnnxOpenCommentClassifier : IOpenCommentClassifier, IDisposable
{
    /// <summary>Chờ bao lâu trước khi thử nạp lại model sau một lần thất bại.</summary>
    private static readonly TimeSpan LoadRetryCooldown = TimeSpan.FromSeconds(30);

    private const string InputIdsName = "input_ids";
    private const string AttentionMaskName = "attention_mask";

    private readonly OpenCommentSentimentOptions options;
    private readonly ILogger<OnnxOpenCommentClassifier> logger;
    private readonly string modelDirectory;
    private readonly SemaphoreSlim loadGate = new(1, 1);

    private LoadedModel? loaded;
    private string? loadFailure;
    private DateTime loadFailedAtUtc;
    private bool disposed;

    public OnnxOpenCommentClassifier(
        IOptions<OpenCommentSentimentOptions> options,
        IHostEnvironment environment,
        ILogger<OnnxOpenCommentClassifier> logger)
    {
        this.options = options.Value;
        this.logger = logger;

        var configured = this.options.ModelDirectory;
        modelDirectory = Path.IsPathRooted(configured)
            ? configured
            : Path.GetFullPath(Path.Combine(environment.ContentRootPath, configured));
    }

    /// <inheritdoc />
    public string ModelVersion => options.ModelVersion;

    /// <inheritdoc />
    public bool IsReady => loaded is not null;

    /// <inheritdoc />
    public string? UnavailableReason => loaded is not null ? null : loadFailure;

    /// <inheritdoc />
    public DateTime LastUsedAtUtc { get; private set; } = DateTime.UtcNow;

    /// <inheritdoc />
    /// <remarks>
    /// Được gọi từ vòng quét của worker, sau khi lô đã chạy xong — không có suy luận nào đang chạy
    /// song song, nên giải phóng session ở đây là an toàn. Giải phóng xong thì bộ nhớ không do GC
    /// quản lý của ONNX Runtime được trả lại, lần cần dùng sau nạp lại tệp ONNX.
    /// </remarks>
    public void Release()
    {
        loadGate.Wait();
        try
        {
            if (loaded is null)
            {
                return;
            }

            loaded.Dispose();
            loaded = null;
            logger.LogInformation(
                "Đã trả model {ModelVersion} cho hệ điều hành sau {IdleMinutes:F0} phút không có việc",
                options.ModelVersion,
                (DateTime.UtcNow - LastUsedAtUtc).TotalMinutes);
        }
        finally
        {
            loadGate.Release();
        }
    }

    /// <summary>Thư mục model đã phân giải thành đường dẫn tuyệt đối, dùng cho chẩn đoán.</summary>
    public string ResolvedModelDirectory => modelDirectory;

    /// <inheritdoc />
    public async Task<IReadOnlyList<OpenCommentPrediction>> ClassifyAsync(
        IReadOnlyList<string> comments,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(comments);
        if (comments.Count == 0)
        {
            return [];
        }

        var model = await EnsureLoadedAsync(cancellationToken).ConfigureAwait(false);
        LastUsedAtUtc = DateTime.UtcNow;

        var texts = new string[comments.Count];
        var baseIndices = new List<int>(comments.Count);
        for (var i = 0; i < comments.Count; i++)
        {
            texts[i] = (comments[i] ?? string.Empty).Trim();
            if (texts[i].Length > 0)
            {
                baseIndices.Add(i);
            }
        }

        // Bước 1: chia mệnh đề và quyết định ý kiến nào cần suy luận theo mệnh đề.
        var clausesByComment = new List<string>[comments.Count];
        var clauseTexts = new List<string>();
        var clauseOwner = new List<(int CommentIndex, int ClauseIndex)>();

        foreach (var index in baseIndices)
        {
            var clauses = OpenCommentSentimentRules.SplitClauses(texts[index]);
            clausesByComment[index] = [.. clauses];

            var needsClausePass = clauses.Count >= 2
                || OpenCommentSentimentRules.ContainsContrastMarker(texts[index]);
            if (!needsClausePass)
            {
                continue;
            }

            for (var c = 0; c < clauses.Count; c++)
            {
                clauseOwner.Add((index, c));
                clauseTexts.Add(clauses[c]);
            }
        }

        // Bước 2: suy luận trên toàn bộ ý kiến.
        var baseTexts = baseIndices.Select(i => texts[i]).ToList();
        var baseProbabilities = RunBatches(model, baseTexts, cancellationToken);

        // Bước 3: suy luận trên từng mệnh đề cần tách.
        var clauseProbabilities = clauseTexts.Count == 0
            ? []
            : RunBatches(model, clauseTexts, cancellationToken);

        var perCommentClauses = new List<IReadOnlyList<double>>[comments.Count];
        for (var i = 0; i < clauseOwner.Count; i++)
        {
            var (commentIndex, clauseIndex) = clauseOwner[i];
            perCommentClauses[commentIndex] ??= [];
            var list = perCommentClauses[commentIndex].ToList();
            while (list.Count <= clauseIndex)
            {
                list.Add(clauseProbabilities[i]);
            }

            list[clauseIndex] = clauseProbabilities[i];
            perCommentClauses[commentIndex] = list;
        }

        // Bước 4: ghép xác suất với nhãn cuối cùng.
        var predictions = new OpenCommentPrediction[comments.Count];
        var probabilityByComment = new Dictionary<int, double[]>(baseIndices.Count);
        for (var i = 0; i < baseIndices.Count; i++)
        {
            probabilityByComment[baseIndices[i]] = baseProbabilities[i];
        }

        for (var i = 0; i < comments.Count; i++)
        {
            if (!probabilityByComment.TryGetValue(i, out var baseProbability))
            {
                // Ý kiến rỗng: không tốn một lượt suy luận nào, và cũng không được đoán bừa.
                var empty = OpenCommentSentimentRules.EmptyResult();
                predictions[i] = new OpenCommentPrediction(empty.Sentiment, empty.Confidence, 0d, 1d, 0d);
                continue;
            }

            // Khi ý kiến chỉ có một mệnh đề và không có dấu hiệu tương phản, bản Python dùng
            // chính xác suất toàn câu cho mệnh đề đó. Giữ đúng như vậy để hai bên ra cùng nhãn.
            var clauseList = perCommentClauses[i] is { Count: > 0 } split
                ? split
                : [baseProbability];

            var resolved = OpenCommentSentimentRules.Resolve(
                baseProbability,
                clauseList,
                (double)options.ConfidenceThreshold,
                (double)options.MixedThreshold);

            predictions[i] = new OpenCommentPrediction(
                resolved.Sentiment,
                resolved.Confidence,
                baseProbability[2],
                baseProbability[0],
                baseProbability[1]);
        }

        LastUsedAtUtc = DateTime.UtcNow;
        return predictions;
    }

    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        loaded?.Dispose();
        loadGate.Dispose();
    }

    private async Task<LoadedModel> EnsureLoadedAsync(CancellationToken cancellationToken)
    {
        var current = loaded;
        if (current is not null)
        {
            return current;
        }

        await loadGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (loaded is not null)
            {
                return loaded;
            }

            if (loadFailure is not null && DateTime.UtcNow - loadFailedAtUtc < LoadRetryCooldown)
            {
                throw new InvalidOperationException(loadFailure);
            }

            try
            {
                loaded = LoadModel();
                loadFailure = null;
                logger.LogInformation(
                    "Đã nạp model phân loại cảm xúc {ModelVersion} từ {ModelDirectory}",
                    options.ModelVersion,
                    modelDirectory);
                return loaded;
            }
            catch (Exception exception)
            {
                loadFailure = $"Không nạp được model phân loại cảm xúc: {exception.Message}";
                loadFailedAtUtc = DateTime.UtcNow;
                logger.LogError(
                    exception,
                    "Không nạp được model phân loại cảm xúc từ {ModelDirectory}",
                    modelDirectory);
                throw new InvalidOperationException(loadFailure, exception);
            }
        }
        finally
        {
            loadGate.Release();
        }
    }

    private LoadedModel LoadModel()
    {
        var onnxPath = Path.Combine(modelDirectory, options.ModelFileName);
        if (!File.Exists(onnxPath))
        {
            throw new FileNotFoundException(
                $"Thiếu tệp model ONNX tại {onnxPath}. Chạy scripts/prepare_backend_model.py để tạo bundle.",
                onnxPath);
        }

        var tokenizer = PhobertTokenizer.Load(
            Path.Combine(modelDirectory, options.VocabularyFileName),
            Path.Combine(modelDirectory, options.MergeCodesFileName),
            Path.Combine(modelDirectory, options.AddedTokensFileName));

        var threads = Math.Max(1, options.InferenceThreads);

        var sessionOptions = new SessionOptions
        {
            GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL,
            // Chạy tuần tự và đúng một luồng cho mỗi nhóm toán tử. Máy chủ chỉ có 1–2 vCPU:
            // để ONNX Runtime tự lấy hết nhân thì API và cơ sở dữ liệu bị bỏ đói suốt thời gian
            // worker quét. Chậm hơn vài phút là cái giá rẻ, đổi lấy việc API vẫn trả lời bình thường.
            ExecutionMode = ExecutionMode.ORT_SEQUENTIAL,
            IntraOpNumThreads = threads,
            InterOpNumThreads = 1,
        };

        var session = new InferenceSession(onnxPath, sessionOptions);
        try
        {
            var inputNames = session.InputMetadata.Keys.ToHashSet(StringComparer.Ordinal);
            if (!inputNames.Contains(InputIdsName) || !inputNames.Contains(AttentionMaskName))
            {
                throw new InvalidDataException(
                    $"Model ONNX phải nhận '{InputIdsName}' và '{AttentionMaskName}' nhưng chỉ có: "
                    + string.Join(", ", inputNames));
            }

            var outputName = session.OutputMetadata.Keys.FirstOrDefault()
                ?? throw new InvalidDataException("Model ONNX không có đầu ra nào.");
            if (session.OutputMetadata.Count != 1)
            {
                throw new InvalidDataException(
                    $"Model ONNX phải có đúng một đầu ra logits nhưng có {session.OutputMetadata.Count}.");
            }

            return new LoadedModel(session, tokenizer, outputName);
        }
        catch
        {
            session.Dispose();
            throw;
        }
    }

    private List<double[]> RunBatches(
        LoadedModel model,
        IReadOnlyList<string> texts,
        CancellationToken cancellationToken)
    {
        var results = new List<double[]>(texts.Count);
        var batchSize = Math.Max(1, options.BatchSize);
        var maxSequenceLength = Math.Max(2, options.MaxSequenceLength);

        for (var start = 0; start < texts.Count; start += batchSize)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var count = Math.Min(batchSize, texts.Count - start);
            var encoded = new List<IReadOnlyList<int>>(count);
            var widest = 1;

            for (var i = 0; i < count; i++)
            {
                var ids = model.Tokenizer.Encode(texts[start + i], maxSequenceLength);
                encoded.Add(ids);
                widest = Math.Max(widest, ids.Count);
            }

            var inputIds = new long[count * widest];
            var attentionMask = new long[count * widest];
            for (var i = 0; i < count; i++)
            {
                var ids = encoded[i];
                for (var position = 0; position < widest; position++)
                {
                    var offset = (i * widest) + position;
                    if (position < ids.Count)
                    {
                        inputIds[offset] = ids[position];
                        attentionMask[offset] = 1;
                    }
                    else
                    {
                        inputIds[offset] = PhobertTokenizer.PadTokenId;
                        attentionMask[offset] = 0;
                    }
                }
            }

            var inputs = new List<NamedOnnxValue>
            {
                NamedOnnxValue.CreateFromTensor(
                    InputIdsName, new DenseTensor<long>(inputIds, [count, widest])),
                NamedOnnxValue.CreateFromTensor(
                    AttentionMaskName, new DenseTensor<long>(attentionMask, [count, widest])),
            };

            IReadOnlyCollection<string> outputNames = [model.OutputName];
            using var outputs = model.Session.Run(inputs, outputNames);
            var logits = outputs[0].AsTensor<float>();

            for (var i = 0; i < count; i++)
            {
                var row = new double[3];
                for (var c = 0; c < 3; c++)
                {
                    row[c] = logits[i, c];
                }

                results.Add(Softmax(row));
            }
        }

        return results;
    }

    private static double[] Softmax(double[] logits)
    {
        var max = logits[0];
        for (var i = 1; i < logits.Length; i++)
        {
            if (logits[i] > max)
            {
                max = logits[i];
            }
        }

        var sum = 0d;
        var output = new double[logits.Length];
        for (var i = 0; i < logits.Length; i++)
        {
            output[i] = Math.Exp(logits[i] - max);
            sum += output[i];
        }

        for (var i = 0; i < output.Length; i++)
        {
            output[i] /= sum;
        }

        return output;
    }

    private sealed record LoadedModel(
        InferenceSession Session,
        PhobertTokenizer Tokenizer,
        string OutputName) : IDisposable
    {
        public void Dispose() => Session.Dispose();
    }
}
