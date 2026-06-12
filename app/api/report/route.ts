import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { newsItems, eiaData } = await req.json();

  const newsText = newsItems
    .map((n: { title: string; pubDate: string }) => `- ${n.title} (${n.pubDate})`)
    .join("\n");

  const eiaText = eiaData
    .map((d: { period: string; value: number }) => `${d.period}년: ${d.value.toLocaleString()} MW`)
    .join(", ");

  const prompt = `
당신은 에이스엔지니어링 사업기획팀의 시장 인텔리전스 분석가입니다.
아래 데이터를 바탕으로 경영진 보고용 PPT 슬라이드 텍스트를 작성해주세요.

[미국 ESS 설치 용량 추이]
${eiaText}

[오늘의 주요 뉴스]
${newsText}

다음 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만:
{
  "slide2_title": "오늘의 시장 요약",
  "slide2_bullets": ["핵심 포인트 1 (20자 이내)", "핵심 포인트 2", "핵심 포인트 3"],
  "slide4_title": "규제·정책 동향",
  "slide4_bullets": ["동향 1", "동향 2", "동향 3"],
  "slide6_title": "에이스엔지니어링 시사점",
  "slide6_bullets": ["시사점 1", "시사점 2", "시사점 3"],
  "executive_summary": "3줄 이내 경영진 요약문"
}
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const content = completion.choices[0].message.content ?? "{}";
    return NextResponse.json(JSON.parse(content));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
