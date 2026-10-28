# 같은 세션 목표

[English](goal.md) | [中文](goal.zh.md) | 한국어

이벤트 소싱 목표 서비스와 그 정책 소비자가 공유하는 타입입니다. 영속과 활성화 결정은 [goal 도메인 참조](../../packages/goal/goal/README.md)가 소유하고, 이 페이지는 [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts)의 정확한 필드와 변형을 기록합니다.

## 정체성과 수명 주기

`GoalId`는 [브랜드 id](core.ko.md#브랜드-id)입니다. 호출자는 `GoalRef`를 통해 정확히 하나의 리비전을 변경하며, 수용된 모든 영속 변경은 리비전을 증가시킵니다.

```ts type-equiv
/** Compare-and-set identity for one exact goal revision. */
interface GoalRef {
  /** Stable goal identity. */
  readonly id: GoalId
  /** Positive revision; every durable mutation increments it. */
  readonly revision: number
}
```

영속 단계는 목표에 무슨 일이 있었는지 답합니다. 프로세스 로컬 활성화는 별도로 계속 소비자가 다음 라운드를 시작할 수 있는지 답합니다.

```ts type-equiv
/** Durable continuation phase. Activation is process-local and separate. */
type GoalPhase =
  | 'active'
  | 'paused'
  | 'blocked'
  | 'complete'
```

차단(blocking)은 문제로 인해 멈춘 유일한 영속 상태입니다. 그 정책 소유 사유는 라우팅을 위한 안정적인 로어 케밥 케이스 코드와 사람과 모델을 위한 자유 형식 설명을 담습니다.

```ts type-equiv
/** Machine-routable and human-readable explanation for a blocked goal. */
interface GoalBlockReason {
  /** Stable lower-kebab-case classification chosen by the blocking policy. */
  readonly code: string
  /** Non-empty explanation shown to humans and models. */
  readonly message: string
}
```

```ts type-equiv
/** Full durable state written by every non-clear goal mutation. */
interface GoalSnapshot extends GoalRef {
  /** Human-requested completion objective. */
  readonly objective: string
  /** Durable lifecycle phase. */
  readonly phase: GoalPhase
  /** Present exactly while `phase` is `blocked`. */
  readonly blockedReason?: GoalBlockReason
  /** Total admitted goal-round cap. */
  readonly maxGoalRounds: number
}
```

```ts type-equiv
/** Current goal projection, including values derived from the session log. */
interface GoalView extends GoalSnapshot {
  /** Highest admitted round number for this goal. */
  readonly roundsStarted: number
  /** Epoch milliseconds of the create mutation. */
  readonly createdAt: number
  /** Epoch milliseconds of the latest mutation. */
  readonly updatedAt: number
  /** Process-local continuation eligibility; never persisted. */
  readonly activation: GoalActivation
}
```

서비스는 영속 상태를 바꾸지 않고 프로세스 로컬 활성화 엣지도 게시하며, 클라이언트는 라이브 상태를 위해 이 이벤트를 소비합니다.

```ts type-equiv
/** Live process-local activation update forwarded to UI clients. */
interface GoalActivationChanged {
  /** Session whose live goal activation changed. */
  readonly sessionId: SessionId
  /** Current exact activation, absent when no goal is current. */
  readonly goal?: {
    /** Exact current goal identity. */
    readonly id: GoalId
    /** Exact current goal revision. */
    readonly revision: number
    /** Current process-local continuation state. */
    readonly activation: GoalActivation
  }
}
```

## 영속 변경

모든 변경은 페이로드가 완전한 변경 후 스냅샷이거나 명확한 툼스톤인 영속 `goal/change` 세션 이벤트입니다. 엄격 폴드와 영속 프로젝션은 이 이벤트에서만 수명 주기 상태를 도출하며, 인박스 변경은 목표 상태에 영향을 주지 않습니다.

```ts type-equiv
/** Full-snapshot goal mutation committed by a durable `goal/change` event. */
interface GoalSnapshotChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: Exclude<GoalOperation, 'clear'>
  readonly goal: GoalSnapshot
  readonly roundsStarted: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

```ts type-equiv
/** Tombstone retained when the current goal is cleared. */
interface GoalClearChangeMeta {
  readonly kind: 'goal/change'
  readonly version: 1
  readonly operation: 'clear'
  readonly cleared: GoalRef
  readonly clearedAt: number
}
```

계속 소비자는 수용된 각 사용자 메시지 턴에 양의 순차 라운드 번호와 현재 리비전을 부여하며, 이렇게 수용된 `user/message` 이벤트만 `roundsStarted`를 진행시킵니다. 재생은 비양수 라운드, 갭, 오래된 리비전, 중지된 단계, 상한 초과를 거부합니다.

```ts type-equiv
/** Message attribution for admitted continuation rounds. */
interface GoalMessageSource {
  readonly kind: 'goal'
  readonly goalId: GoalId
  readonly revision: number
  /** Positive admitted continuation round. */
  readonly round: number
}
```

## 요청과 알림

생성은 호출자 생략과 배포 선택을 분리하며, `create()`가 내부에서 이를 해석합니다. 편집은 부분 교체이고 런타임 검증기가 최소 하나의 필드를 요구합니다. 모든 변경 알림은 수용된 작업과 정확한 리비전을 담고, clear는 `goal`을 생략합니다.

```ts type-equiv
/** Input whose omitted round cap is resolved by the service configuration. */
interface CreateGoalRequest {
  readonly objective: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Fields changed by an edit; at least one must be present. */
interface EditGoalRequest {
  readonly objective?: string
  readonly maxGoalRounds?: number
}
```

```ts type-equiv
/** Live notification after one durable goal mutation commits. */
interface GoalChanged {
  readonly operation: GoalOperation
  readonly ref: GoalRef
  /** Absent for a clear tombstone. */
  readonly goal?: GoalView
}
```

## 서비스 동작

[`GoalService`](../../packages/goal/goal/src/index.ts)는 생성 기본값을 해석하고, 선택적으로 등록된 `goal` 프로젝션에서 엄격 재생을 읽고, 정확한 라이브 에이전트 정체성과 비교 후 설정 변경을 강제하며, 격리된 `goal/changed` 알림을 냅니다. 첫 의존 접근은 프로젝션 레지스트리나 키가 없으면 실패합니다. 호출 가능 API와 모델 가시 계약은 [패키지 README](../../packages/goal/goal/README.md)가 정의합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgoals--goalservice"></a>

### `ctx.goals` — `GoalService`

Goal service (`ctx.goals`) backed exclusively by the owning session log.

```ts cordis-catalog
/**
 * Read the current goal for one exact live agent.
 * @param agent - owning live agent.
 * @returns a fresh view or `undefined` when no goal is current.
 * @throws {@link GoalError} when the agent is not the registry's live instance.
 */
@Remote('get') get(agent: Agent): GoalView | undefined

/**
 * Remove process-local continuation authority without changing durable goal
 * phase or revision. Lifecycle owners use this before unloading a driver;
 * a later human-authorized {@link resume} records the new activation edge.
 * @param agent - owning live agent.
 * @returns a fresh disarmed view, or `undefined` when no goal is current.
 */
disarm(agent: Agent): GoalView | undefined

/**
 * Create and arm a goal. A completed goal may be replaced; every other
 * current phase must be cleared or resumed instead.
 * @param agent - owning live agent.
 * @param request - objective and optional round cap.
 * @returns the created live view.
 */
create(agent: Agent, request: CreateGoalRequest): GoalView

/**
 * Edit objective and/or round cap without changing phase.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param request - at least one replacement field.
 * @returns the edited view.
 */
@Remote('edit') edit(agent: Agent, ref: GoalRef, request: EditGoalRequest): GoalView

/**
 * Pause an active goal and disarm automatic continuation.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the paused view.
 */
@Remote('pause') pause(agent: Agent, ref: GoalRef): GoalView

/**
 * Resume and arm a stopped goal, or rearm an active goal after a
 * session-start edge, while its round budget still has capacity.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the active view.
 */
@Remote('resume') resume(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark a current non-complete goal complete and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the completed view.
 */
@Remote('complete') complete(agent: Agent, ref: GoalRef): GoalView

/**
 * Mark an active goal blocked and disarm it.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @param reason - policy-owned stable code and human-readable explanation.
 * @returns the blocked view with its durable reason.
 */
block(agent: Agent, ref: GoalRef, reason: GoalBlockReason): GoalView

/**
 * Clear the current goal while retaining a durable tombstone and history.
 * @param agent - owning live agent.
 * @param ref - expected current revision.
 * @returns the tombstone ref whose revision is one past the cleared snapshot.
 */
@Remote('clear') clear(agent: Agent, ref: GoalRef): GoalRef

/**
 * Create one Goal through the remote boundary.
 * @param agent - exact live Agent resolved from the wire identity.
 * @param request - objective and optional round cap.
 * @returns the created Goal identity.
 */
@Remote('create') remoteExportCreate(agent: Agent, request: CreateGoalRequest): CreateGoalResult
```

Types: [Agent](core.ko.md)

Source: [`packages/goal/goal/src/index.ts`](../../packages/goal/goal/src/index.ts)

<a id="goal-events"></a>

### `goal/*` events

<a id="goalactivation-changed--emit"></a>

#### `goal/activation-changed` — emit

Process-local goal activation changed for one session.

```ts cordis-catalog
/**
 * Process-local goal activation changed for one session.
 * @mode emit
 * @param payload - session id and the exact current goal activation, or no goal after a clear.
 */
'goal/activation-changed'(payload: GoalActivationChanged): void
```

Source: [`packages/goal/goal/src/types.ts`](../../packages/goal/goal/src/types.ts)

<a id="goalchanged--emit"></a>

#### `goal/changed` — emit

Goal mutation accepted by one live agent. The matching `goal/change` session event has already committed. Listener failures are contained. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Goal mutation accepted by one live agent. The matching `goal/change`
 * session event has already committed. Listener failures are contained.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param payload.agent - agent whose session owns the goal.
 * @param payload.change - fresh current projection or clear tombstone.
 * @mode emit
 */
'goal/changed'(this: import('@deepseek-ai/dsh-scope').Scoped<Agent>, payload: { agent: Agent; change: GoalChanged }): void
```

Types: [Agent](core.ko.md) · [Scoped](scope.ko.md)

Source: [`packages/goal/goal/src/domain.ts`](../../packages/goal/goal/src/domain.ts)
<!-- END GENERATED cordis-surface -->
