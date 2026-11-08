FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    # Máy chủ 1–2 vCPU: chạy mô hình hỗn hợp tuần tự (khoảng 3 phút cho 4 kỳ, ~450 MB RAM).
    GRADE_WORKER_PROCESSES=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY xu_ly ./xu_ly
COPY grade_worker ./grade_worker
COPY rules ./rules

ARG GRADE_WORKER_VERSION=dev
ENV GRADE_WORKER_VERSION=${GRADE_WORKER_VERSION}

RUN useradd --system --uid 64199 gradeworker
USER gradeworker

# Mặc định chạy hết các lượt đang chờ rồi thoát. Thêm "--watch" để chạy nền.
ENTRYPOINT ["python", "-m", "grade_worker"]
