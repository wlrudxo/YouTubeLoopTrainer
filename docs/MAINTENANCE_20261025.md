# PhraseLoop 캡처 시각 검증 유지보수

캡처 시각 검증 결함 1건을 수정했다. NaN, 무한대, 음수 시각을 pending queue에 저장하기 전에 거부한다. r2 수정 후 합성 회귀 16개가 통과했다. r3에서는 잠금파일 기반 격리 설치 후 전체 Vitest 52개, typecheck, build를 모두 통과했다.

- 반영 판: r3, 2026-10-25
- r3 검증 기준 HEAD: `f46a0621de64dff1564de112af5856d37bdb997e` (`main`)
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

## r2 검증

r2 환경: 기존 Node.js `v24.11.1`, 패키지 설치 없음. 저장소에 `node_modules`가 없어 Vitest·TypeScript·Vite 실행기는 사용할 수 없었다. r2에서는 전체 `npm test`, typecheck, 확장 build를 실행하지 못했다. r3 완료 결과는 아래 절에 있다.

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
- BACKLOG 완료 제안: r3 잠금파일 격리 설치와 전체 Vitest·typecheck·build 완료. 추가 제품 작업 제안 없음.
- friction: `FR-6fb73d76b9ae65a858347529`는 r2에 의존성 환경 부재를 기록했고 r3 격리 전체 도구체인 통과 증빙으로 resolved 처리했다. 원장 commit 없음. Everything IPC도 사용할 수 없어 서비스를 시작하지 않고 지정 repo와 작업 폴더의 제한된 목록만 확인했다.
- 재개 지점: 없음. r3에서 남은 전체 도구체인 검증까지 완료했다.

STATE·BACKLOG·공용 지침과 기능개발 종료 상태는 수정하지 않았다. r2에서는 위 네 파일을, r3에서는 이 문서만 main에 커밋했다. commit·push 식별자는 각 최종 보고에 적는다.


## r3 격리 전체 검증

리드의 추가 승인에 따라 `_work` 사본에서만 잠금파일 기반 설치와 합성 localhost HTTP 시험을 수행했다. 새 제품 결함은 확인되지 않았고 제품 소스·테스트·lock은 추가 수정하지 않았다.

- 승인·환경 근거: `C:/GitProject/_operations/inventory/review/APP_REPRO_ENVIRONMENT_20261025.md`의 PhraseLoop 절.
- 작업 루트: `C:/GitProject/_work/20261025_phraseloop_fullcheck/` (`.keep` 보존).
- 실행 cwd: 작업 루트의 `source/`. git이 추적하는 `src/`, `scripts/`, `public/`, package/lock, tsconfig, Vite 설정만 총 56파일 복사했다. 사용자 설정·비밀값·원본 데이터·기존 dist는 복사하지 않았다.
- 기존 Node `24.11.1` 사용. 잠금 버전은 Vitest `4.1.6`, TypeScript `6.0.3`, Vite `8.0.13`, esbuild `0.28.0`이다.
- lock의 전이 패키지 109개 모두 `registry.npmjs.org` URL과 integrity가 있음을 설치 전에 확인했다. Windows에 맞는 53개가 설치됐고 실제 설치 버전은 모두 lock과 일치했다. 버전 갱신·글로벌 설치 없음.
- 설치 스크립트 표시 목록: esbuild `0.28.0`, fsevents `2.3.3`. `npm ci --ignore-scripts --no-audit --no-fund`로 설치했다. esbuild의 `postinstall: node install.js`는 실행하지 않았고 플랫폼 패키지의 바이너리로 검증·빌드가 성공했다. macOS용 fsevents는 설치되지 않았다. 별도 빌드 설치 단계는 필요 없었다.
- `run-stage.py`는 빈 `config/user.npmrc`, `config/global.npmrc`와 전용 `cache/`, `temp/`, `prefix/`, `runtime/`을 지정한다. 상속 npm 설정·인증 관련 변수와 Node 선행 로드 옵션을 전달하지 않으며 사용자 npm 설정을 읽지 않는다. TEMP/TMP, APPDATA/LOCALAPPDATA와 기본 데이터 경로도 작업 루트로 지정했다.

실행과 결과:

| 작업 | 실행 명령 요지 | 결과 |
|---|---|---|
| 잠금 설치 | `npm ci --ignore-scripts --no-audit --no-fund` | 53개 설치, exit 0 |
| 직접 회귀 | `npm test -- --config verification.config.ts src/test/validation.test.ts` | 1파일, 14개 통과 |
| 전체 Vitest | `npm test -- --config verification.config.ts` | 10파일, 52개 통과, skip 없음 |
| 타입 검사 | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| 확장 빌드 | `npm run build` | Vite·content bundle·manifest 복사 모두 exit 0 |

정확한 실행기·인수·환경 구성은 작업 루트의 `run-stage.py`, 각 단계 영수증은 `logs/{ci,focused,full,typecheck,build}.json`, 출력은 같은 이름의 `.log`에 보존했다. 재실행은 기존 사본 cwd에서 위 실행기에 단계명 `focused`, `full`, `typecheck`, `build`를 전달한다.

전체 시험은 원래 Vite 설정의 include와 테스트 파일을 그대로 사용했다. 사본에만 `verification.config.ts`와 `verification/network-guard.mjs`를 더해 기존 테스트에 guard를 적용했다. guard는 listen을 `127.0.0.1` 또는 `::1`의 포트 0으로 한정하고 fetch를 해당 시험이 연 임시 포트로 한정하며 redirect를 거부한다. 전체·직접 회귀 합계 감사는 합성 서버 listen 6회, loopback fetch 13회, 위반 0건이다. 미디어 다운로드·이미지 다운로드·Anki 호출은 기존 테스트의 대체 함수로 처리했고 모든 파일 fixture는 작업 루트 TEMP 아래에서 새로 생성했다. 실제 운영 companion·Chrome·YouTube·Anki·DB·미디어 접근, GUI, 서버 재시작·배포는 없었다.

보존 검증:

- 원본과 사본 56파일의 SHA-256이 모두 최초 복사 시점과 일치한다. `source-sha256.json`과 `verification-receipt.json`에 보존했다.
- 원본·사본 lock SHA-256: `A58BF1EA448EAE7968D94588EE5537A271CB9FF80583466FE6EBA1E4703824F5`. 환경 감사에 기록된 값과도 일치한다.
- 원본 repo에 `node_modules`가 없는 것을 재확인했다. 의존성과 생성 dist는 격리 사본에만 있다.
- 격리 build의 manifest, content JS/CSS, popup HTML/JS, background JS, settings HTML 파일 존재를 확인했다. 확장 reload나 운영 실행은 하지 않았다.
- `FR-6fb73d76b9ae65a858347529`를 이 격리 통과 증빙으로 resolved 처리했다. 기본 repo에 의존성을 설치한 것으로 기록하지 않았고 friction 원장은 커밋하지 않았다.
- 남은 결정·검증 장애: 없음. 이 검증은 합성 fixture와 빌드에 대한 결과이며 실제 운영 데이터·Chrome·외부 서비스 동작은 실행 범위에 포함되지 않았다.
