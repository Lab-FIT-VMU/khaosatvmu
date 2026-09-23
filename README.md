# ⚓ VMU Survey System (khaosatvmu)

![.NET 9](https://img.shields.io/badge/.NET-9.0-512BD4?style=for-the-badge&logo=dotnet)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript)

**Hệ thống Đánh giá & Khảo sát Chất lượng Dạy - Học** dành riêng cho **Trường Đại học Hàng hải Việt Nam (VMU)**. Hệ thống được xây dựng trên kiến trúc Clean Architecture hiện đại, giao diện Maritime đậm chất hàng hải và tích hợp AI Agent Memory Runtime.

---

## 📋 Mục lục
- [⚓ Giới thiệu dự án](#-giới-thiệu-dự-án)
- [✨ Tính năng nổi bật](#-tính-năng-nổi-bật)
- [🛠️ Công nghệ sử dụng](#️-công-nghệ-sử-dụng)
- [🏛️ Kiến trúc hệ thống](#️-kiến-trúc-hệ-thống)
- [📂 Cấu trúc thư mục](#-cấu-trúc-thư-mục)
- [🚀 Hướng dẫn khởi chạy](#-hướng-dẫn-khởi-chạy)
  - [1. Khởi chạy bằng Docker Compose (Khuyên dùng)](#1-khởi-chạy-bằng-docker-compose-khuyên-dùng)
  - [2. Khởi chạy môi trường Local Development](#2-khởi-chạy-môi-trường-local-development)
  - [3. Tích hợp AI AgentMemory Runtime](#3-tích-hợp-ai-agentmemory-runtime)
- [⚙️ Biến môi trường (.env)](#️-biến-môi-trường-env)
- [📜 Quy chuẩn lập trình & Triết lý Ponytail](#-quy-chuẩn-lập-trình--triết-lý-ponytail)

---

## ⚓ Giới thiệu dự án

**VMU Survey System** là giải pháp toàn diện hỗ trợ Phòng Quản lý Chất lượng và các Khoa/Viện tại Trường Đại học Hàng hải Việt Nam triển khai, quản lý và thu thập dữ liệu khảo sát từ Sinh viên, Giảng viên và Cựu sinh viên.

Dự án tuân thủ nghiêm ngặt **Triết lý thiết kế Maritime**:
- **Bảng màu chủ đạo**: Hải quân hiện đại (`#0f172a` Navy Dark, `#1e293b` Slate, `#38bdf8` Cyan Accent).
- **Giao diện sắc nét**: Thiết kế vuông cạnh (sharp square corners, loại bỏ bo tròn `border-radius: 0px`) tạo sự chắc chắn, kỷ luật của ngành hàng hải.

---

## ✨ Tính năng nổi bật

1. **Quản lý cây đợt khảo sát (Survey Tree Architecture)**:
   - Phân cấp trực quan: `Năm học` ➔ `Học kỳ` ➔ `Đợt khảo sát`.
   - **Quick-Create Workflow**: Tạo nhanh đợt khảo sát trực tiếp ngay trên từng node danh mục.
2. **Kiến trúc Backend chuẩn Clean Architecture**:
   - Độc lập giữa Domain, Application, Infrastructure và API presentation layer.
   - Sử dụng Entity Framework Core 9 với PostgreSQL 15, hỗ trợ migrations & tự động seed dữ liệu mẫu.
3. **Giao diện Frontend React + TypeScript tối ưu**:
   - Trải nghiệm mượt mà, phản hồi tức thì với Vite bundler.
   - Hỗ trợ xem danh mục dạng cây, bộ lọc đợt khảo sát theo năm/học kỳ và biểu đồ thống kê.
4. **Tích hợp AgentMemory Runtime cho AI Agent**:
   - Bộ nhớ lưu trữ ngữ cảnh dài hạn cho AI Pair Programmer/Agents.
   - Hỗ trợ 54+ MCP (Model Context Protocol) tools và REST API.
   - Giao diện Visual Memory Viewer trực quan.

---

## 🛠️ Công nghệ sử dụng

| Phân vùng | Công nghệ / Thư viện | Mô tả |
| :--- | :--- | :--- |
| **Backend** | .NET 9 / C# | ASP.NET Core Web API (Clean Architecture) |
| **ORM & DB** | EF Core 9, PostgreSQL 15 | Quản trị dữ liệu quan hệ, Fluent API Configuration |
| **Frontend** | React 18, Vite, TypeScript | Giao diện Single Page Application (SPA) |
| **Styling** | Maritime Custom CSS | Hệ thống Style Navy sắc nét, vuông cạnh |
| **DevOps** | Docker, Docker Compose | Container hóa toàn bộ hệ thống |
| **AI Memory** | AgentMemory Engine (`iiidev/iii`) | Runtime lưu trữ tri thức & ngữ cảnh hệ thống cho AI |

---

## 🏛️ Kiến trúc hệ thống

```mermaid
flowchart TD
    subgraph Client["Frontend Layer (React 18 + Vite)"]
        UI["Maritime UI Dashboard\n(Tree View, Survey Management)"]
    end

    subgraph Backend["Backend Layer (.NET 9 Clean Architecture)"]
        API["API Presentation Layer\n(Controllers & Endpoints)"]
        App["Application Layer\n(Services, Interfaces, DTOs)"]
        Domain["Domain Layer\n(Entities, Enums, Value Objects)"]
        Infra["Infrastructure Layer\n(EF Core 9, DbContext, Migrations)"]
    end

    subgraph Data["Data & External Services"]
        DB[("PostgreSQL 15 Database")]
        AM["AgentMemory Runtime\n(REST API :3111 / Viewer :3113)"]
    end

    UI -->|HTTP / REST| API
    API --> App
    App --> Domain
    Infra --> Domain
    App --> Infra
    Infra -->|Npgsql / EF Core| DB
    API -->|HTTP REST| AM
```

---

## 📂 Cấu trúc thư mục

```text
khaosatvmu/
├── deploy/                   # Cấu hình triển khai & Docker (pgadmin, archives)
├── docs/                     # Tập trung hóa tài liệu dự án
│   ├── architecture/         # Quy chuẩn kiến trúc (AGENT_MEMORY, Ponytail)
│   ├── database/             # Thiết kế DB & sơ đồ quan hệ (dtb.md)
│   ├── plans/                # Kế hoạch triển khai & checklists
│   └── qa/                   # Tiêu chuẩn thiết kế UI & QA (design-qa.md)
├── rules/                    # Quy tắc hệ thống cho AI Assistant (.rulesforai)
├── scripts/                  # Script hỗ trợ (seed-memory.js, start-agentmemory)
├── src/
│   ├── Backend/              # Clean Architecture Backend (.NET 9)
│   │   ├── API/              # Presentation layer (.NET 9 Web API, Program.cs)
│   │   ├── Application/      # Interfaces, Services, DTOs
│   │   ├── Domain/           # Entities (AcademicYear, Semester, SurveyCampaign, ...)
│   │   ├── Infrastructure/   # EF Core 9 ApplicationDbContext, Seeders, Configurations
│   │   └── KhaosatVMU.sln    # Solution C# File
│   └── Frontend/             # React + Vite + TypeScript Frontend App
│       ├── public/           # Tài sản tĩnh
│       ├── src/              # React Components, Tree Views, Services, Types
│       ├── Dockerfile        # Container setup cho Frontend
│       ├── package.json      # Dependencies
│       └── vite.config.ts    # Cấu hình Vite
├── .dockerignore
├── .env.example              # File mẫu biến môi trường
├── docker-compose.yml        # Orchestration cho Postgres & pgAdmin
└── README.md
```

---

## 🚀 Hướng dẫn khởi chạy

### Yêu cầu hệ thống
- **Docker Desktop** (bản 20+ trở lên)
- **.NET 9.0 SDK** (cho phát triển local backend)
- **Node.js 18+** & **npm** (cho phát triển local frontend)

---

### 1. Khởi chạy bằng Docker Compose (Khuyên dùng)

1. **Tạo file cấu hình môi trường**:
   ```bash
   cp .env.example .env
   ```

2. **Khởi chạy các dịch vụ chính (Database, Backend, Frontend)**:
   ```bash
   docker compose up -d --build
   ```

3. **Truy cập ứng dụng**:
   - **Frontend UI**: [http://localhost:8080](http://localhost:8080)
   - **API health**: [http://localhost:8080/healthz](http://localhost:8080/healthz)
   - PostgreSQL chỉ bind vào loopback tại port `5432`; mật khẩu lấy từ `.env`.
   - pgAdmin chỉ chạy khi dùng `docker compose --profile tools up -d`.

4. **Phân tích cảm xúc ý kiến mở (chạy khi cần)**:

   Phân loại cảm xúc dùng model ONNX hơn 500 MB và giữ khoảng **1 GB RAM** khi chạy, nên **không**
   nằm trong tiến trình API và không thuộc nhóm dịch vụ khởi động mặc định. API chỉ đọc kết quả đã
   có; chưa chạy worker thì cột cảm xúc trống và màn báo cáo vẫn hoạt động bình thường.

   ```bash
   # Đặt model vào ./models/open-comment-sentiment (xem ml/open_comment_sentiment/README.md)
   docker compose --profile sentiment run --rm sentiment-worker
   ```

   Chạy một lượt rồi thoát. Mã thoát: `0` xong, `2` không nạp được model, `3` có lô thất bại.

   **Trên máy dev, nếu muốn số liệu tự lên trong ~15 giây sau khi có phiếu mới:** chạy
   `scripts\start-sentiment-daemon.cmd` (Windows) và **để cửa sổ đó mở**. Tiến trình nền quét mỗi 15 giây
   và tự trả model cho hệ điều hành sau 2 phút rảnh, nên RAM lúc rảnh chỉ ~130 MB.

   ```powershell
   # chạy một lượt ngay (dừng tiến trình nền trước, nếu không sẽ báo lỗi khoá tệp DLL)
   dotnet run --project src/Backend/SentimentWorker

   # xem/dừng tiến trình nền
   Get-Process -Name SentimentWorker
   Stop-Process -Name SentimentWorker
   ```

   Trên máy chủ thật **đừng chạy `--watch` thường trực**: model giữ khoảng 1 GB RAM và một nhân CPU
   của API suốt thời gian chạy. Muốn tự động hoá thì dùng systemd timer trong `deploy/systemd/` —
   worker chạy một lượt theo lịch rồi trả tài nguyên lại cho hệ thống.

   **Lưu ý về màn quản trị**: hai endpoint `GET /api/v1/reports/open-comments/model-status` và
   `POST /api/v1/reports/open-comments/reanalyze` (quyền `OPEN_COMMENT_MODEL_ADMIN`) **chưa có màn
   hình nào gọi** — hiện phải gọi bằng tay qua API. `reanalyze` chỉ **xếp hàng**, không chạy model:
   vẫn phải chạy lệnh trên thì kết quả mới đổi. Chế độ ép buộc không xoá nhãn do người chấm tay.

   **Cơ chế, thuật toán và triển khai**: `docs/phan-loai-cam-xuc-y-kien-mo.md` — đọc file này trước
   khi sửa bất cứ thứ gì liên quan tới phân loại cảm xúc.

   **Thuật toán và quá trình huấn luyện mô hình** (dữ liệu, tokenizer, hàm mất mát, siêu tham số,
   cân chỉnh ngưỡng, xuất ONNX, mã giả quy tắc 5 nhãn, cách đo chất lượng):
   `docs/thuat-toan-va-huan-luyen-mo-hinh-cam-xuc.md`.

   **Giải thích cho người không kỹ thuật** (dùng khi trình bày với khoa/phòng ban):
   `docs/giai-thich-phan-loai-cam-xuc.md`. Số liệu ví dụ trong đó là **số đo thật**, sinh lại được
   bằng `ml/open_comment_sentiment/scripts/explain_examples.py`; mọi con số chất lượng đều ghi rõ
   nguồn và giới hạn để không bị trích dẫn sai.

   **Pilot đo chất lượng thật**: xem `docs/plans/phan-loai-y-kien-mo-theo-cam-xuc.md` mục Giai
   đoạn 5 và `ml/open_comment_sentiment/README.md` mục "Gói pilot (chấm mù)".

---

### 2. Khởi chạy môi trường Local Development

#### **A. Chạy Backend (.NET 9 Web API)**
```bash
# Di chuyển vào thư mục dự án API
cd src/Backend/API

# Có thể cấu hình local bằng .NET User Secrets; nếu không, API Development
# sẽ tự tìm file .env từ thư mục hiện tại lên root mà không ghi đè biến hệ thống.
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;Database=khaosatvmu;Username=postgres;Password=<local-password>"
dotnet user-secrets set "Authentication:Google:ClientId" "<client-id>"
dotnet user-secrets set "Authentication:Google:ClientSecret" "<client-secret>"
dotnet user-secrets set "SurveyTicket:SigningKey" "<long-random-signing-key>"

# Chạy ứng dụng
dotnet run
```
*API Development lắng nghe tại `http://localhost:5115` theo `launchSettings.json`.*

#### **B. Chạy Frontend (React + Vite)**
```bash
# Di chuyển vào thư mục Frontend
cd src/Frontend

# Cài đặt thư viện
npm install

# Khởi chạy dev server
npm run dev
```
*Frontend sẽ chạy tại `http://localhost:5173`.*

---

### 3. Tích hợp AI AgentMemory Runtime

Hệ thống tích hợp **AgentMemory** để quản lý bộ nhớ dài hạn cho AI Agent trong quá trình phát triển.

1. **Bật AgentMemory container**:
   ```bash
   # Sử dụng script Windows
   .\scripts\start-agentmemory.cmd

   # Hoặc dùng Docker Compose Profile
   docker compose --profile agentmemory up -d
   ```

2. **Truy cập AgentMemory Services**:
   - **REST API Port**: `http://localhost:3111`
   - **Visual Memory Dashboard**: [http://localhost:3113](http://localhost:3113)

3. **Nạp dữ liệu tri thức ban đầu (Seed Memory)**:
   ```bash
   node scripts/seed-memory.js
   ```

---

## ⚙️ Cấu hình môi trường

File `.env` ở root phục vụ Docker Compose và được API tự nạp khi chạy Development. Environment variables và .NET User Secrets có độ ưu tiên cao hơn. Production không nạp `.env` và phải inject secret từ secret manager.

```env
# Database Settings
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-me
POSTGRES_DB=khaosatvmu
POSTGRES_PORT=5432

FRONTEND_BASE_URL=http://localhost:8080
ALLOWED_HOSTS=localhost
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
FRONTEND_PORT=8080
```

---

## 📜 Quy chuẩn lập trình & Triết lý Ponytail

Dự án áp dụng quy chuẩn lập trình **Ponytail AI Coding** (`docs/architecture/ponytail.md`):
- **Thang quyết định 7 bước (Decision Ladder)**: `Need (YAGNI)` ➔ `Codebase Reuse` ➔ `Stdlib` ➔ `Native Platform` ➔ `Installed Dependency` ➔ `One-Liner` ➔ `Minimal Implementation`.
- **Tối ưu hóa Codebase**: Giữ code gọn gàng, súc tích, tái sử dụng các abstraction có sẵn, hạn chế tối đa các dependency không cần thiết.

---

<p center align="center">
  <i>Được phát triển với định hướng chất lượng cao cho Trường Đại học Hàng hải Việt Nam ⚓</i>
</p>
