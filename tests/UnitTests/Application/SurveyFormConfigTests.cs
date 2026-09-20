namespace UnitTests.ApplicationTests;

using Application.Surveys;
using FluentAssertions;
using Xunit;

/// <summary>
/// Cấu hình hình thức phiếu. Hai điều phải đúng tuyệt đối: cấu hình hỏng thì phiếu quay
/// về mẫu mặc định chứ không ném lỗi (sinh viên vẫn làm bài được), và phiên bản cấu
/// trúc đi kèm dữ liệu để bản sau còn đọc được đợt cũ.
/// </summary>
public class SurveyFormConfigTests
{
    [Fact]
    public void Ghi_roi_doc_lai_phai_ra_dung_cau_hinh()
    {
        var config = new SurveyFormConfigDto(
            PrimaryColor: "#0788b8",
            Title: "Phiếu khảo sát học phần",
            SubmitLabel: "Gửi phiếu");

        var parsed = SurveyFormConfig.Parse(SurveyFormConfig.Serialize(config));

        parsed.Should().NotBeNull();
        parsed!.PrimaryColor.Should().Be("#0788b8");
        parsed.Title.Should().Be("Phiếu khảo sát học phần");
        parsed.SubmitLabel.Should().Be("Gửi phiếu");
        parsed.Version.Should().Be(SurveyFormConfig.CurrentVersion);
    }

    [Fact]
    public void Khong_dat_gi_thi_khong_luu_gi()
    {
        SurveyFormConfig.Serialize(new SurveyFormConfigDto()).Should().BeNull();
        SurveyFormConfig.Serialize(null).Should().BeNull();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("{ khong phai json }")]
    public void Cau_hinh_hong_thi_quay_ve_mac_dinh(string? json)
    {
        SurveyFormConfig.Parse(json).Should().BeNull();
    }

    [Fact]
    public void Phien_ban_moi_hon_ma_nguon_thi_quay_ve_mac_dinh()
    {
        // Bản sau thêm trường mới và nâng version; bản đang chạy không đoán mò cấu trúc.
        var tuTuongLai = $$"""{"version":{{SurveyFormConfig.CurrentVersion + 1}},"primaryColor":"#0788b8"}""";

        SurveyFormConfig.Parse(tuTuongLai).Should().BeNull();
    }

    [Fact]
    public void Truong_la_cua_ban_cu_thi_bo_qua_chu_khong_vo()
    {
        var conThua = """{"version":1,"primaryColor":"#0788b8","truongDaBo":"x"}""";

        var parsed = SurveyFormConfig.Parse(conThua);

        parsed.Should().NotBeNull();
        parsed!.PrimaryColor.Should().Be("#0788b8");
    }

    [Theory]
    [InlineData("0788b8")]
    [InlineData("#0788b")]
    [InlineData("xanh")]
    [InlineData("#0788b8; background: red")]
    public void Ma_mau_sai_dang_thi_bi_chan(string color)
    {
        SurveyFormConfig.Validate(new SurveyFormConfigDto(PrimaryColor: color))
            .Should().Be(SurveyErrorCodes.FormConfigColorInvalid);
    }

    [Fact]
    public void Doan_chu_qua_dai_thi_bi_chan()
    {
        var qua_dai = new string('a', SurveyFormConfig.MaximumTextLength + 1);

        SurveyFormConfig.Validate(new SurveyFormConfigDto(Intro: qua_dai))
            .Should().Be(SurveyErrorCodes.FormConfigTextTooLong);
    }

    /// <summary>
    /// Mọi đoạn chữ đều phải nằm trong phép kiểm độ dài. Thêm trường mới mà quên khai
    /// vào danh sách chữ thì trường đó lọt lưới, nên kiểm từng trường một.
    /// </summary>
    [Theory]
    [MemberData(nameof(MoiDoanChu))]
    public void Doan_chu_nao_qua_dai_cung_bi_chan(SurveyFormConfigDto config)
    {
        SurveyFormConfig.Validate(config).Should().Be(SurveyErrorCodes.FormConfigTextTooLong);
    }

    public static TheoryData<SurveyFormConfigDto> MoiDoanChu()
    {
        var qua_dai = new string('a', SurveyFormConfig.MaximumTextLength + 1);

        return new TheoryData<SurveyFormConfigDto>
        {
            new SurveyFormConfigDto(Title: qua_dai),
            new SurveyFormConfigDto(Intro: qua_dai),
            new SurveyFormConfigDto(IntroHeading: qua_dai),
            new SurveyFormConfigDto(SubmitLabel: qua_dai),
            new SurveyFormConfigDto(ThankYouTitle: qua_dai),
            new SurveyFormConfigDto(ThankYouMessage: qua_dai),
            new SurveyFormConfigDto(NotOpenMessage: qua_dai),
            new SurveyFormConfigDto(ClosedMessage: qua_dai),
            new SurveyFormConfigDto(ClassFullMessage: qua_dai),
        };
    }

    /// <summary>
    /// Ba câu của màn chặn phải qua được vòng ghi rồi đọc lại: sinh viên gặp màn chặn
    /// mới là lúc cần đúng câu chữ quản trị đã đặt.
    /// </summary>
    [Fact]
    public void Chu_cua_man_chan_ghi_roi_doc_lai_van_nguyen()
    {
        var config = new SurveyFormConfigDto(
            NotOpenMessage: "Phiếu mở từ 01/10.",
            ClosedMessage: "Đợt khảo sát đã đóng.",
            ClassFullMessage: "Lớp đã đủ phiếu.");

        var parsed = SurveyFormConfig.Parse(SurveyFormConfig.Serialize(config));

        parsed.Should().NotBeNull();
        parsed!.NotOpenMessage.Should().Be("Phiếu mở từ 01/10.");
        parsed.ClosedMessage.Should().Be("Đợt khảo sát đã đóng.");
        parsed.ClassFullMessage.Should().Be("Lớp đã đủ phiếu.");
    }

    /// <summary>
    /// Chỉ đặt một câu chặn cũng là có cấu hình. Nếu <see cref="SurveyFormConfig.Serialize"/>
    /// coi đó là rỗng thì câu vừa đặt bị nuốt mất lúc lưu.
    /// </summary>
    [Fact]
    public void Chi_dat_mot_cau_chan_thi_van_phai_luu()
    {
        SurveyFormConfig.Serialize(new SurveyFormConfigDto(ClassFullMessage: "Lớp đã đủ phiếu."))
            .Should().NotBeNull();
    }

    /// <summary>
    /// Cấu hình bản 1 (đợt tạo trước khi có mẫu phiếu và định dạng tiêu đề) vẫn phải đọc
    /// được: những đợt đó đang chạy thật, không có cách nào nâng cấp dữ liệu cho chúng.
    /// </summary>
    [Fact]
    public void Cau_hinh_ban_cu_van_doc_duoc()
    {
        var banMot = """{"version":1,"primaryColor":"#0788b8","title":"Phiếu cũ"}""";

        var parsed = SurveyFormConfig.Parse(banMot);

        parsed.Should().NotBeNull();
        parsed!.PrimaryColor.Should().Be("#0788b8");
        parsed.Title.Should().Be("Phiếu cũ");
        // Trường của bản 2 chưa có thì để trống, phiếu dùng mặc định.
        parsed.TitleFont.Should().BeNull();
        parsed.HiddenFields.Should().BeNull();
    }

    [Theory]
    [InlineData("comic-sans")]
    [InlineData("Arial")]
    [InlineData("'Times New Roman', serif")]
    public void Phong_chu_ngoai_danh_sach_thi_bi_chan(string font)
    {
        SurveyFormConfig.Validate(new SurveyFormConfigDto(TitleFont: font))
            .Should().Be(SurveyErrorCodes.FormConfigFontInvalid);
    }

    [Theory]
    [InlineData(SurveyFormConfig.MinimumTitleFontSize - 1)]
    [InlineData(SurveyFormConfig.MaximumTitleFontSize + 1)]
    [InlineData(0)]
    public void Co_chu_ngoai_khoang_thi_bi_chan(int size)
    {
        SurveyFormConfig.Validate(new SurveyFormConfigDto(TitleFontSize: size))
            .Should().Be(SurveyErrorCodes.FormConfigFontInvalid);
    }

    [Fact]
    public void Canh_chu_la_thi_bi_chan()
    {
        SurveyFormConfig.Validate(new SurveyFormConfigDto(TitleAlign: "justify"))
            .Should().Be(SurveyErrorCodes.FormConfigFontInvalid);
    }

    /// <summary>
    /// Định dạng của dải lưu ý cũng đi thẳng vào CSS như định dạng tiêu đề, nên phải
    /// qua đúng bộ kiểm đó chứ không được lọt vì nằm trong một đối tượng con.
    /// </summary>
    [Fact]
    public void Dinh_dang_dai_luu_y_sai_thi_bi_chan()
    {
        SurveyFormConfig.Validate(
                new SurveyFormConfigDto(NoticeTextStyle: new SurveyTextStyleDto(Align: "justify")))
            .Should().Be(SurveyErrorCodes.FormConfigFontInvalid);

        SurveyFormConfig.Validate(
                new SurveyFormConfigDto(NoticeHeadingStyle: new SurveyTextStyleDto(FontSize: 99)))
            .Should().Be(SurveyErrorCodes.FormConfigFontInvalid);
    }

    [Fact]
    public void Dinh_dang_dai_luu_y_ghi_roi_doc_lai_van_nguyen()
    {
        var config = new SurveyFormConfigDto(
            NoticeHeadingStyle: new SurveyTextStyleDto(Bold: true, Align: "center"),
            NoticeTextStyle: new SurveyTextStyleDto(Italic: true, Underline: true, FontSize: 16));

        var json = SurveyFormConfig.Serialize(config);
        json.Should().NotBeNull();

        var parsed = SurveyFormConfig.Parse(json);

        parsed.Should().NotBeNull();
        parsed!.NoticeHeadingStyle!.Bold.Should().BeTrue();
        parsed.NoticeHeadingStyle.Align.Should().Be("center");
        parsed.NoticeTextStyle!.Italic.Should().BeTrue();
        parsed.NoticeTextStyle.Underline.Should().BeTrue();
        parsed.NoticeTextStyle.FontSize.Should().Be(16);
    }

    [Fact]
    public void Ma_thong_tin_khong_co_that_thi_bi_chan()
    {
        SurveyFormConfig.Validate(new SurveyFormConfigDto(HiddenFields: ["lecturer", "khongCoThat"]))
            .Should().Be(SurveyErrorCodes.FormConfigFieldInvalid);
    }

    /// <summary>
    /// Định dạng tiêu đề và danh sách thông tin bị ẩn phải sống sót qua vòng ghi rồi đọc,
    /// kể cả khi không đặt màu hay chữ nào — đó là trường hợp chỉ tắt bớt thông tin.
    /// </summary>
    [Fact]
    public void Dinh_dang_tieu_de_va_thong_tin_an_ghi_roi_doc_lai_van_nguyen()
    {
        var config = new SurveyFormConfigDto(
            TemplateId: "toi-gian",
            TitleFont: "georgia",
            TitleFontSize: 30,
            TitleBold: true,
            TitleItalic: false,
            TitleAlign: "center",
            HiddenFields: ["lecturer", "credits"]);

        var json = SurveyFormConfig.Serialize(config);
        json.Should().NotBeNull();

        var parsed = SurveyFormConfig.Parse(json);

        parsed.Should().NotBeNull();
        parsed!.Version.Should().Be(SurveyFormConfig.CurrentVersion);
        parsed.TemplateId.Should().Be("toi-gian");
        parsed.TitleFont.Should().Be("georgia");
        parsed.TitleFontSize.Should().Be(30);
        parsed.TitleBold.Should().BeTrue();
        parsed.TitleItalic.Should().BeFalse();
        parsed.TitleAlign.Should().Be("center");
        parsed.HiddenFields.Should().BeEquivalentTo(["lecturer", "credits"]);
    }

    [Fact]
    public void Cau_hinh_dung_thi_khong_co_loi()
    {
        var config = new SurveyFormConfigDto(
            PrimaryColor: "#0788b8",
            BackgroundColor: "#FFFFFF",
            Intro: "Ý kiến của bạn được ẩn danh.");

        SurveyFormConfig.Validate(config).Should().BeNull();
        SurveyFormConfig.Validate(null).Should().BeNull();
    }
}
