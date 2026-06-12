# 에이스엔지니어링 대시보드 개발 로그

> 마지막 업데이트: 2026-05-29

---

## 현재 상태 요약

**완성된 것:**
- Next.js 14 프로젝트 세팅 완료 (`npm install` 완료)
- 디자인 토큰 CSS 완성 (`globals.css`)
- 2탭 구조 완성 (Tab1: 시장·규제, Tab2: 경쟁사 레이더)
- PPT 자동생성 플로팅 버튼 + 모달 완성
- 뉴스 AI 필터링 로직 완성 (GPT-4o-mini)

**아직 안 된 것:**
- API 키 세팅 (.env.local)
- data.go.kr API 키 발급 (관세청, KOTRA)
- 실제 실행 테스트 미완
- CompetitorTab 뉴스 reason 표시 업데이트 필요

---

## 파일 구조

```
next-dashboard/
├── app/
│   ├── layout.tsx          ← 루트 레이아웃 (Noto Sans KR)
│   ├── page.tsx            ← 2탭 구조 + PPT 플로팅 버튼
│   ├── globals.css         ← 에이스 디자인 토큰
│   └── api/
│       ├── news/route.ts   ← 뉴스 RSS 수집 + GPT 필터링
│       ├── eia/route.ts    ← 미국 ESS 설치 데이터
│       ├── report/route.ts ← GPT-4o 보고서 텍스트 생성
│       └── pptx/route.ts   ← pptxgenjs PPT 생성 (서버사이드)
├── components/
│   ├── MarketTab.tsx       ← Tab1: 시장·규제
│   ├── CompetitorTab.tsx   ← Tab2: 경쟁사 레이더
│   └── ReportModal.tsx     ← PPT 생성 모달
├── lib/data/
│   └── ess-market.ts       ← 정적 ESS 시장 데이터 (참고용)
├── .env.local              ← API 키 (아래 참조)
└── .env.local.example      ← 키 형식 예시
```

---

## .env.local 필요한 키

```
OPENAI_API_KEY=sk-...           ← 보유 중
EIA_API_KEY=                    ← 미발급 (https://www.eia.gov/opendata/register.php)
KOTRA_API_KEY=                  ← 미발급 (data.go.kr)
CUSTOMS_API_KEY=                ← 미발급 (data.go.kr)
```

---

## API 라우트 상세

### `/api/news` (GET)
- **역할**: 4개 언론사 RSS → GPT-4o-mini 필터링 → 에이스 관련 기사 8개 반환
- **언론사**: 매일경제(3섹션) · 한국경제(3섹션) · 연합뉴스(3섹션) · 전자신문(4섹션) = 총 13개 피드
- **필터 기준**: 조회 시각 기준 24시간 이내 기사만
- **병렬 처리**: `Promise.all`로 언론사별 → 섹션별 모두 병렬
- **단독 우선**: 제목에 "단독" 포함 시 GPT에게 우선 검토 지시
- **GPT 프롬프트**: 에이스엔지니어링 회사 맥락 포함, 관련 기사 index + reason 반환
- **응답 형태**:
  ```json
  {
    "items": [
      {
        "title": "기사 제목",
        "link": "https://...",
        "pubDate": "Thu, 29 May 2026 ...",
        "outlet": "매일경제",
        "reason": "IRA 보조금 변동 → 에이스 미국 수주에 직결"
      }
    ],
    "scanned": 87,
    "byOutlet": { "매일경제": 23, "한국경제": 18, "연합뉴스": 31, "전자신문": 15 }
  }
  ```

### `/api/eia` (GET)
- **역할**: 미국 EIA API → 배터리 ESS 연간 설치 용량 (MW)
- **API 키 없을 때**: fallback 데이터 자동 반환 (데모용)
- **캐시**: 24시간
- **응답**: `{ source, data: [{period, value}], unit: "MW" }`

### `/api/report` (POST)
- **역할**: 뉴스 + EIA 데이터 받아서 GPT-4o로 슬라이드 텍스트 생성
- **모델**: `gpt-4o` (보고서 품질 우선)
- **입력**: `{ newsItems, eiaData }`
- **출력**: `{ slide2_title, slide2_bullets, slide4_title, slide4_bullets, slide6_title, slide6_bullets, executive_summary }`

### `/api/pptx` (POST)
- **역할**: 슬라이드 데이터 + 차트 이미지 받아서 .pptx 파일 생성
- **왜 서버**: pptxgenjs가 node:fs 사용 → 클라이언트에서 실행 불가
- **입력**: SlideData + chartImg(base64) + compImg(base64)
- **출력**: `.pptx` 파일 다운로드 (Content-Disposition 헤더)
- **슬라이드 구성**:
  1. 표지 (날짜·작성자 자동)
  2. 시장 요약 (GPT 작성)
  3. EIA 차트 (캡처 이미지)
  4. 규제 동향 (GPT 작성)
  5. 경쟁사 포지셔닝 맵 (캡처 이미지)
  6. 에이스 시사점 (GPT 작성)

---

## 컴포넌트 상세

### `MarketTab.tsx`
- **논리 체인 카드**: 삭제 예정 (교육용이라 사업기획팀엔 불필요)
- **EIA 차트**: `id="eia-chart"` → PPT 캡처용
- **뉴스 피드**: 3개 토픽(EU·IRA·ESS) → `/api/news` 호출
- **reason 표시**: ↳ 파란 텍스트로 AI 관련성 이유 표시 ✅
- **단독 배지**: 빨간 테두리 "단독" 뱃지 표시 ✅

### `CompetitorTab.tsx`
- **포지셔닝 맵**: `id="positioning-map"` → PPT 캡처용
- **경쟁사 데이터**: 하드코딩 (에이스·TLS·Rittal·신성에스티·CATL)
- **뉴스 패널**: 경쟁사별 `/api/news` 호출
- **⚠️ TODO**: reason 표시 아직 미적용 → MarketTab과 동일하게 업데이트 필요

### `ReportModal.tsx`
- **흐름**: 데이터수집 → GPT 텍스트 → html2canvas 캡처 → /api/pptx → 다운로드
- **단계 표시**: idle / fetch-data / ai-writing / capturing / building / done / error

---

## 내일 이어서 할 작업 (우선순위 순)

### 1순위 — API 키 발급 및 테스트
- [ ] EIA API 키 발급: https://www.eia.gov/opendata/register.php (이메일 인증 1분)
- [ ] data.go.kr 가입 후 API 키 신청:
  - 관세청 수출입무역통계: https://www.data.go.kr/data/15100475/openapi.do
  - KOTRA 해외시장뉴스: https://www.data.go.kr/data/15034831/openapi.do
- [ ] `.env.local`에 키 입력 후 `localhost:3001`에서 실제 데이터 확인

### 2순위 — 관세청·KOTRA API 라우트 추가
- [ ] `app/api/trade/route.ts` — 관세청 HS 8537 수출입 데이터
- [ ] `app/api/kotra/route.ts` — KOTRA 해외시장 뉴스
- [ ] Tab1 MarketTab에 관세청 차트 추가 (국가별 수출액 바차트)

### 3순위 — 프런트 개선
- [ ] `CompetitorTab.tsx` 뉴스 카드에 reason 표시 (MarketTab과 동일하게)
- [ ] `MarketTab.tsx` 논리 체인 카드 제거 → 그 자리에 관세청 차트
- [ ] Tab2 국내 규제 탭 추가 (Google News RSS 한국어 검색어)

### 4순위 — 주가 모니터 (Alpha Vantage)
- [ ] `app/api/stocks/route.ts` — FLNC · 삼성SDI · LG에너지 · 선그로우 주가
- [ ] CompetitorTab에 주가 카드 4개 추가

### 5순위 — PPT 완성도
- [ ] 실제로 PPT 생성해서 슬라이드 디자인 확인
- [ ] 폰트 깨지는지 확인 (Malgun Gothic 서버에 있는지)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js 14.2.3 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS + CSS 변수 |
| 차트 | Recharts |
| AI | OpenAI GPT-4o (보고서) · GPT-4o-mini (뉴스 필터) |
| PPT | pptxgenjs (서버사이드) |
| 캡처 | html2canvas (클라이언트) |
| 아이콘 | lucide-react |
| 실행 | `npm run dev` → localhost:3001 |

---

## 알려진 이슈 / 주의사항

- `pptxgenjs`는 반드시 서버(API 라우트)에서만 실행. 클라이언트에서 import하면 `node:fs` 에러 발생
- EIA API 키 없으면 fallback 데이터 자동 사용 (차트는 보임, 실시간 아님)
- 연합뉴스 RSS는 비상업적 용도만 허용 (개인 포트폴리오 용도는 해당)
- 전자신문 RSS URL이 `http://` (https 아님) — fetch 시 `insecure` 경고 가능
- 뉴스 API 응답 캐시: `revalidate: 1800` (30분) — 개발 중 캐시 무시하려면 hard refresh
