using Application.Auth;
using Application.Surveys;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Surveys;

/// <summary>
/// Chỉ tiêu của trang Tiến độ thu phiếu, lưu ở cột riêng trên dòng cấu hình duy nhất của
/// bảng "SurveyScoringSettings". Chỉ đọc / ghi đúng cột đó: hai ngưỡng tính điểm cùng
/// dòng không bị đụng tới và không có dòng nhật ký cấu hình nào được ghi.
/// </summary>
public sealed class EfProgressTargetProvider(
    AppDbContext db,
    IUserScopeResolver userScope) : IProgressTargetProvider
{
    /// <summary>Cùng khoá cố định với EfScoringThresholdProvider.</summary>
    private const int SettingId = 1;

    public async Task<ProgressTargetDto> GetAsync(CancellationToken cancellationToken = default)
    {
        var rate = await db.SurveyScoringSettings.AsNoTracking()
            .Where(x => x.SurveyScoringSettingId == SettingId)
            .Select(x => (decimal?)x.ProgressTargetResponseRate)
            .FirstOrDefaultAsync(cancellationToken);

        return new ProgressTargetDto(rate ?? ProgressTargetDto.DefaultResponseRate);
    }

    public async Task<SurveyOperationResult<ProgressTargetDto>> UpdateAsync(
        decimal responseRate,
        CancellationToken cancellationToken = default)
    {
        // Chỉ quản trị hệ thống và quản trị khảo sát; Ban Giám hiệu chỉ đọc.
        var scope = await userScope.ResolveAsync(cancellationToken);
        if (!scope.ManagesEverything)
        {
            return new SurveyOperationResult<ProgressTargetDto>(false, SurveyErrorCodes.OutOfScope, default);
        }

        var target = new ProgressTargetDto(responseRate);
        if (!target.IsValid)
        {
            return new SurveyOperationResult<ProgressTargetDto>(false, SurveyErrorCodes.InvalidRequest, default);
        }

        var setting = await db.SurveyScoringSettings
            .FirstOrDefaultAsync(x => x.SurveyScoringSettingId == SettingId, cancellationToken);
        if (setting is null)
        {
            // Dòng cấu hình chưa có thì dựng với ngưỡng tính điểm mặc định, để việc đặt chỉ
            // tiêu tiến độ không vô tình kéo ngưỡng tính điểm về 0.
            var defaults = ScoringThresholds.Default;
            setting = new SurveyScoringSetting
            {
                SurveyScoringSettingId = SettingId,
                MinimumResponseRate = defaults.MinimumResponseRate,
                MinimumValidRate = defaults.MinimumValidRate,
            };
            db.SurveyScoringSettings.Add(setting);
        }

        setting.ProgressTargetResponseRate = responseRate;
        setting.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return new SurveyOperationResult<ProgressTargetDto>(true, null, target);
    }
}
