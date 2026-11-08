namespace UnitTests.InfrastructureTests;

using System.Security.Cryptography;
using Application.CourseGrades;
using FluentAssertions;
using global::Infrastructure.CourseGrades;
using Microsoft.Extensions.Options;
using Xunit;

public class AesGcmGradeCipherTests
{
    private static readonly string Key1 = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray());
    private static readonly string Key2 = Convert.ToBase64String(Enumerable.Range(101, 32).Select(i => (byte)i).ToArray());

    private static AesGcmGradeCipher Cipher(short active = 1, params (string Version, string Key)[] keys) =>
        new(Options.Create(new CourseGradeEncryptionOptions
        {
            ActiveKeyVersion = active,
            EncryptionKeys = (keys.Length == 0 ? [("1", Key1)] : keys).ToDictionary(x => x.Version, x => x.Key),
        }));

    private static GradeCellContext Context(string column = GradeCellColumns.Z, int row = 7) =>
        new(RevisionId: 12, StudentId: 345, CourseCode: "17540", SourceRowNumber: row, Column: column);

    [Theory]
    [InlineData("6.3")]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("10")]
    [InlineData("7.25")]
    public void EncryptThenDecrypt_ReturnsTheSameValue(string text)
    {
        var value = decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);
        var cipher = Cipher();
        var blob = cipher.Encrypt(value, Context());

        cipher.Decrypt(blob, 1, Context()).Should().Be(value);
    }

    [Fact]
    public void SameValue_GivesDifferentCipherText_BecauseOfRandomNonce()
    {
        var cipher = Cipher();
        cipher.Encrypt(6.3m, Context()).Should().NotEqual(cipher.Encrypt(6.3m, Context()));
    }

    [Fact]
    public void CipherText_CannotBeMovedToAnotherColumnOrRow()
    {
        var cipher = Cipher();
        var blob = cipher.Encrypt(9m, Context(GradeCellColumns.X));

        // Chép khối X sang cột Y, hoặc sang dòng khác: tag GCM không khớp AAD.
        var toOtherColumn = () => cipher.Decrypt(blob, 1, Context(GradeCellColumns.Y));
        var toOtherRow = () => cipher.Decrypt(blob, 1, Context(GradeCellColumns.X, row: 8));
        toOtherColumn.Should().Throw<CryptographicException>();
        toOtherRow.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void OldKeyVersion_StillDecrypts_AfterRotation()
    {
        var blob = Cipher().Encrypt(5.5m, Context());
        var rotated = Cipher(2, ("1", Key1), ("2", Key2));

        rotated.ActiveKeyVersion.Should().Be(2);
        rotated.Decrypt(blob, 1, Context()).Should().Be(5.5m);
        var wrongVersion = () => rotated.Decrypt(blob, 2, Context());
        wrongVersion.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void MissingKey_ReportsConfigurationError_WithoutTouchingOtherFeatures()
    {
        var cipher = new AesGcmGradeCipher(Options.Create(new CourseGradeEncryptionOptions()));
        var encrypt = () => cipher.Encrypt(1m, Context());
        encrypt.Should().Throw<CourseGradeException>()
            .Which.ErrorCode.Should().Be(CourseGradeErrorCodes.EncryptionNotConfigured);
    }

    [Fact]
    public void AssociatedData_HasDocumentedShape() =>
        Context().ToAssociatedData().Should().Be("StudentCourseGrades|ZEnc|12|345|17540|7");
}
