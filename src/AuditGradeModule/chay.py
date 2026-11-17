"""Chạy web trên máy này, có thêm chức năng nạp học kỳ và sửa tham số.

    python chay.py            -> mở http://localhost:8770

Trên GitHub Pages, cùng thư mục web/ chạy ở chế độ chỉ xem (không có /api).
"""
import json
import os
import secrets
import shutil
import sys
import threading
import traceback
import webbrowser
from email import message_from_bytes
from email.policy import default as chinh_sach
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from xu_ly import kho

GOC = Path(__file__).resolve().parent
WEB = GOC / 'web'
# khaosatvmu: trong container lắng nghe 0.0.0.0 (chỉ API khaosatvmu gọi vào, không mở ra ngoài).
DIA_CHI = os.environ.get('AUDIT_HOST', '127.0.0.1')
CONG = int(os.environ.get('AUDIT_PORT', '8770'))
khoa_xu_ly = threading.Lock()
cong_viec = {}


def chay_nen(ham, *args):
    """Chạy tác vụ dài trong luồng riêng; web hỏi tiến độ qua /api/cong-viec."""
    ma = secrets.token_hex(6)
    cong_viec[ma] = {'trang_thai': 'dang_chay'}

    def _run():
        with khoa_xu_ly:
            try:
                cong_viec[ma] = {'trang_thai': 'xong', 'ket_qua': ham(*args)}
            except ValueError as e:
                cong_viec[ma] = {'trang_thai': 'loi', 'loi': str(e)}
            except Exception as e:                       # lỗi không lường trước: ghi log, báo gọn
                traceback.print_exc()
                cong_viec[ma] = {'trang_thai': 'loi', 'loi': f'Lỗi khi xử lý: {e}'}
    threading.Thread(target=_run, daemon=True).start()
    return ma


def chuan_bi(ky, f_lop, f_diem, ten_lop, ten_diem):
    try:
        return kho.chuan_bi_nap(ky, f_lop, f_diem, ten_lop, ten_diem)
    finally:
        for f in (f_lop, f_diem):
            Path(f).unlink(missing_ok=True)


class XuLy(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # khaosatvmu: send_error gọi log_message(fmt, HTTPStatus, ...) — bản gốc lỗi TypeError ở đây
        # nên 404 (vd hồ sơ lớp chưa có) bị cắt kết nối thay vì trả 404.
        if args and isinstance(args[0], str) and '/api/' in args[0]:
            sys.stderr.write('%s\n' % (fmt % args))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, obj, ma=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(ma)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/api/trang-thai':
            return self._json({'tren_may': True, 'dang_xu_ly': khoa_xu_ly.locked()})
        if u.path == '/api/cong-viec':
            ma = parse_qs(u.query).get('id', [''])[0]
            return self._json(cong_viec.get(ma, {'trang_thai': 'loi', 'loi': 'Không tìm thấy tác vụ.'}))
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        try:
            if u.path == '/api/nap/chuan-bi':
                msg = message_from_bytes(b'Content-Type: ' + self.headers['Content-Type'].encode() + b'\r\n\r\n'
                                         + self._body(), policy=chinh_sach)
                phan = {p.get_param('name', header='content-disposition'): p for p in msg.iter_parts()}
                ky = phan['ky'].get_content().strip()
                kho.TAM.mkdir(parents=True, exist_ok=True)
                tep = {}
                for ten in ('file_lop', 'file_diem'):
                    p = phan.get(ten)
                    if p is None or not p.get_filename():
                        return self._json({'loi': 'Hãy chọn đủ hai file.'}, 400)
                    duong = kho.TAM / f'up_{secrets.token_hex(6)}.xlsx'
                    duong.write_bytes(p.get_content())
                    tep[ten] = (str(duong), p.get_filename())
                return self._json({'id': chay_nen(chuan_bi, ky, tep['file_lop'][0], tep['file_diem'][0],
                                                  tep['file_lop'][1], tep['file_diem'][1])})
            data = json.loads(self._body() or b'{}')
            if u.path == '/api/nap/xac-nhan':
                return self._json({'id': chay_nen(kho.xac_nhan_nap, data['token'])})
            if u.path == '/api/go-ky':
                return self._json({'id': chay_nen(kho.go_ky, data['ky'])})
            if u.path == '/api/nap-lai':
                return self._json({'id': chay_nen(kho.tinh_lai_tat_ca)})
            if u.path == '/api/tham-so':
                return self._json({'id': chay_nen(kho.luu_tham_so, data['gia_tri'])})
            if u.path == '/api/tham-so/mac-dinh':
                return self._json({'id': chay_nen(kho.khoi_phuc_tham_so)})
        except Exception as e:
            traceback.print_exc()
            return self._json({'loi': f'Yêu cầu không hợp lệ: {e}'}, 400)
        self._json({'loi': 'Không có chức năng này.'}, 404)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    shutil.rmtree(kho.TAM, ignore_errors=True)
    if not (WEB / 'data' / 'danh_sach_ky.json').exists():
        kho.xuat()
    srv = ThreadingHTTPServer((DIA_CHI, CONG), partial(XuLy, directory=str(WEB)))
    url = f'http://localhost:{CONG}/'
    print(f'Đang chạy tại {url}  (Ctrl+C để dừng)')
    if '--khong-mo' not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
