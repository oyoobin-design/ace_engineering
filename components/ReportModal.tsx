"use client";

import { useState } from "react";
import { X, Loader2, FileDown, CheckCircle } from "lucide-react";
import html2canvas from "html2canvas";

type SlideData = {
  slide2_title: string;
  slide2_bullets: string[];
  slide4_title: string;
  slide4_bullets: string[];
  slide6_title: string;
  slide6_bullets: string[];
  executive_summary: string;
};

type Step = "idle" | "fetch-data" | "ai-writing" | "capturing" | "building" | "done" | "error";

const STEP_LABELS: Record<Step, string> = {
  idle:         "시작 전",
  "fetch-data": "실시간 데이터 수집 중...",
  "ai-writing": "GPT-4o가 보고서 작성 중...",
  capturing:    "차트 이미지 캡처 중...",
  building:     "PPT 파일 생성 중...",
  done:         "다운로드 완료!",
  error:        "오류 발생",
};

async function captureElement(id: string): Promise<string | null> {
  const el = document.getElementById(id);
  if (!el) return null;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  return canvas.toDataURL("image/png");
}

export default function ReportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep]       = useState<Step>("idle");
  const [preview, setPreview] = useState<SlideData | null>(null);
  const [errMsg, setErrMsg]   = useState("");

  const handleGenerate = async () => {
    try {
      // 1. 데이터 수집 (캐시 적중으로 빠름)
      setStep("fetch-data");
      const [newsRes, eiaRes] = await Promise.all([
        fetch("/api/news").then(r => r.json()),
        fetch("/api/eia").then(r => r.json()),
      ]);
      const allNews = (newsRes.items ?? []).slice(0, 6);

      // 2. GPT-4o 보고서 텍스트 생성
      setStep("ai-writing");
      const aiRes = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsItems: allNews, eiaData: eiaRes.data ?? [] }),
      });
      const slideData: SlideData = await aiRes.json();
      setPreview(slideData);

      // 3. 차트 캡처 (클라이언트)
      setStep("capturing");
      await new Promise(r => setTimeout(r, 400));
      const [chartImg, compImg] = await Promise.all([
        captureElement("eia-chart"),
        captureElement("competitor-tab"),
      ]);

      // 4. 서버에서 PPT 빌드 후 다운로드
      setStep("building");
      const pptRes = await fetch("/api/pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...slideData, chartImg, compImg }),
      });

      if (!pptRes.ok) throw new Error("PPT 생성 실패");

      const blob = await pptRes.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const filename = decodeURIComponent(
        pptRes.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''(.+)/)?.[1] ?? "report.pptx"
      );
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStep("done");
    } catch (e) {
      console.error(e);
      setErrMsg(String(e));
      setStep("error");
    }
  };

  const isRunning = !["idle", "done", "error"].includes(step);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* 헤더 */}
        <div className="ace-header rounded-t-xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-300 font-semibold uppercase tracking-widest">AI 보고서 자동생성</p>
            <h2 className="text-lg font-bold text-white mt-0.5">PPT 시장 인텔리전스 보고서</h2>
          </div>
          <button onClick={onClose} disabled={isRunning} className="text-blue-300 hover:text-white disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 슬라이드 목차 */}
          <div className="space-y-1.5">
            {[
              "표지 — 날짜·작성자 자동입력",
              "오늘의 시장 요약 (GPT-4o 작성)",
              "EIA 실시간 ESS 설치 용량 차트",
              "EU 24/7 CFE · IRA 규제 동향",
              "경쟁사 포지셔닝 맵",
              "에이스엔지니어링 시사점 (GPT-4o 작성)",
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-bold text-ace-blue w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-ace-text">{s}</span>
              </div>
            ))}
          </div>

          {/* AI 미리보기 */}
          {preview && (
            <div className="bg-ace-gray rounded-lg p-4">
              <p className="text-xs font-bold text-ace-muted uppercase tracking-wide mb-1">GPT-4o 생성 요약</p>
              <p className="text-sm text-ace-text leading-relaxed">{preview.executive_summary}</p>
            </div>
          )}

          {/* 진행 상태 */}
          {step !== "idle" && (
            <div className="flex items-center gap-3">
              {step === "done" ? (
                <CheckCircle size={18} className="text-green-600 shrink-0" />
              ) : step === "error" ? (
                <X size={18} className="text-red-500 shrink-0" />
              ) : (
                <Loader2 size={18} className="animate-spin text-ace-blue shrink-0" />
              )}
              <span className={`text-sm font-semibold ${step === "done" ? "text-green-600" : step === "error" ? "text-red-500" : "text-ace-blue"}`}>
                {STEP_LABELS[step]}
              </span>
              {step === "error" && errMsg && (
                <span className="text-xs text-red-400">{errMsg}</span>
              )}
            </div>
          )}

          {/* 버튼 */}
          <button
            onClick={handleGenerate}
            disabled={isRunning || step === "done"}
            className="w-full flex items-center justify-center gap-2 bg-ace-navy text-white py-3 rounded-lg font-bold hover:bg-ace-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? (
              <><Loader2 size={16} className="animate-spin" /> 생성 중...</>
            ) : step === "done" ? (
              <><CheckCircle size={16} /> 다운로드 완료</>
            ) : (
              <><FileDown size={16} /> PPT 생성 & 다운로드</>
            )}
          </button>

          <p className="text-xs text-ace-muted text-center">
            EIA 실시간 데이터 + 뉴스 RSS + GPT-4o 분석 → 6슬라이드 .pptx 자동 생성
          </p>
        </div>
      </div>
    </div>
  );
}
