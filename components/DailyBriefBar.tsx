"use client";

import { useEffect, useState } from "react";
import { TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";

type BriefData = {
  기회: string[];
  리스크: string[];
  한줄요약: string;
};

type LoadStep = "idle" | "news" | "brief" | "done" | "error";

export default function DailyBriefBar() {
  const [brief, setBrief]         = useState<BriefData | null>(null);
  const [step, setStep]           = useState<LoadStep>("idle");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = async () => {
    setStep("news");
    try {
      const extractItems = async (endpoint: string): Promise<{ title: string; reason?: string }[]> => {
        try {
          const res = await fetch(endpoint);
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let text = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            for (const m of text.matchAll(/^data: (.+)$/gm)) {
              try {
                const d = JSON.parse(m[1]);
                if (d.stage === "done") {
                  reader.cancel();
                  return (d.items ?? []) as { title: string; reason?: string }[];
                }
              } catch { /* partial chunk */ }
            }
          }
        } catch { /* network error */ }
        return [];
      };

      const [domItems, ovsItems] = await Promise.all([
        extractItems("/api/news"),
        extractItems("/api/news-overseas"),
      ]);
      const items = [...domItems, ...ovsItems].slice(0, 15);

      setStep("brief");
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      setBrief(data);
      setUpdatedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
      setStep("done");
    } catch {
      setStep("error");
    }
  };

  useEffect(() => { load(); }, []);

  const loading = step === "news" || step === "brief";

  return (
    <div className="relative overflow-hidden" style={{ background: "#1A1A1A", borderBottom: "2px solid #C8272D" }}>
      {/* 배경 그리드 패턴 */}
      <div className="absolute inset-0 pointer-events-none bg-grid" />
      {/* 왼쪽 3색 사이드 바 */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{
        background: "linear-gradient(to bottom, #C8272D 0%, #1E7A3C 50%, #1A1A1A 100%)"
      }} />

      <div className="relative px-8 py-4 pl-10">
        {/* 상단 헤더 행 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* ACE 3-색 stripe */}
            <div className="ace-stripe" style={{ height: "36px" }}>
              <span /><span /><span />
            </div>
            <div className="min-w-0">
              <p className="section-tag" style={{ color: "#9CA3AF" }}>
                Daily Intelligence Brief
              </p>
              {loading ? (
                <p className="text-xs mt-0.5" style={{ color: "#4B5563", fontFamily: "Barlow, sans-serif" }}>
                  {step === "news" ? "뉴스 수집 중..." : "AI 분석 중..."}
                </p>
              ) : brief?.한줄요약 ? (
                <p className="text-sm font-semibold text-white mt-0.5 truncate max-w-xl">
                  {brief.한줄요약}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {updatedAt && step === "done" && (
              <span style={{
                fontSize: "10px", color: "#4B5563",
                fontFamily: "Barlow, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase"
              }}>
                {updatedAt} 기준
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="transition-colors disabled:opacity-40"
              style={{ color: "#4B5563" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "#4B5563")}
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* 2 다크 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <DarkBriefCard
            icon={TrendingUp}
            label="기회"
            items={brief?.기회 ?? []}
            loading={loading}
            accentColor="#1E7A3C"
          />
          <DarkBriefCard
            icon={AlertTriangle}
            label="리스크"
            items={brief?.리스크 ?? []}
            loading={loading}
            accentColor="#C8272D"
          />
        </div>
      </div>
    </div>
  );
}

function DarkBriefCard({
  icon: Icon, label, items, loading, accentColor,
}: {
  icon: React.ElementType;
  label: string;
  items: string[];
  loading: boolean;
  accentColor: string;
}) {
  return (
    <div className="ace-card-dark pt-5">
      {/* 컬러 상단 스트립 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: accentColor
      }} />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Icon size={11} style={{ color: accentColor, flexShrink: 0 }} />
          <span style={{
            color: accentColor, fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            fontFamily: "Barlow, sans-serif"
          }}>
            {label}
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-2 rounded animate-pulse" style={{ background: "#2D2D2D" }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p style={{ fontSize: "11px", color: "#4B5563" }}>해당 없음</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 leading-snug" style={{ fontSize: "11px", color: "#D1D5DB" }}>
                <span style={{ color: accentColor, flexShrink: 0, marginTop: "2px", fontWeight: 700 }}>▸</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
