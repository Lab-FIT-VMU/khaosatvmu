@echo off
REM Chay SentimentWorker o che do NEN tren may dev: quet moi 15 giay, tra model sau 120 giay ranh.
REM
REM Vi sao can: khong co tien trinh nao chay nen thi y kien moi nam o trang thai "Chua phan tich"
REM cho toi khi co nguoi chay worker. Tien trinh nay giu do tre xuong con ~15 giay ma chi giu
REM khoang 1 GB RAM trong luc thuc su suy luan (do duoc: 130 MB khi ranh).
REM
REM Dung:  scripts\start-sentiment-daemon.cmd
REM Dung:  dong cua so nay, hoac Stop-Process -Name SentimentWorker
REM
REM LUU Y: dang chay file nay thi dung chay them mot luot worker nua, va nguoc lai.
echo Dang chay SentimentWorker o che do nen (quet 15s, tra model sau 120s ranh)...
echo Dong cua so nay de dung.
echo ----------------------------------------------------
set DOTNET_ENVIRONMENT=Development
set OpenCommentSentiment__ScanIntervalSeconds=15
set OpenCommentSentiment__IdleUnloadSeconds=120
dotnet run --project "%~dp0..\src\Backend\SentimentWorker" -- --watch
