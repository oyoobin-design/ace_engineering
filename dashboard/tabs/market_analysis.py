"""
Tab 1 — 시장환경 분석
NCS 능력단위: 사업환경분석 (0201010101_22v3)
  - 1. 외부환경 분석 (PEST)
  - 2. 경쟁자 분석
  - 3. 핵심성공요소 도출
"""
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import json
from pathlib import Path
import sys

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from data.collectors.eia_collector import fetch_battery_capacity_us, fetch_battery_projects_pipeline
from data.collectors.news_collector import fetch_all_feeds, fetch_ess_news


def _load_json(name: str) -> dict:
    path = ROOT / "data" / "static" / name
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def render():
    st.markdown("### 📊 글로벌 ESS·Data Center 시장환경 분석")
    st.caption("NCS 사업환경분석 | 출처: IRENA 2024, IEA BESS Report, EIA API, BloombergNEF 공개 자료")

    # ── Section 1: ESS 글로벌 시장 현황 ──────────────────────────────────
    st.markdown("---")
    st.markdown("#### 1. ESS 글로벌 시장 현황")

    market = _load_json("ess_market.json")

    df_global = pd.DataFrame(market["global_capacity_gwh"])
    df_hist = df_global[~df_global.get("forecast", pd.Series([False] * len(df_global), index=df_global.index)).fillna(False)]
    df_fore = df_global[df_global.get("forecast", pd.Series([False] * len(df_global), index=df_global.index)).fillna(False)]

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("2024 글로벌 설치량", "280 GWh", "+79.5% YoY")
    col2.metric("2030 전망", "1,600 GWh", "5.7× 성장")
    col3.metric("미국 비중 (2024)", "30%", "84 GWh")
    col4.metric("에이스 TAM", "$8.5B", "ESS 인클로저 기준")

    # 글로벌 용량 추이 + 전망
    fig_global = go.Figure()
    fig_global.add_trace(go.Bar(
        x=df_hist["year"], y=df_hist["gwh"],
        name="실적", marker_color="#0066CC",
    ))
    if not df_fore.empty:
        fig_global.add_trace(go.Bar(
            x=df_fore["year"], y=df_fore["gwh"],
            name="전망", marker_color="#99C2FF", marker_pattern_shape="x",
        ))
    fig_global.update_layout(
        title="글로벌 BESS 누적 설치량 (GWh)",
        height=320, barmode="overlay",
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        yaxis_title="GWh",
        plot_bgcolor="white", paper_bgcolor="white",
    )
    st.plotly_chart(fig_global, use_container_width=True)

    # 지역별 비중
    col_r1, col_r2 = st.columns(2)
    df_region = pd.DataFrame(market["by_region_2024"])
    fig_pie = px.pie(
        df_region, values="gwh", names="region",
        title="지역별 비중 (2024)",
        color_discrete_sequence=px.colors.qualitative.Set2,
        hole=0.4,
    )
    fig_pie.update_traces(textposition="inside", textinfo="percent+label")
    fig_pie.update_layout(height=300, showlegend=False)
    col_r1.plotly_chart(fig_pie, use_container_width=True)

    with col_r2:
        st.markdown("**지역별 핵심 드라이버**")
        for row in df_region.itertuples():
            st.markdown(f"- **{row.region}** ({row.share_pct}%): {row.key_driver}")

    # ── Section 2: 미국 EIA 실시간 데이터 ─────────────────────────────────
    st.markdown("---")
    st.markdown("#### 2. 미국 배터리 스토리지 현황 (EIA 데이터)")

    with st.spinner("EIA 데이터 로딩 중..."):
        df_us = fetch_battery_capacity_us()

    if not df_us.empty:
        fig_us = px.area(
            df_us.sort_values("period"),
            x="period",
            y="nameplate-capacity-mw",
            title="미국 배터리 스토리지 설비 용량 추이 (MW)",
            color_discrete_sequence=["#0066CC"],
        )
        fig_us.update_layout(
            height=280,
            yaxis_title="MW",
            xaxis_title="",
            plot_bgcolor="white", paper_bgcolor="white",
        )
        st.plotly_chart(fig_us, use_container_width=True)

    with st.expander("EIA API 연결 안내 (배포 시)"):
        st.code("""
# .streamlit/secrets.toml 에 추가
EIA_API_KEY = "your_key_here"

# 무료 발급: https://www.eia.gov/opendata/register.php
        """, language="toml")

    # ── Section 3: 정책 타임라인 ──────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### 3. 주요 정책 타임라인 (IRA · EU Green Deal)")

    policy = _load_json("policy_timeline.json")
    df_policy = pd.DataFrame(policy["events"])
    df_policy["date"] = pd.to_datetime(df_policy["date"])
    df_policy = df_policy.sort_values("date")

    for _, row in df_policy.iterrows():
        is_risk = row.get("risk", False)
        is_forecast = row.get("forecast", False)
        icon = "🔴" if is_risk else ("🔵" if row["country"] == "미국" else "🇪🇺")
        tag = " `전망`" if is_forecast else ""
        with st.container():
            c1, c2 = st.columns([1, 6])
            c1.markdown(f"**{row['date'].strftime('%Y.%m')}**")
            c2.markdown(
                f"{icon} **{row['country']} — {row['policy']}**{tag}  \n"
                f"<span style='color:#555;font-size:0.88rem'>{row['impact']}</span>",
                unsafe_allow_html=True
            )
        st.markdown("")

    # ── Section 4: 경쟁사 / 고객사 모니터링 ──────────────────────────────
    st.markdown("---")
    st.markdown("#### 4. 주요 고객사 · 경쟁사 모니터링")

    tab_news_a, tab_news_b, tab_news_c = st.tabs(["ESS 시장 뉴스", "Fluence Energy", "데이터센터 ESS"])

    with tab_news_a:
        _render_news("ESS 시장")
    with tab_news_b:
        _render_news("Fluence Energy")
    with tab_news_c:
        _render_news("데이터센터 ESS")

    # ── Section 5: Data Center 시장 ───────────────────────────────────────
    st.markdown("---")
    st.markdown("#### 5. Data Center ESS 시장 (신규 성장축)")

    dc = market["data_center_market"]
    df_dc = pd.DataFrame(dc["global_mw_by_year"])
    df_dc_hist = df_dc[~df_dc.get("forecast", pd.Series([False]*len(df_dc), index=df_dc.index)).fillna(False)]
    df_dc_fore = df_dc[df_dc.get("forecast", pd.Series([False]*len(df_dc), index=df_dc.index)).fillna(False)]

    fig_dc = go.Figure()
    fig_dc.add_trace(go.Scatter(
        x=df_dc_hist["year"], y=df_dc_hist["mw"],
        mode="lines+markers", name="실적",
        line=dict(color="#FF6B35", width=3),
    ))
    if not df_dc_fore.empty:
        fig_dc.add_trace(go.Scatter(
            x=df_dc_fore["year"], y=df_dc_fore["mw"],
            mode="lines+markers", name="전망",
            line=dict(color="#FFB347", width=2, dash="dot"),
        ))
    fig_dc.update_layout(
        title="글로벌 데이터센터 총 IT 용량 (MW)",
        height=280,
        yaxis_title="MW",
        plot_bgcolor="white", paper_bgcolor="white",
    )
    st.plotly_chart(fig_dc, use_container_width=True)

    col_dc1, col_dc2 = st.columns(2)
    col_dc1.info(f"📌 {dc['ai_driven_growth_note']}")
    col_dc2.info(f"🔋 {dc['bess_per_dc_note']}")

    st.caption("출처: Synergy Research 2024, DatacenterHawk Q4 2024, IRENA 2024, IEA BESS Report")


def _render_news(feed_name: str):
    with st.spinner(f"{feed_name} 뉴스 수집 중..."):
        df = fetch_ess_news(feed_name, max_items=8)

    if df.empty:
        st.info("뉴스를 불러오지 못했습니다.")
        return

    category_colors = {
        "수주/발주": "🟢",
        "정책/규제": "🔵",
        "경쟁사 동향": "🟡",
        "리스크": "🔴",
        "시장 트렌드": "⚪",
        "기타": "⚫",
    }

    for _, row in df.iterrows():
        icon = category_colors.get(row["카테고리"], "⚫")
        pub = row["발행일"].strftime("%m.%d") if pd.notna(row.get("발행일")) else ""
        link = row.get("링크", "")
        title = row["제목"]
        if link:
            st.markdown(f"{icon} [{title}]({link}) `{pub}` `{row['카테고리']}`")
        else:
            st.markdown(f"{icon} {title} `{pub}` `{row['카테고리']}`")
        if row.get("요약") and "로드 실패" not in row["요약"]:
            st.caption(row["요약"])
