namespace Application.Surveys;

/// <summary>
/// Chỉ tiêu tỷ lệ phản hồi của trang Tiến độ thu phiếu, đơn vị phần trăm. Lớp có tỷ lệ
/// phản hồi từ mức này trở lên được gắn "Đạt chỉ tiêu"; chỉ dùng ở trang đó.
/// </summary>
public sealed record ProgressTargetDto(decimal ResponseRate)
{
    public const decimal DefaultResponseRate = 50m;

    public bool IsValid => ResponseRate > 0m && ResponseRate <= 100m;
}

/// <summary>
/// Đọc và ghi chỉ tiêu của trang Tiến độ thu phiếu. Ai vào được trang đó đều đọc được;
/// chỉ quản trị hệ thống và quản trị khảo sát được đổi.
/// </summary>
public interface IProgressTargetProvider
{
    Task<ProgressTargetDto> GetAsync(CancellationToken cancellationToken = default);

    Task<SurveyOperationResult<ProgressTargetDto>> UpdateAsync(
        decimal responseRate,
        CancellationToken cancellationToken = default);
}
