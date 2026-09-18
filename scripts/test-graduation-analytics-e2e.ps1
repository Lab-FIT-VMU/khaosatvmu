param(
    [Parameter(Mandatory = $true)]
    [string]$SampleDirectory,
    [string]$PostgresContainer = 'khaosatvmu_db',
    [string]$PostgresUser = 'postgres',
    [string]$PostgresPassword = 'khaosatvmu@123',
    [int]$ApiPort = 5127
)

$ErrorActionPreference = 'Stop'
$e2eDatabaseName = "codex_ga_e2e_$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$e2eBaseUrl = "http://localhost:$ApiPort"
$e2eApiDirectory = Join-Path $PSScriptRoot '..\src\Backend\API\bin\Debug\net9.0'
$e2eCookieFile = [IO.Path]::GetTempFileName()
$e2eResponseFile = [IO.Path]::GetTempFileName()
$e2eStdoutFile = [IO.Path]::GetTempFileName()
$e2eStderrFile = [IO.Path]::GetTempFileName()
$e2eCreatedDatabase = $false
$e2eApiProcess = $null
$e2ePreviousConnectionString = $env:ConnectionStrings__DefaultConnection
$e2ePreviousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$e2ePreviousTicketKey = $env:SurveyTicket__SigningKey

function Assert-LastExitCode([string]$message) {
    if ($LASTEXITCODE -ne 0) { throw $message }
}

function ConvertTo-CurlJsonArgument([string]$Json) {
    return $Json.Replace('"', '\"')
}

function Invoke-E2eJson([string[]]$CurlArguments, [string]$Description) {
    $status = & curl.exe --noproxy '*' -sS -c $e2eCookieFile -b $e2eCookieFile `
        -o $e2eResponseFile -w '%{http_code}' @CurlArguments
    Assert-LastExitCode "$Description failed because curl could not complete."
    $body = Get-Content -LiteralPath $e2eResponseFile -Raw -Encoding utf8
    if ([int]$status -lt 200 -or [int]$status -ge 300) {
        $apiTail = (Get-Content -LiteralPath $e2eStdoutFile -Tail 40 -Encoding utf8) -join [Environment]::NewLine
        throw "$Description returned HTTP $status. Response: $body API log tail: $apiTail"
    }
    if ([string]::IsNullOrWhiteSpace($body)) { return $null }
    return $body | ConvertFrom-Json
}

function Invoke-Preview([string]$FilePath, [string]$CsrfToken) {
    return Invoke-E2eJson @(
        '-X', 'POST',
        '-H', "X-CSRF-TOKEN: $CsrfToken",
        '-F', "file=@$FilePath;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "$e2eBaseUrl/api/v1/graduation-analytics/imports/preview"
    ) "Preview '$([IO.Path]::GetFileName($FilePath))'"
}

function Invoke-Commit(
    [string]$FilePath,
    [object]$Preview,
    [int]$AcademicYearStart,
    [int]$RoundNumber,
    [int]$ReviewMonth,
    [int]$ReviewYear,
    [Nullable[long]]$ExpectedRevisionId,
    [string]$ReplaceReason,
    [string]$CsrfToken) {
    $arguments = @(
        '-X', 'POST',
        '-H', "X-CSRF-TOKEN: $CsrfToken",
        '-F', "file=@$FilePath;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        '-F', "academicYearStart=$AcademicYearStart",
        '-F', "roundNumber=$RoundNumber",
        '-F', "reviewMonth=$ReviewMonth",
        '-F', "reviewYear=$ReviewYear",
        '-F', "previewFileHash=$($Preview.fileHash)"
    )
    if ($null -ne $ExpectedRevisionId) {
        $arguments += @('-F', "expectedActiveRevisionId=$ExpectedRevisionId")
    }
    if (-not [string]::IsNullOrWhiteSpace($ReplaceReason)) {
        $arguments += @('-F', "replaceReason=$ReplaceReason")
    }
    $arguments += "$e2eBaseUrl/api/v1/graduation-analytics/imports/commit"
    return Invoke-E2eJson $arguments "Commit '$([IO.Path]::GetFileName($FilePath))'"
}

try {
    if (-not (Test-Path -LiteralPath $SampleDirectory -PathType Container)) {
        throw "Sample directory does not exist: $SampleDirectory"
    }
    $sampleFiles = @(Get-ChildItem -LiteralPath $SampleDirectory -File -Filter '*.xlsx' | Sort-Object Name)
    if ($sampleFiles.Count -ne 11) {
        throw "Expected exactly 11 sample workbooks, found $($sampleFiles.Count)."
    }

    docker exec $PostgresContainer createdb -U $PostgresUser $e2eDatabaseName
    Assert-LastExitCode 'Could not create the temporary PostgreSQL database.'
    $e2eCreatedDatabase = $true

    $env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=5432;Database=$e2eDatabaseName;Username=$PostgresUser;Password=$PostgresPassword"
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:SurveyTicket__SigningKey = 'graduation-e2e-local-only-signing-key-2026'

    dotnet build (Join-Path $PSScriptRoot '..\src\Backend\API\API.csproj') --nologo
    Assert-LastExitCode 'Backend build failed.'

    $e2eApiProcess = Start-Process dotnet `
        -ArgumentList @('API.dll', '--urls', $e2eBaseUrl) `
        -WorkingDirectory $e2eApiDirectory `
        -RedirectStandardOutput $e2eStdoutFile `
        -RedirectStandardError $e2eStderrFile `
        -WindowStyle Hidden `
        -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($e2eApiProcess.HasExited) { break }
        if (Select-String -LiteralPath $e2eStdoutFile -SimpleMatch 'Now listening on:' -Quiet) {
            $ready = $true
            break
        }
    }
    if (-not $ready) {
        $stdout = (Get-Content -LiteralPath $e2eStdoutFile -Tail 100 -Encoding utf8) -join [Environment]::NewLine
        $stderr = (Get-Content -LiteralPath $e2eStderrFile -Tail 100 -Encoding utf8) -join [Environment]::NewLine
        throw "Temporary API did not become ready. STDOUT: $stdout STDERR: $stderr"
    }

    $login = Invoke-E2eJson @("$e2eBaseUrl/api/auth/dev/login?email=abc%40vmu.edu.vn") 'Development login'
    if (-not $login.profileSelectionRequired) { throw 'Development login did not request profile selection.' }
    $pendingProfiles = Invoke-E2eJson @("$e2eBaseUrl/api/auth/pending-profiles") 'Load pending profiles'
    $adminProfile = @($pendingProfiles.availableProfiles | Where-Object { $_.code -eq 'SURVEY_ADMIN' })[0]
    if ($null -eq $adminProfile) { throw 'Seeded SURVEY_ADMIN profile was not found.' }
    $csrf = Invoke-E2eJson @("$e2eBaseUrl/api/auth/csrf") 'Get CSRF token'
    $selectPayload = @{ profileId = $adminProfile.id } | ConvertTo-Json -Compress
    Invoke-E2eJson @(
        '-X', 'POST',
        '-H', "X-CSRF-TOKEN: $($csrf.token)",
        '-H', 'Content-Type: application/json',
        '--data-raw', (ConvertTo-CurlJsonArgument $selectPayload),
        "$e2eBaseUrl/api/auth/select-profile"
    ) 'Select SURVEY_ADMIN profile' | Out-Null
    $csrf = Invoke-E2eJson @("$e2eBaseUrl/api/auth/csrf") 'Refresh CSRF token after sign-in'

    $sourceTotal = 0
    $importedTotal = 0
    $skippedTotal = 0
    $firstImport = $null
    $firstPreview = $null
    $firstFile = $null

    foreach ($file in $sampleFiles) {
        if ($file.Name -notmatch '^(?<start>\d{2})\.(?<end>\d{2})\.[^0-9]+(?<round>\d+)\.') {
            throw "Cannot derive academic year and round from '$($file.Name)'."
        }
        $academicYearStart = 2000 + [int]$Matches.start
        $roundNumber = [int]$Matches.round
        $reviewMonth = if ($roundNumber -eq 1) { 4 } else { 5 }
        $reviewYear = $academicYearStart + 1
        $preview = Invoke-Preview $file.FullName $csrf.token
        $commit = Invoke-Commit $file.FullName $preview $academicYearStart $roundNumber `
            $reviewMonth $reviewYear $null $null $csrf.token
        if ($commit.unchanged) { throw "Initial import unexpectedly reported unchanged: $($file.Name)" }

        $sourceTotal += [int]$preview.sourceRowCount
        $importedTotal += [int]$preview.importedRowCount
        $skippedTotal += [int]$preview.skippedRowCount
        if ($null -eq $firstImport) {
            $firstImport = $commit
            $firstPreview = $preview
            $firstFile = $file
        }
    }

    if ($sourceTotal -ne 6698 -or $importedTotal -ne 6697 -or $skippedTotal -ne 1) {
        throw "Unexpected parser totals: source=$sourceTotal imported=$importedTotal skipped=$skippedTotal."
    }

    $unchanged = Invoke-Commit $firstFile.FullName $firstPreview 2024 1 4 2025 `
        ([long]$firstImport.period.activeRevisionId) $null $csrf.token
    if (-not $unchanged.unchanged -or $unchanged.revision.revisionNumber -ne 1) {
        throw 'Reimporting identical data did not return the existing revision.'
    }

    $replacement = Invoke-Commit $firstFile.FullName $firstPreview 2024 1 3 2025 `
        ([long]$firstImport.period.activeRevisionId) 'E2E: test metadata replacement' $csrf.token
    if ($replacement.unchanged -or $replacement.revision.revisionNumber -ne 2) {
        throw 'Replacement did not create revision 2.'
    }
    $restored = Invoke-Commit $firstFile.FullName $firstPreview 2024 1 4 2025 `
        ([long]$replacement.period.activeRevisionId) 'E2E: restore original metadata' $csrf.token
    if ($restored.unchanged -or $restored.revision.revisionNumber -ne 3) {
        throw 'Second replacement did not create revision 3.'
    }

    $periods = @(Invoke-E2eJson @("$e2eBaseUrl/api/v1/graduation-analytics/managed-periods") 'Load managed periods')
    if ($periods.Count -eq 1 -and $periods[0] -is [Array]) {
        $periods = @($periods[0] | ForEach-Object { $_ })
    }
    if ($periods.Count -gt 0 -and $null -eq $periods[0].PSObject.Properties['studentCount']) {
        throw "Managed-period response shape is unexpected: $($periods | ConvertTo-Json -Depth 3 -Compress)"
    }
    $managedTotal = ($periods | Measure-Object studentCount -Sum).Sum
    if ($periods.Count -ne 11 -or $managedTotal -ne 6697) {
        throw "Managed-period result mismatch: periods=$($periods.Count), active=$managedTotal."
    }
    $revisions = @(Invoke-E2eJson @("$e2eBaseUrl/api/v1/graduation-analytics/managed-periods/$($restored.period.periodId)/revisions") 'Load revision history')
    if ($revisions.Count -eq 1 -and $revisions[0] -is [Array]) {
        $revisions = @($revisions[0] | ForEach-Object { $_ })
    }
    if ($revisions.Count -ne 3 -or $revisions[0].revisionNumber -ne 3) {
        throw "Revision history mismatch: $($revisions | ConvertTo-Json -Depth 3 -Compress)"
    }

    $lastPeriod = $periods | Sort-Object academicYearStart, roundNumber | Select-Object -Last 1
    $periodExplorePayload = @{
        mode = 'period'; cutoffPeriodId = $lastPeriod.periodId
        cohort = $null; facultyKey = $null; programKey = $null
    } | ConvertTo-Json -Compress
    $periodExplore = Invoke-E2eJson @(
        '-X', 'POST', '-H', "X-CSRF-TOKEN: $($csrf.token)",
        '-H', 'Content-Type: application/json', '--data-raw', (ConvertTo-CurlJsonArgument $periodExplorePayload),
        "$e2eBaseUrl/api/v1/graduation-analytics/explore/summary"
    ) 'Explore one period'
    $periodKpis = @{}; $periodExplore.kpis | ForEach-Object { $periodKpis[$_.id] = [int]$_.count }
    if ($periodKpis.graduated -ne 198 -or $periodKpis.onTime + $periodKpis.workStudy -ne 198) {
        throw 'Period exploration KPI invariant failed.'
    }

    $cohort = @($periodExplore.facets.cohorts)[0]
    $cumulativePayload = @{
        mode = 'cohortCumulative'; cutoffPeriodId = $lastPeriod.periodId
        cohort = $cohort; facultyKey = $null; programKey = $null
    } | ConvertTo-Json -Compress
    $cumulative = Invoke-E2eJson @(
        '-X', 'POST', '-H', "X-CSRF-TOKEN: $($csrf.token)",
        '-H', 'Content-Type: application/json', '--data-raw', (ConvertTo-CurlJsonArgument $cumulativePayload),
        "$e2eBaseUrl/api/v1/graduation-analytics/explore/summary"
    ) 'Explore cumulative cohort'
    $cumulativeKpis = @{}; $cumulative.kpis | ForEach-Object { $cumulativeKpis[$_.id] = [int]$_.count }
    if ($cumulativeKpis.graduated -ne ($cumulativeKpis.onTime + $cumulativeKpis.workStudy)) {
        throw 'Cumulative exploration KPI invariant failed.'
    }

    $assertionSql = @'
DO $e2e$
DECLARE
    active_total integer;
    excellent_total integer;
    very_good_total integer;
    good_total integer;
    average_total integer;
    work_study_total integer;
BEGIN
    SELECT
        sum(a."StudentCount"),
        sum(a."StudentCount") FILTER (WHERE a."GraduationRank" = 'Excellent'),
        sum(a."StudentCount") FILTER (WHERE a."GraduationRank" = 'VeryGood'),
        sum(a."StudentCount") FILTER (WHERE a."GraduationRank" = 'Good'),
        sum(a."StudentCount") FILTER (WHERE a."GraduationRank" = 'Average'),
        sum(a."StudentCount") FILTER (WHERE a."IsWorkStudy")
    INTO active_total, excellent_total, very_good_total, good_total, average_total, work_study_total
    FROM "GraduationPeriods" p
    JOIN "GraduationAggregateRows" a ON a."RevisionId" = p."ActiveRevisionId";

    IF active_total <> 6697 OR excellent_total <> 676 OR very_good_total <> 1509
       OR good_total <> 3632 OR average_total <> 880 OR work_study_total <> 451 THEN
        RAISE EXCEPTION 'Unexpected active totals: % / % / % / % / % / %',
            active_total, excellent_total, very_good_total, good_total, average_total, work_study_total;
    END IF;
    IF (SELECT count(*) FROM "GraduationPeriods") <> 11 THEN
        RAISE EXCEPTION 'Expected 11 graduation periods';
    END IF;
    IF (SELECT count(*) FROM "GraduationImportRevisions") <> 13 THEN
        RAISE EXCEPTION 'Expected 13 immutable revisions after replacement checks';
    END IF;
END $e2e$;
'@
    $assertionSql | docker exec -i $PostgresContainer psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $e2eDatabaseName
    Assert-LastExitCode 'Database E2E assertions failed.'

    Write-Output "Graduation analytics HTTP E2E: PASS (11 files, $sourceTotal source, $importedTotal active, $skippedTotal skipped)"
}
finally {
    if ($null -ne $e2eApiProcess -and -not $e2eApiProcess.HasExited) {
        Stop-Process -Id $e2eApiProcess.Id -Force
        $e2eApiProcess.WaitForExit()
    }
    $env:ConnectionStrings__DefaultConnection = $e2ePreviousConnectionString
    $env:ASPNETCORE_ENVIRONMENT = $e2ePreviousEnvironment
    $env:SurveyTicket__SigningKey = $e2ePreviousTicketKey
    if ($e2eCreatedDatabase) {
        docker exec $PostgresContainer dropdb -U $PostgresUser --force $e2eDatabaseName | Out-Null
    }
    foreach ($temporaryFile in @($e2eCookieFile, $e2eResponseFile, $e2eStdoutFile, $e2eStderrFile)) {
        if (Test-Path -LiteralPath $temporaryFile) { Remove-Item -LiteralPath $temporaryFile -Force }
    }
}
