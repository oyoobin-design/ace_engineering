import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * EIA API v2 — 미국 배터리 ESS 연말 운영 용량 (MW)
 * 엔드포인트: operating-generator-capacity
 * 필터: technology=Batteries, status=OP, period=YYYY-12 (연말 스냅샷)
 * 집계: 해당 월 운영 중인 모든 배터리 발전기 nameplate-capacity-mw 합산
 */

const EIA_BASE = "https://api.eia.gov/v2";
const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

async function fetchYearCapacity(apiKey: string, year: number): Promise<number | null> {
  const period = `${year}-12`;
  const url =
    `${EIA_BASE}/electricity/operating-generator-capacity/data/` +
    `?api_key=${apiKey}` +
    `&data[0]=nameplate-capacity-mw` +
    `&facets[technology][]=Batteries` +
    `&facets[status][]=OP` +
    `&start=${period}&end=${period}` +
    `&offset=0&length=5000`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  const json = await res.json();

  const rows: Record<string, unknown>[] = json.response?.data ?? [];
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, d) => sum + (Number(d["nameplate-capacity-mw"]) || 0), 0);
  return Math.round(total);
}

export async function GET() {
  const apiKey = process.env.EIA_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      source: "fallback",
      note: "EIA_API_KEY 미설정 — 데모 데이터",
      data: [
        { period: "2019", value: 1651 },
        { period: "2020", value: 3507 },
        { period: "2021", value: 9320 },
        { period: "2022", value: 16800 },
        { period: "2023", value: 28000 },
      ],
      unit: "MW",
    });
  }

  try {
    const results = await Promise.all(
      YEARS.map(async (year) => {
        const value = await fetchYearCapacity(apiKey, year);
        return value !== null ? { period: String(year), value } : null;
      })
    );

    const data = results.filter((d): d is { period: string; value: number } => d !== null);

    return NextResponse.json({
      source: "eia",
      data,
      unit: "MW",
      note: "출처: U.S. EIA Form EIA-860, 연말(12월) 운영 중 배터리 발전기 Nameplate 용량 합계",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
