FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ["SentimentWorker/SentimentWorker.csproj", "SentimentWorker/"]
COPY ["Application/Application.csproj", "Application/"]
COPY ["Domain/Domain.csproj", "Domain/"]
COPY ["Infrastructure/Infrastructure.csproj", "Infrastructure/"]
RUN dotnet restore "SentimentWorker/SentimentWorker.csproj"

COPY . .
RUN dotnet publish "SentimentWorker/SentimentWorker.csproj" -c Release -o /app/publish --no-restore

# Ảnh aspnet chứ không phải runtime: Infrastructure dùng IHttpContextAccessor và
# IHostEnvironment nên hợp ngữ cảnh phải là ASP.NET Core.
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

ARG APP_UID=64198
ENV APP_UID=${APP_UID}
USER $APP_UID

# Mặc định chạy một lượt rồi thoát. Đổi sang ["--watch"] nếu muốn theo dõi liên tục.
ENTRYPOINT ["dotnet", "SentimentWorker.dll"]
