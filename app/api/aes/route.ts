import { NextResponse } from "next/server";
import {
  EDGAR_HEADERS, EdgarFact,
  isSingleQuarter, isFiscalYear, dedupByEnd,
  pickRevenueFacts, fetchLatestFilingText,
} from "../_lib/edgar";

export const runtime = "nodejs";

const CIK_PADDED = "CIK0000874761";
const EDGAR_URL  = `https://data.sec.gov/api/xbrl/companyfacts/${CIK_PADDED}.json`;

// 8-K 보도자료에서 PPA 백로그(GW) 파싱
async function fetchBacklogGWFromPressRelease(): Promise<number | null> {
  const text = await fetchLatestFilingText(CIK_PADDED, "8-K");
  if (!text) return null;
  const m = text.match(/backlog[^0-9]*(\d+\.?\d*)\s*GW/i);
  if (!m) return null;
  return parseFloat(m[1]);
}

export async function GET() {
  try {
    const [xbrlRes, backlogGW] = await Promise.all([
      fetch(EDGAR_URL, { headers: EDGAR_HEADERS, next: { revalidate: 86400 } }),
      fetchBacklogGWFromPressRelease(),
    ]);
    if (!xbrlRes.ok) throw new Error(`EDGAR HTTP ${xbrlRes.status}`);
    const json = await xbrlRes.json();
    const gaap = json.facts?.["us-gaap"];
    if (!gaap) throw new Error("us-gaap facts not found");

    const revFacts = pickRevenueFacts(gaap);

    const quarterlyRev = dedupByEnd(
      revFacts.filter(isSingleQuarter).sort((a, b) => a.end.localeCompare(b.end))
    ).slice(-8).map((f: EdgarFact) => ({ period: f.end.slice(0, 7), revM: Math.round(f.val / 1_000_000) }));

    const annualRev = dedupByEnd(
      revFacts.filter((f: EdgarFact) => f.form === "10-K" && isFiscalYear(f))
        .sort((a: EdgarFact, b: EdgarFact) => a.end.localeCompare(b.end))
    ).map((f: EdgarFact) => ({ fy: `FY${new Date(f.end).getFullYear()}`, end: f.end.slice(0, 7), revM: Math.round(f.val / 1_000_000) }));

    const latestRev = quarterlyRev[quarterlyRev.length - 1];

    return NextResponse.json({
      source: "sec-edgar", entity: "The AES Corporation (AES)", cik: CIK_PADDED,
      asOf: new Date().toISOString().slice(0, 10),
      summary: {
        latestBacklogM: null,            // AES 백로그는 GW 단위 — 달러 환산 불가
        latestBacklogPeriod: null,
        latestBacklogGW: backlogGW,      // GW 값 (파싱 실패 시 null)
        latestQuarterRevM: latestRev?.revM ?? null,
        latestQuarterPeriod: latestRev?.period ?? null,
      },
      quarterlyRev, annualRev, backlog: [],
      note: "출처: SEC EDGAR XBRL. AES 회계연도 12월 기준.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
