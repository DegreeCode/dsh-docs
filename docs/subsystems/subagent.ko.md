# 서브에이전트

[English](subagent.md) | [中文](subagent.zh.md) | 한국어

로컬 대화와 외부 실행을 관리하는 통합 활성화 API입니다.

## 기능과 활성화 요청

모든 백엔드는 startActivation을 사용합니다. 기능 플래그가 요청 옵션을 검증하고, prepareContinuable은 로컬 Agent 생성을, start는 외부 실행 하나를 선택합니다. 모델이 보는 도구는 부모 전달을 사용합니다. 워크플로와 코드 모드 소비자는 부모 메시지를 하나 더 주입하지 않고 호출자 결과를 await할 수 있습니다. 설명자를 사용할 수 없는 과거 자식은 계속 기능을 부여하지 않은 채 `mode: 'unknown'`으로 발견 가능하게 남으며, 카탈로그 영속은 [패키지 README](../../packages/subagent/subagent/README.md)가 정의합니다.

선택적 `request.cwd`는 자식의 초기 디렉터리를 선택하며, 상대 경로는 부모의 현재 실효 디렉터리 기준으로 해석됩니다. 생략하면 허용 시점에 그 디렉터리를 캡처합니다. 로컬 자식 Session은 부모의 원래 프로젝트를 유지하고, 콜드 재개는 기록된 디렉터리 상태를 유지합니다.

```ts type-equiv
/**
 * Start-time options supported by a registered backend. The manager checks
 * every requested option before preparing a local child or starting an external
 * execution. depthLimit controls maxDepth; the remaining flag names match
 * SubagentStartRequest fields.
 */
interface SubagentCapabilities {
  readonly agentOptions: boolean
  /** Supports selecting a preset independently of the parent's composition. */
  readonly agentPreset: boolean
  readonly outputSchema: boolean
  readonly depthLimit: boolean
}
```

```ts type-equiv
/** One managed child execution and its result delivery policy. */
interface SubagentActivationSpec {
  /** Registered backend to use. */
  readonly provider: string
  /** Short task label retained in cataloged child membership. */
  readonly label: string
  /** Optional reserved identity for a local child; external backends allocate their own ids. */
  readonly childId?: SessionId
  /** Task, parent, and backend-supported execution options. */
  readonly request: Omit<SubagentStartRequest, 'label' | 'signal'>
  /** Cancellation before publication; callers own later cancellation through dispose. */
  readonly signal: AbortSignal
  /** Parent delivery notifies the model; caller delivery only returns the result. Local children always enter the parent catalog. */
  readonly delivery: 'parent' | 'caller'
}
```

```ts type-equiv
/** A managed execution; disposal addresses this exact activation, never a later resume. */
interface SubagentActivation {
  /** Stable identity of the child. */
  readonly childId: SessionId
  /** Accepted inbox message, when the backend has a local inbox. */
  readonly messageId?: MessageId
  /**
   * Execution result after teardown settles and notifications are sent; capture failures reject.
   * Teardown failures are reported by dispose() without replacing a captured result.
   */
  readonly result: Promise<SubagentResult>
  /** Stop and release this activation and its owned descendants; rejects on teardown failure. */
  dispose(): Promise<void>
}
```

```ts type-equiv
/**
 * Task and optional capabilities supplied to a backend. startActivation carries
 * these fields in request while owning its label, cancellation, and delivery
 * policy separately.
 */
interface SubagentStartRequest {
  /** Initial child directory; relative paths resolve against the parent's current directory. Omitted inherits that directory at start. */
  readonly cwd?: string
  /**
   * Independent preset id; omission joins the parent's current generation.
   * Requires a provider with `capabilities.agentPreset` that does not inherit
   * parent context.
   */
  readonly agentPreset?: string
  /** Optional short display label persisted with a session-backed child. */
  readonly label?: string
  /** Content delivered as the child's user message. */
  readonly prompt: ContentBlock[]
  /**
   * The spawning agent. Its effective directory supplies the default cwd;
   * in-process children retain its origin, lineage, and delegation depth.
   */
  readonly parent: Agent
  /**
   * Cancellation signal from the spawning context (the tool's `exec.signal`).
   * This is the canonical cancellation channel both before and after startup:
   * a provider rejects `start()` after cleaning partial resources when it
   * fires before the run is published, and cancels the published run's
   * remaining turn work when it fires afterward.
   */
  readonly signal: AbortSignal
  /**
   * Optional host-Agent provider, model, reasoning-effort, and output-token
   * overrides. Requires {@link SubagentCapabilities.agentOptions}; in-process
   * providers merge them over the parent Agent's options when they create the
   * child, while the DSH SDK provider merges them over its instance defaults
   * before initializing the separate child runtime.
   */
  readonly agentOptions?: AgentOptions
  /**
   * Object-rooted JSON Schema within `assertObjectJsonSchema`'s enforced subset. Start rejects
   * unsupported schemas or providers without the capability. Data must be plain host-realm JSON;
   * a successful child returns the matching value as {@link SubagentResult.structured}.
   */
  readonly outputSchema?: ObjectJsonSchema
  /**
   * Optional absolute delegation-depth cap for the child being started: its
   * computed depth must be less than or equal to this non-negative safe
   * integer. Requires {@link SubagentCapabilities.depthLimit}; rejected at
   * start otherwise.
   */
  readonly maxDepth?: number
}
```

```ts type-equiv
/** Provider-facing request with an absolute directory selected before startup. */
interface ResolvedSubagentStartRequest extends SubagentStartRequest {
  /** Absolute child directory captured from the parent or explicit request. */
  readonly cwd: string
}
```

## 로컬 자식과 활성화

Spawn만 독립적인 `agentPreset`을 지원하며, 생략과 fork는 부모의 활성 구성을 상속합니다. 명시적 선택, 이벤트 순서, 과거 복원은 [자식 프리셋 규칙](../../packages/subagent/subagent/README.md#restoring-child-composition)이 정의합니다.

로컬 자식은 영속 Session을 가지며 라이브 활성화는 최대 하나입니다. 관리자가 정체성과 용량을 예약하고, 백엔드를 통해 자식을 준비하며, 입력 허용, 콜드 재개, 자식 우선 폐기를 소유합니다. 활성화 결과는 리소스 해제와 완료 알림 뒤에 확정(settle)됩니다. 폐기는 캡처된 결과를 대체하지 않고 정리 실패를 따로 보고합니다. 구조화 캡처는 그 활성화의 입력을 닫으며, 이후 콜드 재개는 출력 스키마를 상속하지 않습니다.

```ts type-equiv
/**
 * What the continuation manager asks a provider for while materializing one
 * continuable child's FIRST activation. The manager has already reserved the
 * durable child identity and owns every later operation, so this request
 * carries only what distinguishes a fresh child from one seeded with parent
 * history.
 */
interface ContinuableCreateRequest {
  /** Absolute initial directory captured before provider preparation. */
  readonly cwd: string
  /** The reserved durable child session id, for provider diagnostics. */
  readonly sessionId: SessionId
  /** The delegating parent agent whose history a seeding provider reads. */
  readonly parent: Agent
  /**
   * Caller cancellation, which owns preparation only until the manager accepts
   * the initial prompt into the child's inbox.
   */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * A provider's detached contribution to one continuable child's creation. This
 * is DATA, never a capability: it carries no Agent, `AgentHandle`, prompt
 * delivery, result, disposal, or resume operation, because the continuation
 * manager owns the child's whole lifecycle after preparation.
 */
interface ContinuableCreateSpec {
  /**
   * Completed-turn prefix of the parent's log to seed the child session with,
   * or absent for a fresh child. Same durable contract as
   * `CreateAgentOptions.seed`: contiguous from seq 0, lossless JSON, balanced.
   */
  readonly seed?: readonly SessionEvent[]
}
```

## 메시지와 중단

sendMessage는 정확한 라이브 발신자를 승인하고 인접한 로컬 에이전트만 허용합니다. 실행 중인 자식은 스티어링 입력을 받고, 존재하지 않는 계속 가능 자식은 영속에서 재개됩니다. 외부 실행은 후속 메시지를 거부합니다. 로컬과 외부 실행 모두 최종 텍스트, 구조화 결과, 진단, 상태를 부모 완료 알림(settlement notification)에 자동으로 보고합니다. 로컬 자식은 send_message로도 메시지를 보낼 수 있습니다. 호출자 전달(forwarding)은 완료 알림을 억제합니다. drainDescendants와 drainChildren은 로컬 및 외부 활성화의 소유 작업 정리를 await합니다.

```ts type-equiv
/** Durable attribution for one model-authored message between Agents. */
interface AgentMessageSource {
  readonly kind: 'agent-message'
  /** A message another agent addressed to this one (`relay` context form). */
  readonly form: 'relay'
  /** Session id of the Agent whose tool call produced the message. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/**
 * Durable attribution for the runtime's own account of a continuable child
 * settling. Deliberately a different kind from
 * {@link AgentMessageSource}: an Agent message is content the sender chose,
 * while this message is the manager stating what became of the child, and a
 * transcript that merged them would credit the child with words it never wrote.
 */
interface SubagentSettledMessageSource {
  readonly kind: 'subagent-settled'
  /** A runtime account shown without expanding the row (`notice` context form). */
  readonly form: 'notice'
  /** One-line account of how the child ended. */
  readonly summary: string
  /** Session id of the child that settled. */
  readonly senderSessionId: SessionId
}
```

```ts type-equiv
/** Options for one model-authored message between adjacent Agents. */
interface SubagentSendMessageOptions {
  /** Caller cancellation, owning the operation only until inbox acceptance. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/**
 * Authority under which one interrupt request is admitted. `user` carries the
 * durable direct-parent address a human client presented; `ancestor` carries
 * the exact live Agent object whose recorded lineage must contain the caller.
 */
type SubagentInterruptAuthority =
  | { readonly kind: 'user'; readonly parentSessionId: SessionId }
  | { readonly kind: 'ancestor'; readonly agent: Agent }
```

## 영속 열거

`listChildren`은 모든 로컬 자식과 부모 전달 외부 자식의 부모 소유 카탈로그를 읽습니다. 호출자 전달 외부 실행은 멤버십과 결과 수집을 호출자에게 맡기며, 로컬 워크플로 자식은 완료 후에도 발견 가능하게 남습니다. 외부 항목은 `mode: 'external'`을 담고 자식 Session을 열거나 후속 메시지를 받을 수 없습니다. 카탈로그 항목은 실행 상태 없이 생성 시점의 멤버십을 기록합니다. `list_agents`는 `running` 또는 `inactive` 활동을 가진 직접 계속 가능 자식을 노출하며, [제어 도구](../../packages/subagent/tool-subagent-control/README.md#list_agents)를 참고하세요.

## 결과와 백엔드 핸들

SubagentResult는 프로그램 소비자가 사용할 수 있습니다. 활성화 레지스트리는 폐기가 완료될 때까지 외부 백엔드 핸들을 유지합니다. 정리 실패는 캡처된 실행 결과를 대체하지 않습니다. 활성화 결과와 부모 알림이 그 결과를 유지하는 반면, dispose는 거부하고 라이브 subagent/end 이벤트는 오류를 보고합니다. 백엔드 소유 진단은 아래의 안전 세부 정보 요구 사항을 만족해야 합니다.

```ts type-equiv
/**
 * The terminal outcome of a subagent run, resolved by {@link SubagentRun.result}.
 */
interface SubagentResult {
  /**
   * The child's final assistant output is the content of its last non-empty
   * assistant message. Empty-content messages, including usage-only messages,
   * are skipped. Without a non-empty message, the output is its accumulated
   * assistant text stream, or `[]` when the child produced neither.
   */
  readonly output: readonly ContentBlock[]
  /**
   * The structured result after a requested `outputSchema` was successfully
   * satisfied. Requesting a schema does not guarantee presence: a provider can
   * end with `stopReason: 'error'` when the child fails or finishes without a
   * valid capture. The structured value is validated against the requested
   * output schema by the provider; `unknown` here because the seam is
   * schema-agnostic.
   */
  readonly structured?: unknown
  /**
   * Provider-authored, non-assistant failure detail for a non-`completed`
   * result. Providers keep this text free of tool inputs, file contents,
   * environment values, credentials, and raw protocol payloads, and limit it
   * to 4096 UTF-8 bytes. Consumers present it separately from {@link output}.
   */
  readonly diagnostic?: string
  /** Why the run ended. A non-`completed` reason means `output` may be partial. */
  readonly stopReason: SubagentStopReason
}
```

```ts type-equiv
/**
 * Why a subagent run ended. Merge-extensible (a backend may add variants);
 * consumers branch on the known cases and fall through `default`. The known
 * cases mirror the harness turn-end vocabulary so the tool layer can map a
 * non-`completed` result to an `isError` tool result.
 */
interface SubagentStopReasonMap {
  /** The child finished its turn normally. */
  completed: 'completed'
  /** Cancelled through the request signal or disposal. */
  aborted: 'aborted'
  /** Model or transport failure. */
  error: 'error'
  /** The child hit its token ceiling before finishing. */
  'max-tokens': 'max-tokens'
  /** The child declined the task. */
  refusal: 'refusal'
}
```

```ts type-equiv
/**
 * Backend execution handle owned directly by the activation registry.
 * A result may become available before resource release; the manager always
 * disposes the handle and awaits cleanup. Backend startup failures clean up
 * partial resources before rejecting, while accepted execution failures settle
 * through result.
 */
interface SubagentRun {
  /** Provider-minted id, unique across all parents, providers, and local Sessions in this runtime. */
  readonly id: SessionId
  /**
   * Resolves with the child's terminal {@link SubagentResult} when the run
   * settles. Does NOT reject on a child-level failure — a model/transport
   * failure resolves with `stopReason: 'error'` so the consumer maps it to an
   * `isError` tool result. Rejects on an infrastructure fault the seam cannot
   * represent as a stop reason.
   */
  readonly result: Promise<SubagentResult>
  /**
   * Cancel remaining work, reach child quiescence, and release resources.
   * Idempotent.
   */
  dispose(): Promise<void>
}
```

## 제공자 계약: SubagentProvider

`SubagentManager`는 시작, 메시지 허용, 실행 수명을 소유합니다. Spawn과 Fork는 로컬 Agent를 위한 분리된 생성 입력을 기여합니다. Codex, Claude Code, ACP, DSH SDK는 실행 핸들 하나를 기여하며 여러 턴을 얻지 못합니다. 각 활성화는 AgentHandle이나 SubagentRun을 직접 유지하는 실행 기록입니다. 외부 완료는 핸들의 결과 promise를 따르고, 인박스와 유휴 허용은 로컬 실행에만 속합니다. 두 경로는 허용, 용량, 부모 소유권, 취소, 폐기를 공유합니다. 구성과 배포 요구 사항은 [패키지 참조](../../packages/subagent/subagent/README.md)가 설명합니다.

```ts type-equiv
/**
 * One registered transport for running child agents. Providers are trusted
 * same-process implementations; callers treat descriptors and returned values
 * as borrowed immutable data. The service may call one provider concurrently
 * for distinct children. Providers isolate operation-local mutable state; a
 * shared capacity controller may delay an operation but must not couple its
 * settlement or cleanup to a sibling.
 */
interface SubagentProvider {
  /** Unique registry name (e.g. `spawn`, `fork`, `acp`). */
  readonly name: string
  /** The start-time features this provider supports (see {@link SubagentCapabilities}). */
  readonly capabilities: SubagentCapabilities
  /**
   * Whether the child sees the parent's completed-turn prefix. This is descriptive, not a
   * service-validated start capability: the model-facing tool derives truthful wording from it.
   * It says nothing about tool registration, injected services, or authority inheritance.
   */
  readonly inheritsParentContext: boolean
  /**
   * Optional static provider-owned provider/model route for child Agent
   * options. Consumers merge tool/model overrides over these values before
   * preflight; providers whose route derives from the parent omit it. The value
   * is detached immutable data and requires `agentOptions` support.
   */
  readonly agentRouteDefaults?: Readonly<{ provider: string; model: string }>
  /**
   * Establish one external execution and return its owned handle.
   * The service has already validated that every requested start-time
   * capability is supported. Before fulfillment, the provider owns setup and
   * cleans any unpublished partial resources before rejecting. Ownership transfers on
   * fulfillment; subsequent turn or infrastructure failure settles through
   * the returned run. Distinct starts may overlap; cancellation, failure,
   * result settlement, and disposal remain independent for each run.
   */
  start?(request: ResolvedSubagentStartRequest): Promise<SubagentRun>
  /**
   * OPTIONAL (continuable-creation capability): contribute the detached
   * creation inputs that distinguish this provider's continuable children —
   * only whether the child session is seeded with parent history. Method
   * presence selects local activation execution. Providers without it execute
   * through start and do not accept subsequent messages.
   *
   * This is the provider's ONLY participation in a continuable child. The
   * continuation manager owns identity reservation, composition, Agent
   * creation, prompt delivery, cold resume, ownership, and disposal, so a
   * provider never sees the child's Agent, handle, turns, or teardown.
   * Distinct preparations may overlap; each follows its own signal and returns
   * data belonging only to `request.sessionId`.
   */
  prepareContinuable?(request: ContinuableCreateRequest): Promise<ContinuableCreateSpec>
}
```

## 영속 열거: `listChildren()`, `listDescendants()`와 그 항목

모델이 보는 `list_agents` 어댑터는 현재 활동을 `running` 또는 `inactive`로 보고합니다. 이 값은 작업 완료를 설명하지 않으며 `send_message`의 성공을 보장하지도 않습니다.

`SubagentRuntime.listChildren(parentSessionId, signal?)`는 라이브 우선 Session 관찰을 통해 부모의 `subagentCatalog` 뷰를 읽고 성공이나 실패 시 그 관찰을 해제합니다. 자식 로그를 읽거나 Session 코퍼스를 열거하지 않고 부모 이벤트 순서로 직접 자식 항목을 반환합니다. 쿼리 실패는 전파되고, 카탈로그 프로젝션이 없으면 명시적으로 실패합니다. 브라우저 행은 공유 프로젝션 저장소에서 멤버십을 도출하고 Session 상태에서 활동을 더하며, 제어 스트림은 전체 카탈로그 갱신을 푸시합니다. `listDescendants()`는 그 카탈로그들을 재귀적으로 읽고 각 자식 카탈로그에서 `hasChildren`을 도출합니다. 생성, fork 격리, 순서, 영속 비용은 [부모 카탈로그 Agent Note](../../.agents/notes/implemented/architecture/2026-09-01-parent-owned-subagent-catalog.md)가 소유합니다.

`SubagentRuntime.listDescendants(rootSessionId)`는 같은 카탈로그 리더를 안정적인 전위 순서로 재귀 호출하며 각 부모의 이벤트 순서를 보존합니다. 외부 항목은 로컬 Session이 없는 리프입니다. 일회성 및 알 수 없는 모드 항목은 순회 노드로 남고, 알 수 없는 모드는 `unsupported` 진단을 냅니다. 읽을 수 없는 자식 카탈로그는 `corrupt` 또는 `unavailable`을 내고 그 분기만 중단합니다. 루트 읽기 실패, 누락된 서비스나 프로젝션, 취소는 목록 조회를 거부합니다. 도달 가능한 각 카탈로그는 한 번 관찰되고 다음 읽기 전에 해제되며, 반복 id와 순환은 건너뜁니다. 도달 가능한 카탈로그에 없는 Session은 발견되지 않으며, 일반 Session fork와 그 fork 아래의 서브에이전트도 포함됩니다. 각 행은 카탈로그상 부모와 루트 기준 깊이를 담습니다:

```ts type-equiv
/** One catalog descendant with its direct parent and edge distance from the requested root. */
type SubagentDescendantListEntry = SubagentListEntry & {
  /** Parent whose catalog contains this child. */
  readonly parentId: SessionId
  /** Edge distance from the requested root; direct children are `1`. */
  readonly depth: number
}
```



<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubagentmodelselection--subagentmodelselectionconfig"></a>

### `ctx.subagentModelSelection` — `SubagentModelSelectionConfig`

Host settings owner that records Session authorization before the first model request.

Source: [`packages/subagent/tool-subagent/src/model-selection-settings.ts`](../../packages/subagent/tool-subagent/src/model-selection-settings.ts)

<a id="ctxsubagents--subagentruntime"></a>

### `ctx.subagents` — `SubagentRuntime`

Named provider registry with managed activations, durable discovery, and local child messaging.

```ts cordis-catalog
/**
 * Resolve a delegation tool's depth policy against the current user setting.
 * @param configured - Explicit tool limit, or provider-managed for external delegation.
 * @returns The numeric limit, or undefined when the provider owns depth enforcement.
 */
resolveMaxDepth(configured?: number | 'provider-managed'): number | undefined

/**
 * Start a local child under its reserved identity.
 * @param spec - local task, reserved child id, and result recipient.
 * @returns activation with its accepted initial message id.
 */
startActivation(spec: SubagentActivationSpec & { readonly childId: SessionId }): Promise<SubagentActivation & { readonly messageId: MessageId }>

/**
 * Start a local or external child.
 * @param spec - task, backend, and result recipient.
 * @returns activation with a message id only for local children.
 */
startActivation(spec: SubagentActivationSpec): Promise<SubagentActivation>

/**
 * Join progressing descendants without cancelling them. Idle descendants whose
 * inboxes require a later wake stay resident and do not delay host completion.
 * @param parent - the exact parent whose descendant work is observed.
 * @returns whether work was joined; hosts recheck parent idle after true.
 */
async waitForChildren(parent: Agent): Promise<boolean>

/**
 * Steer one model-authored message to the sender's direct parent or direct
 * continuable child. A running target admits it at the nearest step boundary;
 * an idle target starts a turn, and an absent direct child cold-resumes from
 * persistence. The service derives durable sender attribution from the exact
 * live sender. Caller cancellation stops only pre-acceptance work.
 * @param sender - exact live Agent authorizing and originating the message.
 * @param targetId - durable direct-parent or direct-child session id.
 * @param content - model-authored content to deliver.
 * @param options - caller cancellation before inbox acceptance.
 * @returns the accepted message's inbox id.
 * @throws when continuation services are unavailable, adjacency is rejected,
 *   or the message was not admitted.
 */
async sendMessage( sender: Agent, targetId: SessionId, content: ContentBlock[], options: SubagentSendMessageOptions, ): Promise<MessageId>

/**
 * Interrupt one live child's current execution under a human parent
 * address or an exact live ancestor Agent. Fire-and-return: the cancel
 * signal is issued before this returns, but the target may keep running
 * until it observes the signal. Unclaimed pending inbox work, the Activation,
 * and published descendants are preserved; claimed work is not requeued.
 * Once the interrupted Agent is idle, a waking send resumes the parked FIFO
 * queue. External backends stop their single execution. An absent target
 * is an accepted no-op, as is a manager-less composition, which cannot own a
 * live Activation.
 * @param targetSessionId - the durable child session id to interrupt.
 * @param authority - the human parent address or exact live ancestor Agent.
 * @throws {SubagentError} `UNAUTHORIZED` when the authority does not own the
 *   live target.
 */
interrupt(targetSessionId: SessionId, authority: SubagentInterruptAuthority): void

/**
 * Close subagent admission below exact live parent Agents, stop only their
 * visible descendant Activations synchronously, then await admitted scoped
 * materializations and release those forests child-first. The scoped cutoff
 * lasts until each exact parent leaves the registry; unrelated parent trees
 * remain live.
 * @param parents - exact host-owned parent Agents entering teardown.
 * @returns once every retained descendant activation released its execution handle.
 * @throws an aggregate error after all branches settle when any failed.
 */
async drainDescendants(parents: readonly Agent[]): Promise<void>

/**
 * Release selected resident direct children of one exact live
 * parent. Other children of the same parent remain admitted and resident.
 * Absent targets and a manager-less composition are accepted no-ops.
 * @param parent - exact live direct parent authorizing the selected release.
 * @param childIds - durable direct-child ids to release when resident.
 * @returns once every selected activation released its execution handle.
 * @throws {SubagentError} `UNAUTHORIZED` when a resident target belongs to a
 *   different parent or the supplied parent identity is stale.
 */
async drainChildren(parent: Agent, childIds: readonly SessionId[]): Promise<void>

/**
 * Read the parent's durable direct-child catalog without loading or resuming an Agent.
 * The service owns and releases the live-preferred Session observation.
 * @param parentSessionId - parent whose direct children are requested.
 * @param signal - cancellation forwarded to the Session query.
 * @returns catalog children in parent event order.
 * @throws {@link SubagentError} when query or catalog projection is unavailable.
 * @throws SessionQueryError when the parent cannot be read or the query is cancelled.
 */
listChildren(parentSessionId: SessionId, signal?: AbortSignal): Promise<SubagentCatalogEntry[]>

/**
 * Recursively list reachable parent catalogs in stable pre-order, preserving
 * each catalog's event order. Each row carries its catalog parent and depth;
 * external children are leaves; one-shot and unknown-mode children remain
 * traversal nodes. Unknown modes
 * produce unsupported diagnostics. Unreadable child catalogs produce corrupt
 * or unavailable diagnostics and stop only that branch. Root read failures,
 * missing services or projections, and cancellation reject the whole listing.
 * Each catalog is observed once and released before the next read. No Agent
 * is loaded or resumed; Sessions absent from reachable catalogs are omitted.
 * @param rootSessionId - session whose catalog starts descendant discovery.
 * @param signal - cancellation forwarded to and checked around each catalog read.
 * @returns children and branch diagnostics in parent-catalog pre-order.
 * @throws {@link SubagentError} when listing dependencies are unavailable or the caller cancels.
 * @throws SessionQueryError when the root catalog cannot be read.
 */
listDescendants(rootSessionId: SessionId, signal?: AbortSignal): Promise<SubagentDescendantListEntry[]>

/**
 * Deliver one browser-authored message to a continuable child through the
 * exact live direct parent, retaining the caller-minted request identity and
 * validated browser zone on the accepted message. Success identifies the
 * message the child's inbox accepted; later execution is independent of this
 * call. Queue delivery targets a later turn; steer delivery targets the
 * nearest step and retains the Agent loop's best-effort fallback semantics.
 * Image parts are admitted and persisted through the attachment store
 * before delivery, and the child's model must accept image input.
 * Cold resume at capacity rejects with `subagent/delivery-unavailable`.
 * @param request - durable address, delivery, minted identity, content, and optional browser zone.
 * @param signal - carrier cancellation, owning the call until inbox acceptance.
 * @returns the accepted message's inbox identity.
 * @throws {RemoteError} `gateway/bad-request`, `subagent/attachment-invalid`,
 *   `subagent/invalid-time-zone`, `subagent/parent-unavailable`,
 *   `subagent/not-resumable`, `subagent/unauthorized`,
 *   `subagent/delivery-unavailable`, `gateway/cancelled`, or `gateway/internal`.
 */
@Remote('prompt') async prompt(request: SubagentPromptRequest, signal: AbortSignal): Promise<SubagentPromptReceipt>

/**
 * Remote face of {@link interrupt} under one durable parent address. No
 * catalog, history, persistence, or parent Agent lookup runs: the core
 * primitive alone authorizes the address against the live Activation, which
 * is what keeps a live child interruptible while its parent Agent is offline.
 * Absent, idle, and already-completed targets are accepted no-ops there.
 * @param childSessionId - durable child session id to interrupt.
 * @param parentSessionId - durable direct parent whose authority is claimed.
 * @param mode - required continuable-address discriminator.
 * @returns acknowledgement that the cancel signal was admitted, not that the target is quiescent.
 * @throws {RemoteError} `gateway/bad-request` for an empty id,
 *   `subagent/unauthorized` when the address does not own the live target,
 *   otherwise `gateway/internal`.
 */
@Remote('interruptByParent') interruptByParent( childSessionId: SessionId, parentSessionId: SessionId, mode: 'continuable', ): SubagentInterruptReceipt

/**
 * Register a provider under its name. Registration is effect-scoped and HMR
 * safe; removing a provider blocks new starts but does not revoke runs that
 * were already returned to their holders. Providers without either execution
 * method are rejected with UNSUPPORTED_CAPABILITY before registration.
 * @param provider - the trusted provider implementation.
 * @returns the exact Cordis effect disposer.
 */
registerProvider(provider: SubagentProvider): () => void

/**
 * Look up a provider by name.
 * @param name - the provider name.
 * @returns the provider, or undefined when absent.
 */
getProvider(name: string): SubagentProvider | undefined

/**
 * List registered provider names in insertion order.
 * @returns the registered names.
 */
list(): string[]
```

Types: [Agent](core.ko.md) · [ContentBlock](llm-streaming.ko.md) · [MessageId](llm-streaming.ko.md) · [SessionId](core.ko.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagent-events"></a>

### `subagent/*` events

<a id="subagentend--emit"></a>

#### `subagent/end` — emit

A published child settled. Scope-filtered dispatch uses the same delegating parent carrier as `subagent/start`, so the lifecycle pair reaches the same scoped audience.

```ts cordis-catalog
/**
 * A published child settled. Scope-filtered dispatch uses the same delegating
 * parent carrier as `subagent/start`, so the lifecycle pair reaches the
 * same scoped audience.
 * @param info - the run identity and terminal outcome.
 * @mode emit
 */
'subagent/end'(this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo): void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-added--emit"></a>

#### `subagent/provider-added` — emit

A provider became resolvable in the registry.

```ts cordis-catalog
/**
 * A provider became resolvable in the registry.
 * @param provider - the registered provider.
 * @mode emit
 */
'subagent/provider-added'(provider: SubagentProvider): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentprovider-removed--emit"></a>

#### `subagent/provider-removed` — emit

A provider left the registry. Accepted runs remain holder-owned.

```ts cordis-catalog
/**
 * A provider left the registry. Accepted runs remain holder-owned.
 * @param name - the provider name that no longer resolves.
 * @mode emit
 */
'subagent/provider-removed'(name: string): void
```

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)

<a id="subagentstart--emit"></a>

#### `subagent/start` — emit

A provider established a published child. For in-process providers, `ctx.agents.get(info.id)` resolves during this notification. Scope-filtered dispatch keys the carrier by the delegating parent, so a parent-scoped listener observes only its own delegations. Paired with `subagent/end`.

```ts cordis-catalog
/**
 * A provider established a published child. For in-process providers,
 * `ctx.agents.get(info.id)` resolves during this notification.
 * Scope-filtered dispatch keys the carrier by the delegating parent, so a
 * parent-scoped listener observes only its own delegations. Paired with
 * `subagent/end`.
 * @param info - the provider and published child identity.
 * @mode emit
 */
'subagent/start'(this: Scoped<SubagentRuntime>, info: SubagentRunInfo): void
```

Types: [Scoped](scope.ko.md)

Source: [`packages/subagent/subagent/src/index.ts`](../../packages/subagent/subagent/src/index.ts)
<!-- END GENERATED cordis-surface -->
