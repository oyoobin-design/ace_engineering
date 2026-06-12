"""
에이스엔지니어링 사업기획 지원 대시보드
NCS 경영기획 능력단위 기반:
  - Tab 1: 사업환경분석 (0201010101_22v3)
  - Tab 2: 경영실적분석 (0201010107_22v2)
"""
import streamlit as st

st.set_page_config(
    page_title="사업기획 대시보드 | ACE Engineering",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── CSS ──────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
    /* 전체 배경 */
    .stApp { background-color: #F8F9FA; }

    /* 헤더 */
    .main-header {
        background: linear-gradient(135deg, #0033A0 0%, #0066CC 100%);
        color: white;
        padding: 1.2rem 1.5rem;
        border-radius: 10px;
        margin-bottom: 1rem;
    }
    .main-header h1 { margin: 0; font-size: 1.6rem; font-weight: 700; }
    .main-header p  { margin: 0.3rem 0 0; font-size: 0.85rem; opacity: 0.85; }

    /* 탭 스타일 */
    .stTabs [data-baseweb="tab-list"] { gap: 8px; }
    .stTabs [data-baseweb="tab"] {
        background-color: white;
        border-radius: 8px 8px 0 0;
        padding: 0.5rem 1.2rem;
        font-weight: 600;
        border: 1px solid #dee2e6;
        border-bottom: none;
    }
    .stTabs [aria-selected="true"] {
        background-color: #0066CC !important;
        color: white !important;
    }

    /* 메트릭 카드 */
    [data-testid="metric-container"] {
        background: white;
        border: 1px solid #E9ECEF;
        border-radius: 8px;
        padding: 0.8rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }

    /* 사이드바 숨김 (배포 시) */
    [data-testid="collapsedControl"] { display: none; }

    /* 섹션 헤더 */
    h4 { color: #0033A0; border-left: 4px solid #0066CC; padding-left: 0.7rem; }
</style>
""", unsafe_allow_html=True)

# ── 헤더 ─────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="main-header">
    <h1>⚡ 에이스엔지니어링 사업기획 지원 대시보드</h1>
    <p>
    ESS·Data Center 시장환경 분석 + 수주 KPI 트래킹 &nbsp;|&nbsp;
    NCS 경영기획 능력단위 기반 &nbsp;|&nbsp;
    데이터: DART 공시 · EIA API · IRENA · Google News RSS
    </p>
</div>
""", unsafe_allow_html=True)

# ── 탭 ───────────────────────────────────────────────────────────────────────
from tabs import market_analysis, kpi_tracker

tab1, tab2 = st.tabs([
    "📊 시장환경 분석 (사업환경분석)",
    "📈 수주 KPI 트래킹 (경영실적분석)",
])

with tab1:
    market_analysis.render()

with tab2:
    kpi_tracker.render()

# ── 푸터 ─────────────────────────────────────────────────────────────────────
st.markdown("---")
st.markdown(
    "<p style='text-align:center;color:#999;font-size:0.8rem'>"
    "Built with Python · Streamlit · Plotly · EIA API · DART API &nbsp;|&nbsp;"
    "오유빈 포트폴리오 — 에이스엔지니어링 사업기획 지원"
    "</p>",
    unsafe_allow_html=True,
)
