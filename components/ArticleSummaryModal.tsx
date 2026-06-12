"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, Loader2, BookOpen } from "lucide-react";

type SummaryResult = {
  summary: string;
  keyPoints?: string[];
  title: string;
  url: string;
  noContent?: boolean;
};

type Props = {
  url: string;
  reason?: string;
  outlet: string;
  pubDate: string;
  onClose: () => void;
};

export default function ArticleSummaryModal({ url, reason, outlet, pubDate, onClose }: Props) {
  const [data, setData]       = useState<SummaryResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ url });
    if (reason) params.set("reason", reason);

    fetch(`/api/article-summary?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [url, reason]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">

        {/* 헤더 */}
        <div className="ace-header rounded-t-xl px-6 py-4 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-blue-300 font-semibold uppercase tracking-widest mb-1">
              AI 기사 요약
            </p>
            <p className="text-white font-bold text-sm leading-snug line-clamp-2">
              {data?.title || "불러오는 중..."}
            </p>
            <p className="text-blue-300 text-xs mt-1">{outlet} · {pubDate}</p>
          </div>
          <button onClick={onClose} className="text-blue-300 hover:text-white shrink-0 mt-0.5">
            <X size={20} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-ace-blue" />
              <p className="text-sm text-ace-muted">GPT-4o-mini가 기사를 읽고 있습니다...</p>
            </div>
          ) : (
            <>
              {data?.noContent ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-ace-muted">해당 언론사의 접근 제한으로 본문을 불러올 수 없습니다.</p>
                  <p className="text-xs text-ace-muted mt-1">원문 링크를 직접 확인해주세요.</p>
                </div>
              ) : (
                <>
                  {/* 핵심 포인트 */}
                  {data?.keyPoints && data.keyPoints.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {data.keyPoints.map((kp, i) => (
                        <span key={i} className="text-xs px-2.5 py-1 bg-ace-light text-ace-navy rounded-full font-semibold">
                          {kp}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* 요약 */}
                  <div>
                    <p className="text-xs font-bold text-ace-muted uppercase tracking-wide mb-2">기사 요약</p>
                    <p className="text-sm text-ace-text leading-relaxed">{data?.summary}</p>
                  </div>
                </>
              )}

              {/* AI 판단 이유 */}
              {reason && (
                <div className="bg-ace-gray rounded-lg p-3">
                  <p className="text-xs font-semibold text-ace-muted mb-0.5">AI 선별 이유</p>
                  <p className="text-xs text-ace-text">↳ {reason}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* 하단 — 원문 링크 */}
        <div className="border-t border-ace-border px-6 py-4">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-ace-navy text-white rounded-lg text-sm font-bold hover:bg-ace-blue transition-colors"
          >
            <BookOpen size={15} />
            원문 기사 읽기
            <ExternalLink size={13} />
          </a>
          <p className="text-[11px] text-ace-muted text-center mt-2">
            AI 요약은 참고용입니다. 중요한 판단은 원문을 확인하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
