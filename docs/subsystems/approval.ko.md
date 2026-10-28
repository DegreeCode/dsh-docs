# 사용자 승인

[English](approval.md) | [中文](approval.zh.md) | 한국어

[dsh-user-approval](../../packages/interaction/user-approval)의 사용자 승인 seam은 한 가지 질문에 답합니다. 이 특정 작업이 진행되어도 되는가? 이 seam은 공유 요청/결과 어휘, `ctx.approval` 디스패치 서비스, `approval/request` 응답자 워터폴, 로그 전용 감사 쌍, 세션별 `ask`/`never` 정책을 소유합니다. UI 채널이 사람 응답자를 제공할 수 있고, [ACP 자동화 브리지](../../packages/acp/acp)는 자체 에이전트에 일회성 기계 결정을 제공합니다. [dsh-tools](../../packages/core/tools)와 [dsh-tool-bash](../../packages/shell/tool-bash) 같은 호출자는 닫힌 결과를 소비하며 `allowed-once`가 아니면 fail-closed로 거부합니다.

출처: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

## 식별자와 결과

모든 요청은 새 `ApprovalRequestId`를 받습니다. 브랜드는 `approval/asked`와 `approval/decided` 감사 이벤트를 짝지으면서, 승인 id가 도구 호출이나 에이전트/세션 id와 서로 교환되지 않게 합니다.

```ts type-equiv
/**
 * Pairs one `approval/asked` audit event with its `approval/decided`.
 * Service-issued (one fresh id per {@link ApprovalService.request} call).
 */
type ApprovalRequestId = Branded<'ApprovalRequestId'>
```

`ApprovalOutcome`은 닫혀 있고 fail-closed입니다. `allowed-once`는 질문 대상 작업만 허용하며, 호출자는 `rejected`, `cancelled`, `unavailable`에서 거부합니다. 응답자가 없거나, 소유하지 않거나, throw하거나, 규약을 따르지 않으면 게이트를 여는 대신 `unavailable`이 됩니다.

```ts type-equiv
/**
 * Closed approval outcomes: a one-shot grant, explicit rejection, withdrawn
 * request, or unavailable answerer. Callers fail closed on `unavailable`.
 */
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

## 세션별 정책

`ApprovalPolicy`는 대화형 응답자가 실행되기 전에 무슨 일이 일어나는지 결정합니다. `ask`는 구성된 응답자 체인에 위임하며, 응답이 없을 때 기본값은 `unavailable`입니다. `never`는 어떤 응답자도 디스패치하지 않고 결정적으로 `rejected`를 반환합니다. 실효 값은 세션 로그의 마지막 `approval/policy` 이벤트이며, 없으면 서비스 구성으로 폴백합니다. 소비자는 `ctx.approval.effectivePolicy(session)`으로 읽고, `setApprovalPolicy(session, policy)`가 유일한 쓰기 경로이므로 재생이 재정의를 재구성합니다.

```ts type-equiv
/**
 * A session's approval policy — what happens to an {@link ApprovalService}
 * ask BEFORE any interactive answerer sees it:
 *
 * - `'ask'` (the default) — delegate to the composed answerers; with none
 *   composed the chain falls through to the fail-closed `'unavailable'`.
 * - `'never'` — never prompt anyone: every ask resolves `'rejected'`
 *   deterministically. The strict headless stance (CI, unattended runs) and
 *   the policy whose outcome is knowable without asking.
 */
type ApprovalPolicy = 'ask' | 'never'
```

두 정책 모두 캐시 안전한 런타임 컨텍스트 스냅샷에 전체 현재 의미를 기여합니다. 소스가 기록된 `user/message`는 영속적이고 모델이 보는 입력이며, 승인 상태를 바꾸면 보존된 이력 뒤에 새 전체 스냅샷을 추가하고 렌더링된 시스템 프롬프트를 담은 `system/message` 노드는 건드리지 않습니다.

## 승인 요청

`ApprovalRequest`는 요청을 라우팅하고 감사할 수 있을 만큼 에이전트와 도구 작업을 식별합니다. 도구 인자는 의도적으로 생략합니다. 응답자는 `callId`를 통해 이미 스트리밍된 도구 호출에 프롬프트를 붙이지, 어긋날 수 있는 두 번째 사본을 렌더링하지 않습니다. 선택적 `displayReason`은 요청자 소유 로케일 문자열을 표현 계층으로 전달하고, `reason`은 감사 텍스트로 남습니다.

```ts type-equiv
/**
 * Readonly same-process permission question. `callId` links to an already
 * presented tool call, so arguments are not duplicated here.
 */
interface ApprovalRequest extends ApprovalRequestEvent {
  /**
   * The agent on whose behalf the question is asked. Routes the question (a
   * UI answerer only answers for agents it owns) and receives the audit
   * events on its session log.
   */
  readonly agent: Agent
  /** The tool the question is about (presentation and audit). */
  readonly toolName: string
  /**
   * The exact tool call being decided, when the asker has one — lets a UI
   * attach the prompt to the tool call it already streamed.
   */
  readonly callId?: ToolCallId
  /** The asker's human-readable explanation of WHY it is asking. */
  readonly reason?: string
  /**
   * Aborting withdraws the question: the request settles `'cancelled'`
   * immediately and a late answer from a still-pending answerer is discarded.
   */
  readonly signal?: AbortSignal
}
```

## 디스패치와 감사

`ctx.approval.request(req)`는 요청 세션이 열린 턴 안에 있을 것을 요구합니다. `approval/asked`를 추가하고, 결과 하나를 얻고, 대응하는 `approval/decided`를 추가한 뒤 그 결과로 resolve합니다. `never` 정책은 워터폴 디스패치 이전에 서비스 안에서 강제되므로, 나중에 `prepend`로 등록된 응답자도 이를 우회할 수 없습니다. 응답자는 요청을 소유하면 결과를 반환하고 위임하려면 `next()`를 호출하며, 첫 응답이 단일 결정 슬롯을 차지합니다.

감사 이벤트는 로그 전용이며 모델 트랜스크립트에 들어가지 않습니다. 모델 가시 동작은 호출자가 파생한 도구 결과와 현재 런타임 컨텍스트 스냅샷입니다. 서비스 폐기는 컨텍스트 기여를 제거하고, 응답자 리스너는 소유 플러그인에 각각 effect로 바인딩됩니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxapproval--approvalservice"></a>

### `ctx.approval` — `ApprovalService`

Approval service that applies session policy before answerers and logs every ask/outcome pair to the requesting session. It exposes deterministic policy changes to the model through the runtime-context snapshot and switch notices.

```ts cordis-catalog
/**
 * Switch one live agent's policy and queue the transition for its next model
 * step. Session initialization uses {@link setApprovalPolicy} directly
 * because there is no previously visible policy to change.
 * @param agent - the live agent whose policy is changing.
 * @param policy - the new effective policy.
 */
setPolicy(agent: Agent, policy: ApprovalPolicy): void

/**
 * Ask the composed answerers to decide one readonly same-process request.
 * The service borrows the request, agent, session, and live signal directly.
 * The request requires an open turn because the audit pair must be enclosed
 * by the durable log's commit/replay boundary; an idle ask rejects before
 * appending anything. The answerer phase always produces an outcome: an
 * aborted signal yields `'cancelled'`, a missing or throwing answerer yields
 * `'unavailable'` (fail closed), and a rogue non-vocabulary return value is
 * normalized to `'unavailable'`. A failure that prevents either audit append
 * from committing still rejects because returning an unlogged decision would
 * violate the pair. Session contains post-commit observer failures, so an
 * authoritative append cannot reject the request or suppress its matching
 * audit event.
 * @param req - the pending decision (agent, tool identity, reason, signal).
 * @returns the closed outcome; `'allowed-once'` is the only grant.
 * @throws when no turn is open or either audit event fails before the session
 *   append commit point.
 */
async request(req: ApprovalRequest): Promise<ApprovalOutcome>

/**
 * Read the session override without applying the configured default.
 * @param session - session whose log supplies the override.
 * @returns the last logged policy, or `undefined` without one.
 */
overrideOf(session: Session): ApprovalPolicy | undefined
```

Types: [Agent](core.ko.md) · [Session](session.ko.md)

Source: [`packages/interaction/user-approval/src/index.ts`](../../packages/interaction/user-approval/src/index.ts)

<a id="approval-events"></a>

### `approval/*` events

<a id="approvalrequest--waterfall"></a>

#### `approval/request` — waterfall

Ask composed answerers for one decision. Return an outcome to claim the request or call `next()` to delegate. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for one decision. Return an outcome to claim the
 * request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param req - pending approval request.
 * @mode waterfall
 */
'approval/request'( this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>, ): Promise<ApprovalOutcome>
```

Types: [Agent](core.ko.md) · [Scoped](scope.ko.md)

Source: [`packages/interaction/user-approval/src/types.ts`](../../packages/interaction/user-approval/src/types.ts)
<!-- END GENERATED cordis-surface -->
