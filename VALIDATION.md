# CHEAT ARENA 검증 기록

## 실행한 검사

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
