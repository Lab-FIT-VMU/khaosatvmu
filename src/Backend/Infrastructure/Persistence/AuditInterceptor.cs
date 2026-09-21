using System.Text.Json;
using Application;
using Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Infrastructure.Persistence;

internal sealed class AuditInterceptor(ICurrentUserAccessor currentUser) : SaveChangesInterceptor
{
    private static readonly HashSet<Type> _excluded =
    [
        typeof(ChangeAuditLog),
        typeof(AuthAuditLog),
        typeof(AuthSession),
        typeof(SurveyResponse),
        typeof(SurveyResponseAnswer),
    ];

    private static readonly JsonSerializerOptions _jsonOptions = new() { WriteIndented = false };

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null)
            return base.SavingChangesAsync(eventData, result, cancellationToken);

        var now = DateTime.UtcNow;
        var userId = currentUser.UserId;
        var userEmail = currentUser.UserEmail;
        var logs = new List<ChangeAuditLog>();

        foreach (var entry in eventData.Context.ChangeTracker.Entries().ToList())
        {
            if (_excluded.Contains(entry.Entity.GetType())) continue;
            if (entry.State is EntityState.Detached or EntityState.Unchanged) continue;

            string action;
            string? oldValues = null;
            string? newValues = null;

            if (entry.State == EntityState.Deleted && entry.Entity is ISoftDeletable softDeletable)
            {
                // Intercept hard delete: convert to soft delete
                softDeletable.IsDeleted = true;
                softDeletable.DeletedAt = now;
                entry.State = EntityState.Modified;
                action = "DELETE";
                oldValues = Serialize(entry, original: true);
            }
            else if (entry.State == EntityState.Added)
            {
                action = "CREATE";
                newValues = Serialize(entry, original: false);
            }
            else if (entry.State == EntityState.Modified)
            {
                if (entry.Entity is ISoftDeletable sd)
                {
                    var wasDeleted = entry.Property(nameof(ISoftDeletable.IsDeleted)).OriginalValue is true;
                    if (!wasDeleted && sd.IsDeleted)
                    {
                        action = "DELETE";
                        oldValues = Serialize(entry, original: true);
                    }
                    else if (wasDeleted && !sd.IsDeleted)
                    {
                        action = "RESTORE";
                        oldValues = Serialize(entry, original: true);
                        newValues = Serialize(entry, original: false);
                    }
                    else
                    {
                        action = "UPDATE";
                        oldValues = Serialize(entry, original: true);
                        newValues = Serialize(entry, original: false);
                    }
                }
                else
                {
                    action = "UPDATE";
                    oldValues = Serialize(entry, original: true);
                    newValues = Serialize(entry, original: false);
                }
            }
            else
            {
                continue;
            }

            logs.Add(new ChangeAuditLog
            {
                Id = Guid.NewGuid(),
                TableName = entry.Metadata.ClrType.Name,
                RecordId = GetPrimaryKeyString(entry),
                Action = action,
                ChangedBy = userId,
                ChangedByEmail = userEmail,
                OldValues = oldValues,
                NewValues = newValues,
                ChangedAt = now,
            });
        }

        foreach (var log in logs)
            eventData.Context.Set<ChangeAuditLog>().Add(log);

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static string GetPrimaryKeyString(EntityEntry entry)
    {
        var pkProps = entry.Metadata.FindPrimaryKey()?.Properties;
        if (pkProps is null) return string.Empty;

        return string.Join(",", pkProps.Select(p =>
        {
            var prop = entry.Property(p.Name);
            return (prop.CurrentValue ?? prop.OriginalValue)?.ToString() ?? "";
        }));
    }

    private static string Serialize(EntityEntry entry, bool original)
    {
        var dict = new Dictionary<string, object?>(entry.Properties.Count());
        foreach (var prop in entry.Properties)
            dict[prop.Metadata.Name] = original ? prop.OriginalValue : prop.CurrentValue;
        return JsonSerializer.Serialize(dict, _jsonOptions);
    }
}
