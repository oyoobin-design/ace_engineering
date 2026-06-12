"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Package, RefreshCw, ExternalLink, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

// ── 파트너 설정 ────────────────────────────────────────────────────
const PARTNERS = [
  { id: "fluence",        label: "Fluence",        ticker: "FLNC", apiBase: "/api/fluence",        api8k: "/api/fluence-8k" },
  { id: "canadian-solar", label: "Canadian Solar", ticker: "CSIQ", apiBase: "/api/canadian-solar", api8k: "/api/canadian-solar-8k" },
  { id: "aes",            label: "AES",            ticker: "AES",  apiBase: "/api/aes",            api8k: "/api/aes-8k" },
  { id: "bloom",          label: "Bloom Energy",   ticker: "BE",   apiBase: "/api/bloom",          api8k: "/api/bloom-8k" },
] as const;

type PartnerId = typeof PARTNERS[number]["id"];

// ── 타입 ──────────────────────────────────────────────────────────
type BacklogPoint  = { period: string; backlogM: number };
type RevPoint      = { period: string; revM: number };
type AnnualPoint   = { fy: string; end: string; revM: number };

type PartnerFinancialData = {
  source: string;
  entity: string;
  cik: string;
  asOf: string;
  summary: {
    latestBacklogM: number | null;
    latestBacklogPeriod: string | null;
    latestBacklogGW?: number | null;   // AES 전용: GW 단위 백로그
    latestQuarterRevM: number | null;
    latestQuarterPeriod: string | null;
  };
  backlog: BacklogPoint[];
  quarterlyRev: RevPoint[];
  annualRev: AnnualPoint[];
  note: string;
};

type TagType = "수주확대" | "재무실적" | "파트너십" | "리스크" | "기타";

type Filing8KItem = {
  filedDate: string;
  description: string;
  accessionNumber: string;
  docUrl: string;
  summary: string;
  tag: TagType;
};

const TAG_CONFIG: Record<TagType, { bg: string; text: string; border: string }> = {
  수주확대: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
  재무실적: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200" },
  파트너십: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  리스크:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
  기타:     { bg: "bg-gray-100",  text: "text-gray-600",   border: "border-gray-200" },
};

// ── 훅 ──────────────────────────────────────────────────────────
function useFinancials(endpoint: string) {
  const [data, setData]       = useState<PartnerFinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(endpoint)
      .then(r => r.json())
      .then(j => { setData(j); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  };
  useEffect(() => { load(); }, [endpoint]);
  return { data, loading, error, refresh: load };
}

function use8K(endpoint: string) {
  const [items, setItems]     = useState<Filing8KItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch(endpoint)
      .then(r => r.json())
      .then(j => { setItems(j.items ?? []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  };
  useEffect(() => { load(); }, [endpoint]);
  return { items, loading, error, refresh: load };
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; accent?: string;
}) {
  return (
    <div className="ace-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="metric-label">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${accent ?? "text-ace-navy"}`}>{value}</p>
          {sub && <p className="text-xs text-ace-muted mt-0.5">{sub}</p>}
        </div>
        <Icon size={20} className="text-ace-muted mt-0.5" />
      </div>
    </div>
  );
}

// ── 역산 시뮬레이터 (Fluence · Canadian Solar 전용) ──────────────────
function BacklogSimulator({ backlogM }: { backlogM: number }) {
  const [sharePct, setSharePct]         = useState(0);
  const [pricePerMwh, setPricePerMwh]   = useState(0);
  const [containerMwh, setContainerMwh] = useState(1);

  const canCompute     = pricePerMwh > 0 && containerMwh > 0;
  const estimatedMwh   = canCompute ? (backlogM * 1_000_000) * (sharePct / 100) / pricePerMwh : 0;
  const estimatedUnits = canCompute ? Math.round(estimatedMwh / containerMwh) : 0;
  const backlogB       = (backlogM / 1000).toFixed(1);

  const sliderStyle = {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px",
    padding: "12px",
  };

  return (
    <div className="mt-5 pt-5 border-t border-ace-border">
      <p className="section-tag mb-4">역산 시뮬레이터</p>

      <div className="space-y-3 mb-5">
        {/* 납품 비중 */}
        <div style={sliderStyle}>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-medium text-ace-text">납품 비중</span>
            <span className="text-xs font-bold text-ace-navy">{sharePct}%</span>
          </div>
          <input
            type="range" min={0} max={100} step={5} value={sharePct}
            onChange={e => setSharePct(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#C8272D" }}
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-ace-muted">0%</span>
            <span className="text-[10px] text-ace-muted">100%</span>
          </div>
        </div>

        {/* MWh당 단가 */}
        <div style={sliderStyle}>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-medium text-ace-text">MWh당 단가</span>
            <span className="text-xs font-bold text-ace-navy">${pricePerMwh}/MWh</span>
          </div>
          <input
            type="range" min={0} max={500} step={10} value={pricePerMwh}
            onChange={e => setPricePerMwh(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#C8272D" }}
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-ace-muted">$0</span>
            <span className="text-[10px] text-ace-muted">$500</span>
          </div>
        </div>

        {/* 컨테이너 용량 */}
        <div style={sliderStyle}>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs font-medium text-ace-text">컨테이너 용량</span>
            <span className="text-xs font-bold text-ace-navy">{containerMwh} MWh</span>
          </div>
          <input
            type="range" min={1} max={10} step={1} value={containerMwh}
            onChange={e => setContainerMwh(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: "#C8272D" }}
          />
          <div className="flex justify-between mt-0.5">
            <span className="text-[10px] text-ace-muted">1 MWh</span>
            <span className="text-[10px] text-ace-muted">10 MWh</span>
          </div>
        </div>
      </div>

      {/* 결과 */}
      <div className="rounded-lg p-4" style={{ background: "rgba(200,39,45,0.1)", border: "1px solid #C8272D" }}>
        <p className="text-base font-bold text-ace-navy">
          예상 발주량:{" "}
          <span style={{ color: "#C8272D" }}>
            {canCompute ? estimatedUnits.toLocaleString() : "—"}개
          </span>{" "}
          <span className="text-xs font-normal text-ace-muted">(추정)</span>
        </p>
        <p className="text-[11px] text-ace-muted mt-1">
          계산식: ${backlogB}B × {sharePct}% ÷ ${pricePerMwh}/MWh ÷ {containerMwh} MWh
        </p>
      </div>

      <p className="text-[10px] text-ace-muted mt-2">
        ※ 세 가지 가정값 기반 추정치. 실제 계약과 다를 수 있음.
      </p>
    </div>
  );
}

// ── 파트너 탭 콘텐츠 ─────────────────────────────────────────────
function PartnerContent({
  partnerId, chartsOpen, onToggleCharts,
}: {
  partnerId: PartnerId;
  chartsOpen: boolean;
  onToggleCharts: () => void;
}) {
  const partner      = PARTNERS.find(p => p.id === partnerId)!;
  const fin          = useFinancials(partner.apiBase);
  const k8           = use8K(partner.api8k);
  const hasSimulator = partnerId === "fluence" || partnerId === "canadian-solar";

  return (
    <div className="space-y-5">

      {/* AES 인수 경고 배너 */}
      {partnerId === "aes" && (
        <div className="rounded-lg p-3 flex items-start gap-2"
          style={{ background: "rgba(200,39,45,0.08)", border: "1px solid rgba(200,39,45,0.3)" }}>
          <AlertTriangle size={14} style={{ color: "#C8272D", flexShrink: 0, marginTop: "1px" }} />
          <p className="text-xs leading-snug" style={{ color: "#C8272D" }}>
            AES가 BlackRock·EQT에 인수(비상장 전환) 진행 중 — 향후 공시 중단 가능성 있음
          </p>
        </div>
      )}

      {/* ① 수요잔고·분기매출 숫자 카드 */}
      {fin.loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map(i => <div key={i} className="ace-card p-5 h-24 animate-pulse bg-gray-50" />)}
        </div>
      ) : fin.data && (
        <div className="grid grid-cols-2 gap-4">
          {/* 백로그 카드: AES는 GW 단위, 나머지는 달러 */}
          {partnerId === "aes" ? (
            <MetricCard
              label="PPA 백로그"
              value={fin.data.summary.latestBacklogGW != null
                ? `${fin.data.summary.latestBacklogGW} GW`
                : "N/A"}
              sub="GW 단위 · 달러 환산 불가"
              icon={Package}
              accent="text-ace-navy"
            />
          ) : (
            <MetricCard
              label="수주잔고 (백로그)"
              value={fin.data.summary.latestBacklogM != null
                ? `$${(fin.data.summary.latestBacklogM / 1000).toFixed(1)}B`
                : "N/A"}
              sub={fin.data.summary.latestBacklogPeriod
                ? `${fin.data.summary.latestBacklogPeriod} 기준 · 미납품 수주`
                : "데이터 없음"}
              icon={Package}
              accent="text-ace-navy"
            />
          )}
          <MetricCard
            label="최근 분기 매출"
            value={fin.data.summary.latestQuarterRevM != null
              ? `$${fin.data.summary.latestQuarterRevM}M`
              : "N/A"}
            sub={fin.data.summary.latestQuarterPeriod
              ? `${fin.data.summary.latestQuarterPeriod} · SEC EDGAR`
              : "데이터 없음"}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* ② 실적 상세 보기 아코디언 */}
      <div className="ace-card overflow-hidden">
        <button
          onClick={onToggleCharts}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
        >
          <span style={{ fontFamily: "Barlow, sans-serif", fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1A1A1A" }}>
            실적 상세 보기
          </span>
          {chartsOpen
            ? <ChevronUp size={15} className="text-ace-muted" />
            : <ChevronDown size={15} className="text-ace-muted" />}
        </button>

        {chartsOpen && (
          <div className="px-6 pb-6 space-y-6 border-t border-ace-border">

            {/* 수주잔고 추이 */}
            {fin.data && fin.data.backlog.length > 0 && (
              <div className="pt-4">
                <div className="section-divider mb-3">
                  <h3 className="font-semibold text-sm text-ace-text">수주잔고 추이</h3>
                </div>
                {fin.loading ? (
                  <div className="h-44 bg-gray-50 animate-pulse rounded" />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={fin.data.backlog}>
                      <defs>
                        <linearGradient id={`backlogGrad-${partnerId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#C8272D" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#C8272D" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}B`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(1)}B`, "수주잔고"]} />
                      <Area type="monotone" dataKey="backlogM" stroke="#C8272D" strokeWidth={2.5}
                        fill={`url(#backlogGrad-${partnerId})`}
                        dot={{ fill: "#0057B8", r: 3, strokeWidth: 2, stroke: "white" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* 분기·연간 매출 */}
            {fin.data && (fin.data.quarterlyRev.length > 0 || fin.data.annualRev.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {fin.data.quarterlyRev.length > 0 && (
                  <div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={fin.data.quarterlyRev}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={v => `$${v}M`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`$${v}M`, "분기 매출"]} />
                        <Bar dataKey="revM" fill="#1E7A3C" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {fin.data.annualRev.length > 0 && (
                  <div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={fin.data.annualRev}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="fy" tick={{ fontSize: 10 }} />
                        <YAxis tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}B` : `$${v}M`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [v >= 1000 ? `$${(v / 1000).toFixed(2)}B` : `$${v}M`, "연간 매출"]} />
                        <Bar dataKey="revM" fill="#1A1A1A" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {fin.data && (
              <p className="text-[10px] text-ace-muted text-right">{fin.data.note} · {fin.data.asOf}</p>
            )}

            {/* 역산 시뮬레이터 (Fluence · Canadian Solar 전용) */}
            {hasSimulator && fin.data?.summary.latestBacklogM != null && (
              <BacklogSimulator backlogM={fin.data.summary.latestBacklogM} />
            )}
          </div>
        )}
      </div>

      {/* ③ 8-K / 6-K 공시 목록 */}
      <div className="ace-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-tag mb-0.5">Latest Filings</p>
            <h2 className="section-title" style={{ fontSize: "18px" }}>최신 공시 (8-K / 6-K)</h2>
            <p className="text-xs text-ace-muted mt-0.5">{partner.label} SEC 제출 자료 · 실시간</p>
          </div>
          <button onClick={k8.refresh} className="text-ace-muted hover:text-ace-navy">
            <RefreshCw size={13} />
          </button>
        </div>

        {k8.loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-1">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-gray-50 rounded animate-pulse w-1/2" />
              </div>
            ))}
          </div>
        ) : k8.items.length === 0 ? (
          <p className="text-sm text-ace-muted text-center py-6">
            {k8.error ? `오류: ${k8.error}` : "공시 없음"}
          </p>
        ) : (
          <ul className="divide-y divide-ace-border">
            {k8.items.map((item, i) => {
              const cfg = TAG_CONFIG[item.tag] ?? TAG_CONFIG["기타"];
              return (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <a href={item.docUrl} target="_blank" rel="noreferrer" className="flex items-start gap-2 group">
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-bold mt-0.5 whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      {item.tag}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ace-text group-hover:text-ace-blue leading-snug">{item.description}</p>
                      {item.summary && (
                        <p className="text-[11px] text-ace-blue mt-0.5">↳ {item.summary}</p>
                      )}
                      <p className="text-[11px] text-ace-muted mt-0.5">{item.filedDate}</p>
                    </div>
                    <ExternalLink size={12} className="shrink-0 mt-1 text-ace-muted opacity-0 group-hover:opacity-60" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

    </div>
  );
}

// ── 메인 탭 ────────────────────────────────────────────────────────
export default function CustomerIntelTab() {
  const [active, setActive] = useState<PartnerId>("fluence");
  const [chartsOpen, setChartsOpen] = useState<Record<PartnerId, boolean>>({
    fluence: false,
    "canadian-solar": false,
    aes: false,
    bloom: false,
  });

  const toggleCharts = (id: PartnerId) =>
    setChartsOpen(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-5" id="customer-intel-tab">

      {/* 파트너 탭 네비게이션 */}
      <div className="flex flex-wrap gap-1 border-b-2 border-[#E0E0E0] pb-0">
        {PARTNERS.map(p => (
          <button
            key={p.id}
            onClick={() => setActive(p.id)}
            className="transition-all"
            style={{
              fontFamily: "Barlow, sans-serif",
              fontSize: "12px",
              fontWeight: active === p.id ? 700 : 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "9px 18px",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              border: "1px solid transparent",
              background: active === p.id ? "rgba(200,39,45,0.08)" : "transparent",
              color: active === p.id ? "#C8272D" : "#6B7280",
              borderColor: active === p.id ? "rgba(200,39,45,0.2)" : "transparent",
              borderBottom: active === p.id ? "2px solid #C8272D" : "2px solid transparent",
            }}
          >
            {p.label}
            <span style={{ fontSize: "10px", fontWeight: 400, marginLeft: "5px", opacity: 0.6 }}>
              {p.ticker}
            </span>
          </button>
        ))}
      </div>

      {/* 파트너별 콘텐츠 — key로 마운트 분리 (탭 전환 시 리셋) */}
      <PartnerContent
        key={active}
        partnerId={active}
        chartsOpen={chartsOpen[active]}
        onToggleCharts={() => toggleCharts(active)}
      />

    </div>
  );
}
