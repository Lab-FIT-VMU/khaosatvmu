using Application.Surveys;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Infrastructure.Surveys;

/// <summary>
/// Kho ảnh của phiếu khảo sát (logo, ảnh bìa) trên đĩa.
///
/// Lưu ra tệp chứ không nhét vào cơ sở dữ liệu: ảnh chỉ để hiển thị, không tra cứu và
/// không tham gia phép tính nào, mà nhét vài trăm KB nhị phân vào mỗi dòng đợt là kéo
/// nặng mọi truy vấn đọc đợt.
///
/// Tên tệp do hệ thống sinh (32 ký tự hex + phần mở rộng), không dùng tên người dùng
/// đặt — tên gốc có thể chứa đường dẫn, dấu chấm hai chấm hay ký tự lạ.
/// </summary>
public sealed class SurveyFormAssetStore
{
    /// <summary>
    /// Trần dung lượng một ảnh. Ảnh đầu phiếu chụp bằng máy ảnh hay xuất từ phần mềm
    /// thiết kế dễ vượt vài MB, nên để rộng tay; vẫn phải có trần vì ảnh nằm trên đĩa
    /// máy chủ và sinh viên tải về mỗi lần mở phiếu.
    /// </summary>
    public const long MaximumBytes = 10 * 1024 * 1024;

    /// <summary>Chỉ nhận ảnh web thông dụng; không nhận SVG vì SVG chạy được script.</summary>
    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".webp"] = "image/webp",
    };

    private readonly string rootPath;

    public SurveyFormAssetStore(IHostEnvironment environment, IConfiguration configuration)
    {
        // Đường dẫn lấy từ cấu hình để máy chạy thật trỏ vào ổ đĩa gắn ngoài; thiếu thì
        // rơi về một thư mục cạnh mã nguồn, đủ dùng cho máy phát triển.
        var configured = configuration["SurveyFormAssets:Path"];
        rootPath = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "App_Data", "survey-form-assets")
            : configured;
    }

    /// <summary>Kiểu tệp có nhận được không; trả mã lỗi nếu không.</summary>
    public static string? Validate(string fileName, long length)
    {
        if (length <= 0 || length > MaximumBytes)
        {
            return SurveyErrorCodes.FormAssetTooLarge;
        }

        var extension = Path.GetExtension(fileName);
        return AllowedTypes.ContainsKey(extension)
            ? null
            : SurveyErrorCodes.FormAssetTypeNotAllowed;
    }

    /// <summary>Ghi ảnh xuống đĩa, trả về TÊN tệp đã sinh.</summary>
    public async Task<string> SaveAsync(
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(rootPath);

        var extension = Path.GetExtension(originalFileName).ToLowerInvariant();
        var storedName = $"{Guid.NewGuid():N}{extension}";

        await using var target = File.Create(Path.Combine(rootPath, storedName));
        await content.CopyToAsync(target, cancellationToken);

        return storedName;
    }

    /// <summary>
    /// Mở ảnh để trả về cho trình duyệt. Null nghĩa là tên tệp không hợp lệ hoặc không
    /// có tệp đó — người gọi trả 404, không phân biệt hai trường hợp.
    /// </summary>
    public (Stream Content, string ContentType)? Open(string storedName)
    {
        if (!IsStoredName(storedName)) return null;

        var path = Path.Combine(rootPath, storedName);
        if (!File.Exists(path)) return null;

        var contentType = AllowedTypes[Path.GetExtension(storedName)];
        return (File.OpenRead(path), contentType);
    }

    /// <summary>
    /// Đúng dạng tên do hệ thống sinh hay không. Đây là chốt chặn duy nhất giữa tham số
    /// trên URL và đường dẫn đĩa, nên khắt khe: chỉ 32 ký tự hex và một phần mở rộng
    /// trong danh sách. Không có dấu chấm hai chấm, không dấu gạch chéo, không "..".
    /// </summary>
    private static bool IsStoredName(string name)
    {
        var extension = Path.GetExtension(name);
        if (!AllowedTypes.ContainsKey(extension)) return false;

        var stem = Path.GetFileNameWithoutExtension(name);
        return stem.Length == 32 && stem.All(Uri.IsHexDigit);
    }
}
