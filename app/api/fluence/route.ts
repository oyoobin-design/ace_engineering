import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Fluence Energy (FLNC) 재무 데이터 — SEC EDGAR 공식 API (무료, 키 없음)
 * CIK: 0001868941
 * 출처: https://data.sec.gov/api/xbrl/companyfacts/CIK0001868941.json
 *
 * 에이스엔지니어링 사업기획 관점 활용:
 * - 매출(Revenue): Fluence가 실제로 납품한 규모 → 에이스 과거 발주 추정
 * - 백로그(Backlog): 아직 납품 안 된 수주잔고 → 에이스 향후 발주 예측
 */

const EDGAR_URL =
  "https://data.sec.gov/api/xbrl/companyfacts/CIK0001868941.json";

type EdgarFact = {
  end: string;
  val: number;
  form: string;
  fp?: string;
  start?: string;
};

/** 분기 단일 기간 필터 (YTD 누계 제거): start~end 가 80~100일이면 단일 분기 */
function isSingleQuarter(f: EdgarFact) {
  if (!f.start) return false;
  const days =
    (new Date(f.end).getTime() - new Date(f.start).getTime()) /
    86400000;
  return days >= 75 && days <= 100;
}

/** 연간 기간 필터: start~end 가 350~380일 */
function isFiscalYear(f: EdgarFact) {
  if (!f.start) return false;
  const days =
    (new Date(f.end).getTime() - new Date(f.start).getTime()) /
    86400000;
  return days >= 350 && days <= 380;
}

export async function GET() {
  try {
    const res = await fetch(EDGAR_URL, {
      headers: { "User-Agent": "ace-biz-dashboard oyoobin@gmail.com" },
      next: { revalidate: 86400 }, // 24시간 캐시
    });

    if (!res.ok) throw new Error(`EDGAR HTTP ${res.status}`);
    const json = await res.json();
    const gaap = json.facts?.["us-gaap"];
    if (!gaap) throw new Error("us-gaap facts not found");

    // ── 분기 매출 ──────────────────────────────────────────
    const revFacts: EdgarFact[] =
      gaap.RevenueFromContractWithCustomerExcludingAssessedTax?.units?.USD ?? [];

    const quarterlyRev = revFacts
      .filter(isSingleQuarter)
      .sort((a, b) => a.end.localeCompare(b.end))
      .reduce<EdgarFact[]>((acc, cur) => {
        // 같은 end 날짜 중복 제거 (최신 filing 우선)
        const last = acc[acc.length - 1];
        if (last?.end === cur.end) acc[acc.length - 1] = cur;
        else acc.push(cur);
        return acc;
      }, [])
      .slice(-8) // 최근 8분기
      .map((f) => ({
        period: f.end.slice(0, 7), // "YYYY-MM"
        revM: Math.round(f.val / 1_000_000),
      }));

    // ── 연간 매출 ──────────────────────────────────────────
    const annualRev = revFacts
      .filter((f) => f.form === "10-K" && isFiscalYear(f))
      .sort((a, b) => a.end.localeCompare(b.end))
      .reduce<EdgarFact[]>((acc, cur) => {
        const last = acc[acc.length - 1];
        if (last?.end === cur.end) acc[acc.length - 1] = cur;
        else acc.push(cur);
        return acc;
      }, [])
      .map((f) => ({
        fy: `FY${new Date(f.end).getFullYear()}`,
        end: f.end.slice(0, 7),
        revM: Math.round(f.val / 1_000_000),
      }));

    // ── 백로그 (수주잔고) ──────────────────────────────────
    const backlogFacts: EdgarFact[] =
      gaap.RevenueRemainingPerformanceObligation?.units?.USD ?? [];

    const backlog = backlogFacts
      .filter((f) => f.form === "10-Q" || f.form === "10-K")
      .sort((a, b) => a.end.localeCompare(b.end))
      .reduce<EdgarFact[]>((acc, cur) => {
        const last = acc[acc.length - 1];
        if (last?.end === cur.end) acc[acc.length - 1] = cur;
        else acc.push(cur);
        return acc;
      }, [])
      .slice(-10)
      .map((f) => ({
        period: f.end.slice(0, 7),
        backlogM: Math.round(f.val / 1_000_000),
      }));

    // ── 최신 요약 지표 ─────────────────────────────────────
    const latestBacklog = backlog[backlog.length - 1];
    const latestRev = quarterlyRev[quarterlyRev.length - 1];

    return NextResponse.json({
      source: "sec-edgar",
      entity: "Fluence Energy, Inc. (FLNC)",
      cik: "0001868941",
      asOf: new Date().toISOString().slice(0, 10),
      summary: {
        latestBacklogM: latestBacklog?.backlogM ?? null,
        latestBacklogPeriod: latestBacklog?.period ?? null,
        latestQuarterRevM: latestRev?.revM ?? null,
        latestQuarterPeriod: latestRev?.period ?? null,
        // 백로그 기준 에이스 예상 컨테이너: 1컨테이너 ≈ 3~5MWh, 백로그 $M → MWh 환산 불가(달러 기준)
        // 대신: 직전 분기 매출 기준 에이스 점유율 추정 가능
      },
      quarterlyRev,
      annualRev,
      backlog,
      note: "출처: SEC EDGAR XBRL (공식 공개 데이터). Fluence 회계연도는 10월~9월.",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
