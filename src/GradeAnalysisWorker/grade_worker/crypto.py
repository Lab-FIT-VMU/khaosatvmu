"""Giải mã ô điểm do backend C# (AesGcmGradeCipher) mã hóa.

Định dạng khối mã:  byte 0 = 0x01 | 12 byte nonce | bản mã | 16 byte tag
AAD:                "StudentCourseGrades|<cột>|<RevisionId>|<StudentId>|<CourseCode>|<SourceRowNumber>"
Bản rõ:             chuỗi UTF-8 số thập phân kiểu invariant ("6.3", "-1").
"""
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT_VERSION = 1
NONCE_SIZE = 12


def associated_data(column, revision_id, student_id, course_code, source_row_number):
    return f'StudentCourseGrades|{column}|{revision_id}|{student_id}|{course_code}|{source_row_number}'.encode('utf-8')


class GradeCipher:
    def __init__(self, keys):
        self._engines = {version: AESGCM(key) for version, key in keys.items()}

    def decrypt(self, blob, key_version, column, revision_id, student_id, course_code, source_row_number):
        data = bytes(blob)
        if len(data) < 1 + NONCE_SIZE + 16 or data[0] != FORMAT_VERSION:
            raise ValueError('Khối mã điểm không đúng định dạng.')
        engine = self._engines.get(key_version)
        if engine is None:
            raise KeyError(f'Không có khóa mã hóa phiên bản {key_version}.')
        plain = engine.decrypt(
            data[1:1 + NONCE_SIZE],
            data[1 + NONCE_SIZE:],
            associated_data(column, revision_id, student_id, course_code, source_row_number))
        return float(plain.decode('utf-8'))

    def encrypt(self, value, key_version, column, revision_id, student_id, course_code, source_row_number, nonce):
        """Chỉ dùng trong kiểm thử: dựng khối mã đúng định dạng của backend."""
        sealed = self._engines[key_version].encrypt(
            nonce, str(value).encode('utf-8'),
            associated_data(column, revision_id, student_id, course_code, source_row_number))
        return bytes([FORMAT_VERSION]) + nonce + sealed
