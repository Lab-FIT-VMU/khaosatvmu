using Application.Surveys;
using FluentAssertions;
using Xunit;

namespace UnitTests.ApplicationTests;

public class ResponseFilterTests
{
    private static FilterQuestion Scored(int id) =>
        new(id, null);

    private static FilterQuestion Trap(int id, int required) =>
        new(id, required);

    /// <summary>Đủ lâu để không dính TOO_FAST với số câu cho trước.</summary>
    private static double SlowEnough(int questionCount) =>
        ResponseFilter.MinimumSeconds(questionCount);

    [Fact]
    public void MinimumSeconds_LaKhongPhayBayLamGiayMoiCau()
    {
        ResponseFilter.SecondsPerQuestion.Should().Be(0.75);
        ResponseFilter.MinimumSeconds(30).Should().Be(22.5);
        // Số câu không chia hết cho 4 thì ngưỡng có phần lẻ, không được làm tròn xuống.
        ResponseFilter.MinimumSeconds(29).Should().Be(21.75);
    }

    [Fact]
    public void PhieuLamNghiemTuc_ThiHopLe()
    {
        var questions = new[] { Scored(1), Scored(2), Scored(3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "4"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3));

        result.IsValid.Should().BeTrue();
        result.RejectionReasons.Should().BeNull();
    }

    [Fact]
    public void LamNhanhHonNguong_ThiDinhTooFast()
    {
        var questions = new[] { Scored(1), Scored(2), Scored(3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "4"),
        };

        // 3 câu, ngưỡng 2.25 giây.
        var result = ResponseFilter.Evaluate(questions, answers, 2);

        result.IsValid.Should().BeFalse();
        result.RejectionReasons.Should().Be(RejectionReasonCodes.TooFast);
    }

    [Fact]
    public void DungBangNguong_ThiVanHopLe()
    {
        var questions = new[] { Scored(1), Scored(2) };
        var answers = new[] { new FilterAnswer(1, "5"), new FilterAnswer(2, "2") };

        // 2 câu, ngưỡng đúng 1.5 giây.
        var result = ResponseFilter.Evaluate(questions, answers, 1.5);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void CauBay_VanTinhVaoNguongThoiGian()
    {
        // 2 câu chấm điểm + 1 câu bẫy = 3 câu, ngưỡng 2.25 giây.
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "4"),
            new FilterAnswer(3, "3"),
        };

        ResponseFilter.Evaluate(questions, answers, 2).RejectionReasons
            .Should().Be(RejectionReasonCodes.TooFast);
        ResponseFilter.Evaluate(questions, answers, 2.25).IsValid
            .Should().BeTrue();
    }

    [Fact]
    public void ChonCungMotMucChoMoiCau_ThiDinhSingleAnswer()
    {
        var questions = new[] { Scored(1), Scored(2), Scored(3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "5"),
            new FilterAnswer(3, "5"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3));

        result.IsValid.Should().BeFalse();
        result.RejectionReasons.Should().Be(RejectionReasonCodes.SingleAnswer);
    }

    [Fact]
    public void ChiMotCauChamDiem_ThiKhongXetSingleAnswer()
    {
        var questions = new[] { Scored(1), Trap(2, 3) };
        var answers = new[] { new FilterAnswer(1, "5"), new FilterAnswer(2, "3") };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(2));

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void ChonMotMuc_NhungLamDungCauBay_VanDuocTinh()
    {
        // Làm đúng câu bẫy là bằng chứng có đọc câu hỏi, nên không định SINGLE_ANSWER.
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "5"),
            new FilterAnswer(3, "3"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3));

        result.IsValid.Should().BeTrue();
        result.RejectionReasons.Should().BeNull();
    }

    [Fact]
    public void ChonMotMuc_KeCaCauBay_MaCauBayDungMucDo_VanDuocTinh()
    {
        // Toàn mức 3, câu bẫy cũng bắt mức 3: đúng câu bẫy nên được tính.
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "3"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "3"),
        };

        ResponseFilter.Evaluate(questions, answers, SlowEnough(3)).IsValid
            .Should().BeTrue();
    }

    [Fact]
    public void ChonMotMuc_VaSaiCauBay_ThiDinhCaHaiLoi()
    {
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "5"),
            new FilterAnswer(3, "5"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3));

        result.IsValid.Should().BeFalse();
        result.RejectionReasons.Should().Be("SINGLE_ANSWER,ATTENTION_CHECK_FAILED");
    }

    [Fact]
    public void SaiCauBay_ThiDinhAttentionCheckFailed()
    {
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "2"),
            new FilterAnswer(3, "4"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3));

        result.IsValid.Should().BeFalse();
        result.RejectionReasons.Should().Be(RejectionReasonCodes.AttentionCheckFailed);
    }

    [Fact]
    public void SaiMotTrongNhieuCauBay_LaDuDeLoc()
    {
        var questions = new[] { Scored(1), Trap(2, 3), Trap(3, 5) };
        var answers = new[]
        {
            new FilterAnswer(1, "4"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "1"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, SlowEnough(3))
;
        result.RejectionReasons.Should().Be(RejectionReasonCodes.AttentionCheckFailed);
    }

    [Fact]
    public void LamDungHetCauBay_ThiKhongDinhLoiNay()
    {
        var questions = new[] { Scored(1), Trap(2, 3), Trap(3, 5) };
        var answers = new[]
        {
            new FilterAnswer(1, "4"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "5"),
        };

        ResponseFilter.Evaluate(questions, answers, SlowEnough(3)).IsValid
            .Should().BeTrue();
    }

    [Fact]
    public void DinhCaBaLoi_ThiLuuDuCaBaMa()
    {
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "5"),
            new FilterAnswer(3, "1"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, 0);

        result.IsValid.Should().BeFalse();
        result.RejectionReasons.Should().Be("TOO_FAST,SINGLE_ANSWER,ATTENTION_CHECK_FAILED");
        result.RejectionReasons!.Length.Should().BeLessThan(200);
    }

    [Fact]
    public void KhongDocDuocVe_ThiCoiNhuKhongGiay_VaDinhTooFast()
    {
        var questions = new[] { Scored(1), Scored(2), Scored(3) };
        var answers = new[]
        {
            new FilterAnswer(1, "5"),
            new FilterAnswer(2, "3"),
            new FilterAnswer(3, "4"),
        };

        var result = ResponseFilter.Evaluate(questions, answers, 0);

        result.RejectionReasons.Should().Be(RejectionReasonCodes.TooFast);
    }

    [Fact]
    public void ThieuCauTraLoiChoCauBay_ThiKhongTinhLaSai()
    {
        // Thiếu câu trả lời đã bị chặn từ tầng trên; ở đây chỉ cần bảo đảm bộ lọc
        // không tự dựng thêm lỗi cho câu không có dữ liệu.
        var questions = new[] { Scored(1), Scored(2), Trap(3, 3) };
        var answers = new[] { new FilterAnswer(1, "5"), new FilterAnswer(2, "2") };

        ResponseFilter.Evaluate(questions, answers, SlowEnough(3)).IsValid
            .Should().BeTrue();
    }
}
