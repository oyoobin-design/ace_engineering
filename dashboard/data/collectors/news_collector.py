"""
ESS 시장 뉴스 자동 수집 — Google News RSS (API 키 불필요)
"""
import feedparser
import streamlit as st
import pandas as pd
from datetime import datetime
import re


RSS_FEEDS = {
    "ESS 시장": "https://news.google.com/rss/search?q=energy+storage+battery+ESS+MWh&hl=en&gl=US&ceid=US:en",
    "Fluence Energy": "https://news.google.com/rss/search?q=Fluence+Energy+BESS+storage&hl=en&gl=US&ceid=US:en",
    "IRA 정책": "https://news.google.com/rss/search?q=IRA+inflation+reduction+act+battery+storage&hl=en&gl=US&ceid=US:en",
    "데이터센터 ESS": "https://news.google.com/rss/search?q=data+center+battery+backup+energy+storage&hl=en&gl=US&ceid=US:en",
}

CATEGORY_KEYWORDS = {
    "수주/발주": ["award", "contract", "order", "MWh", "MW", "GWh", "deploy", "project"],
    "정책/규제": ["IRA", "policy", "regulation", "tariff", "incentive", "subsidy", "EU", "act"],
    "경쟁사 동향": ["Fluence", "Powin", "CATL", "BYD", "Tesla", "Sungrow", "competitor"],
    "리스크": ["bankrupt", "default", "recall", "fire", "risk", "tariff", "import"],
    "시장 트렌드": ["market", "growth", "forecast", "trend", "demand", "capacity"],
}


def _categorize(title: str, summary: str) -> str:
    text = (title + " " + summary).lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(kw.lower() in text for kw in keywords):
            return category
    return "기타"


def _clean_summary(html: str) -> str:
    clean = re.sub(r"<[^>]+>", "", html or "")
    return clean[:200].strip()


@st.cache_data(ttl=3600)  # 1시간 캐시
def fetch_ess_news(feed_name: str = "ESS 시장", max_items: int = 10) -> pd.DataFrame:
    url = RSS_FEEDS.get(feed_name, RSS_FEEDS["ESS 시장"])
    try:
        feed = feedparser.parse(url)
        entries = feed.entries[:max_items]
        rows = []
        for e in entries:
            pub = e.get("published", "")
            try:
                pub_dt = datetime(*e.published_parsed[:6]) if e.get("published_parsed") else None
            except Exception:
                pub_dt = None
            title = e.get("title", "")
            summary = _clean_summary(e.get("summary", ""))
            rows.append({
                "제목": title,
                "요약": summary,
                "링크": e.get("link", ""),
                "발행일": pub_dt,
                "카테고리": _categorize(title, summary),
            })
        if not rows:
            return _fallback_news()
        return pd.DataFrame(rows)
    except Exception:
        return _fallback_news()


def fetch_all_feeds() -> pd.DataFrame:
    frames = []
    for name in RSS_FEEDS:
        df = fetch_ess_news(name, max_items=5)
        df["피드"] = name
        frames.append(df)
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["제목"])
    return combined.sort_values("발행일", ascending=False, na_position="last")


def _fallback_news() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "제목": "[뉴스 로드 실패] 인터넷 연결 확인 후 새로고침",
            "요약": "RSS 피드 수집에 실패했습니다. 네트워크 상태를 확인해 주세요.",
            "링크": "",
            "발행일": None,
            "카테고리": "기타",
        }
    ])
