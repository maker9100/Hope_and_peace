# CHEAT ARENA 검증 기록

## V0.1.2 검사

- `node --test tests/core.test.cjs`: **37개 통과 / 실패 0개**. 보스 전용 재장전 보정이 헌터·다른 모드에 적용되지 않는지와, 헌터가 점사 휴지기 후 다시 사격하는지 추가 검증했다.
- JavaScript 7개에 `node --check`, 핵심 DOM 및 자산 경로 검사: 통과. HTML ID는 81개이며 버전 쿼리가 붙은 자산 경로도 확인한다.
- HTML 기반 DOM fixture + CPU Canvas: PC·모바일 코드 경로에서 5개 모드 시작, HUD, 치트, 관전용 점수판, 로비 복귀, 크레딧 열기·닫기, 설정 유무에 따른 온라인 버튼 상태 및 방 생성·참가 UI 콜백을 검사했다. 네트워크 연결은 mock 처리했다.
- 크레딧 두 줄을 HTML에서 추출해 요청 문구와 완전히 일치하는지 확인했다.
- 로컬 개발 서버를 실제 테스트용 Chrome에서 열려고 했으나 `ERR_BLOCKED_BY_CLIENT`로 차단됐다. 따라서 수정본의 실제 브라우저 화면·Safari 터치 조작 검증 완료로 표기하지 않는다.
- 실제 Firebase 프로젝트에서의 다중 접속 검증은 수행하지 않았다.

### 보스전 수치 비교

같은 난수 시드(3917), 0.025초 시뮬레이션 간격, 정지한 보스가 공격하지 않는 조건에서 사망까지 걸린 시간이다. 사람의 플레이 승률이나 체감 난이도 측정은 아니다.

| 맵 | V0.1.1 | V0.1.2 |
|---|---:|---:|
| DEPOT | 9.48초 | 12.80초 |
| CARGO YARD | 6.93초 | 9.90초 |
| LA. WING | 7.33초 | 9.85초 |
| CENTRAL PLAZA | 8.15초 | 11.20초 |

## V0.1.1 / 2026-09-16 화면 겹침 수정

- GitHub에 올라간 `dist/index.html`과 `dist/style.css`가 수정 전 로컬 파일과 같은 내용임을 Git blob SHA로 확인했다.
- ID 기반 로비 레이아웃과 모바일 조작 표시 규칙이 기존 상태 숨김 규칙보다 우선하는 CSS 문제를 수정했다.
- `dist/index.html`에 상태 전용 숨김 규칙을 추가했다. PLAYING / ROUND_END / MATCH_END에는 로비를 숨기고 LOBBY에는 HUD와 모바일 조작을 숨긴다. 기존 CSS가 캐시되어 있어도 적용된다.
- 수정 후 JavaScript 7개 문법 검사와 핵심 DOM 참조·자산 경로 검사를 통과했다. 실제 iPad에서 수정본을 실행한 검증은 아직 하지 않았다.

## 최초 버전에서 실행한 검사

- JavaScript 7개 파일에 `node --check`: 통과.
- `node scripts/validate.cjs`: 통과. HTML의 고유 DOM ID 80개, 핵심 참조 및 로컬 자산 경로 확인.
- `node --test tests/core.test.cjs`: **35개 통과 / 실패 0개**.
- 4개 맵 × 로컬 모드 5개 시뮬레이션: 좌표 유효성, NaN 여부, AI 자동 점프 없음 확인.
- 4개 맵의 수동 스폰·거점·아이템: 벽 내부 배치 없음, A* 경로 연결 확인.
- 팀/개인전 부활 금지, 7승 종료·로비 복귀·치트 초기화, 타이브레이크, 4초·5초 부활, 2초 보호 검증.
- 점령 누적 시간의 정지·재개, 팀별 독립 누적, 경합 정지, 중립화 검증.
- Shield 우선 피해·4초 대기·초당 15 재생, Boss 최대값, 아이템 최대치 및 재생성 검증.
- 석궁 swept collision·벽 충돌, 산탄 8 × 15, AR/MAC 연사·자동 재장전, 반동·직접 시점 분리 검증.
- CPU Canvas로 맵 4개, 무기 6개, pitch 양 극단, 세로 화면 렌더링. 생성한 화면을 시각적으로 확인.
- HTML에서 만든 DOM fixture와 CPU Canvas를 결합한 런타임 검사: PC·모바일 입력 경로, 모드 카드, HUD, 치트, 로비, 점수판, 잘못된 설정 입력에서 예외 없음.
- Render Blueprint YAML 구조 검사 및 `node scripts/build-render.cjs` 실행: 통과.
- Firebase 어댑터의 raw damage와 피해 중복 제거는 mock transport로 확인.

## 실행하지 않은 검사

- 실제 iPhone/iPad Safari, Android Chrome, 데스크톱 Chromium 기기에서의 직접 조작·성능 검증.
- 실제 Firebase 프로젝트의 Rules 컴파일·배포 및 여러 브라우저 간 실시간 연결.
- 실제 환경에서의 호스트 이탈, 네트워크 지연·끊김, 아이템 동시 요청, 10인 부하 테스트.
- 사용자의 Render 계정에서 실제 배포.
- WebMCP는 mock registry에서 콜백을 확인했다. 지원 브라우저의 실제 WebMCP 등록은 미검증이다.

CPU Canvas / DOM fixture / mock transport 결과는 실제 브라우저·Firebase·Render 검증 결과를 의미하지 않는다. Firebase 프로젝트 연결 후 README의 절차로 검증한다.
