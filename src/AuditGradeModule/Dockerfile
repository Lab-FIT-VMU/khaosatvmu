FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    AUDIT_HOST=0.0.0.0 \
    AUDIT_PORT=8770 \
    # chi_so.py chạy mô hình hỗn hợp bằng (số CPU - 1) tiến trình, tối đa 8. Trong container
    # os.cpu_count() trả số CPU của cả máy, nên chặn lại ở đây: 3 → 2 tiến trình.
    PYTHON_CPU_COUNT=3

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ngày nạp ghi theo giờ Việt Nam như bản chạy trên máy (đặt sau pip để không mất cache thư viện).
ENV TZ=Asia/Ho_Chi_Minh

COPY xu_ly ./xu_ly
COPY web ./web
COPY Data ./Data
COPY chay.py README.md THAY_DOI.md ./

# Dữ liệu (kho: dữ liệu sạch, tham số; web/data: kết quả đã xuất) nằm trong volume /data,
# mã đọc qua đường dẫn cũ kho/ và web/data/ nhờ liên kết, không phải sửa bộ tính.
RUN useradd --system --uid 64198 audit \
    && mkdir -p /data/kho /data/web_data \
    && chown -R audit /data \
    && ln -s /data/kho /app/kho \
    && ln -s /data/web_data /app/web/data

USER audit
VOLUME /data
EXPOSE 8770

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8770/api/trang-thai', timeout=4)"

ENTRYPOINT ["sh", "-c", "mkdir -p /data/kho /data/web_data && exec python -X utf8 chay.py --khong-mo"]
