# 워크플로

[English](workflow.md) | [中文](workflow.zh.md) | 한국어

워크플로 seam은 에이전트가 서브에이전트를 시작하는 모델 작성 오케스트레이션 스크립트를 실행하게 합니다. [subagent](subagent.ko.md)처럼 이것은 **선택적 기능 하나**이며 에이전트 루프의 일부가 아니므로, 그 타입과 연산은 [core.md](core.ko.md)가 아니라 이곳에 있습니다. bash처럼 컨텍스트마다 엔진 구현 하나가 `ctx.workflowEngine`을 제공할 수 있으며(이름 있는 제공자 레지스트리가 없습니다. 두 번째 엔진은 나란히 도는 대신 플러그인 구성으로 첫 엔진을 대체합니다).

서비스 정의: [dsh-workflow](../../packages/workflow/workflow)(`ctx.workflowEngine`과 아래 어휘). [dsh-workflow-ptc](../../packages/workflow/workflow-ptc)가 호출 세션의 파일 정책 아래 공유 Node PTC 프로세스 런타임을 통해 VM과 헬퍼를 실행합니다. 소비자는 [dsh-tool-workflow](../../packages/workflow/tool-workflow)와 옵트인 [dsh-tool-ralph](../../packages/experimental/tool-ralph)입니다. 실행 선택지는 [워크플로 샌드박스 재사용](../../.agents/notes/implemented/architecture/2026-09-13-workflow-ptc-sandbox-reuse.md)이, 스크립트 시맨틱은 [동적 워크플로 참조](../../packages/workflow/workflow/README.md)가 소유합니다.

출처: 브라우저 안전 어휘는 [`packages/workflow/workflow/src/types.ts`](../../packages/workflow/workflow/src/types.ts), 호스트 요청과 라이브 실행 핸들은 [`runtime-types.ts`](../../packages/workflow/workflow/src/runtime-types.ts)에 있습니다.

## 시작 요청

호출자가 실행을 시작할 때 요청하는 것입니다. 일반 워크플로 도구는 모델의 `{ script, meta, args }` 호출과 호출 에이전트로 이를 구성하며, 특화 소비자는 실행을 위해 엔진 전역 `subagentProvider` 하나를 선택하고 `maxTotalAgents`를 낮출 수도 있지만 스크립트는 그 정책을 관찰하거나 교체할 수 없습니다. `meta`와 `args`는 평범한 JSON 데이터입니다(엔진이 `meta`를 자기 스키마로 검증하고 아무것도 실행되기 전에 크게 거부합니다. 그것을 얻으려고 스크립트 텍스트가 평가되는 일은 없습니다). `parent`는 필수이며, 스크립트가 시작하는 모든 자식이 그 부모에 귀속되고, cwd, 계보, 깊이가 [subagent seam](subagent.ko.md)을 통해 전달됩니다.

```ts type-equiv
/**
 * What a caller asks for when starting a workflow run. `meta` and `args` are
 * plain JSON data by the seam contract. `parent` is required because every
 * `agent()` spawned by the script is attributed to that live Agent.
 */
interface WorkflowStartRequest {
  /** The plain-JS script body (top-level await allowed; ends with `return <json-value>`). */
  script: string
  /** The workflow's identity block, as plain JSON data (shape-validated by the engine). */
  meta: WorkflowMeta
  /** Optional input exposed verbatim to the script as the `args` global. */
  args?: unknown
  /** Optional engine-wide child-provider override for this run. */
  subagentProvider?: string
  /** Optional per-run total-child ceiling. */
  maxTotalAgents?: number
  /** The agent on whose behalf the run executes (parent of every child). */
  parent: Agent
  /** Cancels the run when aborted. */
  signal?: AbortSignal
}
```

## 워크플로의 정체성: `WorkflowMeta`

시작 요청에 데이터로 담기는 정체성 블록입니다(도구의 `meta` 매개변수이며, 필드 어휘는 Claude Code 동적 워크플로 meta 블록과 같습니다). `phases`는 진행 어휘일 뿐입니다. 즉 `phase()` 호출이 관찰자를 위해 제목과 일치하며, 실행 구조를 암시하지 않습니다.

```ts type-equiv
/**
 * The script's identity block, provided as plain JSON data alongside the
 * script body (the model-facing tool carries it as its `meta` parameter) and
 * validated by the engine before the body runs. `name`/`description` are
 * required; the rest is optional annotation. The field vocabulary matches the
 * Claude Code dynamic-workflows meta block.
 */
interface WorkflowMeta {
  /** Short kebab-case workflow name (display + persistence key). */
  name: string
  /** One-line description of what the workflow does. */
  description: string
  /** Optional guidance on when this workflow applies (shown in listings). */
  whenToUse?: string
  /** Optional phase declarations matched by `phase()` calls. */
  phases?: WorkflowPhase[]
}
```

## 최종 결과: `WorkflowResult`

실행 하나의 결과이며 `WorkflowRun.result`로 해석됩니다. `value`는 스크립트의 구체화된 반환 값으로, 평범한 호스트 영역 JSON 데이터(스크립트가 아무것도 반환하지 않았으면 `null`)이며 `completed`에서만 의미가 있습니다. `stopReason`은 닫힌 유니언(엔진 소유이며 소비자가 철저히 분기할 수 있습니다)으로 `completed` | `cancelled` | `error`입니다. `completed`가 아닌 이유는 `error`에 실패를 담고, 소비자는 부분 출력을 성공으로 보고하는 대신 이를 `isError` 도구 결과로 매핑합니다.

```ts type-equiv
/**
 * The outcome resolved by a live workflow run. `value` is
 * the script's materialized return value (plain host-realm JSON data; `null`
 * when the script returned `undefined`) — meaningful only for `completed`.
 * A non-`completed` reason carries the failure in `error`; the consumer maps
 * it to an `isError` tool result rather than reporting partial output.
 */
interface WorkflowResult {
  /** The script's return value (host JSON data; `null` for no return). */
  value: unknown
  /** Why the run settled. */
  stopReason: WorkflowStopReason
  /** The failure message (present iff `stopReason` is not `completed`). */
  error?: string
  /**
   * How many `agent()` calls the run accepted over its whole lifetime. On a
   * graceful settlement this is the script-side count (calls still queued for
   * a concurrency slot included); on a termination path (cancellation or
   * process failure) it degrades to the host-observed count — calls queued
   * inside a terminated script are unknowable then.
   */
  agentsStarted: number
}
```

## 라이브 실행: `WorkflowRun`

소비자는 `result`를 기다리고, 실행 중에 `cancel`할 수 있으며, 모든 경로에서 `dispose`해야 합니다. `result`는 절대 거부되지 않습니다. 스크립트 실패는 `stopReason: 'error'`로, 취소는 `'cancelled'`로 해석됩니다. PTC 엔진에는 전체 경과 데드라인이 없으며, 취소되면 관리 프로세스를 즉시 중단합니다. 폐기는 제공자 계약 아래에서 프로세스와 자식 정리를 기다리며, 독립적인 워크플로 정리 데드라인은 없습니다.

```ts type-equiv
/**
 * Holder-owned live workflow. `result` never rejects; consumers may cancel
 * and must call idempotent `dispose()` to await script and child quiescence.
 */
interface WorkflowRun {
  readonly id: WorkflowRunId
  /** The validated meta block available before the script body runs. */
  readonly meta: WorkflowMeta
  readonly result: Promise<WorkflowResult>
  /** Cancel the run and its children. */
  cancel(reason?: string): void
  /** Cancel if needed and await script and child cleanup. */
  dispose(): Promise<void>
}
```

## 실패 규율: `WorkflowError.fatal`

스크립트 안의 훅 오용, 즉 잘못된 인수, 알 수 없거나 지연된 `agent()` 옵션, [구조화 출력 부분 집합](../../packages/core/tools/README.md) 밖의 스키마, 걸린 상한, seam 시작 실패, 취소는 `fatal: true`인 `WorkflowError`를 던집니다. `parallel()`/`pipeline()` 조합자는 치명적 오류를 항목을 `null`로 매핑하는 대신 다시 던집니다. 오타가 난 옵션은 평범한 자식 실패처럼 읽히는 것으로 희석되지 않고 스크립트를 크게 죽여야 합니다. 항목별 `null`은 자식 실행 실패(`completed`가 아닌 중지 이유)와 평범한 단계 내 스크립트 오류를 위해 예약되어 있습니다.

## 이벤트

`workflow/*` 이벤트(`workflow/start`, `workflow/phase`, `workflow/log`, `workflow/agent-start`, `workflow/agent-end`, `workflow/end` — [이벤트 카탈로그](#cordis-surface) 참고)는 데이터 스냅샷을 담는 **관찰 전용** emit입니다. 모든 페이로드는 라이브 `WorkflowRun`이 아니라 `WorkflowRunInfo`(id + meta)로 시작하므로 구독자가 `cancel`/`dispose`를 얻을 수 없고, `workflow/end`는 결과 값을 의도적으로 생략합니다(결과를 관찰하는 리스너가 호출자 결과의 가변 별칭을 받아서는 안 됩니다). 모든 emit은 리스너별로 격리되므로 예외를 던지는 구독자는 기록되고 절대 전파되지 않으며 그 뒤에 등록된 리스너를 굶길 수 없고, 모든 리스너가 자신의 페이로드 복제를 받으므로 이를 변경해도 엔진이나 다른 리스너가 훼손되지 않습니다. 이 격리는 `subagent/start`/`subagent/end`를 그대로 따릅니다.

## 영속 Chat 레코드

최상위 `dsh-tool-workflow` 소비자는 실행 소유권을 바꾸지 않고 표시 사실을 호출 부모 세션에 투영합니다. 실행이 수락된 뒤 `tool-workflow/run-start`를 쓰고, `runId + seq`로 멤버 시작과 끝을 짝지으며, 결과가 알려지고 폐기가 정지 상태에 도달한 뒤에만 `tool-workflow/run-end`를 씁니다. 중첩 전송 호출은 레코드를 쓰지 않습니다. 첫 append 실패는 그 실행의 이후 쓰기를 비활성화하므로, 로그는 비어 있거나 합법적인 연속 접두사로 남고 도구 결과는 바뀌지 않습니다.

레코드 프로토콜은 실행당 시작 하나, 양의 고유 멤버 시퀀스, 짝지어진 멤버 종료, 열린 멤버로 끝나지 않는 실행, 실행 종료 이후 갱신 없음을 허용합니다. 로그 꼬리에서 멤버 종료나 실행 종료가 빠진 것은 손상이 아니라 유효한 중단 증거입니다.

`dsh-client-ui-workflow-run`은 네 이벤트를 Conversation 노드 엔진으로 폴드해, 원래 워크플로 도구 노드 뒤에 실행 시작 시퀀스에 앵커된 `workflow-run` Chat 노드 하나로 만듭니다. 단계 그룹은 실제 멤버 시작에서만 나오며 생략된 단계와 `''`의 구분을 포함해 정확한 문자열을 보존합니다. 닫힌 Location은 빠진 터미널 사실을 중단된 표시로 바꿉니다. 펼치기, 상태, 같은 부모 로컬 탐색 동작은 [UI 패키지 README](../../packages/client/ui-workflow-run/README.md)가 소유합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkflowengine--workflowengine-abstract-seam"></a>

### `ctx.workflowEngine` — `WorkflowEngine` (abstract seam)

Workflow Service Definition contract. Invalid requests throw before publication; a live run is holder-owned, its result never rejects, and disposal waits for script and child cleanup. Lifecycle listener failures are contained, and `workflow/end` fires exactly once as the result settles.

```ts cordis-catalog
/**
 * Parse and execute a workflow script.
 * @param request - the script, its `args`, the parent agent, and an
 *   optional cancel signal.
 * @returns the live run; its `result` resolves when the script settles.
 */
abstract start(request: WorkflowStartRequest): WorkflowRun
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflow-events"></a>

### `workflow/*` events

<a id="workflowagent-end--emit"></a>

#### `workflow/agent-end` — emit

One `agent()` call settled (clean result, child failure, or run cancellation). Paired with Events['workflow/agent-start'] by `agent.seq`, exactly once per started call on every stop path — on an engine termination path the end is engine-synthesized with outcome `'cancelled'`.

```ts cordis-catalog
/**
 * One `agent()` call settled (clean result, child failure, or run
 * cancellation). Paired with {@link Events['workflow/agent-start']} by
 * `agent.seq`, exactly once per started call on every stop path — on an
 * engine termination path the end is
 * engine-synthesized with outcome `'cancelled'`.
 * @param info - the run's identity snapshot.
 * @param agent - the call identity plus its outcome.
 * @mode emit
 */
'workflow/agent-end'(info: WorkflowRunInfo, agent: WorkflowAgentEndInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowagent-start--emit"></a>

#### `workflow/agent-start` — emit

One `agent()` call established a published child run. Paired with Events['workflow/agent-end'] by `agent.seq`. A call that never receives a published run from the provider emits neither event in this pair.

```ts cordis-catalog
/**
 * One `agent()` call established a published child run. Paired with
 * {@link Events['workflow/agent-end']} by `agent.seq`. A call that never
 * receives a published run from the provider emits neither
 * event in this pair.
 * @param info - the run's identity snapshot.
 * @param agent - the call's sequence number, label, phase, and child id.
 * @mode emit
 */
'workflow/agent-start'(info: WorkflowRunInfo, agent: WorkflowAgentInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowend--emit"></a>

#### `workflow/end` — emit

A workflow run settled (any stop reason). Fired when WorkflowRun.result resolves. Paired with Events['workflow/start'].

```ts cordis-catalog
/**
 * A workflow run settled (any stop reason). Fired when
 * {@link WorkflowRun.result} resolves. Paired with
 * {@link Events['workflow/start']}.
 * @param info - the run's identity snapshot.
 * @param result - the outcome data (stop reason, error, agent count) —
 *   deliberately WITHOUT the result value (see {@link WorkflowResultInfo}).
 * @mode emit
 */
'workflow/end'(info: WorkflowRunInfo, result: WorkflowResultInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowlog--emit"></a>

#### `workflow/log` — emit

The script emitted a narration line (a `log(message)` call).

```ts cordis-catalog
/**
 * The script emitted a narration line (a `log(message)` call).
 * @param info - the run's identity snapshot.
 * @param message - the logged message, verbatim.
 * @mode emit
 */
'workflow/log'(info: WorkflowRunInfo, message: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowphase--emit"></a>

#### `workflow/phase` — emit

The script entered a phase (a `phase(title)` call) — progress grouping for observers; no execution semantics.

```ts cordis-catalog
/**
 * The script entered a phase (a `phase(title)` call) — progress grouping
 * for observers; no execution semantics.
 * @param info - the run's identity snapshot.
 * @param title - the phase title, verbatim.
 * @mode emit
 */
'workflow/phase'(info: WorkflowRunInfo, title: string): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)

<a id="workflowstart--emit"></a>

#### `workflow/start` — emit

A workflow run started — the script's meta block validated, the body about to execute. Paired with Events['workflow/end'].

```ts cordis-catalog
/**
 * A workflow run started — the script's meta block validated, the body
 * about to execute. Paired with {@link Events['workflow/end']}.
 * @param info - the run's identity snapshot (id + meta).
 * @mode emit
 */
'workflow/start'(info: WorkflowRunInfo): void
```

Source: [`packages/workflow/workflow/src/index.ts`](../../packages/workflow/workflow/src/index.ts)
<!-- END GENERATED cordis-surface -->
