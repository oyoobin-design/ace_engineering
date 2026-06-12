import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  outlet: string;
  reason?: string;
};

// ─── 언론사별 RSS 피드 ────────────────────────────────────────────
const OUTLET_FEEDS: Record<string, { url: string }[]> = {
  매일경제: [
    { url: "https://www.mk.co.kr/rss/30100041/" },
    { url: "https://www.mk.co.kr/rss/50100032/" },
    { url: "https://www.mk.co.kr/rss/30300018/" },
  ],
  한국경제: [
    { url: "https://www.hankyung.com/feed/economy" },
    { url: "https://www.hankyung.com/feed/it" },
    { url: "https://www.hankyung.com/feed/international" },
  ],
  연합뉴스: [
    { url: "https://www.yna.co.kr/rss/economy.xml" },
    { url: "https://www.yna.co.kr/rss/industry.xml" },
    { url: "https://www.yna.co.kr/rss/international.xml" },
  ],
  전자신문: [
    { url: "http://rss.etnews.com/06.xml" },
    { url: "http://rss.etnews.com/04046.xml" },
    { url: "http://rss.etnews.com/22210.xml" },
    { url: "http://rss.etnews.com/12.xml" },
  ],
  // ── knews-rss ⭐60 — 한겨레·경향·미디어오늘 등 멀티소스 집계 ──
  knews기술: [
    { url: "https://akngs.github.io/knews-rss/categories/tech.xml" },
  ],
  동아일보: [
    { url: "http://rss.donga.com/economy.xml" },
  ],
};

// ─── 에이스엔지니어링 맥락 (임베딩 기준점) ───────────────────────
const ACE_CONTEXT_FOR_EMBEDDING = `
ACE Engineering ESS enclosure container manufacturer.
Battery cell module pack rack ESS enclosure full process design manufacturing.
Cell packaging prismatic cylindrical pouch module assembly battery rack integration.
Battery energy storage system BESS steel housing fabrication.
Utility-scale grid-scale containerized energy storage turnkey solution.
Fluence Energy AES Canadian Solar Bloom Energy Siemens ABB supply chain partner.
CATL BYD Sungrow TLS Energy Rittal Shinsung EST competitor.
IRA inflation reduction act domestic content tariff trade policy.
Battery fire suppression NFPA thermal management HVAC cooling.
ESS project pipeline gigawatt-hour deployment order backlog.
AI data center liquid cooling server GPU thermal container module.
Powin bankruptcy customer concentration risk revenue impact.
Renewable energy solar wind storage integration grid stability.
Korean manufacturer export B2B ESS integrator procurement.
`.trim();


const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── HTML 엔티티 디코딩 ─────────────────────────────────────────
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

// ─── RSS 파싱 ────────────────────────────────────────────────────
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

    for (const m of matches) {
      const b = m[1];
      const rawTitle =
        b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
        b.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const title = decodeHtmlEntities(rawTitle);
      const rawLink =
        b.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1] ??
        b.match(/<link>(.*?)<\/link>/)?.[1] ??
        b.match(/<guid[^>]*><!\[CDATA\[(.*?)\]\]><\/guid>/)?.[1] ??
        b.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] ?? "";
      const link = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
      const pubDate = b.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

      const isPaywall =
        link.includes("plus.hankyung.com") ||
        link.includes("premium.hankyung.com") ||
        link.includes("member.hankyung.com") ||
        link.includes("plus.mk.co.kr") ||
        link.includes("vip.mk.co.kr");

      const since = Date.now() - 24 * 60 * 60 * 1000;
      const t = new Date(pubDate).getTime();

      if (title && !isPaywall && !isNaN(t) && t >= since) {
        items.push({ title, link, pubDate, outlet });
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── KOTRA 해외시장뉴스 API ──────────────────────────────────────
const KOTRA_NEWS_URL =
  "https://apis.data.go.kr/B410001/kotra_overseasMarketNews/ovseaMrktNews/ovseaMrktNews";

async function fetchKOTRANews(): Promise<NewsItem[]> {
  const key = process.env.KOTRA_API_KEY;
  if (!key) return [];
  try {
    const url = `${KOTRA_NEWS_URL}?serviceKey=${key}&numOfRows=100&pageNo=1`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const json = await res.json();
    const items: unknown[] = json?.response?.body?.itemList?.item ?? [];
    if (!Array.isArray(items)) return [];

    const since = Date.now() - 24 * 60 * 60 * 1000;

    return items
      .filter((it: unknown) => {
        const d = it as Record<string, string>;
        const t = new Date(d.othbcDt).getTime();
        return !isNaN(t) && t >= since;
      })
      .map((it: unknown) => {
        const d = it as Record<string, string>;
        return {
          title: d.newsTitl ?? "",
          link: d.kotraNewsUrl ?? "",
          pubDate: new Date(d.othbcDt).toISOString(),
          outlet: `KOTRA(${d.ovrofInfo ?? "무역관"})`,
        };
      });
  } catch {
    return [];
  }
}

// ─── KOTRA 미국 글로벌 이슈 API ─────────────────────────────────
const KOTRA_ISSUE_URL =
  "https://apis.data.go.kr/B410001/usaGlobalIssueMonitoring/getUsaGlobalIssueMonitoring";

async function fetchKOTRAIssue(): Promise<NewsItem[]> {
  const key = process.env.KOTRA_API_KEY;
  if (!key) return [];
  try {
    const url = `${KOTRA_ISSUE_URL}?serviceKey=${key}&numOfRows=100&pageNo=1`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return [];
    const json = await res.json();
    const items: unknown[] = json?.response?.body?.itemList?.item ?? [];
    if (!Array.isArray(items)) return [];

    const since = Date.now() - 24 * 60 * 60 * 1000;

    return items
      .filter((it: unknown) => {
        const d = it as Record<string, string>;
        const t = new Date(d.othbcDt).getTime();
        return !isNaN(t) && t >= since;
      })
      .map((it: unknown) => {
        const d = it as Record<string, string>;
        const summary = (d.smmarCn ?? "")
          .replace(/&[a-zA-Z#0-9]+;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 200);
        return {
          title: d.nttSj ?? "",
          link: d.fileLink ?? "",
          pubDate: new Date(d.othbcDt).toISOString(),
          outlet: "KOTRA이슈",
          reason: summary || undefined,
        };
      });
  } catch {
    return [];
  }
}

// ─── Step 1: 임베딩으로 의미 유사도 필터 ────────────────────────
const SIMILARITY_THRESHOLD = 0.30; // 기본 임계값 (짧은 제목 특성상 낮게 설정)
const SIMILARITY_FALLBACK  = 0.25; // 결과 5개 미만일 때 완화 임계값
const MIN_RESULTS = 5;

async function filterByEmbedding(items: NewsItem[]): Promise<NewsItem[]> {
  const validItems = items.filter(i => i.title.trim().length > 0);
  if (validItems.length === 0) return [];

  const texts = [ACE_CONTEXT_FOR_EMBEDDING, ...validItems.map(i => i.title)];

  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  const [aceVec, ...articleVecs] = res.data.map(d => d.embedding);

  function cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return normA && normB ? dot / (normA * normB) : 0;
  }

  const scored = validItems.map((item, i) => ({
    item,
    score: cosineSimilarity(aceVec, articleVecs[i]) + (item.title.includes("단독") ? 0.05 : 0),
  }));

  // 기본 임계값으로 필터
  let passed = scored.filter(s => s.score >= SIMILARITY_THRESHOLD);

  // 결과 부족 시 임계값 완화 (조용한 뉴스 날 대비)
  if (passed.length < MIN_RESULTS) {
    passed = scored.filter(s => s.score >= SIMILARITY_FALLBACK);
  }

  return passed
    .sort((a, b) => b.score - a.score)
    .map(s => s.item);
}

// ─── Step 2: GPT 배치 처리로 최종 선별 ─────────────────────────
async function filterByGPTBatch(items: NewsItem[], batchSize = 30): Promise<NewsItem[]> {
  if (items.length === 0) return [];

  // 30개씩 자르기 → 배치 수는 기사 수에 따라 자동 결정
  const batches: NewsItem[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // 모든 배치 동시 실행
  const batchResults = await Promise.all(
    batches.map(async (batch, batchIdx) => {
      const offset = batchIdx * batchSize;
      const titlesText = batch.map((item, i) => `${offset + i}: ${item.title}`).join("\n");

      const prompt = `
너는 에이스엔지니어링 사업기획팀 담당자다.
에이스엔지니어링 = ESS 인클로저(배터리 외함) 제조사. 매출 90% 해외. 주고객: Fluence Energy(미국).

아래 뉴스 제목 중 **직접적으로** 관련 있는 기사만 골라라. 관련성이 애매하면 제외하라.

[포함 기준 — 아래 중 하나라도 해당하면 포함]
- ESS·배터리·에너지저장장치 언급
- 재생에너지·태양광·풍력 + 저장 또는 그리드 안정화
- 에이스 고객사 (Fluence) 또는 경쟁사 (CATL, 신성에스티, TLS, Rittal) 동향
- 미국 IRA·관세·무역정책이 제조업·에너지 산업에 미치는 영향
- EU·미국·일본·스페인의 에너지 정책·탄소 규제
- AI 데이터센터 전력 수요·냉각·전력 인프라
- 리튬·코발트·철강 원자재 가격 동향
- 한국 제조업체의 미국·유럽·일본 수출 동향 (ESS 관련 업종)
- 글로벌 전력망·에너지 인프라 투자

[제외 기준 — 아래에 해당하면 제외]
- 바이오·의약·헬스케어·안과·식품·농업
- 부동산·금융·보험·키즈·소비재·패션
- 연예·스포츠·날씨·사건사고
- ESS·에너지와 전혀 무관한 단순 중소기업 지원 정책
- 에너지와 무관한 업종의 해외 진출 뉴스

[뉴스 목록]
${titlesText}

JSON 형식으로만 응답하라. 이유는 에이스 비즈니스와 구체적 연결고리로:
{"results": [{"index": 0, "reason": "미국 IRA 배터리 세액공제 변동 → Fluence 수주 영향 → 에이스 발주량 직결"}, ...]}`.trim();

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
        console.error(`[GPT batch ${batchIdx}] error:`, e);
        return [];
      }
    })
  );

  // 결과 합치기
  return batchResults.flat()
    .filter(r => r.index >= 0 && r.index < items.length)
    .map(r => ({ ...items[r.index], reason: r.reason }));
}

// ─── 서버 인메모리 캐시 (OpenAI 이중 호출 방지) ─────────────────
let _cache: { data: Record<string, unknown>; ts: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

// ─── 메인 핸들러 (SSE 스트리밍) ──────────────────────────────────
export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client disconnected */ }
      };

      // 캐시 히트 → 즉시 반환
      if (_cache && Date.now() - _cache.ts < CACHE_MS) {
        send({ stage: "done", ..._cache.data });
        controller.close();
        return;
      }

      try {
        const since = Date.now() - 24 * 60 * 60 * 1000;

        send({ stage: "collecting", message: "RSS · KOTRA 수집 중..." });

        const [perOutlet, kotraNewsItems, kotraIssueItems] = await Promise.all([
          Promise.all(
            Object.entries(OUTLET_FEEDS).map(async ([outletName, feeds]) => {
              const items = (
                await Promise.all(feeds.map(f => fetchRSS(f.url, outletName)))
              ).flat();
              return items.filter(item => {
                const t = new Date(item.pubDate).getTime();
                return !isNaN(t) && t >= since;
              });
            })
          ),
          fetchKOTRANews(),
          fetchKOTRAIssue(),
        ]);

        const seen = new Set<string>();
        const allItems = [...perOutlet.flat(), ...kotraNewsItems].filter(item => {
          const key = item.link || item.title.slice(0, 30);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        send({ stage: "filtering", message: `${allItems.length}건 AI 관련성 분석 중...`, scanned: allItems.length, pct: 30 });

        const embeddingFiltered = await filterByEmbedding(allItems);
        const batchCount = Math.ceil(embeddingFiltered.length / 30);

        send({ stage: "gpt", message: `${embeddingFiltered.length}건 GPT 선별 중... (${batchCount}배치)`, scanned: allItems.length, pct: 65 });

        const finalItems = await filterByGPTBatch(embeddingFiltered, 30);

        const gptItems = finalItems.length > 0
          ? finalItems
          : embeddingFiltered.slice(0, 3).map(item => ({
              ...item,
              reason: "⚠️ 오늘 ESS 직접 관련 기사 없음 — 임베딩 유사도 상위 기사",
              lowRelevance: true,
            }));

        const items = [...gptItems, ...kotraIssueItems];

        const result = {
          items,
          scanned: allItems.length,
          afterEmbedding: embeddingFiltered.length,
          batches: batchCount,
          byOutlet: {
            ...Object.fromEntries(Object.keys(OUTLET_FEEDS).map((name, i) => [name, perOutlet[i].length])),
            KOTRA해외뉴스: kotraNewsItems.length,
            KOTRA이슈: kotraIssueItems.length,
          },
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
