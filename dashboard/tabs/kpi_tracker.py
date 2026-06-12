"""
Tab 2 — 수주 KPI 트래킹
NCS 능력단위: 경영실적분석 (0201010107_22v2)
  - 2.1 경영실적 측정
  - 2.2 경영실적 분석
  - 2.3 경영실적 피드백 (Gap 분석)

데이터: 에이스엔지니어링 DART 공시 실제값 + 시뮬레이션 (내부 데이터 없음 — 입사 후 교체 예정)
"""
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import json
from pathlib import Path
from datetime import date

ROOT = Path(__file__).parent.parent


def _load_financials() -> dict:
    path = ROOT / "data" / "static" / "ace_financials.json"
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def render():
    st.markdown("### 📈 수주 KPI 트래킹")
    st.caption(
        "NCS 경영실적분석 | "
        "연간 실적: DART 공시 실제값 | "
        "분기·목표: 내부 데이터 없어 시뮬레이션 — 입사 후 실제값으로 교체 예정"
    )
    st.warning(
        "💡 **포트폴리오 취지**: 이 탭은 '이런 KPI 측정 기준을 만들 수 있다'는 설계 역량을 보여줍니다. "
        "시뮬레이션 데이터에 실제 데이터를 교체하면 바로 운영 가능한 구조입니다.",
        icon="📌"
    )

    fin = _load_financials()
    df_annual = pd.DataFrame(fin["annual"])

    # ── Section 1: 연간 실적 요약 (DART 실제값) ──────────────────────────
    st.markdown("---")
    st.markdown("#### 1. 에이스엔지니어링 연간 실적 (DART 공시)")

    # 전년 대비 성장률 계산
    df_annual = df_annual.sort_values("year")
    df_annual["revenue_100m"] = df_annual["revenue"] / 100  # 백만원 → 억원
    df_annual["revenue_yoy"] = df_annual["revenue_100m"].pct_change() * 100
    df_annual["assets_100m"] = df_annual["assets"] / 100

    col1, col2, col3, col4 = st.columns(4)
    latest = df_annual.iloc[-1]
    prev = df_annual.iloc[-2]

    col1.metric(
        "2024 매출",
        f"{latest['revenue_100m']:.0f}억",
        f"+{latest['revenue_yoy']:.1f}% YoY" if not pd.isna(latest['revenue_yoy']) else "",
    )
    col2.metric(
        "2024 직원 수",
        f"{int(latest['employees'])}명",
        f"+{int(latest['employees'] - prev['employees'])}명 YoY",
    )
    col3.metric(
        "1인당 매출",
        f"{latest['revenue_100m'] / latest['employees']:.1f}억/명",
        f"vs {prev['revenue_100m'] / prev['employees']:.1f}억 (전년)",
    )
    col4.metric(
        "자산총계",
        f"{latest['assets_100m']:.0f}억",
        f"+{(latest['assets_100m'] - prev['assets_100m']):.0f}억",
    )

    # 연간 매출 추이
    fig_rev = go.Figure()
    fig_rev.add_trace(go.Bar(
        x=df_annual["year"].astype(str),
        y=df_annual["revenue_100m"],
        name="매출 (억원)",
        marker_color=["#AECBF5", "#6FA9EE", "#0066CC", "#003A7A"],
        text=df_annual["revenue_100m"].apply(lambda x: f"{x:.0f}억"),
        textposition="outside",
    ))
    fig_rev.add_trace(go.Scatter(
        x=df_annual["year"].astype(str),
        y=df_annual["employees"],
        name="직원 수 (명)",
        yaxis="y2",
        mode="lines+markers",
        line=dict(color="#FF6B35", width=2),
        marker=dict(size=8),
    ))
    fig_rev.update_layout(
        title="연간 매출 추이 + 직원 수 (DART 실제값)",
        height=350,
        yaxis=dict(title="억원", side="left"),
        yaxis2=dict(title="명", side="right", overlaying="y", showgrid=False),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        plot_bgcolor="white",
    )
    st.plotly_chart(fig_rev, use_container_width=True)

    # ── Section 2: 분기별 KPI (시뮬레이션) ───────────────────────────────
    st.markdown("---")
    st.markdown("#### 2. 분기별 매출 KPI — 목표 vs 실적 (시뮬레이션)")
    st.caption("⚠️ 분기 데이터 없음 — 연간 실적 기반 시뮬레이션. 실제 입사 후 Google Sheets 연동으로 교체 가능.")

    q_data = fin["quarterly_sim"]["2024"]
    target = fin["kpi_targets_2025"]["revenue_target"] / 4 / 100  # 분기 목표(억)
    actual_vals = [v / 100 for v in q_data.values()]  # 2024 실적을 2025 기준으로 시뮬

    quarters = ["Q1", "Q2", "Q3", "Q4"]
    target_vals = [target] * 4
    achievement_pct = [a / t * 100 for a, t in zip(actual_vals, target_vals)]

    fig_kpi = make_subplots(
        rows=1, cols=2,
        subplot_titles=["분기별 매출 목표 vs 실적 (억원)", "목표 달성률 (%)"],
        column_widths=[0.6, 0.4],
    )
    fig_kpi.add_trace(go.Bar(
        x=quarters, y=target_vals, name="목표",
        marker_color="#AECBF5", opacity=0.7,
    ), row=1, col=1)
    fig_kpi.add_trace(go.Bar(
        x=quarters, y=actual_vals, name="실적",
        marker_color="#0066CC",
        text=[f"{v:.0f}억" for v in actual_vals],
        textposition="outside",
    ), row=1, col=1)
    fig_kpi.add_trace(go.Bar(
        x=quarters, y=achievement_pct,
        marker_color=["#2ECC71" if p >= 100 else "#F39C12" if p >= 80 else "#E74C3C"
                      for p in achievement_pct],
        name="달성률",
        text=[f"{p:.1f}%" for p in achievement_pct],
        textposition="outside",
        showlegend=False,
    ), row=1, col=2)
    fig_kpi.add_hline(y=100, line_dash="dot", line_color="black", row=1, col=2)
    fig_kpi.update_layout(
        height=350, barmode="group",
        plot_bgcolor="white",
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
    )
    fig_kpi.update_yaxes(title_text="억원", row=1, col=1)
    fig_kpi.update_yaxes(title_text="%", row=1, col=2)
    st.plotly_chart(fig_kpi, use_container_width=True)

    # ── Section 3: KPI 측정 기준 정의서 (NCS 기반) ────────────────────────
    st.markdown("---")
    st.markdown("#### 3. KPI 측정 기준 정의서")
    st.caption("NCS 경영실적분석 능력단위 요소 2.3 — 지표 운영 정의서 기술")

    kpi_def = pd.DataFrame([
        {
            "KPI명": "분기 매출",
            "단위": "억원",
            "측정 주기": "분기",
            "산출식": "해당 분기 확정 수주 금액 합산",
            "데이터 소스": "ERP (영림원)",
            "목표 기준": "전년 동분기 +15%",
            "비고": "Powin 파산 이후 고객 다변화 반영",
        },
        {
            "KPI명": "신규 고객 수주 비율",
            "단위": "%",
            "측정 주기": "반기",
            "산출식": "신규 고객 수주액 / 전체 수주액",
            "데이터 소스": "CRM / ERP",
            "목표 기준": "25% 이상",
            "비고": "Fluence 의존도 완화 지표",
        },
        {
            "KPI명": "미국 시장 비중",
            "단위": "%",
            "측정 주기": "분기",
            "산출식": "미국향 수주액 / 전체 수주액",
            "데이터 소스": "ERP",
            "목표 기준": "55% 유지",
            "비고": "IRA 효과 지속 여부 모니터링",
        },
        {
            "KPI명": "유럽 시장 비중",
            "단위": "%",
            "측정 주기": "분기",
            "산출식": "유럽향 수주액 / 전체 수주액",
            "데이터 소스": "ERP",
            "목표 기준": "30% 달성",
            "비고": "EU Green Deal 타깃 확대",
        },
        {
            "KPI명": "수주 데이터 보고서 적시 제공",
            "단위": "일 (지연일)",
            "측정 주기": "월",
            "산출식": "경영층 요청 → 보고서 제출까지 일수",
            "데이터 소스": "업무 기록",
            "목표 기준": "0일 (자동화 목표)",
            "비고": "Python·n8n 자동화로 0일 목표",
        },
    ])

    st.dataframe(
        kpi_def,
        use_container_width=True,
        hide_index=True,
        column_config={
            "KPI명": st.column_config.TextColumn("KPI명", width="medium"),
            "목표 기준": st.column_config.TextColumn("목표 기준", width="medium"),
            "비고": st.column_config.TextColumn("비고", width="large"),
        },
    )

    # ── Section 4: Gap 분석 (경영실적 피드백) ─────────────────────────────
    st.markdown("---")
    st.markdown("#### 4. 경영실적 피드백 — Gap 분석")
    st.caption("NCS 경영실적분석 4.1~4.3 — 계획 대비 실적차이 발생 지표의 개선방향 도출")

    gap_df = pd.DataFrame([
        {
            "KPI": "분기 매출",
            "목표": "1,750억",
            "실적": "1,640억",
            "달성률": "93.7%",
            "Gap 원인": "Powin 파산으로 Q1 발주 지연",
            "개선 방향": "Powin 대체 SI 2~3곳 선제 발굴 (Einogy, Eneracks 등)",
            "상태": "조치 중",
        },
        {
            "KPI": "신규 고객 비율",
            "목표": "25%",
            "실적": "18%",
            "달성률": "72.0%",
            "Gap 원인": "기존 Fluence 의존 구조 지속",
            "개선 방향": "신규 시장(일본·동남아) 타깃 SI 리스트 수집 후 BD 지원",
            "상태": "미착수",
        },
        {
            "KPI": "유럽 비중",
            "목표": "30%",
            "실적": "22%",
            "달성률": "73.3%",
            "Gap 원인": "CE 인증 지연, 유럽 SI 파이프라인 부족",
            "개선 방향": "CE·IEC 62933 인증 현황 확인 → 유럽 RE+/Intersolar 수주 선점",
            "상태": "검토 중",
        },
        {
            "KPI": "보고서 제공 지연",
            "목표": "0일",
            "실적": "2.3일 평균",
            "달성률": "—",
            "Gap 원인": "수작업 데이터 취합 프로세스",
            "개선 방향": "ERP → Python 자동 추출 → 대시보드 실시간 반영 체계 구축",
            "상태": "⭐ 직접 해결 가능",
        },
    ])

    for _, row in gap_df.iterrows():
        status_color = {
            "조치 중": "🟡",
            "미착수": "🔴",
            "검토 중": "🔵",
            "⭐ 직접 해결 가능": "🟢",
        }.get(row["상태"], "⚫")

        with st.expander(f"{status_color} **{row['KPI']}** — 목표 {row['목표']} | 실적 {row['실적']} | 달성률 {row['달성률']}"):
            c1, c2 = st.columns(2)
            c1.markdown(f"**Gap 원인**: {row['Gap 원인']}")
            c2.markdown(f"**개선 방향**: {row['개선 방향']}")
            st.caption(f"상태: {row['상태']}")

    # ── Section 5: 자동 보고서 생성 버튼 ─────────────────────────────────
    st.markdown("---")
    st.markdown("#### 5. 월간 KPI 보고서 자동 생성")
    st.caption("실제 운영 시: ERP → Python 자동 추출 → 이 버튼으로 PDF 생성 → 경영진 이메일 발송")

    if st.button("📄 이번 달 KPI 리포트 생성", type="primary"):
        today = date.today()
        report_text = f"""
## 에이스엔지니어링 KPI 리포트
**생성일**: {today.strftime('%Y년 %m월 %d일')}
**작성**: 사업기획팀 (자동생성)

---

### 핵심 실적 요약
| KPI | 목표 | 실적 | 달성률 |
|-----|------|------|--------|
| 분기 매출 | 1,750억 | 1,640억 | 93.7% |
| 신규 고객 비율 | 25% | 18% | 72% |
| 유럽 비중 | 30% | 22% | 73% |

### 주요 이슈
- Powin 대체 SI 발굴 필요 → Q3 타깃 2곳 확정 예정
- 유럽 CE 인증 진행 상황 확인 필요

### 다음 달 액션 아이템
1. 신규 ESS SI 후보 5개사 리서치 완료
2. 유럽 RE+ 참가 기업 리스트 수집
3. ERP 데이터 자동 추출 파이프라인 1차 완성

---
*이 보고서는 에이스엔지니어링 사업기획 대시보드에서 자동 생성됩니다.*
        """
        st.code(report_text, language="markdown")
        st.success("리포트 생성 완료! 실제 운영 시 n8n으로 경영진 이메일 자동 발송.")
