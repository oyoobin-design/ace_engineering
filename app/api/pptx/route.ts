import { NextRequest, NextResponse } from "next/server";
import pptxgen from "pptxgenjs";

export const runtime = "nodejs";

type SlideData = {
  slide2_title: string;
  slide2_bullets: string[];
  slide4_title: string;
  slide4_bullets: string[];
  slide6_title: string;
  slide6_bullets: string[];
  executive_summary: string;
  chartImg?: string;
  compImg?: string;
};

export async function POST(req: NextRequest) {
  const slides: SlideData = await req.json();

  const NAVY = "001D54";
  const BLUE = "0057B8";
  const LIGHT = "E8F0FB";
  const GRAY = "F4F6FA";
  const TEXT = "1A1E2E";
  const MUTED = "6B7280";
  const today = new Date().toLocaleDateString("ko-KR");

  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";

  // Slide 1 — 표지
  const s1 = pptx.addSlide();
  s1.background = { color: NAVY };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 3.2, w: "100%", h: 0.05, fill: { color: BLUE } });
  s1.addText("ESS 시장·경쟁사 인텔리전스 보고서", {
    x: 0.6, y: 1.2, w: 8.5, h: 1.0,
    fontSize: 28, bold: true, color: "FFFFFF", fontFace: "Malgun Gothic",
  });
  s1.addText("에이스엔지니어링 사업기획팀", {
    x: 0.6, y: 2.4, w: 8, h: 0.5,
    fontSize: 16, color: "93C5FD", fontFace: "Malgun Gothic",
  });
  s1.addText(`작성일: ${today}  |  작성: 오유빈 (KITA 무역AX마스터 1기)`, {
    x: 0.6, y: 4.8, w: 8, h: 0.4,
    fontSize: 12, color: MUTED, fontFace: "Malgun Gothic",
  });

  // Slide 2 — 시장 요약
  const s2 = pptx.addSlide();
  s2.background = { color: GRAY };
  s2.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: BLUE } });
  s2.addText(slides.slide2_title, {
    x: 0.4, y: 0.35, w: 9, h: 0.6,
    fontSize: 22, bold: true, color: NAVY, fontFace: "Malgun Gothic",
  });
  s2.addText(slides.executive_summary, {
    x: 0.4, y: 1.1, w: 9, h: 1.2,
    fontSize: 13, color: TEXT, fontFace: "Malgun Gothic", breakLine: true,
  });
  slides.slide2_bullets.forEach((b, i) => {
    s2.addShape(pptx.ShapeType.rect, {
      x: 0.4, y: 2.6 + i * 0.65, w: 8.8, h: 0.52,
      fill: { color: "FFFFFF" }, line: { color: "D9E1EE", width: 0.5 },
    });
    s2.addText(`• ${b}`, {
      x: 0.6, y: 2.65 + i * 0.65, w: 8.4, h: 0.42,
      fontSize: 13, color: TEXT, fontFace: "Malgun Gothic",
    });
  });

  // Slide 3 — EIA 차트
  const s3 = pptx.addSlide();
  s3.background = { color: "FFFFFF" };
  s3.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: NAVY } });
  s3.addText("미국 배터리 ESS 설치 용량 추이", {
    x: 0.4, y: 0.3, w: 9, h: 0.5,
    fontSize: 20, bold: true, color: NAVY, fontFace: "Malgun Gothic",
  });
  s3.addText("출처: U.S. Energy Information Administration (EIA API — 실시간)", {
    x: 0.4, y: 0.85, w: 9, h: 0.3,
    fontSize: 10, color: MUTED, fontFace: "Malgun Gothic",
  });
  if (slides.chartImg) {
    s3.addImage({ data: slides.chartImg, x: 0.4, y: 1.3, w: 9, h: 3.8 });
  }

  // Slide 4 — 규제 동향
  const s4 = pptx.addSlide();
  s4.background = { color: LIGHT };
  s4.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: BLUE } });
  s4.addText(slides.slide4_title, {
    x: 0.4, y: 0.35, w: 9, h: 0.55,
    fontSize: 22, bold: true, color: NAVY, fontFace: "Malgun Gothic",
  });
  slides.slide4_bullets.forEach((b, i) => {
    s4.addShape(pptx.ShapeType.rect, {
      x: 0.4, y: 1.2 + i * 0.9, w: 8.8, h: 0.75,
      fill: { color: "FFFFFF" }, line: { color: "D9E1EE", width: 0.5 },
    });
    s4.addText(`${["EU", "미국", "시사점"][i] ?? "▸"}  ${b}`, {
      x: 0.6, y: 1.28 + i * 0.9, w: 8.4, h: 0.6,
      fontSize: 13, color: TEXT, fontFace: "Malgun Gothic",
    });
  });

  // Slide 5 — 경쟁사 포지셔닝
  const s5 = pptx.addSlide();
  s5.background = { color: "FFFFFF" };
  s5.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: "100%", fill: { color: NAVY } });
  s5.addText("경쟁사 포지셔닝 분석", {
    x: 0.4, y: 0.3, w: 9, h: 0.5,
    fontSize: 20, bold: true, color: NAVY, fontFace: "Malgun Gothic",
  });
  if (slides.compImg) {
    s5.addImage({ data: slides.compImg, x: 0.4, y: 1.0, w: 9, h: 4.2 });
  }

  // Slide 6 — 에이스 시사점
  const s6 = pptx.addSlide();
  s6.background = { color: NAVY };
  s6.addText(slides.slide6_title, {
    x: 0.6, y: 0.5, w: 8.5, h: 0.6,
    fontSize: 22, bold: true, color: "FFFFFF", fontFace: "Malgun Gothic",
  });
  slides.slide6_bullets.forEach((b, i) => {
    s6.addShape(pptx.ShapeType.rect, {
      x: 0.6, y: 1.4 + i * 1.0, w: 8.6, h: 0.82,
      fill: { color: "FFFFFF", transparency: 90 },
      line: { color: BLUE, width: 1 },
    });
    s6.addText(`${["🌍", "⚡", "🎯"][i] ?? "▸"}  ${b}`, {
      x: 0.8, y: 1.48 + i * 1.0, w: 8.2, h: 0.66,
      fontSize: 13, color: "FFFFFF", fontFace: "Malgun Gothic",
    });
  });
  s6.addText(`GPT-4o 생성 · ${today}`, {
    x: 0.6, y: 4.8, w: 8, h: 0.3,
    fontSize: 10, color: "93C5FD", fontFace: "Malgun Gothic",
  });

  // 버퍼로 반환 (NextResponse body 호환 위해 Uint8Array로 변환)
  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const body = new Uint8Array(buf);

  const filename = `에이스엔지니어링_시장인텔리전스_${today.replace(/\./g, "")}.pptx`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
