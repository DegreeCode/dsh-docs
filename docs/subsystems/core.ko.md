# 코어

[English](core.md) | [中文](core.zh.md) | 한국어

**코어** 하위 시스템은 [`packages/core`](../../packages/core/README.md)입니다. 모든 구성이 부팅하는 패키지들, 즉 이벤트 소싱 세션 로그, 시스템 프롬프트 조립, 도구 레지스트리, 에이전트 타입, 그리고 이들을 구동하는 구체적 루프입니다. 이 페이지는 `agent`/`agent-loop` 쌍이 선언하는 것 — 에이전트가 생성되고 소유되는 방식, `Agent` 핸들의 전달·취소·가로채기 규약 — 과 모든 하위 시스템이 따르는 두 가지 타입 패턴을 설명합니다. 이 그룹의 전용 페이지와 폴더의 나머지는 [하위 시스템 README](README.ko.md)에 색인되어 있습니다.

## 패키지별 중심 축

턴은 하나의 루프에서 여섯 패키지를 거칩니다. [`agent-loop`](../../packages/core/agent-loop)의 드라이버가 대기 중인 프롬프트를 청구하고, [세션 로그](session.ko.md)(`ctx.sessions`)에 턴을 열며, [system-prompt](system-prompt.ko.md)(`ctx.systemPrompt`)로 요청 접두사를 조립하고 로그에서 이력을 도출하며, [LLM seam](llm-streaming.ko.md)을 통해 모델 응답을 스트리밍하고, [도구 레지스트리](tools.ko.md)(`ctx.tools`)를 통해 도구 호출을 디스패치하며, 다음 단계가 도출되기 전에 모델에 보이는 모든 사실을 로그에 다시 추가합니다. 루프가 옮기는 대화 어휘 — `Message`, `ContentBlock`, `StreamChunk`, 모델 요청 — 는 [`packages/llm`](../../packages/llm/README.md)이 선언하며 [llm-streaming.md](llm-streaming.ko.md)에 문서화되어 있습니다.

| 패키지 | 소유 대상 | 페이지 |
|---|---|---|
| `session/` | 추가 전용 `SessionEvent` 로그와 인메모리 저장소 — 단일 진실 공급원(`ctx.sessions`) | [session.md](session.ko.md) |
| `system-prompt/` | 프롬프트 섹션과 도구 스키마 조립(`ctx.systemPrompt`) | [system-prompt.md](system-prompt.ko.md) |
| `tools/` | 범위 지정된 도구 레지스트리와 보호된 실행 파이프라인(`ctx.tools`) | [tools.md](tools.ko.md) |
| `agent/` | `Agent` 인터페이스, 라이브 레지스트리, 개시자 범위, `agent/*` 이벤트 어휘(`ctx.agents`) | 이 페이지 |
| `agent-loop/` | 공개 `Agent` 계약을 구현하는 구체적 드라이버(`ctx.agentLoop`) | 이 페이지 |
| `scope/` | 레지스트리와 루프가 에이전트별 범위 지정을 구축하는 범위 지정 등록 원시 연산 | [scope.md](scope.ko.md) |

`scope/`는 유일한 비서비스 패키지입니다. 의존성이 없는 라이브러리(`createScope`/`scopeOf`/`scopeTarget`)로 모듈 그래프에서 `session/`과 `system-prompt/` 아래에 위치하여, 이들이 순환 없이 이를 소비할 수 있게 합니다. `agent-loop`는 공개 `Agent` 계약의 유일한 구체적 구현이며, 하네스의 기본 제품 루프이기 때문에 이곳에 있습니다. 각 드라이버를 `ctx.agents.withInitiator()` 안에서 실행합니다. 확장 플러그인은 개시자 Agent가 필요할 때를 포함해 `agent`에 의존하며 `agent-loop`에 직접 의존하지 않으므로 루프는 교체 가능하게 유지됩니다. [`dsh-base`](../../packages/bundle/base/README.md)는 기본 제품 구성이고, [`dsh-sdk-minimal`](../../packages/bundle/sdk-minimal/README.md)은 더 작은 독립 트리를 선언합니다.

## 생성과 소유권

소비자는 `ctx.agents`를 통해 에이전트를 생성합니다. `create()`는 호출자가 제공한 하나의 `SessionId` 아래에서 새 세션과 에이전트를 만들고, `resume()`은 먼저 영속 세션을 로드합니다. 또는 루프의 구성 항목을 통해 선언적으로 생성합니다. 프로그래밍 방식 생성은 소유자의 핸들을 반환합니다:

출처: [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

```ts type-equiv
/**
 * An owned agent plus its disposer, returned by {@link AgentRegistry.create} /
 * {@link AgentRegistry.resume}. The disposer is a CAPABILITY: among consumers,
 * only the holder can tear this agent down. The registered factory provider is
 * also a structural owner because the scoped agent depends on that provider's
 * service API; provider unload stops and drains every live handle it made.
 * `dispose()` stops the loop, awaits its exit, unregisters the agent, removes
 * its session from the store, and finally unwinds its scoped world.
 *
 * `ctx.agents.get(id)` still returns a bare {@link Agent} — the handle is
 * exposed only to the consumer owner that created it; the structural provider
 * reaches the same teardown internally. Config-created agents (the loop's own
 * startup) are owned by the loop fiber and never need a handle.
 */
interface AgentHandle {
  agent: Agent
  dispose(): Promise<void>
}
```

`CreateAgentOptions`는 공유 아이덴티티와 게시 전에 새 에이전트가 필요한 모든 것을 담습니다: 선택적 라이브 `parentAgent`, 세션 메타데이터(`meta` — 검증된 `cwd`, 포크 계보, `isSeeded` 표시, 출처 분류, 위임 깊이, `agentPreset`), 형제 필드 `inheritedEventCount`의 정확한 포크 절단, 선택적 `seed` 재생 접두사, 에이전트별 `AgentOptions`, 생성 전용 취소 `signal`, `setup`. `ResumeAgentOptions`는 영속 아이덴티티 대응물입니다: `resumeSessionId`, `parentAgent`, `agentOptions`, `signal`, `setup`. `setup` 콜백(`AgentSetup`)은 Session 저장소 진입과 `session/created` 완료 후, Agent 등록 전에 `(agentCtx, agent)`를 받습니다. 컨텍스트는 범위 지정 등록을 소유하고, 명시적 Agent는 Context에 역속성을 두지 않고 정확한 자식 Session을 제공합니다. `agentCtx`를 통해 등록된 모든 것은 `agent/created`와 첫 프롬프트 조립 전에 존재합니다. Setup은 게시 직전에 호출되는 동기 커밋을 반환할 수 있습니다. setup 거부, 커밋 예외, 소유자 dispose는 트랜잭션을 되감고 Session을 제거하며, 복원된 대기 입력과 이미 저장된 이벤트를 보존합니다.

`AgentFactory`는 레지스트리 뒤의 생성 인터페이스입니다. 루프가 `ctx.agents.setFactory()`로 팩토리를 등록하므로, 소비자는 구체적 루프 패키지에 의존하지 않고 `ctx.agents`를 사용합니다. 런타임 자식 생성자는 `options.parentAgent`를 설정하며, 레지스트리는 옵션과 호출자 Context를 서로에서 도출하지 않고 팩토리에 전달합니다. 정확한 `create`/`resume` 시그니처와 롤백 계약은 아래 [생성된 섹션](#ctxagents--agentregistry)에 있습니다.

## 에이전트 핸들

`Agent`는 모든 플러그인(UI, 훅, 오케스트레이터)이 대상으로 프로그래밍하는 표면입니다. `ctx.agents.get(id)`가 이를 반환하고, [개시자 범위](#개시자-에이전트)가 이를 전달합니다. 구체적 구현은 dsh-agent-loop 내부 패키지 전용이며, 루프 밖의 어떤 것도 이에 의존하지 않습니다. 통합 `send` 메서드는 대상과 깨우기 라우팅을 직접 노출하며, `followup`, `steer`, `inject`는 고정 프리셋 별칭입니다.

출처: [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** Public live-agent handle; the runtime face augments its live capabilities. */
interface Agent {
  /** Session-backed Agent identity. */
  readonly id: SessionId
  /** Route fallback and output controls; live accessors apply until the Session records a selection or request. */
  readonly options: AgentOptions
  /** The live session this agent drives; its log is the durable source of truth. */
  readonly session: Session
  /** Agent-owned access to durable model selection for future steps. */
  readonly model: Model
  /** Agent-owned access to durable pending work. */
  readonly inbox: Inbox
  /** The current lifecycle state, mirrored on every `agent/status` transition. */
  readonly status: AgentStatus
  /** Agent-scoped context; its contributions are agent-local, unwind on disposal, and reject registration afterward. */
  readonly ctx: Context

  /**
   * Clear queued and steering work — unless `keepInbox` — and abort the active
   * turn or between-turn task. The first cause wins for that activity. With no
   * active activity, cancellation is a no-op and does not arm later work.
   * @param cause - the stable caller intent carried by the active operation signal.
   * @param options - cancellation options; `keepInbox` preserves pending work.
   */
  cancel(cause: AgentCancelCause, options?: CancelOptions): void

  /**
   * Resolve after the current whole-agent activity reaches quiescence. This
   * follows replacement work started before the observed driver retires,
   * but does not identify the settlement of any particular message.
   * @returns fulfillment after no active driver or maintenance task remains.
   */
  whenIdle(): Promise<void>

  /**
   * Run one non-turn maintenance task from the true idle phase. The task starts
   * synchronously after claiming that phase; later waking input remains in the
   * inbox until the task settles, while public status stays `idle`.
   * `whenIdle()` follows both the task and any waking work released behind it.
   * @param task - operation whose fulfillment or rejection is preserved, with a signal aborted by {@link cancel}.
   * @throws synchronously when turn-driving or another maintenance task already owns the agent.
   * @returns the task promise.
   */
  runMaintenance<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T>

  /**
   * Route identified input to an inbox boundary and optionally wake the driver.
   * Waking input submitted after active cancellation is queued for the next
   * turn and runs when the aborted activity converges to idle; a `disposed`
   * cancel leaves it parked. A wake submitted while already idle always opens
   * its turn boundary, even when its message is cleared before the driver
   * claims ([driver wake convergence](../../agent-loop/src/agent.ts)).
   * @param message - identified content and the source that supplied it.
   * @param target - the preferred next-turn or next-step inbox boundary.
   * @param wakeup - whether delivery may wake the driver.
   */
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void

  /**
   * Queue an ordinary follow-up turn and wake the driver. The item becomes the
   * sole ordinary message of its own turn.
   * @param message - identified prompt content and the source that supplied it.
   */
  followup(message: UserMessage): void

  /**
   * Submit steering for the nearest step. An idle driver starts a turn;
   * a running driver consumes it at its next step boundary.
   * A rejected step leaves steering parked in the inbox until the next
   * wake; cancellation or disposal may discard pending steering.
   * @param message - identified steering content and the source that supplied it.
   */
  steer(message: UserMessage): void

  /**
   * Queue model-facing context for the next pre-step without waking the
   * driver. A running driver claims it at the nearest later step boundary;
   * idle drivers leave it pending until follow-up or steering
   * wakes them. It may miss a request whose pre-step already claimed its
   * batch. Cancellation or disposal may discard pending context.
   * @param message - identified injected context and the source that supplied it.
   */
  inject(message: UserMessage): void
}
```

```ts type-equiv
/**
 * An agent's lifecycle state, emitted on every transition as `agent/status`:
 * `idle` means no driver is active; `running` begins when waking input starts
 * cancellable pre-step processing and lasts while the driver drains,
 * closes, or checkpoints turns. Disposal removes the agent from its registry;
 * it is not a third observable status.
 */
type AgentStatus = 'idle' | 'running'
```

```ts type-equiv
/** One process-local live assistant streaming publication. */
type AssistantStreamFrame =
  | {
    readonly type: 'start'
    readonly attemptId: LlmAttemptId
    /** Monotone within one attached Agent lifecycle; replacement restarts at 1. */
    readonly revision: number
    readonly turn: number
    readonly step: number
  }
  | {
    readonly type: 'chunk'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Dense zero-based position within the attempt. */
    readonly index: number
    /** Safe-integer timestamp reused by the durable embedded stream. */
    readonly time: number
    readonly chunk: StreamChunk
  }
  | {
    readonly type: 'end'
    readonly attemptId: LlmAttemptId
    readonly revision: number
    /** Number of chunk frames emitted by this attempt. */
    readonly index: number
    /** Durable settlement committed before this notification, or live abandonment without one. */
    readonly outcome:
      | {
        readonly kind: 'committed'
        readonly eventType: 'assistant/message' | 'assistant/attempt'
        readonly seq: SessionSeq
      }
      | { readonly kind: 'abandoned' }
  }
```

`running`은 드라이버 전체의 배출 구간을 뜻하며 연속된 대기 턴에 걸칠 수 있습니다. 턴이 아직 열려 있음을 증명하지는 않습니다. dispose는 에이전트를 레지스트리에서 제거하고 `agent/disposed`를 발행하며, 종료 상태 값은 아닙니다. `followup()`은 핸들을 반환하지 않습니다. 그 `MessageId`는 이후의 어시스턴트 출력이나 턴 종료가 아니라 영속 인박스 삽입, 청구, 폐기 사실을 식별합니다. `whenIdle()`은 에이전트 전체를 관찰하므로, 호출자는 그 구간을 명시적으로 소유할 때만 수령에서 유휴까지의 구간을 실행이라고 부를 수 있습니다([결정](../../.agents/notes/implemented/architecture/2026-07-30-followup-enqueue-and-owned-runs.md)).

```ts type-equiv
/**
 * Merge-extensible agent options. Route fields may be live accessors until the
 * Session records a selection or request; step preparation captures their value.
 * Persona belongs to system-prompt sections.
 */
interface AgentOptions {
  /** Provider route (must have a registered adapter at call time). */
  provider?: string
  /** Model id interpreted by the selected provider adapter. */
  model?: string
  /** Adapter-owned reasoning effort for the selected provider/model route. */
  reasoningEffort?: ReasoningEffortId | undefined
  /** Maximum output tokens for each conversation-model request. */
  maxTokens?: number
}
```

단계 준비는 프롬프트 조립 전에 `provider`와 `model`을 요구합니다. 더 이상 권장되지 않는 `agent/request` 훅은 요청 제어를 바꿀 수 있지만 그 라우트는 보존해야 합니다. 명시적 `reasoningEffort`는 그 라우트의 첫 요청을 시드합니다. 정확한 모델 해석이 이를 검증하며, 생략하면 어댑터 기본값이 구체화될 수 있습니다. `maxTokens`가 있으면 양의 안전한 정수여야 하고 모든 대화 모델 요청을 제한합니다. 생략하면 요청 헤더 전에 정확한 모델 어댑터 기본값이 구체화되거나, 그렇지 않으면 제공자 동작이 그대로 유지됩니다. 에이전트 범위의 `deployment:persona-prefix` 프롬프트 섹션이 전역 기본 페르소나를 가릴 수 있습니다.

`AgentLoop`는 `ctx.sessionProjections`에 `modelSelection`을 등록하고 각 `agent.model` 인스턴스를 통해 선택 작업을 노출합니다. `model/selection`은 모델 이력에 들어가지 않고 완전한 선택을 기록합니다. 일치하는 요청 헤더가 `pending`을 지우고, 최신 요청은 `lastUsed`로 남습니다. 어댑터가 기본값을 적용한 effort는 생략되어 이후 요청이 다시 기본값을 해석합니다. `next`는 선택이나 요청이 기록되기 전에만 null이며, 그 경우 `AgentOptions`가 라우트를 제공합니다. [Agent 모델 API](../../packages/core/agent/README.md)가 선택 우선순위와 재개 정책을 설명합니다.

```ts type-equiv
/** Agent-owned access to the model choice for future steps. */
interface Model {
  /**
   * Resolve the choice for the next step to begin preparation. Recorded choices
   * take precedence over the last request and then the Agent's live options.
   * This read neither starts a step nor changes an already-prepared step.
   * @returns a detached choice, or undefined when no source names both provider and model.
   */
  current(): Readonly<ModelSelection> | undefined

  /**
   * Replace the next step's complete selection. Omitted effort follows adapter
   * defaults without inheriting a previous effort or resolving defaults here.
   * An equal recorded choice is a no-op; an options-only fallback is
   * always recorded. Callers own model availability and capability validation.
   * The append uses the Session's existing persistence and failure guarantees.
   * @param selection - complete provider, model, and optional explicit effort.
   */
  select(selection: Readonly<ModelSelection>): void

}
```

```ts type-equiv
/** Complete provider, model, and optional reasoning effort chosen for one Session's model steps. */
interface ModelSelection {
  /** Registered provider route. */
  provider: string
  /** Provider-owned model id. */
  model: string
  /** Adapter-owned reasoning effort, or provider/default behavior when absent. */
  reasoningEffort?: ReasoningEffortId
}
```

```ts type-equiv
/**
 * Durable model-selection state for one Session. An effort the adapter
 * defaulted on a recorded request is omitted, so later requests resolve the
 * default again instead of pinning it as a choice.
 */
interface ModelSelectionProjectionState {
  /** Selection used by the latest recorded model request. */
  readonly lastUsed: ModelSelection | null
  /** Later recorded selection not yet used by a matching model request. */
  readonly pending: ModelSelection | null
}
```

```ts type-equiv
/** Client view of the durable model-selection fold. */
interface ModelSelectionProjection {
  /** Selection used by the latest recorded model request. */
  readonly lastUsed: ModelSelection | null
  /** Selection the next model step uses; null while the Agent's initial options supply the route. */
  readonly next: ModelSelection | null
}
```

인박스는 전달 어휘입니다. 에이전트가 영속 프로젝션으로 소유하는 두 개의 순서 있는 대기 메시지 목록입니다:

```ts type-equiv
/** Agent-owned access to pending work; concrete storage belongs to the driver. */
interface Inbox {
  /** Prompts awaiting individual turns. */
  readonly nextTurn: readonly UserMessage[]
  /** Input awaiting the next step boundary. */
  readonly nextStep: readonly UserMessage[]

  /** Durably cancel all pending input, clearing next-step before next-turn. */
  clear(): void

  /**
   * Append one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to append.
   */
  append(target: InboxTarget, message: UserMessage): void

  /**
   * Prepend one message to a pending list.
   * @param target - pending list to extend.
   * @param message - message to prepend.
   */
  prepend(target: InboxTarget, message: UserMessage): void

  /**
   * Replace one pending message in place.
   * @param messageId - identity of the pending message to replace.
   * @param newMessage - replacement message.
   * @returns whether the message was still pending.
   */
  replace(messageId: MessageId, newMessage: UserMessage): boolean

  /**
   * Remove one pending message.
   * @param messageId - identity of the pending message to remove.
   * @returns whether the message was still pending.
   */
  remove(messageId: MessageId): boolean

  /**
   * Apply standard splice semantics and durably record the normalized result.
   * @param target - pending list to mutate.
   * @param start - splice position.
   * @param deleteCount - maximum number of messages to remove.
   * @param inserted - messages to insert at the resolved position.
   * @returns messages removed by the splice.
   */
  splice(
    target: InboxTarget,
    start: number,
    deleteCount: number,
    inserted: UserMessage[],
  ): UserMessage[]
}
```

```ts type-equiv
/** One of the two ordered pending-message lists owned by an agent. */
type InboxTarget = 'next-turn' | 'next-step'
```

모든 대기 항목은 그 `UserMessage`이며, `MessageId`가 유일한 아이덴티티입니다. 구조적 `Inbox` 메서드는 정규화된 영속 `agent/inbox/spliced` 변이를 기록하고 중복 대기 id를 거부합니다. `replace(messageId, newMessage)`와 `remove(messageId)`는 두 목록에서 대기 메시지를 찾습니다. 교체는 아이덴티티를 바꿀 수 있으며, 이전 메시지를 폐기된 것으로, 새 메시지를 삽입된 것으로 발행합니다. 일반 제거와 `clear()`는 취소입니다. 단계 경계에서 dsh-agent-loop의 패키지 내부 `ReactLoopInbox`는 제안된 배치 — 모든 `next-step` 입력과, 턴 경계에서는 `next-turn` 메시지 하나 — 를 폐기 알림 없이 순수 삭제 스플라이스로 제거한 뒤, 메시지별 인출(claimed) 알림을 발행합니다. 루프 전용 대기 감지와 인출(claim)은 `Agent.inbox`의 일부가 아닙니다. `AgentLoop` 서비스는 팩토리를 게시하기 전에 표준 `inbox` 프로젝션을 등록합니다. 그 셀이 유일한 라이브 상태이며, 같은 폴드가 Agent가 없어도 콜드 소비자에게 사용됩니다. 폴드는 안전하지 않거나 범위를 벗어난 스플라이스 좌표와 두 목록에 걸친 중복 아이덴티티를 거부하며, 잘못된 영속 이력을 이벤트 seq로 식별합니다. 한 메시지를 따라가는 소비자는 정확한 `agent/inbox/inserted`, `claimed`, `discarded` 알림을 사용합니다.

취소:

```ts type-equiv
/** Options for {@link Agent.cancel}. */
interface CancelOptions {
  /**
   * Preserve queued and steering inbox items instead of discarding them. The
   * active turn is still aborted, but un-started and pending work survives for a
   * later turn and no canceled inbox splice is logged.
   */
  keepInbox?: boolean | undefined
}
```

```ts type-equiv
/** Why an active agent driver was cancelled. */
type AgentCancelCause =
  | { readonly kind: 'user' }
  | { readonly kind: 'parent' }
  | { readonly kind: 'hook'; readonly reason: string }
  | { readonly kind: 'disposed' }
```

원인은 TypeScript가 강제하는 같은 프로세스 입력입니다. 활성 취소 보유자는 같은 객체를 런타임 전용 `AbortSignal.reason`으로 노출합니다. 신호는 협조적 리스너에게 분류 권한을 주지 않습니다. 영속 `turn/end`는 결과를 `{ kind: 'aborted', reason: TurnEndCancelCause }`로 기록하므로 취소 원인이 최종 결과에 남습니다.

[이벤트 분류](../architecture.ko.md#이벤트)가 `agent/*` 수명 주기, 체크포인트, waterfall 계약을 소유합니다. 턴과 단계 경계는 에이전트 발행이 아니라 영속 세션 이벤트입니다.

## 개시자 에이전트

`ctx.agents`가 전달하는 프로세스 로컬 개시자는 별도 프레임이나 복사된 아이덴티티가 아니라 위의 바로 그 `Agent`입니다. 주변적 존재는 생존 증명도 승인도 아닙니다. [개시자 범위 결정](../../.agents/notes/implemented/architecture/2026-07-15-agent-initiator-scope.md)이 그 수명과 범위 규칙을 정의합니다.

## 가로채기 결정

사전 단계 결정은 영속 사용자 역할 입력과 같은 식별된 `UserMessage` 타입을 사용합니다. 진입한 배치는 권위가 있으며 모든 메시지의 `id`와 `source`를 보존합니다. 훅 브리지는 자체 결정 필드를 이 타입 결과에 매핑합니다.

출처: [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

`agent/pre-step`은 배타적으로 가져온(claimed) 메시지 배치(`messages`), 제안된 단계의 위치(`turn`, `step`), 현재 턴의 취소 `signal`을 담은 페이로드를 전달받습니다. 최초 제안은 실제 단계 실행 전에 이미 열려 있는 턴 내부에서 평가되며, 도구 연속 실행 시에는 단계 사이에 빈 메시지 배치가 전달될 수 있습니다:

`PreStepDecision`을 반환합니다. 거부(reject)하면 단계가 시작되지 않습니다. 진입(enter)은 `step/start` 이후에 추가될 전체 메시지 배치를 제공합니다. 최종 결정에서 누락된 인출(claimed) 메시지는 제거된 상태로 유지되며, 인출 이후에 새로 삽입된 입력은 대기 상태로 남습니다:

```ts type-equiv
/** Whether and with which messages the loop enters a proposed step. */
type PreStepDecision =
  | { kind: 'reject' }
  | {
    kind: 'enter'
    messages: UserMessage[]
    /** Start a distinct model-message series before this step's admitted messages. */
    startsRequestSeries?: true
  }
```

`agent/request-error`는 실패한 모델 단계가 닫힌 뒤, 그 턴이 닫히기 전에 실행됩니다. 리스너는 실패한 턴의 신호가 아직 살아 있는 동안 영속 상태를 복구하거나 정책 작업을 기다릴 수 있습니다. 처리 리스너는 `next()`를 호출하지 않고 `{ kind: 'retry' }`를 반환하며, 기본값 `undefined`는 실패를 최종으로 남깁니다.

```ts type-equiv
/** Action returned by a listener that owns model-request recovery. */
type RequestErrorAction = { kind: 'retry' } | undefined
```

`agent/pre-step`은 요청 도출 전의 유일한 waterfall 리스너 체인입니다. `agent/turn-stopping`은 턴에 도구나 조향 계속 실행이 없을 때, 마지막 조향 배출 전에 실행됩니다.

`agent/created`는 `SessionStartSource`를 전달합니다(세션 수명 주기가 시작된 이유이며, 브리지가 이에 SessionStart 매처를 키로 삼습니다):

```ts type-equiv
/** Why a session lifecycle began; seeded creates are `startup`, while persisted loads are `resume`. */
type SessionStartSource = 'startup' | 'resume' | 'clear' | 'compact'
```

## 세션

`Session`은 타입이 지정된 `SessionEvent`의 **추가 전용 로그**이며 단일 진실 공급원입니다. LLM 메시지 이력은 별도로 저장되지 않고 로그에서 *도출*됩니다(`deriveMessages()`). 모든 항목은 단조 증가하는 `seq`, `time`, `type`으로 구분되는 `data` 페이로드를 가지며, 표면 변형은 `sourceEventSeqs`에 인용된 이전 이벤트를 나열하고 `surfaceOp`를 가질 수도 있습니다.

`SessionEvent` 봉투의 정확한 조건부 필드, 열세 개 코어 이벤트 변형(`turn/start`, `turn/end`, `step/start`, `step/end`, `user/message`, `system/message`, `assistant/message`, `assistant/attempt`, `tool/call`, `tool/result`, `request/header`, `request/context`, `session/end-seed`), `deriveMessages()` 프로젝션 규칙, `TurnEndReason` 이유, 실행 포함과 독립 이벤트 규칙은 **[session.md](session.ko.md)**에 있습니다. 로그가 영속화되는 방식 — `SessionPersistence` 인터페이스, JSONL 제공자, `session/flush` 체크포인트, 크래시 복구, `SessionHeader` — 은 **[persistence.md](persistence.ko.md)**에 있습니다.

## `ToolDefinition`

코어에 속하는 유일한 파이프라인 작성 타입입니다. 등록된 모든 도구가 *무엇인지* — 모델 대상 `ToolSchema`와 `execute` 함수, 선택적 최종 콘텐츠 및 UI 콜백 — 를 나타냅니다. 도구 작성자가 직접 구성하는 일은 드물지만(`defineTool` DSL이 타입이 지정된 인수로 이를 구성), 레지스트리가 보유하고 루프가 디스패치하는 계약입니다.

전체 필드, `defineTool`/`ValueSchemaSpec`/`ParameterSchemaSpec` 타입 스키마 DSL, `ToolExecution`/`ToolExecutionResult` waterfall 타입, 도구 표시 UI 타입은 **[tools.md](tools.ko.md)**에 있습니다.

## 저장소 전반의 타입 패턴

두 패턴이 모든 하위 시스템에 반복되며 여기에서 한 번만 문서화합니다.

<a id="the-map--derived-union-pattern"></a>

### `…Map → derived-union` 패턴

하네스의 거의 모든 확장 가능한 합 타입은 하나의 패턴을 따릅니다. 판별 태그로 키가 지정된 인터페이스(`…Map`)가 있고, `keyof`로 유니온을 도출합니다. 플러그인은 **선언 병합**으로 변형을 추가하며 소유 패키지를 편집하지 않습니다.

```ts ignore-check
// The pattern, schematically:
interface ThingMap {
  'a': { kind: 'a'; /* … */ }
  'b': { kind: 'b'; /* … */ }
}
type ThingKind = keyof ThingMap          // 'a' | 'b'
type Thing = ThingMap[keyof ThingMap]    // the discriminated union

// A plugin extends it without touching the source package:
declare module '@deepseek-ai/dsh-llm' {
  interface ThingMap {
    'c': { kind: 'c'; /* … */ }
  }
}
```

다섯 개의 표준 맵이 이 패턴을 사용하며, 플러그인 작성자가 이를 확장합니다:

| 맵 | 패키지 | 도출 | 카탈로그 |
|---|---|---|---|
| `ContentBlockMap` | dsh-llm | `ContentBlock` | [llm-streaming.md](llm-streaming.ko.md#콘텐츠-블록과-메시지) |
| `MessageSourceMap` | dsh-llm | `MessageSource` | [llm-streaming.md](llm-streaming.ko.md#콘텐츠-블록과-메시지) |
| `FinishReasonMap` | dsh-llm | `FinishReason` | [llm-streaming.md](llm-streaming.ko.md#the-model-request-and-result) |
| `TurnEndReasonMap` | dsh-session | `TurnEndReason` | [session.md](session.ko.md) |
| `SessionEventMap` | dsh-session | `SessionEvent` | [session.md](session.ko.md) |

소비자가 가장 많이 `switch`하는 두 개의 큰 판별 유니온은 **`StreamChunk`**(스트리밍 프로토콜)와 **`SessionEvent`**(로그 항목)입니다. 저장소 관례에 따라 태그로 `switch`하고 `if`를 연쇄하지 마세요. 그러면 각 분기가 좁혀지고 태그를 잘못 쓰면 컴파일되지 않습니다.

### 브랜드 ID

패키지 사이에 전달되는 ID는 **브랜드** 처리됩니다. 구조적으로는 문자열이지만 타입 수준에서 상호 교환할 수 없습니다(`SessionId`를 `ToolCallId`가 기대되는 곳에 전달할 수 없습니다). 생성에는 공유 `brandString<T>()` 헬퍼나 소유자가 정의한 검증 팩토리를 사용하며, 비교·로깅·JSON에서는 일반 문자열처럼 동작합니다.

`Branded<B>` 원시 타입과 무상태 생성자는 [dsh-brand](../../packages/util/brand)에 있으며 하네스 기능 의존성이 없습니다. `brandString<T>()`는 컴파일 시점 전용 문자열 브랜드를 적용합니다.

출처: [`packages/util/brand/src/index.ts`](../../packages/util/brand/src/index.ts)

```ts type-equiv
/** A string carrying a compile-time-only brand `B`. */
type Branded<B extends string> = string & { readonly [BRAND]: B }
```

코어 ID 두 개는 `ToolCallId`(도구 호출과 결과를 연관, dsh-llm)와 `SessionId`(라이브 에이전트와 영속 세션이 공유하는 아이덴티티, dsh-session)입니다. 기능 패키지도 [jobs.md](jobs.ko.md)의 `JobId`처럼 자체 id를 브랜드 처리합니다.

## `TurnBoundaryProjection`

`ctx.agents.turnBoundaryOf(session)`는 라이브 Agent 없이 기록된 턴과 단계 위치를 읽습니다. 레지스트리가 이 상태를 소유하며, 소비자는 그 프로젝션 정의를 등록하지 않습니다.

출처: [`packages/core/agent/src/types.ts`](../../packages/core/agent/src/types.ts)

```ts type-equiv
/** Turn and step positions recorded in a Session. */
interface TurnBoundaryProjection {
  /** Seq of the open turn's `turn/start`, or null between turns. */
  readonly openTurnStartSeq: OptionalSessionSeq
  /** Seq of the latest `step/start` event, or null before the first step. */
  readonly lastStepStartSeq: OptionalSessionSeq
  /** The latest step boundary (`step/start` or `step/end`) and its seq, or null before the first step boundary. */
  readonly lastStepBoundary: { readonly kind: 'start' | 'end'; readonly seq: SessionSeq } | null
  /** Turn number of the latest `turn/start`; 0 before the first turn. */
  readonly lastTurn: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

`scripts/gen-cordis-catalog.ts`가 소스에서 생성하며(doc-sync의 `pnpm run verify-cordis-catalog`로 최신 여부를 검증하고 `pnpm run gen-cordis-catalog`로 재생성), 언어별 문서는 로케일별 짝 문서 경로만 다릅니다. 시그니처 블록은 `ts cordis-catalog` 펜스를 사용하고 원본 소스 JSDoc을 유지합니다. 디스패치 모드는 [입문서](../cordis-primer.ko.md#디스패치-모드)에 정의되어 있고, 프레임워크 상속 `ctx` API는 [cordis-api/inherited.md](../cordis-api/inherited.md)에 있습니다.

<a id="ctxagentdefaultmodel--agentdefaultmodelconfig"></a>

### `ctx.agentDefaultModel` — `AgentDefaultModelConfig`

Host나 전송과 무관하게 기본 모델 선택을 소유합니다. 각 작업은 소유 Config 참조를 읽습니다.

```ts cordis-catalog
/**
 * Read the current default model selection.
 * @returns a detached provider, model, and optional reasoning selection.
 */
currentSelection(): ModelSelection

/**
 * Save the complete default model selection. A deployment without a configuration
 * editor keeps its composition entry. Saves commit in submission order; a failed
 * save rejects its caller without blocking later saves.
 * @param next - resolved selection accepted by an entry point.
 * @returns fulfillment after the optional profile write settles.
 */
async saveSelection(next: ModelSelection): Promise<void>
```

출처: [`packages/core/agent-default-model/src/index.ts`](../../packages/core/agent-default-model/src/index.ts)

<a id="ctxagentloop--agentloop"></a>

### `ctx.agentLoop` — `AgentLoop`

구체적 에이전트 팩토리이자 드라이버 서비스입니다.

```ts cordis-catalog
/**
 * Create an agent and session under one caller-supplied identity, owned by
 * the accessing fiber. Constructor-driven config calls mint a fresh combined
 * id before entering this boundary. When a persistence backend is mounted,
 * the session's durable identity and any seed are stored before publication.
 * @param id - shared agent/session identity.
 * @param options - concrete loop options.
 * @param meta - optional fresh-session workspace metadata.
 * @returns the published running agent.
 */
async create(id: SessionId, options: AgentOptions = {}, meta: Pick<SessionHeader, 'cwd'> = {}): Promise<Agent>

/**
 * Create an owned agent on a caller-supplied session id.
 * @param ownerCtx - caller context that structurally owns the lifecycle.
 * @param options - identities, optional live parent, session seed/metadata, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Resume an owned agent from the configured persistence service.
 * @param ownerCtx - caller context that owns load, setup, and the live lifecycle.
 * @param options - persisted identity, optional live parent, loop options, setup, and cancellation.
 * @returns the published handle.
 */
async resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
```

타입: [SessionHeader](persistence.ko.md)

출처: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="ctxagentpresets--agentpresetregistry"></a>

### `ctx.agentPresets` — `AgentPresetRegistry`

YAML로 선언된 프리셋과 라이브 Agent가 유지하는 리비전의 레지스트리입니다.

```ts cordis-catalog
/**
 * Read the preset recorded for a Session, including selections no longer in the roster.
 * @param session - Session whose committed preset selection is read.
 * @returns the recorded preset, or null when none was selected.
 */
presetForSession(session: Session): string | null

/** Register and eagerly load a definition; activation failure remains visible in the roster.
 * @param definition Parsed configuration supplied by the declaring plugin.
 * @returns Definition disposer after activation or its diagnostic settles; the declaring plugin owns it.
 */
async register(definition: PresetDefinition): Promise<() => Promise<void>>

/** Inspect retained revisions, or the exact revision an Agent joined.
 * @param ctx - optional Agent context; omission includes all retained revisions.
 * @returns detached module references and isolation diagnostics; no match returns an empty list.
 */
inspectCompositions(ctx?: Context): AgentPresetInspection[]

/** Read every declared preset, including activation failures.
 * @returns Display metadata and loading diagnostics.
 */
async list(): Promise<AgentPreset[]>

/** Read the selection roster.
 * @returns Current presets, each marked when it is the default.
 */
@Remote('list') async remoteExportList(): Promise<AgentPresetRoster>

/** Resolve an identity without starting an Agent.
 * @param id Explicit preset or the current default.
 * @returns Current metadata, including failure when activation failed.
 */
async resolve(id?: string): Promise<AgentPreset>

/** Read one declaration's child plugin list as YAML, for viewing only.
 * @param agentPreset Preset identity.
 * @returns The declared composition beside its published metadata.
 */
@Remote('read') readDocument(agentPreset: string): Promise<AgentPresetDocument>

/** Bind an unpublished Agent to the current preset revision.
 * @param ctx Agent context from its setup callback.
 * @param id Requested preset, or the default.
 * @returns Bound preset identity.
 */
async mount(ctx: Context, id?: string): Promise<AgentPreset>

/** Join a child to the exact revision retained by its parent.
 * @param ctx Child Agent context.
 * @param parent Parent Agent context.
 * @returns Inherited preset id, or undefined in a preset-free composition.
 */
composeFrom(ctx: Context, parent: Context): string | undefined

/** Read the preset a live Agent uses.
 * @param ctx Agent context.
 * @returns Its preset id, if bound.
 */
composedPreset(ctx: Context): string | undefined

/** Read a service supplied inside an Agent's isolated preset group.
 * @param agent Agent whose composition is queried.
 * @param name Cordis service name.
 * @returns The service, or undefined.
 */
serviceFor<K extends string & keyof Context>(agent: { ctx: Context }, name: K): Context[K] | undefined

/** Rebind a blank Agent; the caller owns the blank-session check.
 * @param ctx Agent context.
 * @param id Requested preset.
 * @returns The bound identity.
 */
async recompose(ctx: Context, id: string): Promise<AgentPreset>

/** Select a preset before a session starts its first turn. A Session whose
 * log records the preset and whose Agent runs its current revision keeps its
 * composition; nothing is logged or announced.
 * @param agent Target Agent.
 * @param agentPreset Requested identity.
 * @returns Committed preset identity.
 */
@Remote('select') async select(agent: Agent, agentPreset: string): Promise<string>

/** Read current registrations for cold transcript presentation.
 * @param id Preset identity or the default.
 * @returns A revision lease; dispose it after the scoped read completes.
 */
async acquireScope(id?: string): Promise<{ key: ScopeKey } & AsyncDisposable>

/** Read plugin rows without creating an Agent.
 * @returns Current declaration metadata and activation states.
 */
compositionInventory(): Promise<AgentPresetComposition[]>
```

타입: [ScopeKey](scope.ko.md) · [Session](session.ko.md)

출처: [`packages/preset/agent-preset-registry/src/index.ts`](../../packages/preset/agent-preset-registry/src/index.ts)

<a id="ctxagents--agentregistry"></a>

### `ctx.agents` — `AgentRegistry`

에이전트 서비스(`ctx.agents`): 라이브 에이전트를 추적하고 하나의 프로세스 로컬 비동기 드라이버 체인을 통해 개시자 Agent를 전달합니다. Agent *생성*은 AgentFactory를 구현하는 플러그인(`@deepseek-ai/dsh-agent-loop`)이 제공하며 setFactory로 등록됩니다.

개시자 메서드는 같은 프로세스의 인과 귀속만 제공합니다. 주변적 존재는 생존 증명도 승인도 아니며, 주체와 소유자는 워커, 프로세스, 영속성, 와이어 경계에서의 아이덴티티와 마찬가지로 명시적으로 남습니다. 반환된 Promise 경계는 정리 중에 배출되지만, 소유 fiber 언로드를 시작하는 중첩 계보는 자체 배출에서 제외됩니다.

```ts cordis-catalog
/**
 * Read the turn and step positions recorded in a Session.
 * @param session - Session whose committed events are read.
 * @returns the current turn and step positions; do not mutate the returned value.
 */
turnBoundaryOf(session: Session): TurnBoundaryProjection

/**
 * Read the Agent that initiated the inherited asynchronous driver chain.
 * Use this optional form for logging, tracing, metrics, or host attribution
 * that also supports agentless calls. When a parent creates a child, setup
 * reports the causal parent while the setup callback's Agent parameter
 * identifies the child.
 * @returns the inherited Agent, or `undefined` outside an initiator boundary
 *   and inside an explicit clearing boundary.
 * @throws when this service instance has been disposed.
 */
currentInitiator(): Agent | undefined

/**
 * Read the initiating Agent and fail when no initiator boundary is active.
 * Use this for private helpers contractually below a driver, or for a
 * deployment-owned outbound request whose contract forbids agentless calls.
 * Generic or direct-call paths use optional lookup or explicit request fields.
 * @returns the inherited Agent.
 * @throws when no initiator is active or this service instance has been disposed.
 */
requireInitiator(): Agent

/**
 * Run an operation with one exact Agent as its process-local initiator. The
 * exact synchronous value or Promise returned by the operation is preserved.
 * Custom drivers and test harnesses wrap their complete returned foreground
 * lifetime.
 * A queue or wire receiver may establish this boundary only after validating
 * explicit identity and resolving the exact live Agent; this method does neither.
 * Detached work remains owned by the subsystem that starts it.
 * @param agent - initiating Agent to inherit; presence is neither liveness proof nor authorization.
 * @param operation - synchronous or asynchronous operation to invoke.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withInitiator<T>(agent: Agent, operation: () => T): T

/**
 * Run an operation inside a boundary that hides any inherited initiating
 * Agent. The exact synchronous value or Promise is preserved.
 * Use this while creating lazy shared timers, queue pumps, pool maintenance,
 * watchers, or exporters so they do not inherit the first Agent that happens
 * to initialize them. It clears only initiator attribution, not explicit
 * fields, and does not own or drain detached resources.
 * @param operation - synchronous or asynchronous operation to invoke without an initiator.
 * @returns the exact value returned by `operation`.
 * @throws when the initiator scope is closing/disposed, or when `operation` throws.
 */
withoutInitiator<T>(operation: () => T): T

/**
 * Register the agent-creation factory (the loop calls this on construction,
 * effect-scoped). A traced Cordis service is canonicalized to its concrete
 * target; each create/resume call is then traced through that caller's
 * context so ownership follows the caller without stacking proxy layers.
 * Throws if a factory is already registered. Returns the disposer; on
 * dispose the factory slot is cleared.
 * @param factory - the loop-owned factory {@link create}/{@link resume} delegate to.
 * @returns the disposer that clears the factory slot. The exact
 *   Cordis effect disposer (single-shot): composite (generator) effects may
 *   yield it directly — exact identity nests the teardown in order.
 */
setFactory(factory: AgentFactory): () => void

/**
 * Create and publish a new agent through the registered factory.
 * Distinct from {@link register} (which records an already-constructed
 * agent): this constructs the agent and its session. Rejects if no factory is
 * registered or creation/setup fails. The resolved {@link AgentHandle} lets
 * the owner tear down exactly this agent.
 * @param options - shared identity, optional live parent, session seed/metadata, and agent options.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async create(options: CreateAgentOptions): Promise<AgentHandle>

/**
 * Load a persisted session and resume an agent on it through the registered
 * factory. Rejects if no factory is registered; the factory rejects if
 * session persistence is not configured or persistence/setup fails.
 * @param options - persisted identity, optional live parent, configuration, and setup.
 * @returns the handle after setup, rollback-covered publication, and loop start complete.
 */
async resume(options: ResumeAgentOptions): Promise<AgentHandle>

/**
 * Register a live agent with source `startup`. Rejects if the id is already registered or a
 * serial `agent/created` listener fails. Emits `agent/disposed`
 * when the calling fiber is disposed — both with the agent's scope carrier
 * (`scopeTarget(agent, agent)`): the subject is the agent in hand, so the
 * emits are scope-filtered regardless of which context invoked `register`
 * (calling through `agent.ctx` scopes EFFECTS; dispatch scoping always
 * requires passing the carrier). The entry is a runtime root; factory-backed
 * creation uses `options.parentAgent` for child ownership. Await the registration before using the agent.
 * @param agent - the already-constructed agent to record in the store.
 * @returns the awaitable Cordis effect disposer (single-shot; a repeat call
 *   returns undefined without awaiting an in-flight teardown). Exact
 *   identity is load-bearing: a composite (generator) effect that owns a
 *   teardown ORDER — the agent factory's lifecycle chain — must yield THIS
 *   function so Cordis nests the unregistration at that yield position;
 *   yielding a wrapper would leave it disposing as a concurrent sibling on
 *   owner unload, unregistering the agent (and emitting `agent/disposed`)
 *   while its final turn is still draining.
 */
register(agent: Agent): ReturnType<Context['effect']>

/**
 * Insert an already-constructed agent without announcing it. This is the
 * advanced ordered-lifecycle primitive used by the async agent factory: it
 * first completes setup while the agent is unpublished, then assigns the
 * returned detach closure into its pre-installed composite teardown before
 * calling {@link announce}. Ordinary callers use {@link register}.
 * @param agent - the prepared, unpublished agent.
 * @param owner - explicitly supplied live runtime owner, or
 *   undefined for a top-level runtime root. This is runtime ownership, not
 *   the resumed session's durable parent lineage.
 * @returns an idempotent closure that removes this exact entry and emits
 *   `agent/disposed` with listener failures contained. When called from a
 *   `agent/created` listener, removal and disposal wait until the serial
 *   creation dispatch settles.
 */
enter(agent: Agent, owner: Agent | undefined): () => void

/**
 * Announce an agent previously inserted with {@link enter}.
 * @param agent - the live inserted agent to announce.
 * @param source - fresh creation, resume, clear, or compaction source.
 * @param signal - optional factory initialization cancellation signal passed to listeners.
 * @returns completion of the serial creation listeners; a listener failure rejects.
 * @throws if `agent` is not the exact live registry entry for its id, or its
 *   creation announcement already began (including a reentrant call from a
 *   creation listener).
 */
async announce(agent: Agent, source: SessionStartSource, signal?: AbortSignal): Promise<void>

/**
 * Look up a live agent.
 * @param id - the shared agent/session id to look up.
 * @returns the agent, or undefined when no live agent has that id.
 */
get(id: SessionId): Agent | undefined

/**
 * Test whether a live agent was created through one exact parent agent's
 * scoped context. Runtime ownership is independent of durable session
 * lineage and remains unambiguous when unrelated providers reuse an id.
 * @param id - the candidate child agent's shared agent/session id.
 * @param owner - the expected runtime creator agent.
 * @returns true only while the exact child entry is live under that owner.
 */
isOwnedBy(id: SessionId, owner: Agent): boolean

/**
 * All live agents, in registration order.
 * @returns a fresh array; mutating it does not affect the registry.
 */
list(): Agent[]

/**
 * All live top-level agents in registration order. A top-level agent was
 * created without an owning agent context; durable session lineage does not
 * affect this runtime relation, so a resumed fork may still be a root.
 * @returns a fresh array; mutating it does not affect the registry.
 */
roots(): Agent[]
```

타입: [Session](session.ko.md)

출처: [`packages/core/agent/src/index.ts`](../../packages/core/agent/src/index.ts)

<a id="agent-events"></a>

### `agent/*` 이벤트

<a id="agentassistant-stream--emit"></a>

#### `agent/assistant-stream` — emit

프로세스 로컬 어시스턴트 스트림 게시입니다. 청크 프레임은 일시적이며, 루프는 커밋된 end 프레임 전에 같은 스트림을 담은 최종 v2 `assistant/message` 또는 `assistant/attempt` 하나를 추가합니다.

```ts cordis-catalog
/**
 * Process-local assistant-stream publication. Chunk frames are transient;
 * the loop appends one final v2 `assistant/message` or `assistant/attempt`
 * with the same stream before a committed end frame.
 * @param payload.agent - the agent whose attempt produced the frame.
 * @param payload.frame - one ordered start, chunk, or end publication.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/assistant-stream'(this: Scoped<Agent>, payload: { agent: Agent; frame: AssistantStreamFrame }): void
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentcreated--serial"></a>

#### `agent/created` — serial

진입한 에이전트는 팩토리 설정 후 에이전트별 초기화가 가능합니다. 리스너는 순서대로 실행되고 생성이 해결되기 전에 대기됩니다. AgentLoop는 모든 리스너가 끝날 때까지 대기 입력을 보류합니다. 예외나 거부는 생성을 실패시키고 이후 리스너를 건너뜁니다. dispose는 디스패치가 완료(settle)될 때까지 범위와 세션을 유지하므로, 리스너는 agent.whenIdle()이나 자체 소유자의 처분을 기다려서는 안 됩니다.

```ts cordis-catalog
/**
 * An entered agent is ready for per-agent initialization after factory setup.
 * Listeners run in order and are awaited before creation resolves. AgentLoop
 * holds queued input until all listeners finish. A throw or rejection fails
 * creation and skips later listeners. Disposal retains the scope and session
 * until dispatch settles; listeners must not await agent.whenIdle() or their
 * own owner's disposal.
 * @param payload.agent - the newly registered agent with its live session and completed setup.
 * @param payload.source - fresh creation, resume, clear, or compaction source.
 * @param payload.signal - factory initialization cancellation signal, when provided.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/created'(this: Scoped<Agent>, payload: { agent: Agent; source: SessionStartSource; signal?: AbortSignal }): undefined | Promise<undefined>
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentdisposed--emit"></a>

#### `agent/disposed` — emit

에이전트가 레지스트리를 떠났습니다. AgentLoop는 드라이버 정지와 범위 지정 등록 되감기 후, 세션 분리 전에 이를 발행합니다. 사용자 지정 레지스트리 사용자는 자체 드라이버 순서 계약을 소유합니다.

```ts cordis-catalog
/**
 * An agent left the registry; AgentLoop emits this after driver quiescence
 * and scoped-registration unwind, but before session detachment. Custom
 * registry users own their driver-ordering contract.
 * @param payload.agent - the exact agent removed from the registry.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/disposed'(this: Scoped<Agent>, payload: { agent: Agent }): void
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agenterror--emit"></a>

#### `agent/error` — emit

단계나 턴에서 오류가 발생했습니다. 오류가 턴 내 위치를 가진 영속 기록을 가질 수 없더라도 머신은 여기서 실패를 보고합니다.

```ts cordis-catalog
/**
 * A step or turn errored. The machine reports a failure here even when
 * the error has no in-turn position for a durable record.
 * @param payload.agent - the agent whose turn errored.
 * @param payload.turn - the turn in which the failure surfaced.
 * @param payload.step - the step at which the failure surfaced.
 * @param payload.error - the failure, verbatim.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; error: unknown }): void
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxclaimed--emit"></a>

#### `agent/inbox/claimed` — emit

메시지가 현재 열려 있는 턴 내부에서 수신함을 떠나 처리 대기 상태가 되었습니다. 제안된 단계가 거부되면 이렇게 가져온(claimed) 메시지는 여기서 처리가 종결됩니다: 폐기되지도 않고 user/message로 다시 발행되지도 않으며, 해당 턴은 추가 단계 실행 없이 닫힙니다.

```ts cordis-catalog
/**
 * One message left the inbox inside its open turn. If the proposed step
 * is rejected, the claimed message ends here: it is neither discarded nor
 * re-emitted as a user/message, and the turn closes without a step.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the claimed message.
 * @param payload.turn - the owning turn.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/claimed'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage; turn: number }): void
```

타입: [Scoped](scope.ko.md) · [UserMessage](session.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxdiscarded--emit"></a>

#### `agent/inbox/discarded` — emit

한 메시지가 라이브 인박스에서 폐기되었습니다.

```ts cordis-catalog
/**
 * One message was discarded from the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the discarded message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/discarded'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

타입: [Scoped](scope.ko.md) · [UserMessage](session.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentinboxinserted--emit"></a>

#### `agent/inbox/inserted` — emit

한 메시지가 라이브 인박스에 들어왔습니다.

```ts cordis-catalog
/**
 * One message entered the live inbox.
 * @param payload.agent - the agent whose inbox changed.
 * @param payload.message - the inserted message.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/inbox/inserted'(this: Scoped<Agent>, payload: { agent: Agent; message: UserMessage }): void
```

타입: [Scoped](scope.ko.md) · [UserMessage](session.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentpre-step--waterfall"></a>

#### `agent/pre-step` — waterfall

제안된 단계를 거부하거나 진입하는 메시지를 교체합니다. `next()`를 호출하면 현재 메시지가 보존됩니다.

```ts cordis-catalog
/**
 * Reject a proposed step or replace the messages that enter it. Calling
 * `next()` preserves the current messages.
 * @param payload.agent - the agent proposing the step.
 * @param payload.messages - messages removed from the inbox for this step.
 * @param payload.turn - the turn that will own the step.
 * @param payload.step - the step proposed by the loop.
 * @param payload.signal - the current turn's cancellation signal.
 * @param payload.modelSelection - captured step selection, retained across retries; omitted effort uses adapter defaults.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal; modelSelection: Readonly<ModelSelection> }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

타입: [Scoped](scope.ko.md) · [UserMessage](session.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentrequest-error--waterfall"></a>

#### `agent/request-error` — waterfall

루프가 재시도하거나 단계를 닫기 전에 실패한 모델 요청 시도 하나를 처리합니다. 리스너는 복구를 소유할 때 `next()`를 호출하지 않고 `{ kind: 'retry' }`를 반환하거나, 위임하려면 `next()`를 호출합니다. 기본값 `undefined`는 실패를 최종으로 남깁니다.

```ts cordis-catalog
/**
 * Handle one failed model-request attempt before the loop retries or closes
 * its step. A listener returns `{ kind: 'retry' }` without calling `next()`
 * when it owns recovery, or calls `next()` to delegate. The default
 * `undefined` leaves the failure terminal.
 * @param payload.agent - the agent whose request failed.
 * @param payload.turn - the turn containing the failed request.
 * @param payload.step - the step containing the failed request attempt.
 * @param payload.provider - the provider selected for the failed request.
 * @param payload.failure - serializable facts normalized at the final adapter boundary.
 * @param payload.retryPolicy - the policy of the adapter registration that served the failed request.
 * @param payload.signal - the turn abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode waterfall
 */
'agent/request-error'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; step: number; provider: string; failure: LlmFailure; retryPolicy: ResolvedRetryPolicy | undefined; signal: AbortSignal }, next: () => Promise<RequestErrorAction>): Promise<RequestErrorAction>
```

타입: [LlmFailure](llm-streaming.ko.md) · [ResolvedRetryPolicy](llm-streaming.ko.md) · [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentstatus--emit"></a>

#### `agent/status` — emit

에이전트 상태가 바뀌었습니다(`idle` ⇄ `running`). 깨우는 전달은 취소를 예약한 뒤 동기적으로 `running`에 들어가고, `idle`은 남아 있는 드라이버가 스케줄되거나 활성 상태가 아님을 뜻합니다.

```ts cordis-catalog
/**
 * Agent status changed (`idle` ⇄ `running`). A waking delivery enters
 * `running` synchronously after reserving cancellation; `idle` means no
 * driver remains scheduled or active.
 * @param payload.agent - the agent whose status flipped.
 * @param payload.status - the status just entered (the transition's destination).
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode emit
 */
'agent/status'(this: Scoped<Agent>, payload: { agent: Agent; status: AgentStatus }): void
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agentturn-stopping--serial"></a>

#### `agent/turn-stopping` — serial

턴이 곧 닫힙니다. 모델이 응답할 것이 없습니다(라이브 도구 호출도, 새 조향도 없음). 경계가 커밋되기 전에 대기하며, 이의가 있는 리스너는 조향(`agent.steer(...)`)을 하고 머신은 인박스를 다시 읽습니다. 새 조향이 있으면 다음 단계를 실행하고, 없으면 턴을 닫습니다. 데이터가 결정하므로 리스너 순서가 결과를 바꿀 수 없습니다. 반대 제어(도구 루프를 조기 중지)도 데이터입니다. `concludesTurn`을 담은 도구 결과는 그 단계에서 턴을 끝냅니다. 이 종료는 이미 제출된 next-step 작업을 단락시키지 않습니다. 같은 단계의 `additionalContexts`나 경합 중인 조향은 여전히 실행되며, 인박스가 비워질 때만 턴이 닫힙니다.

```ts cordis-catalog
/**
 * The turn is about to close: the model owes no response (no live tool
 * calls, no fresh steering). Awaited before the boundary commits — a
 * listener that objects steers (`agent.steer(...)`) and the machine
 * re-reads its inbox: fresh steering runs another step, none closes the
 * turn. Data decides, so listener order cannot change the outcome. The
 * inverse control (stop a tool loop early) is data too: a tool result
 * carrying `concludesTurn` ends the turn at its step. The conclusion
 * never short-circuits already-submitted next-step work: same-step
 * `additionalContexts` or racing steering still runs, and the turn
 * closes only when that inbox drains.
 * @param payload.agent - the agent whose turn is at its stop boundary.
 * @param payload.turn - the turn about to close.
 * @param payload.signal - the current turn's explicit abort signal.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @mode serial
 */
'agent/turn-stopping'(this: Scoped<Agent>, payload: { agent: Agent; turn: number; signal: AbortSignal }): Promise<void> | void
```

타입: [Scoped](scope.ko.md)

출처: [`packages/core/agent/src/runtime-types.ts`](../../packages/core/agent/src/runtime-types.ts)

<a id="agent-loop-events"></a>

### `agent-loop/*` 이벤트

<a id="agent-loopconfig-start-failed--emit"></a>

#### `agent-loop/config-start-failed` — emit

선언적 에이전트 항목이 라이브 에이전트를 게시하기 전에 실패했습니다. 구성된 아이덴티티에 작업을 버퍼링하는 소비자는 이 일시적 신호로 해당 작업을 거부하고 영원히 기다리지 않습니다. 정상 팩토리 정리는 취소된 시작 시도의 실패를 억제합니다.

```ts cordis-catalog
/**
 * A declarative agent entry failed before it could publish a live agent.
 * Consumers that buffer work for the configured identity use this
 * transient signal to reject that work instead of waiting forever. Normal
 * factory teardown suppresses failures from the cancelled startup attempt.
 * @param payload.sessionId - exact shared agent/session identity that failed startup.
 * @param payload.error - persistence, setup, or publication failure.
 * @mode emit
 */
'agent-loop/config-start-failed'(payload: { sessionId: SessionId; error: unknown }): void
```

출처: [`packages/core/agent-loop/src/index.ts`](../../packages/core/agent-loop/src/index.ts)

<a id="agent-preset-events"></a>

### `agent-preset/*` 이벤트

<a id="agent-presetselected--emit"></a>

#### `agent-preset/selected` — emit

한 세션이 다른 에이전트 프리셋을 영속 로그에 커밋했습니다. 소비자는 그 세션의 구성에서 파생된 상태만 무효화합니다.

```ts cordis-catalog
/**
 * One session committed a different agent preset to its durable log.
 * Consumers invalidate only state derived from that session's composition.
 * @mode emit
 * @param sessionId - the session whose composition changed.
 * @param agentPreset - the preset recorded by the committed selection.
 */
'agent-preset/selected'(sessionId: SessionId, agentPreset: string): void
```

출처: [`packages/preset/agent-preset-registry/src/types.ts`](../../packages/preset/agent-preset-registry/src/types.ts)
<!-- END GENERATED cordis-surface -->
