# 에이전트 팀

[English](agent-team.md) | [中文](agent-team.zh.md) | 한국어

실험적인 암묵적 루트 팀 도메인, 모델 도구, 호스트 어댑터가 공유하는 타입입니다. 정체성, 메일박스, 작업, 공유 체크아웃 결정은 [에이전트 팀 Agent Note](../../.agents/notes/implemented/feature/2026-08-05-agent-teams.md)가 소유하며, 이 페이지는 [`packages/experimental/agent-team/src/types.ts`](../../packages/experimental/agent-team/src/types.ts)의 영속 형태와 클라이언트 가시 형태를 기록합니다.

## 정체성과 명단

`TeamId`는 별개의 [브랜드](core.ko.md#브랜드-id) 아래에 있는 루트 `SessionId`입니다. `TeamTaskId`는 `task-<n>`으로 할당됩니다. 새 전송은 대상 인박스 `MessageId`를 반환하고, `TeamMessageId`는 과거 메일박스 기록에만 남습니다. 팀원 이름은 불변 레이블입니다.

```ts type-equiv
/** Whole durable value written on every teammate lifecycle change. */
interface TeamMemberSnapshot {
  readonly id: SessionId
  readonly name: string
  readonly description: string
  readonly provider: string
  readonly context: 'fresh' | 'fork'
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

모든 멤버는 `provisioning`에서 시작해 정확히 하나의 종료 명단 단계(`active` 또는 `failed`)에 도달합니다. 명단의 `running`/`inactive` 상태는 별도로 파생되며 이 기록을 결코 다시 쓰지 않습니다.

## 메시지와 과거 메일박스

새 전송은 인박스 수락이나 거부를 반환합니다. 대상은 실제 발신자 세션 id와 발신자 이름 콘텐츠 접두사를 가진 기존 `agent-message` 소스를 저장합니다. 팀에는 새 메시지 아웃박스도 재전송 중복 제거도 없습니다. 영속성은 [패키지 계약](../../packages/experimental/agent-team/README.md#understand-the-implementation)이 정의합니다. 다음 메일박스 타입은 과거 리드 로그가 계속 재생되도록 읽을 수 있는 상태로 남으며, 팀은 그 대기 기록을 전달하지 않습니다.

```ts type-equiv
/** One peer message recorded by the historical Team mailbox. */
interface TeamMessageSnapshot {
  readonly id: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
  readonly targetId: SessionId
  readonly content: ContentBlock[]
}
```

모든 메시지는 스티어 전달을 시도합니다. 실행 중인 대상은 가장 가까운 단계 경계에서 이를 받고, 비활성 대상은 로드되어 있으면 턴을 시작하고 그렇지 않으면 콜드 재개합니다. 호출자가 다른 모드를 선택할 수 없으므로 스케줄링은 영속 기록에 저장되지 않습니다.

과거 `team-message` 소스는 이전 메시지 id와 발신자 귀속을 유지하며, 클라이언트가 메시지 제목과 아이콘에 이를 사용합니다.

```ts type-equiv
/** Source recorded by a target Session for one historical Team mailbox delivery. */
interface TeamMessageSource {
  readonly kind: 'team-message'
  readonly teamId: TeamId
  readonly messageId: TeamMessageId
  readonly senderId: SessionId
  readonly senderName: string
}
```

## 공유 작업 DAG

모든 작업 이벤트는 완전한 스냅샷을 저장합니다. `revision`은 비교 후 설정(compare-and-set) 값이며 변경마다 하나씩 증가합니다. `blockedBy` 간선은 삭제되지 않은 작업을 지목해야 하고 그래프를 비순환으로 유지해야 합니다. `writeScopes`는 잠금이 아니라 정규화된 권고 경로 접두사입니다.

```ts type-equiv
/** Whole durable task snapshot; every mutation increments {@link revision}. */
interface TeamTaskSnapshot {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly ownerId?: SessionId
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
}
```

`pending`은 시작되지 않았거나 해제된 상태이고, `in_progress`는 소유자를 가지며, `completed`는 차단 요인을 충족하고, `deleted`는 남겨 둔 묘비입니다. 뷰는 영속 스냅샷을 바꾸지 않고 소유자 이름, 준비 상태, 쓰기 범위 중복 경고를 더합니다.

<a id="web-projection"></a>

## 웹 프로젝션

리드 세션은 영속 명단 행과 삭제되지 않은 작업 뷰를 `SessionProjectionMap.agentTeam`으로 게시합니다. `failure`는 마지막 유효 상태 옆에 거부된 영속 기록을 보고합니다. 멤버 활동은 세션 상태에서 오고, 모델 레이블은 각 멤버의 `modelSelection` 프로젝션에서 옵니다.

```ts type-equiv
/** One durable roster row published through the `agentTeam` Session projection. */
interface TeamMemberProjection {
  readonly id: SessionId
  readonly name: string
  readonly role: 'lead' | 'teammate'
  /** Durable lifecycle; the Lead row is always `active`. Turn activity comes from Session status. */
  readonly phase: TeamMemberPhase
  readonly error?: string
}
```

```ts type-equiv
/** Runtime-enriched task view returned to tools and hosts. */
interface TeamTaskView {
  readonly id: TeamTaskId
  readonly revision: number
  readonly subject: string
  readonly description: string
  readonly status: TeamTaskStatus
  readonly blockedBy: TeamTaskId[]
  readonly writeScopes: string[]
  readonly ownerName?: string
  readonly ready: boolean
  readonly writeScopeWarnings: string[]
}
```

```ts type-equiv
/**
 * Durable Team state published to browser clients through the Lead Session's
 * `agentTeam` projection. `failure` names the first rejected persisted Team
 * record; members and tasks then stay at the last valid state.
 */
interface TeamProjection {
  readonly members: TeamMemberProjection[]
  readonly tasks: TeamTaskView[]
  readonly failure?: string
}
```

## 재생

`agentTeam` 세션 프로젝션은 하나의 루트 세션을 명단, 작업 보드, 과거의 큐에 쌓였다가 전달된 것을 뺀 메일박스로 재생합니다. `TeamId`로 기록을 선택하므로 일반 포크가 상속한 이벤트는 조상 id를 유지하고 새 루트의 상태에 결코 들어가지 않습니다. 세션 이벤트의 `seq`와 `time`이 순서와 시점 기록으로 남으며, 팀 스냅샷은 이를 중복하지 않습니다. 명단과 작업 읽기는 뷰로 호출자에게 도달하고, 대기 중인 메일은 호출자에게 노출되지 않습니다. 연산, 권한 부여, 복구, 한도 동작은 패키지 [README](../../packages/experimental/agent-team/README.md)가 소유합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxagentteams--teamservice"></a>

### `ctx.agentTeams` — `TeamService`

Agent Teams service backed by the exact live Lead Session log.

```ts cordis-catalog
/**
 * Resolve one exact live Agent's Team role.
 * @param agent - exact live Agent used as the authority credential.
 * @returns its root, Team identity, role, and model-facing name.
 */
membership(agent: Agent): TeamMembership

/**
 * List the runtime-enriched roster visible to one Team member.
 * @param agent - exact live Team member.
 * @returns Lead and teammate rows in creation order.
 */
listMembers(agent: Agent): TeamMemberView[]

/**
 * Create one named, continuable direct child of the Team Lead.
 * @param caller - exact live Lead Agent.
 * @param request - immutable name, description, prompt, context mode, provider, and cancellation.
 * @returns the active roster row.
 */
async spawnTeammate(caller: Agent, request: SpawnTeammateRequest): Promise<SpawnTeammateResult>

/**
 * Steer one peer message into the target inbox or reject the attempt.
 * @param caller - exact live sending Team member.
 * @param request - target name, content, and cancellation before acceptance.
 * @returns accepted inbox identity; acceptance follows normal Agent persistence and does not await model processing.
 */
async sendMessage(caller: Agent, request: SendTeamMessageRequest): Promise<SendTeamMessageResult>

/**
 * Create one unowned pending task in the Team Lead log.
 * @param caller - exact live Team member creating the task.
 * @param request - task text, blockers, and advisory write scopes.
 * @returns the revision-one task view.
 */
async createTask(caller: Agent, request: CreateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Return one task, including a deleted tombstone.
 * @param caller - exact live Team member reading the task.
 * @param id - Team-local task identity.
 * @returns the latest task value and derived readiness diagnostics.
 */
getTask(caller: Agent, id: TeamTaskId): TeamTaskView

/**
 * List current non-deleted tasks in numeric creation order.
 * @param caller - exact live Team member reading the board.
 * @returns detached current task views.
 */
listTasks(caller: Agent): TeamTaskView[]

/**
 * Compare-and-set one authorized task transition.
 * @param caller - exact live Team member authorizing the mutation.
 * @param request - task identity, expected revision, action, and action fields.
 * @returns the committed next task revision.
 */
async updateTask(caller: Agent, request: UpdateTeamTaskRequest): Promise<TeamTaskView>

/**
 * Wait for the next Team-domain or member-status change.
 * @param caller - exact live Team member waiting for activity.
 * @param timeoutMs - bounded wait duration from ten seconds through one hour.
 * @param signal - caller cancellation for the wait only.
 * @returns one observed change or a timeout result.
 */
async waitForChange(caller: Agent, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult>

/**
 * Interrupt one live teammate turn without clearing its pending inbox.
 * @param caller - exact live Lead Agent.
 * @param targetName - durable teammate name.
 * @returns the target status sampled before cancellation.
 */
interrupt(caller: Agent, targetName: string): { previousStatus: 'running' | 'inactive' }

/**
 * Resolve a caller without throwing, used by scoped-tool installation and observers.
 * @param agent - candidate exact live Agent.
 * @returns Team membership, or undefined for non-Team subagents and stale identities.
 */
tryMembership(agent: Agent): TeamMembership | undefined
```

Types: [Agent](core.ko.md)

Source: [`packages/experimental/agent-team/src/index.ts`](../../packages/experimental/agent-team/src/index.ts)
<!-- END GENERATED cordis-surface -->
