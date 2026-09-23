using Microsoft.Extensions.Hosting;

namespace Infrastructure.Configuration;

/// <summary>
/// Nạp tệp <c>.env</c> gần nhất vào biến môi trường, chỉ khi đang chạy ở môi trường Development.
///
/// Dùng chung cho cả tiến trình API và tiến trình worker để hai bên đọc đúng cùng một chuỗi kết
/// nối và cùng một đường dẫn model khi chạy ở máy dev. Ở môi trường thật thì biến môi trường do
/// nền tảng triển khai cấp, hàm này không làm gì.
///
/// Biến đã có sẵn trong môi trường LUÔN thắng tệp .env: người vận hành ghi đè bằng biến môi
/// trường phải có hiệu lực, nếu không thì rất khó lần ra vì sao cấu hình không ăn.
/// </summary>
public static class LocalEnvironmentFile
{
    public static void LoadNearest()
    {
        var environmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
        if (!string.Equals(environmentName, Environments.Development, StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        for (var directory = new DirectoryInfo(Directory.GetCurrentDirectory());
             directory is not null;
             directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, ".env");
            if (!File.Exists(path))
            {
                continue;
            }

            foreach (var rawLine in File.ReadLines(path))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith('#'))
                {
                    continue;
                }

                var separator = line.IndexOf('=');
                if (separator <= 0)
                {
                    continue;
                }

                var key = line[..separator].Trim();
                if (Environment.GetEnvironmentVariable(key) is not null)
                {
                    continue;
                }

                var value = line[(separator + 1)..].Trim();
                if (value.Length >= 2
                    && ((value[0] == '"' && value[^1] == '"')
                        || (value[0] == '\'' && value[^1] == '\'')))
                {
                    value = value[1..^1];
                }

                Environment.SetEnvironmentVariable(key, value);
            }

            return;
        }
    }
}
