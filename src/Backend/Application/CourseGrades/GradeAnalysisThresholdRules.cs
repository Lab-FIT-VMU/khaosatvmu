namespace Application.CourseGrades;

/// <summary>
/// Kiểm tra bộ ngưỡng trước khi lưu: kiểu giá trị, giới hạn từng ngưỡng và các ràng buộc giữa
/// các ngưỡng. Chuyển từ tham_so.kiem_tra() của module audit, thông điệp tiếng Việt giữ nguyên.
/// </summary>
public static class GradeAnalysisThresholdRules
{
    /// <summary>Giá trị số của ngưỡng; null nếu ngưỡng không có hoặc không phải số.</summary>
    private static decimal? Number(IReadOnlyDictionary<string, GradeAnalysisThresholdValue> values, string code) =>
        values.TryGetValue(code, out var value) ? value.Numeric : null;

    public static IReadOnlyList<string> Validate(IReadOnlyDictionary<string, GradeAnalysisThresholdValue> values)
    {
        var errors = new List<string>();

        foreach (var definition in GradeAnalysisThresholdCatalog.All)
        {
            if (!values.TryGetValue(definition.Code, out var value))
            {
                errors.Add($"Thiếu ngưỡng {definition.DisplayName}.");
                continue;
            }
            switch (definition.ValueType)
            {
                case Domain.GradeAnalysisThresholdValueTypes.Integer:
                case Domain.GradeAnalysisThresholdValueTypes.Decimal:
                    if (value.Numeric is not { } number)
                    {
                        errors.Add($"{definition.DisplayName}: phải là số.");
                    }
                    else if (definition.ValueType == Domain.GradeAnalysisThresholdValueTypes.Integer && number != decimal.Truncate(number))
                    {
                        errors.Add($"{definition.DisplayName}: phải là số nguyên.");
                    }
                    break;
                case Domain.GradeAnalysisThresholdValueTypes.Boolean when value.Boolean is null:
                    errors.Add($"{definition.DisplayName}: phải là có / không.");
                    break;
                case Domain.GradeAnalysisThresholdValueTypes.TextList when value.TextList is null:
                    errors.Add($"{definition.DisplayName}: phải là danh sách.");
                    break;
            }
        }
        if (errors.Count > 0)
        {
            return errors;
        }

        decimal N(string code) => Number(values, code)!.Value;

        if (N("so_sv_toi_thieu_lop") < 3)
            errors.Add("Số sinh viên tối thiểu để đưa lớp vào thống kê phải từ 3 trở lên.");
        if (N("so_sv_tin_cay_thap") <= N("so_sv_toi_thieu_lop"))
            errors.Add("Ngưỡng độ tin cậy thấp phải lớn hơn số sinh viên tối thiểu để đưa vào thống kê.");
        if (N("so_lop_toi_thieu_hp") < 2)
            errors.Add("Số lớp tối thiểu để so sánh trong học phần phải từ 2 trở lên.");
        if (N("so_lop_hp_nang_luc_nen") < 2)
            errors.Add("Số học phần tối thiểu để tính năng lực nền phải từ 2 trở lên.");
        if (N("nang_luc_nen_thang") is not (4 or 10))
            errors.Add("Thang điểm tính năng lực nền chỉ nhận 4 hoặc 10.");
        foreach (var code in new[] { "muc_tin_cay", "fdr_q", "h1_icc_x", "h2_icc_y", "h3_r_hp", "h5_ty_le_f", "d3_r_lop", "d3_r_hp" })
        {
            if (N(code) is <= 0 or >= 1)
                errors.Add($"Tham số {DisplayName(code)} phải nằm trong khoảng 0 đến 1.");
        }
        foreach (var code in new[] { "d5_chenh_mat_tu_cach", "h4_chenh_mat_tu_cach", "ty_le_f_toi_thieu", "ty_le_nguong_d5" })
        {
            if (N(code) is < 0 or > 1)
                errors.Add($"Tham số {DisplayName(code)} phải từ 0 đến 1.");
        }
        foreach (var code in new[] { "d1_d2_lech_x", "d4_wasserstein", "d6_d7_lech_y", "h1_khoang_tan_x", "h2_khoang_tan_y", "h6_lech_y_giua_ky" })
        {
            if (N(code) is <= 0 or > 10)
                errors.Add($"Tham số {DisplayName(code)} phải lớn hơn 0 và không quá 10 điểm.");
        }
        if (N("vung_gan_0") is < 0 or >= 1)
            errors.Add("Vùng gần 0 phải từ 0 đến dưới 1 điểm.");
        if (N("so_ky_cung_chieu") < 2)
            errors.Add("Số học kỳ cùng chiều tối thiểu phải từ 2 trở lên.");
        if (N("he_so_ty_le_f") < 1)
            errors.Add("Hệ số tỷ lệ F phải từ 1 trở lên.");
        if (N("h5_chenh_lich_su") is < 0 or >= 1)
            errors.Add("Mức tăng tỷ lệ trượt so với các kỳ trước phải từ 0 đến dưới 1.");
        if (N("g1_ty_le_ky") is <= 0 or > 1)
            errors.Add("Tỷ lệ số kỳ có đặc điểm phải trong khoảng trên 0 đến 1.");
        if (N("g1_cua_so_ky") < N("g1_so_ky_lap"))
            errors.Add("Số học kỳ gần nhất được xét phải không nhỏ hơn số học kỳ lặp lại tối thiểu.");
        if (N("g1_so_ky_lap") < 2)
            errors.Add("Số học kỳ lặp lại tối thiểu phải từ 2 trở lên.");
        return errors;
    }

    private static string DisplayName(string code) =>
        GradeAnalysisThresholdCatalog.All.FirstOrDefault(x => x.Code == code)?.DisplayName ?? code;
}
