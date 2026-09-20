FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY ["API/API.csproj", "API/"]
COPY ["Application/Application.csproj", "Application/"]
COPY ["Domain/Domain.csproj", "Domain/"]
COPY ["Infrastructure/Infrastructure.csproj", "Infrastructure/"]
RUN dotnet restore "API/API.csproj"

COPY . .
RUN dotnet publish "API/API.csproj" -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
EXPOSE 8080
COPY --from=build /app/publish .

ARG APP_UID=64198
ENV APP_UID=${APP_UID}

# Ảnh của phiếu khảo sát (logo, ảnh bìa) nằm ngoài cơ sở dữ liệu. Tạo sẵn thư mục và
# trao quyền cho người chạy ứng dụng: ổ đĩa gắn vào đúng chỗ này thừa hưởng quyền của
# thư mục có sẵn trong ảnh, còn để Docker tự tạo thì thư mục thuộc root và ứng dụng
# chạy bằng tài khoản thường không ghi được.
RUN mkdir -p /app/App_Data/survey-form-assets && chown -R $APP_UID /app/App_Data

USER $APP_UID

ENTRYPOINT ["dotnet", "API.dll"]