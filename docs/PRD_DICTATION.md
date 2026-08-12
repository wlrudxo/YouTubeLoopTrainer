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

```
imported → needs_review → ready → in_anki
```

- `imported`: 확장에서 구간 수신, 미디어 처리 대기/진행 중
- `needs_review`: MP3 + 자막 기반 정답 후보 생성 완료, 검수 대기
- `ready`: 사용자가 받아쓰기/검수를 마치고 canonical transcript 확정
- `in_anki`: Anki에 노트 추가 완료 (noteId 보유)

## 4. 아키텍처

### 4.1 로컬 companion 서버

- Node.js 단일 프로세스, 프레임워크 없이 `node:http` 수준으로 가볍게. (프로젝트는 이미 Node/ESM 기반)
- **127.0.0.1 전용 바인딩**, 기본 포트 **17311**.
- 인증: 서버 최초 실행 시 `PhraseLoopData/config.json`에 랜덤 토큰 생성. 확장 설정 페이지에 사용자가 붙여넣는 정적 토큰 방식. 요청 헤더로 검증. CORS는 확장 origin으로 제한.
- 하는 일:
  1. 확장에서 구간 정보 수신 (`POST /import`)
  2. yt-dlp로 영어 자막 확보 (`--write-auto-subs` / `--write-subs`, vtt)
  3. yt-dlp/ffmpeg로 구간별 MP3 생성 (기존 `scripts/export-anki.mjs`의 섹션 다운로드 로직 재사용 가능)
  4. 자막 cue와 구간 시간을 매칭해 정답 후보 텍스트 생성
  5. Dictation 웹 화면(정적 HTML/JS) 서빙
  6. AnkiConnect(127.0.0.1:8765) 호출

### 4.2 저장 폴더 (단일 진실 원천)

브라우저 localStorage가 아닌 파일 시스템에 저장한다. 백업 = 폴더 복사.

```
PhraseLoopData/
  config.json            # 포트, 토큰, Anki 덱 이름 등
  library.json           # 전체 아이템 인덱스 (목록 화면용 캐시)
  videos/
    VIDEO_ID/
      source.json        # 영상 제목, 채널, URL
      subtitles.en.vtt
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
  "status": "needs_review",
  "transcript": "검수 후 확정된 canonical 문장",
  "transcriptDraft": "자막에서 자동 생성된 후보",
  "alternatives": [],
  "notes": "",
  "sourceTitle": "...", "sourceUrl": "...",
  "createdAt": "...", "updatedAt": "...",
  "anki": {
    "deckName": "English::PhraseLoop",
    "noteId": 1234567890,
    "addedAt": "...", "lastSyncedAt": "...",
    "contentHash": "..."
  }
}
```

### 4.3 확장 프로그램 변경 (최소한만)

기존 A/B 선택·트림·미리듣기·자막 후보·라벨 UI는 이미 구현되어 있으므로 그대로 쓴다. 추가할 것:

- 패널에 **"로컬로 가져오기"** 버튼: 클릭 시 `fetch`로 서버 `POST /import` 호출 (loopId, videoId, title, url, start, end, label 전달). 성공 시 루프에 `importedAt` 기록.
- 서버가 꺼져 있으면 실패 표시만 하고 데이터는 지금처럼 `chrome.storage.local`에 남는다. **별도 큐 시스템 불필요** — `importedAt` 없는 루프가 곧 미전송 목록.
- 라이브러리 페이지에 "미전송 N건 모두 보내기" 버튼.
- 설정 페이지에 서버 URL(기본 `http://127.0.0.1:17311`)과 토큰 입력란.

## 5. 서버 API (개요)

| 메서드/경로 | 역할 |
|---|---|
| `POST /import` | 구간 수신 → 폴더 생성 → 미디어 파이프라인 시작 (idempotent: 같은 loopId 재수신 시 갱신) |
| `GET /api/items` | 아이템 목록 (상태 필터) |
| `GET /api/items/:loopId` · `PATCH` | 아이템 조회 / transcript·notes·status 수정 |
| `POST /api/items/:loopId/anki` | Anki에 추가 또는 업데이트 |
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
7. 스크립트 직접 수정 (자동 자막이 틀린 경우 여기서 교정)
8. "검수 완료(ready)" 또는 "Anki에 추가"

플레이어 설정: 재생 속도(0.5~2x), 자동 반복 횟수, 반복 간격. 진행/설정은 서버 저장 또는 localStorage 아무거나 (학습 기록이 아니므로 중요하지 않음).

검수 필드: Audio(재생만), Transcript, Alternative Answers(로컬 채점 전용), Source Title/URL, Start/End, Notes, Tags. CEFR은 MVP 제외.

## 7. Anki 연동 (AnkiConnect)

- AnkiConnect 애드온(코드 2055492159, FooSoft) 사용, `127.0.0.1:8765`. Anki 데스크톱 실행 중이어야 함.
- "Anki에 추가" 동작 순서: `version` 연결 확인 → `deckNames`/`createDeck` → `modelNames`에 "PhraseLoop Dictation" 없으면 `createModel` → `storeMediaFile`로 `phraseloop_LOOP_ID.mp3` 복사 → `addNote` → 반환된 noteId를 item.json에 저장, 상태 `in_anki`.
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
2. 미디어 파이프라인: 자막 확보 + 구간 MP3 + 정답 후보 생성
3. 확장의 "로컬로 가져오기" 버튼 + 설정(URL/토큰) + 미전송 일괄 전송
4. Dictation/검수 웹 화면
5. AnkiConnect 연결 및 노트 타입 자동 생성
6. 단건/선택/ready 전체 Anki 추가 + 업데이트(멱등)
7. CSV 내보내기 fallback 유지 확인

각 단계는 완료 시점에 단독으로 사용 가능해야 한다.

## 9. 범위 제외 (MVP)

- Whisper 등 음성인식 기반 자막 (yt-dlp 자막만 사용)
- CEFR 자동 판정, 번역, 클라우드 동기화
- 로컬 앱 내 간격 반복/학습 통계
- 문장 단위 자동 분할 (구간 하나 = 카드 하나; 긴 구간은 확장에서 애초에 짧게 자르는 것으로 해결)
- .apkg 생성 (AnkiConnect + CSV fallback으로 충분)

## 10. 성공 기준

- YouTube에서 구간 선택 → 버튼 1번 → 30초 내 로컬에서 받아쓰기 가능
- 검수 없이 Anki로 들어가는 카드가 구조적으로 존재하지 않음
- 같은 구간을 두 번 추가해도 Anki에 중복 노트가 생기지 않음
- `PhraseLoopData/` 폴더만 복사하면 전체 백업 완료
