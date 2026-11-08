"""Cấu hình worker, đọc cùng biến môi trường với API để docker-compose chỉ khai một chỗ."""
import base64
import os
import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class WorkerConfig:
    conninfo: str
    keys: dict[int, bytes] = field(repr=False)
    processes: int


def _conninfo_from_ado(value: str) -> str:
    """Chuyển chuỗi kết nối kiểu .NET (Host=db;Port=5432;...) sang chuỗi của libpq."""
    names = {'host': 'host', 'port': 'port', 'database': 'dbname', 'username': 'user', 'user id': 'user',
             'password': 'password', 'sslmode': 'sslmode', 'ssl mode': 'sslmode'}
    parts = []
    for item in value.split(';'):
        if '=' not in item:
            continue
        key, val = item.split('=', 1)
        mapped = names.get(key.strip().lower())
        if mapped:
            escaped = val.strip().replace('\\', '\\\\').replace("'", "\\'")
            parts.append(f"{mapped}='{escaped}'")
    return ' '.join(parts)


def _decode_key(encoded: str) -> bytes:
    key = base64.b64decode(encoded.strip())
    if len(key) != 32:
        raise ValueError('Khóa mã hóa điểm phải dài đúng 32 byte (AES-256).')
    return key


def load_config(env=os.environ) -> WorkerConfig:
    connection = env.get('GRADE_WORKER_DATABASE') or env.get('ConnectionStrings__DefaultConnection')
    if not connection:
        raise SystemExit('Thiếu chuỗi kết nối: đặt ConnectionStrings__DefaultConnection như API.')
    conninfo = _conninfo_from_ado(connection) if '=' in connection and ';' in connection else connection

    # Cùng tên biến với API: CourseGrades__EncryptionKeys__<phiên bản>, hoặc file khóa (Docker secret).
    keys: dict[int, bytes] = {}
    for name, value in env.items():
        # Không phân biệt hoa thường: trên Windows, os.environ trả tên biến viết hoa.
        match = re.fullmatch(r'CourseGrades__EncryptionKeys__(\d+)', name, re.IGNORECASE)
        if match and value.strip():
            keys[int(match.group(1))] = _decode_key(value)
    key_file = env.get('CourseGrades__EncryptionKeyFile')
    if key_file and os.path.exists(key_file):
        keys[int(env.get('CourseGrades__ActiveKeyVersion') or 1)] = _decode_key(open(key_file, encoding='utf-8').read())
    if not keys:
        raise SystemExit('Thiếu khóa mã hóa điểm: đặt CourseGrades__EncryptionKeys__1 (COURSE_GRADE_ENCRYPTION_KEY).')

    return WorkerConfig(conninfo=conninfo, keys=keys, processes=int(env.get('GRADE_WORKER_PROCESSES') or 1))
