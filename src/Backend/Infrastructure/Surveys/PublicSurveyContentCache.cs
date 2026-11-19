using Application.Surveys;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;

namespace Infrastructure.Surveys;

/// <summary>A separate budget so public traffic cannot evict or grow the reporting cache.</summary>
public sealed class PublicSurveyContentCache(long maximumEstimatedBytes = PublicSurveyContentCache.MaximumEstimatedBytes) : IDisposable
{
    public const long MaximumEstimatedBytes = 32 * 1024 * 1024;
    private readonly MemoryCache entries = new(new MemoryCacheOptions { SizeLimit = maximumEstimatedBytes });

    public bool TryGetValue(string key, out PublicSurveyDto? value) => entries.TryGetValue(key, out value);
    public void Remove(string key) => entries.Remove(key);

    public void Set(string key, PublicSurveyDto value)
    {
        // Include string/object overhead as well as the serialized content. Entries
        // exceeding the entire budget are served directly without being cached.
        var size = JsonSerializer.SerializeToUtf8Bytes(value).LongLength * 2
            + key.Length * 2L + 1024 + value.Questions.Count * 256L;
        entries.Set(key, value, new MemoryCacheEntryOptions
        {
            Size = size,
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15),
        });
    }

    public void Dispose() => entries.Dispose();
}
