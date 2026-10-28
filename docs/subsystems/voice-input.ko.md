# 음성 입력

[English](voice-input.md) | [中文](voice-input.zh.md) | 한국어

실험적 음성 인식에는 세 역할이 있습니다. [Service Definition](../../packages/experimental/speech-to-text/README.md)이 이름 있는 제공자를 라우팅하고, [SenseVoice 제공자](../../packages/experimental/speech-to-text-sensevoice/README.md)가 로컬 추론을 소유하며, [Remote 소비자](../../packages/experimental/api-speech-to-text/README.md)가 브라우저에 서비스합니다. [선택적 번들](../../packages/experimental/voice-input-bundle/README.md)이 마이크 UI와 함께 이들을 구성합니다.

## 제공자 선택

`SpeechProviderId`는 등록 정체성에 브랜드를 붙입니다. `SpeechProviderInfo`는 표시 이름, 허용 `languages` 힌트, `host-local` 또는 `cloud` 처리 위치를 담습니다. `SpeechRequest`는 WAV 바이트와 선택적 제공자/언어 선택을 담고, `resolve()`는 캡처된 제공자 인스턴스 하나를 가진 `SpeechSpec`을 만듭니다. 제공자가 없거나 지원되지 않는 언어는 실패하며, 교체나 철회는 해석된 작업을 무효화합니다. 오디오는 다른 제공자로 폴백하지 않습니다.

`SpeechProvider.transcribe()`는 완전한 `SpeechInput` 하나와 `AbortSignal`을 받습니다. `Transcript`는 평문 `text`, `audioSeconds`, `inferenceSeconds`를 반환합니다. 제공자는 취소 신호를 준수하고 등록 해제가 완료되기 전에 작업을 정상 종료(settle)합니다. 로컬 제공자는 호출을 직렬화하고, 큐를 제한하며, Session과 무관하게 워커 수명을 관리합니다.

## 브라우저와 Host 소유권

마이크 트랙과 보내지 않은 초안은 브라우저가 소유합니다. `TranscriptionRequest`는 정규 base64 PCM16 WAV를 인증된 Remote를 통해 보냅니다. `SpeechCatalog`는 사용 가능한 제공자, 기본 선택, 녹음 바이트·길이 한도를 알립니다. API는 인식 전에 이 프로세스 입력을 검증합니다.

입력 파사드는 녹음 전에 리비전을 담은 선택을 캡처합니다. `InputActions.insertText()`는 선택 리비전이 최신이고 제출이 편집을 허용할 때만 실행 취소 가능한 평문 편집 하나를 삽입합니다. 삽입이 거부되면 트랜스크립트는 명시적 삽입을 위해 남습니다. Session을 전환하거나 플러그인을 폐기하면 늦게 도착한 결과가 무효화됩니다. 인식 자체는 Session 이벤트를 쓰지 않으며, 최종 모델 가시 텍스트는 일반 사용자 제출이 소유합니다.

## 준비와 설정

`SpeechProviderInfo.downloadSources`는 준비 출처를 알립니다. `SpeechPreparationOptions.downloadSource`는 작업에 쓸 출처 하나를 선택하며, 생략하면 제공자 정책이 유지됩니다. SenseVoice는 알려진 선택을 검증하고, 폴백 없이 수동 출처를 고정하며, 활성 준비 중의 출처 변경을 거부합니다. UI는 현재 카드에서 재시도를 위한 선택을 유지하며, 그것은 영속되는 인식 기본 설정이 아닙니다.

Host 제공자는 페이지와 Session 변경을 가로질러 준비 작업 하나를 소유합니다. Client는 컴포저, 설정 프롬프트, 번들 세부 정보에 걸쳐 `follow()` 구독 하나를 공유합니다. 선택적 `SpeechSetupEstimate` 메타데이터는 측정된 진행과 별개로 제공자별 계획 힌트를 제공합니다. `SpeechPreparationStepKind`는 순서 있는 리소스 작업을 식별하고, `SpeechPreparationStep`은 각 상태와 시작 시간을 기록합니다. 완전한 `SpeechPreparationState`는 취소나 실패 후에도 이 단계들을 유지합니다. 접힌 UI는 현재 작업을 보여주고, 펼치면 모든 단계를 나열하며, 바이트 진행이나 경과 시간은 실행 중인 단계에만 표시합니다. 관찰자를 닫아도 준비가 취소되지 않습니다. 검증된 파일은 재시도와 유휴 워커 회수에도 살아남습니다.

실패한 준비는 자산, 출처 오리진, 분류된 사유, 선택적 진단 코드나 HTTP 상태를 담은 `SpeechDownloadFailure`를 포함할 수 있습니다. Client는 복구 안내를 현지화하고, 원시 다운로드 원인은 Host에 남습니다.

마이크는 모델 선택기와 Send 사이의 `conversation.input.activity`를 차지합니다. 클릭하면 캡처가 시작되고 툴바가 펼쳐지며, Stop은 트랜스크립트를 만들어 초안에 삽입합니다. 이 액티비티는 편집기와 제출 동작을 보존하고, 로컬 피드백을 소유하며, 언마운트 시 펼침을 해제합니다. Cancel, Escape, 페이지 숨김은 캡처를 버립니다. 파형 이력은 측정된 마이크 진폭을 표시합니다. 번들 세부 정보에는 인식 기본 설정, 준비 상태, 진행이 담깁니다. 명시적 활성화는 `plugins.bundle.activation`을 사용해 모델이 없는 사용자를 설정으로 안내하고, 목록에는 번들 설명과 스위치만 표시됩니다.

## 설계 근거

[음성 입력 결정](../../.agents/notes/implemented/architecture/2026-09-16-experimental-voice-input.md)이 일시적 오디오, 명시적 제공자 선택, 지연 로컬 준비를 설명합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspeechcontroller--speechcontroller"></a>

### `ctx.speechController` — `SpeechController`

Speech calls never activate or submit to an Agent.

```ts cordis-catalog
/**
 * Read provider choices without preparing a recognizer.
 * @returns available providers, resolved default, and recording limits.
 */
@Remote catalog(): SpeechCatalog

/**
 * Follow provider readiness independently of Session and preparation lifetimes.
 * @param signal - Client observation lifetime.
 * @returns initial and subsequent complete readiness snapshots.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<SpeechCatalog>

/**
 * Persist the user's recognition preferences.
 * @param patch - changed preference fields.
 * @returns after preferences are saved.
 */
@Remote configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join one Host-owned preparation task.
 * @param providerId - selected recognizer.
 * @param options - task-local source selection validated by the provider.
 */
@Remote prepare(providerId: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel resource preparation.
 * @param providerId - selected recognizer.
 * @returns after the preparation task settles.
 */
@Remote cancelPreparation(providerId: SpeechProviderId): Promise<void>

/**
 * Validate and transcribe one recording through the explicit provider selection.
 * @param request - canonical WAV encoded as base64, provider id and language hint.
 * @param signal - Client cancellation or Remote contribution disposal.
 * @returns final transcript without adding a Session event.
 */
@Remote async transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/api-speech-to-text/src/index.ts`](../../packages/experimental/api-speech-to-text/src/index.ts)

<a id="ctxspeechtotext--speechtotext"></a>

### `ctx.speechToText` — `SpeechToText`

Registry shared by all transcription consumers in one Host composition.

```ts cordis-catalog
/**
 * Register one recognizer; duplicate ids fail without replacing the original.
 * @param provider - recognizer owned by the contributing fiber.
 * @returns idempotent disposer which rejects admission, cancels, and joins accepted work.
 */
register(provider: SpeechProvider): () => Promise<void>

/**
 * Read the current recognizer roster.
 * @returns available provider facts in registration order.
 */
listProviders(): readonly SpeechProviderInfo[]

/**
 * Observe complete readiness snapshots; a slow reader coalesces intermediate progress.
 * @param caller - observer lifetime, independent of any preparation task.
 * @returns an initial snapshot followed by the latest provider states.
 */
async *follow(caller: AbortSignal): AsyncIterable<SpeechSnapshot>

/**
 * Read provider readiness and current user preferences together.
 * @returns one detached complete observation.
 */
snapshot(): SpeechSnapshot

/**
 * Persist changed selection fields into this plugin's profile entry; the resulting language must be accepted by the selected provider.
 * @param patch - explicit provider or language changes.
 * @returns after the profile write and the live update it applies.
 */
async configure(patch: SpeechSelectionPatch): Promise<void>

/**
 * Start or join provider-owned preparation.
 * @param id - exact registered provider identity.
 * @param options - task-local source selection validated by the provider.
 */
prepare(id: SpeechProviderId, options?: SpeechPreparationOptions): void

/**
 * Explicitly cancel provider preparation without tying it to a browser connection.
 * @param id - exact registered provider identity.
 * @returns after the preparation task settles.
 */
async cancelPreparation(id: SpeechProviderId): Promise<void>

/**
 * Apply composition defaults and capture the selected provider. Missing providers and unsupported languages fail explicitly.
 * @param request - complete recording and optional selection.
 * @returns provider-pinned input for transcribe().
 */
resolve(request: SpeechRequest): SpeechSpec

/**
 * Execute exactly the resolved provider; no fallback sends audio elsewhere.
 * @param spec - resolved input; a withdrawn or replaced registration is rejected.
 * @param signal - caller cancellation.
 * @returns final transcript after provider settlement.
 */
async transcribe(spec: SpeechSpec, signal: AbortSignal): Promise<Transcript>
```

Source: [`packages/experimental/speech-to-text/src/index.ts`](../../packages/experimental/speech-to-text/src/index.ts)
<!-- END GENERATED cordis-surface -->
