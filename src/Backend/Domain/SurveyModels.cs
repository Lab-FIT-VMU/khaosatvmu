namespace Domain;

/// <summary>Các giá trị hợp lệ của "AnswerScales"."ScaleKind".</summary>
public static class AnswerScaleKinds
{
    /// <summary>Thang có sẵn các mức chọn trong "AnswerScaleOptions" (Mức độ hài lòng, Có/Không, Phần trăm...).</summary>
    public const string Options = "Options";

    /// <summary>Thang để người trả lời tự nhập chữ, không có mức chọn nào.</summary>
    public const string Text = "Text";

    public static bool IsValid(string? value) => value is Options or Text;
}

/// <summary>Bảng "AnswerScales". Thang trả lời dùng lại được cho nhiều bộ câu hỏi.</summary>
public sealed class AnswerScale : ISoftDeletable
{
    public int AnswerScaleId { get; set; }

    /// <summary>Vd 'Mức độ hài lòng', 'Mức độ đồng ý'.</summary>
    public string AnswerScaleName { get; set; } = string.Empty;

    /// <summary>
    /// <see cref="AnswerScaleKinds.Options"/> hoặc <see cref="AnswerScaleKinds.Text"/>.
    /// Thang loại Text không có dòng nào trong "AnswerScaleOptions" và câu trả lời
    /// của nó không được tính vào <see cref="SurveyResponse.Score"/>.
    /// </summary>
    public string ScaleKind { get; set; } = AnswerScaleKinds.Options;

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "AnswerScaleOptions". UNIQUE theo (AnswerScaleId, Value).</summary>
public sealed class AnswerScaleOption
{
    public int AnswerScaleOptionId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int AnswerScaleId { get; set; }

    /// <summary>
    /// CHECK 1..5. Không bắt buộc liên tiếp: thang 'Có/Không' dùng 1 và 5 để
    /// điểm của nó cùng dải với thang mức độ hài lòng.
    /// </summary>
    public int Value { get; set; }

    /// <summary>Nhãn hiển thị của mức, vd 'Rất hài lòng' hoặc '100%'.</summary>
    public string DisplayText { get; set; } = string.Empty;
}

/// <summary>Bảng "SurveyTemplates". Bộ câu hỏi do quản trị soạn.</summary>
public sealed class SurveyTemplate : ISoftDeletable
{
    public int SurveyTemplateId { get; set; }

    public string TemplateName { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "SurveyQuestionSections". Mục chia nhóm câu hỏi trong một bộ, vd
/// "Nội dung đánh giá học phần" / "Nội dung đánh giá về giảng viên".
///
/// Mục thuộc sở hữu của đúng một bộ câu hỏi chứ không phải danh mục dùng chung:
/// hai bộ cùng đặt tên mục giống hệt nhau vẫn là hai dòng riêng, sửa tên bên này
/// không đụng bên kia. Vì vậy UNIQUE chỉ đặt theo (SurveyTemplateId, SectionName)
/// và chỉ tính các dòng chưa xoá mềm.
///
/// KHÔNG có cột thứ tự: thứ tự mục suy ra từ vị trí câu đầu tiên của mục trong
/// bộ, mà thứ tự câu lại chính là thứ tự "QuestionId" — thêm cột thứ tự nữa là
/// đẻ ra hai nguồn sự thật có thể lệch nhau.
/// </summary>
public sealed class SurveyQuestionSection : ISoftDeletable
{
    public int SectionId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int SurveyTemplateId { get; set; }

    public string SectionName { get; set; } = string.Empty;

    /// <summary>
    /// Xoá mục là xoá mềm cả mục lẫn mọi câu thuộc mục. Giữ dòng lại vì báo cáo
    /// của các đợt đã chốt còn phải đọc ra tên mục để dựng nhãn.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "SurveyQuestions". Một câu hỏi thuộc đúng một mục, và bộ câu hỏi của câu
/// suy ra từ mục — câu KHÔNG còn khoá ngoại thẳng vào "SurveyTemplates" nữa. Giữ
/// cả hai khoá là giữ hai đường dẫn tới cùng một bộ, chỉ chờ ngày chúng lệch nhau.
/// Đổi lại, mọi truy vấn "các câu của bộ X" phải join qua "SurveyQuestionSections".
/// </summary>
public sealed class SurveyQuestion : ISoftDeletable
{
    public int QuestionId { get; set; }

    /// <summary>
    /// NOT NULL, ON DELETE RESTRICT. Mọi câu đều thuộc một mục, kể cả câu bẫy —
    /// bẫy nằm lọt trong mục thì sinh viên không nhận ra nó khác thường.
    /// </summary>
    public int SectionId { get; set; }

    public string QuestionText { get; set; } = string.Empty;

    /// <summary>
    /// NOT NULL, ON DELETE RESTRICT. Thang trả lời của riêng câu này nên một bộ
    /// câu hỏi trộn được nhiều loại thang khác nhau.
    /// </summary>
    public int AnswerScaleId { get; set; }

    /// <summary>
    /// Câu bẫy kiểm tra độ tập trung. NULL là câu hỏi bình thường; có giá trị thì
    /// người trả lời phải chọn đúng mức đó, sai một câu là phiếu bị lọc.
    /// Chỉ đặt được trên câu thuộc thang <see cref="AnswerScaleKinds.Options"/> và
    /// giá trị phải là một mức có thật của chính thang đó.
    /// Câu bẫy không được tính vào <see cref="SurveyResponse.Score"/>.
    /// </summary>
    public int? AttentionCheckValue { get; set; }

    /// <summary>
    /// Xoá câu là xoá mềm, vì "SurveyResponseAnswers" trỏ vào "QuestionId" bằng
    /// khoá ngoại RESTRICT — câu đã có phiếu trả lời thì xoá cứng không nổi.
    /// Xoá mục cũng xoá mềm luôn mọi câu thuộc mục.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "SemesterSurveys". Một lần phát khảo sát cho cả học kỳ: chọn học kỳ và
/// bộ câu hỏi, mọi lớp học phần của kỳ dùng chung bộ câu hỏi này.
/// </summary>
public sealed class SemesterSurvey : ISoftDeletable
{
    public int SemesterSurveyId { get; set; }

    /// <summary>
    /// Tên đợt do quản trị đặt lúc tạo, vd "Khảo sát giữa kỳ 2025-2026 đợt 1".
    /// NOT NULL nhưng không UNIQUE: cùng một kỳ vẫn được đặt trùng tên nếu muốn.
    /// Có tên riêng thì hai đợt cùng học kỳ, cùng bộ câu hỏi mới phân biệt được —
    /// trước đây màn hình chỉ hiện tên bộ câu hỏi nên chúng trông y hệt nhau.
    /// </summary>
    public string SurveyName { get; set; } = string.Empty;

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int SemesterId { get; set; }

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int SurveyTemplateId { get; set; }

    /// <summary>Khung thời gian tổng; mọi lịch của lớp trong đợt phải nằm trọn bên trong.</summary>
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }

    /// <summary>
    /// Hình thức phiếu của đợt: màu, ảnh, các đoạn chữ lưu ý và cảnh báo. Lưu nguyên
    /// khối JSON vì chỉ đọc ra để vẽ phiếu, không bao giờ phải lọc hay gộp theo nó.
    ///
    /// NULL nghĩa là dùng mẫu mặc định của hệ thống — mọi đợt tạo trước khi có tính
    /// năng này đều rơi vào nhánh đó và hiển thị y như cũ.
    ///
    /// Chỉ ghi MỘT LẦN lúc tạo đợt. Đợt đã tạo thì không sửa: phiếu đang phát cho
    /// sinh viên mà đổi hình thức giữa chừng là một kiểu hỏng khó lần ra.
    /// </summary>
    public string? FormConfigJson { get; set; }

    public DateTime CreatedAt { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "CourseSectionSurveys". Mỗi lớp học phần có một bài khảo sát riêng với
/// LinkToken riêng để dựng link và mã QR. UNIQUE theo (SemesterSurveyId, CourseSectionId).
/// </summary>
public sealed class CourseSectionSurvey : ISoftDeletable
{
    public int CourseSectionSurveyId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int SemesterSurveyId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int CourseSectionId { get; set; }

    /// <summary>UNIQUE. Chuỗi ngẫu nhiên dùng trong link và mã QR của lớp.</summary>
    public string LinkToken { get; set; } = string.Empty;

    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Điểm trung bình của lớp, chỉ gộp phiếu qua bộ lọc nhiễu. NULL nghĩa là
    /// chưa bấm tính lần nào. Đây là ảnh chụp của lần bấm nút gần nhất chứ không
    /// tự cập nhật khi có phiếu mới về, nên chỗ nào hiện số này phải hiện kèm
    /// <see cref="ScoreCalculatedAt"/>.
    /// </summary>
    public decimal? AverageScore { get; set; }

    /// <summary>Tổng lượt nộp, tính cả phiếu bị lọc. Số liệu tiến độ thu phiếu.</summary>
    public int TotalResponseCount { get; set; }

    /// <summary>Số phiếu qua lọc, chính là mẫu số của <see cref="AverageScore"/>.</summary>
    public int ValidResponseCount { get; set; }

    /// <summary>
    /// Số phiếu bị lọc nhiễu. Suy ra được bằng tổng trừ hợp lệ, nhưng lưu sẵn để
    /// màn danh sách lớp hiển thị thẳng, và lệch nhau thì biết dữ liệu có vấn đề.
    /// </summary>
    public int InvalidResponseCount { get; set; }

    /// <summary>Lần bấm tính điểm gần nhất. NULL là chưa tính lần nào.</summary>
    public DateTime? ScoreCalculatedAt { get; set; }

    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>
/// Bảng "CourseSectionSurveyQuestionScores". Điểm từng câu của từng lớp — chính
/// là các cột C1, C2… của bảng dữ liệu khảo sát. Cũng là ảnh chụp của lần bấm
/// tính gần nhất, cùng thời điểm với <see cref="CourseSectionSurvey.AverageScore"/>.
///
/// Có bảng riêng vì nếu gộp thẳng từ phiếu mỗi lần mở trang thì phải quét toàn bộ
/// "SurveyResponseAnswers" của cả đợt: một kỳ hơn 2000 lớp là vài triệu dòng cho
/// mỗi lượt xem. Gộp sẵn một lần khi chốt đợt thì trang chỉ còn đọc đúng số dòng
/// mà nó hiển thị.
/// </summary>
public sealed class CourseSectionSurveyQuestionScore
{
    /// <summary>NOT NULL, ON DELETE CASCADE. Khoá chính ghép với <see cref="QuestionId"/>.</summary>
    public int CourseSectionSurveyId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int QuestionId { get; set; }

    /// <summary>numeric(4,2): trung bình câu này trên các phiếu hợp lệ có trả lời.</summary>
    public decimal AverageScore { get; set; }

    /// <summary>
    /// Số phiếu hợp lệ đã trả lời câu này, chính là mẫu số của <see cref="AverageScore"/>.
    /// Không có dòng nào cho câu mà cả lớp chưa ai trả lời, nên giá trị này luôn > 0.
    /// </summary>
    public int AnswerCount { get; set; }
}

/// <summary>Bảng "SurveyResponses". Phiếu trả lời ẩn danh của sinh viên.</summary>
public sealed class SurveyResponse : ISoftDeletable
{
    public int ResponseId { get; set; }

    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int CourseSectionSurveyId { get; set; }

    public string? AdditionalComments { get; set; }

    /// <summary>
    /// numeric(4,2): điểm trung bình, backend tính khi nhận phiếu. Chỉ gộp các câu
    /// thuộc thang <see cref="AnswerScaleKinds.Options"/> và không phải câu bẫy;
    /// câu thang Text và câu bẫy không tính.
    /// </summary>
    public decimal Score { get; set; }

    /// <summary>
    /// Phiếu có qua bộ lọc nhiễu không. Phiếu bị lọc vẫn tính là một lượt nộp
    /// nhưng không tham gia vào điểm trung bình của lớp.
    /// Kết quả là ảnh chụp tại thời điểm nộp, không tính lại về sau.
    /// </summary>
    public bool IsValid { get; set; } = true;

    /// <summary>
    /// Các lý do bị lọc, ngăn cách bằng dấu phẩy, vd 'TOO_FAST,SINGLE_ANSWER'.
    /// NULL khi phiếu hợp lệ.
    /// </summary>
    public string? RejectionReasons { get; set; }

    public DateTime SubmittedAt { get; set; }

    /// <summary>
    /// Xoá mềm cả loạt phiếu của một lớp khi thanh tra thấy số liệu không dùng
    /// được (vd cả lớp nộp nhưng bộ lọc nhiễu loại sạch) và muốn lớp làm lại.
    /// Dòng vẫn nằm nguyên trong bảng để còn lần lại được chuyện gì đã xảy ra.
    ///
    /// LƯU Ý: <see cref="Infrastructure"/> KHÔNG tự chuyển
    /// <c>Remove()</c> thành xoá mềm cho loại này — AuditInterceptor loại
    /// SurveyResponse khỏi vòng xử lý (phiếu ẩn danh, không ghi nội dung vào nhật
    /// ký) nên gọi <c>Remove()</c> là xoá cứng thật. Phải gán tay hai cột này.
    /// </summary>
    public bool IsDeleted { get; set; }

    public DateTime? DeletedAt { get; set; }
}

/// <summary>Bảng "SurveyResponseAnswers". Khóa chính ghép (ResponseId, QuestionId).</summary>
public sealed class SurveyResponseAnswer
{
    /// <summary>NOT NULL, ON DELETE CASCADE.</summary>
    public int ResponseId { get; set; }

    /// <summary>NOT NULL, ON DELETE RESTRICT.</summary>
    public int QuestionId { get; set; }

    /// <summary>
    /// Câu trả lời thô luôn lưu dạng chữ. Câu thuộc thang
    /// <see cref="AnswerScaleKinds.Options"/> lưu số mức đã chọn ("1".."5"), câu
    /// thuộc thang <see cref="AnswerScaleKinds.Text"/> lưu nguyên nội dung người
    /// học gõ. Muốn đọc lại thì tra "ScaleKind" của thang gắn với câu hỏi.
    /// </summary>
    public string AnswerValue { get; set; } = string.Empty;

    public SurveyResponse? SurveyResponse { get; set; }
}

/// <summary>
/// Bảng "SurveyScoringSettings". Chỉ có đúng một dòng (Id = 1): cặp ngưỡng lọc
/// lớp được tính điểm, do quản trị đặt trên giao diện thay vì viết cứng trong mã.
/// </summary>
public sealed class SurveyScoringSetting
{
    public int SurveyScoringSettingId { get; set; }

    /// <summary>Vòng 1 — Số phiếu đã thu ÷ Sĩ số, phần trăm.</summary>
    public decimal MinimumResponseRate { get; set; }

    /// <summary>Vòng 2 — Số phiếu hợp lệ ÷ Số phiếu đã thu, phần trăm.</summary>
    public decimal MinimumValidRate { get; set; }

    /// <summary>
    /// Ba cờ bật tắt từng luật của bộ lọc nhiễu. ĐÃ BỎ phần chọn trên giao diện: hệ
    /// thống luôn áp cả ba luật và không đọc ba cột này nữa. Cột vẫn giữ trong bảng để
    /// không phải đổi CSDL; lưu cấu hình thì ghi true cả ba.
    /// </summary>
    public bool RejectTooFast { get; set; } = true;

    public bool RejectSingleAnswer { get; set; } = true;

    public bool RejectAttentionCheckFailed { get; set; } = true;

    public DateTime UpdatedAt { get; set; }
}

/// <summary>Mã loại sự kiện trong bảng "SurveyScoringChangeLogs".</summary>
public static class ScoringChangeKinds
{
    /// <summary>Quản trị lưu cấu hình tính điểm với giá trị khác trước.</summary>
    public const string ConfigUpdated = "CONFIG_UPDATED";

    /// <summary>Quản trị bấm Tính lại điểm cho một đợt khảo sát.</summary>
    public const string ScoresRecalculated = "SCORES_RECALCULATED";

    /// <summary>
    /// Quản trị phát hành kết quả của một đợt: từ lúc này trưởng bộ môn và giảng viên
    /// mới xem được số liệu của đợt đó.
    /// </summary>
    public const string ResultsPublished = "RESULTS_PUBLISHED";

    /// <summary>Thu hồi phát hành: kết quả của đợt lại chỉ quản trị xem được.</summary>
    public const string ResultsUnpublished = "RESULTS_UNPUBLISHED";
}

/// <summary>
/// Bảng "SurveyScoringChangeLogs": mỗi lần đổi cấu hình tính điểm hoặc tính lại điểm
/// một đợt là một dòng, kèm NGUYÊN BỘ cấu hình tại thời điểm đó và người thực hiện.
///
/// Cấu hình là một dòng dùng chung cho cả hệ thống, còn điểm đã chốt là ảnh chụp theo
/// từng đợt. Người A tính theo cấu hình x, người B đổi sang y rồi tính — không có bảng
/// này thì A không có cách nào biết số đang xem thuộc cấu hình nào. Các trang thống
/// kê đọc bảng này để báo cho những người KHÁC người vừa thao tác.
///
/// Chỉ thêm dòng, không sửa không xoá.
/// </summary>
public sealed class SurveyScoringChangeLog
{
    public long SurveyScoringChangeLogId { get; set; }

    /// <summary>Mã trong <see cref="ScoringChangeKinds"/>.</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>Đợt được tính lại điểm; null với sự kiện đổi cấu hình.</summary>
    public int? SemesterSurveyId { get; set; }

    public decimal MinimumResponseRate { get; set; }

    public decimal MinimumValidRate { get; set; }

    public bool RejectTooFast { get; set; }

    public bool RejectSingleAnswer { get; set; }

    public bool RejectAttentionCheckFailed { get; set; }

    /// <summary>Null khi không xác định được người gọi.</summary>
    public Guid? ChangedByUserId { get; set; }

    /// <summary>Tên hiển thị (hoặc email) lúc thao tác, để thông báo khỏi phải tra lại.</summary>
    public string ChangedByName { get; set; } = string.Empty;

    public DateTime ChangedAt { get; set; }
}
