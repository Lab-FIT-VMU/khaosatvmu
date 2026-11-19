using System.IO.Compression;
using System.Xml;
using DocumentFormat.OpenXml.Packaging;

namespace Infrastructure.Imports;

internal static class GraduationWorkbookErrors
{
    public static bool IsInvalidFormat(Exception exception) =>
        exception is FileFormatException or InvalidDataException or XmlException or OpenXmlPackageException;

    public static void ValidatePackage(Stream stream)
    {
        // Avoid library implementation errors on empty/incomplete ZIP archives.
        // These two root entries are required by the Open XML package format.
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true))
        {
            if (archive.GetEntry("[Content_Types].xml") is null || archive.GetEntry("_rels/.rels") is null)
                throw new InvalidDataException("The workbook is missing required package metadata.");
        }
        stream.Position = 0;
    }
}
