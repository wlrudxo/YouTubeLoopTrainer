# PRD — PhraseLoop Dictation (로컬 받아쓰기 + Anki 연동)

작성일: 2026-08-12 · 상태: 초안 v1

## 1. 배경과 문제

기존 PhraseLoop 확장(YouTube A–B 구간 반복 재생)은 구간 선택까지는 잘 쓰이지만, 실제로 저장된 구간을 되돌아가 반복 청취하는 일이 없었다. 학습이 일어나려면 "다시 듣기"가 아니라 **받아쓰기(dictation)** 형태의 능동적 연습과, 검수된 문장의 **Anki 장기 복습**으로 이어져야 한다.

## 2. 역할 분리 (핵심 원칙)

| 구성요소 | 역할 |
|---|---|
| YouTube 확장 | 학습할 구간을 정확히 잘라서 로컬로 보내는 **채집기**. 학습 기능 없음 |
| 로컬 companion 서버 + 검수 웹앱 | MP3 생성, 스크립트 교정·검수, Anki 전달 |
| Anki | 카드의 장기 복습과 회상 훈련 (듣기 → 재구성 → 정답 확인, 간격 반복) |

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
- 인증: 서버 최초 실행 시 `PhraseLoopData/config.json`에 랜덤 토큰 생성. 확장 설정 페이지에 사용자가 붙여넣고 `Save & Connect`로 현재 확장 origin을 페어링한다. 이후 요청 헤더로 토큰을 검증하며 CORS는 페어링된 확장 origin으로 제한한다.
- 하는 일:
  1. 확장에서 구간 정보 수신 (`POST /import`)
  2. yt-dlp/ffmpeg로 구간별 MP3 생성
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
      source.json        # 영상 제목, 채널명, URL
      thumbnail.jpg      # 영상 썸네일 (i.ytimg.com/vi/VIDEO_ID/mqdefault.jpg, import 시 1회 다운로드)
      channel.jpg        # 채널 아바타 (import 시점 스냅샷, 1회 다운로드)
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
  "meaning": "",
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

### 4.3 확장 프로그램 = 전송 큐 (capture buffer)

확장은 채집과 전송만 담당하며, 라이브러리/학습 관리 기능은 없다. 데이터 원본은 항상 `PhraseLoopData/`이고, 확장과 로컬 앱 사이에 동기화는 없다 — **순차적 이동**만 있다.

- 캡처 UX(A/B 마커, 트림, 미리듣기, 자막 라벨 수집, 단축키)는 유지.
- 저장 시 `POST /import`로 전송 (loopId, videoId, title, url, start, end, label, channelTitle, channelAvatarUrl — label이 로컬 앱의 `transcriptDraft`가 된다).
- **전송 성공 = 확장 storage에서 해당 루프 삭제.** 따라서 확장에 남아 있는 루프 = 미전송분 전부이며, 불일치라는 개념이 없다. hash 추적 불필요.
- 팝업 = 미전송 큐: 대기 루프 목록, "모두 보내기", 개별 삭제, Dictation 앱 열기, 설정 링크.
- 설정 페이지: 서버 URL(기본 `http://127.0.0.1:17311`) + 토큰 + 페어링. JSON 백업/가져오기·Anki JSON 내보내기는 제거 (원본이 로컬 앱으로 이동했으므로).
- 라이브러리 페이지, 루프 status(new/hard/done), 진행 위치 저장, `pl_loop` 딥링크는 삭제됨 (git 히스토리에 보존).

## 5. 서버 API (개요)

| 메서드/경로 | 역할 |
|---|---|
| `POST /pair` | 올바른 토큰을 제시한 Chrome 확장 origin을 CORS 허용 목록에 등록 |
| `POST /import` | 구간 수신 → 폴더 생성 → MP3 추출 시작 + 영상 썸네일·채널 아바타 최초 1회 다운로드 (idempotent: 같은 loopId 재수신 시 갱신) |
| `GET /api/items` | 아이템 목록 (상태 필터) |
| `GET /api/items/:videoId/:loopId` | 아이템 조회 |
| `PATCH /api/items/:videoId/:loopId` | transcript·meaning·notes·tags·review 상태 수정(allowlist) |
| `DELETE /api/items/:videoId/:loopId` | 아이템 버리기 (쉬워서 Anki에 안 넣을 항목 정리). loopId를 tombstone 목록에 기록 |
| `POST /api/items/:videoId/:loopId/process` | MP3 생성 또는 실패 작업 재시도 |
| `POST /api/items/:videoId/:loopId/anki` | Anki에 새 노트 추가 |
| `GET /media/...` | mp3 서빙 |
| `GET /` | Dictation 웹앱 |

**Discard tombstone**: 버린 loopId는 `PhraseLoopData/discarded.json`에 기록한다. 해당 loopId가 `POST /import`로 재수신되면 아이템을 되살리지 않고 무시하되, 성공 응답(captureHash 포함)을 반환해 확장이 재전송을 멈추게 한다. (확장의 "미전송 일괄 전송"이 버린 아이템을 부활시키는 것을 방지)

## 6. Dictation / 검수 화면

목록 화면: 상태별 필터(needs_review / ready / in_anki), 영상별 그룹. 각 영상 그룹에 영상 썸네일·채널 아바타·채널명·영상 제목을 표시해 어떤 영상에서 온 구간인지 한눈에 알 수 있게 한다. 이미지는 로컬 저장본(`thumbnail.jpg`, `channel.jpg`)을 서빙 — 외부 URL 핫링크에 의존하지 않는다 (아바타 URL은 시간이 지나면 만료될 수 있음).

검수 화면 — 한 아이템씩 진행:

1. MP3는 아이템 선택 시 자동 재생하지 않는다. 사용자가 Ctrl 단독 키 또는 재생 버튼을 눌러 시작한다.
2. 듣기 / 다시 듣기 (Ctrl 단독 또는 Replay 버튼)
3. 스크립트 직접 수정 — `transcriptDraft`(확장이 수집한 화면 자막)를 실제 음성과 대조해 교정하고 canonical `transcript`로 확정. 추출된 MP3가 구간을 잘못 잘랐는지(음성 잘림 등)도 이 단계에서 확인
4. 판정: "Anki에 추가"(클릭 시 현재 필드 자동 저장 후 추가) 또는 **"버리기(discard)"** — 한 번에 알아들을 만큼 쉬운 문장은 Anki에 넣지 않고 버린다

**타이핑 받아쓰기(type-what-you-hear) 기능은 두지 않는다.** 목록·타이틀·Transcript 필드에 정답이 이미 보이는 검수 화면에서는 blind dictation이 성립하지 않으며, 회상 훈련은 Anki 카드(듣기 → 머릿속 재구성 → 정답 확인)가 담당한다. 같은 이유로 대안 철자(alternatives)·채점 개념도 없다.

난이도 등급은 두지 않는다. 난이도 평가는 Anki 복습 버튼(Again/Good/Easy)이 이미 수행하며, 쉬운 항목은 애초에 추가하지 않는 것이 선별 원칙이다.

검수 필드: Audio(재생만), Transcript, Meaning, Source Title/URL, Start/End, Notes, Tags. CEFR은 MVP 제외.

- **Meaning**: 선택 입력(빈칸 허용). 듣기가 아니라 문법·단어·뜻이 어려운 문장일 때 사용자가 번역/의미를 수동으로 적는 필드. Anki 카드 뒷면에 그대로 전달된다.

## 7. Anki 연동 (AnkiConnect)

- AnkiConnect 애드온(코드 2055492159, FooSoft) 사용, `127.0.0.1:8765`. Anki 데스크톱 실행 중이어야 함.
- "Anki에 추가" 동작 순서: 서버 게이트 확인(MP3 완료 + 비어 있지 않은 transcript) → `version` 연결 확인 → `deckNames`/`createDeck` → `modelNames`와 `modelFieldNames`로 "PhraseLoop Dictation" 검증(없으면 `createModel`) → `storeMediaFile`로 `phraseloop_LOOP_ID.mp3` 및 영상당 1회 `phraseloop_thumb_VIDEO_ID.jpg` 복사 → `addNote`(allowDuplicate) → noteId와 contentHash를 item.json에 저장, `anki.status=synced`, review는 자동으로 `ready` 처리.
- **Add 전용 (Yomitan 방식, update 없음)**: 기존 노트 조회(`notesInfo`/`findNotes`)나 `updateNoteFields`는 사용하지 않는다 — Anki에서 사용자가 노트를 지웠을 때 조회가 에러를 내는 등 동기화 가정이 깨지기 쉽기 때문. 버튼은 추가 후 "Added ✓"로 표시되고, 다시 누르면 새 노트로 재추가된다. 수정이 필요하면 Anki에서 직접 고치거나, 지우고 다시 추가한다.
- **카드는 타이핑 입력(`{{type:...}}`)을 사용하지 않는다.** 타이핑 훈련은 로컬 Dictation 앱에서 이미 수행했으므로, Anki에서는 듣기 → 머릿속 재구성 → 정답 확인 → 복습 버튼(Again/Hard/Good/Easy) 자가 평가로 진행한다. 모바일 복습이 수월해지고, 구간이 여러 문장이어도 카드로 쓸 수 있다.
- 영상 썸네일은 **앞면과 뒷면 모두 맨 위에** 표시한다 (영상 맥락 상기가 힌트 우려보다 유용하다고 판단). 썸네일 이미지는 `storeMediaFile`로 영상당 1회 `phraseloop_thumb_VIDEO_ID.jpg`로 복사하고, `Thumbnail` 필드에 `<img>` 태그로 넣는다. 썸네일 클릭 시 YouTube 원본 시점으로 이동.

노트 타입 "PhraseLoop Dictation" — 필드 순서: `Transcript, Audio, Meaning, Notes, Thumbnail, SourceTitle, ChannelTitle, SourceUrl, Start, End`

LoopId는 노트 필드로 저장하지 않는다 (update 로직이 없으므로 키가 불필요). Transcript가 첫 필드이므로 Anki의 기본 중복 감지가 문장 기준으로 동작한다.

`Meaning`은 빈칸일 수 있으며, 로컬 앱에서 입력한 번역/의미가 그대로 들어간다.

`SourceTitle`(영상 제목)과 `ChannelTitle`(채널명)은 Anki 노트 필드로 저장되어 뒷면에 표시된다. 채널명은 서버가 `source.json`에서 가져와 채운다.

앞면:
```
<a class="thumbnail-link" href="{{SourceUrl}}">{{Thumbnail}}</a>
<div class="audio-container">{{Audio}}</div>
```

뒷면:
```
{{FrontSide}}
<hr id="answer">
<div class="transcript">{{Transcript}}</div>
{{#Meaning}}<div class="meaning">{{Meaning}}</div>{{/Meaning}}
<div class="notes">{{Notes}}</div>
<div class="source-title">{{SourceTitle}}</div>
<div class="channel-title">{{ChannelTitle}}</div>
```

썸네일 클릭 = YouTube 원본 해당 시점으로 이동 (SourceUrl에 `t=` 파라미터 포함). 별도 텍스트 링크는 두지 않는다.

카드 CSS는 음성 재생 버튼을 화면 하단에 고정하고 본문에 하단 여백을 둔다. 썸네일은 뒷면에서 최대 폭 280px로 제한한다. 현재 필드 구성이 일치하는 개발용 노트 타입은 Anki 전송 시 템플릿과 CSS를 최신 정의로 갱신한다.

연결 실패 시 데이터 손실 없이 안내하고, Anki와 AnkiConnect를 실행한 뒤 다시 시도할 수 있게 한다.

## 8. 구현 우선순위

1. companion 서버 골격 + `PhraseLoopData/` 저장 구조 + 토큰 (curl로 검증 가능)
2. 미디어 파이프라인: 구간 MP3 추출 (transcriptDraft는 확장이 보낸 label 그대로 저장)
3. 확장의 "로컬로 가져오기" 버튼 + 설정(URL/토큰) + 미전송 일괄 전송
4. Dictation/검수 웹 화면 (받아쓰기 채점, 스크립트 교정, 추가/버리기 판정)
5. AnkiConnect 연결 및 노트 타입 자동 생성
6. 검수 화면에서 단건 Anki 추가

각 단계는 완료 시점에 단독으로 사용 가능해야 한다.

## 9. 범위 제외 (MVP)

- yt-dlp 자막 다운로드 및 cue/구간 매칭 (초안은 확장이 수집한 화면 자막으로 충분; 필요해지면 향후 옵션으로 검토)
- Whisper 등 음성인식 기반 자막
- 난이도 등급(easy/normal/hard) — 난이도는 Anki 복습 버튼이 담당하고, 쉬운 항목은 추가하지 않고 버리는 것으로 대체
- CEFR 자동 판정, 번역, 클라우드 동기화
- 로컬 앱 내 간격 반복/학습 통계
- 문장 단위 자동 분할 (구간 하나 = 카드 하나; 긴 구간은 확장에서 애초에 짧게 자르는 것으로 해결)
- .apkg 및 CSV 생성 (AnkiConnect 직접 연동으로 충분)
- 영상(mp4)·장면 캡처 저장 — 미디어는 mp3만. 받아쓰기는 청취 훈련이라 영상은 힌트로 작동해 오히려 방해되고, 용량도 mp3의 3~20배. 장면 확인은 카드의 SourceUrl + Start로 YouTube 원본 시점 이동으로 대체. (필요 시 향후 "시작 프레임 1장 캡처" 옵션으로 검토)

## 10. 성공 기준

- YouTube에서 구간 선택 → 버튼 1번 → 정상 네트워크의 일반 영상에서 30초 내 받아쓰기 가능을 목표로 하며, 처리 진행과 재시도 상태가 항상 표시됨
- 검수 없이 Anki로 들어가는 카드가 구조적으로 존재하지 않음
- 같은 loopId를 다시 가져와도 로컬 아이템이 중복 생성되지 않음
- `PhraseLoopData/` 폴더만 복사하면 전체 백업 완료
