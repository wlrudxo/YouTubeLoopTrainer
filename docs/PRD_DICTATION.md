# PRD — PhraseLoop Dictation (로컬 받아쓰기 + Anki 연동)

작성일: 2026-08-12 · 상태: 초안 v1

## 1. 배경과 문제

기존 PhraseLoop 확장(YouTube A–B 구간 반복 재생)은 구간 선택까지는 잘 쓰이지만, 실제로 저장된 구간을 되돌아가 반복 청취하는 일이 없었다. 학습이 일어나려면 "다시 듣기"가 아니라 **받아쓰기(dictation)** 형태의 능동적 연습과, 검수된 문장의 **Anki 장기 복습**으로 이어져야 한다.

## 2. 역할 분리 (핵심 원칙)

| 구성요소 | 역할 |
|---|---|
| YouTube 확장 | 학습할 구간을 정확히 잘라서 로컬로 보내는 **채집기**. 학습 기능 없음 |
| 로컬 companion 서버 + Dictation 웹앱 | MP3·스크립트 생성, 받아쓰기 연습, 정답 수동 검수 |
| Anki | 검수 완료된 카드의 장기 복습 (간격 반복은 전적으로 Anki 담당) |

원칙:
- **자동 자막을 검수 없이 Anki에 넣지 않는다.** 사용자가 실제 음성과 비교해 정답을 확정한 후에만 Anki로 전달한다.
- 로컬 앱에 별도 간격 반복 알고리즘을 넣지 않는다.
- 기존 확장의 반복 재생/트림 기능은 "구간을 정확히 자르는 도구"로 유지한다.

## 3. 아이템 상태 흐름

처리·검수·Anki 동기화 상태를 분리한다. 하나의 상태 값으로 세 상태를 겸하면
실패 재시도와 재가져오기를 안전하게 표현할 수 없다.

```
processing: queued → processing → complete
                         └──────→ error → queued(retry)
review:     needs_review → ready
anki:       not_added → synced → out_of_sync
```

- `processing`: MP3 생성 작업 상태
- `review.needs_review`: 사용자가 canonical transcript를 아직 확정하지 않음
- `review.ready`: canonical transcript를 확정하고 `verifiedAt` 보유
- `anki.synced`: Anki noteId와 현재 contentHash가 일치
- `anki.out_of_sync`: Anki 추가 후 로컬 음성·스크립트가 변경됨

Anki 추가 API는 `processing=complete`, `review=ready`, 비어 있지 않은 transcript,
존재하는 MP3를 서버에서 검증한다. UI 비활성화만으로 이 규칙을 대신하지 않는다.

## 4. 아키텍처

### 4.1 로컬 companion 서버

- Node.js 단일 프로세스, 프레임워크 없이 `node:http` 수준으로 가볍게. (프로젝트는 이미 Node/ESM 기반)
- **127.0.0.1 전용 바인딩**, 기본 포트 **17311**.
- 인증: 서버 최초 실행 시 `PhraseLoopData/config.json`에 랜덤 토큰 생성. 확장 설정 페이지에 사용자가 붙여넣는 정적 토큰 방식. 요청 헤더로 검증. CORS는 확장 origin으로 제한.
- 하는 일:
  1. 확장에서 구간 정보 수신 (`POST /import`)
  2. yt-dlp/ffmpeg로 구간별 MP3 생성 (기존 `scripts/export-anki.mjs`의 섹션 다운로드 로직 재사용 가능)
  3. Dictation 웹 화면(정적 HTML/JS) 서빙
  4. AnkiConnect(127.0.0.1:8765) 호출

**자막(정답 초안)은 서버가 만들지 않는다.** 확장이 A–B 구간 동안 화면 자막을 수집해 만든 label을 `transcriptDraft`로 그대로 넘겨받는다. yt-dlp 자막 다운로드·cue/구간 매칭은 오류가 많고, 자동 생성 자막은 어차피 부정확하므로 하지 않는다. 초안 교정은 전적으로 로컬 앱의 검수 단계에서 사용자가 수행한다.

### 4.2 저장 폴더 (단일 진실 원천)

브라우저 localStorage가 아닌 파일 시스템에 저장한다. 백업 = 폴더 복사.

```
PhraseLoopData/
  config.json            # 포트, 토큰, Anki 덱 이름 등
  library.json           # 전체 아이템 인덱스 (목록 화면용 캐시)
  videos/
    VIDEO_ID/
      source.json        # 영상 제목, 채널, URL
      loops/
        LOOP_ID/
          audio.mp3
          item.json
```

`item.json` 예시:

```json
{
  "loopId": "lp_...",
  "videoId": "...",
  "start": 72.4, "end": 78.9,
  "captureHash": "sha256:...",
  "processing": { "status": "complete", "error": null, "attempts": 1 },
  "review": { "status": "needs_review", "verifiedAt": null },
  "transcript": "검수 후 확정된 canonical 문장",
  "transcriptDraft": "확장이 수집한 화면 자막 label (초안)",
  "difficulty": null,
  "alternatives": [],
  "notes": "",
  "sourceTitle": "...", "sourceUrl": "...",
  "createdAt": "...", "updatedAt": "...",
  "anki": {
    "deckName": "English::PhraseLoop",
    "noteId": 1234567890,
    "addedAt": "...", "lastSyncedAt": "...",
    "status": "synced",
    "contentHash": "..."
  }
}
```

### 4.3 확장 프로그램 변경 (최소한만)

기존 A/B 선택·트림·미리듣기·자막 후보·라벨 UI는 이미 구현되어 있으므로 그대로 쓴다. 추가할 것:

- 패널에 **"로컬로 가져오기"** 버튼: 클릭 시 `fetch`로 서버 `POST /import` 호출 (loopId, videoId, title, url, start, end, label 전달 — label이 로컬 앱의 `transcriptDraft`가 된다). 성공 시 서버가 반환한 `captureHash`를 루프의 `lastImportedHash`로 기록.
- 현재 구간의 `(videoId, start, end, label)` hash와 `lastImportedHash`가 다르면 변경 후 미전송 상태다.
- 서버가 꺼져 있으면 실패 표시만 하고 데이터는 지금처럼 `chrome.storage.local`에 남는다. **별도 큐 시스템 불필요** — hash 불일치 루프가 곧 미전송 목록.
- 라이브러리 페이지에 "미전송 N건 모두 보내기" 버튼.
- 설정 페이지에 서버 URL(기본 `http://127.0.0.1:17311`)과 토큰 입력란.

## 5. 서버 API (개요)

| 메서드/경로 | 역할 |
|---|---|
| `POST /import` | 구간 수신 → 폴더 생성 → MP3 추출 시작 (idempotent: 같은 loopId 재수신 시 갱신) |
| `GET /api/items` | 아이템 목록 (상태 필터) |
| `GET /api/items/:videoId/:loopId` | 아이템 조회 |
| `PATCH /api/items/:videoId/:loopId` | transcript·alternatives·difficulty·notes·tags·review 상태 수정(allowlist) |
| `POST /api/items/:videoId/:loopId/process` | MP3 생성 또는 실패 작업 재시도 |
| `POST /api/items/:videoId/:loopId/anki` | Anki에 추가 또는 업데이트 |
| `GET /media/...` | mp3 서빙 |
| `GET /` | Dictation 웹앱 |

## 6. Dictation / 검수 화면

목록 화면: 상태별 필터(needs_review / ready / in_anki), 영상별 그룹.

문제 화면 — 한 아이템씩 진행:

1. MP3 자동 재생
2. 들리는 문장 타이핑
3. Enter로 채점
4. **단어 단위** 오답·누락 표시 (대소문자·문장부호 무시, 못 맞춘 단어는 글자 수만큼 `***` 마스킹 — dailydictation 방식)
5. 다시 듣기 (단축키: Ctrl 단독 또는 버튼)
6. 정답 공개 (Esc)
7. 스크립트 직접 수정 — `transcriptDraft`(확장이 수집한 화면 자막)를 실제 음성과 대조해 교정하고 canonical `transcript`로 확정. 추출된 MP3가 구간을 잘못 잘랐는지(음성 잘림 등)도 이 단계에서 확인
8. **난이도 부여**: easy / normal / hard (또는 미지정). 목록 필터와 Anki 태그로 사용
9. "검수 완료(ready)" 후 활성화되는 "Anki에 추가"

플레이어 설정: 재생 속도(0.5~2x), 자동 반복 횟수, 반복 간격. 진행/설정은 서버 저장 또는 localStorage 아무거나 (학습 기록이 아니므로 중요하지 않음).

검수 필드: Audio(재생만), Transcript, Alternative Answers(로컬 채점 전용), Difficulty, Source Title/URL, Start/End, Notes, Tags. CEFR은 MVP 제외.

## 7. Anki 연동 (AnkiConnect)

- AnkiConnect 애드온(코드 2055492159, FooSoft) 사용, `127.0.0.1:8765`. Anki 데스크톱 실행 중이어야 함.
- "Anki에 추가" 동작 순서: 서버 검수 게이트 확인 → `version` 연결 확인 → `deckNames`/`createDeck` → `modelNames`와 `modelFieldNames`로 "PhraseLoop Dictation" 검증(없으면 `createModel`) → `storeMediaFile`로 `phraseloop_LOOP_ID.mp3` 복사 → 저장된 noteId 조회 또는 LoopId 검색 → `addNote`/`updateNoteFields` → noteId와 contentHash를 item.json에 저장, `anki.status=synced`. 난이도는 노트 태그(`phraseloop::easy` 등)로 전달.
- **멱등성**: LoopId를 노트 타입의 첫 번째 필드로 두어 중복 감지. noteId가 이미 있으면 버튼은 "Anki 카드 업데이트"(`updateNoteFields`)로 동작. Anki에서 노트가 삭제된 경우(조회 실패)는 재추가 허용. `contentHash` 비교로 "로컬이 Anki보다 새로움" 표시.
- Alternative Answers는 Anki `{{type:...}}`가 단일 문자열 비교라 카드에서는 사용하지 않는다. **검수 확정된 canonical transcript 하나만 정답으로 사용.**

노트 타입 "PhraseLoop Dictation" — 필드 순서: `LoopId, Audio, Transcript, Notes, SourceTitle, SourceUrl, Start, End`

앞면:
```
{{Audio}}
<div class="dictation-input">{{type:Transcript}}</div>
```

뒷면:
```
{{FrontSide}}
<hr id="answer">
<div class="transcript">{{Transcript}}</div>
<div class="notes">{{Notes}}</div>
<a href="{{SourceUrl}}">YouTube 원본</a>
```

연결 실패 시: 데이터 손실 없이 안내 메시지 + `[다시 연결]` `[Anki CSV로 내보내기]`. 기존 `scripts/export-anki.mjs` CSV 워크플로는 fallback으로 유지한다.

## 8. 구현 우선순위

1. companion 서버 골격 + `PhraseLoopData/` 저장 구조 + 토큰 (curl로 검증 가능)
2. 미디어 파이프라인: 구간 MP3 추출 (transcriptDraft는 확장이 보낸 label 그대로 저장)
3. 확장의 "로컬로 가져오기" 버튼 + 설정(URL/토큰) + 미전송 일괄 전송
4. Dictation/검수 웹 화면 (받아쓰기 채점, 스크립트 교정, 난이도 부여)
5. AnkiConnect 연결 및 노트 타입 자동 생성
6. 단건/선택/ready 전체 Anki 추가 + 업데이트(멱등)
7. CSV 내보내기 fallback 유지 확인

각 단계는 완료 시점에 단독으로 사용 가능해야 한다.

## 9. 범위 제외 (MVP)

- yt-dlp 자막 다운로드 및 cue/구간 매칭 (초안은 확장이 수집한 화면 자막으로 충분; 필요해지면 향후 옵션으로 검토)
- Whisper 등 음성인식 기반 자막
- CEFR 자동 판정, 번역, 클라우드 동기화
- 로컬 앱 내 간격 반복/학습 통계
- 문장 단위 자동 분할 (구간 하나 = 카드 하나; 긴 구간은 확장에서 애초에 짧게 자르는 것으로 해결)
- .apkg 생성 (AnkiConnect + CSV fallback으로 충분)

## 10. 성공 기준

- YouTube에서 구간 선택 → 버튼 1번 → 정상 네트워크의 일반 영상에서 30초 내 받아쓰기 가능을 목표로 하며, 처리 진행과 재시도 상태가 항상 표시됨
- 검수 없이 Anki로 들어가는 카드가 구조적으로 존재하지 않음
- 같은 구간을 두 번 추가해도 Anki에 중복 노트가 생기지 않음
- `PhraseLoopData/` 폴더만 복사하면 전체 백업 완료
