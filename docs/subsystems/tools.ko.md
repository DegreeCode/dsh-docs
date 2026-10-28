# 도구

[English](tools.md) | [中文](tools.zh.md) | 한국어

[dsh-tools](../../packages/core/tools)의 도구 파이프라인입니다. [core.md](core.ko.md)는 코어 패키지가 공유하는 파이프라인 작성 타입으로 `ToolDefinition`을 소개합니다. 모델이 보는 [`ToolSchema`](llm-streaming.ko.md#the-model-request-and-result) 와이어 타입은 모델 요청과 함께 선언됩니다. 이 페이지는 모든 `ToolDefinition` 필드, 이를 만드는 타입 지정 스키마 DSL, 가드된 실행 타입, UI 표현 타입을 문서화합니다.

출처: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts) · [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts) · [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts)

## `ToolDefinition` — 등록된 도구

`ToolSchema`(모델이 보는 필드)에 필수 정규 출력 선언, `execute` 함수, 호스트 전용 스케줄러 메타데이터, 선택적 최종 콘텐츠 콜백, 선택적 UI 프리젠터를 더한 것입니다. 레지스트리가 이를 보관하고 루프가 이를 통해 호출을 디스패치합니다. 레지스트리의 `schemas()`는 명시적 허용 목록으로 모델이 보는 `ToolSchema[]`를 만들며, `output`/`execute`/`projectContent`/`finalizeContent`/`timeoutMs`/`isConcurrencySafe`/`presentCall`/`presentResult`는 모델 요청에 절대 새어 나가서는 안 됩니다.

```ts type-equiv
/** Tool-owned canonical output contract used after the body returns a JSON value. */
interface ToolOutputDefinition {
  /** Raw supported JSON Schema enforced against every successful canonical value. */
  readonly schema: JsonSchemaNode
  /** Pure projection from validated arguments and value to Native/model content. */
  render(args: unknown, value: JsonValue): ContentBlock[]
  /** Pure replayable presentation projection for native and nested calls. */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}
```

```ts type-equiv
/** A registered tool: its schema plus the execution function. */
interface ToolDefinition extends ToolSchema {
  /** Mandatory canonical output declaration. */
  readonly output: ToolOutputDefinition
  /**
   * Run one accepted call and return only its canonical lossless-JSON value.
   * Async work must observe or forward `exec.signal` and settle only after its
   * owned work reaches quiescence. The executor preserves caller cancellation
   * through around-dispatch signal replacement and does not abandon this
   * promise, but it cannot hard-kill same-process code.
   * @param args - losslessly snapshotted, frozen model arguments.
   * @param exec - execution identity, cancellation signal, and context deferral.
   * @returns the canonical value declared by `output.schema`.
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  /**
   * Install execution-prepared content before `tools/post-execute` policies.
   * The callback is captured when the call starts and runs once for a
   * normalized outcome entering post-execute. Policy replacements remain
   * authoritative; pipeline failures that bypass post-execute skip projection.
   * @param exec - immutable execution identity and arguments.
   * @param result - normalized result before post-execute policy.
   * @returns replacement content, or undefined to preserve the renderer output.
   */
  projectContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /**
   * Synchronous last-mile transform for model-facing content. The executor
   * snapshots this callback when execution starts and invokes it exactly once
   * for every normalized outcome, including pipeline failures that bypass
   * `tools/post-execute`, immediately before lossless materialization.
   * Returning `undefined` preserves the content; every other result field
   * remains executor-owned. The callback must be total and must not throw.
   * @param exec - immutable execution identity and arguments.
   * @param result - complete normalized outcome before materialization.
   * @returns replacement content, or `undefined` to preserve it.
   */
  finalizeContent?(exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): ContentBlock[] | undefined
  /**
   * Cooperative tool-call timeout budget in milliseconds. Omit for no deadline.
   * Enforced by `@deepseek-ai/dsh-tool-call-timeout-policy` (a `tools/execute` wrapper); it
   * is NEVER sent to the model — `schemas()` whitelists only name/description/
   * parameters. Declaring it asserts this tool forwards `exec.signal` to a
   * cooperative implementation that can reach quiescence when the signal aborts.
   */
  timeoutMs?: number
  /**
   * Pure synchronous classifier for overlap with sibling tool calls. Only
   * `true` opts in; omission, exceptions, non-`true` returns, and invalid
   * `defineTool` arguments are exclusive. This metadata is never model-visible.
   *
   * Opted-in executions must not mutate parent-owned state. Shared state must
   * tolerate concurrent dispatch; recorder races are permitted only when they
   * commute or fail closed. See the
   * [parallel-tool-call Agent Note](../../../../.agents/notes/implemented/feature/2026-07-10-parallel-tool-call-execution.md)
   * for the full contract.
   * @param args - parsed arguments; `defineTool` validates before calling.
   * @returns Whether this call may join a parallel group.
   */
  isConcurrencySafe?(args: unknown): boolean
  /**
   * Optional: how to present the PENDING state of one call in a UI, derived from
   * the call's `args` (parsed arguments, `unknown` — the tool validates/narrows
   * its own input). Returns a {@link ToolCallView} (a `card`-tagged render intent),
   * or `undefined` (or omit the method) to fall back to a generic presentation
   * (title = tool name, raw args as input). Pure and side-effect-free: a UI may
   * call it during live streaming AND a session-log replay, so it must depend
   * only on `args`.
   */
  presentCall?(args: unknown): ToolCallView | undefined
  /**
   * Optional: how to present the COMPLETED state, given the same `args` and the
   * durable result projection (`content`, failure state, and optional `meta`). Returns a
   * {@link ToolResultView}, or `undefined` (or omit the method) to keep the
   * pending title and render the raw result content. Pure and side-effect-free
   * for the same replay reason.
   */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}
```

`execute`는 `args: unknown`을 받습니다. 즉 원시 `ToolDefinition`은 자체 입력을 검증합니다. 자사 도구는 이를 직접 작성하지 않고 `defineTool`을 사용합니다. 이 도구는 인자를 검증하고 좁히며, `output.schema`에서 본문 반환을 추론하고, 두 출력 프로젝터의 타입을 지정합니다. `finalizeContent`는 잘못된 입력과 외부 파이프라인 실패도 도달하므로 의도적으로 타입이 지정된 인자 대신 불변 실행을 받습니다. `isError`, 정규 값, 구조화된 오류 식별자, 지연된 컨텍스트, 표현 메타데이터를 보존하면서 도구가 소유한 콘텐츠 상한을 강제할 수 있습니다.

## 통합 JSON 값 스키마 DSL

플러그인 작성자는 타입 지정 매개변수와 타입 지정 출력 값에 하나의 어휘를 사용합니다. `ValueSchemaSpec`은 `string`, `number`, `integer`, `boolean`, `null`, `array`, `object`, 작성자 전용 `json`, 정확히 하나를 고르는 `oneOf`를 지원하며, 스칼라 `enum`과 `const` 값은 해당 노드 타입과 일치해야 합니다. 명시적 객체 노드는 항상 `additionalProperties: true | false`를 선언합니다. 매개변수 정의는 암묵적인 열린 객체 속성 맵으로 남고, 필수 속성마다 `required: true`가 붙습니다.

출처: [`packages/core/tools/src/schema.ts`](../../packages/core/tools/src/schema.ts)

```ts type-equiv
/** One author-facing schema for any lossless JSON value root. */
type ValueSchemaSpec =
  | StringValueSchemaSpec
  | NumberValueSchemaSpec
  | IntegerValueSchemaSpec
  | BooleanValueSchemaSpec
  | NullValueSchemaSpec
  | ArrayValueSchemaSpec
  | ObjectValueSchemaSpec
  | JsonValueSchemaSpec
  | OneOfValueSchemaSpec
```

```ts type-equiv
/** One implicit parameter-root property, optionally required. */
type ParameterPropertySpec = ValueSchemaSpec & { required?: true }
```

```ts type-equiv
/**
 * Tool parameter schema. The map itself is an implicit open object root;
 * requiredness remains a per-property `required: true` annotation.
 */
type ParameterSchemaSpec = {
  [key: string]: ParameterPropertySpec
  [key: symbol]: never
}
```

`{ type: 'json' }`은 `JsonValue`로 추론되고 주석만 있는 비제약 원시 스키마로 컴파일됩니다. 출력 루트는 객체, 배열, 스칼라, null일 수 있습니다. `InferValue<S>`는 리터럴 제약과 객체 개방성을 16개 컨테이너 수준까지 존중한 뒤, TypeScript의 타입 인스턴스화 스택을 소진하지 않도록 `JsonValue`로 대체합니다. `InferArgs<P>`는 속성별 필수 여부를 필수/선택 문자열 키로 바꿉니다.

```ts type-equiv
/**
 * Infer the TypeScript value accepted by an author-facing value schema. Exact
 * inference is bounded to 16 container levels, then falls back to `JsonValue`.
 */
type InferValue<S> = InferValueAt<S, []>
```

```ts type-equiv
/** Infer the TypeScript argument object for an implicit parameter schema. */
type InferArgs<S> = InferProperties<S, []>
```

`defineTool({ name, description, parameters, output, execute, … })`은 매개변수 추론을 `parameterSchemaSpecToJsonSchema()`와 `validateArgs()`에 묶고, `execute`/`render`/`presentationMeta`를 `InferValue<OutputSchema>`에 묶습니다. 스키마 레코드는 자체 열거 가능한 문자열 키만 담고 스키마 배열은 밀집된 고유 배열이므로, 추론과 컴파일과 검증이 같은 선언을 관찰합니다. 추론은 16개 컨테이너 수준까지 정확하게 유지되다가 `JsonValue`로 넓어지며, 런타임 검증은 전체 스키마를 계속 순회합니다. `valueSchemaSpecToJsonSchema()`는 출력 선언을 동일하게 강제된 원시 부분 집합으로 컴파일합니다. 매개변수 불일치는 `ToolArgsError`(`INVALID_ARGS`)를, 잘못된 본문이나 정책 후 값은 `ToolOutputError`(`INVALID_TOOL_OUTPUT`)를 던집니다. 둘 다 일반 도구 오류 경로를 사용합니다. 원시 JSON 스키마는 기본적으로 열려 있으며, 지원되지 않는 키워드는 강제 없이 수용되는 대신 거부됩니다.

등록은 신뢰된 동일 프로세스 계약입니다. 레지스트리는 타입 지정 정의를 읽기 전용 입력으로 차용하고, `output`을 요구하며, 해당 원시 스키마를 검증하고, 양의 유한한 `timeoutMs` 같은 시맨틱 요구 사항을 확인합니다. `schemas()`는 요청을 만들 때 모델이 보는 투영을 구성하므로, 실행과 표현이 콜백을 와이어에 흘리지 않고 하나의 해석된 정의를 공유합니다.

## `ToolRestriction` — 상속하는 도구에 대한 한 scope의 실시간 필터

`ToolRestriction`은 scope가 상속하는 도구에 적용됩니다. 즉 배포 전역 계층과 그 체인의 모든 상위 scope입니다. 레지스트리는 읽기 전용 이름을 비공개 집합으로 컴파일하고, 여러 restriction을 교집합한 뒤, scope 자신의 등록을 덧씌웁니다. 자신의 등록은 위임된 자식이 자신을 통해 응답하는 도구를 유지하도록 예외로 남습니다. 거부 전용 필터는 나중에 추가된 미등재 상속 도구를 허용하는 반면, 허용 목록은 이를 배제합니다.

```ts type-equiv
/**
 * Per-scope filter over global tools. Restrictions intersect and do not affect
 * scoped registrations or the reserved PTC mode transport.
 */
interface ToolRestriction {
  /** Global tool names that stay visible; everything else is removed. */
  readonly allow?: readonly string[]
  /** Global tool names removed from visibility. */
  readonly deny?: readonly string[]
}
```

## 조건부 활성화 — 단계가 소유하는 허용

등록은 `when` 조건을 가질 수 있습니다. AgentLoop는 제안된 각 단계마다 캡처된 모델 선택과 함께 `ctx.tools.resolve()`를 한 번 호출하고, 반환된 집합이 그 단계의 도구 선언, 실행기 섹션, 배치의 모든 호출(PTC 프로그램 하위 호출 포함)을 결정합니다. `ctx.tools.executable()`은 실행 시점에 그 집합을 적용하며, 집합이 없으면 조건부 등록을 제외합니다. 같은 이름의 교체나 새로운 restriction은 시작되지 않은 호출이 허용된 등록을 사용하지 못하게 하고, 루프는 단계의 배치가 끝나면 그 집합을 폐기합니다.

```ts type-equiv
/** Inputs for a tool's step-time activation condition. */
interface ToolActivationContext {
  /** Agent preparing the step. */
  readonly agent: Agent
  /** Provider, model, and optional reasoning effort captured for the step. */
  readonly modelSelection: Readonly<ModelSelection>
  /** Cancellation of step preparation; asynchronous conditions must observe it. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Lifecycle-owned conditions for a registered tool. */
interface ToolRegistrationOptions {
  /**
   * Decide whether the step's requests may call the tool. Omission enables
   * it. False excludes it from both declarations and dispatch; rejection fails
   * step preparation. Conditions must not mutate registrations or start tool work.
   * @param context - preparing agent, captured model selection, and cancellation signal.
   * @returns whether the tool participates in this step.
   */
  readonly when?: (context: ToolActivationContext) => boolean | Promise<boolean>
}
```

```ts type-equiv
/** One step's admitted registrations, also used by nested PTC calls. */
interface ResolvedToolSet {
  /** Close admission after the step's tool batch settles. */
  dispose(): void
  /**
   * Read admitted registrations that remain visible in their original scope.
   * @param scope - exact requesting agent; another scope is never admitted.
   * @returns original definitions excluding removed or restricted registrations.
   */
  view(scope: ScopeKey | undefined): ReadonlyMap<string, ToolDefinition>
}
```

## 실행기와 원시 호출 배치

`ctx.tools.execute()`는 완전한 원시 모델 호출 배치를 가장 가까운 scope 실행기에 위임합니다. 서비스는 각 배치가 시작될 때 현재 제공자를 선택하고, 프롬프트 조립은 모델 입력만 반환합니다. 독립 서비스 호출에는 `agent`가 없고, 초기화 훅처럼 모델 단계 밖의 프로그래밍 방식 호출에는 `log`가 없습니다. `log`가 없는 에이전트도 도구 접근 범위를 정하지만 루트 호출/결과 이벤트를 만들지 않습니다. 도구가 소유한 이벤트는 여전히 그 세션을 사용할 수 있습니다.

```ts type-equiv
/** Model-call schemas produced by an executor. */
type ToolModelInput = Pick<ToolProviderResult, 'schemas' | 'knownNames'>
```

```ts type-equiv
/** Raw model calls, with optional Agent ownership and model-step logging. */
interface ToolBatchInput {
  readonly calls: readonly ToolCallBlock[]
  readonly signal: AbortSignal
  /**
   * Positive integer overriding the executor's concurrency limit for this batch.
   * Applies to concurrency-safe root calls; program subcall limits remain separate.
   * Undefined uses the executor's configured limit.
   */
  readonly maxParallelToolCalls?: number
  /**
   * Owning Agent supplies scoped tools and execution context, including outside a turn.
   * Undefined for standalone calls outside an Agent, such as a service invocation.
   */
  readonly agent?: Agent
  /**
   * Step admission for every call in the batch, including program subcalls.
   * Undefined admits only unconditional registrations.
   */
  readonly toolSet?: ResolvedToolSet
  /**
   * Committed model step receiving root call/result events; requires `agent`.
   * Undefined when `agent` is absent or for calls outside a model response, such
   * as session initialization hooks. Without `log`, root call/result events are
   * omitted while `agent`, when provided, still supplies scope and execution context.
   */
  readonly log?: {
    readonly turn: number
    readonly step: number
  }
}
```

```ts type-equiv
/** One settled result correlated with its original model call. */
interface ToolCallResult {
  readonly callId: ToolCallId
  readonly result: ToolExecutionResult
}
```

```ts type-equiv
/** Model-ordered outcomes and context accepted for the next step. */
interface ToolBatchResult {
  readonly results: readonly ToolCallResult[]
  readonly additionalContexts: readonly UserMessage[]
  readonly concluded: boolean
}
```

```ts type-equiv
/** A plugin owns argument parsing, dispatch, scheduling, cancellation, and logging. */
interface ToolExecutor {
  /** Guidance registered and disposed with this executor; absent means no executor-owned sections. */
  readonly sections?: readonly ToolPromptSection[]
  /**
   * Describe the model's callable tools.
   * @param tools - currently visible capability definitions, after scoped restrictions.
   * @returns schemas and names used to validate tool ordering.
   */
  describe(tools: readonly ToolDefinition[]): ToolModelInput
  /**
   * Execute a complete batch. With log, commit root call/result events to the
   * Agent's Session; without log, omit those events. Tool-owned events may still
   * use the owning Agent's Session. Return
   * one outcome per input call in input order, including skipped calls on abort.
   * Never settle while started work is still running. Internal failures reject
   * with ToolBatchExecutionError after draining, preserving committed outcomes
   * and context; callers must stop dependent work and repair missing log results.
   * An explicit maxParallelToolCalls takes precedence over executor configuration.
   * @param input - original calls, cancellation, optional concurrency override, Agent and logging step.
   * @returns settled results, deferred context, and whether a success concludes the turn.
   */
  execute(input: ToolBatchInput): Promise<ToolBatchResult>
}
```

## 실행: 확장 가능한 워터폴과 단조 정책

기본 실행기는 파싱된 `ToolExecutionInput` 값을 공유 `ToolExecutionPipeline`에 전달합니다. 파이프라인은 인자 스냅샷, 실행 식별자, 정책 워터폴, 디스패치, 최종 결과 통지를 소유하며 호출마다 `ToolExecutionResult` 하나를 반환합니다. 사용자 지정 실행기는 자체 실행을 구현할 수 있습니다. 공개 `ToolExecutor`는 설명과 배치 실행만 요구합니다.

```ts type-equiv
/** Opaque call identity that permits correlation without exposing mutable execution state. */
type ToolExecutionToken = symbol & { readonly [toolExecutionTokenBrand]: true }
```

```ts type-equiv
/**
 * Parsed input to the shared invocation pipeline. The pipeline
 * adds its own token to form a {@link ToolExecution};
 * callers do not choose that token.
 */
interface ToolExecutionInput {
  readonly callId: ToolCallId
  /**
   * Root model-requested call owning this execution tree. Callers omit it for
   * a root execution; nested dispatchers propagate the enclosing value.
   */
  readonly rootCallId?: ToolCallId
  readonly name: string
  /** Binding-time tool schema for a PTC inner call; frozen by its producer and never logged. */
  readonly schema?: ToolSchema
  /** Losslessly JSON-serializable parsed arguments (tools validate their own schema). */
  readonly arguments: unknown
  /** The agent on whose behalf the call runs (set by the agent loop). */
  readonly agent?: Agent
  /** Step admission shared by Native and PTC dispatch. Conditional tools require it. */
  readonly toolSet?: ResolvedToolSet
  /**
   * Opaque token of the enclosing transport execution, when one exists. PTC
   * mode sets this on SDK sub-dispatches so commit-style observers can wait for
   * the outer `run_code` outcome without receiving its live mutable execution.
   * The token also marks the call as a transport sub-dispatch rather than a
   * model-direct call: with the PTC executor selected, only calls with a parent may
   * execute a native tool name — a model-direct call (no parent) is denied as
   * `UNKNOWN_TOOL` before the policy pipeline.
   */
  readonly parent?: ToolExecutionToken
  /** Required caller-owned cancellation for this invocation. */
  readonly signal: AbortSignal
}
```

도구 본문은 런타임 확장을 받습니다. `deferContext()`는 아직 열려 있는 외부 호출 안에 주입하지 않고 실행 자체의 결과에 컨텍스트를 붙입니다. 이는 복합 도구의 중첩 디스패치 채널이며, 플러그인에서 온 지시를 만드는 리프 도구도 사용할 수 있습니다.

```ts type-equiv
/**
 * Runtime context handed to a tool implementation after the executor has
 * accepted a {@link ToolExecution}. {@link deferContext} attaches context to
 * this execution's own result — a composite tool ferries nested-dispatch
 * context back to the outer result, and a leaf tool may mint a fresh
 * plugin-sourced instruction; the loop appends it only after the
 * `tool/result`.
 */
interface ToolRunContext extends ToolExecution {
  /**
   * Defer one context — typically a nested-dispatch context ferried by a
   * composite tool, or a fresh plugin-sourced instruction — until this tool's
   * final result reaches the agent loop. Contexts retain their individual
   * source and metadata and are emitted in call order.
   */
  deferContext(context: UserMessage): void
  /**
   * Mark a successful final result as terminal for the current agent turn.
   * The marker rides this execution's own result (`concludesTurn` exists only
   * on {@link ToolExecutionSuccess}); a composite that dispatches nested
   * calls forwards it from the nested result, exactly like
   * `additionalContexts`, so only an authoritative nested success can
   * conclude the enclosing run.
   */
  concludeTurn(): void
}
```

에이전트 루프는 대기 중인 각 호출의 실행 모드를 레지스트리에 묻고, 이를 사용해 배타적 배리어와 롤링 풀 병렬 실행을 구성합니다:

```ts type-equiv
/**
 * Scheduling mode for one pending call. `parallel` may overlap with siblings;
 * `exclusive` runs alone and forms an ordering barrier.
 */
type ToolExecutionMode =
  | { kind: 'parallel' }
  | { kind: 'exclusive' }
```

PTC 바인딩은 생성 시점에 ToolSchema를 고정하고 스케줄러를 거쳐 `ToolExecution.schema`로 전달합니다. 이는 일시적인 실행 메타데이터입니다. 정책 이전에 실제로 시작된 각 하위 디스패치는 페어링 id, 이름, 정규화된 인자만 기록합니다. 시작 및 완료(settlement) 이벤트 모두 description, parameters, schema를 직렬화하지 않습니다. 브리지는 나중에 완료된(settled) 호출을 `tools/ptc-dispatch-log` 워터폴에 노출하며, 그 워터폴은 프로그램 값, 모델이 보는 외부 결과, 구조화된 실패 식별자를 보존하면서 영속 콘텐츠 사본을 바꿀 수 있습니다:

```ts type-equiv
/**
 * One settled `run_code` sub-dispatch about to be logged, as seen by the
 * `tools/ptc-dispatch-log` waterfall: the parent execution (session owner,
 * outer call identity), the sub-call identity, and the outcome whose durable
 * copy a listener may reshape. `content` is the RENDERED result projection
 * (what a native `tool/result` would carry) — the program itself received
 * the structured `value` (or just the error message on failure); only the
 * `tool/ptc-dispatch` event's copy changes.
 */
interface PtcDispatchLog {
  /** The outer `run_code` execution. */
  readonly exec: ToolExecution
  /** The calling agent (the scope routing key and the spill owner), when the outer call has one. */
  readonly agent?: Agent
  /** Opaque sub-call id; new calls use `<parent>:ptc:<n>`. */
  readonly subCallId: ToolCallId
  /** The dispatched sub-tool name. */
  readonly name: string
  /** Whether the sub-call settled as an error. */
  readonly isError: boolean
  /** The sub-call's complete model-facing content (the settle event's default payload). */
  readonly content: ContentBlock[]
}
```

```ts type-equiv
/**
 * One pending tool call inside the executor pipeline. Parsed arguments cross
 * one lossless-JSON materialization boundary before policy and are deep-frozen;
 * call identity, the caller signal, and the executor-assigned {@link token} are
 * readonly. The executor freezes the complete object before `tools/result`
 * observers run.
 */
interface ToolExecution extends ToolExecutionInput {
  /** Root model-requested call, resolved for every root and nested execution. */
  readonly rootCallId: ToolCallId
  /** Executor-assigned identity shared with nested calls only as their opaque `parent` token. */
  readonly token: ToolExecutionToken
}
```

```ts type-equiv
/**
 * Around-dispatch view of a {@link ToolExecution}. A `tools/execute` wrapper
 * may replace the signal for its delegated lifetime, but it cannot remove it.
 * The executor fuses every replacement with the captured caller signal.
 */
interface ToolDispatchExecution extends Omit<ToolExecution, 'signal'> {
  /** Cancellation signal visible to the next wrapper or tool body. */
  signal: AbortSignal
}
```

`ToolExecutionToken`은 식별 비교에만 쓰이는 불투명 런타임 `Symbol`입니다. 정책 이전에 `execute()`는 인자를 구체화하고 동결하며, JSON이 아닌 입력을 거부하고, 토큰을 할당합니다. 식별자 필드, 필수 호출자 시그널, 선택적 부모 토큰은 읽기 전용으로 남습니다. `ToolDispatchExecution` 래퍼는 시그널을 교체할 수 있지만 제거할 수는 없으며, 레지스트리는 본문을 호출하기 전에 호출자 시그널을 다시 융합합니다. 최종 관찰자는 동결된 실행 식별자를 받습니다.

`ToolGuard`는 scope를 인지하는 최종 사전 디스패치 정책입니다. 반환 타입에는 의도적으로 허용 결과가 없습니다. `undefined`는 워터폴 결정을 보존하고, 반환된 사유는 권한을 줄일 수만 있으므로 나중 리스너가 이를 되돌릴 수 없습니다.

```ts type-equiv
/**
 * A monotonic execution guard evaluated after every `tools/pre-execute`
 * listener and before the tool body. Returning a reason denies the call;
 * returning `undefined` leaves it unchanged. Because guards have no allow
 * result, listener ordering cannot turn a denial back into permission.
 * @param execution - the identity-protected call after extensible pre-execute policy completed.
 * @returns a final denial reason, or `undefined` to leave the call allowed.
 */
type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

```ts type-equiv
/** Canonical failure detail; internal routing information remains optional. */
interface ToolFailure {
  /** Human-readable failure message without the Native `Error: ` envelope. */
  message: string
  /** Internal error class/code used by policy and durable diagnostics. */
  info?: ToolErrorInfo
}
```

```ts type-equiv
/** Successful canonical tool execution, including its Native/model projection. */
interface ToolExecutionSuccess {
  readonly isError: false
  /** Execution-local canonical value; deliberately omitted from durable events. */
  readonly value: JsonValue
  readonly content: ContentBlock[]
  readonly error?: never
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  /** The agent loop stops after committing this successful result batch. */
  readonly concludesTurn?: true
}
```

```ts type-equiv
/** Failed canonical tool execution; failures never carry a successful value. */
interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure
  readonly value?: never
  readonly content: ContentBlock[]
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  readonly concludesTurn?: never
}
```

```ts type-equiv
/** The discriminated, execution-local outcome of one tool call. */
type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure
```

```ts type-equiv
/** Structured error metadata for a failed tool call (alongside the model-facing text). */
interface ToolErrorInfo {
  name: string
  code: string
  /** Optional raw user-facing detail; durable projections preserve it but model-facing content does not include it. */
  reason?: string
}
```

결과는 성과만 담습니다. 호출 식별자는 모든 훅을 거치며 결과에 동반되는 불변 `ToolExecution`과 영속 `tool/call` / `tool/result` 세션 이벤트에 남으므로, 래퍼가 두 번째로 불일치하는 식별자를 만들 수 없습니다. 정규 `value`는 실행 로컬입니다. 루프는 `content`, `error`, `meta`만 영속하고, `tool/ptc-dispatch`는 하위 호출의 렌더링된 `content`, `isError`, 선택적 구조화 `error`, 표현 `meta`를 저장합니다. 재생은 표현을 재현하지만 정규 중간 값은 재구성할 수 없습니다. 선택적 `ToolErrorInfo.reason`은 모델이 보는 콘텐츠에 넣지 않고 사용자 대상 원시 세부 정보를 유지합니다.

성공하면 레지스트리는 본문 값을 스냅샷하고 검증하고 동결한 뒤, 순수 렌더러와 선택적 표현 메타데이터 프로젝터를 네이티브 및 중첩 호출에 대해 호출합니다. `tools/result` 직전에 영속 표현 필드를 별도로 구체화하며, 유효하지 않은 값, 렌더러/프로젝터 실패, JSON이 아닌 표현은 JSON 안전한 `isError`가 됩니다. 따라서 최종 라이브 관찰자는 이후 영속 추가에 안전한 필드 옆에서 실행 로컬 값을 정확히 봅니다.

최종 콘텐츠 이전에 레지스트리는 후보 결과를 구체화하며, 콘텐츠, 구조화 오류, 추가 컨텍스트, 표현 메타데이터의 실패는 `finalizeContent`에도 도달하는 JSON 안전한 `isError` 결과가 됩니다. 레지스트리는 그 콜백을 정확히 한 번 호출한 뒤, `tools/result` 직전에 수용된 결과를 구체화하고 동결하므로, 관찰된 라이브 결과는 이후 영속 `tool/result` 추가에 안전합니다.

각 인터셉션 워터폴은 타입 지정된 **Decision**을 반환합니다(`agent/*` 워터폴과 공유하는 관용구). `tools/pre-execute` 리스너는 `(exec, next)`를 받고 `PreToolDecision`을 반환하며, `tools/execute` 래퍼는 `ToolExecutionResult`를 반환하고, `tools/post-execute` 리스너는 `(exec, result, next)`를 받고 `PostToolDecision`을 반환합니다:

```ts type-equiv
/**
 * Pre-dispatch decision. `allow` runs the call; `deny` materializes its
 * model-facing reason and optional structured error identity; `cancel` selects
 * the canonical cancellation result without presenting a policy denial; `ask`
 * runs only after an approval service returns `allowed-once` and otherwise
 * denies; its `reason` is the audited approval reason and its optional
 * `displayReason` is the localized prompt text. Input rewriting is excluded because arguments are already logged and
 * presented.
 */
type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string; info?: ToolErrorInfo }
  | { kind: 'cancel' }
  | { kind: 'ask'; reason?: string; displayReason?: { readonly en: string; readonly [locale: string]: string } }
```

```ts type-equiv
/**
 * Post-dispatch decision: accept, replace one projection, attach context for the
 * next request, or block by turning corrective feedback into an error result.
 */
type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

기본 동작을 원하면 `next()`를 호출하고, 단락하려면 결정을 반환하세요. 사전 정책은 거부하거나 물을 수 있습니다. `allowed-once`만 진행하며, 비허용, 승인 채널이나 서비스 누락, 에이전트 없는 요청은 거부가 됩니다. 거부는 모델이 보는 사유를 바꾸지 않고 구조화된 식별자와 사용자 대상 세부 정보를 붙일 수 있습니다. 가드는 여전히 최종 거부를 부과할 수 있습니다. 이력, 감사, UI, 실행이 일치해야 하므로 인자는 다시 쓸 수 없습니다.

사후 정책은 콘텐츠나 값 중 하나만 바꿀 수 있고 둘 다는 안 됩니다. 콘텐츠 교체는 정규 값과 기존 메타데이터를 보존하고, 값 교체는 재검증되어 콘텐츠/메타데이터를 다시 계산합니다. 차단은 값을 제거하고 교정 피드백을 담은 `isError`가 됩니다. 콘텐츠 교체는 표현 정책이지 기밀성 정책이 아닙니다. 프로그램 값을 숨겨야 하는 리스너는 차단하거나 교체합니다. `tools/result`는 정규화 후 동결된 실행과 결과를 받으며, 관찰자는 이를 변환할 수 없고 관찰자 실패는 격리됩니다. 알 수 없는 도구와 throw하는 도구는 모두 구조화된 오류가 되므로(`ToolNotFoundError`는 `UNKNOWN_TOOL`로 매핑), 호출은 턴을 끝내지 않고 실패합니다.

## 강제되는 원시 JSON 스키마 부분 집합

서브에이전트, 워크플로, MCP, 동적 등록의 원시 스키마는 작성자 DSL의 와이어 수준 대응물을 사용합니다. `assertSupportedJsonSchema()`는 모든 JSON 루트를 받고, `validateJsonSchemaValue()`가 이를 강제하며, `JsonSchemaError`가 지원되지 않거나 잘못된 모든 스키마 경로를 보고합니다. 주석만 있는 빈 노드는 비제약 무손실 JSON을 뜻합니다. `oneOf`는 최소 두 분기가 필요하고 값은 정확히 하나와 일치해야 합니다. 여전히 객체 루트를 요구하는 소비자는 `assertObjectJsonSchema()`를 호출하고 `ObjectJsonSchema`를 나릅니다. 이렇게 하여 서브에이전트/워크플로 호출자가 정의한 구조화 출력이 공유 어휘를 제한하지 않으면서 객체 루트를 유지합니다.

```ts type-equiv
/** Scalar JSON values supported by `enum` and `const`. */
type JsonSchemaScalar = string | number | boolean | null
```

```ts type-equiv
/** Single-type keywords accepted by the enforced subset. */
type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
```

```ts type-equiv
/**
 * One raw JSON Schema node in the enforced subset. The optional fields express
 * the external wire schema; {@link assertSupportedJsonSchema} rejects invalid
 * combinations before a caller treats the node as trusted.
 */
interface JsonSchemaNode {
  /** Omit with no constraints for any JSON value, or use `oneOf`. */
  type?: JsonSchemaType
  /** Exactly one branch must validate; at least two branches are required. */
  oneOf?: JsonSchemaNode[]
  /** Nested property schemas (`type: 'object'` only). */
  properties?: Record<string, JsonSchemaNode>
  /** Required property names; each must appear in `properties`. */
  required?: string[]
  /** `false` rejects undeclared keys; absent/`true` follows JSON Schema's open default. */
  additionalProperties?: boolean
  /** Item schema (`type: 'array'` only); absent accepts any JSON item. */
  items?: JsonSchemaNode
  /** Allowed values for a scalar node. */
  enum?: JsonSchemaScalar[]
  /** The single allowed value for a scalar node. */
  const?: JsonSchemaScalar
  /** Annotation, ignored for validation. */
  description?: string
  /** Annotation, ignored for validation. */
  title?: string
  /** Annotation, ignored for validation but required to be lossless JSON. */
  default?: JsonValue
  /** Annotation, ignored for validation but required to be lossless JSON. */
  examples?: JsonValue
}
```

```ts type-equiv
/** A consumer-constrained object-rooted schema. */
type ObjectJsonSchema = JsonSchemaNode & { type: 'object' }
```

## 도구 표현 UI 어휘

도구가 UI(편집기 도구 호출 카드, CLI 로그 줄)에서 자기 호출을 어떻게 보여주길 원하는지를 나타내며, 특정 클라이언트 프로토콜에 의존하지 않고 도구가 스스로를 설명하도록 제공자 중립적입니다. `presentCall`/`presentResult`는 UI 브리지가 분기하는 판별 유니온인 **`card` 태그 렌더 의도**를 반환합니다:

- `ToolCallView`(대기 중): `{ card: 'generic', title, kind?, rawInput?, content?, locations? }`(기본 카드이며, `locations`는 호출이 읽거나 수정하는 `{ path, line? }[]` 파일로 편집기 추적용입니다), `{ card: 'terminal', title, description?, cwd? }`(셸 명령 → 터미널 카드), 또는 `{ card: 'diff', title, diffs, locations? }`(파일 생성/수정 → 인라인 diff 카드이며, `diffs`는 `{ path, oldText, newText }[]`이고 새 파일이면 `oldText: null`입니다).
- `ToolResultView`(완료): `{ card: 'generic', title?, content? }`, `{ card: 'terminal', title?, output?, exitCode?, signal? }`(캡처된 실행 출력 + 종료 상태이며, 이를 지원하는 UI는 종료 상태 알약을 보여주고 다른 UI는 펜스된 ` ```console ` 폴백을 만들 수 있습니다), `{ card: 'diff', title?, diffs }`(완료된 파일 변경 → 표시할 변경으로, 보통 before/after 콘텐츠에서 컨텍스트 줄을 계산한 적용 헝크이며 before 이미지가 없으면 전체 파일 diff입니다), `{ card: 'search', shape, title?, truncated, total, … }`(완료된 탐색 검색 → `shape: 'matches'`(grep)이면 파일별로 묶인 일치, `shape: 'paths'`(glob)이면 평평한 경로 목록이며, `truncated`/`total`은 인라인 결과가 잘렸는지 보고해 UI가 부분 결과를 완전한 것으로 제시하지 않게 합니다. 이 뷰는 결과 텍스트를 담지 않으며, 검색 카드가 없는 UI는 원시 결과 콘텐츠로 폴백합니다), `{ card: 'read', title?, path, offset, lines, totalLines, lang?, content? }`(완료된 파일 읽기 → 줄 번호가 있고 선택적으로 구문 강조된 코드 뷰이며, `offset`은 창이 요청한 1 기반 첫 줄로 `lines`가 비어 있어도 유지되고, `lang`은 확장자에서 온 언어 힌트이며, `content`는 read 지원이 없는 UI가 폴백하는 엔벨로프 제거 텍스트입니다), 또는 `{ card: 'web', kind: 'search' | 'fetch', title?, … }`(완료된 웹 검색/가져오기이며, `kind: 'search'`는 구조화된 `sources`/`answer?`/`truncated`를, `kind: 'fetch'`는 `url`/`statusCode`/`truncated`를 담고, `web` 기능이 없는 UI는 원시 결과 콘텐츠로 폴백합니다. 본문은 뷰에 중복되지 않습니다). 완료 뷰는 대기 뷰를 대체하므로, 변경 도구는 호출 시 스니펫을 중복하더라도 diff 결과를 반환합니다. 검색과 웹 검색/가져오기에는 `card` 호출 시 대응물이 없습니다(구조화 결과는 `execute` 이후에만 존재하므로 대기 상태는 일반 카드로 남습니다).

`ToolCallKind`(`'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'fetch' | 'other'`)는 일반 카드에서 아이콘을 고릅니다. `FileLocation`(`{ path, line? }`), `FileDiff`(`{ path, oldText, newText }`), `ReadFileLine`(`{ number, text }`, 읽기 창의 1 기반 번호 한 줄)은 공유 파일 카드 어휘입니다. 설계는 [렌더 의도 유니온 Agent Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md)에 고정되어 있으며, 호스트/클라이언트 런타임이 이 중립 어휘를 자체 뷰로 투영합니다.

전체 표현 필드 문서는 [`packages/core/tools/src/presentation.ts`](../../packages/core/tools/src/presentation.ts)에 있습니다. `bash` 스키마와 실행기는 [shell.md](shell.ko.md)에, 일반 백그라운드 제어는 [jobs.md](jobs.ko.md)에 있습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtools--toolsservice"></a>

### `ctx.tools` — `ToolsService`

Concrete tool registry and scoped executor dispatcher.

```ts cordis-catalog
/**
 * Register globally or in the calling agent scope. Scoped tools shadow
 * globals; duplicates within one layer and the reserved `run_code` name fail.
 * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
 * @param options - optional step-time activation condition.
 * @returns the exact disposer that unregisters the tool.
 */
register(definition: ToolDefinition, options: ToolRegistrationOptions = {}): () => void

/**
 * Restrict global tools for the calling agent scope. Empty filters, unknown
 * names, scope-local names, and reserved transport names fail. Restrictions
 * intersect; scoped registrations remain visible.
 * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
 * @returns the exact disposer that lifts this restriction.
 */
restrict(filter: ToolRestriction): () => void

/**
 * Look up a tool as one scope sees it (scoped
 * shadows global; a restricted-away global reads as absent). Presenters pass
 * the calling agent so the rendered card matches the definition that
 * actually executed.
 * @param name - the tool name as registered.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @param toolSet - step admission; omit only to inspect registered definitions.
 * @returns the definition the scope resolves, or undefined when none is visible.
 */
get(name: string, scope?: ScopeKey, toolSet?: ResolvedToolSet): ToolDefinition | undefined

/**
 * Resolve the definition a call may execute. With a step's admitted set, the
 * set decides; without one, conditional registrations are unavailable.
 * @param name - the tool name as registered.
 * @param scope - the calling agent; omitted = the global view.
 * @param toolSet - step admission, or omitted for a call outside a model step.
 * @returns the executable definition, or undefined when the call must fail as `UNKNOWN_TOOL`.
 */
executable(name: string, scope?: ScopeKey, toolSet?: ResolvedToolSet): ToolDefinition | undefined

/**
 * Resolve conditions once for this step without changing shared registrations.
 * Cancellation or a rejected condition publishes no partial selection. Removed
 * registrations cannot be restored by a late condition result.
 * @param context - preparing agent, captured model selection, and cancellation.
 * @returns the complete selection; the caller disposes it after its tool batch settles.
 */
async resolve(context: ToolActivationContext): Promise<ResolvedToolSet>

/**
 * Read the visible capability definitions for descriptions and program bindings.
 * @param scope - viewing Agent or preset; omitted selects the global view.
 * @param toolSet - step admission; omit only to inspect registered definitions.
 * @returns definitions after scoped shadowing and restrictions, limited to the step's admission when given.
 */
definitions(scope?: ScopeKey, toolSet?: ResolvedToolSet): readonly ToolDefinition[]

/**
 * Project visible definitions onto the allowlisted model-facing schema fields,
 * excluding execution and presentation callbacks.
 * @param scope - the viewing scope (the agent); omitted = the global view.
 * @param toolSet - step admission, or omitted for registered-definition inspection.
 * @returns one deep-cloned schema per visible tool.
 */
schemas(scope?: ScopeKey, toolSet?: ResolvedToolSet): ToolSchema[]

/**
 * Provide the executor for the calling scope; an unscoped contribution is the deployment default.
 * Rendering any executor-owned section requires the viewing scope's selection to remain available.
 * @param executor - initialized provider owned by the contributing plugin.
 * @returns the effect disposer. Unloading leaves the selection unavailable until it is replaced.
 */
setExecutor(executor: ToolExecutor): () => void

/**
 * Delegate a raw call batch to its Agent's provider or the deployment default.
 * Select at dispatch; accepted batches settle through that provider even if it unloads.
 * @param input - original calls, optional owning Agent, and optional logging step.
 * @returns the selected executor's settled batch; unavailable selections reject.
 */
async execute(input: ToolBatchInput): Promise<ToolBatchResult>

/**
 * Register a monotonic denial in the calling scope.
 * @param guard - evaluated after extensible pre-execute policy by the shared pipeline.
 * @returns the effect disposer that removes this guard.
 */
guard(guard: ToolGuard): () => void

/**
 * Check global and inherited guards after pre-execute policy and approval resolve.
 * @param exec - invocation whose guards are checked before dispatch.
 * @returns the first denial reason, or undefined when no guard denies.
 */
checkGuards(exec: ToolExecution): string | undefined
```

Types: [ScopeKey](scope.ko.md)

Source: [`packages/core/tools/src/index.ts`](../../packages/core/tools/src/index.ts)

<a id="tools-events"></a>

### `tools/*` events

<a id="toolschange--emit"></a>

#### `tools/change` — emit

A tool was registered or unregistered, or a scoped restriction changed. Unfiltered registry notification: scoped listeners receive changes from every scope because a global contribution can affect every agent's next assembly.

```ts cordis-catalog
/**
 * A tool was registered or unregistered, or a scoped restriction changed.
 * Unfiltered registry notification: scoped listeners receive changes from every
 * scope because a global contribution can affect every agent's next assembly.
 * @mode emit
 */
'tools/change'(): void
```

Source: [`packages/core/tools/src/events.ts`](../../packages/core/tools/src/events.ts)

<a id="toolsexecute--waterfall"></a>

#### `tools/execute` — waterfall

Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns a normalized result; wrappers may change only `exec.signal`, while call identity remains immutable. The registry re-fuses the original caller signal before the body, so replacement cannot detach caller cancellation; wrappers must still restore their signal and reach quiescence. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Around-dispatch waterfall for timeout, retry, or metrics. `next()` returns
 * a normalized result; wrappers may change only `exec.signal`, while call
 * identity remains immutable. The registry re-fuses the original caller
 * signal before the body, so replacement cannot detach caller cancellation;
 * wrappers must still restore their signal and reach quiescence.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the allowed call about to dispatch (name, parsed arguments, caller agent, signal).
 * @mode waterfall
 */
'tools/execute'(this: Scoped<ToolsService>, exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/tools/src/events.ts`](../../packages/core/tools/src/events.ts)

<a id="toolspost-execute--waterfall"></a>

#### `tools/post-execute` — waterfall

Accept, replace, enrich, or block a normalized dispatch result. `next()` accepts it unchanged; thrown tools still reach this waterfall as errors. Async listeners must observe `exec.signal`; after they settle, caller cancellation replaces only a successful accepted outcome with the code selected by whether the tool body was invoked. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Accept, replace, enrich, or block a normalized dispatch result. `next()`
 * accepts it unchanged; thrown tools still reach this waterfall as errors. Async
 * listeners must observe `exec.signal`; after they settle, caller
 * cancellation replaces only a successful accepted outcome with the code
 * selected by whether the tool body was invoked.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the call that just ran (name, parsed arguments, caller agent).
 * @param result - the dispatch outcome a listener may accept, replace, or block.
 * @mode waterfall
 */
'tools/post-execute'(this: Scoped<ToolsService>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/tools/src/events.ts`](../../packages/core/tools/src/events.ts)

<a id="toolspre-execute--waterfall"></a>

#### `tools/pre-execute` — waterfall

Allow, deny, cancel, or ask before dispatch. `next()` delegates to allow; `cancel` selects the canonical pre-dispatch cancellation result, and missing approval support turns `ask` into denial. Async gates must observe `exec.signal`; the registry rechecks cancellation after they settle but never abandons their promise. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.

```ts cordis-catalog
/**
 * Allow, deny, cancel, or ask before dispatch. `next()` delegates to allow;
 * `cancel` selects the canonical pre-dispatch cancellation result, and missing
 * approval support turns `ask` into denial. Async gates must observe
 * `exec.signal`; the registry rechecks cancellation after they settle but
 * never abandons their promise.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's calls.
 * @param exec - the pending call (name, parsed arguments, caller agent).
 * @mode waterfall
 */
'tools/pre-execute'(this: Scoped<ToolsService>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/tools/src/events.ts`](../../packages/core/tools/src/events.ts)

<a id="toolsptc-dispatch-log--waterfall"></a>

#### `tools/ptc-dispatch-log` — waterfall

Allow a listener to replace content in the DURABLE LOG COPY of one `run_code` sub-dispatch outcome before the bridge appends its `tool/ptc-dispatch` event. `next()` keeps the content unchanged; a listener may return replacement blocks (e.g. the spill policy's preview + locator for an oversized text result). Only the logged copy is affected — the program already received the complete value, and the model sees neither. A throwing listener is contained: the bridge falls back to logging the original settled content. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.

```ts cordis-catalog
/**
 * Allow a listener to replace content in the DURABLE LOG COPY of one
 * `run_code` sub-dispatch outcome before the bridge appends its
 * `tool/ptc-dispatch` event. `next()` keeps the
 * content unchanged; a listener may return replacement blocks (e.g. the
 * spill policy's preview + locator for an oversized text result). Only the
 * logged copy is affected — the program already received the complete
 * value, and the model sees neither. A throwing listener is contained:
 * the bridge falls back to logging the original settled content.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent's dispatches.
 * @param dispatch - the parent execution, sub-call identity, and the settled content to log.
 * @mode waterfall
 */
'tools/ptc-dispatch-log'(this: Scoped<ToolsService>, dispatch: PtcDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>
```

Types: [ContentBlock](llm-streaming.ko.md) · [Scoped](scope.ko.md)

Source: [`packages/core/tool-executor-ptc/src/runtime-types.ts`](../../packages/core/tool-executor-ptc/src/runtime-types.ts)

<a id="toolsresult--emit"></a>

#### `tools/result` — emit

Observe the frozen, lossless-JSON final outcome. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.

```ts cordis-catalog
/**
 * Observe the frozen, lossless-JSON final outcome. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): keyed by `exec.agent`.
 * @param exec - the execution object that traversed the pipeline.
 * @param result - a deep-frozen snapshot of the final returned result.
 * @mode emit
 */
'tools/result'(this: Scoped<ToolsService>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/tools/src/events.ts`](../../packages/core/tools/src/events.ts)
<!-- END GENERATED cordis-surface -->
