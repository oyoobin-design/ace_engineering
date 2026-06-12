// NextResponse unused — SSE uses native Response
import OpenAI from "openai";

export const runtime = "nodejs";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  outlet: string;
  reason?: string;
  lowRelevance?: boolean;
};

const CREDIBLE_SITES = "site:reuters.com OR site:apnews.com OR site:cnbc.com OR site:bloomberg.com OR site:ft.com OR site:theguardian.com OR site:wsj.com OR site:axios.com OR site:politico.com";

const OVERSEAS_FEEDS = [
  // ── ESS 전문 B2B 미디어 (업계 표준 공신력) ─────────────────
  { url: "https://www.energy-storage.news/feed/", outlet: "Energy-Storage.News" },
  { url: "https://www.ess-news.com/feed/",        outlet: "ESS News" },
  { url: "https://www.pv-tech.org/feed/",         outlet: "PV Tech" },

  // ── 메이저 금융·종합 언론사 (✅ 작동 확인) ─────────────────
  { url: "https://feeds.bloomberg.com/markets/news.rss",                  outlet: "Bloomberg" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",                 outlet: "WSJ" },        // 월스트리트저널
  { url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml",                   outlet: "WSJ" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml",                outlet: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", outlet: "BBC News" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml",              outlet: "BBC News" },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", outlet: "CNBC" },
  { url: "https://www.theguardian.com/environment/rss", outlet: "The Guardian" },
  { url: "https://www.theguardian.com/business/rss",    outlet: "The Guardian" },

  // ── awesome-rss-feeds ⭐2.4k 출처 (✅ 작동 확인) ────────────────
  { url: "https://www.forbes.com/business/feed/",          outlet: "Forbes" },
  { url: "https://www.investing.com/rss/news.rss",         outlet: "Investing.com" },

  // ── 에너지·전력 특화 (✅ 작동 확인) ─────────────────────────
  { url: "https://www.eia.gov/rss/todayinenergy.xml",      outlet: "EIA" },           // 미국 에너지부 공식
  { url: "https://www.utilitydive.com/feeds/news/",        outlet: "Utility Dive" },  // 전력·그리드·ESS 전문
  { url: "https://www.cleanegroup.org/feed/",              outlet: "Clean Energy Group" },
  { url: "https://batterypoweronline.com/feed/",           outlet: "Battery Power Online" },
  { url: "https://energy.mit.edu/news/feed",               outlet: "MIT Energy" },

  // AP News: 공식 RSS 폐지됨 → Google News site: 필터로 대체
  // Reuters: 공식 RSS 폐지됨 → Google News site: 필터로 대체

  // ── Google News + 공신력 언론사 site: 필터 ─────────────────
  {
    url: `https://news.google.com/rss/search?q=battery+energy+storage+ESS+(${CREDIBLE_SITES})&hl=en-US&gl=US&ceid=US:en`,
    outlet: "Reuters·Bloomberg·CNBC",
  },
  {
    url: `https://news.google.com/rss/search?q=IRA+clean+energy+battery+storage+policy+(${CREDIBLE_SITES})&hl=en-US&gl=US&ceid=US:en`,
    outlet: "Reuters·Bloomberg·CNBC",
  },
  {
    url: `https://news.google.com/rss/search?q=Fluence+energy+BESS+data+center+power+(${CREDIBLE_SITES})&hl=en-US&gl=US&ceid=US:en`,
    outlet: "Reuters·Bloomberg·CNBC",
  },
];

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ACE_EMBEDDING_CONTEXT = `
ACE Engineering ESS enclosure battery container energy storage system manufacturer Korea.
Fluence Energy AES Canadian Solar Bloom Energy Siemens ABB supply chain partner. CATL Sungrow BYD competitor customer. IRA clean energy policy battery.
24/7 CFE carbon neutral data center power storage. Long duration battery BESS grid stability.
Japan Spain new market export. TLS Rittal competitor enclosure manufacturing.
`.trim();

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchRSS(url: string, outlet: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS-Reader/1.0)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    const since = Date.now() - 24 * 60 * 60 * 1000;

    for (const m of matches) {
      const b = m[1];
      const rawTitle =
        b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
        b.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const title = decodeHtmlEntities(rawTitle);
      const rawLink =
        b.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1] ??
        b.match(/<link>(.*?)<\/link>/)?.[1] ??
        b.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? "";
      const link = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
      const source = b.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? outlet;
      const pubDate = b.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const t = new Date(pubDate).getTime();

      if (title && !isNaN(t) && t >= since) {
        items.push({ title, link, pubDate, outlet: source });
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function filterByEmbedding(items: NewsItem[]): Promise<NewsItem[]> {
  if (items.length === 0) return [];
  const texts = [ACE_EMBEDDING_CONTEXT, ...items.map(i => i.title)];
  const res = await client.embeddings.create({ model: "text-embedding-3-small", input: texts });
  const [aceVec, ...vecs] = res.data.map(d => d.embedding);

  function cosine(a: number[], b: number[]): number {
    const dot = a.reduce((s, v, i) => s + v * b[i], 0);
    const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return na && nb ? dot / (na * nb) : 0;
  }

  const scored = items.map((item, i) => ({ item, score: cosine(aceVec, vecs[i]) }));
  let passed = scored.filter(s => s.score >= 0.25);
  if (passed.length < 5) passed = scored.filter(s => s.score >= 0.18);

  return passed.sort((a, b) => b.score - a.score).map(s => s.item);
}

async function filterByGPT(items: NewsItem[]): Promise<NewsItem[]> {
  if (items.length === 0) return [];

  const batchSize = 30;
  const batches: NewsItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));

  const results = await Promise.all(batches.map(async (batch, idx) => {
    const offset = idx * batchSize;
    const titlesText = batch.map((item, i) => `${offset + i}: ${item.title}`).join("\n");

    const prompt = `
너는 에이스엔지니어링 사업기획팀 담당자다.
에이스엔지니어링 = ESS 인클로저(배터리 외함) 제조사. 주고객: Fluence Energy. 경쟁사: CATL, Sungrow, BYD, TLS Energy, Rittal.

아래 영문 기사 제목 중 관련 있는 기사를 골라라 (포용적 기준):
- 배터리·에너지저장장치(BESS) 프로젝트, 유틸리티 규모 배터리
- ESS 인클로저·컨테이너·열관리
- IRA·클린에너지 정책·탄소규제·24/7 CFE
- Fluence, CATL, Sungrow, BYD, TLS Energy 동향
- 데이터센터 전력·AI 인프라 에너지 수요
- 장주기 에너지저장(LDES), 플로우배터리
- 재생에너지 + 저장 통합
- 배터리 제조·공급망·리튬 가격

제외: 암호화폐, 일반 소비자 가전, 자동차(저장장치 무관), 스포츠, 연예

기사 목록:
${titlesText}

선택한 각 기사에 대해 제목의 구체적 사실(MW/GWh 숫자, 회사명, 국가, 기술)을 활용해 **한국어**로 reason을 작성하라.
에이스 비즈니스와의 연결고리를 구체적으로 서술.

좋은 예: "Fluence 텍사스 500MWh BESS 수주 → 에이스 인클로저 직접 발주 가능성"
나쁜 예: "배터리 저장 프로젝트라 에이스 시장에 관련됨"

JSON 형식으로만 응답:
{"results": [{"index": 0, "reason": "호주 5.3GWh LDES 수주 → 대형 인클로저 수요 신호"}, ...]}`.trim();

    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
      return (parsed.results ?? []) as { index: number; reason: string }[];
    } catch (e) {
      console.error(`[overseas GPT ${idx}]`, e);
      return [];
    }
  }));

  const finalItems = results.flat()
    .filter(r => r.index >= 0 && r.index < items.length)
    .map(r => ({ ...items[r.index], reason: r.reason }));

  if (finalItems.length === 0) {
    return items.slice(0, 3).map(item => ({
      ...item,
      reason: "⚠️ No strong ESS match today — top similarity result",
      lowRelevance: true,
    }));
  }
  return finalItems;
}

let _cache: { data: Record<string, unknown>; ts: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      if (_cache && Date.now() - _cache.ts < CACHE_MS) {
        send({ stage: "done", ..._cache.data });
        controller.close();
        return;
      }

      try {
        send({ stage: "collecting", message: "해외 RSS 수집 중..." });

        const seen = new Set<string>();
        const allItems = (
          await Promise.all(OVERSEAS_FEEDS.map(f => fetchRSS(f.url, f.outlet)))
        ).flat().filter(item => {
          const key = item.link || item.title.slice(0, 35);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        send({ stage: "filtering", message: `${allItems.length}건 AI 관련성 분석 중...`, scanned: allItems.length, pct: 35 });

        const embeddingFiltered = await filterByEmbedding(allItems);

        send({ stage: "gpt", message: `${embeddingFiltered.length}건 GPT 선별 중...`, scanned: allItems.length, pct: 70 });

        const finalItems = await filterByGPT(embeddingFiltered);

        const result = {
          items: finalItems,
          scanned: allItems.length,
          afterEmbedding: embeddingFiltered.length,
        };
        _cache = { data: result, ts: Date.now() };
        send({ stage: "done", ...result });
      } catch (e) {
        send({ stage: "error", message: String(e) });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
