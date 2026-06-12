/**
 * 글로벌 ESS 시장 데이터
 *
 * ⚠️ 데이터 신뢰도 표기 (팀장 피드백 반영)
 * - 'source: official' → 공식 보고서에서 직접 발췌 가능한 수치
 * - 'source: reconstructed' → 공개 보고서 요약본·언론 기사 기반 재구성.
 *   실제 업무에서는 IRENA IRENASTAT (irena.org/Data), IEA Data & Statistics 원본 다운로드 필요.
 * - 'source: forecast' → 리서치사 전망치. 실제 유료 구독 없이는 정확한 수치 확인 불가.
 */

export type CapacityPoint = {
  year: number;
  gwh: number;
  type: "actual" | "reconstructed" | "forecast";
  sourceNote: string;
};

export const globalCapacity: CapacityPoint[] = [
  { year: 2019, gwh: 17,   type: "reconstructed", sourceNote: "IRENA 공개 요약 기반 재구성. 원본: irena.org/IRENASTAT" },
  { year: 2020, gwh: 26,   type: "reconstructed", sourceNote: "동상" },
  { year: 2021, gwh: 45,   type: "reconstructed", sourceNote: "동상" },
  { year: 2022, gwh: 81,   type: "reconstructed", sourceNote: "IEA Batteries and Secure Energy Transitions 2024 요약 기반" },
  { year: 2023, gwh: 156,  type: "reconstructed", sourceNote: "BloombergNEF H2 2023 press release 기반. 정확한 수치는 유료 구독 필요." },
  { year: 2024, gwh: 280,  type: "reconstructed", sourceNote: "BNEF 2024 4Q 추정치 기반. 확정치 미공개." },
  { year: 2025, gwh: 450,  type: "forecast",      sourceNote: "BNEF 2024 Long-Term Energy Storage Outlook (요약본) 기반 전망" },
  { year: 2030, gwh: 1600, type: "forecast",      sourceNote: "IEA Net Zero 2050 시나리오 기반 추정. 정책 변수에 따라 큰 폭 변동 가능." },
];

export type RegionShare = {
  region: string;
  gwh: number;
  sharePct: number;
  keyDriver: string;
  sourceNote: string;
};

export const byRegion2024: RegionShare[] = [
  { region: "중국",   gwh: 112, sharePct: 40, keyDriver: "CATL·BYD 주도, 국가 RE 정책", sourceNote: "BNEF/Wood Mackenzie 언론 기사 기반 추정" },
  { region: "미국",   gwh: 84,  sharePct: 30, keyDriver: "IRA 투자세액공제 30%",          sourceNote: "EIA Form 860 실제 데이터 확인 가능 (eia.gov)" },
  { region: "유럽",   gwh: 42,  sharePct: 15, keyDriver: "EU 2030 45% 재생에너지 목표",   sourceNote: "ENTSO-E / SolarPower Europe 추정" },
  { region: "호주",   gwh: 14,  sharePct: 5,  keyDriver: "계통 안정화 수요",              sourceNote: "AEMO 보고서 기반" },
  { region: "기타",   gwh: 28,  sharePct: 10, keyDriver: "중동·동남아 신규 수요",         sourceNote: "추정치" },
];

export const dcMarket = {
  note: "출처: Synergy Research Group 분기 보고서 (언론 배포 기반), DatacenterHawk",
  globalMwByYear: [
    { year: 2020, mw: 340000 },
    { year: 2021, mw: 400000 },
    { year: 2022, mw: 460000 },
    { year: 2023, mw: 520000 },
    { year: 2024, mw: 610000 },
    { year: 2025, mw: 720000, forecast: true },
    { year: 2030, mw: 1200000, forecast: true },
  ],
  aiGrowthNote: "2023~2025년 AI 학습 클러스터 수요로 평균 성장률 +25% 가속 (Synergy Research 추정)",
  bessDcNote: "100MW 데이터센터당 ESS 20~40MWh 필요 (UPS 백업 + 피크 저감). 에이스 신규 시장.",
};
