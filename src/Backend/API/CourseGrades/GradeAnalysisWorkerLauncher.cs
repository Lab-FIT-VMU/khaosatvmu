using System.Diagnostics;
using System.Text;
using Domain;
using Infrastructure.CourseGrades;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace API.CourseGrades;

/// <summary>Cấu hình mục "CourseGrades:AnalysisWorker".</summary>
public sealed class GradeAnalysisWorkerOptions
{
    public const string SectionName = "CourseGrades:AnalysisWorker";

    /// <summary>
    /// Bật thì API tự chạy worker Python ngay khi có lượt tính đang chờ. Tắt khi API chạy trong
    /// container (ảnh API không có Python): lúc đó dùng dịch vụ grade-analysis-worker --watch.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// Lệnh chạy worker. Để trống: chạy <c>python -m grade_worker</c> trong <see cref="WorkingDirectory"/>
    /// (ưu tiên .venv của thư mục đó). Có thể là <c>docker</c> với <see cref="Arguments"/> là
    /// <c>compose --profile grade-analysis run --rm grade-analysis-worker</c> khi máy không chạy được
    /// Python trực tiếp.
    /// </summary>
    public string? Command { get; set; }

    public List<string> Arguments { get; set; } = [];

    /// <summary>Thư mục làm việc, tương đối với thư mục gốc của API. Mặc định là src/GradeAnalysisWorker.</summary>
    public string WorkingDirectory { get; set; } = "../../GradeAnalysisWorker";

    /// <summary>Quét dự phòng (giây), phòng khi lượt tính được xếp mà không qua API này.</summary>
    public int PollSeconds { get; set; } = 30;

    /// <summary>
    /// Lệnh chuẩn bị chạy trước worker, cùng <see cref="Command"/> (ví dụ <c>compose … build
    /// grade-analysis-worker</c> để image luôn theo mã mới). Lỗi hay quá
    /// <see cref="PrepareTimeoutSeconds"/> thì dừng nó và vẫn chạy worker bằng image đang có,
    /// để một lần build treo không chặn việc tính.
    /// </summary>
    public List<string> PrepareArguments { get; set; } = [];

    public int PrepareTimeoutSeconds { get; set; } = 180;

    /// <summary>Worker chạy quá số phút này thì bị dừng và lượt tính bị đánh lỗi, không treo mãi.</summary>
    public int TimeoutMinutes { get; set; } = 30;

    /// <summary>
    /// Lệnh dọn sau khi phải dừng worker vì quá giờ, cùng <see cref="Command"/> (ví dụ
    /// <c>rm -f khaosatvmu_grade_analysis_worker</c>): tắt tiến trình docker không tắt container,
    /// mà container còn sót giữ tên thì lần chạy sau không tạo được.
    /// </summary>
    public List<string> CleanupArguments { get; set; } = [];
}

/// <summary>
/// Chạy worker phân tích điểm (python -m grade_worker) ngay sau khi nạp điểm, gỡ kỳ, sửa ngưỡng
/// hay bấm "Tính lại", để không phải chạy lệnh riêng. Mỗi lúc chỉ một tiến trình; worker tự
/// chạy hết các lượt đang chờ rồi thoát. Khóa và chuỗi kết nối truyền qua biến môi trường của
/// tiến trình con, không qua dòng lệnh.
/// </summary>
public sealed class GradeAnalysisWorkerLauncher(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IOptions<GradeAnalysisWorkerOptions> options,
    IOptions<CourseGradeEncryptionOptions> encryptionOptions,
    IHostEnvironment environment,
    ILogger<GradeAnalysisWorkerLauncher> logger) : BackgroundService
{
    private readonly SemaphoreSlim wakeSignal = new(0, 1);

    /// <summary>Báo có lượt tính mới; gọi nhiều lần cũng chỉ đánh thức một lần.</summary>
    public void Wake()
    {
        try { wakeSignal.Release(); }
        catch (SemaphoreFullException) { }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            return;
        }

        var workingDirectory = Path.GetFullPath(Path.Combine(environment.ContentRootPath, settings.WorkingDirectory));
        var usePython = string.IsNullOrWhiteSpace(settings.Command);
        if (!Directory.Exists(usePython ? Path.Combine(workingDirectory, "grade_worker") : workingDirectory))
        {
            logger.LogWarning("Không thấy worker phân tích điểm ở {Directory}; điểm nạp vào sẽ không được tự tính.", workingDirectory);
            return;
        }
        var command = usePython ? ResolvePython(workingDirectory) : settings.Command!;
        IReadOnlyList<string> arguments = usePython ? ["-m", "grade_worker"] : settings.Arguments;
        var pollInterval = TimeSpan.FromSeconds(Math.Max(5, settings.PollSeconds));
        var prepareTimeout = TimeSpan.FromSeconds(Math.Max(10, settings.PrepareTimeoutSeconds));
        var workerTimeout = TimeSpan.FromMinutes(Math.Max(1, settings.TimeoutMinutes));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var queuedRunId = await QueuedRunIdAsync(stoppingToken);
                if (queuedRunId is not null)
                {
                    if (settings.PrepareArguments.Count > 0)
                    {
                        var prepareExit = await RunProcessAsync(
                            "chuẩn bị worker", command, settings.PrepareArguments, workingDirectory, prepareTimeout, stoppingToken);
                        if (prepareExit != 0)
                        {
                            logger.LogWarning(
                                "Bước chuẩn bị worker không xong ({Result}); vẫn tính bằng bản worker đang có.",
                                prepareExit is null ? $"quá {prepareTimeout.TotalSeconds:0} giây" : $"mã thoát {prepareExit}");
                        }
                    }

                    var exitCode = await RunProcessAsync(
                        "worker phân tích điểm", command, arguments, workingDirectory, workerTimeout, stoppingToken);
                    if (exitCode is null)
                    {
                        if (settings.CleanupArguments.Count > 0)
                        {
                            await RunProcessAsync(
                                "dọn worker", command, settings.CleanupArguments, workingDirectory, prepareTimeout, stoppingToken);
                        }
                        await MarkUnfinishedRunsFailedAsync(
                            queuedRunId.Value,
                            $"Worker phân tích điểm chạy quá {workerTimeout.TotalMinutes:0} phút nên bị dừng. Xem log của API rồi bấm Tính lại.",
                            stoppingToken);
                    }
                    else
                    {
                        // Worker chạy xong mà lượt vẫn "chờ" nghĩa là worker không chạy nổi (thiếu thư viện,
                        // sai cấu hình): đánh lỗi để trang báo "Tính lỗi" thay vì treo, và không chạy lại
                        // liên tục. Lượt bị thay bằng lượt mới hơn thì đã bị xóa, không đụng tới.
                        await MarkStillQueuedRunFailedAsync(
                            queuedRunId.Value,
                            $"Không chạy được worker phân tích điểm (mã thoát {exitCode}). Xem log của API rồi bấm Tính lại.",
                            stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Lỗi khi chạy worker phân tích điểm.");
            }

            try
            {
                await wakeSignal.WaitAsync(pollInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task<long?> QueuedRunIdAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.GradeAnalysisRuns.AsNoTracking()
            .Where(x => x.Status == GradeAnalysisRunStatus.Queued)
            .OrderBy(x => x.RunId)
            .Select(x => (long?)x.RunId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task MarkStillQueuedRunFailedAsync(long runId, string message, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        await db.GradeAnalysisRuns
            .Where(x => x.RunId == runId && x.Status == GradeAnalysisRunStatus.Queued)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, GradeAnalysisRunStatus.Failed)
                .SetProperty(x => x.FinishedAtUtc, now)
                .SetProperty(x => x.ErrorMessage, message), cancellationToken);
    }

    /// <summary>
    /// Sau khi phải dừng worker vì quá giờ: đánh lỗi lượt đang chạy dở và lượt đã đánh thức
    /// worker nếu nó vẫn chờ, để trang không hiện "đang tính" mãi.
    /// </summary>
    private async Task MarkUnfinishedRunsFailedAsync(long queuedRunId, string message, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        await db.GradeAnalysisRuns
            .Where(x => x.Status == GradeAnalysisRunStatus.Running
                || (x.RunId == queuedRunId && x.Status == GradeAnalysisRunStatus.Queued))
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Status, GradeAnalysisRunStatus.Failed)
                .SetProperty(x => x.FinishedAtUtc, now)
                .SetProperty(x => x.ErrorMessage, message), cancellationToken);
    }

    /// <summary>Chạy một lệnh và chờ nó thoát; trả mã thoát, hoặc null khi quá <paramref name="timeout"/> (đã dừng cả cây tiến trình).</summary>
    private async Task<int?> RunProcessAsync(
        string label, string command, IReadOnlyList<string> arguments, string workingDirectory,
        TimeSpan timeout, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo(command)
        {
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var argument in arguments)
        {
            startInfo.ArgumentList.Add(argument);
        }
        startInfo.Environment["PYTHONIOENCODING"] = "utf-8";
        startInfo.Environment["PYTHONUNBUFFERED"] = "1";
        startInfo.Environment["ConnectionStrings__DefaultConnection"] = configuration.GetConnectionString("DefaultConnection") ?? string.Empty;
        var encryption = encryptionOptions.Value;
        startInfo.Environment["CourseGrades__ActiveKeyVersion"] = encryption.ActiveKeyVersion.ToString();
        foreach (var (version, key) in encryption.EncryptionKeys)
        {
            startInfo.Environment[$"CourseGrades__EncryptionKeys__{version}"] = key;
        }
        if (!string.IsNullOrWhiteSpace(encryption.EncryptionKeyFile))
        {
            startInfo.Environment["CourseGrades__EncryptionKeyFile"] = encryption.EncryptionKeyFile;
        }
        // docker compose đọc khóa từ biến này (xem dịch vụ grade-analysis-worker); biến của tiến
        // trình được ưu tiên hơn .env.
        if (encryption.EncryptionKeys.TryGetValue(encryption.ActiveKeyVersion.ToString(), out var activeKey))
        {
            startInfo.Environment["COURSE_GRADE_ENCRYPTION_KEY"] = activeKey;
        }

        using var process = new Process { StartInfo = startInfo };
        process.OutputDataReceived += (_, e) => { if (e.Data is { Length: > 0 }) logger.LogInformation("grade_worker: {Line}", e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is { Length: > 0 }) logger.LogWarning("grade_worker: {Line}", e.Data); };

        logger.LogInformation("Chạy {Label}: {Command} {Arguments}", label, command, string.Join(' ', arguments));
        var started = Stopwatch.StartNew();
        try
        {
            process.Start();
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            logger.LogError(exception, "Không khởi chạy được {Command}.", command);
            return -1;
        }
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        try
        {
            await process.WaitForExitAsync(timeoutSource.Token);
        }
        catch (OperationCanceledException)
        {
            // API dừng giữa lượt, hoặc lệnh treo quá giờ: dừng cả cây tiến trình. Lượt "đang chạy"
            // do API dừng sẽ được worker lần sau đánh lỗi.
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            if (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            logger.LogError("{Label} chạy quá {Seconds:0} giây nên bị dừng.", label, timeout.TotalSeconds);
            return null;
        }

        logger.LogInformation("{Label} thoát với mã {ExitCode} sau {Seconds:0} giây.", label, process.ExitCode, started.Elapsed.TotalSeconds);
        return process.ExitCode;
    }

    private static string ResolvePython(string workerDirectory)
    {
        foreach (var candidate in new[] { Path.Combine(".venv", "Scripts", "python.exe"), Path.Combine(".venv", "bin", "python") })
        {
            var path = Path.Combine(workerDirectory, candidate);
            if (File.Exists(path))
            {
                return path;
            }
        }
        return OperatingSystem.IsWindows() ? "python" : "python3";
    }
}

/// <summary>Đánh thức <see cref="GradeAnalysisWorkerLauncher"/> sau các yêu cầu có thể xếp lượt tính.</summary>
public sealed class WakeGradeAnalysisWorkerFilter(GradeAnalysisWorkerLauncher launcher) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var result = await next(context);
        launcher.Wake();
        return result;
    }
}
