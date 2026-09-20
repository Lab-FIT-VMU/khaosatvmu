using System.Text.Json;
using System.Text.RegularExpressions;

namespace Application.Surveys;

/// <summary>
/// Hình thức phiếu khảo sát của một đợt: mẫu đã chọn, màu, ảnh, định dạng tiêu đề,
/// những thông tin cho hiện trên phiếu và các đoạn chữ. Nội dung câu hỏi KHÔNG nằm ở
/// đây — câu hỏi thuộc bộ câu hỏi (`SurveyTemplates`).
///
/// Mọi trường đều để null được, và null nghĩa là "dùng mặc định của hệ thống". Nhờ vậy
/// đợt tạo trước khi có tính năng này (cả cột cấu hình cũng null) hiển thị y như cũ,
/// không phải chạy cập nhật dữ liệu nào.
///
/// Sửa được tới trước giờ mở đợt; đợt đã bắt đầu thu phiếu thì khoá — xem
/// <see cref="Domain.SemesterSurvey.FormConfigJson"/>.
/// </summary>
/// <param name="Version">
/// Phiên bản cấu trúc. Đổi hình dạng cấu hình ở bản sau vẫn phải đọc được đợt cũ, nên
/// số này đi kèm dữ liệu chứ không suy từ mã nguồn.
/// </param>
/// <summary>
/// Định dạng một đoạn chữ trên phiếu. Trường nào null là giữ nguyên kiểu mặc định của
/// phiếu, không ghi đè gì.
/// </summary>
public sealed record SurveyTextStyleDto(
    bool? Bold = null,
    bool? Italic = null,
    bool? Underline = null,
    /// <summary>Cỡ chữ, đơn vị px.</summary>
    int? FontSize = null,
    /// <summary>"left", "center" hoặc "right".</summary>
    string? Align = null);

public sealed record SurveyFormConfigDto(
    int Version = SurveyFormConfig.CurrentVersion,

    /// <summary>
    /// Mã mẫu phiếu quản trị chọn trong thư viện mẫu. Chỉ để giao diện biết đang sửa
    /// trên mẫu nào; phiếu vẽ ra hoàn toàn bằng các trường bên dưới, không tra mẫu.
    /// </summary>
    string? TemplateId = null,

    // ----- Màu. Mã hex 6 ký tự, ví dụ "#0788b8".
    string? PrimaryColor = null,
    string? BackgroundColor = null,
    string? SubmitButtonColor = null,

    // ----- Ảnh. Đường dẫn do endpoint tải ảnh trả về.
    string? LogoUrl = null,
    string? CoverImageUrl = null,
    /// <summary>
    /// Vùng ảnh bìa được thấy trong khung, dạng "50% 40%" (ngang, dọc) — đổ thẳng vào
    /// `object-position`. Khung ảnh cố định nên ảnh to hơn khung sẽ bị cắt; giá trị này
    /// cho quản trị chọn cắt phần nào. Null là canh giữa.
    /// </summary>
    string? CoverPosition = null,

    // ----- Định dạng chữ của tiêu đề phiếu.
    /// <summary>Một trong <see cref="SurveyFormConfig.AllowedFonts"/>.</summary>
    string? TitleFont = null,
    /// <summary>Cỡ chữ tiêu đề, đơn vị px.</summary>
    int? TitleFontSize = null,
    bool? TitleBold = null,
    bool? TitleItalic = null,
    bool? TitleUnderline = null,
    /// <summary>"left" hoặc "center".</summary>
    string? TitleAlign = null,

    /// <summary>
    /// Những thông tin KHÔNG cho hiện trên phiếu, theo mã trong
    /// <see cref="SurveyFormConfig.AllowedFields"/>. Ghi phần bị ẩn chứ không ghi phần
    /// được hiện: đợt cũ không có trường này thì hiện đủ, và thêm thông tin mới ở bản
    /// sau cũng mặc định hiện chứ không biến mất khỏi phiếu cũ.
    /// </summary>
    IReadOnlyList<string>? HiddenFields = null,

    // ----- Chữ trên phiếu.
    string? Title = null,
    /// <summary>Dòng đầu của dải lưu ý; bỏ trống là "Lưu ý".</summary>
    string? IntroHeading = null,
    /// <summary>Nội dung dải lưu ý.</summary>
    string? Intro = null,
    /// <summary>Định dạng riêng cho dòng đầu và cho nội dung của dải lưu ý.</summary>
    SurveyTextStyleDto? NoticeHeadingStyle = null,
    SurveyTextStyleDto? NoticeTextStyle = null,
    string? SubmitLabel = null,
    string? ThankYouTitle = null,
    string? ThankYouMessage = null,

    // ----- Chữ của các màn chặn. Mỗi câu ứng với đúng một mã lỗi mà phiếu công khai
    // trả về: NotOpenMessage ↔ LINK_NOT_STARTED, ClosedMessage ↔ LINK_EXPIRED,
    // ClassFullMessage ↔ CLASS_FULL. Hệ thống không theo dõi từng sinh viên đã nộp hay
    // chưa (phiếu ẩn danh), nên không có câu "bạn đã nộp rồi".
    string? NotOpenMessage = null,
    string? ClosedMessage = null,
    string? ClassFullMessage = null);

/// <summary>Đọc, ghi và kiểm tra <see cref="SurveyFormConfigDto"/>.</summary>
public static class SurveyFormConfig
{
    /// <summary>
    /// Phiên bản cấu trúc hiện tại. Bản 2 thêm mẫu phiếu, định dạng tiêu đề và danh
    /// sách thông tin bị ẩn; cấu hình bản 1 vẫn đọc được vì trường mới chỉ là null.
    /// </summary>
    public const int CurrentVersion = 2;

    /// <summary>Trần độ dài cho mỗi đoạn chữ; dài hơn là lỗi nhập liệu chứ không phải nội dung.</summary>
    public const int MaximumTextLength = 1000;

    /// <summary>Trần độ dài đường dẫn ảnh.</summary>
    public const int MaximumUrlLength = 500;

    /// <summary>Trần độ dài mã mẫu phiếu.</summary>
    public const int MaximumTemplateIdLength = 64;

    /// <summary>Cỡ chữ tiêu đề cho phép, đơn vị px.</summary>
    public const int MinimumTitleFontSize = 14;
    public const int MaximumTitleFontSize = 48;

    /// <summary>
    /// Phông cho phép. Chỉ nhận phông có sẵn trên máy người dùng: phiếu sinh viên mở
    /// bằng điện thoại giữa giờ học, tải phông ngoài về là thêm một thứ có thể hỏng.
    /// </summary>
    public static readonly IReadOnlySet<string> AllowedFonts = new HashSet<string>(StringComparer.Ordinal)
    {
        "default",
        "arial",
        "times",
        "georgia",
        "verdana",
        "tahoma",
        "courier",
    };

    /// <summary>Canh chữ tiêu đề cho phép.</summary>
    public static readonly IReadOnlySet<string> AllowedAligns = new HashSet<string>(StringComparer.Ordinal)
    {
        "left",
        "center",
        "right",
    };

    /// <summary>
    /// Những thông tin quản trị được phép tắt trên phiếu. Tên đợt (tiêu đề) không nằm
    /// ở đây: tắt hết thì sinh viên không biết đang làm phiếu gì.
    /// </summary>
    public static readonly IReadOnlySet<string> AllowedFields = new HashSet<string>(StringComparer.Ordinal)
    {
        "templateName",
        "course",
        "section",
        "lecturer",
        "semester",
        "schedule",
        "questionCount",
        "credits",
        "faculty",
        "department",

        // Trong bài làm.
        "quizNotice",
        "questionReview",
        "commentBox",
    };

    private static readonly Regex HexColor = new("^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);

    /// <summary>"50% 40%": hai phần trăm, đủ cho `object-position` mà không cho chèn CSS lạ.</summary>
    private static readonly Regex ObjectPosition = new(
        "^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$",
        RegexOptions.Compiled);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>
    /// Đọc cấu hình đã lưu. Null, rỗng, JSON hỏng hay phiên bản lạ đều trả về null —
    /// phiếu quay về mẫu mặc định thay vì ném lỗi làm sinh viên không làm bài được.
    /// </summary>
    public static SurveyFormConfigDto? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;

        try
        {
            var parsed = JsonSerializer.Deserialize<SurveyFormConfigDto>(json, JsonOptions);
            if (parsed is null) return null;

            // Phiên bản mới hơn mã nguồn đang chạy: không đoán mò cấu trúc, dùng mặc định.
            return parsed.Version > CurrentVersion ? null : parsed;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>Ghi ra chuỗi để lưu vào cột jsonb. Cấu hình rỗng thì trả null, khỏi lưu.</summary>
    public static string? Serialize(SurveyFormConfigDto? config)
    {
        if (config is null || IsEmpty(config)) return null;
        return JsonSerializer.Serialize(config with { Version = CurrentVersion }, JsonOptions);
    }

    /// <summary>
    /// Hợp lệ hay không. Trả null là hợp lệ, ngược lại trả mã lỗi để endpoint đổi thành
    /// thông báo cho người dùng.
    /// </summary>
    public static string? Validate(SurveyFormConfigDto? config)
    {
        if (config is null) return null;

        foreach (var color in new[] { config.PrimaryColor, config.BackgroundColor, config.SubmitButtonColor })
        {
            if (!string.IsNullOrWhiteSpace(color) && !HexColor.IsMatch(color))
            {
                return SurveyErrorCodes.FormConfigColorInvalid;
            }
        }

        foreach (var url in new[] { config.LogoUrl, config.CoverImageUrl })
        {
            if (url is { Length: > MaximumUrlLength })
            {
                return SurveyErrorCodes.FormConfigTextTooLong;
            }
        }

        if (config.TemplateId is { Length: > MaximumTemplateIdLength })
        {
            return SurveyErrorCodes.FormConfigTextTooLong;
        }

        foreach (var text in Texts(config))
        {
            if (text is { Length: > MaximumTextLength })
            {
                return SurveyErrorCodes.FormConfigTextTooLong;
            }
        }

        // Phông, cỡ và canh chữ: chỉ nhận giá trị trong danh sách, vì ba thứ này đi
        // thẳng vào thuộc tính CSS của phiếu.
        if (!string.IsNullOrWhiteSpace(config.TitleFont) && !AllowedFonts.Contains(config.TitleFont))
        {
            return SurveyErrorCodes.FormConfigFontInvalid;
        }

        if (!string.IsNullOrWhiteSpace(config.TitleAlign) && !AllowedAligns.Contains(config.TitleAlign))
        {
            return SurveyErrorCodes.FormConfigFontInvalid;
        }

        if (config.TitleFontSize is { } size
            && (size < MinimumTitleFontSize || size > MaximumTitleFontSize))
        {
            return SurveyErrorCodes.FormConfigFontInvalid;
        }

        if (!string.IsNullOrWhiteSpace(config.CoverPosition)
            && !ObjectPosition.IsMatch(config.CoverPosition))
        {
            return SurveyErrorCodes.FormConfigFontInvalid;
        }

        foreach (var style in new[] { config.NoticeHeadingStyle, config.NoticeTextStyle })
        {
            if (style is null) continue;

            if (!string.IsNullOrWhiteSpace(style.Align) && !AllowedAligns.Contains(style.Align))
            {
                return SurveyErrorCodes.FormConfigFontInvalid;
            }

            if (style.FontSize is { } styleSize
                && (styleSize < MinimumTitleFontSize || styleSize > MaximumTitleFontSize))
            {
                return SurveyErrorCodes.FormConfigFontInvalid;
            }
        }

        if (config.HiddenFields is { } hidden && hidden.Any(field => !AllowedFields.Contains(field)))
        {
            return SurveyErrorCodes.FormConfigFieldInvalid;
        }

        return null;
    }

    /// <summary>Không đặt gì cả thì coi như không có cấu hình, khỏi lưu một khối JSON rỗng.</summary>
    private static bool IsEmpty(SurveyFormConfigDto config) =>
        string.IsNullOrWhiteSpace(config.TemplateId)
        && string.IsNullOrWhiteSpace(config.PrimaryColor)
        && string.IsNullOrWhiteSpace(config.BackgroundColor)
        && string.IsNullOrWhiteSpace(config.SubmitButtonColor)
        && string.IsNullOrWhiteSpace(config.LogoUrl)
        && string.IsNullOrWhiteSpace(config.CoverImageUrl)
        && string.IsNullOrWhiteSpace(config.CoverPosition)
        && string.IsNullOrWhiteSpace(config.TitleFont)
        && string.IsNullOrWhiteSpace(config.TitleAlign)
        && config.TitleFontSize is null
        && config.TitleBold is null
        && config.TitleItalic is null
        && config.TitleUnderline is null
        && (config.HiddenFields is null || config.HiddenFields.Count == 0)
        && config.NoticeHeadingStyle is null
        && config.NoticeTextStyle is null
        && Texts(config).All(string.IsNullOrWhiteSpace);

    private static IEnumerable<string?> Texts(SurveyFormConfigDto config)
    {
        yield return config.Title;
        yield return config.IntroHeading;
        yield return config.Intro;
        yield return config.SubmitLabel;
        yield return config.ThankYouTitle;
        yield return config.ThankYouMessage;
        yield return config.NotOpenMessage;
        yield return config.ClosedMessage;
        yield return config.ClassFullMessage;
    }
}
