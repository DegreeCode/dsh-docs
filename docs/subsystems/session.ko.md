# 세션

[English](session.md) | [中文](session.zh.md) | 한국어

[dsh-session](../../packages/core/session)의 인메모리 이벤트 소싱(event sourcing) 모델입니다. `Session`은 타입이 지정된 `SessionEvent`의 **추가 전용 로그**이며, 에이전트의 전체 상호작용 이력에 대한 단일 진실 원천입니다. LLM 메시지 이력은 그 로그에서 *파생*되며 절대 따로 저장되지 않습니다. 재생은 같은 이벤트에서 다시 파생하는 것입니다. 로그를 **영속**으로 만드는 방식(영속 seam, 백엔드, 크래시 복구)은 [persistence.md](persistence.ko.md)에서 다루는 형제 관심사입니다.

출처: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

## `SessionEventMap` — 이벤트 어휘

추가 전용 이벤트 타입입니다. 선언 병합으로 확장 가능하며, 플러그인이 추가 이벤트 타입을 선언 병합으로 정의합니다. 예를 들어 [압축 seam](compaction.ko.md)은 `compaction/start` / `compaction/summary` / `compaction/end`를 추가하고, `@deepseek-ai/dsh-hook-protocol`은 훅 브리지를 위한 로그 전용 `hook/invoked` / `hook/result` 기록을 추가합니다. `compaction/*`처럼 이것들은 `SurfaceEventType`이 **아닙니다**(`surfaceOp` 없음). 생성된 [영속 로그 이벤트 카탈로그](../persistence-catalog.ko.md)가 코어와 병합된 모든 멤버를 페이로드, 표면 배지, 선언 위치와 함께 열거합니다.

```ts type-equiv
/** A user-role specialization of the shared message representation. */
interface UserMessage extends MessageBase {
  readonly role: 'user'
}
```

```ts type-equiv
/**
 * The merge-extensible, append-only source of truth for an agent interaction.
 * Message history is derived from this log. Every event is lossless JSON and
 * sequence numbers stay contiguous. Assistant attempt events embed their exact
 * compact raw streams so persistence stores one durable settlement per attempt.
 */
interface SessionEventMap {
  /**
   * Opens turn `turn` before the loop claims queued input or runs pre-step.
   * Rejection, empty input, cancellation, or failure may close it with no
   * step; otherwise the following identified `user/message` event or batch
   * records the messages entering the step.
   */
  'turn/start': { turn: number }
  /**
   * Closes turn `turn` with the {@link TurnEndReason} that ended it. A turn
   * with no entered step has no `step/start` or `step/end`. The loop does not await a
   * flush at turn boundaries: `dsh-session-checkpoint-policy` owns the
   * per-request durability checkpoint, and consumers that read storage after
   * `whenIdle()` flush themselves. Success commits the turn; rejection is
   * reported live and does not prevent later work.
   */
  'turn/end': { turn: number; reason: TurnEndReason }
  /** Opens step `step` of turn `turn` — one model call plus the tool executions it requested. */
  'step/start': { turn: number; step: number }
  /** Closes step `step` of turn `turn`. */
  'step/end': { turn: number; step: number }
  /**
   * A user-role message on the model-visible surface: a direct human prompt
   * (the queued message claimed for this turn), a synthetic `agent.inject()`
   * context (file-change notices, subdir AGENTS.md, skill content, cron
   * notifications, …), or an entered goal continuation round. All three
   * project their `content` verbatim; `source` tells them apart.
   */
  'user/message': UserMessage
  /** An incremental agent session change admitted at the named turn and step. */
  'developer/message': {
    turn: number
    step: number
    message: DeveloperMessage
    /** Earlier request/header defining every tool addition; required exactly when additions are present. */
    headerSeq?: SessionSeq
  }
  /**
   * The rendered system prompt on the model-visible surface. The loop appends
   * the first one as surface node 0 before the step's first `user/message`.
   * A prepared in-history route can append nonempty changes in a continuing
   * series. An incapable route, or a new series whose effective text differs,
   * normalizes text to the first system node; a series start whose latest
   * surviving node already holds the rendering leaves it in place.
   * Normalization empties nonempty later nodes, then rewrites the head if
   * needed, through logged per-node replacements. An empty rendering always
   * clears all active system nodes, leaving no older instructions model-visible.
   * Empty later nodes are dormant and project to no message; an empty head with
   * no active later node records "no system prompt". Restored nonempty text follows
   * the same route and series rule; empty nodes never restore older text.
   */
  'system/message': { turn: number; step: number; message: SystemMessage }
  /**
   * Assembled assistant message for one step (derived history uses this).
   * Carries the step's `usage` when the adapter reported token accounting, so
   * the model output and its accounting travel together (there is no separate
   * usage record). `usage` is absent when the adapter reported none. A turn
   * cancelled mid-stream finalizes its delivered text/reasoning prefix as this
   * event with `interrupted: true`; undispatched tool calls are absent. The
   * marker distinguishes that prefix without re-deriving interruption from turn
   * boundaries. An aborted turn with no such event streamed no visible content.
   */
  'assistant/message': {
    turn: number
    step: number
    message: AssistantMessage
    /** Exact timed model stream, compacted without joining delta boundaries. */
    stream: AssistantStreamRecord[]
    usage?: TokenUsage
    interrupted?: true
  }
  /**
   * One model attempt that committed no surface message. The embedded stream
   * preserves a failed, retried, cancelled, or stream-error attempt that
   * reached settlement without fabricating model-visible history.
   */
  'assistant/attempt': { turn: number; step: number; stream: AssistantStreamRecord[] }
  /**
   * The model requested one tool invocation: `name` with the raw `arguments`
   * JSON string exactly as the model produced it (unparsed). `callId` pairs the
   * call with its `tool/result`.
   */
  'tool/call': { turn: number; step: number; callId: ToolCallId; name: string; arguments: string }
  /**
   * A completed tool call's model-facing result, optional internal failure
   * identity and user-facing reason, and optional tool-private `meta`
   * presentation payload. The reason remains outside the model-facing message.
   * `meta` is
   * opaque to the core (the producing tool owns its shape and reads it back in
   * `presentResult`) but MUST be JSON-serializable: `Session.append`
   * runtime-validates all event data with `isJsonValue`, so a non-serializable
   * `meta` is rejected at the source, and the durable log reproduces the
   * identical card on replay. Absent
   * unless the tool attaches one (e.g. `dsh-tool-fs` carries its result-time
   * contextual diff here).
   */
  'tool/result': {
    turn: number
    step: number
    message: ToolResultMessage
    /**
     * Optional failure identity and raw user-facing reason, outside model content;
     * allowed only when the message has `isError: true`.
     */
    error?: { name: string; code: string; reason?: string }
    meta?: JsonValue
  }
  /**
   * Full header for the next request, appended inside its step before dispatch.
   * It is log-only; the latest snapshot reconstructs the request header.
   */
  'request/header': {
    header: EpochHeader
    reason: RequestHeaderReason
    /** This request begins a distinct model-message series, independently of the header reason. */
    startsSeries?: true
  }
  /**
   * Route metadata for the next request, logged only when the route, capacity,
   * or system prompt update mode changes. It does not participate in request
   * reconstruction or header equality. Prompt admission uses the bound prepared
   * call's capability, not this snapshot from an earlier request.
   */
  'request/context': RequestContext
  /**
   * Separates inherited or restored history from later lifecycle-owned work.
   * This log-only marker need not be at {@link Session.firstLiveSeq}: a fork
   * seed can already contain its tagged marker and child-owned synthetic
   * closers before construction.
   *
   * A fresh fork child owns one `{ inherited: true }` marker at its exact
   * inherited-prefix cut, even when that prefix ends in an ancestor marker.
   * `buildForkSeed` appends that marker before any synthetic closers; the
   * `Session` constructor supplies it when given only the inherited prefix.
   * The last tagged marker is the current Session's cut; untagged markers
   * keep ordinary restore and replay lifecycle boundaries.
   *
   * Only the `Session` constructor and `buildForkSeed` may create this marker.
   * Session append does not reject other writers, so a plugin appending one
   * would silently classify every live bracket before it as seed history.
   *
   * An owner of a standalone open/close bracket (`compaction/start` …
   * `compaction/end`) reads it because seed history and live work are otherwise
   * byte-identical: an unmatched opening marker before this event belongs to
   * an ended lifecycle, whatever ended it. NOT a liveness signal about other
   * writers — a concurrently live session holds its own boundary elsewhere,
   * so tolerating concurrent writers needs a signal beyond the log.
   */
  'session/end-seed': { inherited?: true }
}
```

`UserMessage`는 일반 프롬프트, 주입된 컨텍스트, 스티어링, 라이브 인박스 이벤트가 공유하는 식별된 동결 user 역할 값입니다. 이벤트 래퍼는 이벤트 로컬 위치나 결과 사실만 더하고, 루프는 항목이 대기 중인 동안 드라이버 소유 라우팅 상태만 더합니다.

<a id="the-request-header-event-requestheader"></a>

<a id="요청-헤더-이벤트-requestheader"></a>
### 요청 헤더 이벤트: `request/header`

요청 엔벨로프인 `EpochHeader`(호출 구성 + 어댑터 제공 기본값 마커 + 조립된 도구 스키마)는 기록되는 세션 상태이므로 모든 대화 요청은 로그의 순수 함수입니다(재구성 가능성 Agent Note). 렌더링된 시스템 프롬프트는 헤더의 일부가 아닙니다. 그것은 파생 이력이며, 표면 노드 0의 `system/message` 이벤트와 이후 이력 내 시스템 노드입니다([결정](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md)). 따라서 프롬프트 변경은 시스템 노드를 교체하거나 추가하고 헤더는 그대로 둡니다. 이유가 `'initial'` 또는 `'resume'`인 전체 `request/header` 스냅샷이 각 루프 인스턴스 경계를 기록하고, 요청이 바뀌면 이유 `'change'` 스냅샷을 추가하며, 명시적으로 선언된 메시지 시리즈를 시작하거나 표면 교체 뒤에 오는 변경되지 않은 엔벨로프는 이유 `'series'` 스냅샷을 추가합니다. `'initial'`, `'resume'`, `'change'` 스냅샷은 그 요청이 시리즈도 시작할 때 `startsSeries: true`를 담습니다. 이유 `'series'`는 이미 그 사실을 기록합니다. 같은 모델 메시지 시리즈의 일반적인 이후 턴, 추가 단계, 재시도는 최신 스냅샷을 상속합니다. `foldRequestHeader(events)`가 최신 스냅샷을 선택해 헤더를 재구성합니다. 이 이벤트는 `SurfaceEventType`이 아니므로 LLM 메시지를 만들지 않습니다.

```ts type-equiv
/**
 * Logged request state outside derived history: call config and tools. The
 * system prompt is derived history — surface node 0, a `system/message` event.
 * The latest full `request/header` snapshot reconstructs the header; canonical
 * empty optional fields are absent.
 */
interface EpochHeader {
  /** The conversation's call configuration (provider, model, reasoning effort, and sampling scalars). */
  config: LlmCallConfig
  /** Effective config fields materialized from the exact adapter rather than proposed by a caller. */
  adapterDefaults?: LlmCallConfigAdapterDefaults
  /** Assembled tool schemas; absent for a tool-less request. */
  tools?: ToolSchema[]
  /** Retired request text; system prompts belong to system/message events.
   * @persistenceReserved
   */
  system?: never
}
```

현재 이벤트 수용은 정규 `request/header.header`를 요구합니다. 어떤 `system` 필드도 금지되며, `tools: []`와 `adapterDefaults: {}`는 생략해야 합니다. 공백만 있는 시스템 메시지 콘텐츠, `config.stop: []`, 중첩 확장은 그대로입니다. 시드, 추가, 현재 영속 읽기는 비정규 헤더를 조용히 정규화하는 대신 거부합니다. 과거 변환은 [V3 엔벨로프 결정](../../.agents/notes/implemented/architecture/2026-09-06-v3-canonical-session-envelopes.md)이 소유합니다. `request/header-delta`나 그 전체 스냅샷 `fallback` 이유를 담은 레거시 v0 로그는 불완전하게 재생되는 대신 거부됩니다.

### 라우트 용량 이벤트: `request/context`

요청이 해석된 라우트의 컨텍스트 메타데이터는 별도로 기록되는 상태이며, 같은 단계 안에서 `request/header` 옆에 추가되고, 제공자, 모델, 용량, `systemPromptUpdate` 모드가 이전 기록과 다를 때만 추가됩니다. 이것이 `EpochHeader` 밖에 있는 이유는, 그 타입이 `headerEquals`로 필드 단위 비교되는 재구성 계약이기 때문입니다. 용량과 갱신 모드는 요청 입력이 아니라 라우트를 설명하므로, 여기에 접어 넣으면 라우트 변경이 요청 엔벨로프 `change`로 등록되고 어댑터 메타데이터가 루프의 요청 재구성으로 끌려 들어갑니다. `request/header`처럼 `SurfaceEventType`이 아니며 LLM 메시지를 만들지 않습니다. `session.requestContext()`가 최신 기록을 증분으로 폴드하고, 에이전트 루프는 변경된 시스템 프롬프트가 최신 시스템 노드를 교체할지 캐시된 이력 뒤에 추가될지 결정할 때 그 기록의 `systemPromptUpdate`를 읽습니다([결정 규칙](../../packages/core/agent-loop/README.md#understand-the-implementation)). 어댑터가 용량을 알리지 않는 라우트는 `contextWindow` 없이 기록되므로 새 기록이 이전 라우트의 용량을 지웁니다. 갱신 모드를 선언하지 않은 라우트도 마찬가지로 이전 라우트의 `systemPromptUpdate`를 지웁니다.

```ts type-equiv
/** Registration-bound metadata for one resolved model route. */
interface RequestContext {
  /** Registered provider route the metadata belongs to. */
  provider: string
  /** Provider-owned model id the metadata belongs to. */
  model: string
  /** Maximum combined request and response context in tokens, when advertised. */
  contextWindow?: number
  /** `'in-history'` when the route reads the latest `system` message at any position as the effective system prompt. */
  systemPromptUpdate?: SystemPromptUpdate
}
```

## `SessionEvent<T>` — 로그 항목 하나

`type`에 대한 정식 판별 유니온이며(독립적인 `type`/`data` 유니온이 아닙니다), 따라서 `switch (event.type)`이 캐스트 없이 `event.data`를 좁힙니다. `seq`는 로그에서 단조 증가하는 위치(`seq = log.length`)이고, `time`은 에포크 밀리초입니다.

```ts type-equiv
/** Sequence number of one existing event in a Session log. */
type SessionSeq = BrandedNumber<'SessionSeq'>
```

```ts type-equiv
/** A Session log gap, prefix length, or read offset, which may equal the event count. */
type SessionLogOffset = BrandedNumber<'SessionLogOffset'>
```

```ts type-equiv
/** Inclusive Session event watermark, or `-1` before any event exists. */
type SessionSeqCursor = SessionSeq | -1
```

```ts type-equiv
/** One existing Session event position, or explicit absence. */
type OptionalSessionSeq = SessionSeq | null
```

`SessionSeq(value)`와 `SessionLogOffset(value)`는 음이 아닌 안전한 정수만 허용하고 음의 0을 거부합니다. 직렬화된 숫자는 바꾸지 않으면서 컴파일 타임 브랜드를 추가합니다. 산술은 일반 `number`를 반환하므로 호출자는 의도한 역할에 맞게 생성자를 통해 다시 허용해야 합니다.

```ts type-equiv
/**
 * One immutable entry in the session log.
 *
 * A proper discriminated union over `type` (not independent `type`/`data`
 * unions), so `switch (event.type)` narrows `event.data` without casts.
 *
 * The {@link sourceEventSeqs} and {@link surfaceOp} fields are conditional:
 * they only exist on {@link SurfaceEventType} variants (`system/message`, `user/message`,
 * `assistant/message`, `tool/result`).
 * Non-surface events (boundary markers, attempts, errors) never carry
 * surface metadata — the compiler enforces this at `Session.append()`
 * call sites.
 */
type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    /** Monotonic sequence number within the session. */
    seq: SessionSeq
    /** Unix epoch milliseconds. */
    time: number
    data: SessionEventMap[K]
    /**
     * Marks an event a reader may safely skip when it does not recognize
     * `type`. Absent means required: a reader meeting an unrecognized type
     * without this marker MUST refuse to reconstruct the session instead of
     * silently dropping the event, because an unrecognized required event may
     * change how the rest of the log is interpreted. A writer sets `true` only
     * on purely informational records whose loss cannot affect reconstruction;
     * defaulting to required means a forgotten marker over-refuses (an
     * inconvenience) rather than silently resuming a gutted session.
     */
    ignorable?: true
  } & (K extends SurfaceEventType ? SurfaceIntent<K> : {
    surfaceOp?: never
    sourceEventSeqs?: never
  })
}[T]
```

`SessionEventType = keyof SessionEventMap`입니다. `SessionEventMap`이 선언 병합으로 확장 가능하므로 `SessionEvent`에 대한 switch는 `assertNever`를 쓰면 **안 됩니다**. 플러그인이 추가한 변형은 유효한 알 수 없는 값이므로, 알려진 case를 처리하고 `default`로 흘려보내세요.

모든 표면 이벤트는 `surfaceOp`를 요구하고, 알려진 로그 전용 이벤트는 두 표면 메타데이터 필드를 모두 금지합니다. 알 수 없거나 폐기된 무시 가능 엔벨로프는 불투명하게 남습니다. `assistant/message`는 제공자 스트림을 내장하고 `sourceEventSeqs`를 금지합니다. 시스템, 사용자, 도구 표면 이벤트는 출처 귀속이나 교체 커버리지가 필요할 때 앞선 고유 이벤트의 완전하고 비어 있지 않은 집합을 인용할 수 있습니다. `tool/result`는 그 메시지가 `isError: true`일 때만 `data.error`를 담을 수 있으며, 실패한 결과에서 실패 정체성은 선택 사항으로 남습니다.

## 표면 타입

메시지를 만드는 타입(`SurfaceEventType` — `system/message`, `developer/message`, `user/message`, `assistant/message`, `tool/result`)은 순서가 있는 파생 표면에 어떻게 합류하는지 선언하는 표면 메타데이터를 담습니다. `system/message`는 렌더링된 시스템 프롬프트를 담습니다. 루프는 첫 번째를 표면 노드 0으로 추가하고, 프롬프트가 바뀌면 정확히 최신 시스템 노드를 교체하거나 이력 내 라우트에서 새 노드를 추가합니다. 표면 폴드는 노드 0의 `system/message`를 덮는 다른 교체를 거부하며, 이후 시스템 노드는 압축 교체가 가릴 수 있는 일반 이력입니다. [세션 표면 Agent Note](../../.agents/notes/implemented/architecture/2026-06-18-session-surface.md)를 참고하세요.

### `SurfaceEventType` — 이벤트 타입 중 메시지를 만드는 부분 집합

```ts type-equiv
/**
 * The subset of {@link SessionEventType} values whose events produce LLM
 * messages and are eligible to appear on the ordered surface. Only these
 * event types may carry {@link SurfaceOp}; system, user, and tool events may also cite
 * earlier sources through {@link SessionEvent.sourceEventSeqs}.
 */
type SurfaceEventType =
  | 'system/message'
  | 'developer/message'
  | 'user/message'
  | 'assistant/message'
  | 'tool/result'
```

### `SurfaceOp` — 이벤트가 표면에 들어온 방식

```ts type-equiv
/**
 * How a session event entered the ordered surface. Only valid on
 * {@link SurfaceEventType} events.
 *
 * - `'append'`: added to the tail — normal path for user/assistant/tool
 *   messages.
 * - `{ op: 'replace', startSeq, endSeq }`: replaces surface nodes from `startSeq`
 *   (inclusive) through `endSeq` (inclusive) with this node. Both must exist as
 *   surface nodes in the current surface. `startSeq === endSeq` replaces a single
 *   node. The node's {@link SessionEvent.sourceEventSeqs} must include every
 *   shadowed surface node. Used by compaction; any surface-replacing producer
 *   may use it.
 */
type SurfaceOp =
  | 'append'
  | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }
```

`'append'`는 일반적인 꼬리 추가 경로입니다. `replace`는 정확히 `op`, `startSeq`, `endSeq`만 담으며 별칭이나 추가 키가 없습니다. 현재 표면 이벤트 시퀀스 사이의 양 끝을 포함한 구간을 가리고 그 자리에 새 이벤트를 삽입하며, 끝점이 같으면 항목 하나를 교체합니다. 끝점은 교체하는 이벤트보다 앞서야 하지만, 그 상대 순서는 숫자 시퀀스 순서가 아니라 표면 순서입니다.

### `SurfaceIntent` — `session.append()`의 매개변수

```ts type-equiv
/**
 * Surface placement and cited source-event seqs for {@link Session.append}. Required on
 * message-producing events and forbidden on log-only events.
 */
type SurfaceIntent<T extends SurfaceEventType = SurfaceEventType> = {
  surfaceOp: SurfaceOp
} & (T extends 'assistant/message' ? {
  /** Assistant messages embed their provider stream instead of citing source events. */
  sourceEventSeqs?: never
} : {
  /** Complete non-empty set of known earlier source-event seqs. */
  sourceEventSeqs?: SessionSeq[]
})
```

`SurfaceEventType` 이벤트에 필수입니다. 모든 메시지 생성 이벤트는 파생 모델 이력의 유일한 원천인 표면에 어떻게 합류하는지 선언해야 합니다. 사람이 보는 트랜스크립트는 다른 투영이며, 교체가 요약하는 범위를 표면이 의도적으로 가리므로 로그의 추가 출처 이벤트를 대신 읽습니다([dsh-session](../../packages/core/session/README.md)의 `isAppendSurfaceEvent`). 표면이 아닌 타입은 컴파일 타임에 이를 거부합니다.

`assistant/message`는 `sourceEventSeqs`를 담을 수 없으며, 그 `stream`이 정확한 제공자 증거를 소유합니다. 다른 표면 이벤트는 앞선 이벤트를 인용하지 않으면 필드를 생략하고, 인용하면 완전하고 비어 있지 않은 목록을 사용합니다.

<a id="plugin-owned-message-projections"></a>
### 플러그인 소유 메시지 투영

콘텐츠를 바꾸는 플러그인은 이벤트 선언에 `@messageProjection`을 표시하고 `ctx.sessions.registerMessageProjection()`으로 순수 정의를 등록합니다. Session은 커밋 전에 그 정의로 전체 결정을 검증하고, 불변 메시지 갱신을 적용하고, `contentGeneration`을 진행시킵니다. 복원과 분리 폴딩을 포함해 인터프리터가 없으면 거부하며, 사용된 정의를 언로드하면 캐시된 읽기가 차단됩니다. 분리 리더는 `foldSurface(events, projections)`에 명시적 정의를 전달하고 `deriveEventMessage()`로 `projectedMessages`를 적용합니다. 설치된 형식 카탈로그가 오프라인 리더용 1자 정의를 조립합니다. [이미지 오프로드 플러그인](compaction.ko.md#이미지-오프로드)이 이미지 전용 이벤트와 해석을 소유합니다.

```ts type-equiv
/** Readonly history immediately before a message-projection event. */
interface SessionMessageProjectionContext {
  /** Current message-producing event sequences in model-visible order. */
  nodes: readonly SessionSeq[]
  /** Contiguous event window; entries at or beyond the candidate seq are not committed inputs. */
  events: readonly SessionEvent[]
  /** Absolute sequence of the window's first event. */
  baseSeq: SessionLogOffset
  /** Previously projected messages keyed by their original event sequences. */
  messages: ReadonlyMap<SessionSeq, Message>
}
```

```ts type-equiv
/** Pure interpretation of one plugin-owned event that changes existing message content. */
interface SessionMessageProjection<T extends SessionEventType = SessionEventType> {
  /** Event interpreted by this definition; declare it with `@messageProjection` in SessionEventMap. */
  type: T
  /**
   * Validate the complete durable decision before returning any updates. Preserve
   * message identities and publish immutable copies without mutating the input.
   * @param event - candidate event, not yet applied to the supplied history.
   * @param context - history preceding this decision.
   * @returns changed current messages keyed by their original sequences.
   * @throws when the durable decision cannot be applied to this history.
   */
  project(event: SessionEvent<T>, context: SessionMessageProjectionContext): ReadonlyMap<SessionSeq, Message>
}
```

### `SessionSurface` — 라이브 읽기 전용 표면 투영

`Session.surface`는 세션의 안정적인 `SessionSurface` 뷰를 반환합니다. 같은 증분 관리자가 커밋 전에 추가 후보를 검증하고 커밋된 이벤트에서 이 투영을 진행시킵니다. 호출자는 멤버십과 교체 세대를 관찰할 수 있지만 검증을 호출할 수는 없습니다.

`SurfaceManager(log, baseSeq?, projections?)`는 대신 첫 이벤트의 절대 시퀀스가 `baseSeq`인 연속 로드 창을 폴드할 수 있습니다. 모든 이벤트는 그 절대 시퀀스 공간에서 연속으로 남으며, 창 머리를 가로지르는 교체는 선언된 범위가 없으므로 실패합니다.

```ts type-equiv
/** Readonly live projection of the message-producing session events. */
interface SessionSurface {
  /** Current surface event sequences in model-visible order. */
  readonly nodes: readonly SessionSeq[]
  /** Monotonic count of committed positional replacements. */
  readonly replaceGeneration: number
  /** Monotonic count of committed replacements and plugin-owned message changes. */
  readonly contentGeneration: number
}
```

### `SurfaceFoldReplacement`와 `SurfaceFoldResult` — 전체 표면 재생

`foldSurface(events, projections)`는 분리된 현재 이벤트 시퀀스와 각 선언된 교체 범위가 실제로 가린 시퀀스를 함께 반환합니다. 라이브 관리자는 교체 이력을 보관하지 않고 같은 전이를 사용합니다. 그 `replaceGeneration`은 커밋된 교체마다 증가하므로 증분 소비자가 순수 꼬리 성장과 재작성을 구분할 수 있습니다.

```ts type-equiv
/** One replacement operation observed while folding a session surface. */
interface SurfaceFoldReplacement {
  /** Seq of the event that replaced the prior surface range. */
  seq: SessionSeq
  /** Declared inclusive start seq of the replaced surface range. */
  start: SessionSeq
  /** Declared inclusive end seq of the replaced surface range. */
  end: SessionSeq
  /** Actual surface entries removed by the operation, in surface order. */
  shadowedSeqs: SessionSeq[]
}
```

```ts type-equiv
/** Complete result of replaying the surface operations in a session log. */
interface SurfaceFoldResult {
  /** Current surface event sequences in model-visible order. */
  nodes: SessionSeq[]
  /** Replacement operations in event order. */
  replacements: SurfaceFoldReplacement[]
  /** Immutable projected messages, keyed by their original event sequences. */
  projectedMessages: ReadonlyMap<SessionSeq, Message>
}
```

## `Session` 공개 API

본문을 제거한 선언은 일반 클래스의 분리 팩토리, 상태 접근자, append 메서드, 이력 투영을 소스와 동기화해 유지합니다. Store 작업은 생성된 [`ctx.sessions` 섹션](#ctxsessions--sessionstore)에 남습니다.

```ts public-api
/**
 * An event-sourced session: an append-only log of {@link SessionEvent}s.
 *
 * Plain class (not a Service) — create live instances via
 * `ctx.sessions.create()` and detached instances via {@link create}.
 * Seeding with an existing event log replays/forks a session.
 * @typert object
 */
declare class Session {
  /** The ordered surface over this session's event log. */
  get surface(): SessionSurface;
  /**
   * Detached, deep-frozen creation metadata (format version, cwd, lineage,
   * and whether fork history exists). Supplied by the store via `ctx.sessions.create()`. When a
   * `Session` is created without a store-owned header, a minimal header is
   * synthesized (stamped with the current {@link SESSION_FORMAT_VERSION}) so
   * `session.header` is always present. Kept out of the event log — it is a
   * storage concern, not replayable conversation state.
   */
  readonly header: SessionHeader;
  /** Number of leading events inherited from this Session's fork parent. */
  readonly inheritedEventCount: SessionLogOffset;
  /** The session identity, derived from its durable header's single copy. */
  get id(): SessionId;
  /**
   * The constructor seed length (0 without one), before any marker appended
   * during construction. Seed events never publish on `session/event`. A
   * marker appended before the store attaches occupies this seq without
   * publishing either; otherwise this seq is available for the next append.
   *
   * This in-process offset is not persisted. A fork seed can already contain
   * the child's inherited marker and synthetic closers, so its child-owned
   * history starts at {@link inheritedEventCount}, before this offset. A
   * resumed Session's seed contains its full stored log, while its inherited
   * count keeps the durable fork cut. Consumers needing complete canonical
   * history start at seq 0.
   */
  readonly firstLiveSeq: SessionLogOffset;
  /**
   * First event produced for this object lifecycle. A new fork includes its
   * child-owned seed marker and closers; a restored Session starts after its
   * complete stored prefix. This in-process capture offset is not persisted.
   */
  readonly firstLifecycleSeq: SessionLogOffset;

  /**
   * Create a detached session by validating and snapshotting borrowed seed
   * events and storage metadata.
   * @param id - session identity.
   * @param seed - optional borrowed replay or fork events.
   * @param header - optional borrowed storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length for a seeded header.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static create(
    id: SessionId,
    seed?: readonly SessionEvent[],
    header?: SessionHeader,
    inheritedEventCount?: SessionLogOffset,
    projections?: readonly SessionMessageProjection[],
    ): Session;
  /**
   * Restore a detached session by adopting an independently owned or deeply frozen seed.
   * Runtime-required event fields, event envelopes, sequence continuity, surface
   * transitions, and header fields are validated without copying or freezing events.
   * Embedded Assistant streams remain opaque until a stream consumer or storage
   * verifier reads them.
   * @param id - restored session identity.
   * @param seed - independently owned or deeply frozen events.
   * @param header - independently owned storage metadata.
   * @param inheritedEventCount - exact fork-inherited prefix length decoded from storage.
   * @param eventState - aliasing state carried from the operation that produced the seed.
   * @param projections - pure interpreters for plugin-owned message changes.
   * @returns a restored detached session.
   * @throws when a seed event requires a missing message interpreter or fails validation.
   */
  static fromRestore(
    id: SessionId,
    seed: readonly SessionEvent[],
    header: SessionHeader,
    inheritedEventCount: SessionLogOffset,
    eventState: SessionSeedEventState,
    projections?: readonly SessionMessageProjection[],
    ): Session;
  /**
   * Return the immutable event stored at one exact sequence number.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param seq - event sequence number.
   * @returns the accepted event, or undefined when the log does not contain it.
   */
  eventAt(seq: SessionSeq): SessionEvent | undefined;
  /**
   * Materialize an immutable snapshot of a half-open event sequence range.
   * A full current snapshot is reused until the next append; every previously
   * returned snapshot remains stable after later appends.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @param fromSeq - non-negative inclusive sequence number; defaults to the log start.
   * @param toSeqExclusive - non-negative exclusive sequence number; defaults to the current end.
   * @returns a frozen array of the selected deeply frozen events.
   */
  snapshotEvents(
    fromSeq: SessionLogOffset = SessionLogOffset(0),
    toSeqExclusive: SessionLogOffset = this.seq,
    ): readonly SessionEvent[];
  /**
   * Return this Session's events after its fork-inherited prefix.
   * @deprecated Existing logic may remain unmigrated for now, but new calls are prohibited.
   * See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).
   * @returns a fresh array containing child-owned events in log order.
   */
  ownEvents(): readonly SessionEvent[];
  /**
   * Whether one existing event position is outside the fork-inherited prefix.
   * @param seq - event position in this Session.
   * @returns true when the event belongs to this Session rather than its parent.
   */
  isOwnSeq(seq: SessionSeq): boolean;
  /** The next event's sequence number — always the log length (the `seq = log.length` contiguity contract). */
  get seq(): SessionLogOffset;
  /**
   * Append one typed event to the log and synchronously notify observers via
   * the store-owned, module-private publication hooks. The hot path never blocks
   * on I/O — persistence plugins buffer asynchronously. Once the event enters
   * the log, the append is committed: observer failures are logged and
   * contained per listener, so they do not change the return value or prevent
   * later listeners from observing the same accepted event.
   * Independent Sessions append without notifying store observers. Once a store
   * prepares or enters the instance, writes require a completed creation
   * announcement and remain disabled after removal.
   *
   * @param type - The event type (key of {@link SessionEventMap}).
   * @param data - The event payload; must be JSON-serializable.
   * @param opts - Surface metadata: `surfaceOp` controls how the event enters
   *   the ordered surface; `sourceEventSeqs` lists the seq numbers of earlier
   *   events this one derives from. REQUIRED for
   *   {@link SurfaceEventType} events (every message-producing event must
   *   declare how it joins the surface, the sole source of derived model
   *   history) and
   *   rejected by the compiler for non-surface types like `turn/start` or
   *   `assistant/attempt`. Assistant messages embed their exact provider
   *   stream and cannot cite top-level source events.
   * @returns the logged event — its assigned `seq`/`time` plus the SNAPSHOT of
   *   `data` that entered the log, so reading `event.data` back sees the logged
   *   value, never the caller's still-mutable input.
   * @throws if a store-owned Session is unentered or its creation announcement
   *   has not completed, or if `data` or surface
   *   metadata is not losslessly JSON-serializable
   *   (BigInt, function, symbol, undefined, negative zero, non-finite number,
   *   circular reference, sparse array, or an exotic object such as
   *   Map/Set/Date/class instance), or when the candidate violates the
   *   request-header empty-field or tool-error consistency rules, or the
   *   canonical surface contract (marker shape and eligibility, unique
   *   earlier source-event references, positional replacement validity, and complete
   *   shadowed-node coverage). One iterative pass reads, validates, and
   *   copies each nested value once, so a stateful getter cannot supply one value
   *   to validation and another to storage. The event log is the durable source
   *   of truth, so a bad event fails at the append site rather than later during
   *   a backend flush. A synchronous internal dispatch validation failure or an
   *   append reentered while this acceptance/publication boundary is open also
   *   rejects before the log changes.
   */
  append<T extends SessionEventType>(
    type: T,
    data: SessionEventMap[T],
    ...opts: T extends SurfaceEventType ? [opts: SurfaceIntent<T>] : []
    ): SessionEvent<T>;
  /**
   * The {@link EpochHeader} in force after the log's last header event — the
   * header the NEXT request will be compared against — or undefined before
   * the first `request/header` snapshot. The live, incrementally-maintained
   * form of `foldRequestHeader(session.snapshotEvents())`: each header event is folded
   * once, when first seen, so a per-step read costs O(new events).
   * @returns the folded header, or undefined when no header event exists yet.
   */
  requestHeader(): EpochHeader | undefined;
  /**
   * Return the latest resolved route metadata, or `undefined` before the first
   * `request/context` event. Each event is folded once.
   * @returns the latest immutable route metadata.
   */
  requestContext(): RequestContext | undefined;
  /**
   * Fold unseen committed events into capability-independent tool history.
   * Initial access reconstructs inherited history; later reads consume only new events.
   * @returns an immutable snapshot for LLM request projection, including historical addition definitions.
   */
  toolHistory(): ToolHistory;
  /**
   * Derive the LLM message history by walking the ordered sequences of
   * message-producing events maintained by `surfaceOp` markers. The
   * surface is the single source of derived history: every message-producing
   * append records its `surfaceOp`, so a raw event with no marker (a chunk, a
   * turn boundary) is correctly absent, and a compaction `replace` deletes the
   * shadowed nodes from the derivation. The projection rules are
   * {@link deriveEventMessage}, with logged message projections applied
   * without changing node membership or message identity.
   *
   * CACHED: pure tail growth costs O(new nodes); a replacement or message projection
   * ({@link SessionSurface.contentGeneration}) rebuilds. The returned array is
   * a fresh snapshot per call (later appends never grow an array a caller
   * already holds); the `Message` objects in it are SHARED and **deep-frozen**.
   * Unchanged content reuses frozen event data; projected blocks are frozen
   * derived copies. Consumers cannot mutate the log through either form.
   * @returns a fresh array of the shared, frozen derived history.
   */
  deriveMessages(): Message[];
  /**
   * Project one event with all committed message projections applied.
   * The original durable event remains unchanged.
   * @param event - the event to project.
   * @returns the derived message, or null when the event produces none.
   */
  deriveEventMessage(event: SessionEvent): Message | null;
}
```

## 파생 이력: `deriveMessages()`와 `deriveEventMessage()`

`Session.deriveMessages()`는 이벤트 로그를 모델이 보는 `Message[]`로 투영합니다. 캐시되고(각 표면 노드는 처음 볼 때 한 번 투영되며, 표면 재작성은 다시 만듭니다), 동결됩니다(공유되고 깊이 동결된 메시지 위에서 호출마다 새 배열이므로 투영을 통해 기록된 이력을 변경하는 것은 표현 불가능합니다). `deriveEventMessage(event)`는 폴드가 적용하는 노드별 순수 함수이며, 공개되어 외부 재구성기도 완전히 같은 규칙으로 로그 접두사를 투영하고 캐시와 어긋날 수 없습니다. 투영 규칙은 다음과 같습니다:

- `user/message` → 정확한 `content`를 담는 사용자 메시지. 선택적 엔벨로프는 로그 전용 표시 메타데이터로 남습니다.
- `assistant/message` → 이를 생성한 제공자와 모델, 선택적 어댑터 전용 재생 상태를 담는 어시스턴트 메시지. 내장된 압축 스트림은 두 번째 메시지가 아니라 재생, 사용량, UI 증거입니다. **빈 콘텐츠** `assistant/message`도 건너뜁니다. 콘텐츠 없이 잘린 max-tokens 단계도 스트림, 사용량, 제공자, 모델을 담기 위해 `assistant/message`를 기록하지만, 콘텐츠 없는 어시스턴트 턴은 제공자 트랜스크립트에 들어가면 안 됩니다.
- `tool/result` → 결과 콘텐츠와 도구 호출 정체성을 담는 일급 도구 역할 메시지.
- `user/message`(주입된 컨텍스트, 즉 `user`가 아닌 출처) → 연대순 위치에서 `content`를 그대로 담는 사용자 역할 메시지. 타입이 지정된 출처가 생산자를 지목하고 생산자별 데이터를 담습니다.

그 밖의 모든 것(`turn/*`, `step/*`, `assistant/attempt`, 플러그인 소유 `llm/retry`)은 구조적이며 메시지로 투영되지 않습니다. 토큰 계산은 각 `assistant/message`나 `assistant/attempt`에서 내장 스트림을 펼치며, 메시지의 최상위 `usage`는 존재할 때 커밋된 메시지의 권위로 남습니다. 따라서 실패한 모델 요청 시도는 어시스턴트 메시지를 꾸며내지 않고 제공자 사용량을 유지합니다. 현재 논리 검증은 제공자/모델을 생략한 요청 헤더와 어시스턴트 메시지를 라우트를 추측하는 대신 거부하며, 지원되는 과거 표현은 현재 Session이 존재하기 전에 인접 형식 경계에서 정규화되고 검증됩니다.

## 라이브 세션 fork API

`ctx.sessions.create(id, { seed, meta })`는 저수준 재생/fork 원시 연산입니다. 일반적인 라이브 세션 fork를 위해 `SessionStore`는 하나의 정책 API를 노출합니다:

- `fork(source, boundary?, childSessionId?)`는 라이브 `Session` 객체나 라이브 `SessionId`를 받아, 양 끝을 포함하는 `SessionSeq` 경계(기본값: 현재 마지막 이벤트)까지 소스 이벤트를 선택하고, 열린 꼬리를 닫은 뒤, 시드 이벤트를 깊이 복제하고 `isSeeded: true`, 정확한 `inheritedEventCount`, 상속된 `cwd`를 가지며 `parentSession`이 없는 독립 라이브 세션을 만듭니다.

명시적 `boundary`를 쓰면 소스에 더 새 이벤트가 있거나 현재 턴이 열려 있어도 호출자가 턴 사이의 안정적인 위치에서 fork할 수 있습니다. 예를 들어 이전 `turn/end`나 이후의 독립 로그 전용 이벤트에서 가능합니다. API는 열린 턴 안에서 끝나는 접두사를 조용히 자르지 않고 거부합니다. `dsh-subagent-fork-in-process`는 도구 시점 위임이 보통 부모 턴이 열린 상태에서 시작하므로 완료된 접두사 자르기를 유지합니다. 일반적인 세션 분기는 요청한 경계를 명시해야 합니다.

## 턴이 끝난 이유: `TurnEndReasonMap`

`turn/start`에는 트리거 필드가 없습니다. 진입한 `user/message` 배치가 각 단계에 무엇이 들어왔는지 기록하고, `llm/retry`가 요청 복구를 기록하며, 유휴 주입은 깨우는 전달이 이후 pre-step에 도달할 때까지 대기로 남습니다. 라이브 턴은 드라이버를 멈춘 타입 지정 [`AgentCancelCause`](core.ko.md#에이전트-핸들)를 유지하고, 영속은 호출자를 저장하지 않은 지원되는 거친 취소 기록을 가져올 때만 추가 `{ kind: 'legacy' }` 원인을 사용합니다.

```ts type-equiv
/** Durable cancellation cause, including imports whose original coarse record carried no cause. */
type TurnEndCancelCause = AgentCancelCause | { readonly kind: 'legacy' }
```

```ts type-equiv
/**
 * Why a turn ended. Merge-extensible sum type.
 */
interface TurnEndReasonMap {
  completed: { kind: 'completed' }
  /** A cancellation request interrupted the live turn. */
  aborted: { kind: 'aborted'; reason: TurnEndCancelCause }

  blocked: { kind: 'blocked' }
  /**
   * The turn failed. `error` is always a structured failure: the `LlmError`
   * facts verbatim, or `{ message: errorChain(error), code }` flattened from
   * any other error, where `code` is `TOOL_ACTIVATION_FAILED` for a failed
   * tool condition and `UNKNOWN` otherwise.
   */
  error: { kind: 'error'; error: LlmFailure }
  /** At least one step reached its output-token ceiling, even if a plugin continued the turn. */
  'max-tokens': { kind: 'max-tokens' }
  /**
   * A crash-orphaned turn was closed after the fact: agent-loop resume appends
   * this closer for a stored log whose last turn never ended, and session-query
   * synthesizes it on cold reads. The loop never emits this marker live, and
   * the events recorded before the crash remain intact.
   */
  interrupted: { kind: 'interrupted' }
  /**
   * Fork-seed construction closed a turn that was still open at the fork
   * boundary in the source session. Only fork seeds carry this marker — the
   * loop never emits it — and the source events before the boundary remain
   * intact in the child.
   */
  forked: { kind: 'forked' }
}
```

`max-tokens`는 같은 이름의 모델 호출 `FinishReason`을 그대로 반영합니다. 턴에 `max-tokens` 단계가 하나라도 있으면 턴 전체가 `completed`가 아니라 `max-tokens`로 끝나므로(잘린 사실이 이후 계속보다 우선합니다), 소비자는 깨끗한 종료와 잘린 종료를 구분할 수 있습니다. 취소와 오류는 별개 결과로 남습니다. 루프는 `interrupted`도 `forked`도 라이브로 내보내지 않습니다. 크래시 복구가 `interrupted`를 합성하고([persistence.md](persistence.ko.md) 참조), fork 시드 구성이 `forked`를 합성합니다. 이 맵은 선언 병합으로 확장 가능합니다.

## 실행 인클로저(enclosure)와 독립 이벤트

턴은 전체 세션 로그가 아니라 모델 루프 실행 하나를 감쌉니다. AgentLoop는 턴 안에서 pre-step 배치에 진입한 `user/message` 이벤트만 주입된 것으로 기록하며, 플러그인 소유 로그 전용 이벤트는 `turn/end`와 다음 `turn/start` 사이에 나타날 수 있고 턴 번호를 올리지 않은 채 이벤트 seq를 소비합니다. 영속은 수용된 모든 연속 이벤트를 경계가 있는 영속 배치로 받아들이고, 크래시 복구는 실제로 열린 꼬리 턴만 닫습니다. 즉시 영속 배리어가 필요한 생산자는 `ctx.sessions.flush(session)`을 명시적으로 await합니다.

선언 병합으로 확장 가능한 이벤트 관계는 이를 선언한 플러그인에 속하므로, 코어는 열린 턴이 없다는 이유만으로 알 수 없는 이벤트를 거부하지 않습니다. [독립 이벤트 결정](../../.agents/notes/implemented/simplification/2026-07-28-remove-synthetic-log-only-turns.md)을 참고하세요.

## 끝 시드 경계: `session/end-seed`

`buildForkSeed`는 합성 fork 종결자를 추가하기 전에 정확한 상속 접두사 절단 지점에 `session/end-seed { inherited: true }`를 추가합니다. `Session` 생성자는 그 준비된 마커를 유지하거나, 상속 접두사만 받으면 하나를 추가합니다. 복원은 태그된 마커를 유지하고, 완전히 저장된 시드가 이미 마커로 끝나지 않을 때만 일반 `session/end-seed {}`를 추가합니다. 두 형태 모두 로그 전용이며 메시지를 만들지 않고, 생성자와 `buildForkSeed`만 이를 만들 수 있습니다.

fork 계보를 찾으려면 페이로드가 `inherited: true`를 담은 **마지막** 마커를 찾으세요. 현재 형식 디코딩은 `SessionHeader.isSeeded`가 true일 때 정확히 이를 요구하고 그 seq에서 `inheritedEventCount`를 도출합니다. 수명 주기 소유권을 찾으려면 두 형태 중 마지막 `session/end-seed`를 찾으세요. 어떤 마커로든 이미 끝나는 시드를 다시 열면 일반 마커를 또 추가하지 않습니다.

이 경계가 존재하는 이유는 시드 이력과 라이브 작업이 그 밖의 경우 바이트 단위로 동일해서, 독립적인 열기/닫기 브래킷(bracket)을 소유한 어떤 플러그인도 이를 구분할 수 없기 때문입니다. 짝이 없는 `compaction/start`는 작성자가 압축 도중 크래시한 경우와 지금 압축 중인 경우가 똑같이 읽힙니다. `session/end-seed` 앞의 여는 마커는 생성자 시드에서 온 것이며 무엇이 끝냈든(크래시, 성공한 프로세스, 아직 실행 중인 부모에서의 fork) 종료된 수명 주기에 속하므로, 소유자는 이를 죽은 것으로 취급할 수 있습니다. 이는 *이* 세션이 상속한 브래킷만을 포함합니다. 같은 이력을 두고 열린 브래킷을 가진 동시 라이브 세션은 자기 경계가 다른 곳에 있으므로, 동시 작성자를 허용하려면 로그를 넘어서는 생존 신호가 필요합니다. 코어는 경계를 쓰고 그로부터 아무것도 읽지 않습니다. 브래킷 어휘는 소유 플러그인에 남으므로, 크래시 복구가 turn/step/tool 경계를 닫고 `compaction/*`는 절대 닫지 않습니다.

사용자 활동을 기준으로 세션을 정렬하는 소비자는 이 경계를 제외합니다. 세션을 단순히 조회하는 것은 작업 활동이 아니므로, 로그의 마지막 타임스탬프로 정렬하면 단순히 열어본 모든 세션이 맨 위로 올라오게 됩니다.

## 플러그인이 기여한 로그 전용 이벤트

플러그인은 추가 `SessionEventMap` 타입을 선언 병합할 수 있습니다. 이것들은 **로그 전용**이며 `SurfaceEventType`이 **아닙니다**(`surfaceOp`를 담지 않고 파생 이력에 아무것도 기여하지 않습니다). 소유자가 열린 실행 턴에 속하는지 턴 사이에 있을 수 있는지 결정합니다. 생성된 [영속 로그 이벤트 카탈로그](../persistence-catalog.ko.md)가 모든 코어 및 플러그인 기여 이벤트를 열거하며, 압축 seam의 `compaction/*` 시맨틱은 [compaction.md](compaction.ko.md)에서 논의합니다.

하나의 플러그인 소유 계열에서 여러 이벤트가 하나의 Web Client Conversation Node로 조립될 때, 그 계열의 모든 시작, 갱신, 결과, 리소스, 중단 이벤트는 같은 안정적인 비즈니스 id를 담거나 독립적으로 도출합니다. 이 요구는 상관된 Node 계열에 적용되며 모든 Session 이벤트에 적용되지는 않습니다. 덕분에 클라이언트는 인접성으로 추측하거나 이력을 스캔하지 않고 각 이벤트를 묶을 수 있습니다. [Conversation 하위 시스템](conversation.ko.md)을 참고하세요.

훅 브리지의 `hook/invoked` / `hook/result` 쌍(`@deepseek-ai/dsh-hook-protocol` 제공)은 `handlerId`로 상관됩니다. `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`은 루프의 열린 턴 안에서 발생하므로 그 `hook/*` 기록은 구조적으로 턴에 포함됩니다. `SessionStart`는 턴 1 이전에 실행되므로 `hook/*` 기록을 받지 않으며, 그 컨텍스트는 깨우는 전달이 턴을 열 때까지 인박스에 대기로 남습니다.

### 플러그인 기록

실험적 패키지는 `PluginRecordMap`에 플러그인 소유 상태를 선언합니다. `appendPluginRecord()`는 각 선언으로 이름과 페이로드 타입을 지정하고, `plugin:` 네임스페이스에 `ignorable: true`로 표시된 이벤트를 추가합니다. `pluginRecordOf()`는 현재 선언과 무관하게 알 수 없는 페이로드를 가진 저장된 기록을 읽습니다. [실험적 영속 카탈로그](../experimental-persistence-catalog.ko.md)가 현재 선언을 나열합니다. 호출자 제한, 보존, 읽기 경로는 [패키지 README](../../packages/core/session/README.md#write-experimental-plugin-records)가 소유합니다.

```ts type-equiv
/**
 * Event type of an experimental plugin record: `plugin:` followed by
 * slash-separated segments of lowercase letters, digits, `.`, `_`, and `-`,
 * each starting with a letter or digit. A record type is never a
 * {@link SessionEventMap} member.
 */
type PluginRecordType = `plugin:${string}`
```

```ts type-equiv
/**
 * Payloads written by experimental packages, keyed by their `plugin:` record
 * names. Packages augment this map to type writes and enter the current plugin
 * record catalog; these declarations do not enter {@link SessionEventMap} or
 * released persistence schemas. Stored records still require owner validation.
 */
interface PluginRecordMap {}
```

```ts type-equiv
/**
 * One committed experimental plugin record, read from the log by
 * `pluginRecordOf`. The record's owner validates `data` before use, because a
 * restored record carries whatever JSON an earlier build of its owner wrote,
 * or a V3 event that a format migration renamed into the `plugin:` namespace held.
 */
interface PluginRecord {
  /** The record type, chosen by the owning plugin. */
  readonly type: PluginRecordType
  /** The record's position in the Session log. */
  readonly seq: SessionSeq
  /** Unix epoch milliseconds at append. */
  readonly time: number
  /** The JSON payload as committed. */
  readonly data: unknown
}
```

## 영속 계약

영속 백엔드가 의존하는 규칙입니다. 영속 로그는 모든 이벤트를 무손실로 보존하고, 모든 어시스턴트 시도는 내장 압축 스트림이 원래의 시간 기록 청크를 보존하는 하나의 `assistant/message` 또는 `assistant/attempt`입니다. `seq`는 이러한 확정(settlement)과 모든 인터리브 이벤트에 걸쳐 연속으로 유지됩니다. 백엔드는 핸들의 `read()`가 추가된 이벤트를 정확히 반환하는 한 이벤트 배치에 자체 저장 프레이밍을 선택할 수 있으며, 현재 JSONL은 이벤트당 한 행을 씁니다([persistence.md](persistence.ko.md) 참조). 모든 `event.data`는 JSON 직렬화 가능해야 합니다. `Session.append`가 소스에서 이를 강제하므로(직렬화 불가능한 데이터에서 throw) 잘못된 이벤트는 로그에 들어가지 않고 `session.snapshotEvents()`는 항상 백엔드가 영속할 수 있는 것과 같습니다. 직렬화 불가능한 데이터를 담거나 코어 실행 중첩을 깨거나 소유자가 선언한 관계를 위반하는 이벤트 타입 추가는 디스크 형식에 대한 호환성 깨는 변경입니다.

이 계약을 소비하는 백엔드는 [persistence.md](persistence.ko.md)에 있습니다.

## 원격 카탈로그와 워크스페이스 열기

`ModelCatalog`는 `session/modelCatalog`가 반환하는 Host 세대 모델 디렉터리입니다. 배포 기본값, 라우팅 가능한 제공자 id, 성공한 제공자 그룹, 격리된 제공자 실패를 담습니다. 하나의 Session에서 파생되지 않으며 Session 프로젝션과 별개로 남습니다.

`SessionOpenWorkspacePathRequest`는 절대 경로나 워크스페이스 기준으로 해석된 `path`를 담고, 선택적 `action: "reveal"`은 기본 애플리케이션 열기 대신 파일 관리자 탐색을 선택합니다. `SessionOpenWorkspacePathValue`는 Host가 네이티브 핸드오프를 수용했음을 확인합니다. Session을 인지하는 Client는 현재 Session cwd를 알 때 상대 경로를 그 기준으로 해석하고, 컨트롤러는 경로를 그대로 열기 담당자에게 넘기며 잘못된 요청, 취소, 열기 실패를 Session Remote 오류 어휘로 보고합니다.

선택적 `application`은 시스템 기본값을 바꾸지 않고 등록된 파일 핸들러를 선택하며, `workspacePathApplications({ path })`는 Host 경로 검증 후 현재 핸들러, 이름, 아이콘, 기본 선택을 반환합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessioncontroller--sessioncontroller"></a>

### `ctx.sessionController` — `SessionController`

Host service backing the generated `ctx.remote.session` namespace.

```ts cordis-catalog
/**
 * Resolve or resume one ordinary Session for another Host API domain.
 * @param sessionId - Session identity whose Agent owns the operation.
 * @returns the live Agent or the stable Session-domain failure.
 */
resolveAgent(sessionId: SessionId): Promise<ApiSessionAgentResult>

/**
 * Read all visible Session rows without resuming an Agent.
 * @param _request - reserved empty list request.
 * @param signal - cancellation for persistence reads and summary generation.
 * @returns visible Session summaries ordered by activity.
 */
@Remote('list') async list(_request: SessionListRequest, signal: AbortSignal): Promise<SessionListValue>

/**
 * Search visible Session content without resuming an Agent. A non-owner
 * receives only the hits whose Session `allows()` admits; `hasMore`
 * describes the bounded result before that filtering.
 * @param request - literal message-content query.
 * @param signal - cancellation for list and search reads.
 * @returns authorized bounded Session search results.
 */
@Remote('search') async search(request: SessionSearchRequest, signal: AbortSignal): Promise<SessionSearchValue>

/**
 * Create one ordinary Session for a new conversation, reusing the named blank Session while it is reusable.
 * @param request - optional blank Session to reuse, location, and Agent preset.
 * @returns the created or reused Session identity and its preset when configured.
 */
@Remote('create') create(request: SessionCreateRequest): Promise<SessionCreateValue>

/**
 * Select one Session-local model after explicitly resuming the Session; save the default in the background.
 * @param request - Session identity and requested model selection.
 * @returns the normalized selection installed for the Session, without waiting for default persistence.
 */
@Remote('selectModel') selectModel(request: SessionSelectModelRequest): Promise<SessionSelectModelValue>

/**
 * Select the first available account model after login when no provider API key is configured.
 * @returns after saving the first available model or retaining the existing default.
 */
@Remote async initializeDefaultModel(): Promise<void>

/**
 * Describe every currently routable model for Host-generation selectors.
 * @returns provider-grouped models, the deployment default, and isolated provider failures.
 */
@Remote('modelCatalog') modelCatalog(): Promise<ModelCatalog>

/**
 * Report whether this deployment can hand a Session workspace path to a native desktop.
 * @returns true when the matching open operation is available.
 */
@Remote canOpenWorkspacePath(): boolean

/**
 * Describe the serving desktop for authenticated file-action routes.
 * @returns Host name, configured availability, and platform-specific file-manager behavior.
 */
workspaceDesktop(): { name: string; available: boolean; fileManager: 'finder' | 'explorer' | 'directory' | null }

/**
 * Verify one path through the composed filesystem and open it on the Host desktop.
 * @param request - path after best-effort Session workspace resolution.
 * @param signal - caller lifetime; abort terminates the native command.
 * @returns confirmation after the native opener accepts the path.
 * @throws RemoteError when the request is invalid, has no verified Host mapping, is cancelled, or the opener fails.
 */
@Remote('openWorkspacePath') async openWorkspacePath( request: SessionOpenWorkspacePathRequest, signal: AbortSignal, ): Promise<SessionOpenWorkspacePathValue>

/**
 * Query current file handlers on the serving desktop without activating an Agent.
 * @param request - file path in Host filesystem syntax.
 * @param signal - caller lifetime, propagated to filesystem and desktop queries.
 * @returns OS application names, icons, and default selection; empty when desktop opening is unavailable.
 * @throws RemoteError when the path is invalid, the query is cancelled, or native discovery fails.
 */
@Remote('workspacePathApplications') async workspacePathApplications( request: { readonly path: string }, signal: AbortSignal, ): Promise<readonly SessionWorkspacePathApplication[]>

/**
 * Rename one Session after explicitly resuming it.
 * @param request - Session identity and proposed title.
 * @returns the accepted title and durable event sequence.
 */
@Remote('rename') rename(request: SessionRenameRequest): Promise<SessionRenameValue>

/**
 * Fork one cold-readable exact event prefix into a new Session. An omitted
 * boundary selects the latest completed-turn prefix; an open cut receives
 * synthetic fork closers.
 * @param request - source Session, optional exact inclusive event boundary, and migration preflight choice.
 * @returns the new Session identity.
 */
@Remote('fork') async fork(request: SessionForkRequest): Promise<SessionForkValue>

/**
 * Admit one prompt after explicitly resuming its Session.
 * @param request - Session identity, prompt content, source metadata, and delivery mode.
 * @param signal - caller cancellation before prompt admission begins.
 * @returns acknowledgement that the Agent accepted the prompt.
 */
@Remote('prompt') async prompt(request: SessionPromptRequest, signal: AbortSignal): Promise<SessionPromptValue>

/**
 * Read one image proven reachable from the addressed Session log.
 * @param request - Session and attachment identities used for authorization.
 * @returns the durable attachment reference and base64-encoded bytes.
 */
@Remote('attachment') attachment(request: SessionAttachmentRequest): Promise<SessionAttachmentValue>

/**
 * Mutate one still-pending queue occurrence, resuming a cold Agent first.
 * @param request - Session, queue item, and requested mutation.
 * @returns acknowledgement that the queue mutation was applied.
 */
@Remote('updateQueue') updateQueue(request: SessionUpdateQueueRequest): Promise<SessionUpdateQueueValue>

/**
 * Cancel one active Agent turn without dropping its pending inbox.
 * @param request - Session whose active Agent turn is cancelled.
 * @returns acknowledgement that cancellation was requested.
 */
@Remote('cancel') cancel(request: SessionCancelRequest): SessionCancelValue

/**
 * Read one cold-safe, message-aligned Session history page.
 * @param request - durable address, backward cursor, and page budget.
 * @param signal - cancellation for persistence reads.
 * @returns one chronological page.
 */
@Remote('page') page(request: SessionPageRequest, signal: AbortSignal): Promise<SessionPage>

/**
 * Follow one Session log from its opening or resume cursor.
 * @param request - durable address and last committed sequence already held by the caller.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns a complete opening snapshot followed by gap-free durable event
 *   frames and optional cursorless assistant-stream frames.
 */
@Remote({ mode: 'stream' }) follow(request: SessionFollowRequest, signal: AbortSignal): AsyncIterable<SessionFollowFrame>

/**
 * Read exact projections, returning cached hints only when migration is required.
 * @param request - Session whose current values are required.
 * @param signal - cancellation for the Session read.
 * @returns a sequenced baseline, cached hints when migration is deferred, or null when absent.
 */
@Remote('projections') async projections(request: SessionProjectionsRequest, signal: AbortSignal): Promise<SessionProjectionsValue>

/**
 * Stream a complete live-control baseline followed by replacement frames.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns one complete baseline followed by live replacement frames.
 */
@Remote({ mode: 'stream' }) async *control(signal: AbortSignal): AsyncIterable<SessionControlFrame>
```

Types: [SessionId](core.ko.md) · [SessionSearchRequest](session-query.ko.md)

Source: [`packages/api/session-controller/src/index.ts`](../../packages/api/session-controller/src/index.ts)

<a id="ctxsessions--sessionstore"></a>

### `ctx.sessions` — `SessionStore`

In-memory session store (`ctx.sessions`).

Persistence is intentionally not implemented here — the agent lifecycle attaches a session-log writer to each published session's write handle; a session published outside that lifecycle persists nothing.

```ts cordis-catalog
/**
 * Register one event interpreter for live creation, restore, and fork.
 * Disposing the contribution makes sessions that used it refuse further derivation.
 * @param projection - pure definition owned by the event's plugin.
 * @returns the fiber-owned disposer.
 * @throws when another definition already owns this event type.
 */
registerMessageProjection(projection: SessionMessageProjection): () => Promise<void>

/**
 * Create a session owned by the calling fiber: disposing that fiber stops
 * event notification and removes the session from the store. `options.seed`
 * populates the session with a copy of those events (replay/fork);
 * `options.meta` attaches creation metadata (validated absolute `cwd`, seed
 * and parent lineage, and delegation depth) as the immutable
 * {@link SessionHeader} (the store fills `version`/`id`/`createdAt`).
 *
 * For an agent whose session must be torn down IN ORDER with its loop (so the
 * loop's final events are published before the store attachment ends), do NOT use this
 * — fold the session lifecycle into the agent's own effect via
 * {@link prepare} + {@link enter} + {@link announce} (see
 * `dsh-agent-loop`'s creation transaction).
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header.
 * @returns the live session, already entered and announced.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path (storage backends key directories off it).
 */
create(id?: SessionId, options?: CreateSessionOptions): Session

/**
 * Build a session WITHOUT entering it into the store — validate the id/cwd and
 * construct the {@link Session} (with its immutable {@link SessionHeader}).
 * Pairs with {@link enter} + {@link announce}: a caller that owns a composite
 * `ctx.effect` (the agent factory) folds the session lifecycle into that ONE
 * effect so a fiber unload tears the session + agent down as a single ORDERED
 * chain rather than as racing sibling effects — which would remove the publication hooks
 * before the driver's closing events commit, dropping them.
 *
 * @param id - the session id; omitted, the store mints `session-<n>`.
 * @param options - seed events and/or creation metadata for the header. With
 *   `eventState`, every seed event is either independently owned or any
 *   shared value is deeply frozen; {@link Session.fromRestore} validates and
 *   adopts those values without copying or freezing them.
 * @returns the store-owned session, not yet entered and read-only until announced.
 * @throws if a session with `id` already exists, metadata is not a plain
 *   lossless-JSON record with valid scalar fields, or `meta.cwd` is a
 *   non-absolute path.
 */
prepare(id?: SessionId, options?: PrepareSessionOptions): Session

/**
 * Enter a session into the store: install the module-private
 * append publication hooks and add it to the store. Writes remain disabled
 * until {@link announce} completes successfully. Returns the DETACH
 * disposer (hooks + store removal). Does NOT emit `session/created` —
 * the caller yields this disposer inside its effect and THEN calls
 * {@link announce}, so a throwing `session/created` listener rolls the attach
 * back instead of leaking it.
 *
 * Re-checks the id for a duplicate: `prepare` and `enter` are public
 * cross-package primitives and a caller may interleave arbitrary work (or
 * another create) between them, so a stale prepared session must NOT overwrite
 * a live store entry of the same id — its detach disposer would later delete
 * the REAL session. The {@link create} convenience and the agent factory call
 * the two back-to-back so they never trip this, but the public API cannot
 * assume that.
 *
 * @param session - an unentered session; independent instances become store-owned.
 * @returns the detach disposer (publication hooks + store removal). When called from
 *   a synchronous `session/created` listener, removal and disposal wait until
 *   that creation dispatch unwinds.
 * @throws if a session with this id is already in the store.
 */
enter(session: Session): () => void

/** Emit `session/created` exactly once for an {@link enter}ed session (with
 * the carrier {@link enter} captured). Separate from {@link enter} so the
 * caller can yield the detach disposer first (rollback safety — see
 * {@link enter}). The Session remains read-only throughout synchronous
 * dispatch; successful completion enables appends. A failed announcement
 * leaves it read-only and cannot be retried.
 * @param session - the entered session to announce to listeners.
 * @throws if the session is not live or its announcement already began,
 *   including a reentrant call from a creation listener. */
announce(session: Session): void

/**
 * Dispatch the awaited `session/flush` durability checkpoint for `session`,
 * with the carrier captured at {@link enter}. THE flush entry point: the
 * store owns the carrier, so callers (the checkpoint policy's per-request
 * barrier, goal-round-driver's idle checkpoint, teardown drains, and consumers
 * that flush themselves before reading storage) must come through here
 * rather than dispatch a raw `ctx.parallel('session/flush', …)` — one owner
 * and one spelling.
 * @param session - the session whose buffered events must reach durable storage.
 * @returns whether at least one durability listener participated, after every
 *   listener has settled successfully.
 * @throws the first registered listener failure after every listener settles.
 */
async flush(session: Session): Promise<boolean>

/**
 * Look up a live session.
 * @param id - the session id to look up.
 * @returns the session, or undefined when no live session has that id.
 */
get(id: SessionId): Session | undefined

/**
 * All live sessions, in creation order.
 * @returns a fresh array; mutating it does not affect the store.
 */
list(): Session[]

/**
 * Create an independent live session from an exact prefix of a live source.
 * `boundary` is an inclusive source event seq; omitted means the source's
 * current last event. An open tail receives synthetic tool results and
 * step/turn closers with the forked cause. Closed steps and turns remain
 * unchanged, including any failed tool calls already missing results.
 * `inheritedEventCount` counts only copied source events, excluding these closers.
 *
 * @param source - Live source session object or id.
 * @param boundary - Inclusive source event seq to fork through; omitted means
 *   the source's current last event, and omitted on an empty source forks an
 *   empty child.
 * @param childSessionId - Optional child session id; omitted delegates to
 *   `SessionStore`'s id policy.
 * @returns The created live child session.
 */
fork(source: SessionForkSource, boundary?: SessionSeq, childSessionId?: SessionId): Session
```

Types: [CreateSessionOptions](persistence.ko.md) · [PrepareSessionOptions](persistence.ko.md) · [SessionId](core.ko.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="api-session-events"></a>

### `api-session/*` events

<a id="api-sessionactivity--emit"></a>

#### `api-session/activity` — emit

One user-authored durable message advanced Session list activity.

```ts cordis-catalog
/**
 * One user-authored durable message advanced Session list activity.
 * @mode emit
 * @param sessionId - addressed Session identity.
 * @param updatedAt - durable message time used for list ordering.
 */
'api-session/activity'(sessionId: SessionId, updatedAt: number): void
```

Types: [SessionId](core.ko.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionadded--emit"></a>

#### `api-session/added` — emit

A Session became visible or its Agent was created or disposed. Consumers upsert the summary and replace its current running and availability state.

```ts cordis-catalog
/**
 * A Session became visible or its Agent was created or disposed.
 * Consumers upsert the summary and replace its current running and availability state.
 * @mode emit
 * @param summary - current list row for the Session.
 */
'api-session/added'(summary: SessionSummary): void
```

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionerror--emit"></a>

#### `api-session/error` — emit

One Agent failed outside a durable turn position.

```ts cordis-catalog
/**
 * One Agent failed outside a durable turn position.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param message - user-safe failure chain.
 */
'api-session/error'(sessionId: SessionId, message: string): void
```

Types: [SessionId](core.ko.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionremoved--emit"></a>

#### `api-session/removed` — emit

A Session left the live Host registry.

```ts cordis-catalog
/**
 * A Session left the live Host registry.
 * @mode emit
 * @param sessionId - removed Session identity.
 */
'api-session/removed'(sessionId: SessionId): void
```

Types: [SessionId](core.ko.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="api-sessionstatus--emit"></a>

#### `api-session/status` — emit

One Agent changed running state.

```ts cordis-catalog
/**
 * One Agent changed running state.
 * @mode emit
 * @param sessionId - Agent and Session identity.
 * @param running - whether the Agent is running.
 */
'api-session/status'(sessionId: SessionId, running: boolean): void
```

Types: [SessionId](core.ko.md)

Source: [`packages/api/session-controller/src/types.ts`](../../packages/api/session-controller/src/types.ts)

<a id="session-events"></a>

### `session/*` events

<a id="sessioncreated--emit"></a>

#### `session/created` — emit

Read-only creation announcement after store entry. New events reject until every synchronous listener has returned successfully. A synchronous throw vetoes creation and rolls back with a paired disposal; detach requested during dispatch is deferred. A returned-promise rejection is logged but cannot retroactively veto this synchronous boundary. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only sessions entered through that agent's context.

```ts cordis-catalog
/**
 * Read-only creation announcement after store entry.
 * New events reject until every synchronous listener has returned successfully.
 * A synchronous throw vetoes creation and rolls back with a paired disposal;
 * detach requested during dispatch is deferred.
 * A returned-promise rejection is logged but cannot retroactively veto this
 * synchronous boundary.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only sessions entered through that agent's context.
 * @param session - the session just entered and announced.
 * @mode emit
 */
'session/created'(this: Scoped<Session>, session: Session): void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessiondisposed--emit"></a>

#### `session/disposed` — emit

Emitted once when an announced session leaves the store, including publication rollback, but never for an entry whose creation announcement did not begin. Listener failures are logged and contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.

```ts cordis-catalog
/**
 * Emitted once when an announced session leaves the store, including
 * publication rollback, but never for an entry whose creation announcement
 * did not begin. Listener failures are logged and contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the owner scope.
 * @param session - the session that is no longer live in the store.
 * @mode emit
 */
'session/disposed'(this: Scoped<Session>, session: Session): void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionevent--emit"></a>

#### `session/event` — emit

Post-commit, fire-and-forget append feed. The listener snapshot resolves before the log push, but callbacks run after it; observer failures are logged and contained without making the committed append fail. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only events from sessions entered through that agent's context.

```ts cordis-catalog
/**
 * Post-commit, fire-and-forget append feed. The listener snapshot resolves
 * before the log push, but callbacks run after it; observer failures are
 * logged and contained without making the committed append fail.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners
 * receive only events from sessions entered through that agent's context.
 * @param session - the session whose log grew.
 * @param event - the appended event, exactly as recorded.
 * @mode emit
 */
'session/event'(this: Scoped<Session>, session: Session, event: SessionEvent): void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)

<a id="sessionflush--parallel"></a>

#### `session/flush` — parallel

Awaited parallel durability checkpoint: every listener runs and the caller awaits all of them, with no waterfall veto. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`) reuses the session's owner scope.

```ts cordis-catalog
/**
 * Awaited parallel durability checkpoint: every listener runs and the
 * caller awaits all of them, with no waterfall veto. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`) reuses the session's owner scope.
 * @param session - the session whose buffered events must reach durable storage.
 * @mode parallel
 */
'session/flush'(this: Scoped<Session>, session: Session): Promise<void> | void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/session/src/index.ts`](../../packages/core/session/src/index.ts)
<!-- END GENERATED cordis-surface -->
