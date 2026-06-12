import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK0000874761.json";
const CIK = "874761";
const EDGAR_HEADERS = { "User-Agent": "ace-biz-dashboard oyoobin@gmail.com" };
const ENTITY = "The AES Corporation (AES)";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type TagType = "수주확대" | "재무실적" | "파트너십" | "리스크" | "기타";
type Filing8K = { filedDate: string; description: string; accessionNumber: string; docUrl: string };
type Filing8KWithAI = Filing8K & { summary: string; tag: TagType };

const TAG_ANCHORS: Record<TagType, string> = {
  수주확대: "new contract order awarded customer expansion project pipeline signing gigawatt megawatt deployment",
  재무실적: "quarterly annual revenue earnings financial results guidance profit loss revenue recognition",
  파트너십: "partnership agreement collaboration MOU joint venture alliance supplier cooperation",
  리스크:   "shareholder selling reducing stake exit major investor debt facility amendment covenant bankruptcy insolvency vertical integration in-house manufacturing merger acquisition corporate restructuring asset impairment write-down",
  기타:     "administrative general board director appointment compensation incentive plan amendment proxy shareholder meeting",
};
const EMBEDDING_THRESHOLD = 0.25;

let _cache: { data: unknown; ts: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
}

async function fetchDocText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { ...EDGAR_HEADERS, Accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    return stripHtml(await res.text()).slice(0, 4000);
  } catch { return ""; }
}

// ── Step 1: 임베딩 → 태그 후보 2개 추출 ─────────────────────────
type EmbeddingCandidate = { first: TagType; firstScore: number; second: TagType; secondScore: number; lowConfidence: boolean };

async function getEmbeddingCandidates(docTexts: string[]): Promise<EmbeddingCandidate[]> {
  const tagNames = Object.keys(TAG_ANCHORS) as TagType[];
  const allTexts = [...tagNames.map(t => TAG_ANCHORS[t]), ...docTexts.map(t => t || "general corporate filing")];
  const res = await client.embeddings.create({ model: "text-embedding-3-small", input: allTexts });
  const vecs = res.data.map(d => d.embedding);
  const anchorVecs = vecs.slice(0, tagNames.length);
  const docVecs = vecs.slice(tagNames.length);
  return docVecs.map(docVec => {
    const scores = tagNames.map((tag, i) => ({ tag, score: cosine(docVec, anchorVecs[i]) })).sort((a, b) => b.score - a.score);
    return { first: scores[0].tag, firstScore: scores[0].score, second: scores[1].tag, secondScore: scores[1].score, lowConfidence: scores[0].score < EMBEDDING_THRESHOLD };
  });
}

// ── Step 2: GPT → 요약 + 최종 태그 결정 (임베딩 힌트 포함) ─────
async function generateSummaryAndTag(
  filings: Filing8K[], docTexts: string[], candidates: EmbeddingCandidate[]
): Promise<{ summaries: string[]; tags: TagType[] }> {
  const prompt = `에이스엔지니어링 사업기획 담당자다.
에이스엔지니어링 = Fluence, AES, Canadian Solar 등에 ESS 컨테이너 외함 납품하는 한국 제조사.

아래 ${filings.length}개 ${ENTITY} 8-K 공시에 대해 ACE 사업 관점에서 요약과 태그를 JSON으로만 반환해줘.

${filings.map((f, i) => {
  const c = candidates[i];
  return `[${i}] 날짜: ${f.filedDate}
임베딩 분석 결과:
1순위: ${c.first} (유사도 ${c.firstScore.toFixed(2)})
2순위: ${c.second} (유사도 ${c.secondScore.toFixed(2)})${c.lowConfidence ? " [신뢰도 낮음]" : ""}
본문: ${docTexts[i] || "(본문 없음) " + f.description}`;
}).join("\n\n---\n\n")}

태그 기준:
- 수주확대: 신규 계약, 프로젝트 수주, 고객 확대
- 재무실적: 분기/연간 실적, 매출/손익 발표
- 파트너십: 신규 협력, MOU, 공급 계약
- 리스크: 대주주 지분 축소, 합병/인수, 자산 손상, 부채 계약 변경, 파산, 내재화 투자
- 기타: 임원 선임, 주주총회, 인센티브 계획 등

응답 형식: {"results": [{"index": 0, "summary": "30자 이내 한국어", "tag": "태그"}, ...]}
반드시 ${filings.length}개 결과를 반환하라.`.trim();

  try {
    const completion = await client.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" }, temperature: 0.1 });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    const results: { index: number; summary: string; tag: string }[] = parsed.results ?? [];
    const validTags = new Set(Object.keys(TAG_ANCHORS));
    return {
      summaries: filings.map((_, i) => results.find(r => r.index === i)?.summary ?? ""),
      tags: filings.map((_, i) => { const raw = results.find(r => r.index === i)?.tag ?? ""; return validTags.has(raw) ? (raw as TagType) : "기타"; }),
    };
  } catch {
    return { summaries: filings.map(() => ""), tags: filings.map((_, i) => candidates[i].first) };
  }
}

export async function GET() {
  if (_cache && Date.now() - _cache.ts < CACHE_MS) return NextResponse.json(_cache.data);
  try {
    const res = await fetch(SUBMISSIONS_URL, { headers: EDGAR_HEADERS, next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`EDGAR submissions HTTP ${res.status}`);
    const json = await res.json();
    const recent = json.filings?.recent;
    if (!recent) throw new Error("filings.recent not found");
    const { form, filingDate, accessionNumber, primaryDocument, primaryDocDescription } = recent as { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[]; primaryDocDescription: string[] };

    const filings: Filing8K[] = [];
    for (let i = 0; i < form.length && filings.length < 5; i++) {
      if (form[i] === "8-K") {
        const acc = accessionNumber[i];
        const accNoDash = acc.replace(/-/g, "");
        filings.push({ filedDate: filingDate[i], description: primaryDocDescription[i] ?? acc, accessionNumber: acc, docUrl: `https://www.sec.gov/Archives/edgar/data/${CIK}/${accNoDash}/${primaryDocument[i]}` });
      }
    }
    if (filings.length === 0) return NextResponse.json({ items: [] });

    // 본문 병렬 fetch → 임베딩(Step1) → GPT 요약+태그(Step2)
    const docTexts  = await Promise.all(filings.map(f => fetchDocText(f.docUrl)));
    const candidates = await getEmbeddingCandidates(docTexts);
    const { summaries, tags } = await generateSummaryAndTag(filings, docTexts, candidates);
    const items: Filing8KWithAI[] = filings.map((f, i) => ({ ...f, summary: summaries[i], tag: tags[i] }));
    const result = { items };
    _cache = { data: result, ts: Date.now() };
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
