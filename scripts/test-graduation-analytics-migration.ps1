param(
    [string]$PostgresContainer = 'khaosatvmu_db',
    [string]$PostgresUser = 'postgres',
    [string]$PostgresPassword = 'khaosatvmu@123'
)

$ErrorActionPreference = 'Stop'
$gaDatabaseName = "codex_ga_migration_$([Guid]::NewGuid().ToString('N').Substring(0, 10))"
$gaLegacyMigration = '20260825181627_RemoveTabPermissions'
$gaPreviousConnectionString = $env:ConnectionStrings__DefaultConnection
$gaCreated = $false

function Assert-LastExitCode([string]$message) {
    if ($LASTEXITCODE -ne 0) { throw $message }
}

try {
    $gaExisting = docker exec $PostgresContainer psql -U $PostgresUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$gaDatabaseName'"
    Assert-LastExitCode 'Could not inspect the temporary PostgreSQL database.'
    if ($gaExisting -eq '1') { throw "Temporary database already exists: $gaDatabaseName" }

    docker exec $PostgresContainer createdb -U $PostgresUser $gaDatabaseName
    Assert-LastExitCode 'Could not create the temporary PostgreSQL database.'
    $gaCreated = $true
    $env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=5432;Database=$gaDatabaseName;Username=$PostgresUser;Password=$PostgresPassword"

    dotnet build src\Backend\API\API.csproj --nologo
    Assert-LastExitCode 'Backend build failed.'
    dotnet ef database update $gaLegacyMigration --project src\Backend\Infrastructure\Infrastructure.csproj --startup-project src\Backend\API\API.csproj --context AppDbContext --no-build
    Assert-LastExitCode 'Could not migrate the temporary database to the legacy schema.'

    $gaSeedSql = @'
WITH inserted_dataset AS (
    INSERT INTO "GraduationAnalyticsDatasets" (
        "DatasetName", "OriginalFileName", "ContentHash", "ImportedByUserId",
        "ImportedByName", "ImportedAtUtc", "RowCount", "MinimumReviewDate", "MaximumReviewDate")
    VALUES (
        'Legacy multi-period dataset', 'legacy.xlsx', repeat('a', 64),
        '11111111-1111-1111-1111-111111111111', 'migration-test@local', now(), 3,
        DATE '2026-07-01', DATE '2026-11-01')
    RETURNING "DatasetId"
)
INSERT INTO "GraduationAnalyticsRows" (
    "DatasetId", "SourceSheetName", "SourceRowNumber", "FacultyName", "ProgramCode",
    "ProgramName", "Cohort", "InitialEnrollmentCount", "ReviewPeriodText", "ReviewMonth",
    "ReviewYear", "EligibleGraduateCount", "OnTimeGraduateCount", "OnTimeGraduateRate",
    "ExcellentCount", "ExcellentRate", "VeryGoodCount", "VeryGoodRate", "GoodCount",
    "GoodRate", "AverageCount", "AverageRate", "WorkStudyTransferCount", "WorkStudyTransferRate")
SELECT "DatasetId", 'Sheet1', 7, 'Faculty A', 'A01', 'Program A', 'K62', 100,
       'T7 - 2026', 7, 2026, 20, 10, 50, 2, 10, 4, 20, 8, 40, 6, 30, 0, 0
FROM inserted_dataset
UNION ALL
SELECT "DatasetId", 'Sheet1', 8, 'Faculty A', 'A01', 'Program A', 'K62', 100,
       'T7 - 2026', 7, 2026, 22, 11, 50, 3, 13.6, 5, 22.7, 8, 36.4, 6, 27.3, 0, 0
FROM inserted_dataset
UNION ALL
SELECT "DatasetId", 'Sheet1', 9, 'Faculty B', 'B01', 'Program B', 'K61', 80,
       'T11 - 2026', 11, 2026, 16, 8, 50, 1, 6.25, 3, 18.75, 7, 43.75, 5, 31.25, 0, 0
FROM inserted_dataset;
'@
    $gaSeedSql | docker exec -i $PostgresContainer psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $gaDatabaseName
    Assert-LastExitCode 'Could not seed multi-period legacy data.'

    $gaPreflightSql = Get-Content -LiteralPath 'scripts\graduation-analytics-period-preflight.sql' -Raw -Encoding utf8
    $gaPreflightSql | docker exec -i $PostgresContainer psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $gaDatabaseName
    Assert-LastExitCode 'Legacy preflight failed.'

    dotnet ef database update --project src\Backend\Infrastructure\Infrastructure.csproj --startup-project src\Backend\API\API.csproj --context AppDbContext --no-build
    Assert-LastExitCode 'Period migration failed.'

    $gaAssertionSql = @'
DO $migration_test$
DECLARE
    period_count integer;
    row_distribution text;
    legacy_eligible_total integer;
BEGIN
    IF to_regclass('"GraduationPeriods"') IS NULL
       OR to_regclass('"GraduationImportRevisions"') IS NULL
       OR to_regclass('"GraduationAggregateRows"') IS NULL THEN
        RAISE EXCEPTION 'Graduation analytics v3 tables were not created';
    END IF;

    IF EXISTS (SELECT 1 FROM "GraduationPeriods")
       OR EXISTS (SELECT 1 FROM "GraduationImportRevisions")
       OR EXISTS (SELECT 1 FROM "GraduationAggregateRows") THEN
        RAISE EXCEPTION 'V3 tables must start empty; legacy data cannot be backfilled safely';
    END IF;

    SELECT count(*) INTO period_count FROM "GraduationAnalyticsDatasets";
    IF period_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 period datasets, got %', period_count;
    END IF;

    SELECT string_agg(format('%s:%s', "ReviewPeriodText", "RowCount"), ',' ORDER BY "ReviewMonth")
    INTO row_distribution
    FROM "GraduationAnalyticsDatasets";
    IF row_distribution <> 'T7 - 2026:2,T11 - 2026:1' THEN
        RAISE EXCEPTION 'Unexpected period distribution: %', row_distribution;
    END IF;

    IF EXISTS (
        SELECT 1 FROM "GraduationAnalyticsDatasets"
        WHERE "ReviewMonth" NOT BETWEEN 1 AND 12
           OR "ReviewYear" NOT BETWEEN 1900 AND 2200
           OR length("ContentHash") <> 64) THEN
        RAISE EXCEPTION 'Invalid migrated metadata/hash';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "GraduationAnalyticsRows" row_data
        JOIN "GraduationAnalyticsDatasets" dataset ON dataset."DatasetId" = row_data."DatasetId"
        WHERE row_data."ReviewMonth" <> dataset."ReviewMonth"
           OR row_data."ReviewYear" <> dataset."ReviewYear") THEN
        RAISE EXCEPTION 'A row was attached to the wrong period dataset';
    END IF;

    SELECT sum("EligibleGraduateCount") INTO legacy_eligible_total FROM "GraduationAnalyticsRows";
    IF legacy_eligible_total <> 58 THEN
        RAISE EXCEPTION 'Legacy columns were not preserved';
    END IF;
END $migration_test$;
'@
    $gaAssertionSql | docker exec -i $PostgresContainer psql -v ON_ERROR_STOP=1 -U $PostgresUser -d $gaDatabaseName
    Assert-LastExitCode 'Legacy migration assertions failed.'
    Write-Output 'Graduation analytics legacy + v3 migration test: PASS'
}
finally {
    $env:ConnectionStrings__DefaultConnection = $gaPreviousConnectionString
    if ($gaCreated) {
        docker exec $PostgresContainer dropdb -U $PostgresUser --force $gaDatabaseName
    }
}
