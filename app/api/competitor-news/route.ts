import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type EventType = "수주" | "신제품" | "파트너십" | "공장·생산" | "규제·정책" | "재무" | "기타";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  outlet: string;
  eventType: EventType;
};

function classifyEvent(title: string): EventType {
  if (/수주|낙찰|계약|award|contract|mwh|gwh|bid|tender|procurement|offtake/i.test(title)) return "수주";
  if (/신제품|출시|론칭|공개|발표|new.*product|launch|unveil|introduc|release/i.test(title)) return "신제품";
  if (/파트너십|제휴|협력|협약|mou|partnership|collaborat|joint|alliance/i.test(title)) return "파트너십";
  if (/공장|생산|제조|설비|증설|건설|factory|plant|manufactur|capacity|expansion|facility/i.test(title)) return "공장·생산";
  if (/ira|규제|정책|법안|보조금|세액|관세|regulation|policy|subsid|tariff|incentive|legislat/i.test(title)) return "규제·정책";
  if (/매출|수익|실적|분기|연간|인수|합병|revenue|profit|earnings|quarter|annual|acqui|merger|ipo/i.test(title)) return "재무";
  return "기타";
}

// 경쟁사별 구글 뉴스 검색어 (한/영 병행)
const COMPETITOR_QUERIES: Record<string, string> = {
  tls:      "TLS Energy enclosure battery storage",
  rittal:   "Rittal battery energy storage enclosure",
  sungshin: "신성에스티 ESS 에너지저장 배터리",
  texson:   "텍슨 ESS 에너지저장",
  catl:     "CATL enclosure battery storage ESS 2025",
  sungrow:  "Sungrow 선그로우 ESS enclosure",
  byd:      "BYD energy storage enclosure ESS",
  fluence:  "Fluence Energy FLNC ESS project",
};

async function fetchGoogleNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 }, // 1시간 캐시
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS-Reader/1.0)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

    for (const m of matches) {
      const b = m[1];
      const title =
        b.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
        b.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
      const rawLink =
        b.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/)?.[1] ??
        b.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const link = rawLink.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
      const pubDate = b.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const source =
        b.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? "Google News";

      // 24시간 이내만
      const t = new Date(pubDate).getTime();
      const since = Date.now() - 24 * 60 * 60 * 1000;
      if (title.trim() && t >= since) {
        items.push({ title: title.trim(), link, pubDate, outlet: source, eventType: classifyEvent(title.trim()) });
      }
      if (items.length >= 5) break;
    }
    return items;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const competitor = req.nextUrl.searchParams.get("competitor") ?? "fluence";
  const query = COMPETITOR_QUERIES[competitor];

  if (!query) {
    return NextResponse.json({ items: [], error: "Unknown competitor" }, { status: 400 });
  }

  const items = await fetchGoogleNews(query);
  return NextResponse.json({ items });
}
