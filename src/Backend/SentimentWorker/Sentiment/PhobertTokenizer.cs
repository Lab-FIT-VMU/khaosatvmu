using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SentimentWorker.Sentiment;

/// <summary>
/// Bản port trung thành của <c>PhobertTokenizer</c> (transformers, backend Python) sang C#.
///
/// Vì sao phải port tay thay vì dùng thư viện tokenizer sẵn có: PhoBERT không dùng BPE kiểu
/// RoBERTa/GPT-2. Nó dùng <c>bpe.codes</c> kiểu subword-nmt với ký hiệu cuối từ <c>&lt;/w&gt;</c>,
/// ghép cặp theo ĐÚNG thứ tự dòng trong tệp, rồi đổi <c>&lt;/w&gt;</c> thành hậu tố <c>@@</c> cho
/// các mảnh chưa kết thúc từ. Sai một chi tiết nhỏ ở đây là <c>input_ids</c> lệch so với lúc
/// huấn luyện, và mô hình sẽ dự đoán lệch theo mà không có cảnh báo nào.
///
/// Tệp vocab: mỗi dòng có dạng <c>&lt;token&gt; &lt;tần suất&gt;</c>. Id của token là vị trí dòng
/// cộng 4, vì bốn token đặc biệt &lt;s&gt;, &lt;pad&gt;, &lt;/s&gt;, &lt;unk&gt; được gán 0..3
/// trước khi nạp vocab. Cột tần suất bị bỏ đi, chỉ dùng để giữ đúng định dạng tệp gốc.
/// </summary>
public sealed partial class PhobertTokenizer
{
    /// <summary>&lt;s&gt; — token mở đầu chuỗi.</summary>
    public const int BosTokenId = 0;

    /// <summary>&lt;pad&gt; — token đệm khi gom lô.</summary>
    public const int PadTokenId = 1;

    /// <summary>&lt;/s&gt; — token kết thúc chuỗi.</summary>
    public const int EosTokenId = 2;

    /// <summary>&lt;unk&gt; — token cho mọi thứ không có trong vocab.</summary>
    public const int UnkTokenId = 3;

    private const string EndOfWordSuffix = "</w>";
    private const string ContinuationSuffix = "@@";

    /// <summary>
    /// Token đặc biệt được tách khỏi văn bản trước khi BPE, đúng như
    /// <c>PreTrainedTokenizer.tokenize</c> làm với trie của added tokens. Thứ tự ở đây phải
    /// khớp <c>all_special_tokens</c> của tokenizer Python: &lt;s&gt;, &lt;/s&gt;, &lt;unk&gt;,
    /// &lt;pad&gt;, &lt;mask&gt;.
    /// </summary>
    private static readonly string[] SpecialTokens = ["<s>", "</s>", "<unk>", "<pad>", "<mask>"];

    private static readonly string[] SpecialTokensByLength =
        [.. SpecialTokens.OrderByDescending(x => x.Length)];

    /// <summary>Regex tách từ của Python: <c>re.findall(r"\S+\n?", text)</c>.</summary>
    [GeneratedRegex(@"\S+\n?")]
    private static partial Regex WordPattern { get; }

    private readonly Dictionary<string, int> vocabulary;
    private readonly Dictionary<(string First, string Second), int> mergeRanks;
    private readonly Dictionary<string, int> addedTokens;
    private readonly Dictionary<string, string> bpeCache = new(StringComparer.Ordinal);

    private PhobertTokenizer(
        Dictionary<string, int> vocabulary,
        Dictionary<(string First, string Second), int> mergeRanks,
        Dictionary<string, int> addedTokens)
    {
        this.vocabulary = vocabulary;
        this.mergeRanks = mergeRanks;
        this.addedTokens = addedTokens;
    }

    /// <summary>Số token trong vocab, kể cả token đặc biệt.</summary>
    public int VocabularySize => vocabulary.Count;

    /// <summary>
    /// Nạp tokenizer từ thư mục chứa <c>vocab.txt</c>, <c>bpe.codes</c> và tùy chọn
    /// <c>added_tokens.json</c>.
    /// </summary>
    public static PhobertTokenizer Load(string vocabPath, string mergesPath, string? addedTokensPath = null)
    {
        if (!File.Exists(vocabPath))
        {
            throw new FileNotFoundException($"Không tìm thấy vocab.txt của PhoBERT: {vocabPath}", vocabPath);
        }

        if (!File.Exists(mergesPath))
        {
            throw new FileNotFoundException($"Không tìm thấy bpe.codes của PhoBERT: {mergesPath}", mergesPath);
        }

        var vocabulary = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["<s>"] = BosTokenId,
            ["<pad>"] = PadTokenId,
            ["</s>"] = EosTokenId,
            ["<unk>"] = UnkTokenId,
        };

        // add_from_file() của Python: cắt dòng, lấy mọi thứ trước dấu cách CUỐI CÙNG làm token
        // rồi gán id bằng số phần tử đang có. Token trùng sẽ ghi đè id cũ bằng chính số đó nên
        // không làm lệch các token sau — bản C# phải giữ nguyên hành vi này.
        foreach (var rawLine in File.ReadLines(vocabPath))
        {
            var line = rawLine.Trim();
            if (line.Length == 0)
            {
                continue;
            }

            var separator = line.LastIndexOf(' ');
            if (separator < 0)
            {
                throw new InvalidDataException(
                    $"vocab.txt sai định dạng, cần '<token> <tần suất>' nhưng gặp: {line}");
            }

            vocabulary[line[..separator]] = vocabulary.Count;
        }

        var mergeRanks = new Dictionary<(string, string), int>();
        var rank = 0;
        foreach (var rawLine in File.ReadLines(mergesPath))
        {
            // Python đọc cả tệp rồi bỏ phần tử cuối sau split("\n") — tức bỏ dòng trống cuối tệp.
            // File.ReadLines không trả về dòng đó nên số dòng ở đây khớp đúng số luật merge.
            //
            // merge.split() của Python cắt trên MỌI khoảng trắng Unicode, không chỉ dấu cách.
            // bpe.codes có những dòng mở đầu bằng U+00A0 (khoảng trắng không ngắt) như
            // "\xa0 km</w> 43474"; nếu chỉ cắt theo dấu cách thì số cột sẽ sai và toàn bộ
            // thứ hạng merge sau đó lệch đi.
            var parts = rawLine.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);

            // Python lấy tuple(parts[:-1]) làm khóa. Chỉ dòng đúng ba cột mới cho ra cặp hai
            // phần tử; các dòng khuyết cột tạo khóa 0/1 phần tử, không bao giờ khớp với cặp
            // sinh ra từ get_pairs nên bị bỏ qua — nhưng VẪN chiếm một thứ hạng. Vì vậy rank
            // phải tăng cho mọi dòng, kể cả dòng dị dạng.
            if (parts.Length == 3)
            {
                mergeRanks[(parts[0], parts[1])] = rank;
            }

            rank++;
        }

        var addedTokens = new Dictionary<string, int>(StringComparer.Ordinal);
        if (!string.IsNullOrWhiteSpace(addedTokensPath) && File.Exists(addedTokensPath))
        {
            using var stream = File.OpenRead(addedTokensPath);
            using var document = JsonDocument.Parse(stream);
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Value.TryGetInt32(out var id))
                {
                    addedTokens[property.Name] = id;
                    vocabulary.TryAdd(property.Name, id);
                }
            }
        }

        return new PhobertTokenizer(vocabulary, mergeRanks, addedTokens);
    }

    /// <summary>
    /// Tách văn bản thành token, tương đương <c>tokenizer.tokenize(text)</c>.
    /// </summary>
    public IReadOnlyList<string> Tokenize(string text)
    {
        // Python: `if not text.strip(): return []`.
        if (string.IsNullOrWhiteSpace(text))
        {
            return [];
        }

        var tokens = new List<string>();
        var fragment = new StringBuilder();
        var index = 0;

        while (index < text.Length)
        {
            var special = MatchSpecialToken(text, index);
            if (special is not null)
            {
                TokenizeFragment(fragment, tokens);
                tokens.Add(special);
                index += special.Length;
                continue;
            }

            fragment.Append(text[index]);
            index++;
        }

        TokenizeFragment(fragment, tokens);
        return tokens;
    }

    /// <summary>Đổi token sang id, trả <see cref="UnkTokenId"/> khi không có trong vocab.</summary>
    public int ConvertTokenToId(string token)
    {
        if (vocabulary.TryGetValue(token, out var id))
        {
            return id;
        }

        if (addedTokens.TryGetValue(token, out var addedId))
        {
            return addedId;
        }

        return UnkTokenId;
    }

    /// <summary>
    /// Mã hoá văn bản thành <c>input_ids</c> đúng như lúc huấn luyện: cắt còn
    /// <paramref name="maxLength"/> token tính cả &lt;s&gt; và &lt;/s&gt;.
    /// </summary>
    public IReadOnlyList<int> Encode(string text, int maxLength)
    {
        var tokens = Tokenize(text);
        var body = new List<int>(tokens.Count);
        foreach (var token in tokens)
        {
            body.Add(ConvertTokenToId(token));
        }

        return AddSpecialTokens(body, maxLength);
    }

    /// <summary>Ghép &lt;s&gt;/&lt;/s&gt; và cắt chuỗi id về đúng độ dài tối đa.</summary>
    public static IReadOnlyList<int> AddSpecialTokens(IReadOnlyList<int> body, int maxLength)
    {
        var budget = Math.Max(0, maxLength - 2);
        var take = Math.Min(body.Count, budget);

        var result = new List<int>(take + 2) { BosTokenId };
        for (var i = 0; i < take; i++)
        {
            result.Add(body[i]);
        }

        result.Add(EosTokenId);
        return result;
    }

    private static string? MatchSpecialToken(string text, int index)
    {
        foreach (var candidate in SpecialTokensByLength)
        {
            if (index + candidate.Length > text.Length)
            {
                continue;
            }

            if (string.CompareOrdinal(text, index, candidate, 0, candidate.Length) == 0)
            {
                return candidate;
            }
        }

        return null;
    }

    private void TokenizeFragment(StringBuilder fragment, List<string> tokens)
    {
        if (fragment.Length == 0)
        {
            return;
        }

        var value = fragment.ToString();
        fragment.Clear();

        foreach (Match match in WordPattern.Matches(value))
        {
            var encoded = Bpe(match.Value);
            foreach (var subword in encoded.Split(' '))
            {
                tokens.Add(subword);
            }
        }
    }

    /// <summary>
    /// Áp dụng BPE cho một từ, trả về các mảnh nối bằng dấu cách, mảnh chưa kết thúc từ có
    /// hậu tố <c>@@</c>. Tương đương <c>PhobertTokenizer.bpe(token)</c>.
    /// </summary>
    private string Bpe(string token)
    {
        if (bpeCache.TryGetValue(token, out var cached))
        {
            return cached;
        }

        var word = new List<string>(token.Length);
        foreach (var character in token)
        {
            word.Add(character.ToString());
        }

        if (word.Count == 0)
        {
            return token;
        }

        // word = word[:-1] + [word[-1] + "</w>"] — đánh dấu ký tự cuối là kết thúc từ.
        word[^1] += EndOfWordSuffix;

        var pairs = GetPairs(word);
        if (pairs.Count == 0)
        {
            // Từ một ký tự không có cặp nào để ghép: Python trả lại nguyên token gốc,
            // KHÔNG kèm "</w>". Giữ đúng như vậy, nếu không id sẽ lệch.
            bpeCache[token] = token;
            return token;
        }

        while (true)
        {
            var found = false;
            var bestRank = int.MaxValue;
            var bestFirst = string.Empty;
            var bestSecond = string.Empty;

            foreach (var pair in pairs)
            {
                if (mergeRanks.TryGetValue(pair, out var rank) && rank < bestRank)
                {
                    bestRank = rank;
                    bestFirst = pair.First;
                    bestSecond = pair.Second;
                    found = true;
                }
            }

            if (!found)
            {
                break;
            }

            var merged = new List<string>(word.Count);
            var position = 0;
            while (position < word.Count)
            {
                var hit = word.IndexOf(bestFirst, position);
                if (hit < 0)
                {
                    merged.AddRange(word.GetRange(position, word.Count - position));
                    break;
                }

                merged.AddRange(word.GetRange(position, hit - position));
                position = hit;

                if (word[position] == bestFirst
                    && position < word.Count - 1
                    && word[position + 1] == bestSecond)
                {
                    merged.Add(bestFirst + bestSecond);
                    position += 2;
                }
                else
                {
                    merged.Add(word[position]);
                    position++;
                }
            }

            word = merged;
            if (word.Count == 1)
            {
                break;
            }

            pairs = GetPairs(word);
        }

        // "@@ ".join(word) rồi bỏ 4 ký tự cuối — chính là bỏ "</w>" của mảnh cuối cùng.
        var joined = string.Join(ContinuationSuffix + " ", word);
        var result = joined.Length >= EndOfWordSuffix.Length
            ? joined[..^EndOfWordSuffix.Length]
            : joined;

        bpeCache[token] = result;
        return result;
    }

    private static HashSet<(string First, string Second)> GetPairs(List<string> word)
    {
        var pairs = new HashSet<(string, string)>();
        for (var i = 1; i < word.Count; i++)
        {
            pairs.Add((word[i - 1], word[i]));
        }

        return pairs;
    }

    private static int IndexOf(List<string> word, string value, int start)
    {
        for (var i = start; i < word.Count; i++)
        {
            if (string.Equals(word[i], value, StringComparison.Ordinal))
            {
                return i;
            }
        }

        return -1;
    }
}
