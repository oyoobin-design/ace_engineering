import { NextResponse } from "next/server";
import {
  EDGAR_HEADERS, EdgarFact,
  isSingleQuarter, isFiscalYear, dedupByEnd,
  pickRevenueFacts, pickBacklogFacts, fetchLatestFilingText,
} from "../_lib/edgar";

export const runtime = "nodejs";

const CIK_PADDED = "CIK0001375877";
const EDGAR_URL  = `https://data.sec.gov/api/xbrl/companyfacts/${CIK_PADDED}.json`;

// 6-K 보도자료에서 e-STORAGE 백로그 파싱
async function fetchBacklogFromPressRelease(): Promise<number | null> {
  const text = await fetchLatestFilingText(CIK_PADDED, "6-K");
  if (!text) return null;
  const m = text.match(/e-STORAGE[^$]*\$(\d+\.?\d*)\s*billion/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * 1000); // billion → M
}

export async function GET() {
  try {
    const [xbrlRes, pressBacklogM] = await Promise.all([
      fetch(EDGAR_URL, { headers: EDGAR_HEADERS, next: { revalidate: 86400 } }),
      fetchBacklogFromPressRelease(),
    ]);
    if (!xbrlRes.ok) throw new Error(`EDGAR HTTP ${xbrlRes.status}`);
    const json = await xbrlRes.json();
    const gaap = json.facts?.["us-gaap"];
    if (!gaap) throw new Error("us-gaap facts not found");

    const revFacts = pickRevenueFacts(gaap);

    const quarterlyRev = dedupByEnd(
      revFacts.filter(isSingleQuarter).sort((a, b) => a.end.localeCompare(b.end))
    ).slice(-8).map((f: EdgarFact) => ({ period: f.end.slice(0, 7), revM: Math.round(f.val / 1_000_000) }));

    // Canadian Solar은 외국사모(FPI) → 20-F 포함
    const annualRev = dedupByEnd(
      revFacts.filter((f: EdgarFact) => (f.form === "10-K" || f.form === "20-F") && isFiscalYear(f))
        .sort((a: EdgarFact, b: EdgarFact) => a.end.localeCompare(b.end))
    ).map((f: EdgarFact) => ({ fy: `FY${new Date(f.end).getFullYear()}`, end: f.end.slice(0, 7), revM: Math.round(f.val / 1_000_000) }));

    // 백로그: 보도자료 우선, 없으면 XBRL fallback
    const backlogFacts = pickBacklogFacts(gaap);
    const xbrlBacklog = backlogFacts
      ? dedupByEnd(
          backlogFacts.filter((f: EdgarFact) => f.form === "10-Q" || f.form === "20-F" || f.form === "6-K")
            .sort((a: EdgarFact, b: EdgarFact) => a.end.localeCompare(b.end))
        ).slice(-10).map((f: EdgarFact) => ({ period: f.end.slice(0, 7), backlogM: Math.round(f.val / 1_000_000) }))
      : [];

    const today = new Date().toISOString().slice(0, 7);
    const backlog = pressBacklogM != null
      ? [{ period: today, backlogM: pressBacklogM }]  // 보도자료 값으로 덮어쓰기
      : xbrlBacklog;

    const latestBacklog = backlog[backlog.length - 1];
    const latestRev     = quarterlyRev[quarterlyRev.length - 1];

    return NextResponse.json({
      source: "sec-edgar", entity: "Canadian Solar Inc. (CSIQ)", cik: CIK_PADDED,
      asOf: new Date().toISOString().slice(0, 10),
      summary: {
        latestBacklogM: latestBacklog?.backlogM ?? null,
        latestBacklogPeriod: latestBacklog?.period ?? null,
        latestQuarterRevM: latestRev?.revM ?? null,
        latestQuarterPeriod: latestRev?.period ?? null,
      },
      quarterlyRev, annualRev, backlog,
      note: "출처: SEC EDGAR XBRL. Canadian Solar 회계연도 12월 기준.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
