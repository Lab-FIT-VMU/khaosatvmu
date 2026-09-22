using System;
using Xunit;

namespace UnitTests.InfrastructureTests;

/// <summary>
/// <see cref="FactAttribute"/> tự bỏ qua khi bundle model ONNX chưa được tạo trên máy này.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
internal sealed class RequireBackendModelFactAttribute : FactAttribute
{
    public RequireBackendModelFactAttribute()
    {
        if (TestPaths.ModelBundleDirectory is null)
        {
            Skip = "Chưa có models/open-comment-sentiment — chạy scripts/prepare_backend_model.py trước.";
        }
    }
}

/// <summary>
/// <see cref="FactAttribute"/> tự bỏ qua khi thiếu fixture tổng hợp dùng để đối chiếu tokenizer.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
internal sealed class RequireTokenizerFixtureFactAttribute : FactAttribute
{
    public RequireTokenizerFixtureFactAttribute()
    {
        if (TestPaths.TokenizerParityFixture is null)
        {
            Skip = "Chưa có fixture tokenizer-parity.json — chạy scripts/export_tokenizer_parity_fixture.py trước.";
        }
    }
}

/// <summary>
/// <see cref="FactAttribute"/> tự bỏ qua khi thiếu bundle ONNX hoặc thiếu fixture kết quả dự đoán
/// của engine Python. Một thuộc tính gộp cả hai điều kiện vì xUnit không cho phép gắn hai
/// thuộc tính Fact lên cùng một phương thức.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
internal sealed class RequireSentimentModelFactAttribute : FactAttribute
{
    public RequireSentimentModelFactAttribute()
    {
        if (TestPaths.ModelBundleDirectory is null)
        {
            Skip = "Chưa có models/open-comment-sentiment — chạy scripts/prepare_backend_model.py trước.";
            return;
        }

        if (TestPaths.PredictionParityFixture is null)
        {
            Skip = "Chưa có fixture phobert-prediction-parity.json — chạy scripts/export_prediction_parity_fixture.py trước.";
        }
    }
}
