using Application.CourseGrades;
using Domain;
using Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.CourseGrades;

/// <summary>
/// Đồng bộ bảng GradeAnalysisThresholds với <see cref="GradeAnalysisThresholdCatalog"/> mỗi lần
/// khởi động: thêm ngưỡng còn thiếu (giá trị = mặc định), cập nhật tên, mô tả, mặc định và giới
/// hạn của ngưỡng đã có. KHÔNG BAO GIỜ ghi đè giá trị đang dùng: đó là quyết định của người có
/// quyền COURSE_GRADE_THRESHOLDS_ACCESS, và mọi kết quả đã tính đều gắn với giá trị đó.
/// </summary>
public static class GradeAnalysisThresholdSeeder
{
    public static async Task SeedAsync(AppDbContext db, CancellationToken cancellationToken = default)
    {
        var existing = await db.GradeAnalysisThresholds.ToDictionaryAsync(x => x.ThresholdCode, cancellationToken);
        // Ngưỡng mới thêm vào bản sau mang phiên bản hiện hành, để không đổi phiên bản của
        // các kết quả đã tính chỉ vì có thêm một ngưỡng chưa ai sửa.
        var currentVersion = existing.Count == 0 ? 1 : existing.Values.Max(x => x.Version);
        var now = DateTime.UtcNow;

        foreach (var definition in GradeAnalysisThresholdCatalog.All)
        {
            if (!existing.TryGetValue(definition.Code, out var row))
            {
                row = new GradeAnalysisThreshold
                {
                    ThresholdCode = definition.Code,
                    ValueType = definition.ValueType,
                    NumericValue = definition.DefaultValue.Numeric,
                    BooleanValue = definition.DefaultValue.Boolean,
                    TextListValue = definition.DefaultValue.TextList?.ToList(),
                    Version = currentVersion,
                    UpdatedAtUtc = now,
                };
                db.GradeAnalysisThresholds.Add(row);
            }

            row.GroupCode = definition.GroupCode;
            row.SortOrder = definition.SortOrder;
            row.DisplayName = definition.DisplayName;
            row.Description = definition.Description;
            row.RuleReference = definition.RuleReference;
            row.DefaultNumericValue = definition.DefaultValue.Numeric;
            row.DefaultBooleanValue = definition.DefaultValue.Boolean;
            row.DefaultTextListValue = definition.DefaultValue.TextList?.ToList();
            row.MinValue = definition.MinValue;
            row.MaxValue = definition.MaxValue;
            row.Unit = definition.Unit;
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
