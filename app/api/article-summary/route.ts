import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractArticleText(url: string): Promise<{ title: string; text: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NewsReader/1.0)",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const html = await res.text();

  // 제목 추출
  const title =
    html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] ??
    html.match(/<meta name="title" content="([^"]+)"/i)?.[1] ??
    html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";

  const ogDesc   = html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1] ?? "";
  const metaDesc = html.match(/<meta name="description" content="([^"]+)"/i)?.[1] ?? "";

  // 본문 추출 우선순위: article > .article-body > p 태그 집합 > og:description
  function extractText(pattern: RegExp): string {
    const match = html.match(pattern)?.[1] ?? "";
    return match
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const articleBody =
    extractText(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    extractText(/class="[^"]*(?:article|content|body|text)[^"]*"[^>]*>([\s\S]{200,}?)<\/(?:div|section)>/i) ||
    (() => {
      // p 태그 전체 수집
      const pTags = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, "").trim())
        .filter(t => t.length > 30)
        .join(" ");
      return pTags;
    })();

  const text = (articleBody || ogDesc || metaDesc).slice(0, 4000);
  return { title: title.trim(), text: text.trim() };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const reason = req.nextUrl.searchParams.get("reason") ?? "";

  if (!url) return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 });

  try {
    const { title, text } = await extractArticleText(url);

    if (!text || text.length < 80) {
      return NextResponse.json({
        summary: "기사 본문을 가져올 수 없습니다. 해당 언론사의 접근 제한으로 내용을 불러오지 못했습니다.",
        keyPoints: [],
        title,
        url,
        noContent: true,
      });
    }

    const prompt = `
너는 에이스엔지니어링 사업기획팀 신입이다.

[에이스엔지니어링 맥락]
- ESS(에너지저장장치) 인클로저(배터리 외함) 전문 제조사
- 매출 90% 해외. 최대 고객: Fluence Energy(미국 ESS SI 업체)
- Powin 파산(2024)으로 매출 타격 → 신규 고객 발굴이 최우선 과제
- IRA·관세 변동에 매출 직결. 일본·스페인 신시장 진출 중
- 경쟁사: TLS Energy, CATL, 신성에스티, Rittal
- 신규사업: AI 데이터센터 냉각 모듈

[기사 제목]
${title}

[기사 내용]
${text}

${reason ? `[AI 선별 이유 (참고)]\n${reason}` : ""}

다음 JSON 형식으로만 응답하라:
{
  "summary": "기사의 핵심 사실을 3~4문장으로 요약. 수치·기관명·날짜 등 구체적 정보를 최대한 포함해라.",
  "keyPoints": ["핵심 키워드 1 (10자 이내)", "핵심 키워드 2", "핵심 키워드 3"]
}`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(completion.choices[0].message.content ?? "{}");
    return NextResponse.json({ ...result, title, url });

  } catch (e) {
    return NextResponse.json({
      summary: "기사 요약을 불러올 수 없습니다. 원문 링크를 직접 확인해주세요.",
      title: "",
      url,
      error: String(e),
    });
  }
}
