"use client";

import { useState } from "react";
import CustomerIntelTab from "@/components/CustomerIntelTab";
import MarketTab from "@/components/MarketTab";
import DailyBriefBar from "@/components/DailyBriefBar";

const TABS = [
  { id: "customer", label: "01 · 고객 인텔리전스" },
  { id: "market",   label: "02 · 시장·뉴스" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function DashboardPage() {
  const [active, setActive] = useState<TabId>("customer");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="ace-header px-8 py-4 flex items-center gap-5">
        <div className="bg-white rounded-md px-3 py-2 shrink-0">
          <img src="/logo.png" alt="ACE Engineering" className="h-9 w-auto block" />
        </div>
        <div className="w-px h-9 bg-white/20 shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
            사업기획 인텔리전스
          </p>
          <h1 className="text-lg font-bold text-white leading-tight">ESS 시장·고객 대시보드</h1>
        </div>
      </header>
      <DailyBriefBar />
      <nav className="bg-white border-b-2 border-[#E0E0E0] px-8 py-2 flex gap-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActive(tab.id)}
            className={`tab-btn ${active === tab.id ? "active" : ""}`}>
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 p-6 md:p-8">
        {active === "customer" && <CustomerIntelTab />}
        {active === "market"   && <MarketTab />}
      </main>
      <footer className="border-t border-[#2D2D2D] px-8 py-3 flex justify-between" style={{ background: '#1A1A1A' }}>
        <span className="text-[11px] text-[#4B5563]" style={{ fontFamily: 'Barlow, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          데이터 출처: SEC EDGAR · Google News RSS · KOTRA
        </span>
        <span className="text-[11px] text-[#4B5563]" style={{ fontFamily: 'Barlow, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          실시간 업데이트
        </span>
      </footer>
    </div>
  );
}
