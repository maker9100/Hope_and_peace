# CHEAT ARENA V0.1.5(tem)

V0.1.4 기반 임시 업데이트 빌드다. Canvas 2.5D raycaster FPS이며 AI 전투와 Firebase Realtime Database 온라인 전투를 지원한다.

## 이번 버전 핵심 변경

- SOLO ELIMINATION 삭제, **LOCALIZED EXPLOSION** 추가. Red/Blue 공수전이며 총 10라운드, 5라운드 뒤 공수 교대. 공격팀은 A/B 지점에서 4초간 자동 설치, 설치 후 35초 뒤 폭발. 수비팀은 폭탄 근처에서 5초간 자동 해체한다. 폭발 시 2초간 폭발 연출을 보여준 뒤 결과 화면으로 넘어간다. 폭탄 설치 후 공격팀이 전멸해도 라운드는 계속되며, 수비팀은 해체해야 한다. 수비팀이 전멸하면 즉시 공격팀 승리다. AI 폭파전에서는 플레이어의 시작 진영(공격/수비)이 경기마다 랜덤이다.
- 무기 슬롯: **1 KNIFE / 2 AR / 3 SHOTGUN / 4 CROSSBOW / 5 MAC / 6 GRENADE**. PISTOL은 제거했다.
- GRENADE는 라운드당 최대 2개이며 범위 폭발 피해를 준다.
- KNIFE 장비 중 이동속도 +15%.
- 칼 공격 때 탄피가 튀던 렌더링 버그 수정. 탄피는 firearm 계열에서만 배출된다.
- 온라인 랜덤 모드 후보도 TEAM / LOCALIZED EXPLOSION / INFINITY / KILLING BOSS / OBJECT CAPTURE로 갱신했다.
- Firebase room schema를 **3**으로 올렸다. V0.1.4 방과 호환되지 않는다.

## Firebase 적용

1. Firebase Authentication에서 Anonymous 로그인을 활성화한다.
2. Realtime Database → Rules에 `FIREBASE-RULES-V0.1.5-tem.txt` 또는 `dist/database.rules.json` 전체 내용을 붙여 넣고 **Publish**한다.
3. 모든 참가자가 V0.1.5(tem) 페이지로 새로고침하고 새 방을 만든다. 기존 V0.1.4 방에는 참가할 수 없다.
4. 공개 Web Firebase 설정은 `dist/config.js` 또는 Render 환경변수 `FIREBASE_CONFIG_JSON`을 사용한다. 서비스 계정/private key는 넣지 않는다.

## 실행 / 검증

정적 서버에서 `dist/`를 서비스하면 된다. Node 20+에서:

```bash
npm test
npm run validate
npm run build
```

실제 Firebase 프로젝트의 여러 기기 동시 플레이는 자동 테스트로 완전히 재현할 수 없으므로 배포 후 2개 이상의 브라우저에서 방 생성/참가, 피해 동기화, 폭탄 설치·해체, 5라운드 공수교대, 10라운드 종료를 확인하는 것을 권장한다.

## 크레딧

기획: 10628 황정욱  
개발: 11001 강동원, GPT 6 Astra
