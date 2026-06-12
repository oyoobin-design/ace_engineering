# 에이스엔지니어링 대시보드 — 실제 코드 기준 아키텍처 문서

> 작성: 오유빈 · 실제 소스코드 분석 기반 (LOGIC.md 설명서 아님)

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **목적** | 에이스엔지니어링 사업기획팀의 시장·고객 인텔리전스 수집·분석·보고를 자동화 |
| **해결 문제** | 뉴스 수동 검색(시간 낭비) + Fluence 발주 동향 추적 어려움 + 보고서 작성 반복 업무 |
| **주 사용자** | 에이스엔지니어링 사업기획팀 담당자 |
| **기대 효과** | 매일 30분 → 5분 이내로 시장 모니터링 가능, PPT 자동 생성으로 보고 업무 단축 |

---

## 2. 전체 시스템 아키텍처

### 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프레임워크 | Next.js 14.2.3 (App Router) |
| UI | React 18, Tailwind CSS, Recharts |
| AI | OpenAI API (gpt-4o, gpt-4o-mini, text-embedding-3-small) |
| PPT 생성 | pptxgenjs 4.0.1 (Node.js 서버 전용) |
| HTML 캡처 | html2canvas 1.4.1 (클라이언트 전용) |
| 외부 데이터 | SEC EDGAR XBRL API, EIA API v2, RSS 피드 35개+ |

### 화면 구조 (실제 page.tsx 기준)

```
[헤더]
[DailyBriefBar — 오늘의 인텔리전스 브리프]   ← 항상 표시 (기회/리스크/경쟁사 3카드 + 한줄요약)
[탭] 01 고객 인텔리전스 | 02 시장·뉴스 | 03 경쟁사 분석 | 04 발주 예측 | 05 영업 파이프라인
[탭 콘텐츠]
[푸터]
```

### 데이터 흐름 (Mermaid)

```mermaid
graph TD
  A[브라우저] --> B[page.tsx]
  B --> Z[DailyBriefBar]
  B --> C[01 CustomerIntelTab]
  B --> D[02 MarketTab]
  B --> E[03 CompetitorTab]
  B --> Y[04 ForecastTab]
  B --> PL[05 PipelineTab]

  Z -->|뉴스 취합| H
  Z -->|뉴스 취합| I
  Z -->|items 전달| BR[/api/brief]
  BR --> S2[GPT-4o-mini 의사결정 카드]

  C -->|fetch| F[/api/fluence]
  D -->|fetch| G[/api/eia]
  D -->|fetch| H[/api/news]
  D -->|fetch| I[/api/news-overseas]
  E -->|click| J[/api/competitor-news?competitor=X]
  D -->|기사 클릭| K[/api/article-summary?url=X]
  Y -->|정적 데이터| FC[Fluence·Powin 수주 → 에이스 발주 역산]
  PL -->|샘플 데이터| KB[영업 파이프라인 칸반]

  F --> L[SEC EDGAR XBRL API]
  G --> M[EIA API v2]
  H --> N[한국 RSS 15개 피드]
  I --> O[해외 RSS 20개+ 피드]
  J --> P[Google News RSS + 이벤트 자동분류]

  H -->|30분 서버캐시| Q[OpenAI Embeddings]
  H --> R[GPT-4o 배치 선별]
  I -->|30분 서버캐시| Q
  I --> R
  K --> S[GPT-4o-mini 요약]

  D -->|PPT 버튼| T[html2canvas 차트 캡처]
  T -->|이미지+뉴스| U[/api/report]
  U --> V[GPT-4o 슬라이드 텍스트 생성]
  V -->|JSON| W[/api/pptx]
  W --> X[pptxgenjs .pptx 파일]
  X --> A
```

---

## 3. 기능별 상세 로직

### 3-1. 국내 뉴스 수집·필터링 (`app/api/news/route.ts`)

**목적:** 한국 언론 RSS에서 에이스엔지니어링 관련 기사를 매일 자동 추출

**입력:** 없음 (GET 요청)

**처리 과정:**

**Step -1 — 서버 인메모리 캐시** (모듈 스코프 `_cache`)
- 30분 내 재요청이면 OpenAI 호출 없이 캐시된 결과 즉시 반환
- MarketTab·DailyBriefBar·ReportModal이 같은 `/api/news`를 호출해도 OpenAI 비용은 30분당 1회만 발생 (이중 호출 방지)

**Step 0 — RSS 병렬 수집** (`fetchRSS`)
- 6개 언론사 15개 피드를 `Promise.all`로 동시 요청 (순차였으면 15번 기다려야 함)
  - 매일경제 3개 (경제·기업경영·국제)
  - 한국경제 3개 (경제·IT·국제)
  - 연합뉴스 3개 (경제·산업·세계)
  - 전자신문 4개 (전자·AI·정책·국제)
  - knews기술 1개 (한겨레·경향 등 멀티소스 집계)
  - 동아일보 1개 (경제)
- 24시간 이내 기사만 통과, 유료 기사(plus.hankyung.com 등 5개 패턴) 자동 제외
- Next.js `revalidate: 1800` → 30분 캐시

**Step 0.5 — 중복 제거**
- URL 기준 1차 dedup + 제목 앞 30자 기준 2차 dedup (같은 기사 다른 언론사 배포 제거)

**Step 1 — 임베딩 유사도 필터** (`filterByEmbedding`)
- `ACE_CONTEXT_FOR_EMBEDDING` 벡터 + 기사 제목 전체를 `text-embedding-3-small`로 한 번에 변환
- 코사인 유사도 계산: 기본 임계값 **0.30** (단독 기사 +0.05 보너스)
- 결과 5개 미만이면 임계값 **0.25**로 완화 (조용한 날 대비 fallback)
- 상위 기사들을 다음 단계로 전달

**Step 2 — GPT 배치 최종 선별** (`filterByGPTBatch`)
- 임베딩 통과 기사를 **30개씩** 자동 분할 → `Promise.all`로 동시 전송 (`gpt-4o`, temperature 0.1)
- GPT 프롬프트에 9개 포함 기준 + 6개 제외 기준 명시
- `response_format: json_object`로 파싱 실패 방지
- GPT가 0개 반환 시 → 임베딩 상위 3개 fallback (⚠️ 경고 레이블 포함)

**출력 데이터:**
```ts
{
  items: NewsItem[],      // 기사 목록 (reason 포함)
  scanned: number,        // 전체 수집된 기사 수
  afterEmbedding: number, // 임베딩 필터 후 수
  batches: number,        // GPT 배치 수
  byOutlet: Record<string, number> // 언론사별 수집량
}
```

---

### 3-2. 해외 뉴스 수집·필터링 (`app/api/news-overseas/route.ts`)

**목적:** 영문 ESS 전문 미디어 + 주요 언론사에서 글로벌 동향 수집

**국내 뉴스와의 차이점:**

| 항목 | 국내 | 해외 |
|------|------|------|
| 피드 수 | 15개 | 20개+ |
| 임계값 | 0.30 / 0.25 | 0.25 / 0.18 |
| GPT 언어 | 한국어 프롬프트 | 영어 프롬프트 |
| GPT 기준 | 엄격 (9개 포함 기준) | 포용적 (exclude only clearly unrelated) |
| 캐시 | 30분 | 30분 |

**해외 피드 구성:**
- ESS 전문 B2B: Energy-Storage.News, ESS News, PV Tech
- 금융·종합: Bloomberg, WSJ(2개), BBC(3개), CNBC, Guardian(2개), Forbes, Investing.com
- 에너지 특화: EIA Official, Utility Dive, Clean Energy Group, Battery Power Online, MIT Energy
- Google News site: 필터 3개 (Reuters·Bloomberg·CNBC 공신력 필터)

---

### 3-3. 경쟁사 활동 로그 (`app/api/competitor-news/route.ts` + `CompetitorTab.tsx`)

**목적:** "경쟁사 기사 나열"이 아니라 "경쟁사가 실제로 뭘 했는가"를 이벤트 단위로 보여줌

**경쟁사 목록 (실제 코드 기준 — LOGIC.md보다 3개 더 많음):**
- tls, rittal, sungshin, **texson**, catl, **sungrow**, byd, fluence

**처리:**
- Google News RSS → `fetchGoogleNews` → 24h 이내 최대 5개
- 각 기사 제목을 `classifyEvent()`가 **이벤트 타입 7종으로 자동 분류** (정규식 키워드 매칭, GPT 미사용 → 비용 0)
  - `수주`(award/contract/MWh) · `신제품`(launch/unveil) · `파트너십`(MOU/partnership) · `공장·생산`(factory/capacity) · `규제·정책`(IRA/tariff) · `재무`(revenue/earnings) · `기타`
- 캐시: `revalidate: 3600` (1시간)

**프론트(`ActivityFeed`):** 이벤트 타입별 컬러 배지 + 타입 필터 탭 + 상대 시간("2시간 전") 표시
→ 사업기획 담당자가 "오늘 CATL이 신제품 냈나?"를 한눈에 확인

---

### 3-4. EIA 데이터 (`app/api/eia/route.ts`)

**목적:** 미국 배터리 ESS 설치 용량 공식 데이터 시각화

**API:** `EIA API v2 /electricity/operating-generator-capacity/data/`
- 필터: `technology=Batteries`, `status=OP`, 연말(12월) 스냅샷
- 2019~2025년 각 연도별 Nameplate 용량(MW) 합산
- 연도별 병렬 요청 (`Promise.all`)
- 캐시: `revalidate: 86400` (24시간)
- API 키 없으면 → 데모 데이터 자동 반환 (대시보드 화면은 유지)

---

### 3-5. Fluence 고객 인텔리전스 (`app/api/fluence/route.ts`)

**목적:** 에이스 최대 고객 Fluence Energy의 실적·수주잔고 추적

**API:** SEC EDGAR XBRL (무료, 키 불필요)
- URL: `https://data.sec.gov/api/xbrl/companyfacts/CIK0001868941.json`
- CIK: `0001868941` (Fluence Energy, Inc.)

**추출 데이터:**
1. **분기 매출** — `RevenueFromContractWithCustomerExcludingAssessedTax`
   - 단일 분기 필터: `start~end` 75~100일
   - 같은 end 날짜 중복 제거 (최신 filing 우선)
   - 최근 8분기
2. **연간 매출** — 10-K 기준, 350~380일 필터
3. **백로그(수주잔고)** — `RevenueRemainingPerformanceObligation`
   - 최근 10개 데이터 포인트

**사업기획 활용:**
- 백로그 증가 → 에이스 향후 발주 증가 예측
- 분기 매출 감소 → 에이스 발주 감소 선행 지표
- Powin 파산 후 Fluence 집중 리스크 모니터링

---

### 3-6. 기사 요약 (`app/api/article-summary/route.ts`)

**목적:** 뉴스 기사 본문을 에이스 관점으로 요약

**처리:**
1. 기사 URL fetch (8초 타임아웃, User-Agent 위장)
2. HTML에서 텍스트 추출 (우선순위: `<article>` → class 패턴 → `<p>` 태그 집합 → og:description)
3. 스크립트·스타일 제거, 최대 4000자로 자름
4. `gpt-4o-mini`로 요약 + 핵심 키워드 3개 생성
5. 본문 80자 미만이면 → "접근 제한" 메시지 반환 (graceful fallback)

---

### 3-7. PPT 자동생성 2단계 파이프라인

**왜 2개 API로 나뉘었나?** pptxgenjs가 Node.js `fs` 모듈을 사용해 브라우저에서 실행 불가. 클라이언트는 html2canvas로 차트 이미지만 캡처 후 서버로 전달.

**Step 1 — 텍스트 생성** (`app/api/report/route.ts`, POST)
- 입력: `newsItems[]` + `eiaData[]`
- GPT-4o (temperature 0.4)가 JSON으로 슬라이드 텍스트 생성
- 출력: `slide2/4/6` 제목+불릿, `executive_summary`

**Step 2 — 파일 생성** (`app/api/pptx/route.ts`, POST)
- 입력: Step 1 출력 JSON + 차트 이미지(base64) 2장
- pptxgenjs로 6슬라이드 생성 (LAYOUT_WIDE, Malgun Gothic)
  - Slide 1: 표지 (작성자: 오유빈, KITA 무역AX마스터 1기)
  - Slide 2: 시장 요약 + executive summary
  - Slide 3: EIA 차트 이미지 삽입
  - Slide 4: 규제·정책 동향
  - Slide 5: 경쟁사 포지셔닝 맵 이미지 (`competitor-tab` DOM 캡처)
  - Slide 6: 에이스엔지니어링 시사점
- 파일명: `에이스엔지니어링_시장인텔리전스_YYYYMMDD.pptx`
- 응답 헤더: `Content-Disposition: attachment` (바로 다운로드)
- ⚠️ 알려진 동작: PPT 버튼은 02 시장 탭에 있으므로 `eia-chart`(Slide 3)는 항상 캡처되지만, 03 경쟁사 탭이 렌더링되지 않은 상태면 `competitor-tab` 캡처가 비어 Slide 5 이미지가 생략됨(graceful degradation, 텍스트는 정상)

**진입점:** `MarketTab.tsx`의 "PPT 보고서 자동생성" 버튼 → `ReportModal` 오픈

---

### 3-8. 오늘의 인텔리전스 브리프 (`app/api/brief/route.ts` + `DailyBriefBar.tsx`) 🆕

**목적:** "정보는 많은데 결론이 없다"는 문제 해결 — 뉴스를 **의사결정 카드**로 변환

**왜 만들었나:** 사업기획 담당자는 기사 목록이 아니라 "그래서 오늘 에이스에 뭐가 기회고 뭐가 리스크인가"를 원함

**처리 과정:**
1. `DailyBriefBar`가 마운트되면 `/api/news` + `/api/news-overseas` 호출 (둘 다 30분 서버캐시 → 추가 비용 거의 0)
2. 취합한 items 상위 15개를 `/api/brief`로 POST
3. `gpt-4o-mini`가 에이스 관점으로 분류 → JSON 반환

**출력:**
```ts
{
  기회: string[],    // 에이스에 유리한 사실 (최대 3)
  리스크: string[],  // 불리한 리스크 (최대 3)
  경쟁사: string[],  // 경쟁사 주요 움직임 (최대 3)
  한줄요약: string   // 오늘 가장 중요한 한 가지
}
```

**프론트:** 헤더 바로 아래 **항상 표시**되는 3카드(기회/리스크/경쟁사) + 한줄요약. 대시보드를 열자마자 결론이 먼저 보임

---

### 3-9. 발주 예측 (`ForecastTab.tsx`, 탭 04) 🆕연결

**목적:** Fluence·Powin 분기 수주(MWh) → 에이스 예상 발주(컨테이너 수) 역산

**로직:** 컨테이너 1개 ≈ 3~5 MWh 기준으로 수주량을 발주량으로 환산. `에이스 생산 한도 추정`(800 MWh) ReferenceLine으로 캐파 초과 구간 시각화
**데이터:** 정적 (Fluence IR 보도자료 기반 재구성, 외부 API 아님)

---

### 3-10. 영업 파이프라인 (`PipelineTab.tsx`, 탭 05) 🆕연결

**목적:** 고객 딜을 발굴→제안→협상→계약 칸반으로 관리, D-7 팔로업 알림

**데이터:** **샘플 데이터** (실제 운용 시 Google Sheets 연동 → n8n 자동 업데이트 전제 — KITA 업무자동화 역량 연결점)
**외부 API 없음.** 면접 시 "샘플 데이터이며 n8n 자동화로 실데이터 연동 예정"임을 명시할 것

---

## 4. 데이터 모델

### API 공통 타입

```ts
// 뉴스 기사
type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  outlet: string;
  reason?: string;     // GPT가 붙인 관련 이유
  lowRelevance?: boolean; // fallback 기사 표시
};

// 경쟁사 이벤트 분류 (competitor-news)
type EventType = "수주" | "신제품" | "파트너십" | "공장·생산" | "규제·정책" | "재무" | "기타";

// 의사결정 브리프 (brief)
type BriefData = {
  기회: string[];
  리스크: string[];
  경쟁사: string[];
  한줄요약: string;
};

// EIA 데이터 포인트
type EIAPoint = { period: string; value: number };

// Fluence 분기 매출
type RevPoint = { period: string; revM: number };  // revM: 백만 달러

// PPT 슬라이드 데이터
type SlideData = {
  slide2_title: string; slide2_bullets: string[];
  slide4_title: string; slide4_bullets: string[];
  slide6_title: string; slide6_bullets: string[];
  executive_summary: string;
  chartImg?: string;   // base64 (html2canvas 캡처)
  compImg?: string;    // base64 (html2canvas 캡처)
};
```

### 정적 데이터 (`lib/data/ess-market.ts`)

데이터 신뢰도를 `type` 필드로 명시:
- `"actual"` — 공식 보고서 직접 발췌
- `"reconstructed"` — 요약본·언론 기사 기반 재구성 (IRENASTAT 원본 권장)
- `"forecast"` — 유료 리서치사 전망치 (BNEF/IEA)

---

## 5. API 목록

| URL | Method | 설명 | 주요 함수 | 프론트 호출처 |
|-----|--------|------|-----------|---------------|
| `/api/news` | GET | 국내 ESS 뉴스 (30분 서버캐시) | `fetchRSS`, `filterByEmbedding`, `filterByGPTBatch` | MarketTab, DailyBriefBar, ReportModal |
| `/api/news-overseas` | GET | 해외 ESS 뉴스 (30분 서버캐시) | `fetchRSS`, `filterByEmbedding`, `filterByGPT` | MarketTab, DailyBriefBar |
| `/api/competitor-news?competitor=X` | GET | 경쟁사 활동(이벤트 분류) | `fetchGoogleNews`, `classifyEvent` | CompetitorTab |
| `/api/eia` | GET | 미국 ESS 설치 용량 | `fetchYearCapacity` | MarketTab, ReportModal |
| `/api/fluence` | GET | Fluence 실적·백로그 | `isSingleQuarter`, `isFiscalYear` | CustomerIntelTab |
| `/api/article-summary?url=X` | GET | 기사 본문 요약 | `extractArticleText` | ArticleSummaryModal |
| `/api/report` | POST | PPT 텍스트 생성 | GPT-4o 직접 호출 | ReportModal |
| `/api/pptx` | POST | PPT 파일 생성 | pptxgenjs | ReportModal |
| `/api/brief` 🆕 | POST | 의사결정 카드(기회/리스크/경쟁사) | GPT-4o-mini 직접 호출 | DailyBriefBar |

> ✅ **연결 검증 완료:** 9개 API 전부 1개 이상의 컴포넌트에서 호출됨. orphan 라우트 없음.
> ✅ **컴포넌트 검증 완료:** 8개 컴포넌트 전부 렌더 트리에 연결됨 (`next build` 통과, orphan 없음).

---

## 6. 비용 구조

| 기능 | 모델 | 단가 | 1회 비용 | 월 10회/일 기준 |
|------|------|------|----------|-----------------|
| 임베딩 (국내) | text-embedding-3-small | $0.02/1M tokens | ~$0.0003 | ~$0.09 |
| 임베딩 (해외) | text-embedding-3-small | $0.02/1M tokens | ~$0.0004 | ~$0.12 |
| GPT 배치 (국내) | gpt-4o | $5/$15 per 1M | ~$0.03 | ~$9 |
| GPT 배치 (해외) | gpt-4o | $5/$15 per 1M | ~$0.04 | ~$12 |
| 기사 요약 | gpt-4o-mini | $0.15/$0.6 per 1M | ~$0.001 | ~$0.3 |
| 의사결정 브리프 🆕 | gpt-4o-mini | $0.15/$0.6 per 1M | ~$0.0008 | ~$0.24 |
| PPT 텍스트 | gpt-4o | $5/$15 per 1M | ~$0.02 | ~$6 |
| **월 합계** | | | | **~$28** |

- EIA API, SEC EDGAR API: **무료**
- 브리프는 뉴스 30분 서버캐시를 재활용하므로 임베딩/배치 비용 추가 없음 (gpt-4o-mini 호출 비용만 발생)

---

## 7. LOGIC.md 설명서 vs 실제 코드 차이점

> 면접에서 "설명서 보고 왔는데 실제는 다른 게 있나요?"라고 물으면 이 부분.

| 항목 | LOGIC.md (설명서) | 실제 코드 |
|------|-------------------|-----------|
| 국내 언론사 수 | 4개 언론사 | **6개** (knews기술, 동아일보 추가) |
| 경쟁사 수 | 5개 언급 | **8개** (texson, sungrow 추가) |
| 임베딩 후 기사 수 | "상위 80개" | 임계값 0.30 기반 가변 필터 (숫자 고정 아님) |
| 해외 뉴스 기능 | 언급 없음 | `/api/news-overseas` **별도 존재** |
| Fluence 재무 기능 | 언급 없음 | SEC EDGAR XBRL API 연동 (수주잔고 추적) |
| 기사 상세 요약 | 언급 없음 | `gpt-4o-mini` 기반 요약 모달 기능 |
| GPT 0개 반환 시 | 언급 없음 | 임베딩 상위 3개 fallback + 경고 레이블 |
| 데이터 신뢰도 표기 | 없음 | ess-market.ts에 actual/reconstructed/forecast 명시 |
| 의사결정 브리프 🆕 | 없음 | `/api/brief` + DailyBriefBar (기회/리스크/경쟁사 카드) |
| 경쟁사 탭 🆕 | "기사 5개 나열" | 이벤트 타입 자동분류 Activity Feed |
| 발주 예측·파이프라인 🆕 | 없음 | ForecastTab(04)·PipelineTab(05) 화면 연결 |

---

## 8. 사업기획 관점 분석

### 이 대시보드가 지원하는 의사결정

| 의사결정 | 지원 기능 |
|----------|-----------|
| "Fluence 발주가 줄어들 것 같다" | 백로그 감소 추세 → 신규 고객 발굴 긴급도 판단 |
| "IRA 관세 변동 어떻게 되나" | 국내·해외 뉴스 자동 필터링 |
| "경쟁사 CATL이 새 제품 발표했나" | 경쟁사 탭 실시간 모니터링 |
| "임원 보고 자료 만들어야 한다" | PPT 자동생성 (10분 이내) |
| "미국 ESS 시장 성장률이 어느 수준인가" | EIA 공식 데이터 차트 |

### 현재 기술 → 사업기획 연결 강도

- **강함:** 뉴스 수집·필터링 (직무 관련 정보 취합 자동화)
- **강함:** Fluence 백로그 추적 (고객 리스크 조기 감지)
- **중간:** PPT 생성 (형식은 갖췄으나 분석 깊이는 사람이 보완 필요)
- **보완 필요:** 뉴스 → 에이스 매출 영향 수치화 로직은 없음 (GPT 이유 설명 수준에 그침)

---

## 9. 개선 가능한 부분

### 현재 한계
1. 뉴스 관련성 판단이 GPT에 의존 → 프롬프트 변경 시 결과 달라짐
2. `ess-market.ts` 일부 데이터가 `reconstructed` (원본 미확인)
3. 기사 요약 시 유료 언론사 paywall로 본문 미수집 케이스 다수
4. Fluence 한 고객 집중 리스크 → 다른 ESS SI 업체(NextEra, AES 등) 백로그 미수집

### 향후 확장 방향
1. DART(전자공시) 연동 → 에이스엔지니어링 자사 실적 자동 반영
2. 주요 기사 → Slack/이메일 알림 자동화 (n8n 연동)
3. 뉴스 트렌드 주간 요약 → 구글 시트 자동 기록
4. 에이스 수주 데이터와 Fluence 백로그 상관관계 분석 추가

---

## 10. 면접 예상 질문 & 답변 포인트 (20문항)

### 기술 이해 관련

**Q1. 임베딩과 GPT를 둘 다 쓰는 이유는?**
- 의도: 비용·정확도 트레이드오프 이해 확인
- 핵심 답변: 임베딩은 빠르고 저렴하지만 "왜 관련 있는지" 설명 불가. 300개 기사 중 임베딩으로 30개로 좁힌 뒤 GPT로 최종 판단 — 비용 90% 절감하면서 정확도 유지
- 심화 질문: "임베딩 임계값 0.30은 어떻게 정했나?" → 실험적으로 결정. 너무 낮으면 노이즈, 너무 높으면 조용한 날 기사 0개. fallback 0.25로 안전망

**Q2. Promise.all이 뭔가요?**
- 의도: 병렬 처리 이해
- 핵심 답변: 여러 요청을 동시에 보내는 것. 15개 RSS 피드를 순차로 받으면 15배 시간 걸리지만 Promise.all로 한 번에 → 가장 느린 피드 1개 응답시간만 기다림

**Q3. 캐싱은 왜 하나요?**
- 의도: 비용 최적화 이해
- 핵심 답변: OpenAI API는 호출할 때마다 비용 발생. RSS는 30분, EIA/Fluence는 24시간 캐시 → 같은 시간대에 여러 명이 사용해도 비용은 1회분만 발생

**Q4. pptxgenjs를 왜 서버에서만 실행하나요?**
- 의도: 브라우저 vs Node.js 환경 이해
- 핵심 답변: pptxgenjs가 파일 시스템(node:fs) 사용. 브라우저에는 파일 시스템이 없음. 그래서 차트 이미지는 클라이언트(html2canvas)로 캡처하고, PPT 조립은 서버에서 실행

**Q5. SEC EDGAR를 왜 사용했나요?**
- 의도: 데이터 소싱 전략
- 핵심 답변: Fluence는 미국 나스닥 상장사 → 분기 실적을 SEC에 의무 공시. 공식 무료 API 제공. Fluence 백로그(수주잔고) 추적으로 에이스 향후 발주량 사전 예측 가능

**Q6. response_format: json_object를 쓰는 이유?**
- 의도: 프로덕션 레벨 안정성 이해
- 핵심 답변: GPT가 JSON 이외 텍스트(예: "다음은 JSON입니다:") 반환 시 `JSON.parse` 에러 발생. json_object 강제하면 항상 파싱 가능한 JSON만 반환

**Q6-1. 경쟁사 이벤트 분류는 왜 GPT가 아니라 정규식인가요?** 🆕
- 의도: 비용·적정 기술 선택 판단
- 핵심 답변: "수주/신제품/파트너십" 분류는 제목 키워드로 충분히 잡힘(award, launch, MOU 등). GPT를 쓰면 기사당 비용이 붙지만 정규식은 0원·즉시. 의미 판단이 필요한 뉴스 선별엔 GPT, 단순 라벨링엔 규칙 — 문제에 맞는 도구를 골랐습니다

**Q6-2. 의사결정 브리프는 어떻게 추가 비용 없이 만들었나요?** 🆕
- 의도: 캐시 설계 이해
- 핵심 답변: 브리프는 이미 수집된 뉴스(`/api/news`)를 30분 서버 인메모리 캐시에서 재활용합니다. 임베딩·GPT 배치는 다시 안 돌고, 분류만 gpt-4o-mini로 한 번 호출 → 월 $0.24 수준. 같은 데이터를 세 곳(시장 탭·브리프·PPT)이 공유해도 OpenAI 비용은 30분당 1회분

### 사업기획 연결 관련

**Q7. 이 대시보드로 어떤 의사결정을 지원할 수 있나요?**
- 의도: 기술→비즈니스 연결 능력
- 핵심 답변: 3가지. ① Fluence 백로그 감소 감지 → 신규 고객 발굴 긴급도 판단 ② IRA·관세 뉴스 자동 수집 → 수출 전략 조정 근거 ③ 경쟁사 신제품 발표 모니터링 → 기술·가격 대응

**Q8. Fluence 백로그가 에이스와 어떤 관계인가요?**
- 의도: 업 이해도
- 핵심 답변: Fluence는 ESS 통합(SI) 업체. 에이스는 Fluence에 인클로저(배터리 외함)를 공급. Fluence 백로그 = Fluence가 아직 납품 못한 수주잔고 → 이 물량을 채우기 위해 에이스에 발주. 백로그 증가하면 에이스 발주도 늘어남

**Q9. 데이터 신뢰도를 actual/reconstructed/forecast로 나눈 이유?**
- 의도: 데이터 리터러시
- 핵심 답변: 사업기획 보고서에 불확실한 수치를 마치 공식 데이터처럼 쓰면 경영진 판단 오류. 코드에 `sourceNote` 필드를 붙여 "이 수치는 BNEF 요약 기반 추정이므로 원본 확인 필요"를 명시

**Q10. 이 대시보드가 사업기획 업무의 어떤 부분을 자동화했나요?**
- 핵심 답변: ① 매일 아침 뉴스 수동 검색(30분) → 자동 필터링(5분) ② Fluence IR 분기 보고서 수동 확인 → 실시간 차트 ③ 임원 보고 PPT 반나절 작업 → 10분 자동생성

### 개선·한계 관련

**Q11. 이 프로젝트의 한계는?**
- 핵심 답변: 뉴스 관련성이 GPT 판단에 의존해 프롬프트 변경 시 결과 달라짐. ess-market.ts 일부 수치가 재구성 데이터. 유료 언론사 paywall로 기사 본문 수집 실패 케이스 있음

**Q12. Fluence 말고 다른 고객사도 모니터링 가능한가요?**
- 핵심 답변: 상장사라면 SEC EDGAR에서 CIK 번호만 바꾸면 됨. 현재는 Fluence(CIK 0001868941) 집중. Powin이 파산한 만큼 NextEra Energy, AES 등 신규 고객 후보를 추가하는 확장이 자연스러운 다음 단계

**Q13. 뉴스가 오래되면 어떻게 되나요?**
- 핵심 답변: RSS 파싱 시 24시간 이내 기사만 통과. Next.js revalidate로 30분 캐시. GPT 0개 반환 시 임베딩 상위 3개 fallback + "오늘 직접 관련 기사 없음" 경고 표시

**Q14. 해외 뉴스와 국내 뉴스를 왜 분리했나요?**
- 핵심 답변: 피드 소스가 완전히 다르고(한국 RSS vs 영문 RSS), GPT 프롬프트 언어도 달라야 함. 국내는 한국어 맥락으로 엄격하게, 해외는 영어로 포용적으로 필터링

**Q15. 비용을 어떻게 관리하나요?**
- 핵심 답변: 캐시 계층으로 중복 API 호출 차단. 임베딩으로 1차 필터 후 GPT 투입(GPT가 300개 전부 처리하면 비용 10배). gpt-4o-mini를 기사 요약에 투입해 비용 절감

**Q16. 왜 Google News RSS를 경쟁사 뉴스에 사용했나요?**
- 핵심 답변: 한국 언론에 Rittal, TLS Energy 같은 해외 경쟁사 기사가 거의 없음. Google News는 전 세계 언론을 검색어로 필터링해 최신 기사를 RSS로 제공

**Q17. 단독 기사에 +0.05 점수 보너스를 준 이유?**
- 핵심 답변: 제목에 "단독" 포함된 기사는 다른 언론사가 아직 다루지 않은 첫 보도. 사업기획 관점에서 선제 정보로 가치 높음

**Q18. 이 프로젝트를 실제 에이스엔지니어링에서 쓸 수 있을까요?**
- 핵심 답변: 핵심 기능은 즉시 활용 가능. 보완 필요한 부분: DART 자사 실적 연동, Slack 알림 자동화, 유료 paywall 기사 대응, 데이터 정합성 주기적 검증

**Q19. 사업기획 담당자가 매일 어떻게 활용하나요?**
- 핵심 답변: ① 출근 후 대시보드 열면 **오늘의 브리프**(기회/리스크/경쟁사)로 결론부터 확인 ② "02 시장·뉴스" 탭에서 근거 기사 드릴다운 ③ "03 경쟁사" 활동 로그로 수주/신제품 체크 ④ 주간: "01 고객" Fluence 백로그 + "04 발주예측"으로 물량 가늠 ⑤ 임원 보고 전: PPT 자동생성

**Q20. 이 프로젝트에서 가장 어려웠던 기술적 문제는?**
- 핵심 답변: Fluence SEC EDGAR 데이터 정제. 분기 실적인지 연간 누계인지 구분하는 로직 — 제출 날짜 기준이 아닌 `start~end` 기간 일수(75~100일 = 단일 분기)로 판단. 같은 end 날짜에 여러 filing이 있으면 최신 filing 우선 적용하는 중복 제거도 추가 구현

---

## 11. 변경 이력 (2026-06-03 개선)

### 신규 기능
- 🆕 **DailyBriefBar + `/api/brief`** — 뉴스를 의사결정 카드(기회/리스크/경쟁사)로 변환, 헤더 아래 상시 표시
- 🆕 **경쟁사 Activity Feed** — `classifyEvent()`로 이벤트 7종 자동 분류 + 타입 필터
- 🆕 **30분 서버 인메모리 캐시** — `/api/news`, `/api/news-overseas` 이중 OpenAI 호출 방지
- 🆕 **화면 연결** — ForecastTab(04), PipelineTab(05), ReportModal(PPT 버튼) — 기존엔 코드만 있고 미연결이던 컴포넌트를 렌더 트리에 편입

### 버그·에러 수정
- **TS2802 (matchAll iterator ×4)** — `tsconfig.json`에 `target: es2020` + `downlevelIteration: true` 추가
- **TS2345 (Buffer)** — `/api/pptx`에서 `pptx.write()` 결과를 `Uint8Array`로 변환해 `NextResponse` body 호환
- **ReportModal 데이터 수집 버그** — 존재하지 않는 `/api/news?topic=eu|ira` 호출 → `/api/news` 단일 호출로 정정
- **PPT 캡처 대상 버그** — 존재하지 않는 `positioning-map` DOM → 실제 존재하는 `competitor-tab`으로 정정

### 검증
- `next build` 통과 (13개 라우트, ESLint·타입체크 OK)
- API 9개·컴포넌트 8개 전부 연결 확인 (orphan 0)

---

*작성 기준: 2026-06-03, 실제 소스코드 전수 분석 · 개선 반영*
