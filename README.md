# CHEAT ARENA

Canvas 2D / 2.5D Raycaster FPS. No Three.js, WebGL engine, build step, external fonts, images, or copyrighted game sound assets. All local combat modes work without Firebase. The browser loads Firebase SDK 12.4.0 only when creating or joining an online room.

## 실행

- 바로 플레이: Render에 배포한 게임 주소를 Safari 또는 Chrome에서 연다.
- PC에서 소스 실행: `dist/index.html`을 브라우저에서 열거나 `python -m http.server 8080 --directory dist` 실행 후 `http://localhost:8080`을 연다.
- iPad / 모바일은 ZIP 안의 HTML 미리보기 대신 실제 웹 주소로 연다. iOS 파일 미리보기에서는 게임 실행이 제한될 수 있다.
- GitHub Pages 등 정적 호스팅에서는 **dist 안의 파일 전부를 같은 경로에** 올린다.

## Render + Firebase 배포

**Render = 게임 파일 제공 / Firebase = 익명 인증·실시간 멀티플레이**로 역할을 나눈다. Python이나 FastAPI 서버, WebSocket 서버를 별도로 실행할 필요가 없다.

ZIP을 풀어 `render.yaml`, `package.json`, `dist`, `scripts`, `tests`가 GitHub 저장소의 최상위에 있도록 업로드한다. `tests`는 파일이 아니라 폴더이며, 포함된 테스트 파일도 같이 올린다.

Render에서는 **New → Static Site**를 선택한다. 설정은 다음과 같다.

| 항목 | 값 |
|---|---|
| Root Directory | 비워 둠 |
| Build Command | `node scripts/build-render.cjs` |
| Publish Directory | `dist` |
| Start Command | 없음 — Static Site |

또는 **New → Blueprint**에서 저장소를 연결하면 포함된 `render.yaml`을 사용한다. 기존 Python Web Service가 있다면 이 게임용 Static Site를 새로 만든다.

공개 Firebase 설정은 세 가지 방법 중 하나로 넣는다.

1. 가장 간단하게: 게임 ONLINE → Firebase 연결 설정에서 입력한다. 해당 브라우저에만 저장된다.
2. 모든 참가자에게 적용: Render Environment에 `FIREBASE_CONFIG_JSON`을 만들고 아래 형식의 공개 설정 JSON을 값으로 넣은 뒤 다시 배포한다. 빌드가 `dist/config.js`를 생성한다.
3. 직접 파일 수정: `dist/config.js`에 Web Client Config를 넣은 뒤 커밋한다.

Static Site의 환경 변수는 JavaScript에 자동 연결되지 않으므로 2번은 포함된 빌드 스크립트를 사용해야 한다. 서비스 계정·비공개 키를 환경 변수나 공개 파일에 넣지 않는다.

[Render Static Sites](https://render.com/docs/static-sites) · [Render Blueprint 설정](https://render.com/docs/blueprint-spec)

## 게임 규칙

| 모드 | 인원 | 승리 | 시간 | 부활 |
|---|---|---|---|---|
| TEAM ELIMINATION | BLUE 5 / RED 5 | 먼저 7라운드 승리 | 라운드당 120초 | 다음 라운드 |
| SOLO ELIMINATION | 플레이어 + AI 9 | 개인 7승 | 라운드당 120초 | 다음 라운드 |
| INFINITY ELIMINATION | 플레이어 + AI 9 | 최다 킬, 공동 1위 무승부 | 300초 | 4초 후, 2초 보호 |
| KILLING BOSS | BOSS 플레이어 + HUNTER 9 | 상대 전멸 | 무제한 | 없음 |
| OBJECT CAPTURE | BLUE 5 / RED 5 | 거점 2개 이상 소유한 누적 시간 45초 | 무제한 | 5초 후 |

일반 HP / Shield = 100 / 50. BOSS는 2000 / 1000. Shield가 먼저 피해를 받고, 마지막 피해 4초 후 초당 15 재생된다. 모든 경기는 `LOBBY → PLAYING → ROUND_END → … → MATCH_END → LOBBY`를 따른다. 경기 종료 및 중도 로비 복귀에서 공식 치트 3개를 OFF로 초기화한다.

거점은 한 팀만 반경 96에 있으면 5초에 중립에서 완전히 점령한다. 적 거점은 먼저 중립화한 뒤 점령한다. 양 팀이 들어오면 CONTESTED로 점령 진행이 정지한다. 소유한 2개 이상 거점의 **누적 시간은 잃어도 초기화되지 않는다.** 거점을 다툴 때도 소유권은 중립화될 때까지 유지된다.

## 조작

PC: WASD 이동 / 마우스 상하좌우 / 좌클릭 발사 / 1–6 무기 / R 재장전 / Space 점프 / C 앉기 토글 또는 Ctrl 누르기 / F1 AIM / F2 ESP / F3 NO RECOIL / Tab 순위표. 클릭하면 Pointer Lock을 요청한다. ESC로 해제한다.

모바일: 왼쪽 조이스틱 이동 / 화면 드래그 시점 / 짧은 탭 단발 / 움직이지 않고 0.27초 누르기 AR·MAC 연사 / FIRE 버튼 누르면서 화면 드래그 / R·JUMP·CROUCH / 하단 무기 및 치트 버튼. 가로 화면 권장. 관전 중 화면을 탭하거나 NEXT OPERATOR로 대상을 바꾼다.

AIM은 시점을 잠그지 않는다. 직접 마우스·터치 입력과 그 직후 110ms는 조준 보정을 중단한다. `cameraPitch`와 `recoilPitch`는 별개다. NO RECOIL은 총기·카메라 반동을 제거하며 무기 이동 흔들림은 보행 효과다.

## 무기

| 무기 | 피해 | 탄창 | 재장전 | 특징 |
|---|---:|---:|---:|---|
| AR | 26 | 30 | 2.1초 | 연사 |
| PISTOL | 34 | 12 | 1.3초 | 단발 |
| KNIFE | 65 | 무한 | 없음 | 근접, 반동 0 |
| SHOTGUN | 15 × 8 | 6 | 2.8초 | 8 펠릿 피해 합산 |
| CROSSBOW | 110 | 1 | 2.2초 | 실제 투사체, 760 world px/s, swept 충돌 |
| MAC | 23 | 80 | 4.1초 | 벨트 급탄 기관총, 매우 강한 반동 |

## Firebase 연결

1. Firebase 프로젝트에 Web 앱을 등록한다. **Realtime Database**를 만든다. Cloud Firestore와 다르다.
2. Authentication → Sign-in method에서 **Anonymous**를 활성화한다.
3. 프로젝트 설정의 Web Client Config를 복사한다. `databaseURL`은 Realtime Database URL을 사용한다.
4. Realtime Database → Rules에 `dist/database.rules.json` 전체를 적용한다. 기존 다른 앱의 데이터베이스와 공유한다면 rules를 검토·병합한 뒤 적용한다.
5. 게임 ONLINE → Firebase 연결 설정에 공개 설정을 **JSON**으로 입력한다. 또는 `dist/config.js`의 `window.CHEAT_ARENA_FIREBASE`에 공개 설정 객체를 넣어 배포한다.
6. CREATE ROOM → 다른 브라우저에서 동일한 설정 및 6자리 코드로 JOIN → 2명 이상이면 호스트가 START MATCH. 10명이면 5 VS 5로 배치된다. 10명 미만은 참가한 사람만 균형 배치하며 온라인 AI 채우기는 하지 않는다.

```json
{
  "apiKey": "YOUR_PUBLIC_WEB_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "databaseURL": "https://YOUR_DATABASE.REGION.firebasedatabase.app",
  "projectId": "YOUR_PROJECT",
  "appId": "YOUR_WEB_APP_ID"
}
```

서비스 계정 JSON, `private_key`, Admin SDK 비공개 키를 클라이언트에 넣지 않는다. UI도 서비스 계정 입력을 거부한다. Firebase 공개 설정은 브라우저에 제공되는 설정이다. 접근 제어는 인증과 Rules가 담당한다.

### 동기화 권한

- 최대 10개의 `seats/0…9`를 트랜잭션으로 예약한다. 중복 슬롯과 11번째 입장을 제한한다.
- Host: 팀 균형, 한 경기의 고정 맵, 라운드, 공유 `roundEndsAt`, 시간 종료 판정, 거점 없는 TEAM 규칙.
- Attacker: 원시 피해 이벤트를 전송한다. 상대 HP / Shield에 직접 쓰지 않는다.
- Victim: 이벤트 ID 중복 제거, 경기·라운드·시각 검증, Shield → HP 순으로 피해 적용 후 자기 `hp/shield/alive`를 게시한다. 처치 확정 이벤트와 피격 확인도 피격자가 전송한다.
- Pickup: 클라이언트가 획득을 요청하면 Host가 위치·생존·필요량을 확인하고 트랜잭션으로 단일 획득을 확정한다. `active`, `respawnAt`, `claimUid`, `grantId`를 공유한다. 피격자 자신의 상태 갱신에 확정된 회복을 반영한다.
- 상대 캐릭터: 110ms 버퍼로 위치·각도·pitch·jump·crouch 보간. 무기·HP·Shield·생존·발사 이벤트·관전 동기화.
- Host 이탈: `onDisconnect`가 좌석·presence·플레이어를 제거하며, 남은 가장 앞 좌석 참가자가 트랜잭션으로 Host를 넘겨받는다. 공유된 경기 종료 시각을 유지한다.
- 인터넷이 끊겨 재접속한 참가자는 방에 다시 참가한다. 이미 진행 중인 경기에는 중간 입장할 수 없다.
- Host와 참가자 클라이언트를 신뢰하는 프로토타입이다. 피해량 상한 등 Rules 검증은 포함하지만, 악성 클라이언트의 거짓 위치·체력·사격을 완전히 차단하는 전용 게임 서버는 아니다. 공식 치트 메커니즘과 네트워크 변조 방어는 별개다.
- 마지막 사람이 떠난 빈 방의 기록은 이 프로토타입에서 자동 삭제하지 않는다. 필요 시 관리자 측 예약 정리를 추가할 수 있다.

**Firebase 프로젝트 설정 및 실사용 브라우저 간 실시간 연결 검증은 이 산출물에 포함된 자동 테스트의 범위 밖이다. 실제 Firebase 멀티플레이 테스트 완료를 주장하지 않는다.**

### Firebase 참고 문서

- [Web SDK 설정](https://firebase.google.com/docs/web/setup)
- [Anonymous Authentication](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Realtime Database 읽기·쓰기·트랜잭션](https://firebase.google.com/docs/database/web/read-and-write)
- [Presence, onDisconnect, 서버 시각](https://firebase.google.com/docs/database/web/offline-capabilities)
- [Realtime Database Rules API](https://firebase.google.com/docs/reference/security/database)

## 소스 구조

- `dist/core.js`: 무기·이동·충돌·AI·5개 모드·상태 기계.
- `dist/maps.js`: 4개 30×27 맵, 수동 스폰·거점·아이템·랜드마크.
- `dist/render.js`: DDA Raycaster, 바닥 시설, 병사 관절, 6개 무기, 미니맵, 효과.
- `dist/audio.js`: 자체 WebAudio 합성.
- `dist/network.js`: Firebase 익명 인증 / RTDB 멀티플레이 어댑터.
- `dist/game.js`: DOM, 모바일·PC 입력, 로비, HUD, 관전.
- `dist/config.js`: 선택적 공개 Firebase 설정.
- `dist/database.rules.json`: 생성된 RTDB 접근 규칙. `node scripts/generate-rules.cjs`로 재생성한다.
- `tests/`: 핵심 시뮬레이션 및 정적 DOM 검사.

검사: `node --test tests/core.test.cjs` 및 `node scripts/validate.cjs`.

브라우저 하드웨어 성능에 따라 프레임률이 다르다. Canvas 내부 해상도는 최대 1050×680, 이동은 프레임당 clamp와 micro-step을 적용한다. 외부 사운드·폰트·이미지가 없어 로컬 게임은 네트워크 자산 다운로드를 기다리지 않는다.
