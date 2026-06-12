import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { items } = await req.json();

  if (!items?.length) {
    return NextResponse.json({ 기회: [], 리스크: [], 한줄요약: "수집된 뉴스 없음" });
  }

  const newsText = (items as Array<{ title: string; reason?: string }>)
    .slice(0, 15)
    .map((n, i) => `${i + 1}. ${n.title}${n.reason ? ` [이유: ${n.reason}]` : ""}`)
    .join("\n");

  const prompt = `
너는 에이스엔지니어링 사업기획팀 담당자다.
에이스엔지니어링 = ESS 인클로저(배터리 외함) 제조사. 매출 90% 해외. 최대 고객: Fluence Energy.
신규 고객 발굴이 최우선 과제. IRA·관세 변동에 매출 직결.

[오늘의 뉴스]
${newsText}

에이스엔지니어링 사업기획 관점에서 아래 JSON으로만 응답하라:
{
  "기회": ["에이스에 유리한 사실·기회 (30자 이내)", ...],
  "리스크": ["에이스에 불리한 리스크 (30자 이내)", ...],
  "한줄요약": "오늘 가장 중요한 한 가지 메시지 (40자 이내)"
}

기회·리스크 각 최대 3개. 뉴스에 근거가 있으면 반드시 채워라. 근거 없을 때만 빈 배열.
뉴스에서 직접 추론 가능한 것만 작성하라. 추측하지 말 것.
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    const result = JSON.parse(completion.choices[0].message.content ?? "{}");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
