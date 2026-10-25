# PhraseLoop 캡처 시각 검증 유지보수

캡처 시각 검증 결함 1건을 수정했다. NaN, 무한대, 음수 시각을 pending queue에 저장하기 전에 거부한다. 수정 후 합성 회귀 16개가 통과했다.

- 반영 판: r2, 2026-10-25
- 기준 HEAD: `09d523a8713efff302dfefdea147cda55b6d138b` (`main`)
- 워커: 영어앱코드, `PASEO_AGENT_ID=8cf8dbd9-31ba-4bc0-9fc1-8c4d6bf10fc4`
- 결과 파일: `C:/GitProject/AI_EnglishLearning/docs/MAINTENANCE_20261025.md`
- 증빙: `C:/GitProject/_work/20261025_english_capture_range/` (`.keep` 보존)

## 재현과 수정

`validateDraftMarkers()`가 순서와 길이만 비교해 `NaN, 10`, `0, NaN`, `0, Infinity`, `-Infinity, 10`, `-1, 10`을 성공으로 반환했다. `saveDraftLoop()`는 이 결과를 사용해 루프를 저장하므로 companion의 유한·0 이상 시각 검증에 실패할 캡처가 pending queue에 들어갈 수 있었다. NaN·무한대는 JSON 전송 때 null로 바뀐다.

마커 누락 검사를 유지하고 그 뒤에 `Number.isFinite()`와 음수 검사를 추가했다. 실패 타입에 `invalid-range`를 추가했다. 기존 1초 하한, A/B 순서와 성공 payload는 유지했다. 근거는 companion이 이미 유한한 0 이상 시각을 요구한다는 점이며, 확장의 기존 1초와 companion의 기존 0.1초 길이 기준은 바꾸지 않았다.

정확한 변경 파일:

- `src/shared/validation.ts`: 유한·0 이상 마커 검증 4줄 추가.
- `src/shared/types.ts`: 검증 오류 타입에 `invalid-range` 추가.
- `src/test/validation.test.ts`: 비정상 마커 8조합과 정상 `0 → 1` 경계 회귀 추가.
- `docs/MAINTENANCE_20261025.md`: 이 보고.

## 검증

환경: 기존 Node.js `v24.11.1`, 패키지 설치 없음. 저장소에 `node_modules`가 없어 Vitest·TypeScript·Vite 실행기는 사용할 수 없었다. 전체 `npm test`, typecheck, 확장 build는 미실행이다.

Node 기본 `stripTypeScriptTypes`와 import hook으로 실제 `src/shared` 소스를 읽고 `node:test`로 실행했다. 타입 검사나 번들 빌드를 대체했다고 보지 않는다. 커밋한 Vitest 테스트는 의존성이 준비된 환경에서 `npm test -- src/test/validation.test.ts`로 실행할 수 있다.

실제 실행 명령:

```powershell
node --test C:\GitProject\_work\20261025_english_capture_range\regression.mjs
git -C C:\GitProject\AI_EnglishLearning diff --check
```

- 수정 전: 16개 중 7개 통과, 9개 실패. `before.log`에 최초 실패를 보존했다. 실패 중 5개는 비정상 시각의 잘못된 성공, 3개는 이미 거부하던 값의 오류 코드 기대 차이, 1개는 NaN 캡처 거부를 확인하는 전달 합성 검증이다.
- 수정 후: 동일한 검증 의도 16개 모두 통과 (`after.log`).
- 최종: 합성 전송 경로에 companion의 실제 순수 함수 `validateImportPayload()`도 연결해 16개 모두 통과 (`after-final.log`).
- 기존 동작: A/B 누락, 역순·동일 시각, 1초 미만 거부 및 `0 → 1`, `10 → 20` 성공 확인.
- 전달 합성 검증: 메모리 `chrome.storage.local`에 가짜 루프 저장, `chrome.runtime.sendMessage`의 의도적 실패 때 pending 보존, 성공 재시도 시 실제 companion payload 검증 후 `deleteLoop()`로 마지막 video entry 제거 확인.
- `git diff --check` 통과. `git fetch origin` 후 `origin/main`과 기준 HEAD 일치, ancestry 검사 종료코드 0.

전달 검증은 UI 내부 함수를 실행하지 않고 UI가 사용하는 실제 shared 함수들을 같은 순서로 호출했다. `fetch`는 호출 시 실패하도록 대체했다. DB·실제 Chrome·확장 설정·저장 loop·전사·미디어·YouTube·운영 companion·Anki는 조회하거나 실행하지 않았다. 서버 시작·배포·확장 reload 및 기존 dist 덮어쓰기 없음.

증빙 폴더에는 `regression.mjs`, `before.log`, `after.log`, `after-final.log`, 수정 전 원본 3개가 있다. 운영 원본 삭제 없이 합성 레코드만 메모리에서 사용했다.

## 남은 결정과 반영 제안

- 남은 결정: 없음.
- BACKLOG 완료 제안: PhraseLoop 기존 캡처 시각 검증 결함 1건 수정 및 pending 전달·재시도 합성 회귀 완료.
- BACKLOG 추가 제안: 다음 승인 유지보수에서 repo 전용 의존성 환경을 준비해 전체 Vitest·typecheck·build 실행. 이번 설치 금지 범위에서는 진행하지 않았다.
- friction: `FR-6fb73d76b9ae65a858347529`에 의존성 환경 부재와 사용한 합성 검증 위치를 기록했다. 원장 commit 없음. Everything IPC도 사용할 수 없어 서비스를 시작하지 않고 지정 repo와 작업 폴더의 제한된 목록만 확인했다.
- 재개 지점: 없음. 전체 도구 체인 검증은 위 후속 제안에 한정한다.

STATE·BACKLOG·공용 지침과 기능개발 종료 상태는 수정하지 않았다. main에 위 네 파일만 커밋하며 commit·push 결과는 최종 보고에 적는다.
