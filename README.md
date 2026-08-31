# 에메랄드 베이유 (Emerald Bayou)

> **한글화 / 포크 프로젝트** — 원본 [Vheissu/emerald-bayou](https://github.com/Vheissu/emerald-bayou)의 **모든 UI/메뉴/HUD/임무/무전/스토리 텍스트를 한국어로 완전 번역**한 버전.
> 라이선스: 원본 **MIT** 그대로 보존.

[🎮 **라이브 게임 플레이** (GitHub Pages)](https://sigco3111.github.io/emerald-bayou/) · [📦 원본 저장소](https://github.com/Vheissu/emerald-bayou)

---

## 🌊 게임 소개

남플로리다 에버글레이즈 백컨트리(backcountry)에서 에어보트로 화물 운송, 시내 경주, 야생 구조 작업을 수행하는 **1인칭 3D 시뮬레이션**입니다.

- **25.6 km × 25.6 km** 면적의 절차적 생성 습지
- **16개 본 의뢰** + 일일 현상금 + 거주 주민들의 일상 작업
- **무전기 채널 68**을 통한 NOAA 기상 경고, 주민 호출, 스토리 아크
- 살아있는 야생동물 (마네키, 악어, 올리브바다거북, 흰두루미, 해달이, 돌고래, 붉은따오기, 너구리 등)
- 변덕스러운 날씨 — 자욱한 안개, 폭우, 허리케인, 토네이도, 만조
- **FWC**(플로리다 어류·야생동물국) 추격 시스템 — 5단계 수배 등급

| | |
|---|---|
| ![가정 강 미드 애프터눈](/docs/screenshots/01-hero.jpg) | ![시내 32 mph 주행 파도](/docs/screenshots/03-wake.jpg) |
| ![스포트라이트 켠 야간 채널](/docs/screenshots/05-night.jpg) | ![뇌우 속 사이프러스 아래 어선 캠프](/docs/screenshots/07-camp.jpg) |

> 모든 환경은 런타임 절차적으로 생성되며, 단 몇 개의 GLB 소품 모델만 미리 로드합니다. 지형·강·톱블레이드·사이프러스·어선 캠프·독 위 인물까지 모두 월드 좌표에서 시드되어, 지도는 매번 로드할 때마다 동일하게 결정됩니다. 디스크에는 어떤 데이터도 저장되지 않습니다.

---

## 🛠️ 한글화 노트 (Korean Localization)

원본 저장소의 **모든 표시 텍스트**(UI, 메뉴, HUD, 임무 정의, 토스트 알림, 무전기 본문, 채널 68 스토리, 주민 메시지, 어종 이름, 평판 등급, 항로 표지 알림, 자연 메모 등)를 **한국어로 자연스럽게 번역**했습니다.

| 영역 | 처리 |
|---|---|
| 시작 화면 / 일시정지 메뉴 / 결과 화면 | ✅ 한국어 |
| 16개 본 의뢰 (title + desc + sub + label + toast) | ✅ 한국어 |
| 채널 68 무전기 (NOAA + 주민 호출) | ✅ 한국어 |
| 스토리 아크 (주민 의뢰 + 계약) | ✅ 한국어 |
| 어종 / 낚시 메시지 | ✅ 한국어 |
| 항로 표지 알림 | ✅ 한국어 |
| 야외 기록 / 발견 메시지 | ✅ 한국어 |
| 평판 등급 라벨 (주민 / FWC / 뒷골) | ✅ 한국어 |
| HUD 단위 (mph, ft, mi 등) | ✅ 단위 보존, 라벨 한국어 |

**번역 정책 (엄격):**
1. **표시 텍스트만** 한국어로 교체 — 식별자(key, id, value, region, zone, callsign), 색깔 hex, 좌표, 상태 enum, 채널 이름, 라이선스 약어는 **절대 변경 안 함**
2. **한자 / 한문 사용 안 함** — 순수 한국어 + 약어(FWC, NOAA)
3. **직역보다 의미 전달** — 플로리다/베이유 정서는 유지하되 한국 독자가 자연스럽게 이해할 수 있도록
4. **약어 보존** — FWC(플로리다 어류·야생동물국), NOAA, Air 2, Mud Hen 등은 그대로 표기
5. **상태 영문 보존** — 'done', 'fail', 'wipeout', 'clean', 'medal: GOLD' 같은 enum 값은 그대로 — 한글로는 '금메달' 라벨만 변경

---

## 🚀 시작하기

### 설치 / 개발 서버

```bash
git clone https://github.com/sigco3111/emerald-bayou.git
cd emerald-bayou
npm install
npm run dev
```

브라우저에서 [http://127.0.0.1:5173](http://127.0.0.1:5173) 열기.

### 빌드 / 배포

```bash
npm run build       # → dist/ 정적 사이트
npm run preview     # 로컬 미리보기
```

### 다운로드 자산

GLB 모델(보트, 운전자, 악어, 풀 덤불, 사이프러스 3종)은 저장소에 포함되어 있지 않습니다 (총 150 MB, 그 중 하나가 GitHub 파일 크기 제한 초과). 릴리스 자산에서 다운로드:

```bash
curl -L https://github.com/sigco3111/emerald-bayou/releases/latest/download/emerald-bayou-models.zip -o models.zip
unzip models.zip -d public/models
```

> **모델 없이도 플레이 가능** — `src/models.js`가 로드 실패 시 절차적 대체물을 사용합니다. 다만 시각적 완성도는 현저히 떨어집니다.

---

## 🎮 컨트롤

### 키보드

| 키 | 동작 |
|---|---|
| `W` / `S` | 스로틀 / 후진 |
| `A` / `D` | 키 (공중에선 좌우 스핀) |
| 공중 `S` / `Shift` | 뒤로 / 앞으로 기울임 |
| `드래그` | 둘러보기 |
| `V` | 추적 / 헬름 카메라 전환 |
| `E` | 상호작용 (의뢰, 독, 함정, 야외 기록, 항로 신고) |
| `C` | 캐스트 / 후크 / 릴 |
| `X` | 릴 인 또는 라인 끊기 |
| `G` | 닻 내리기 / 거두기 (정지 상태) |
| `M` | 의뢰 게시판 |
| `Tab` | 해도 |
| `L` | 스포트라이트 |
| `H` | 경적 (자욱한 안개 시 4.5초 장음) |
| `R` | 보트 리셋 |

### 게임패드

| 버튼 | 동작 |
|---|---|
| `RT` / `LT` | 아날로그 스로틀 / 후진 |
| 좌 스틱 | 키 (공중에선 피치/스핀) · 클릭 시 카메라 전환 |
| 우 스틱 | 둘러보기 · 클릭 시 카메라 중앙 |
| `A` / `×` | 상호작용 |
| `X` / `□`, `B` / `○`, `Y` / `△` | 낚시 / 보조 동작 / 라인 끊기 / 닻 |
| `LB`, `RB`, View, Menu | 스포트라이트 / 경적 / 해도 / 일시정지 |

타이틀 / 일시정지 메뉴 전체에서 D-패드 사용 가능. 수상 상태에서 D-패드 ↑로 의뢰 게시판 호출. 지원되는 컨트롤러는 선체 충돌 / 강 착지 시 진동.

---

## 📜 의뢰 (16개)

본 시퀀스에서 순서대로 잠금 해제됩니다.

| # | 한글 | 영문 | 보상 |
|---|---|---|---|
| 1 | 시운전 항해 | Shakedown Run | $250 |
| 2 | 마네키 개체수 조사 | Manatee Count | $350 |
| 3 | 사이프러스 질주 | Cypress Sprint | $500 |
| 4 | 게통 회수 | Trap Line | $400 |
| 5 | 밀렵꾼 추적 | Poacher Chase | $650 |
| 6 | 모래톱 스턴트 | Sandbar Sessions | $450 |
| 7 | 물자 보급 | Supply Run | $550 |
| 8 | 길 잃은 카약 | Lost Kayaker | $600 |
| 9 | 성가신 악어 | Nuisance Gator | $700 |
| 10 | 크릭 전장 | Creek Gauntlet | $700 |
| 11 | 침몰한 스키프 | Sunken Skiff | $450 |
| 12 | 대공 점프 | Big Air | $500 |
| 13 | 베이유 그랜드 투어 | Bayou Grand Tour | $800 |
| 14 | 레드라인 분할 | Redline Splits | $760 |
| 15 | 3킥커 서킷 | Three-Kicker Circuit | $820 |
| 16 | 배달 릴레이 | Dispatch Relay | $950 |

각 의뢰는 본인 클리어 후에도 더 빠른 기록 / 더 높은 메달로 반복 도전 가능.

---

## 🛠️ 기술 스택

- **렌더링**: Three.js (WebGL) + 절차적 셰이더 (반사 / 굴절 / 탄닌 흡수)
- **빌드**: Vite 8.x
- **언어**: 순수 JavaScript (프레임워크 없음) + 약간의 GLSL 셰이더
- **저장**: localStorage (저장 슬롯 v1 → v2 마이그레이션 지원)
- **자산**: 7개 GLB 모델 (릴리스 다운로드) + 절차적 대체물
- **테스트**: 내장 `node --test` (71개 시나리오 — 충돌 회피, FWC 추격, 야생동물 상호작용, 안개 등)

```
src/
  main.js          메인 부트스트랩 + 메인 루프
  game.js          게임 상태, 의뢰 16개, HUD, 메뉴, 결과, 저장
  airboat.js       에어보트 시뮬레이션
  radio.js         채널 68 무전기 + NOAA 기상 + 주민 호출
  contracts.js     거주 주민 의뢰 시스템
  story.js         채널 68 메인 스토리 아크 (Running Dark)
  passage.js       케이스 / 구조 미션
  aftermatch.js    폭풍 후 결과 시스템
  encounters.js    구조 / 순찰 / 경주 / 밀수 / 야생 호출 이벤트
  incidents.js     환경 사건 (표류 통, 잔해, 화재)
  law.js           FWC 수배 추격 시스템
  radio.js         채널 68 무전기 메시지
  fauna + wildlife + wildlife behavior...
  radio / contracts / story / encounters / incidents / passage / law / reputation / navigationaids / ecology / marshfire / stormline / airrescue / dolphin / stormhazards / downburst / waterspout / lightning / settlementpower / surfacewetness / nocturnal / wrangler / vegetation / texture / environment / sky / water / fishing / folk / hud / loading-screen / gamepad / startup / ...
```

---

## 🎯 게임 시스템 (일부만 발췌)

### 시뮬레이션

- 25.6 km × 25.6 km 결정론적 절차적 지형 (시드 기반, 매번 동일)
- 16평방마일 스트리밍 강, 톱블레이드 평원, 사이프러스 능선
- 7명의 거주 선원 — 각자 일정, 의뢰, 운영 기록을 유지하며, 자기 보트가 감당 못 하는 날씨엔 대피합니다. 깨어진 자망을 불평하고, 충돌을 기억합니다.
- 주민 보트가 마네키의 등·발자국을 감시합니다. **5Hz**로 7초 후 가장 가까운 접근을 예측, 인간적 템포 후 슬로우다운 후 안전한 물로 방향 전환.

### 추격 / FWC 시스템

- 5단계 수배 등급
- 4단계: **Shallow Water 4**가 현재 코스를 읽고, 깊이/장애물 예측 보간 후 앞질러 횡단으로 나옵니다. 일찍 방향을 틀면 로드블록을 피할 수 있습니다.
- 5단계: 지속 추격 시 **FWC Air 2** 헬리콥터가 합류합니다 (바람/폭풍 조건이 비행 가능할 때만).

### 날씨

- 맑고 바람 적은 밤에는 자욱한 안개가 새벽 전 형성되고 일출 후 걷힙니다 — 시야가 수백 m로 떨어집니다.
- 모든 모터보트는 속도를 줄이고, 항법등을 켜고, 진행 시 4.5초 장음을 울립니다.

### 수문학

- 실제 반사/굴절 패스
- 탄닌 흡수 맵 (터레인 워커가 렌더링 → 그늘 물이 검게 보이고 부레옥잠이 자라남)
- 만조 — 해안선이 0.4 m 안팎으로 움직임
- 깨어진 자국은 표면에 stamp를 찍고, 떠다니는 잔해를 밀어냄
- 얕은 물에서 배의 압력파는 갈색 퇴적 플룸을 일으킴 — 같은 해류로 떠다님

### Dev Hooks

브라우저 콘솔에서 `window.__dbg` 사용 가능 — 렌더러, 카메라, 터레인, 물리, 환경, 생태, 항해, 추격, 무전기, 야간 시스템 등 모든 게임 시스템 노출.

```
__dbg.mode = 'depth'                      // full | raw | nowater | depth | refl
__dbg.phys.reset(x, z, heading)           // 텔레포트
__dbg.environment.minutesPerSecond = 0    // 시계 정지
__dbg.environment.setHour(17.4)           // 조명 직접 선택
__dbg.ecology.setBioluminescence(1, true) // 발광 강제
__dbg.discoveries.start('roseate-roost', true, true) // 야외 표지 강제 표시
Alt+Shift+U                                // 주민 보트/마네키 교차 시험 1회
__dbg.environment.setRainbow(1)            // 무지개 강제
__dbg.audio.spatialStats()                 // 공간 노드 사용 통계
```

---

## 📜 라이선스 / 크레딧

- **원본 저장소**: [Vheissu/emerald-bayou](https://github.com/Vheissu/emerald-bayou) — MIT License
- **원작자**: Dwayne Charrington (Copyright 2026)
- **이 포크**: sigco3111 — 한글화 추가, 코드 구조 동일
- **GLB 모델**: Meshy로 생성 — 별도 이용약관 적용 (원본 저장소 라이선스 아님)

### 한국어 번역 기여

- 시작 화면 / 메뉴 / HUD / 로딩 UI
- 16개 본 의뢰 + 미션 진행 메시지 / 토스트
- 채널 68 무전기 (NOAA 기상 + 주민 호출)
- 스토리 아크 (Running Dark + 주민 의뢰)
- 어종 / 낚시 메시지 / 어획 알림
- 항로 표지 알림 / 야외 기록 / 발견 메시지
- 평판 등급 (주민 / FWC / 뒷골)
- 적중 / 충돌 / 만조 / 폭풍 / 안개 토스트

### 인용된 외부 자료

- [FWC 보트 가이드 — 마네키](https://myfwc.com/education/wildlife/manatee/for-boaters/) — 마네키 회피 동작의 근거
- [에버글레이즈 국립공원 보트 규정](https://www.nps.gov/ever/planyourvisit/boatingrulesregs.htm) — 야생동물 괴롭힘 금지
- [FWC 항공대 — Eye in the Sky](https://myfwc.com/law-enforcement/special-programs/) — 공중 추격 시스템
- [FWC 통합 작전](https://myfwc.com/about/inside-fwc/le/what-we-do/) — 공중·육상·해상 통합 작전

---

## 🐛 알려진 한글화 한계

- **dev hooks (`__dbg`)는 영문 유지** — 내부 디버깅 도구로 일반 사용자에게 노출되지 않음
- **콘솔 경고 / Three.js 디버그 메시지**는 영문 그대로 — 게임 동작에는 영향 없음
- **언어 전환 토글 없음** — 기본값 한국어. 영문 보존본은 원본 저장소 참조.

---

## 🤝 기여

이 저장소는 **한글화 포크**입니다. 버그 제보, 번역 개선, 추가 의뢰/지역 한국화는 PR 환영합니다.
