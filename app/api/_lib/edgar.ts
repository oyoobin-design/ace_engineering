// 공통 SEC EDGAR XBRL 유틸리티

export type EdgarFact = { end: string; val: number; form: string; fp?: string; start?: string };

export const EDGAR_HEADERS = { "User-Agent": "ace-biz-dashboard oyoobin@gmail.com" };

export function isSingleQuarter(f: EdgarFact) {
  if (!f.start) return false;
  const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
  return days >= 75 && days <= 100;
}

export function isFiscalYear(f: EdgarFact) {
  if (!f.start) return false;
  const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
  return days >= 350 && days <= 380;
}

export function dedupByEnd(arr: EdgarFact[]): EdgarFact[] {
  return arr.reduce<EdgarFact[]>((acc, cur) => {
    const last = acc[acc.length - 1];
    if (last?.end === cur.end) acc[acc.length - 1] = cur;
    else acc.push(cur);
    return acc;
  }, []);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Revenue 필드 우선순위 탐색
const REVENUE_PRIORITY = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
] as const;

export function pickRevenueFacts(gaap: Record<string, { units?: { USD?: EdgarFact[] } }>): EdgarFact[] {
  for (const field of REVENUE_PRIORITY) {
    const facts = gaap[field]?.units?.USD;
    if (facts?.length) return facts;
  }
  // 폴백: "Revenue" 포함된 첫 번째 필드
  const fallbackKey = Object.keys(gaap).find(k => k.includes("Revenue") && gaap[k]?.units?.USD?.length);
  if (fallbackKey) return gaap[fallbackKey]!.units!.USD!;
  return [];
}

// 백로그 필드 탐색 — 없으면 null 반환
export function pickBacklogFacts(gaap: Record<string, { units?: { USD?: EdgarFact[] } }>): EdgarFact[] | null {
  const facts = gaap.RevenueRemainingPerformanceObligation?.units?.USD;
  return facts?.length ? facts : null;
}

// 최신 공시 문서 텍스트 fetch (보도자료 파싱용)
// cikPadded 형식: "CIK0001375877"
export async function fetchLatestFilingText(cikPadded: string, formType: string): Promise<string> {
  try {
    const submUrl = `https://data.sec.gov/submissions/${cikPadded}.json`;
    const submRes = await fetch(submUrl, { headers: EDGAR_HEADERS, signal: AbortSignal.timeout(8000) });
    if (!submRes.ok) return "";
    const subm = await submRes.json();
    const { form, accessionNumber, primaryDocument } = subm.filings?.recent ?? {};
    if (!form) return "";

    const idx = (form as string[]).findIndex((f: string) => f === formType);
    if (idx === -1) return "";

    const numericCik = cikPadded.replace(/^CIK0*/, "");
    const acc = (accessionNumber as string[])[idx];
    const accNoDash = acc.replace(/-/g, "");
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNoDash}/${(primaryDocument as string[])[idx]}`;

    const docRes = await fetch(docUrl, {
      headers: { ...EDGAR_HEADERS, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(10000),
    });
    if (!docRes.ok) return "";
    return stripHtml(await docRes.text());
  } catch {
    return "";
  }
}
