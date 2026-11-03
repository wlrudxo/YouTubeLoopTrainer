# 영어 듣기 도구 비교와 PhraseLoop 판단

**추천: asbplayer + AnkiConnect를 그대로 쓰고, PhraseLoop 재작성은 보류한다.** 영어 자막이 있는 YouTube 클립에서 원음 카드를 하루 3~10개 수집한다. 자막 없는 아카이브는 같은 도구의 수동 녹음으로 처리하고, 반복해서 볼 방송에만 로컬 Whisper 전사를 붙인다. PhraseLoop는 기존 데이터와 소스를 보존하고 새 기능을 개발하지 않는다.

기준일: 2026-11-03. 공식 문서·배포 페이지와 저장소 소스를 대조한 검토다. 확장 설치, 실제 YouTube 녹음, Anki 전송과 모바일 재생은 이번 작업에서 실행하지 않았다.

## 추천의 근거

목표는 어휘를 더 많이 모으는 것이 아니라, 이미 아는 말이 자연스러운 소리로 나올 때 편하게 이해하는 것이다. 토익 900, 오픽 IM3~IH이고 대본 있는 영상은 상당 부분 들리지만 원어민끼리의 잡담은 피곤하다는 사용자 설명을 기준으로 삼았다. 홀로라이브 EN 클립·합방에서 **읽으면 이해되는데 소리로 놓친 짧은 발화**를 고르는 흐름에 맞춘 판단이다. 학습 효과를 측정한 결과는 아니다.

asbplayer는 자막 구간의 실제 음성·화면·문장을 Anki에 넣고, 설정 후에는 대화창을 건너뛰어 전송할 수 있다. 무료 공개 소스이며 결과는 Anki의 로컬 미디어와 노트로 남는다. 이미 쓰는 Yomitan을 다시 설정하지 않아도 문장 카드 수집부터 시작할 수 있다. [카드 생성 안내](https://docs.asbplayer.dev/docs/getting-started/mining-subtitles/), [전송·녹음·단축키 설정](https://docs.asbplayer.dev/docs/reference/settings/), [소스와 라이선스](https://github.com/asbplayer/asbplayer).

다만 **자막 구간 한 번 전송과 ‘방금 지난 2~5초’를 한 번에 저장하는 것은 다르다.** asbplayer의 무자막 경로는 녹음 시작과 종료가 필요하다. 이것까지 처음부터 한 번이어야 한다면 아직 요구가 남는다. 하루 몇 개를 모으는 실제 사용에서 이 차이가 계속 불편한지 본 뒤, 마지막 절의 작은 보완만 검토한다. [무자막 녹음 동작](https://docs.asbplayer.dev/docs/guides/mining-in-depth/).

## 기능 비교

‘원음’은 영상에서 추출·녹음한 소리다. 단어 발음이나 문장을 합성한 TTS와 구분했다. ‘미확인’은 공식 자료만으로 해당 조건을 판정하지 못했다는 뜻이다. 긴 영상은 **방송이 끝난 아카이브(VOD)**를 기준으로 하며, 진행 중 라이브의 시간축·자막 지원과 구분한다.

| 도구 | YouTube·자동 자막·긴 아카이브 | 원음 + 문장 + 이미지 → Anki | 한 번 전송과 오디오 앞면 | 자막 없는 영상 |
|---|---|---|---|---|
| **[asbplayer](https://docs.asbplayer.dev/docs/compatibility/)** | YouTube 자막 감지 지원. 최신 확장 릴리즈에 새 자동 자막 형식 대응 포함. 수시간 VOD의 길이 상한·실동작은 미확인 | 영상 음성 녹음 + 자막 + 장면 캡처, AnkiConnect 직접 전송. [필드 설명](https://docs.asbplayer.dev/docs/reference/settings/) | 대화창 생략 전송 동작 있음. 자막이 짧고 정확하면 단축키 한 번. 오디오 앞면은 Anki 템플릿으로 구성 | 빈 자막 트랙에서 시작·종료 두 번으로 원음 녹음. 정답 문장은 수동 입력 또는 외부 전사. [상세](https://docs.asbplayer.dev/docs/guides/mining-in-depth/) |
| **[Language Reactor](https://www-origin.languagereactor.com/)** | YouTube·Netflix 중심. YouTube 자동 자막별 동작과 수시간 VOD 제한은 미확인 | 현재 공식 안내는 오디오 클립·이미지를 포함한 Anki 내보내기를 명시. ‘TTS만 된다’고 판단하면 틀림. 실제 YouTube 원음 첨부 조건은 미확인 | 공식 절차는 저장 항목 → Export → `.apkg` 가져오기. 즉시 AnkiConnect 전송 단축키는 미확인. 가져온 뒤 오디오 앞면 수정 가능. [내보내기](https://www.languagereactor.com/help/export) | Pro의 음성인식 설명은 Netflix 오디오 트랙 대상. 무자막 YouTube 전체를 전사해 준다고 확대할 근거 없음. [Pro 안내](https://www.languagereactor.com/pro-mode) |
| **[Migaku](https://chromewebstore.google.com/detail/migaku-really-learn-langu/lkhiljgmbeecmljiogckofcalncmfnfo?hl=en)** | YouTube·로컬 영상 지원. YouTube 자막 생성 기능을 공식 변경 기록에서 확인. 자동 자막 종류별·긴 VOD 상한은 미확인 | 공식 배포 설명에 영상 오디오 조각·스크린샷·문장 카드와 Anki 지원 명시 | 카드 생성 단축키 제공. 현행 버전의 AnkiConnect 경로와 ‘문장 전체를 원음 앞면으로 즉시 추가’하는 정확한 절차는 미확인. 자체 Memory와 구분 필요 | YouTube 자막 생성 가능. 긴 무자막 합방 처리 시간·영어 인식 품질은 미확인. [변경 기록](https://migaku.com/blog/changelog) |
| **[Trancy](https://manual.trancy.org/en/billing-and-plans/premium)** | YouTube 이중 자막·문장 분리 지원. 긴 영상 길이 제한은 미확인 | 공식 매뉴얼에서 확인한 내보내기는 자막 PDF·CSV. 원음·장면을 묶는 AnkiConnect 기능은 미확인 | 문장 수집·자체 플래시카드는 있음. 원하는 Anki 원음 앞면 즉시 전송은 미확인 | 유료 YouTube AI 전사 지원. Premium 40개/일, 상위 요금제 60개/일. 개당 길이 제한은 미확인. [현행 요금제](https://www.trancy.org/pricing) |
| **[mpvacious](https://github.com/Ajatt-Tools/mpvacious)** | mpv 기반 로컬 영상에 적합. YouTube는 mpv/yt-dlp 쪽 구성이 추가로 필요하며 본 검토에서 URL·자동 자막 조합 미확인 | 선택 자막·원음 조각·장면을 AnkiConnect로 직접 전송 | 기본 `Ctrl+N`으로 노트 생성. 원하는 노트 타입 설정 가능. 자막 구간이 적합할 때 빠름 | 공식 Audio cards 절에 자막 없이 수동 시각을 정해 오디오·이미지 카드 생성하는 방법 있음 |
| **[subs2srs](https://subs2srs.sourceforge.net/)** | 로컬 영상과 자막 파일을 미리 준비. YouTube 시청 중 채집 기능 없음 | 자막별 원음·장면·TSV 일괄 생성 후 Anki에 가져옴. 즉시 AnkiConnect 경로 아님 | 오디오 앞면 템플릿 가능. 하루 몇 개 선별하기보다 일괄 덱 생성에 적합 | 전사를 먼저 외부에서 준비해야 함 |
| **[Voracious](https://github.com/rsimmons/voracious)** | 로컬 미디어 라이브러리 중심. YouTube 직접 지원 미확인 | 자막 문장·오디오·이미지를 AnkiConnect로 즉시 전송 | 문장 카드 가능. 정확한 단일 단축키와 현재 Anki 호환성은 미확인 | 공식 README가 학습 언어 자막을 전제로 함. 무자막 용도로 선택할 이유가 적음 |
| **PhraseLoop** | 집 PC 5월판과 원격 최신판이 다름. 아래 이력 절 참조. 최신판도 YouTube 화면에 표시되는 자막만 수집 | 최신판은 companion에서 구간 MP3를 만들고 AnkiConnect로 전송. 이미 구현됨. 장면 캡처 대신 영상 썸네일 사용 | A·B·저장 후 별도 검수 화면에서 추가. 기본 앞면은 썸네일 + 오디오이므로 ‘오디오만’과 차이. 사용자 템플릿 수정은 보존함 | 원음 구간 추출은 가능하지만 자동 전사 없음. 비어 있지 않은 transcript가 있어야 Anki 추가 가능 |

Language Reactor의 현행 export schema에는 오디오 출처가 `microsoft`, `google`, `movie`로 나뉘며 오디오가 비어 있을 수도 있다. 따라서 ‘음성 필드가 있다’와 ‘원하는 YouTube 발화 원음이 항상 붙는다’는 따로 확인해야 한다. 이 도구를 이미 잘 쓰고 있었다면 내보내기를 시험해 볼 가치가 있지만, 지금 새로 선택할 때는 asbplayer의 직접 전송 절차가 더 분명하다. [공식 export 도움말](https://www.languagereactor.com/help/export).

## 비용·보존·모바일·유지보수

금액은 USD 기준 공개 안내다. 요금·버전은 기준일에 확인한 값이다. 설치하지 않고 공식 페이지를 읽었으므로 브라우저별 실제 동작까지 검증한 것은 아니다.

| 도구 | 무료·공개 소스·가격 | 로컬 보존·이동 | 확인한 최근 배포 |
|---|---|---|---|
| asbplayer | 무료, 현재 AGPL-3.0-or-later, 일부 MIT. 설치해서 사용하는 데 자체 fork 불필요 | 카드·미디어는 Anki로 보존. asbplayer 설정은 JSON 내보내기 가능 | 확장 **v1.22.0, 2026-10-14**. YouTube 자동 자막·녹음 종료 경쟁조건 수정 포함. 10/29 FFmpeg 런타임과 10/15 Anki add-on은 별도 제품이므로 확장 버전과 혼동하지 않음. [릴리즈](https://github.com/asbplayer/asbplayer/releases/tag/v1.22.0) |
| Language Reactor | 기본 무료 + Pro. 공식 페이지에 Bitcoin 결제 **월 $7부터** 표시. 일반 카드 결제 월·연 가격은 로그인 전 미확인. 현행 앱 소스 공개 여부 미확인 | `.apkg`, CSV, JSON 내보내기. 계정을 벗어나 보관할 수 있음. 사용자 수정 노트 타입을 재수입으로 갱신하지 않도록 선택 가능. [export](https://www.languagereactor.com/help/export) | **6.0.1, 2026-10-19**. [Chrome 공식 배포](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en) |
| Migaku | Standard **$10/월 또는 $96/년**, EA **$15/월 또는 $144/년**, Lifetime **$499**. 10일 체험. 현행 앱 소스 공개 여부 미확인. [공식 가격](https://migaku.com/pricing), [연간 금액 안내](https://migaku.com/learn-Korean) | Anki 지원은 공식 명시. Memory에 먼저 쌓인 전체 덱·미디어를 현행 공식 기능만으로 일괄 반출하는 정확한 절차는 미확인. 레거시 애드온 설명을 현행 기능으로 간주하지 않음 | 확장 **1.31.2, 2026-10-30**. [Chrome 공식 배포](https://chromewebstore.google.com/detail/migaku-really-learn-langu/lkhiljgmbeecmljiogckofcalncmfnfo?hl=en) |
| Trancy | 무료 + Premium + Premium/Advanced AI. 공식 매뉴얼은 지역 예시로 월 약 **$3.49 / $8.79**를 제시. 한국 실제 결제액 미확인. 가격 페이지의 `0`은 렌더링 결과이므로 무료로 해석하지 않음. 현행 앱 소스 공개 여부 미확인. [요금 설명](https://manual.trancy.org/en/billing-and-plans/premium) | 자막 PDF·CSV 반출은 확인. [export 안내](https://manual.trancy.org/en/get-started/use-extension/bilingual-subtitles/export-subtitle). 자체 수집함 전체와 원음 파일 일괄 보존은 미확인 | 확장 **7.9.6, 2026-10-30**. [Chrome 공식 배포](https://chromewebstore.google.com/detail/trancy-ai-translator-dual/mjdbhokoopacimoekfgkcoogikbfgngb?hl=en) |
| mpvacious | 무료, GPL-3.0. mpv·AnkiConnect 및 인코딩 도구 준비 필요 | 로컬 영상·자막과 Anki 미디어. 클라우드 계정 불필요. Windows도 지원하지만 공식 README는 Linux를 권장 | **v26.10.18.0, 2026-10-18**. [릴리즈](https://github.com/Ajatt-Tools/mpvacious/releases/tag/v26.10.18.0) |
| subs2srs | 무료, 소스 배포 있음. 상세 라이선스 미확인 | 로컬 TSV + 미디어. 다른 SRS에도 옮기기 쉬움 | 공식 파일 목록 **v29.7, 2017-10-01**. [배포 파일](https://sourceforge.net/projects/subs2srs/files/). 이번 신규 Windows 학습 흐름의 첫 선택으로는 오래된 도구체인이 부담 |
| Voracious | 무료, MIT | 로컬 미디어 라이브러리와 Anki. H.265·AC3 미지원이 공식 README에 남아 있음 | **v0.6.1, 2019-02-09**. [릴리즈](https://github.com/rsimmons/voracious/releases/tag/v0.6.1). 최근 배포가 있는 asbplayer/mpvacious보다 호환성 확인 부담이 큼 |
| PhraseLoop | 자작 소스, README상 MIT. 구독비 없고 유지보수는 직접 담당 | 최신판 `PhraseLoopData/`에 JSON + MP3 + 썸네일, Anki에도 미디어 복사 | 기능 확장 이력 2026-08-13, 검증·보수 기록 2026-10-25. 기준 원격 HEAD `d00ab31`. 로컬 checkout은 `dda4350` |

**모바일 복습은 Anki를 공통 종착점으로 삼는다.** PC에서 원음 MP3와 이미지가 든 카드를 만들고 미디어까지 동기화하면 Android는 무료 AnkiDroid, iPhone은 유료 AnkiMobile에서 복습할 수 있다. asbplayer·mpvacious·PhraseLoop처럼 Anki에 직접 보내거나, Language Reactor·subs2srs처럼 가져오기 파일을 쓰는 경우도 이후 경로는 같다. AnkiConnect는 PC 채집 때 필요하며 휴대폰 복습 때는 필요 없다. Migaku·Trancy 자체 모바일 앱의 복습은 AnkiDroid/AnkiMobile 연동과 별개다. [Anki 공식 앱·동기화](https://apps.ankiweb.net/).

오디오 호환성을 위해 asbplayer의 `Re-encode audio as mp3`를 켠다. 평문 필드 백업만으로 소리가 보존되지는 않으므로, Anki 덱을 내보낼 때는 **미디어 포함 `.apkg`와 평문 노트**를 함께 보관한다. [MP3 설정](https://docs.asbplayer.dev/docs/reference/settings/), [Anki 내보내기 형식](https://docs.ankiweb.net/manual/exporting).

AnkiConnect의 기존 GitHub 저장소는 archive 상태지만, README는 SourceHut로 영구 이전했다고 명시한다. archive 표시만 보고 개발 종료로 판단하지 않으며 설치는 공식 AnkiWeb 추가 기능 번호를 따른다. 이전 저장소의 현재 릴리즈·최신 커밋 날짜는 미확인이다. [공식 이전 공지](https://github.com/FooSoft/anki-connect).

## PhraseLoop가 애매한 이유

### 먼저, 집 PC의 코드와 원격 최신 코드는 다르다

처음 열린 로컬 `main`은 `dda4350`(2026-05-28)이었고, fetch 후 `origin/main`은 `d00ab31`이다. **서로 로컬 전용 1커밋 / 원격 전용 30커밋으로 갈라져 있다.** 단순 pull로 최신화할 수 있는 상태가 아니다. 로컬 문서 두 개(`PRD.md`, `IMPLEMENTATION_PLAN.md`)와 원격 문서 목록을 모두 확인했으며, 비교 보고서의 다른 이름 파일은 없었다.

| 확인한 이력 | 실제 들어 있는 것 | 판단에 미치는 영향 |
|---|---|---|
| 5월 `7c93457`, `20df163`, 로컬 `dda4350` | A/B 루프, 초안 트림, 화면 자막 라벨, JSON, `scripts/export-anki.mjs`의 yt-dlp/ffmpeg → MP3·영상·CSV 생성. 영상별 구간 다운로드 묶음 | ‘Anki 내보내기가 전혀 없다’는 판단은 이 버전에도 맞지 않음. 다만 수동 파일 왕복이 필요 |
| 8월 `92c15c4`~`055ac6f` | localhost companion, 확장 전송 큐, 구간 MP3 처리, 검수 인박스, AnkiConnect, 오디오 카드, 사용자 노트 타입 보존 | ‘AnkiConnect·원음 카드부터 새로 만들자’는 제안은 중복 개발 |
| 10월 `f46a062`, `5eb195c` | 비정상 캡처 시각 차단과 격리 검증 기록. 과거 전체 테스트 52개·typecheck·build 통과 기록 | 제품이 비어 있거나 빌드 불가해서 애매하다고 단정할 수 없음. 이번 실동작 검증 결과와는 구분 |

근거: [로컬 README](../README.md), [5월 export 소스](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/dda4350/scripts/export-anki.mjs), [원격 기준 README](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/README.md), [최신 제품 요구](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/docs/PRD_DICTATION.md), [10월 검증 기록](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/docs/MAINTENANCE_20261025.md).

### 최신판을 기준으로도 남는 간격

| 원하는 경험 | 최신판의 실제 동작 | 애매함의 원인 |
|---|---|---|
| 못 들은 뒤 단축키 한 번 | `[`로 A, `]`로 B, `\`로 저장·전송. A를 앞서 눌러야 하며 뒤늦게 발견하면 되돌아가 구간 설정 | 저장의 마지막 버튼은 하나지만 채집 전체는 여러 단계. ‘방금 지나간 발화’의 사후 채집이 없음 |
| 시청 중 카드 완성 | 확장 → 별도 companion → yt-dlp/ffmpeg 처리 → transcript 확인 → Anki 추가 | 화면 전환과 대기·검수 단계가 계속 끼어듦. 5월판의 수동 CSV보다 개선됐지만 시청 흐름에는 여전히 부담 |
| 자막 없이도 원음 + 정답 | 원음은 다운로드 가능. 라벨은 A~B 동안 화면에 보인 자막만 수집. 서버 전사 없음, 비어 있지 않은 transcript 필요 | 자막 없는 잡담에서는 사용자가 정답 문장을 써야 함. 화면에 구워진 편집 자막은 텍스트 트랙이 아님 |
| 오디오만 듣고 O/X | 기본 앞면이 썸네일 + 오디오. 기존 템플릿은 덮어쓰지 않으므로 Anki에서 수정 가능 | 카드 템플릿 한 번 수정하면 해결되는 부분이며 앱 재작성 이유가 아님 |
| 그 순간의 장면 | `i.ytimg.com`의 영상 썸네일을 보관·전송 | 장면 스크린샷은 없음. 다만 이번 목표에서는 이미지가 뒷면 보조라 우선순위 낮음 |
| 덜 관리하는 도구 | Node 서버·토큰 페어링·다운로더·ffmpeg·Chrome 확장·AnkiConnect를 함께 유지 | 작은 개인 도구의 범위가 이미 큼. asbplayer도 사이트 변경 영향은 받지만 그 대응을 직접 떠안지 않아도 됨 |

소스 근거: 기준 HEAD `d00ab31`의 [단축키](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/src/content/shortcuts.ts), [화면 자막 수집](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/src/content/visibleCaptionCollector.ts), [미디어 처리](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/scripts/companion/media.mjs), [Anki 전송·기본 템플릿](https://github.com/wlrudxo/YouTubeLoopTrainer/blob/d00ab31/scripts/companion/anki.mjs).

따라서 고쳐 쓴다면 **원격 최신판에 사후 구간 채집과 전송 단계 축소만 더하는 작업**이다. 새 앱을 처음부터 짤 근거는 약하다. 기존 `PhraseLoopData/`, JSON export, Anki 카드와 미디어는 보존하며, 도구 변경을 이유로 자동 변환하거나 삭제하지 않는다. 이번 조사에서는 저장된 개인 학습 데이터의 내용은 열지 않았다.

## 추천안으로 시작하는 설정

아래는 후속 실행용 절차다. 이번 작업에서는 설치·설정 변경을 하지 않았다. 초기 준비를 한 번 마치면 평소에는 Anki를 켜고 YouTube를 보면 된다.

1. PC Anki에 AnkiConnect(`2055492159`)가 이미 있으면 재사용한다. 없으면 Anki의 도구 → 추가 기능 → 추가 기능 가져오기에서 설치하고 다시 시작한다. [asbplayer 공식 준비 절차](https://docs.asbplayer.dev/docs/getting-started/mining-subtitles/).
2. [공식 안내](https://docs.asbplayer.dev/docs/getting-started/loading-subtitles/)의 Chrome 배포 링크에서 asbplayer를 설치한다. YouTube 영상에서 확장 → Open Side Panel → Load Subtitles로 영어 자막을 고른다. 처음에는 사람이 올린 영어 CC 또는 품질 좋은 영어 자동 자막이 있는 짧은 클립 하나로 시작한다. 한국어 번역 자막을 정답으로 채집하지 않는다.
3. Anki에 덱 `English::Listening`, 노트 타입 `Listening Audio`를 만든다. Basic을 복제하고 카드 타입은 하나만 둔다. 필드는 `Audio`, `Sentence`, `Meaning`, `Image`, `Source`, `URL`로 두며 **첫 필드는 Audio**로 한다. 무자막 카드에서 Sentence가 비어 있더라도 첫 필드가 비지 않게 하는 단순한 구성이다. 기존 PhraseLoop 노트 타입은 바꾸지 않는다.
4. 카드 앞면은 `{{Audio}}`만 둔다. 뒷면은 아래처럼 정답과 보조 정보를 둔다. 사진·문장·영상 제목이 앞면에서 답의 힌트가 되지 않게 한다. [Anki 필드·템플릿 문법](https://docs.ankiweb.net/manual/templates/fields).

   앞면:

   ```html
   {{Audio}}
   ```

   뒷면:

   ```html
   {{Sentence}}
   {{#Meaning}}<p>{{Meaning}}</p>{{/Meaning}}
   {{#Image}}<p>{{Image}}</p>{{/Image}}
   <p>{{Audio}}</p>
   <small>{{Source}}<br>{{URL}}</small>
   ```

5. asbplayer의 AnkiConnect 주소는 `http://127.0.0.1:8765`로 두고 위 덱·노트 타입을 고른다. 같은 이름의 필드끼리 연결하되 `Definition→Meaning`만 다르며 Word는 비워 둔다. 문장은 영어 트랙만 연결하고, 원음 녹음·장면 캡처·MP3 변환을 켠다. 앞뒤 여유는 각각 150ms로 시작해 잘림 여부에 맞춰 조절한다. [필드 연결](https://docs.asbplayer.dev/docs/getting-started/mining-subtitles/), [녹음 설정](https://docs.asbplayer.dev/docs/reference/settings/).
6. 첫 카드만 `Ctrl+Shift+X`로 열어 원음·구간·자막을 확인하고 Export한다. 2~5초를 목표로 하되 발화가 잘리면 길이를 조금 늘린다. **자막 한 줄의 길이가 자동으로 2~5초가 되지는 않는다.** 스트리밍 구간을 바꾸면 필요에 따라 다시 녹음해야 한다. [구간 조정](https://docs.asbplayer.dev/docs/guides/mining-in-depth/).
7. 첫 카드가 맞으면 마이닝 버튼 기본 동작을 `Export card`로 고르고, `Export card to Anki, bypassing dialog`에 단축키를 배정한다. 일부 명령은 `chrome://extensions/shortcuts`에서 바꾼다. 즉시 전송 키는 기본값이 비어 있다. 이후 정확한 자막은 이 키 한 번, 수정할 구간은 X 대화창으로 처리한다. [단축키·기본 동작](https://docs.asbplayer.dev/docs/reference/settings/).
8. PC Anki에서 카드와 미디어 동기화를 마치고 휴대폰에서도 동기화한다. 비행기 모드에서 첫 카드 원음이 재생되는지 한 번 확인한다. 하루 새 카드 한도는 우선 5개, 수집은 3~10개로 둔다. 이 숫자는 사용자 목표에 맞춘 시작값이다.

처음 확인할 것은 세 가지다. 앞면에서 원음만 나오는지, 뒤의 문장이 그 발화와 맞는지, 휴대폰에 실제 미디어가 내려왔는지다. 실제 사이트 녹음은 구간을 재생하며 시간이 걸릴 수 있으므로 단축키 한 번을 ‘지연 0’으로 해석하지 않는다.

Yomitan은 필요할 때만 단어 확인에 쓴다. 문장 원음 카드에는 정의·단어 필드를 매번 채울 필요가 없다. 공식 문서의 Yomitan ‘one-click mining’은 추가 Anki add-on·WebSocket을 쓰는 별도 경로다. 이번 목적의 문장 전송에는 먼저 붙이지 않는다. [Yomitan 연계 경로](https://docs.asbplayer.dev/docs/guides/one-click-mining/).

## 자막 없는 방송과 로컬 Whisper

우선 asbplayer에 빈 자막 트랙을 고르고 원하는 발화 앞으로 돌아가 녹음을 시작·종료한다. 공식 동작은 마이닝 명령을 처음 누르면 녹음 시작, 다시 누르면 Anki 대화창 열기다. 별도 수동 녹음 단축키는 기본 `Ctrl+Shift+R`이다. 이 방식은 원음부터 확보할 수 있지만 **정답 문장을 자동으로 만들지 않는다.** 문장을 확인할 수 있을 때만 카드로 마무리한다. [무자막·수동 녹음](https://docs.asbplayer.dev/docs/guides/mining-in-depth/), [단축키](https://docs.asbplayer.dev/docs/reference/settings/).

같은 아카이브를 계속 볼 때는 이미 있는 `C:\Users\kyoungtj\GitProject\_tools\Whisper`를 전사 공급원으로 쓸 수 있다. README와 `transcribe.py`, `stt_core.py`에서 로컬 faster-whisper turbo, `--language en`, CUDA 선택, segment의 start/end/text, 선택적 word timestamps를 확인했다. **현재 출력은 TXT·JSON이며 SRT/VTT exporter는 없다.** JSON을 그대로 asbplayer에 자막으로 넣을 수 있다고 안내하면 안 된다. [로컬 Whisper README](../../_tools/Whisper/README.md).

후속 작업이 필요하면 PhraseLoop repo 안에 작은 **Whisper JSON → SRT 변환기**만 두고 기존 전사 도구는 그대로 사용한다. 전사와 중간 출력은 repo의 무시된 출력 폴더에서 처리하고, 변환한 SRT를 YouTube 영상에 드래그한다. 전사한 오디오가 원본 일부면 SRT 시각에 잘라 낸 시작 시각을 더해야 한다. 별도 편집 클립과 원본 방송은 시간축이 다르므로 같은 자막을 바로 재사용하지 않는다.

몇 개 카드 때문에 수시간 방송 전체를 먼저 전사할 필요는 없다. 짧은 관심 구간으로 시작하고, 발화가 겹치거나 웃음·게임 소리가 큰 부분은 정답 확인 비용이 높으면 건너뛴다. Whisper는 초안이며, 짧은 문장 경계와 고유명사를 맞춰 주는 검수자는 아니다. 실제 홀로라이브 합방의 GPU 속도·오인식률은 이번 조사에서 측정하지 않았다.

## 사용하면서 고를 카드와 O/X 판정

자막을 읽으면 바로 이해되지만 실제 소리에서 놓친 2~5초 발화를 고른다. 의미를 알기 위해 긴 앞뒤 대화가 꼭 필요한 조각은 조금 넓히거나 건너뛴다. 편집 영상의 화면 글자만 있고 영어 자막 트랙이 없는 경우는 무자막 경로로 처리한다.

앞면 원음을 처음 듣고 뜻이 바로 들어오면 O, 여러 번 추론하거나 정답을 봐야 알면 X로 판정한다. Anki에서는 **X→Again, O→Good** 두 버튼만 쓰면 된다. O/X용 별도 채점 앱·음성인식·타이핑은 필요 없다. 판정 기준과 하루 5개 시작값은 이번 목적에 맞춘 운영 제안이다.

## 그래도 만든다면 최소 범위

후속 개발의 조건은 asbplayer를 실제로 써도 **무자막 발화를 놓친 뒤 되돌아가 녹음 시작·종료하는 과정이 계속 수집을 끊는 경우**다. 그때도 전체 학습 앱 재작성보다 기존 최신 PhraseLoop를 작은 채집기로 줄이는 쪽을 권한다.

| 항목 | 최소 명세 |
|---|---|
| 입력 | 현재 재생 위치와 원본 URL. 자막이 있으면 참고 문장, 없어도 원음 채집 허용 |
| 핵심 동작 | 단축키 한 번에 현재 시각을 끝점으로 삼아 직전 5초를 큐에 저장. 경계 편집은 필요할 때만. 아직 구현하지 않은 제안 |
| 원음 확보 | 먼저 기존 companion의 yt-dlp 구간 추출을 재사용. 진짜 재생 오디오의 ‘즉시 과거 5초’가 필수면 지속 캡처 버퍼가 별도 필요하며 권한·탐색·광고·일시정지 처리를 설계해야 함. 두 방식은 구현 비용이 다름 |
| 정답 초안 | 자막 있으면 사용, 없으면 클립만 기존 로컬 Whisper에 전달하는 선택 기능. 최종 문장 확인 후 Anki 추가. 긴 방송 전체 자동 전사는 제외 |
| 결과 | 실제 MP3 + 확인한 문장 + 원본 URL/시각. 장면 캡처는 뒷면 선택 기능 |
| 전송 | AnkiConnect 직접 추가, 로컬 실패 큐에서 재시도. 첫 필드가 비지 않게 하고 재시도에 따른 중복 추가를 막음. 현재 PhraseLoop는 명시적 재추가도 새 노트를 만드는 add-only이므로 무인 재시도와 구분 |
| 카드 | 앞면 Audio만, 뒷면 Sentence·Meaning·선택 Image·Source. Anki 기존 사용자 템플릿을 보존 |
| 데이터 | JSON/JSONL 메타데이터 + MP3, 보조 TSV export. Anki 외부에서도 읽을 수 있는 필드와 상대 미디어 경로 |
| 제외 | 자체 SRS·모바일 앱·사전·학습 통계·클라우드·전체 transcript 브라우저·라이브 방송 지원·새 대형 프레임워크 |

완료 판정은 **일반 VOD에서 단축키 한 번으로 재생 가능한 원음이 큐에 남고, 확인 뒤 오디오 앞면 카드가 Anki와 휴대폰에서 재생되며, Anki가 꺼져 있어도 큐가 보존되는 것**이다. 단축키 수·처리 지연·수동 교정 횟수를 실제 10개 카드에서 비교한다. 이 검토만으로 새 기능 구현이나 설치를 승인한 것으로 간주하지 않는다.

## 조사·반영 경계

- 현재 추천은 기존 도구 사용이다. PhraseLoop의 원격 코드까지 확인해 이미 있는 AnkiConnect·원음 앞면·로컬 파일 보존을 개발 목록에서 뺐다.
- 소유 결과 파일은 이 문서 하나다. 제품 코드, 확장, 운영 companion, Anki 설정, GoogleDrive, STATE·BACKLOG를 변경하지 않는다. 기존 개인 미디어·토큰 파일은 읽지 않았다.
- 집 PC의 5월 로컬 커밋 `dda4350`은 브랜치 `home-local-20260528`로 원격에 보존했고, 집 main은 원격 최신 main으로 맞춘 뒤 이 문서만 얹었다.
- 확인하지 못한 핵심은 실제 관심 영상의 자막 품질, asbplayer의 녹음 권한·단축키·모바일 재생, Language Reactor의 YouTube 원음 첨부 조건, Migaku 현행 Anki 즉시 전송 절차다. 추천안을 실행할 때 첫 카드로 앞의 세 가지를 확인한다.
- 운영 마찰 보고: 이 세션 PATH에서 `paseo` CLI를 찾지 못해 종료 1을 확인했다. 추가 설치 없이 Paseo MCP로 최신 위임 r1을 확인했다. 쓰기 경계 때문에 friction 원장은 수정하지 않는다.
- 검증: 비교 대상 7종과 PhraseLoop 두 버전을 공식 자료·코드로 대조했다. 문서의 코드펜스·상대 링크·문자 검사와 staged diff의 공백 검사를 통과했고, 첫 커밋의 변경 경로는 이 문서 하나였다. 제품 코드·실서비스를 실행하는 테스트는 조사 범위에 없어 수행하지 않았다.