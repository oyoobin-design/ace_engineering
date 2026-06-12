"use client";

import { useEffect, useState, useMemo } from "react";
import { RefreshCw, FileText, Loader2 } from "lucide-react";
import ArticleSummaryModal from "@/components/ArticleSummaryModal";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  outlet: string;
  reason?: string;
  lowRelevance?: boolean;
};
type SelectedArticle = { url: string; reason?: string; outlet: string; pubDate: string };

type ProgressState = {
  stage: "idle" | "collecting" | "filtering" | "gpt" | "done" | "error";
  message: string;
  scanned?: number;
  pct?: number;
};

function useNews(endpoint: string) {
  const [items, setItems]       = useState<NewsItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [progress, setProgress] = useState<ProgressState>({ stage: "idle", message: "연결 중..." });
  const [meta, setMeta]         = useState({ scanned: 0, updatedAt: "" });

  const load = () => {
    setLoading(true);
    setItems([]);
    setProgress({ stage: "collecting", message: "수집 중..." });

    fetch(endpoint)
      .then((res) => {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const processChunk = ({ done, value }: ReadableStreamReadResult<Uint8Array>): Promise<void> => {
          if (done) {
            setLoading(false);
            return Promise.resolve();
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.stage === "done") {
                setItems(data.items ?? []);
                setMeta({
                  scanned: data.scanned ?? 0,
                  updatedAt: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
                });
                setProgress({ stage: "done", message: "완료" });
                setLoading(false);
              } else if (data.stage === "error") {
                setProgress({ stage: "error", message: data.message ?? "오류 발생" });
                setLoading(false);
              } else {
                setProgress(data as ProgressState);
              }
            } catch { /* ignore malformed line */ }
          }

          return reader.read().then(processChunk);
        };

        return reader.read().then(processChunk);
      })
      .catch((e) => {
        setProgress({ stage: "error", message: String(e) });
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);
  return { items, loading, progress, meta, refresh: load };
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
      <div
        className="bg-ace-blue h-1 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function NewsSection({
  title, subTitle, items, loading, progress, meta, refresh, onSelect,
}: {
  title: string;
  subTitle: string;
  items: NewsItem[];
  loading: boolean;
  progress: ProgressState;
  meta: { scanned: number; updatedAt: string };
  refresh: () => void;
  onSelect: (a: SelectedArticle) => void;
}) {
  const ITEMS_PER_PAGE = 5;

  // outlet 필터 (로딩 완료 후 items에서 동적으로 추출)
  const [outletFilter, setOutletFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const outlets = useMemo(() => {
    const names = items.map((item) => {
      // "KOTRA(워싱턴DC무역관)" → "KOTRA" 로 정규화
      const m = item.outlet.match(/^([^(（]+)/);
      return m ? m[1].trim() : item.outlet;
    });
    return [...new Set(names)];
  }, [items]);

  // items 또는 outletFilter가 바뀌면 필터·페이지 초기화
  useEffect(() => { setOutletFilter(null); setPage(1); }, [items]);
  useEffect(() => { setPage(1); }, [outletFilter]);

  const filteredItems = outletFilter
    ? items.filter((item) => item.outlet.startsWith(outletFilter))
    : items;

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const visibleItems = filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <div className="ace-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="section-tag mb-0.5">Market Intelligence</p>
          <h2 className="section-title" style={{ fontSize: "18px" }}>{title}</h2>
          <p className="text-xs text-ace-muted mt-0.5">
            {subTitle}{meta.scanned > 0 && ` · ${meta.scanned}건 스캔`}
          </p>
        </div>
        <button onClick={refresh} className="text-ace-muted hover:text-ace-navy transition-colors shrink-0">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* 로딩 진행 상태 */}
      {loading && (
        <div className="space-y-2 py-4">
          <div className="flex items-center gap-2">
            <Loader2 size={14} className="text-ace-blue animate-spin shrink-0" />
            <p className="text-sm text-ace-text">{progress.message}</p>
          </div>
          {progress.scanned != null && progress.scanned > 0 && (
            <p className="text-xs text-ace-muted pl-5">{progress.scanned}건 수집됨</p>
          )}
          {progress.pct != null && <ProgressBar pct={progress.pct} />}
          {/* fallback skeleton */}
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-50 rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 */}
      {!loading && progress.stage === "error" && (
        <p className="text-sm text-red-500 py-4 text-center">{progress.message}</p>
      )}

      {/* 출처 필터 칩 */}
      {!loading && items.length > 0 && outlets.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setOutletFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              outletFilter === null
                ? "bg-ace-navy text-white border-ace-navy"
                : "bg-white text-ace-muted border-ace-border hover:border-ace-navy hover:text-ace-navy"
            }`}
          >
            전체 {items.length}
          </button>
          {outlets.map((name) => {
            const count = items.filter((i) => i.outlet.startsWith(name)).length;
            return (
              <button
                key={name}
                onClick={() => setOutletFilter(outletFilter === name ? null : name)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  outletFilter === name
                    ? "bg-ace-blue text-white border-ace-blue"
                    : "bg-white text-ace-muted border-ace-border hover:border-ace-blue hover:text-ace-blue"
                }`}
              >
                {name} {count}
              </button>
            );
          })}
        </div>
      )}

      {/* 기사 목록 */}
      {!loading && filteredItems.length === 0 && progress.stage !== "error" && (
        <p className="text-sm text-ace-muted text-center py-8">
          {outletFilter ? `${outletFilter} 기사 없음` : "24시간 내 관련 기사 없음"}
        </p>
      )}

      {!loading && visibleItems.length > 0 && (
        <ul className="divide-y divide-ace-border">
          {visibleItems.map((item, i) => (
            <li key={i} className={`py-3 first:pt-0 last:pb-0 ${item.lowRelevance ? "opacity-60" : ""}`}>
              <button
                onClick={() => onSelect({ url: item.link, reason: item.reason, outlet: item.outlet, pubDate: item.pubDate })}
                className="flex items-start gap-2 group w-full text-left"
              >
                {item.title.includes("단독") && (
                  <span className="shrink-0 text-[10px] font-bold text-red-600 border border-red-300 rounded px-1 py-0.5 mt-0.5">
                    단독
                  </span>
                )}
                <span className="flex-1 text-sm text-ace-text group-hover:text-ace-blue leading-snug">
                  {item.title.replace(/\[?단독\]?/g, "").trim()}
                </span>
                <FileText size={13} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 text-ace-muted" />
              </button>
              {item.reason && (
                <p className={`text-[11px] mt-1 leading-snug ${item.lowRelevance ? "text-ace-muted" : "text-ace-blue"}`}>
                  ↳ {item.reason}
                </p>
              )}
              <p className="text-[11px] text-ace-muted mt-0.5">
                {item.outlet} ·{" "}
                {new Date(item.pubDate).toLocaleString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* 페이지네이션 */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4 pt-3 border-t border-ace-border">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 text-xs text-ace-muted hover:text-ace-navy disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-7 h-7 text-xs rounded-md transition-colors ${
                p === page
                  ? "bg-ace-navy text-white font-bold"
                  : "text-ace-muted hover:bg-gray-100 hover:text-ace-text"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 text-xs text-ace-muted hover:text-ace-navy disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      )}

      {meta.updatedAt && (
        <p className="text-[10px] text-ace-muted mt-4 text-right">업데이트: {meta.updatedAt}</p>
      )}
    </div>
  );
}

export default function MarketTab() {
  const domestic = useNews("/api/news");
  const overseas = useNews("/api/news-overseas");
  const [activeTab, setActiveTab]   = useState<"domestic" | "overseas">("domestic");
  const [selected, setSelected] = useState<SelectedArticle | null>(null);

  return (
    <>
      <div className="space-y-6" id="market-tab">

        {/* 상단 바: 토글 */}
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1 w-fit">
          <button
            onClick={() => setActiveTab("domestic")}
            className={`px-5 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              activeTab === "domestic"
                ? "bg-white text-ace-navy shadow-sm"
                : "text-ace-muted hover:text-ace-text"
            }`}
          >
            국내
          </button>
          <button
            onClick={() => setActiveTab("overseas")}
            className={`px-5 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              activeTab === "overseas"
                ? "bg-white text-ace-navy shadow-sm"
                : "text-ace-muted hover:text-ace-text"
            }`}
          >
            해외
          </button>
        </div>

        {/* 뉴스 단일 컬럼 */}
        {activeTab === "domestic" ? (
          <NewsSection
            key="domestic"
            title="국내 뉴스 — AI 선별"
            subTitle="매경·한경·연합뉴스·전자신문·KOTRA 24h"
            items={domestic.items}
            loading={domestic.loading}
            progress={domestic.progress}
            meta={domestic.meta}
            refresh={domestic.refresh}
            onSelect={setSelected}
          />
        ) : (
          <NewsSection
            key="overseas"
            title="해외 뉴스 — AI 선별"
            subTitle="Energy-Storage.News · PV Tech · Bloomberg · WSJ 24h"
            items={overseas.items}
            loading={overseas.loading}
            progress={overseas.progress}
            meta={overseas.meta}
            refresh={overseas.refresh}
            onSelect={setSelected}
          />
        )}

      </div>

      {selected && (
        <ArticleSummaryModal
          url={selected.url}
          reason={selected.reason}
          outlet={selected.outlet}
          pubDate={selected.pubDate}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
