using Domain;

namespace Application.CourseGrades;

/// <summary>
/// Một ngưỡng của bộ luật D, E với giá trị mặc định. Giá trị đang dùng nằm ở bảng
/// GradeAnalysisThresholds; danh mục này chỉ để khởi tạo dòng mới và khôi phục mặc định.
/// </summary>
public sealed record GradeAnalysisThresholdDefinition(
    string Code,
    string GroupCode,
    short SortOrder,
    string DisplayName,
    string Description,
    string RuleReference,
    string ValueType,
    GradeAnalysisThresholdValue DefaultValue,
    decimal? MinValue,
    decimal? MaxValue,
    string? Unit);

public sealed record GradeAnalysisThresholdValue(decimal? Numeric, bool? Boolean, IReadOnlyList<string>? TextList);

/// <summary>
/// 33 ngưỡng của tham_so_chi_so.json trong module audit (không gồm nhóm màu sắc, vì màu là quy
/// tắc giao diện M1–M5). Mã giữ đúng tên JSON để worker Python đọc ts["..."] như cũ. Mặc định
/// bằng đúng giá trị đang chạy của bản audit ngày 01/11/2026.
/// </summary>
public static class GradeAnalysisThresholdCatalog
{
    public static readonly IReadOnlyDictionary<string, string> GroupNames = new Dictionary<string, string>
    {
        ["pham_vi"] = "Phạm vi học phần",
        ["co_mau"] = "Cỡ mẫu tối thiểu",
        ["nang_luc_nen"] = "Năng lực nền của sinh viên",
        ["kiem_dinh"] = "Kiểm định thống kê",
        ["dau_hieu_lop"] = "Ngưỡng đặc điểm cấp lớp",
        ["co_hoc_phan"] = "Ngưỡng điểm lưu ý của học phần",
        ["co_giang_vien"] = "Lặp lại qua nhiều học kỳ",
        ["goi_y_ho_so"] = "Gợi ý đọc hồ sơ lớp (bộ luật E)",
    };

    public static readonly IReadOnlyList<GradeAnalysisThresholdDefinition> All =
    [
        new GradeAnalysisThresholdDefinition("tu_khoa_loai_hp", "pham_vi", 1, "Từ khóa tên học phần bị loại khỏi phân tích",
            "D-L2 (dự phòng): loại HP có tên chứa một trong các từ; đã chốt để rỗng = mọi HP thi bộ đề chung",
            "D-L2", GradeAnalysisThresholdValueTypes.TextList, List(), null, null, null),
        new GradeAnalysisThresholdDefinition("ds_ma_hp_loai_tru", "pham_vi", 2, "Mã học phần bị loại khỏi phân tích",
            "D-L2 (dự phòng): danh sách mã HP loại thêm",
            "D-L2", GradeAnalysisThresholdValueTypes.TextList, List(), null, null, null),
        new GradeAnalysisThresholdDefinition("gop_ma_hp_hau_to", "pham_vi", 3, "Gộp mã đuôi H/E với mã gốc thành một học phần",
            "D-L3 (đã chốt): gộp mã đuôi H/E với mã cùng số không đuôi thành một học phần (ma_hp_goc)",
            "D-L3", GradeAnalysisThresholdValueTypes.Boolean, Bool(true), null, null, null),
        new GradeAnalysisThresholdDefinition("so_sv_toi_thieu_lop", "co_mau", 1, "Số sinh viên tối thiểu để một lớp được đưa vào thống kê",
            "D-Đ1: số SV đạt tư cách (X >= 4) tối thiểu để lớp đưa vào thống kê. Chỉ đếm sinh viên đủ tư cách dự thi. Lớp ít hơn được ghi là “không đưa vào thống kê”.",
            "D-Đ1", GradeAnalysisThresholdValueTypes.Integer, Number(15m), 3m, null, "sinh viên"),
        new GradeAnalysisThresholdDefinition("so_sv_tin_cay_thap", "co_mau", 2, "Ngưỡng gắn nhãn “ít sinh viên – đọc thận trọng”",
            "D-Đ2: dưới ngưỡng này gắn nhãn TIN_CAY_THAP. Lớp có số sinh viên dưới ngưỡng này vẫn được thống kê nhưng kèm nhãn để người đọc thận trọng.",
            "D-Đ2", GradeAnalysisThresholdValueTypes.Integer, Number(30m), 4m, null, "sinh viên"),
        new GradeAnalysisThresholdDefinition("so_lop_toi_thieu_hp", "co_mau", 3, "Số lớp tối thiểu để so sánh trong một học phần",
            "D-Đ3: số lớp đưa vào thống kê tối thiểu để so sánh trong học phần. Học phần có ít lớp hơn sẽ không so sánh giữa các lớp.",
            "D-Đ3", GradeAnalysisThresholdValueTypes.Integer, Number(2m), 2m, null, "lớp"),
        new GradeAnalysisThresholdDefinition("so_lop_hp_nang_luc_nen", "nang_luc_nen", 1, "Số học phần tối thiểu sinh viên học trong kỳ",
            "D-N1: số lớp HP tối thiểu SV đăng ký trong kỳ, tính cả HP đang xét. Dùng để ước lượng năng lực chung của sinh viên (tính cả học phần đang xét).",
            "D-N1", GradeAnalysisThresholdValueTypes.Integer, Number(3m), 2m, null, "học phần"),
        new GradeAnalysisThresholdDefinition("nang_luc_nen_thang", "nang_luc_nen", 2, "Thang điểm dùng tính năng lực nền",
            "D-N2: thang điểm dùng tính năng lực nền (10 hoặc 4). Chỉ nhận 10 hoặc 4.",
            "D-N2", GradeAnalysisThresholdValueTypes.Integer, Number(10m), 4m, 10m, "thang điểm"),
        new GradeAnalysisThresholdDefinition("muc_tin_cay", "kiem_dinh", 1, "Mức tin cậy của khoảng tin cậy",
            "Mức tin cậy của khoảng tin cậy. Ví dụ 0,95 là 95%.",
            "D mục 5", GradeAnalysisThresholdValueTypes.Decimal, Number(0.95m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("fdr_q", "kiem_dinh", 2, "Ngưỡng ý nghĩa sau hiệu chỉnh nhiều phép thử",
            "Ngưỡng FDR Benjamini-Hochberg, theo từng loại đặc điểm/điểm lưu ý, từng kỳ. Ví dụ 0,05. Giá trị càng nhỏ thì càng ít đặc điểm và điểm lưu ý được ghi nhận.",
            "D mục 6", GradeAnalysisThresholdValueTypes.Decimal, Number(0.05m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("d1_d2_lech_x", "dau_hieu_lop", 1, "Đặc điểm “điểm quá trình cao/thấp hơn kỳ vọng”: mức chênh tối thiểu",
            "D1/D2: |I7| tối thiểu (điểm). Đơn vị điểm.",
            "D1, D2", GradeAnalysisThresholdValueTypes.Decimal, Number(1.0m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("d3_r_lop", "dau_hieu_lop", 2, "Đặc điểm “điểm quá trình ít phản ánh điểm thi”: tương quan của lớp dưới mức",
            "D3: r của lớp dưới ngưỡng này, đồng thời cận trên khoảng tin cậy của r lớp thấp hơn r học phần. Từ 0 đến 1.",
            "D3", GradeAnalysisThresholdValueTypes.Decimal, Number(0.2m), 0m, 1m, "hệ số"),
        new GradeAnalysisThresholdDefinition("d3_r_hp", "dau_hieu_lop", 3, "Đặc điểm “điểm quá trình ít phản ánh điểm thi”: khi tương quan của học phần từ mức",
            "D3: khi r của học phần từ ngưỡng này trở lên. Từ 0 đến 1. Cũng là ngưỡng của “Điểm quá trình khớp tốt với điểm thi”, kèm cận dưới khoảng tin cậy không thấp hơn ngưỡng “ít phản ánh điểm thi”.",
            "D3, O3", GradeAnalysisThresholdValueTypes.Decimal, Number(0.4m), 0m, 1m, "hệ số"),
        new GradeAnalysisThresholdDefinition("d4_wasserstein", "dau_hieu_lop", 4, "Đặc điểm “phân bố điểm quá trình khác các lớp còn lại”: khoảng cách tối thiểu",
            "D4: khoảng cách Wasserstein X tối thiểu (điểm). Đơn vị điểm.",
            "D4", GradeAnalysisThresholdValueTypes.Decimal, Number(1.0m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("d5_chenh_mat_tu_cach", "dau_hieu_lop", 5, "Đặc điểm “mất tư cách cao hơn hẳn các lớp khác”: chênh tối thiểu so với các lớp khác",
            "D5: I1 lớp cao hơn các lớp khác cùng HP ít nhất (tỷ lệ, 0.15 = 15 điểm %). Tỷ lệ, ví dụ 0,15 là 15 điểm phần trăm.",
            "D5", GradeAnalysisThresholdValueTypes.Decimal, Number(0.15m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("d6_d7_lech_y", "dau_hieu_lop", 6, "Đặc điểm “điểm thi cao/thấp hơn kỳ vọng”: mức chênh tối thiểu",
            "D6/D7: |I8| tối thiểu (điểm). Đơn vị điểm.",
            "D6, D7", GradeAnalysisThresholdValueTypes.Decimal, Number(0.75m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("h1_icc_x", "co_hoc_phan", 1, "“Điểm quá trình chênh lệch giữa các lớp”: tỷ lệ phương sai tối thiểu",
            "H1: ICC_X tối thiểu; O1 cần cận trên ICC_X dưới mức này. Từ 0 đến 1; càng lớn thì càng ít học phần có điểm lưu ý. “Đồng đều” cần cận trên của tỷ lệ này dưới mức đó.",
            "H1, O1", GradeAnalysisThresholdValueTypes.Decimal, Number(0.1m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("h1_khoang_tan_x", "co_hoc_phan", 2, "“Điểm quá trình chênh lệch giữa các lớp”: mức chênh tối thiểu",
            "H1: chênh u cao nhất - thấp nhất (điểm). Chênh lệch (điểm) giữa lớp cao nhất và lớp thấp nhất.",
            "H1, O1", GradeAnalysisThresholdValueTypes.Decimal, Number(1.5m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("h2_icc_y", "co_hoc_phan", 3, "“Điểm thi chênh lệch giữa các lớp”: tỷ lệ phương sai tối thiểu",
            "H2: ICC_Y tối thiểu; O2 cần cận trên ICC_Y dưới mức này. Từ 0 đến 1. “Đồng đều” cần cận trên của tỷ lệ này dưới mức đó.",
            "H2, O2", GradeAnalysisThresholdValueTypes.Decimal, Number(0.1m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("h2_khoang_tan_y", "co_hoc_phan", 4, "“Điểm thi chênh lệch giữa các lớp”: mức chênh tối thiểu",
            "H2: chênh v cao nhất - thấp nhất (điểm). Đơn vị điểm.",
            "H2, O2", GradeAnalysisThresholdValueTypes.Decimal, Number(1.0m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("h3_r_hp", "co_hoc_phan", 5, "“Điểm quá trình ít phản ánh điểm thi”: cận trên của tương quan dưới mức",
            "H3: cận trên khoảng tin cậy của r gộp học phần dưới ngưỡng này; O3 cần cận dưới từ mức này. Từ 0 đến 1.",
            "H3, O3", GradeAnalysisThresholdValueTypes.Decimal, Number(0.3m), 0m, 1m, "hệ số"),
        new GradeAnalysisThresholdDefinition("h4_chenh_mat_tu_cach", "co_hoc_phan", 6, "“Tỷ lệ mất tư cách không đồng đều”: chênh tối thiểu giữa lớp cao nhất và thấp nhất",
            "H4: chênh I1 lớp cao nhất - thấp nhất (tỷ lệ); O4 cần cận trên của chênh dưới mức này. Tỷ lệ, ví dụ 0,15 là 15 điểm phần trăm.",
            "H4, O4", GradeAnalysisThresholdValueTypes.Decimal, Number(0.15m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("h5_ty_le_f", "co_hoc_phan", 7, "“Tỷ lệ trượt do điểm thi cao”: mức lưu ý",
            "H5: cận dưới khoảng tin cậy của tỷ lệ F do thi từ mức này. Ví dụ 0,30: cận dưới khoảng tin cậy của tỷ lệ trượt từ 30% trở lên.",
            "H5, O5", GradeAnalysisThresholdValueTypes.Decimal, Number(0.3m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("h5_chenh_lich_su", "co_hoc_phan", 8, "“Tỷ lệ trượt do điểm thi cao”: mức tăng so với các kỳ trước của học phần",
            "H5: tỷ lệ F do thi cao hơn các kỳ trước của chính học phần ít nhất (tỷ lệ, 0.10 = 10 điểm %), kèm Fisher có ý nghĩa sau FDR. Ví dụ 0,10 là 10 điểm phần trăm, kèm kiểm định có ý nghĩa thống kê.",
            "H5", GradeAnalysisThresholdValueTypes.Decimal, Number(0.1m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("h6_lech_y_giua_ky", "co_hoc_phan", 9, "“Điểm thi thay đổi so với lần mở gần nhất”: mức chênh điểm thi trung bình",
            "H6: |chênh Y trung bình| so với kỳ gần nhất trước đó (điểm). Chênh lệch (điểm) so với học kỳ gần nhất có mở học phần.",
            "H6, O6", GradeAnalysisThresholdValueTypes.Decimal, Number(1.0m), 0m, 10m, "điểm"),
        new GradeAnalysisThresholdDefinition("g1_so_ky_lap", "co_giang_vien", 1, "Số học kỳ tối thiểu có cùng một đặc điểm",
            "G1: số kỳ tối thiểu cùng một đặc điểm lặp lại ở cùng GV x mã HP. Cùng giảng viên, cùng học phần.",
            "G1", GradeAnalysisThresholdValueTypes.Integer, Number(2m), 2m, null, "học kỳ"),
        new GradeAnalysisThresholdDefinition("g1_ty_le_ky", "co_giang_vien", 2, "Tỷ lệ tối thiểu của số kỳ có đặc điểm",
            "G1: số kỳ có đặc điểm phải chiếm ít nhất tỷ lệ này trong số kỳ giảng viên dạy học phần. Trong số kỳ giảng viên dạy học phần. Ví dụ 0,5 là từ một nửa số kỳ.",
            "G1", GradeAnalysisThresholdValueTypes.Decimal, Number(0.5m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("g1_cua_so_ky", "co_giang_vien", 3, "Số học kỳ gần nhất được xét khi tìm đặc điểm lặp lại",
            "G1: chỉ xét số kỳ gần nhất theo lịch, tính đến kỳ đang xem (4 kỳ là 2 năm). Tính theo lịch, đến kỳ đang xem. Ví dụ 4 là 2 năm; đặc điểm cũ hơn không còn được tính là lặp lại.",
            "G1", GradeAnalysisThresholdValueTypes.Integer, Number(4m), 2m, null, "học kỳ"),
        new GradeAnalysisThresholdDefinition("vung_gan_0", "goi_y_ho_so", 1, "Hồ sơ lớp: vùng “gần 0” của mức chênh so với kỳ vọng",
            "Bộ luật E: mức lệch so với kỳ vọng trong khoảng ± giá trị này (điểm) coi là gần 0. Đơn vị điểm. Học kỳ có mức chênh trong khoảng ± giá trị này không tính là dương hay âm khi tóm tắt xu hướng của giảng viên.",
            "E bước 3", GradeAnalysisThresholdValueTypes.Decimal, Number(0.05m), 0m, 1m, "điểm"),
        new GradeAnalysisThresholdDefinition("so_ky_cung_chieu", "goi_y_ho_so", 2, "Hồ sơ lớp: số học kỳ tối thiểu để nói về xu hướng",
            "Bộ luật E (X3, X4, Q8): số kỳ tối thiểu, kèm khoảng tin cậy của trung bình các kỳ không chứa 0. Kèm điều kiện khoảng tin cậy của trung bình các kỳ không chứa 0.",
            "E X3, X4, Q8", GradeAnalysisThresholdValueTypes.Integer, Number(3m), 2m, null, "học kỳ"),
        new GradeAnalysisThresholdDefinition("he_so_ty_le_f", "goi_y_ho_so", 3, "Hồ sơ lớp: hệ số tỷ lệ trượt do điểm thi",
            "Bộ luật E (Q7): tỷ lệ F do thi của lớp cao hơn hệ số này nhân tỷ lệ của học phần. Gợi ý khi tỷ lệ F do điểm thi của lớp cao hơn hệ số này nhân tỷ lệ của cả học phần.",
            "E Q7", GradeAnalysisThresholdValueTypes.Decimal, Number(1.3m), 1m, null, "hệ số"),
        new GradeAnalysisThresholdDefinition("ty_le_f_toi_thieu", "goi_y_ho_so", 4, "Hồ sơ lớp: tỷ lệ trượt do điểm thi tối thiểu",
            "Bộ luật E (Q7): và tỷ lệ F do thi của lớp trên mức này. Và tỷ lệ F do điểm thi của lớp phải trên mức này (0,05 là 5%).",
            "E Q7", GradeAnalysisThresholdValueTypes.Decimal, Number(0.05m), 0m, 1m, "tỷ lệ"),
        new GradeAnalysisThresholdDefinition("ty_le_nguong_d5", "goi_y_ho_so", 5, "Hồ sơ lớp: tỷ lệ của ngưỡng mất tư cách",
            "Bộ luật E (Q6): tỷ lệ của ngưỡng d5_chenh_mat_tu_cach dùng cho câu gợi ý. Gợi ý khi tỷ lệ mất tư cách của lớp cao hơn các lớp khác ít nhất giá trị này nhân ngưỡng đặc điểm “mất tư cách cao hơn hẳn các lớp khác”.",
            "E Q6", GradeAnalysisThresholdValueTypes.Decimal, Number(0.5m), 0m, 1m, "tỷ lệ"),
    ];

    private static GradeAnalysisThresholdValue Number(decimal value) => new(value, null, null);
    private static GradeAnalysisThresholdValue Bool(bool value) => new(null, value, null);
    private static GradeAnalysisThresholdValue List(params string[] values) => new(null, null, values);
}
