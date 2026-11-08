using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Application.CourseGrades;
using Microsoft.Extensions.Options;

namespace Infrastructure.CourseGrades;

/// <summary>
/// Cấu hình khóa mã hóa điểm (mục "CourseGrades"). Khóa là 32 byte, viết base64.
///
/// Triển khai: cất khóa trong Docker secret rồi trỏ <see cref="EncryptionKeyFile"/> tới file đó
/// (ví dụ /run/secrets/course_grade_key). Phát triển cục bộ: đặt
/// <c>CourseGrades__EncryptionKeys__1</c>. Đổi khóa: thêm khóa phiên bản mới, tăng
/// <see cref="ActiveKeyVersion"/>, giữ khóa cũ để còn đọc được dữ liệu cũ.
///
/// Mất khóa là mất toàn bộ điểm: phải có bản sao ngoại tuyến, tách khỏi bản sao lưu CSDL.
/// </summary>
public sealed class CourseGradeEncryptionOptions
{
    public const string SectionName = "CourseGrades";

    public short ActiveKeyVersion { get; set; } = 1;

    /// <summary>Phiên bản → khóa base64.</summary>
    public Dictionary<string, string> EncryptionKeys { get; set; } = [];

    /// <summary>File chứa khóa base64 của <see cref="ActiveKeyVersion"/> (Docker secret).</summary>
    public string? EncryptionKeyFile { get; set; }
}

/// <summary>
/// AES-256-GCM cho từng ô điểm. Định dạng khối mã (worker Python đọc đúng định dạng này):
/// <code>
///   byte 0      : 0x01 (phiên bản định dạng)
///   byte 1–12   : nonce ngẫu nhiên
///   byte 13–n-17: bản mã của chuỗi UTF-8 số thập phân, ví dụ "6.3", "-1"
///   16 byte cuối: tag xác thực
///   AAD         : GradeCellContext.ToAssociatedData()
/// </code>
/// Trong Python: <c>AESGCM(key).decrypt(blob[1:13], blob[13:], aad)</c>.
/// </summary>
public sealed class AesGcmGradeCipher : IGradeCipher
{
    private const byte FormatVersion = 1;
    private const int NonceSize = 12;
    private const int TagSize = 16;

    private readonly IOptions<CourseGradeEncryptionOptions> options;
    private readonly Lazy<IReadOnlyDictionary<short, byte[]>> keys;
    // Một lần nạp mã hóa khoảng 900 nghìn ô: dựng lại AesGcm (lập lịch khóa) cho từng ô là
    // phần tốn nhất, nên giữ một đối tượng cho mỗi khóa. AesGcm không an toàn đa luồng → khóa.
    private readonly Dictionary<short, AesGcm> engines = [];
    private readonly Lock engineLock = new();

    public AesGcmGradeCipher(IOptions<CourseGradeEncryptionOptions> options)
    {
        this.options = options;
        keys = new Lazy<IReadOnlyDictionary<short, byte[]>>(LoadKeys);
    }

    public short ActiveKeyVersion => options.Value.ActiveKeyVersion;

    public byte[] Encrypt(decimal value, GradeCellContext context)
    {
        var plain = Encoding.UTF8.GetBytes(value.ToString(CultureInfo.InvariantCulture));
        var blob = new byte[1 + NonceSize + plain.Length + TagSize];
        blob[0] = FormatVersion;
        RandomNumberGenerator.Fill(blob.AsSpan(1, NonceSize));
        var associatedData = Encoding.UTF8.GetBytes(context.ToAssociatedData());
        lock (engineLock)
        {
            EngineFor(ActiveKeyVersion).Encrypt(
                blob.AsSpan(1, NonceSize),
                plain,
                blob.AsSpan(1 + NonceSize, plain.Length),
                blob.AsSpan(1 + NonceSize + plain.Length, TagSize),
                associatedData);
        }
        return blob;
    }

    public decimal Decrypt(byte[] cipherText, short keyVersion, GradeCellContext context)
    {
        if (cipherText.Length < 1 + NonceSize + TagSize || cipherText[0] != FormatVersion)
        {
            throw new CryptographicException("Khối mã điểm không đúng định dạng.");
        }

        var plainLength = cipherText.Length - 1 - NonceSize - TagSize;
        var plain = new byte[plainLength];
        var associatedData = Encoding.UTF8.GetBytes(context.ToAssociatedData());
        lock (engineLock)
        {
            EngineFor(keyVersion).Decrypt(
                cipherText.AsSpan(1, NonceSize),
                cipherText.AsSpan(1 + NonceSize, plainLength),
                cipherText.AsSpan(1 + NonceSize + plainLength, TagSize),
                plain,
                associatedData);
        }
        return decimal.Parse(Encoding.UTF8.GetString(plain), NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    private AesGcm EngineFor(short version)
    {
        if (!engines.TryGetValue(version, out var engine))
        {
            engine = new AesGcm(KeyFor(version), TagSize);
            engines[version] = engine;
        }
        return engine;
    }

    private byte[] KeyFor(short version) =>
        keys.Value.TryGetValue(version, out var key)
            ? key
            : throw new CourseGradeException(
                CourseGradeErrorCodes.EncryptionNotConfigured,
                $"Chưa cấu hình khóa mã hóa điểm phiên bản {version}. Xem mục CourseGrades trong cấu hình.");

    private IReadOnlyDictionary<short, byte[]> LoadKeys()
    {
        var value = options.Value;
        var result = new Dictionary<short, byte[]>();
        foreach (var (version, encoded) in value.EncryptionKeys)
        {
            if (short.TryParse(version, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
                && !string.IsNullOrWhiteSpace(encoded))
            {
                result[parsed] = DecodeKey(encoded);
            }
        }

        if (!string.IsNullOrWhiteSpace(value.EncryptionKeyFile) && File.Exists(value.EncryptionKeyFile))
        {
            result[value.ActiveKeyVersion] = DecodeKey(File.ReadAllText(value.EncryptionKeyFile));
        }

        return result;
    }

    private static byte[] DecodeKey(string encoded)
    {
        var key = Convert.FromBase64String(encoded.Trim());
        return key.Length == 32
            ? key
            : throw new CourseGradeException(
                CourseGradeErrorCodes.EncryptionNotConfigured,
                "Khóa mã hóa điểm phải dài đúng 32 byte (AES-256).");
    }
}
