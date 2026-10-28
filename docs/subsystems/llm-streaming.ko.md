# LLM 스트리밍

[English](llm-streaming.md) | [中文](llm-streaming.zh.md) | 한국어

`packages/llm`의 대화 및 스트리밍 타입입니다. 영속 `Message` 값, 요청 전용 사용자 입력, 공유 `ContentBlock` 변형, 완전히 조립된 모델 요청, 원시 `StreamChunk` 프로토콜, 모든 어댑터가 구현해야 하는 어댑터 계약, 그리고 공유 조립기를 다룹니다. [코어 패키지](core.ko.md)가 매 턴 이 값들을 보관하고 기록하며, 이 페이지가 그 값들을 선언합니다.

출처: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="content-blocks-and-messages"></a>

## 콘텐츠 블록과 메시지

대화는 `Message`이고, 메시지는 타입이 지정된 **콘텐츠 블록** 배열입니다. 블록 유니언은 `ContentBlockMap`에서 파생됩니다.

출처: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

```ts type-equiv
/**
 * Merge-extensible content blocks keyed by `type`. New core blocks must land
 * with adapter, UI, and compaction support. Tool-change blocks belong to
 * developer messages; `projectToolUpdates` selects what each route receives.
 */
interface ContentBlockMap {
  'text': TextBlock
  'reasoning': ReasoningBlock
  'image': ImageBlock
  'file': FileBlock
  'tool-call': ToolCallBlock
  'tool-addition': ToolAdditionBlock
  'tool-removal': ToolRemovalBlock
}
```

블록 인터페이스는 다음과 같습니다(전체 필드는 소스 참조). `TextBlock`(`text`), `ReasoningBlock`(사고 내용이며 보이는 텍스트와 구분됩니다), `ImageBlock`(영속 [이미지 첨부](attachment.ko.md)), `FileBlock`(요청 조립이 모든 라우트에 대해 핸들 텍스트로 투영하는, 그대로 보존되는 영속 [파일 첨부](attachment.ko.md)), `ToolCallBlock`(`id: ToolCallId`, `name`, 원시 JSON `arguments`). 도구 결과는 `toolCallId`, 결과 `content`, 선택적 `isError`를 가진 일급 `ToolResultMessage` 값이며 콘텐츠 블록이 아닙니다. `ContentBlock = ContentBlockMap[ContentBlockType]`입니다. 새 모달리티는 그 어댑터, UI, 압축, 영속 재생 경로가 이를 준수할 때만 병합 확장 맵에 속합니다. 개발자 도구 변경 블록은 해석된 라우트 기능에 따라 투영됩니다.

이미지 접근은 영속 첨부나 결정적 요청 이미지 버전이 아니라 요청 직렬화에 속합니다. `resolveImageAttachmentAccess()`는 첨부 제공자의 선택적 호스트 객체 경로와, 현재 도구 실행 파일 시스템에 대해 소비자가 공급하는 매핑을 결합합니다. 결과는 그 요청에만 유효하며 `variantId`에 참여하지 않습니다.

출처: [`packages/llm/llm/src/content.ts`](../../packages/llm/llm/src/content.ts)

```ts type-equiv
/** Execution-world path that model tools can use to read one normalized attachment. */
interface ImageAttachmentAccess {
  /** Absolute path to immutable normalized bytes; callers must treat it as read-only. */
  readonlyPath: string
}
```

출처: [`packages/llm/llm/src/message.ts`](../../packages/llm/llm/src/message.ts)

`Message`는 식별된 불변 역할/소스/콘텐츠 값 하나입니다. 모델이 생성한 어시스턴트 메시지는 자신을 생성한 제공자와 모델을 밝히고, 소스에 선택적인 어댑터 전용 재생 데이터를 담습니다:

```ts type-equiv
/** Provider/model identity and adapter-private replay data for an assistant message. */
interface AssistantProviderMetadata {
  /** Provider route that produced the message. */
  provider: string
  /** Provider model id that produced the message. */
  model: string
  /**
   * Lossless-JSON adapter state needed to replay the provider response.
   * `LlmRuntime` exposes it to a target adapter only when that adapter instance
   * currently owns both this historical provider and the target provider.
   */
  replayState?: unknown
}
```

```ts type-equiv
/** Any persisted conversation message, discriminated by its `role`. */
type Message = MessageRoleMap[keyof MessageRoleMap]
```

`DeveloperMessage`는 `developer` 역할로 에이전트 세션의 증분 변경을 대화 순서대로 기록합니다. `ToolAdditionBlock.toolName`은 그것을 담은 세션 이벤트의 역사적 헤더 참조가 선택한 정의를 활성화하고, `ToolRemovalBlock.toolName`은 활성 정의를 제거합니다. 두 블록 모두 다른 메시지 역할에서는 거부됩니다. `deferLoading`은 추가 레코드 없이 지연된 정의 로딩을 독립적으로 요청합니다. 헤더 바인딩은 [Session](../../packages/core/session/README.md)을, 제공자 지원 한도는 [LLM 패키지](../../packages/llm/llm/README.md#known-limitations-and-deferred-work)를 참고하세요. `ToolUpdate`는 해석되고 준비된 모델 메타데이터에서 `in-history` 또는 `addition-only`입니다. `GenerateOptions.toolHistory`는 `ToolHistory`를 담습니다. 즉 초기 `tools`와 순서 있는 `updates`이며, 각각이 개발자 `messageId`를 역사적으로 해석된 `additions`에 결속합니다. 런타임은 이 상태를 제공자 선언으로 투영하며, 기록된 헤더의 활성 도구 목록을 바꾸지는 않습니다.

메시지의 출처 자체가 병합 확장 합 타입입니다:

```ts type-equiv
/**
 * Where a message (or injected content) came from, in the harness's own
 * vocabulary. Merge-extensible sum type — each producer declares its own
 * `kind` in its own module; there is no shared catch-all `plugin` kind.
 * Model and tool sources answer their role messages; user messages carry any
 * producer's kind, and consumers fall through unknown kinds.
 */
interface MessageSourceMap {
  user: { kind: 'user' }
  model: ModelMessageSource
  tool: ToolMessageSource
  'system-prompt': SystemPromptMessageSource
}
```

생산자 정체성과 표시 형식은 독립적입니다. `kind`는 *누가 이것을 생산했는가*를, 선택적 `form`은 *이것이 어떤 종류의 정보인가*를 답하며, 소비자가 표시 방식을 결정합니다. 여러 생산자가 하나의 form을 공유할 수 있고, 한 생산자가 한 세션에서 둘 이상의 form을 낼 수도 있습니다. 값은 시맨틱하며 하나씩 늘어납니다. 값이 없거나 인식되지 않으면 문서화된 기본값을 사용하고 불투명 콘텐츠로 표시합니다:

```ts type-equiv
/**
 * The kind of information in producer-supplied context, declared by the
 * producer in the same `MessageSource`.
 *
 * `MessageSource.kind` answers *who produced this*; `form` answers *what kind
 * of thing it is*, and the two axes are deliberately independent — several
 * producers share one form, and one producer may emit more than one form over
 * a session.
 *
 * The vocabulary is SEMANTIC, never visual: a value states that the content is
 * a file's instructions or a catalog of available items, and a consumer decides
 * what that looks like. Colors, icons, ordering, and collapse defaults are the
 * consumer's business and must not enter this union. It grows one value at a
 * time as producers gain the structured fields their form needs; an absent or
 * unknown value is the documented default, presented as opaque content.
 */
type ContextForm =
  /** Instructions read out of workspace files the model is expected to follow. */
  | 'instructions'
  /** A catalog of items available in this session, republished as it changes. */
  | 'catalog'
  /** Current state, where a later snapshot from the same producer supersedes an earlier one. */
  | 'snapshot'
  /** A one-off account of something that just happened; it supersedes nothing. */
  | 'notice'
  /** A message another agent addressed to this one. */
  | 'relay'
  /** Material lifted out of another session's log, possibly reduced on the way in. */
  | 'recall'
```

```ts type-equiv
/** One named contribution to a `snapshot`-form context, in assembly order. */
interface ContextSnapshotSection {
  /** The contributing subsystem's name. */
  readonly name: string
  /** That contribution's model-facing text, exactly as assembled. */
  readonly text: string
}
```

```ts type-equiv
/**
 * Producer-declared {@link ContextForm} and the fields that form requires,
 * mixed into the source types that carry one.
 *
 * Discriminated by `form` so a producer cannot select a form without the
 * fields needed to present it: a `notice` must record its one-line
 * account, a `snapshot` its sections. Omitting `form` stays valid — an
 * undeclared context is the documented default.
 */
type ContextFormed =
  | { readonly form?: never }
  | { readonly form: 'instructions' }
  | { readonly form: 'catalog' }
  | {
    readonly form: 'snapshot'
    /** The named contributions this snapshot assembled, in order. */
    readonly sections: readonly ContextSnapshotSection[]
  }
  | {
    readonly form: 'notice'
    /** One-line account of what happened, shown without expanding the row. */
    readonly summary: string
  }
  | { readonly form: 'relay' }
  | { readonly form: 'recall' }
```

<a id="streamchunk--the-raw-protocol"></a>

## `StreamChunk` — 원시 프로토콜

스트리밍 응답은 여러 타입 지정 블록(텍스트, 추론, 다중 도구 호출)을 교차시킵니다. `index`가 각 델타를 자기 블록에 묶고, `block-end`는 완전히 조립된 `ContentBlock`을 담으므로 소비자가 델타를 직접 다시 조립할 필요가 없습니다. 이는 **닫힌** 판별 유니언입니다. 즉 `type`에 대한 `switch`가 `assertNever`로 끝나므로, 변형을 추가하면 이를 처리해야 하는 모든 소비자에서 컴파일이 깨집니다.

```ts type-equiv
/**
 * Adapter-private lossless-JSON state for replaying a successful response,
 * carried by a terminal `finish` chunk and stored on the assembled assistant
 * message's model source. Both halves stay opaque to the harness; only the
 * split is shared vocabulary, so assembly can keep stored metadata aligned
 * with stored content without reading either half.
 */
interface ReplayEnvelope {
  /** Response-level adapter-private metadata (ids, native stop reason). */
  response: unknown
  /**
   * Per-block adapter-private metadata, one entry per emitted block in
   * first-seen stream order. When assembly drops a block it drops the entry at
   * the same position; entries whose length does not match the emitted block
   * count discard the whole envelope. An adapter whose metadata is independent
   * of block structure omits this field and the envelope passes through
   * assembly unchanged.
   */
  blocks?: readonly unknown[]
}
```

```ts type-equiv
/**
 * Raw streaming protocol emitted by adapters.
 * Block indexes correlate interleaved deltas, and `block-end` carries the
 * assembled block. Adapters emit usage before the terminal finish and nothing
 * afterward; tool arguments remain raw JSON strings. An adapter implementation
 * may throw, but `LlmRuntime.stream()` normalizes that failure to a terminal
 * `error` or `aborted` finish before exposing it to consumers.
 */
type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | {
    type: 'finish'
    reason: FinishReason
    /** Replay metadata for a successful response; see {@link ReplayEnvelope}. */
    replayState?: ReplayEnvelope
  }
```

<a id="compact-assistant-streams"></a>

## 컴팩트 어시스턴트 스트림

`AssistantStreamAccumulator`는 각 `StreamChunk`를 원래의 안전 정수 타임스탬프와 짝지어 `AssistantStreamRecord[]`를 만듭니다. 같은 블록의 연속된 텍스트·추론·도구 인수 델타는 `time0`, 정확한 타임스탬프 간격, 원래 델타마다 하나의 배열 항목을 가진 레코드 하나가 되고, 다른 모든 청크는 타임스탬프가 붙은 원시 레코드로 남습니다. 이 표현은 토큰 경계를 합치거나 터미널·사용량·블록·실패·재생 사실을 버리지 않으면서 반복되는 이벤트 봉투를 제거합니다.

`snapshot()`은 분리된 불변 스트림을 반환합니다. `expandAssistantStream()`은 레코드 키, 멤버 개수, 인덱스, 타임스탬프, 도구 호출 정체성, 무손실 JSON을 엄격히 검사한 뒤 정확한 시간 기록 청크 시퀀스를 재현합니다. 세션 로그는 표면 결과에는 `assistant/message`에, 표면 메시지가 없는 시도에는 `assistant/attempt`에 이 스트림을 내장합니다.

프로세스 로컬 `agent/assistant-stream` 프레임이 라이브 표시를 담습니다. 영속 재생과 복원 검증은 여전히 내장된 턴 확정(settlement) 기록을 펼치며, 텔레메트리, 토큰 회계, 호스트 폴드는 컴팩트 레코드를 직접 읽습니다. 레코드 수준 리더(`assistantStreamFirstTokenTime`, `assistantStreamHasVisibleContent`, `assistantStreamHasVisibleText`, `lastAssistantStreamChunk`, `assistantStreamChunks`, `joinAssistantStreamText`, `assembleAssistantStream`, 그리고 실행별 `runFirstTokenTime`과 `runFirstVisibleTime`)는 조기 종료와 함께 레코드 한 번 순회로 소비자 질문에 답하므로, 큰 이력도 확정(settlement)마다 O(members) 확장이 아니라 O(records) 비용이 듭니다([fold 참조](../../packages/llm/llm/README.md)). `expandAssistantStream()`은 영속 경계에서 읽은 레코드와 모든 멤버가 필요한 소비자를 위한 검증 경로로 남습니다.

## `LlmFailure`

던져진 실패와 인밴드 최종 어댑터 실패는 모두 직렬화 가능한 제공자 중립 페이로드 하나로 정규화됩니다. `providerRetryAfterMs`는 제공자가 요청한 검증된 양의 지연이며 재시도 결정이 아니고, `ProviderRequestId`는 진단용 불투명 브랜드 문자열입니다.

```ts type-equiv
/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
interface LlmFailure {
  /** Human-readable provider or transport failure. */
  readonly message: string
  /** Stable provider-neutral machine-routing code. */
  readonly code: string
  /** HTTP status returned by the provider, when available. */
  readonly status?: number
  /** Provider-requested delay in milliseconds, when valid and available. */
  readonly providerRetryAfterMs?: number
  /** Opaque provider-issued request identifier for diagnostics. */
  readonly requestId?: ProviderRequestId
  /**
   * With code `IMAGE_OFFLOAD_REQUIRED`: how many more of the oldest retained
   * image occurrences the route needs offloaded before the same request fits
   * its exact byte accounting. `dsh-compaction-image-offload` records the
   * selected occurrences in an `image/offload` event and retries the step.
   */
  readonly offloadImages?: number
}
```

## 요청 이미지 가격 책정

제공자 API가 요청 이미지에 비전 토큰을 부과(charge)하는 어댑터는 `LlmAdapter.imageRequestPricing`을 재정의해 라우트별 가격을 선언하며, `ctx.llm.imageRequestPricing(provider, model)`이 소비자를 위해 이를 동기적으로 계산합니다. 토큰 미터는 측정할 때마다 라우트된 모델의 가격 책정을 계산하므로, 압축 압박, 보존, 범위 선택이 실제 전송되는 요청 방식과 동일하게 이미지 히스토리 비용을 산정합니다. DeepSeek 어댑터는 보존된 각 항목을 공식 비전 과금 기준에 맞춰 모델별 요청 대상으로 계산하고, 기록된 이미지 오프로드 결정이 적용된 항목은 자리표시자 텍스트 비용으로 계산하며, 완료된 요청의 실제 사용량은 제공자 API 응답이 최종 유효값입니다.

```ts type-equiv
/**
 * Request price of one ordered image occurrence under one exact model route's
 * request projection. Every occurrence resolves to the pair the wire actually
 * carries: provider visual tokens for a retained image, plus the model-visible
 * text sent with or instead of it (request-preview handle, offload placeholder,
 * or text-only substitution). The caller prices `text` with its own text
 * estimator so provider pricing never fixes a text tokenization.
 */
interface LlmImageRequestPrice {
  /** Provider visual tokens for the retained request image; 0 when only text represents this occurrence. */
  visualTokens: number
  /** Model-visible text sent for this occurrence, to be priced by the caller's text estimator. */
  text: string
}
```

```ts type-equiv
/**
 * Provider-side request-image pricing for one exact model route. Implemented
 * by adapters whose provider charges visual tokens; consumers (the token
 * meter) resolve it synchronously per measurement, so implementations must not
 * perform I/O.
 */
interface LlmImageRequestPricing {
  /**
   * Price every image occurrence of one request projection.
   * @param images - surface image blocks in request order, one entry per occurrence; an `offloaded` block
   *   is priced as its placeholder text.
   * @returns one price per occurrence, aligned by index with `images`.
   */
  priceImages(images: readonly ImageBlock[]): readonly LlmImageRequestPrice[]
}
```

## 어댑터 계약

모든 어댑터는 다음을 반드시 준수하며, 모든 소비자는 이를 신뢰할 수 있습니다:

- **`finish`보다 `usage`를 먼저, `finish` 뒤에는 아무것도 없습니다.** 둘 다 제공자의 스트림 종료 표시까지 미루면 끝에 usage만 담은 청크가 이 순서를 어길 수 없습니다.
- **도구 호출 `arguments`는 끝까지 원시 JSON 문자열로 유지됩니다.** 부분 조각은 `argumentsDelta`로 스트리밍하며, 파싱된 객체를 돌려주는 제공자는 `block-end`에서 다시 문자열화합니다.
- **허용되는 오류 경로 두 가지, 하나의 `LlmFailure` 타입.** 실패는 `stream()`에서 던지거나(전송/프로토콜 오류) **또는** `finish {kind:'error'|'aborted', failure}`로 스트림을 종료할 수 있습니다(제공자 인밴드 오류, 스트림 중간에 던질 수 없는 어댑터용). `LlmError.failure`가 같은 `LlmFailure`를 담습니다. 호출이 어댑터를 선택한 뒤, 스트림은 던져진 `Error` 객체를 정확히 보존하고 불변 사실과 서빙 등록의 불변 재시도 정책을 그 호출에 결속합니다. 에이전트 루프는 그 시도 스트림을 `assistant/attempt`로 커밋하고 실패한 단계를 닫은 뒤, 오류, 사실, 불변의 이전 재시도 사실, 서빙 정책, 턴 신호를 `agent/request-error`에 제공합니다. 처리 리스너는 대기한 수리를 마친 뒤 `{ kind: 'retry' }`를 반환합니다. 복구가 없으면 구조화된 실패가 턴 오류가 되고, 그 시도에 대해 표면 어시스턴트 메시지나 도구 부수 효과는 커밋되지 않습니다.
- **어댑터 호출 하나가 제공자 시도 하나입니다.** 어댑터는 라이브러리 재시도를 비활성화합니다. 에이전트 수준 복구는 번호가 붙은 영속 턴을 하나 더 열며, `ctx.llm.stream()` 직접 호출자는 단일 시도로 남습니다.
- **제공자 정지는 전송 계층에서 제한됩니다.** 배포되는 두 원격 어댑터 모두 기본 5분의 양의 유한 `streamIdleTimeoutMs`를 노출합니다. 감시기는 이터레이터 `next()`가 미완인 동안에만 무장하고, 요청 전체에 안정적인 신호 하나를 쓰며, 자신의 만료를 `TIMEOUT`으로 매핑하고, 더 이른 호출자 중단은 `ABORTED`로 유지합니다.
- **컨텍스트 오버플로에는 정규 코드가 하나입니다.** 두 DeepSeek 어댑터 모두 명시적 제공자 상세를 `isContextWindowExceededError()`로 분류하고 `CONTEXT_WINDOW_EXCEEDED`를 노출하며, 실패가 던져진 HTTP `LlmError`로 오든 인밴드 finish 오류로 오든 같습니다. 소비자는 제공자 텍스트가 아니라 코드로 라우팅합니다.
- **빈 완료는 조용한 성공이 아니라 재시도 가능한 오류입니다.** 두 어댑터 모두 콘텐츠 블록을 담지 않은 터미널 `stop` finish를 정규 `EMPTY_RESPONSE` 코드의 `finish {kind:'error'}`로 매핑하며, `dsh-llm-retry`가 기본으로 이를 재시도합니다.
- **모든 제공자 HTTP 요청은 앱 귀속 헤더를 담습니다.** 어댑터는 `attributionHeaders()`(아래)를 보내며, 이것이 `User-Agent` 기준선이고, 와이어 수준 테스트로 이를 증명합니다.
- **재생 상태는 어댑터 소유이며, 그 분할은 공유됩니다.** 성공한 `finish`는 `ReplayEnvelope`를 담을 수 있습니다. 즉 불투명한 응답 수준 메타데이터와, 방출된 블록 시퀀스에 정렬된 선택적 블록별 항목입니다. 이 정렬은 하네스의 어휘이므로, 조립이 블록을 버리면 같은 위치의 항목도 버려져 저장된 메타데이터가 항상 저장된 콘텐츠를 설명합니다. 루프는 정리된 봉투를 조립된 어시스턴트 메시지와 함께 저장합니다. 이후 요청에서 `LlmRuntime`은 과거 제공자와 대상 제공자가 현재 정확히 같은 어댑터 인스턴스에 등록되어 있을 때만 그 상태를 전달합니다. 그 어댑터가 상태를 검증하고 교차 모델·교차 제공자 변환을 소유하며, 다른 어댑터는 비공개 상태 없이 제공자 중립 콘텐츠와 제공자/모델 필드를 받습니다. 영속 콘텐츠가 계속 권위입니다. 읽는 어댑터가 쓸 수 없는 저장 상태는 요청을 실패시키지 않고 진단과 함께 그 메시지 하나를 제공자 중립 변환으로 격하합니다.

## `ResolvedRetryPolicy`

재시도 구성은 라우트 등록 전에 불변 판별 유니언으로 해석됩니다. normal 모드는 `mode: 'normal'`, 유한 `maxRetries`, `retryableCodes`, 그리고 필수 `initialDelayMs`, `maxDelayMs`, `jitterRatio`를 담고, always 모드는 `mode: 'always'`와 유한 최대값 없는 같은 필수 백오프 필드를 담습니다. 제공자 정책을 생략하면 재시도 5회의 normal 기본값을 사용합니다. 계층 설정은 always 모드로 바꾼 뒤에도 normal 전용 `maxRetries`나 `retryableCodes`를 유지할 수 있으며, 리졸버는 그 비활성 필드를 무시하고 순수 always 정책을 캡처합니다. `LlmRuntime.providerRetryPolicy(provider)`는 등록된 값을 반환하고, `llmRetryPolicyOf(stream)`은 호출이 어댑터를 선택한 뒤 서빙 등록에서 캡처한 값을 반환하므로, 이후 라우트 폐기나 교체가 진행 중인 실패의 복구 정책을 바꿀 수 없습니다. [생성된 구성 카탈로그](../config-catalog.ko.md)가 선택적 입력 필드를 나열합니다.

## `AppIdentity` — 앱 귀속

모든 어댑터가 제공자에게 보내는 정적 공개 애플리케이션 정체성입니다([`packages/llm/llm/src/attribution.ts`](../../packages/llm/llm/src/attribution.ts)). `attributionHeaders(identity?)`는 이를 표준 `User-Agent` 헤더에만 매핑하며, OpenRouter 전용 앱 귀속 헤더는 이 계약에서 의도적으로 지원하지 않습니다. 기본 `APP_IDENTITY`는 패키지 매니페스트에서 버전을 가져오며, 모든 필드는 공개 제품 사실입니다. 즉 시크릿, 경로, 세션 id, 사용자별 식별자가 없고, 요청별로 값에 영향을 줄 수 있는 것도 없습니다.

```ts type-equiv
/**
 * Static public application identity sent to LLM providers.
 *
 * Every field is a public product fact, safe on every request: no secrets,
 * local paths, session ids, prompt text, or per-user identifiers belong here,
 * and nothing per-request may influence the values.
 */
interface AppIdentity {
  /** `User-Agent` product token (lowercase, hyphenated). */
  product: string
  /** Product version; sourced from package metadata, never hand-copied. */
  version: string
  /** Repository home URL of the app, used as the `User-Agent` comment. */
  url: string
}
```

## `TokenUsage`

호출별 토큰 회계입니다. 개수는 **서로 겹치지 않습니다**. `inputTokens`는 캐시되지 않은 순수 입력분이며, 캐시된 입력은 별도로 보고되고, 과금 대상이 되는 총 입력 토큰 수는 이 셋의 합산입니다. 제공자 API가 캐시 적중분까지 단일 프롬프트 총합(DeepSeek의 `prompt_tokens`)에 포함하여 전달하는 경우, 어댑터는 캐시분을 별도로 차감하여 분리합니다. 선택적 `totalTokens`는 제공자로부터 직접 전달받거나 신뢰할 수 있는 집계 카운터에서 재구성한 정확한 프롬프트+출력 합산값이며, 사용 불가능하거나 일관되지 않으면 어댑터가 생략합니다. `reasoningTokens`는 존재할 경우 `outputTokens`에 이미 포함된 세부 항목이므로, 총합에 중복으로 다시 더해서는 안 됩니다.

```ts type-equiv
/**
 * Token accounting for one model call (cache fields are optional).
 *
 * Counts are DISJOINT: `inputTokens` is uncached input only; cached input is
 * reported separately as `cacheReadTokens`/`cacheWriteTokens` (billed input =
 * sum of the three). Adapters whose providers fold cache hits into a total
 * prompt count (DeepSeek's `prompt_tokens`) subtract them out.
 */
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /**
   * Exact full-call total including aggregate prompt and output tokens.
   *
   * Adapters preserve a provider total or derive it from authoritative
   * aggregate prompt/output counters; they omit it when unavailable or
   * inconsistent.
   */
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}
```

## `BlockAssembler`

`BlockAssembler`([`packages/llm/llm/src/assembler.ts`](../../packages/llm/llm/src/assembler.ts))는 `StreamChunk` 스트림을 다시 `ContentBlock`, 사용량, 종료 이유, 재생 상태로 폴드하는 단일 공유 구현입니다. 루프는 원시 청크를 기록하면서 같은 청크를 조립기에도 흘려보낸 뒤, 조립된 어시스턴트 콘텐츠를 그것을 생성한 제공자 및 모델과 함께 저장합니다. 폴드를 다시 구현하지 않고 조립된 결과가 필요한 소비자는 이를 사용합니다.

하나의 유지/폐기 결정이 콘텐츠와 메타데이터를 함께 다룹니다. `max-tokens` finish는 잘린 호출이 실행에 안전하지 않으므로 모든 도구 호출을 버리고, 같은 결정이 버려진 각 위치에서 재생 봉투의 블록별 항목도 정리합니다. 따라서 조립이 무엇을 제거하든 `blocks()`와 `replayState`가 어긋날 수 없습니다.

```ts public-api
/**
 * Incrementally assembles raw {@link StreamChunk}s into complete
 * {@link ContentBlock}s and a final assistant {@link Message}.
 *
 * The agent loop feeds it while logging raw chunks for replay fidelity, then
 * reads `blocks()` / `message()` / `usage` / `finish` once the stream ends,
 * or `interruptedBlocks()` when cancellation cut the stream short.
 *
 * Tolerant of delta-only protocols (no block-start/end); deltas arriving for
 * an index already closed by `block-end` are ignored (malformed stream) so a
 * misbehaving adapter cannot grow memory or corrupt a completed block.
 */
declare class BlockAssembler {
  /**
   * Feed one chunk into the assembly state.
   * @param chunk - the next raw chunk, in stream order.
   */
  push(chunk: StreamChunk): void;
  /**
   * Assemble all blocks seen so far, in stream order.
   * @returns one block per seen index, except that max-token truncation drops
   *   tool calls that cannot be executed safely; an open block assembles from
   *   its accumulated deltas (an unknown block type never closed by `block-end` throws).
   */
  blocks(): ContentBlock[];
  /**
   * Assemble the prefix an interrupted stream can safely finalize: closed and
   * open text/reasoning blocks with non-whitespace content, in stream order.
   * Tool calls are omitted because interruption precedes dispatch; retaining
   * one would require a fabricated result. Open unknown blocks are also omitted.
   * @returns the kept blocks; empty when nothing streamed before the interruption.
   */
  interruptedBlocks(): ContentBlock[];
  /** Usage from the `usage` chunk; undefined until one arrives. */
  get usage(): TokenUsage | undefined;
  /** Finish reason from the `finish` chunk; `{kind: 'stop'}` when the stream ended without one. */
  get finish(): FinishReason;
  /**
   * Replay metadata from the terminal finish chunk, if any, with per-block
   * entries pruned in step with {@link blocks}. Undefined when the envelope's
   * entries do not align with the emitted blocks.
   */
  get replayState(): ReplayEnvelope | undefined;
  /**
   * The assembled assistant message.
   * @param source - provider/model attribution (without the `kind` tag) for the assembled message.
   * @returns a frozen assistant-role message over `blocks()` (same open-block assembly rules).
   */
  message(source: Omit<ModelMessageSource, 'kind'>): AssistantMessage;
}
```

<a id="the-model-request-and-result"></a>

## 모델 요청

모델 호출 하나는 완전히 조립된 `GenerateOptions`입니다. 어댑터는 원시 [`StreamChunk`](#streamchunk--the-raw-protocol) 스트림으로 응답하고, 소비자가 [`BlockAssembler`](#blockassembler)로 이를 조립합니다.

출처: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

제공자와 모델 탐색은 작은 제공자 중립 디스크립터를 사용합니다. 모델 카탈로그는 참고용이며, 라우팅은 여전히 등록된 제공자를 키로 합니다.

어댑터를 등록하면 핸들을 반환합니다. 즉 disposer와, 라우트 집합이 사용자 구성 가능한 플러그인이 필요로 하는 원자적 라우트 교체입니다.

```ts type-equiv
/**
 * What {@link LlmRuntime.registerAdapter} returns: the disposer, plus an
 * atomic route replacement for the same adapter instance.
 */
interface AdapterRegistrationHandle {
  /** Release every route this registration currently holds. */
  (): void
  /**
   * Replace this registration's routes with `providers`, keeping the same
   * adapter instance. The candidate set is validated in full first — a
   * conflict with another adapter, an invalid name, or bad provider metadata
   * throws and leaves the current routes untouched — and the swap itself is
   * one synchronous section, so no request can observe a gap. An empty array
   * is legal here (a settings section that emptied holds zero routes while
   * staying registered), unlike an empty initial registration.
   *
   * Throws `LlmError` with code `REGISTRATION_DISPOSED` once the registration
   * has been released: its routes are gone and its disposer has already run,
   * so anything registered afterwards would have no owner left to release it.
   * @param providers - the complete next route set for this registration.
   */
  replace(providers: string[]): void
}
```

```ts type-equiv
/** Display metadata for one registered provider route. */
interface LlmProviderInfo {
  /** Provider route key used by {@link GenerateOptions.provider}. */
  id: string
  /** Human-readable provider name for selectors and diagnostics. */
  name: string
}
```

어댑터 플러그인은 추가로 `registerConfigurableProviders()`를 통해 어떤 라우트가 실행될 *수 있는지* 선언하며, 각 라우트의 사용자 설정 섹션을 지정하므로 구성 표면이 어떤 라우트도 등록되기 전에 휴면 제공자를 제시할 수 있습니다.

```ts type-equiv
/**
 * One provider route an adapter plugin can activate through configuration,
 * whether or not the route is currently registered. Configuration surfaces
 * merge this directory with `listProviders()` to offer every configurable
 * provider alongside its live/dormant state.
 */
interface LlmConfigurableProvider {
  /** Provider route key this entry activates when configured. */
  provider: string
  /** Human-readable provider name for configuration surfaces. */
  displayName: string
  /** User-settings namespace whose section configures this provider. */
  settingsNs: string
  /**
   * Path from that namespace's section root to this provider's profile
   * object; empty when the whole section is the profile.
   */
  settingsPath: readonly string[]
  /**
   * Whether the owning adapter knows this route only because configuration
   * declared it — a gateway or self-hosted server it ships nothing about.
   * Absent means the adapter draws no such distinction; false means it does
   * and this route is one of its own. Only the adapter can answer: a stored
   * profile is how a user-added route AND a corrected shipped one both look
   * from outside.
   */
  declared?: boolean
  /**
   * Route endpoint the adapter uses when the profile sets no `baseURL`; the
   * adapter may still send an individual model to that model's own endpoint.
   * Absent when the route has no fixed endpoint.
   */
  defaultBaseURL?: string
  /** Environment variables used to construct a provider endpoint; absent when none are reported. */
  baseURLEnv?: readonly string[]
  /** Authentication the adapter performs when the profile names no credential reference; absent when it reports none. */
  nativeAuth?: LlmNativeAuth
  /** Configuration diagnostic for repair; unaffected models may remain serviceable. */
  error?: string
}
```

설정 편집기는 엔드포인트나 자격 증명 참조를 비워 둔 프로필에 대해 `defaultBaseURL`, `baseURLEnv`의 엔드포인트 구성 변수, `nativeAuth`를 표시합니다. 두 변수 목록 모두 값이 아니라 이름만 담습니다.

```ts type-equiv
/** Authentication a provider route performs without a credential reference in its profile. */
interface LlmNativeAuth {
  /** Environment variables the route's authentication reads, in lookup order; empty when it reads none. */
  env: readonly string[]
  /** Whether a stored OAuth sign-in can authenticate the route. */
  oauth: boolean
}
```

```ts type-equiv
/** One adapter-discovered model; catalog membership is advisory, not request validation. */
interface LlmModelInfo {
  /** Provider route that owns this model entry. */
  provider: string
  /** Model id passed to {@link GenerateOptions.model}. */
  id: string
  /** Human-readable model name for selectors. */
  name: string
  /** Optional user-facing distinction from otherwise similar models. */
  description?: string
  /** Accepted request modalities; absent means unknown, while an explicit omission is negative capability. */
  inputModalities?: readonly ModelModality[]
}
```

정확성에 민감한 메타데이터는 참고용 카탈로그와 별도로 해석되며 정확한 라우트를 서빙하는 어댑터가 소유합니다. 컨텍스트 용량, 어댑터 호출 기본값, 추론 선택, 시스템 프롬프트 갱신 모드는 정확 모델 결과 하나를 공유하므로 소비자가 권위 있는 모델 해석을 반복하지 않습니다. `SystemPromptUpdate`는 값이 `'in-history'` 하나입니다. 모델은 `messages` 어느 위치에 있든 최신 `system` 메시지를 완전한 실효 시스템 프롬프트로 읽으므로, 에이전트 루프가 메시지 0을 다시 쓰지 않고 캐시된 이력 뒤에 변경된 프롬프트를 덧붙일 수 있습니다([결정 규칙](../../packages/core/agent-loop/README.md#understand-the-implementation)). 모드가 없으면 선행 시스템 메시지만 읽으며, `normalizeModelInfo`는 다른 값을 `INVALID_MODEL_INFO`로 거부합니다.

```ts type-equiv
/** Provider-owned context capacity for one exact provider/model route. */
interface LlmModelContext {
  /** Maximum combined request and response context in tokens. */
  contextWindow: number
}
```

추론 강도는 또 하나의 정확 라우트 기능입니다. 코어는 식별자에 브랜드를 붙이지만 그 값을 열거하지 않으며, 각 어댑터가 추론 강도 증가 순서의 선택지, 표시 이름, 선택적 배포 기본값을 소유합니다. 순서는 예측 토큰 사용량, 비용, 지연 시간이 아니라 선택 가능한 제어를 비교합니다.

```ts type-equiv
/** Adapter-owned identifier for one model's selectable reasoning effort. */
type ReasoningEffortId = Branded<'ReasoningEffortId'>
```

```ts type-equiv
/** Display metadata for one adapter-owned reasoning effort. */
interface LlmReasoningEffortInfo {
  /** Opaque stable value accepted by {@link GenerateOptions.reasoningEffort}. */
  id: ReasoningEffortId
  /** Human-readable effort name for selectors and diagnostics. */
  name: string
  /** Optional user-facing distinction from otherwise similar efforts. */
  description?: string
}
```

```ts type-equiv
/** Selectable reasoning efforts for one exact provider/model route. */
interface LlmModelReasoningInfo {
  /** Supported efforts from least to greatest selectable reasoning effort, not predicted token use or latency. */
  efforts: readonly LlmReasoningEffortInfo[]
  /**
   * Adapter-configured default materialized into requests when callers omit
   * an effort. Absence preserves the provider's own default.
   */
  defaultEffort?: ReasoningEffortId
}
```

```ts type-equiv
/** Exact-route model metadata resolved by its owning adapter. */
interface LlmResolvedModelInfo extends LlmModelInfo {
  /** Provider-owned context capacity when known. */
  context?: LlmModelContext
  /** Adapter-configured per-request output cap materialized when callers omit one. */
  defaultMaxTokens?: number
  /** Adapter-owned selectable reasoning levels when exposed. */
  reasoning?: LlmModelReasoningInfo
  /** Declared mid-conversation system prompt handling; absent means only a leading system message is read. */
  systemPromptUpdate?: SystemPromptUpdate
  /** Declared mid-conversation tool declaration handling; absent means every request declares the complete tool list. */
  toolUpdate?: ToolUpdate
}
```

보조 호출자는 영속 정체성이나 소스 없이 사용자 콘텐츠를 제공할 수 있습니다. 기존 `Message[]` 이력은 유효한 요청 입력으로 남습니다. 세션 쓰기, 에이전트 전달, 기록된 제목 요청은 계속 영속 메시지를 요구합니다.

```ts type-equiv
/** User input for one LLM request; it has no durable Session identity or source. */
interface RequestUserInput {
  readonly role: 'user'
  readonly content: UserMessage['content']
  readonly id?: never
  readonly source?: never
}
```

```ts type-equiv
/** A durable conversation message or a user input used only for one request. */
type RequestMessage = Message | RequestUserInput
```

```ts type-equiv
/** A single model request, fully assembled. */
interface GenerateOptions {
  /** Registered provider route selecting the adapter instance. */
  provider: string
  model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  reasoningEffort?: ReasoningEffortId
  /**
   * Ordered conversation messages, exactly as the provider sees them. A
   * loop-built request passes the derived history (dsh-agent-loop), whose
   * leading system-role message carries the system prompt; a hand-built
   * one-shot may include identity-free user inputs.
   */
  messages: RequestMessage[]
  /**
   * System prompt text for one-shot callers; adapters map it to the provider's
   * system slot ahead of `messages`. Loop-built requests leave it undefined.
   */
  system?: string
  /** Tool schemas (adapters map to the provider's `tools` field). */
  tools?: ToolSchema[]
  /** Session-folded tool history used for route projection; omission sends complete declarations without tool updates. */
  toolHistory?: ToolHistory
  temperature?: number
  maxTokens?: number
  /**
   * Stop sequences: generation halts as soon as the model produces any one of
   * these strings (adapters map to the provider's stop field, e.g. OpenAI
   * `stop`). The stop string itself is not included in the output.
   */
  stop?: string[]
  signal?: AbortSignal
  /**
   * Session identity stamped by the loop for request routing. Replay uses it
   * to separate cursors; adapters may map it to model-hidden transport metadata.
   */
  sessionId?: Branded<'SessionId'>
  /**
   * Provider-neutral classification for an auxiliary model call. Adapters may
   * map the purpose to model-hidden transport metadata. Ordinary conversation
   * requests leave it unset.
   */
  purpose?: 'compaction' | 'session-title'
}
```

모델 응답이 왜 멈췄는지는 병합 확장 이유입니다. 터미널 제공자 실패는 스트리밍 계약의 [`LlmFailure`](#llmfailure)를 담습니다:

```ts type-equiv
/**
 * Why a model response stopped.
 * Merge-extensible so adapters can surface provider-specific reasons.
 */
interface FinishReasonMap {
  'stop': { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  'aborted': { kind: 'aborted'; failure: LlmFailure }
  'error': { kind: 'error'; failure: LlmFailure }
}
```

`FinishReason = FinishReasonMap[keyof FinishReasonMap]`입니다. `TokenUsage`(서로 겹치지 않는 캐시 필드를 가진 호출별 회계)는 [아래](#tokenusage)에서 자세히 다룹니다.

`GenerateOptions.tools`는 `ToolSchema`를 담습니다. 즉 모델에 보내는 그대로의 도구 JSON 스키마 설명입니다. 이것이 dsh-tools가 아니라 dsh-llm에 선언된 이유는 정확히 루프가 매 단계 조립하는 요청의 일부이기 때문입니다:

```ts type-equiv
/**
 * JSON-schema description of a tool, as sent to the model.
 *
 * Declared here (not in dsh-tools) because it is part of {@link GenerateOptions};
 * dsh-tools' ToolDefinition and dsh-system-prompt's PromptAssembly both import
 * it from this package.
 */
interface ToolSchema {
  /**
   * Requests deferred loading of the tool definition into model context,
   * independently of whether a tool-addition block records the tool.
   * Uses Anthropic's defer_loading terminology.
   */
  deferLoading?: true
  name: string
  description: string
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>
}
```

모델 대상 `ToolSchema`는 와이어 타입이고, 이를 생성하는 등록된 `ToolDefinition`(스키마 + `execute`)은 [tools.md](tools.ko.md)에 있습니다.

표면이 아직 초안을 작성 중인 제공자는 라우트도 카탈로그도 없으므로 질의를 따로 설명합니다. 요청은 사용자가 편집 중인 초안을 담고, 응답은 표면이 서비스해야 하는 카탈로그가 아니라 표면이 채택할 수 있는 후보입니다.

```ts type-equiv
/**
 * One interrogation of a provider endpoint that configuration has not stored
 * yet. Configuration surfaces send the draft a user is still editing, so the
 * request carries the endpoint and credential directly instead of naming a
 * route: a provider being added has no route to name.
 */
interface LlmModelDiscoveryRequest {
  /**
   * Route the draft is editing, when it edits an existing one. A route whose
   * adapter already knows its models answers from that knowledge instead of
   * asking the endpoint — the adapter's own registry is the better answer, and
   * it costs no network call.
   */
  provider?: string
  /**
   * Endpoint to interrogate. Optional because a route the adapter already
   * describes needs none; a route it does not must supply one.
   */
  baseURL?: string
  /** Wire protocol the endpoint speaks, when the draft names one. */
  api?: string
  /** Credential for this interrogation alone; the harness never stores it. */
  apiKey?: string
}
```

```ts type-equiv
/**
 * One model an endpoint reports about itself. Every field but the id is
 * optional because most provider listings disclose an id and nothing else;
 * a surface adopting one of these still owes the capacities its adapter needs.
 */
interface LlmDiscoveredModel {
  /** Model id the endpoint accepts. */
  id: string
  /** Human-readable name when the endpoint supplies one. */
  name?: string
  /** Maximum combined request and response context, when disclosed. */
  contextWindow?: number
  /** Maximum output tokens, when disclosed. */
  maxTokens?: number
  /** Accepted input types when disclosed by the catalog or endpoint; absent means unknown. */
  inputModalities?: readonly ModelModality[]
}
```

### 요청 봉투: `LlmCallConfig`와 기록된 헤더

루프는 기록된 상태에서 각 요청을 만듭니다. `EpochHeader`는 호출 구성을 기록하고, 어댑터 기본값이 공급한 필드를 표시하며, 권위 있는 반환 도구 순서(`toolOrder`로 구성하거나, 없으면 사전순)를 완전한 `request/header` 스냅샷으로 기록합니다. 렌더링된 프롬프트는 파생 이력입니다. 즉 표면 노드 0의 `system/message`와, `in-history` 라우트가 덧붙인 이후 시스템 노드이며, 따라서 헤더와 파생 이력이 함께 요청을 세션 로그에서 재구성 가능하게 만듭니다. [session.md](session.ko.md#요청-헤더-이벤트-requestheader)와 [재구성 가능성 Agent Note](../../.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md)를 참고하세요.

더 이상 권장되지 않는 `agent/request` 훅은 기존 리스너가 계속 사용할 수 있습니다. 새 코드는 [세션 모델 선택](../../packages/core/agent/README.md#use-this-package)으로 모델과 추론 강도를 선택합니다. 훅은 단계의 캡처된 모델 선택에 기반한 동결된 호출 구성 시드를 받고 샘플링 같은 제어를 교체할 수 있습니다. 교체는 제공자, 모델, 선택적 명시적 추론 강도를 보존해야 하며, 이를 바꾸려면 다음 단계 전에 새 세션 선택을 기록하세요. 워터폴 전에 루프는 어댑터 기본값으로 표시된 값을 제거하므로 정확 모델 준비가 선택된 라우트의 현재 값을 구체화하고, 표시되지 않은 명시적 설정은 제안에 남습니다. 워터폴 후 준비는 지원되지 않는 명시적 추론 강도 id를 클램프 없이 거부하고, 실효 구성과 어댑터 기본값이 공급한 필드를 턴 신호 아래 기록합니다. 단계 수용 시 이 워터폴과 준비는 조립과 `step/start` 이후, 시스템 프롬프트와 수락된 사용자 배치가 커밋되기 전에 실행되며, 둘 중 어느 시점에 취소해도 둘 다 커밋되지 않습니다. 준비된 기능이 프롬프트 조정을 지배하고, 호출은 디스패치 전반에서 어댑터 등록 하나를 유지합니다. `llm/stream`에 도달한 요청은 깊이 동결되어 변경이 예외를 던지며, 프로세스 로컬 루프 정체성을 담아 관찰자가 별도로 기록된 동결 보조 호출을 대화 요청과 혼동하지 않게 합니다.

와이어에서 루프가 만든 요청은 파생 이력 그 자체입니다. 렌더링된 프롬프트는 선행 `system` 역할 메시지(표면 노드 0, `system/message` 이벤트)로 이동하고, 준비된 호출이 `systemPromptUpdate: 'in-history'`를 선언하면 비어 있지 않은 변경 프롬프트가 캐시된 이력 뒤에 이후 `system` 역할 메시지로 붙어 모델이 이를 실효 프롬프트로 읽습니다. 요청의 `system` 필드는 비어 있습니다. `GenerateOptions.system`은 제목 제공자 같은 직접 일회성 호출자를 위한 것입니다. 렌더링이 비면 파생 이력에 시스템 메시지가 남지 않으며, 이전 요청들이 여러 프롬프트 버전을 보유했더라도 마찬가지입니다. 기록된 요청은 턴의 첫 단계에서는 최신 `user/message`로, 이후 단계에서는 이전 단계의 도구 결과로 끝납니다.

FIXME(call-config-shape): 캐시 목적에서 남은 필드 중 어느 것이 진짜 epoch 수준인지 다시 검토합니다(`model`과 모델이 소유하는 추론 강도는 명시적이며, 샘플링 스칼라는 만전을 기해 여기 있습니다).

```ts type-equiv
/** Concrete generation settings; omitted controls use the selected route's defaults. */
interface LlmCallControls {
  reasoningEffort?: ReasoningEffortId
  temperature?: number
  maxTokens?: number
  stop?: string[]
}
```

```ts type-equiv
/**
 * Provider, model, reasoning effort, and sampling scalars of one conversation's
 * requests. Every field maps 1:1 onto the same-named `GenerateOptions` field;
 * the loop builds requests from the logged header rather than accepting these
 * per call.
 */
interface LlmCallConfig extends LlmCallControls {
  provider: string
  model: string
}
```

```ts type-equiv
/**
 * Synchronous, pure configuration of one call before defaults and validation.
 * Compose functions in the desired order; later writes replace earlier ones.
 * The returned controls cannot change the captured route. Errors reject
 * preparation before dispatch; only the resolved configuration is recordable.
 * @param controls - detached, deeply frozen proposed controls, without defaults.
 * @param model - detached, deeply frozen metadata from the captured adapter generation.
 * @returns concrete controls; omitted fields receive the route's defaults.
 */
type ConfigureCall = (
  controls: Readonly<LlmCallControls>,
  model: Readonly<LlmResolvedModelInfo>,
) => LlmCallControls
```

```ts type-equiv
/**
 * Effective config fields supplied by exact-model adapter resolution rather
 * than by the caller's request proposal.
 */
interface LlmCallConfigAdapterDefaults {
  reasoningEffort?: true
  maxTokens?: true
}
```

## 공식 DeepSeek 요청 확장

`ctx.deepseekLlmApiExtensions`는 `deepseek-official` 요청의 추가 최상위 필드를 위한 제공자별 레지스트리입니다. 기여 플러그인은 `register(field, provider)`로 필드 하나를 차지하고, 어댑터는 기본 본문을 직렬화한 뒤 `prepare(request)`를 호출해 반환된 필드를 HTTP 전에 병합합니다. 준비된 `accept()` 트랜잭션은 2xx 이후 실행되므로, 기여자는 전송이나 제공자 거부를 수락으로 취급하지 않고 전달 상태를 커밋할 수 있습니다. 준비가 예외를 던지는 기여자는 기록되고 그 요청에서 생략되며, 수락 실패는 요청을 실패시키지 않고 기록됩니다. 기본 필드 충돌은 `REQUEST_EXTENSION`을 쓰고 모델 요청을 실패시킵니다. 병합된 본문의 직렬화가 실패하면 확장 필드 없이 전송되며, 수락은 건너뛰고 제공자 플러그인이 생략된 필드 이름을 기록합니다.

[와이어 참조](../deepseek-llm-api-wire-extensions.ko.md)가 정확한 요청 헤더, 확장 트랜잭션, 필드 버전, 수신자 의무를 정의합니다. 배포 구성은 [`dsh_session_log`](../../packages/session/session-log-deepseek/README.md)를 무손실 증분 정규 로그 접미사로, [`dsh_plugin_packages`](../../packages/llm/plugin-package-inventory-deepseek/README.md)를 활성 Loader 기반 패키지의 완전한 집합으로 등록합니다. 이 필드들은 모델 메시지 밖에 남고 pi-ai 어댑터 경로에는 없습니다.

## 서비스와 제공자 계약

`LlmAdapter`는 제공자 계약입니다. 즉 서브클래스를 만들고, `stream()`을 구현하고, `ctx.llm.registerAdapter(providers, adapter)`로 어댑터 인스턴스 하나를 등록합니다. `GenerateOptions.provider`가 등록된 어댑터를 선택하고, `GenerateOptions.model`은 그 어댑터에 전달되며 수명 주기 시작 시점에 등록되어 있을 필요는 없습니다. 중복 제공자 라우트는 원자적으로 실패합니다. 선택적 `providerRetryPolicy()`는 normal 기본값과 함께 라우트별로 캡처되고, `providerInfo()`와 비동기 `listModels()`는 분리된 선택기 메타데이터와 함께 `LlmRuntime.listProviders()` / `listModels()`를 공급합니다. 그 카탈로그는 요청 허용 목록이 아니라 참고용이므로, 어댑터가 계속 권위이며 나열되지 않은 모델 id를 받아들일 수 있습니다. 비동기 `resolveModel()` 질의 하나가 정확한 모델 정체성과, 선택적인 정확성 민감 컨텍스트 용량, 어댑터가 구성한 `defaultMaxTokens`, 선택적 배포 기본값을 가진 순서 있는 모델 소유 추론 id를 반환합니다. 필드가 없으면 사용할 수 없는 메타데이터이거나 제공자 소유 동작을 뜻하며, 카탈로그 멤버십이 유효하지 않다는 뜻이 아닙니다. 리졸버는 선택적 취소를 받고 중단 후 신속히 정착해야 합니다. `LlmRuntime.resolveModelInfo()`가 그 집계를 검증하고 분리합니다. 최종 어댑터 경계에서 `resolveCallConfig()`는 `maxTokens`가 없을 때만 출력 기본값을 구체화하고 추론 강도를 검증·구체화하므로, 직접 호출이 구성된 두 동작 중 어느 것도 우회할 수 없습니다. 직접 디스패치는 그 해석을 기다리기 전에 등록 하나를 캡처합니다. 대신 에이전트 루프는 `prepareCall()`을 사용해 모델 해석, 영속 헤더 기록, 디스패치 전반에서 같은 등록을 유지하고, 그 정확한 조회에서 분리된 컨텍스트 메타데이터를 보유하며, 어댑터가 기본값을 적용한 구성 필드를 보고합니다. 어댑터 조회는 `llm/stream` 워터폴의 터미널 연속에서 일어나므로, 리스너가 조회 전에 호출을 단락시키거나 변경 가능한 일회성 요청을 라우팅할 수 있습니다. AgentLoop은 바깥 워터폴이 스트림 핸들을 반환하면 요청 시도를 관찰하며, 그 제한된 경계는 지연 터미널 어댑터가 구성되었거나 제공자 I/O를 시작했음을 증명하지 않습니다. `block-start` / `block-end` `index` 상관과 조립기를 합치면 어댑터는 올바른 형식의 청크를 내보내기만 하면 되며, 블록 재조립은 각 어댑터의 문제가 아닙니다. [architecture.md](../architecture.ko.md#턴-흐름)가 한 턴에서 `ctx.llm.stream()`과 `llm/stream` 워터폴이 어디에 있는지 보여 줍니다.

```ts type-equiv
/** One model call whose config and adapter registration were resolved together. */
interface PreparedLlmCall {
  /** Detached, deep-frozen config with any adapter-owned default materialized. */
  readonly config: LlmCallConfig
  /** Immutable retry policy captured with the adapter registration. */
  readonly retryPolicy: ResolvedRetryPolicy
  /** Detached context metadata resolved with the registration-bound call. */
  readonly context?: LlmModelContext
  /** Exact model modalities captured with the adapter dispatch generation. */
  readonly inputModalities?: readonly ModelModality[]
  /** Exact model system prompt update mode captured with the adapter dispatch generation. */
  readonly systemPromptUpdate?: SystemPromptUpdate
  /** Exact model tool update mode captured with the adapter dispatch generation. */
  readonly toolUpdate?: ToolUpdate
  /** Config fields materialized by the captured adapter rather than proposed by the caller. */
  readonly adapterDefaults: LlmCallConfigAdapterDefaults
  /**
   * Dispatch this call once through the registration captured during
   * preparation. The request's call-config fields must match {@link config};
   * reuse or mismatch fails with `INVALID_PREPARED_CALL`.
   * @param options - fully assembled request carrying the prepared config.
   * @returns the chunk stream, including the `llm/stream` waterfall.
   */
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

```ts public-api
/**
 * Provider-wire adapter for the harness message and stream vocabulary. Register implementations
 * with `ctx.llm.registerAdapter(providers, adapter)`. Every provider HTTP request must include
 * `attributionHeaders()`; prove the headers are added in the wire request or library header hook. The direct-fetch
 * DeepSeek and library-backed pi-ai adapters meet this contract through different internals.
 */
declare abstract class LlmAdapter {
  /**
   * Describe one provider route owned by this adapter.
   * @param provider - a route passed to `registerAdapter()` for this instance.
   * @returns detached display metadata whose id must equal `provider`.
   */
  providerInfo(provider: string): LlmProviderInfo;
  /**
   * Return the provider-owned retry policy captured with this route.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @returns a resolved policy, or `undefined` to use the normal defaults.
   */
  providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
  /**
   * Resolve provider-side request-image pricing for one exact model route.
   * The default declares none, so consumers fall back to their own neutral
   * estimate. Implementations must answer synchronously without I/O; the
   * token meter resolves this per measurement.
   * @param _provider - a route passed to `registerAdapter()` for this instance.
   * @param _model - exact model id passed to {@link GenerateOptions.model}.
   * @returns route-owned image pricing, or `undefined` when the route declares none.
   */
  imageRequestPricing(_provider: string, _model: string): LlmImageRequestPricing | undefined;
  /**
   * Resolve the image dimensions and byte target this adapter sends to the model.
   * The default preserves normalized images; adapters that resize must override it.
   * @param _provider - registered provider route.
   * @param _model - exact model id.
   * @param image - normalized image whose request projection is being resolved.
   * @returns the same target used by request serialization, before provider-internal processing.
   */
  imageRequestTarget(_provider: string, _model: string, image: ImageAttachmentRef): ImageRequestTarget;
  /**
   * List models this adapter can currently advertise for one owned provider.
   * Core routing accepts unlisted model ids; catalog-driven entry points such
   * as the GUI may require membership. Adapters used there must advertise
   * their available models; the base empty catalog offers no GUI selection.
   * @param _provider - one provider route owned by this adapter.
   * @returns discoverable models in adapter-preferred order.
   */
  listModels(_provider: string): Promise<readonly LlmModelInfo[]>;
  /**
   * Resolve all metadata available for one exact model. This query is
   * independent of the advisory catalog and does not validate request routing.
   * @param provider - one provider route owned by this adapter.
   * @param model - exact model id passed to {@link GenerateOptions.model}.
   * @param _signal - cancellation for this exact-model lookup; asynchronous
   *   implementations must settle promptly after it aborts.
   * @returns provider/model identity plus any context, call-default, and reasoning metadata.
   */
  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo>;
  /**
   * Bind exact model metadata and the eventual request dispatch to one adapter generation.
   * Dynamic adapters override this so settings changes between preparation and
   * dispatch cannot combine one generation's capabilities with another's endpoint.
   * @param provider - registered provider route.
   * @param model - exact model id.
   * @param signal - cancellation for model resolution.
   * @returns model metadata and a one-generation stream entry point.
   */
  async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
  /**
   * Stream one model call as raw chunks. The only required method.
   * @param options - the fully-assembled request; implementations must honor `options.signal`.
   * @returns the chunk stream, obeying the adapter contract documented on `StreamChunk`.
   */
  abstract stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
```

`ContentBlockType`(`index`로 상관된 블록이 담는 키 집합)은 위의 [`ContentBlockMap`](#content-blocks-and-messages)에서 파생됩니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeepseekllmapiextensions--deepseekllmapiextensionregistry"></a>

### `ctx.deepseekLlmApiExtensions` — `DeepSeekLlmApiExtensionRegistry`

Registry of independently owned top-level fields for official DeepSeek requests.

```ts cordis-catalog
/**
 * Register the sole provider of one top-level request field. Registration is effect-scoped.
 * @param field - declaration-merged field owned by the provider.
 * @param provider - request-time field preparation and optional acceptance behavior.
 * @returns disposer that releases the field.
 */
register<K extends keyof DeepSeekLlmApiExtensionMap>( field: K, provider: DeepSeekLlmApiExtensionProvider<DeepSeekLlmApiExtensionMap[K]>, ): () => Promise<void>

/**
 * Prepare every currently registered field from one immutable base request.
 * A provider whose preparation throws, or whose value cannot be cloned, is omitted
 * from this request; the first such failure per field is logged. Only cancellation rejects. Field values are cloned
 * and frozen; providers retain no mutable alias to the outgoing request.
 * @param request - exact serialized request facts before extension fields.
 * @returns detached fields and their idempotent joint acceptance transaction.
 */
async prepare(request: DeepSeekLlmApiExtensionRequest): Promise<PreparedDeepSeekLlmApiExtensions>
```

Source: [`packages/llm/deepseek-llm-api-extensions/src/index.ts`](../../packages/llm/deepseek-llm-api-extensions/src/index.ts)

<a id="ctxllm--llmruntime"></a>

### `ctx.llm` — `LlmRuntime`

The abstract `llm` service: an adapter registry plus a streaming model-call API, interceptable via the `llm/stream` waterfall.

```ts cordis-catalog
/**
 * Register an adapter for the given provider routes. Throws `LlmError` with code
 * `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
 * Disposed with the fiber.
 * @param providers - every provider route this adapter should serve.
 * @param adapter - the adapter that streams calls for those providers.
 * @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
 */
registerAdapter(providers: string[], adapter: LlmAdapter): AdapterRegistrationHandle

/**
 * Describe provider routes with a registered adapter.
 * @returns detached provider metadata in registration order.
 */
@Remote listProviders(): LlmProviderInfo[]

/**
 * Declare provider routes an adapter plugin can activate through
 * configuration. Registration is all-or-nothing: an empty list, invalid
 * entry, or a provider already declared by any registration throws
 * `LlmError` without registering the rest. Disposed with the fiber.
 * @param entries - every configurable provider this plugin owns.
 * @returns a handle that withdraws all of them, and can atomically replace them.
 */
registerConfigurableProviders(entries: readonly LlmConfigurableProvider[]): DirectoryRegistrationHandle

/**
 * List every declared configurable provider, registered or dormant.
 * @returns detached directory entries in declaration order.
 */
@Remote listConfigurableProviders(): LlmConfigurableProvider[]

/**
 * Offer to interrogate provider endpoints on behalf of the settings
 * namespace this plugin owns. The namespace is the key because that is what
 * a configuration surface already holds from the configurable-provider
 * directory, and because a provider being *added* has no route to name yet.
 * Disposed with the fiber.
 * @param settingsNs - the namespace whose profiles this discovery serves.
 * @param discover - interrogates one endpoint and must honor the supplied signal.
 * @returns the disposer that withdraws the offer.
 */
registerModelDiscovery( settingsNs: string, discover: ( request: LlmModelDiscoveryRequest, signal?: AbortSignal, ) => Promise<readonly LlmDiscoveredModel[]>, ): () => void

/**
 * Interrogate one provider endpoint for the models it advertises. The
 * request describes a draft, not a stored route, so nothing here reads or
 * writes settings or credentials — the caller owns both, and the reply is
 * candidate metadata a surface may offer for adoption.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - the endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation.
 * @returns the advertised models, deduplicated in endpoint order.
 */
async discoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal?: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Remote adapter for one draft provider interrogation.
 * @param settingsNs - namespace whose registered discovery serves this draft.
 * @param request - endpoint, protocol, and one-shot credential to use.
 * @param signal - caller cancellation supplied by the Remote carrier.
 * @returns advertised models in endpoint order.
 * @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
 */
@Remote('discoverModels') async remoteDiscoverModels( settingsNs: string, request: LlmModelDiscoveryRequest, signal: AbortSignal, ): Promise<LlmDiscoveredModel[]>

/**
 * Resolve the retry policy captured when one provider route was registered.
 * @param provider - registered provider route to inspect.
 * @returns the provider-owned policy, with normal defaults already resolved.
 */
providerRetryPolicy(provider: string): ResolvedRetryPolicy

/**
 * Resolve provider-side request-image pricing for one exact route, or
 * `undefined` when the provider is unregistered or declares none. Unknown
 * providers degrade to `undefined` rather than throwing because callers
 * price durable history whose route may no longer be mounted.
 * @param provider - provider route named by a request header.
 * @param model - exact model id named by the same header.
 * @returns the owning adapter's image pricing for the route, when declared.
 */
imageRequestPricing(provider: string, model: string): LlmImageRequestPricing | undefined

/**
 * Resolve the image projection for an exact registered model route.
 * @param provider - registered provider route.
 * @param model - exact model id.
 * @param image - normalized image reference.
 * @returns dimensions and byte target used by the adapter's request serializer.
 */
imageRequestTarget(provider: string, model: string, image: ImageAttachmentRef): ImageRequestTarget

/**
 * Resolve the exact text one durable file occurrence contributes to every
 * provider request in the current execution environment.
 * @param ref - durable verbatim file reference from model history.
 * @returns the same deterministic handle text used at adapter dispatch.
 */
fileRequestText(ref: FileAttachmentRef): string

/**
 * Discover models advertised by one registered provider. Catalog membership
 * does not constrain core routing. Catalog-driven entry points may restrict
 * selection and submission to the advertised models.
 * @param provider - registered provider route to inspect.
 * @returns detached model metadata in adapter-preferred order.
 */
async listModels(provider: string): Promise<LlmModelInfo[]>

/**
 * Resolve and validate all metadata from the adapter that owns one exact
 * route. The result is detached from adapter-owned objects; catalog
 * membership remains advisory and does not control request routing.
 * @param provider - registered provider route to inspect.
 * @param model - exact model id passed to the adapter.
 * @param signal - optional cancellation for adapter-owned asynchronous lookup.
 * @returns exact model identity plus available context and reasoning metadata.
 */
async resolveModelInfo( provider: string, model: string, signal?: AbortSignal, ): Promise<LlmResolvedModelInfo>

/**
 * Validate a conversation call config against its exact model capability and
 * materialize adapter-configured defaults. Unsupported explicit efforts
 * reject before provider I/O; no clamping or aliasing is performed. This
 * standalone query does not bind a later dispatch; use {@link prepareCall}
 * when logging and streaming must share one adapter registration.
 * @param config - provider/model route and optional request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @returns a detached config only when a default must be materialized.
 */
async resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>

/**
 * Resolve one call under its current adapter registration. The returned
 * one-shot handle keeps that registration across header logging and dispatch,
 * so HMR cannot combine one adapter's capability result with another adapter.
 * An optional synchronous callback selects concrete controls using captured
 * model metadata. Defaults and validation apply to its result. Callback
 * failures and cancellation reject preparation before dispatch.
 * @param config - provider/model route and optional concrete request controls.
 * @param signal - optional cancellation for adapter-owned capability lookup.
 * @param configure - pure control selection, called once before defaults and validation.
 * @returns a prepared config and its registration-bound stream entry point.
 */
async prepareCall( config: LlmCallConfig, signal?: AbortSignal, configure?: ConfigureCall, ): Promise<PreparedLlmCall>

/**
 * Stream one model call as raw chunks (token-level deltas). Replay state is
 * retained only when the same adapter instance owns its historical provider
 * and the target provider. Final adapter selection remains fixed through
 * asynchronous exact-model resolution and dispatch. Adapter selection,
 * dispatch, and iteration failures become terminal `error` or `aborted`
 * finish chunks; middleware, nested-call, cleanup, and consumer failures
 * remain thrown.
 * @param options - the full request; `options.provider` selects the adapter.
 * @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
 */
stream(options: GenerateOptions): AsyncIterable<StreamChunk>
```

Types: [FileAttachmentRef](attachment.ko.md) · [ImageAttachmentRef](attachment.ko.md) · [ImageRequestTarget](attachment.ko.md)

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)

<a id="llm-events"></a>

### `llm/*` events

<a id="llmadapters-updated--emit"></a>

#### `llm/adapters-updated` — emit

The provider topology changed: an adapter registered or unregistered routes, or the configurable-provider directory gained or lost entries. This payload-free registry notification fires at each commit point (including registration disposal); consumers re-read `listProviders()`, `listModels()`, or `listConfigurableProviders()` for the new state. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * The provider topology changed: an adapter registered or unregistered
 * routes, or the configurable-provider directory gained or lost entries.
 * This payload-free registry notification fires at each commit point
 * (including registration disposal); consumers re-read `listProviders()`,
 * `listModels()`, or `listConfigurableProviders()` for the new state.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'llm/adapters-updated'(): void
```

Source: [`packages/llm/llm/src/types.ts`](../../packages/llm/llm/src/types.ts)

<a id="llmstream--waterfall"></a>

#### `llm/stream` — waterfall

Waterfall around every streaming model call (retry, replay, routing). Bound to the LlmRuntime; call `next()` to reach the resolved adapter's stream, or yield your own chunks to short-circuit.

```ts cordis-catalog
/**
 * Waterfall around every streaming model call (retry, replay, routing).
 * Bound to the {@link LlmRuntime}; call `next()` to reach the resolved
 * adapter's stream, or yield your own chunks to short-circuit.
 * @param options - the full request. A LOOP-built request carries the
 *   process-local {@link markAgentLoopRequest} identity and arrives deep-frozen
 *   (mutation throws): its content is a pure function of the session log (the
 *   reconstructability Agent Note), so listeners read it, never rewrite it.
 *   Hand-built calls do not carry that marker; callers own their request
 *   inputs and must keep them unchanged until the stream settles.
 * @mode waterfall
 */
'llm/stream'(this: LlmRuntime, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk>
```

Source: [`packages/llm/llm/src/index.ts`](../../packages/llm/llm/src/index.ts)
<!-- END GENERATED cordis-surface -->
