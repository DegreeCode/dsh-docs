# 사용자 상호작용

[English](user-questions.md) | [中文](user-questions.zh.md) | 한국어

[dsh-user-questions](../../packages/interaction/user-questions)의 user-questions seam입니다. 도구나 권한 플러그인이 에이전트가 계속 진행하기 전에 사람의 응답이 필요할 때 사용하는 제공자 중립 어휘입니다. 에이전트 범위의 waterfall 리스너가 사용 가능한 UI 표면을 구성하며, 연결된 클라이언트로 중계되는 리스너도 포함합니다.

출처: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

## 질문 옵션

`AskUserQuestionOption`은 선택 가능한 항목 하나를 담습니다. `label`은 사용자 대상 옵션 텍스트이자 모델 대상 선택 값이고, `description`은 선택적 UI 도움말 텍스트입니다.

```ts type-equiv
/** One selectable answer offered to the user. */
interface AskUserQuestionOption {
  /** User-facing label. */
  label: string
  /** Optional extra context rendered by capable UIs. */
  description?: string
}
```

## 표시 의도

`AskUserQuestionIntent`는 옵션 레이블과 호출자의 결정 정책을 유지하면서 표시를 바꿉니다. `plan-review`는 승인 옵션 이름을 지정하고 계획 세부 정보를 요구합니다. `approval`은 세부 정보가 있는 차단 질문 하나와, 제공된 옵션을 정확히 커버하는 서로 다른 거부·승인·선택적 항상 허용 레이블을 요구합니다. 다중 선택과 시간 제한 대기를 거부합니다. CUA 프런트엔드는 기존 작성기 체인을 통해 고정 승인을 렌더링하고, 일반 질문과 계획 검토는 기존 렌더러를 유지합니다.

```ts type-equiv
/**
 * A caller-declared presentation intent: the question IS this kind of
 * decision, so a UI that recognises the tag may present it as such instead of as a
 * generic option list. Tagged so further intents can be added; a UI that does
 * not know a tag renders the generic flow, and the answer encoding is identical
 * either way — an intent changes presentation only, never the protocol.
 */
type AskUserQuestionIntent = {
  /** A plan submitted for review: `detail` is the plan markdown `ask()` requires, and the decision approves or declines it. */
  kind: 'plan-review'
  /**
   * The option label that approves the plan; every other option declines it.
   * Named rather than positional so no UI infers the verdict from option order.
   * An `approve` naming no option of its own question is rejected at `ask()`.
   */
  approve: string
  /** Logged tool invocation whose arguments contain the reviewed plan. */
  callId?: ToolCallId
} | {
  /** A blocking permission decision with fixed actions and no free-text answer. */
  kind: 'approval'
  /** Option label granting the scope described by the caller. */
  approve: string
  /** Option label refusing the requested access. */
  reject: string
  /** Optional persistent grant offered only when the caller supports it. */
  always?: string
  /** Metadata for human recognition; the caller admits icon sources, which the UI may load as URLs. Never an authorization identity. */
  subject?: { name: string; icon?: string }
  /** Localized question and limited-grant label; fixed cards own reject/always wording. Option labels remain answer values. */
  display?: {
    question: { en: string; [locale: string]: string }
    detail?: { en: string; [locale: string]: string }
    approve?: { en: string; [locale: string]: string }
  }
}
```

## 질문 항목

`AskUserQuestionItem`은 요청 안의 질문 하나입니다. 호출자가 안정적인 `id`를 제공하며, 이는 응답과 함께 되돌아와 일괄 질문이 계속 라우팅 가능하게 합니다. 선택적 `detail`은 제공자가 질문과 함께 렌더링하지만 선택 가능한 옵션 레이블에는 넣지 않는 보조 텍스트를 담습니다.

```ts type-equiv
/** One question in a user-questions request. */
interface AskUserQuestionItem {
  /** Stable caller-provided question id, echoed in the answer. */
  id: string
  /** The question to display. */
  question: string
  /** Optional supporting detail rendered with the question but kept out of option labels. */
  detail?: string
  /** Optional short heading/group label. */
  header?: string
  /** Optional choices the UI can render as a menu. */
  options?: AskUserQuestionOption[]
  /** Whether more than one option may be selected. Defaults to single-select. */
  multiSelect?: boolean
  /** Optional presentation intent for capable UIs; absent asks for the generic option list. */
  intent?: AskUserQuestionIntent
}
```

## 질문 요청

`AskUserQuestionRequest`는 패키지 간 요청입니다. `questions`가 배열이므로 UI가 응답마다 안정적인 id를 유지하면서 관련 프롬프트를 한 흐름에서 제시할 수 있습니다. 있을 때 `agent`는 정확한 라이브 호출자이며, 상호작용 seam은 라이브 레지스트리가 그 인스턴스를 런타임 루트로 식별하는 동안에만 이를 허용합니다.

```ts type-equiv
/** Request for a human answer. */
interface AskUserQuestionRequest extends AskUserQuestionRequestEvent {}
```

## 응답

제공자는 질문 id마다 응답 항목 하나를 반환합니다. `selected`는 선택된 옵션 레이블을 담고, `custom`은 사용자가 입력한 자유 형식 “기타” 응답을 담습니다. 단일 선택 질문에서 `custom`은 선택한 항목을 덮어쓰고 `selected`는 비어 있습니다. 다중 선택 질문에서 `custom`은 `selected`의 레이블을 보완할 수 있습니다. UI는 빈 `selected`와 `custom`이 없는 항목을 사용해, 나머지는 완료된 배치에서 건너뛴 질문을 보존할 수도 있습니다.

```ts type-equiv
/** Answer to one question. */
interface AskUserQuestionAnswerItem {
  /** The answered question id. */
  id: string
  /** Selected option labels. May accompany custom text for a multi-select question. */
  selected: string[]
  /** Optional free-text "Other" answer. */
  custom?: string
}
```

```ts type-equiv
/** The human's answer. */
interface AskUserQuestionAnswer {
  /** Structured answers keyed by question id. */
  answers: AskUserQuestionAnswerItem[]
}
```

시간 제한 응답자는 `wait: { callId, timed: true }`를 받습니다. 호출 id는 카드와 포그라운드 대기를 식별합니다. Client는 `attachWait`를 호출해 대기 상태를 획득(claim)하고 남은 시간을 확인하며, 전송 계층은 이 필드를 검사하거나 다시 쓰지 않고 원본 이벤트를 전달합니다. `timed`가 없는 `wait`는 카드 키가 있는 무기한 요청을 식별합니다. `wait` 부재는 카드 키가 없는 차단 요청을 식별합니다.

```ts type-equiv
/** Client-safe payload declared for the user-question answerer waterfall. */
interface AskUserQuestionRequestEvent {
  /** Questions to display. */
  questions: AskUserQuestionItem[]
  /** Agent identity projected to the corresponding Client Context in transit. */
  agent?: Agent
  /** Cancellation lifetime of the pending request. */
  signal?: AbortSignal
  /**
   * Tool call the Client card is keyed by. Timed answerers attach to the
   * business wait stream before starting their local countdown.
   */
  wait?: {
    /** Tool call the Client card is keyed by. */
    callId: ToolCallId
    /** True for a foreground wait that requires a Client claim; absent for indefinite waits. */
    timed?: boolean
  }
}
```

## 시간 제한 질문과 지연 응답

시간 제한 질문은 한정된 포그라운드 창을 기다린 뒤 에이전트가 독립적인 작업을 계속하게 합니다. 사용자가 창 안에서 응답하면 도구가 응답 배치를 반환하고, 그렇지 않으면 `TimedUserQuestionResult`가 `{ pending: true, callId }`입니다. pending은 질문이 여전히 응답 가능함을 뜻하며, 빈 응답도 거부도 확인도 권한도 아닙니다.

```ts type-equiv
/** Timed ask result returned when the foreground answer window closes. */
type TimedUserQuestionResult = AskUserQuestionAnswer | { pending: true; callId: ToolCallId }
```

Client의 대기 획득(claim)은 단순한 Gateway 전달이 아니라 비즈니스 Remote 스트림을 통해 이루어집니다. `TimedQuestionWait`는 원래의 Host 마감 기한을 유지하며 활성 획득 클라이언트가 없을 때에만 타이머를 실행합니다. `attachWait` 스트림은 현재 남은 시간을 반환하고, Client는 자체 시계로 카운트다운을 진행합니다. 포커스, 텍스트 편집, 시간 연장(Take time) 등의 상호작용은 클라이언트 로컬에서 처리됩니다. 스트림이 취소되면 해당 획득 상태가 해제되며, 모든 획득 클라이언트가 사라지면 Host는 원래의 마감 타이머를 재개합니다. 응답 없는 무인 타임아웃이 발생하면 포그라운드 waterfall의 내부 신호를 중단하고 턴을 취소하지 않은 채 pending 상태를 반환합니다. Gateway와 `api-remotes`에는 질문별 개별 타이밍 정책이 포함되지 않습니다.

`userQuestions` Session 프로젝션은 기존 이벤트를 응답 가능한 질문 집합과 종결(settled)된 집합으로 축약(fold)하며, 대기 상태·포커스 상태·데드라인은 기록되지 않습니다. 각 `request/header`는 모델이 본 정확한 도구 스키마를 기록합니다. 네이티브 호출은 그 헤더가 `timeout` 매개변수를 가진 시간 제한 `ask_user_question` 스키마를 선언할 때만 추적되며, 차단형 레거시 도구는 이를 선언하지 않습니다. 네이티브 `tool/call`이 질문을 엽니다. `tool/result`는 pending 페이로드를 담거나 Session 재개 복구가 추가하는 합성 `TOOL_OUTCOME_UNKNOWN` 결과일 때만 질문을 `continued`로 표시하고, 응답 배치는 그 배치와 함께 `settled`로 옮기며, 어떤 실패든 질문을 버립니다. `run_code` PTC 하위 호출은 요청 헤더가 `run_code`만 노출하더라도 그 `tool/ptc-dispatch` 결과가 pending이면 프로젝션에 들어갑니다. 지연 응답은 그 메시지가 `user/message`로 승인될 때 continued 질문을 `settled`로 옮기며, 그 메시지에서 읽어 낸 응답 배치도 함께 옮깁니다. 시간 제한 호출 자체의 결과가 타임아웃을 기록했기 때문에, 트랜스크립트 행이 사용자가 최종적으로 무엇을 골랐는지 다른 곳에서 읽을 수 없습니다. 대기 중인 응답은 승인 전에 취소될 수 있고 질문은 응답 가능한 상태로 남습니다. 텍스트가 읽을 수 있는 배치를 담지 않은 응답은 답변 없이 호출을 종결(settle) 처리하고, 활성 상태가 아닌 호출을 지정한 응답은 아무것도 바꾸지 않습니다.

```ts type-equiv
/** `open` while the tool call may still return the answer; `continued` once the answer can only arrive as a new turn. */
type UserQuestionState = 'open' | 'continued'
```

```ts type-equiv
/** One unanswered timed `ask_user_question` call reconstructed from the Session log. */
interface PendingUserQuestion {
  readonly callId: ToolCallId
  readonly questions: readonly AskUserQuestionItem[]
  readonly state: UserQuestionState
}
```

```ts type-equiv
/**
 * One timed `ask_user_question` call and the answers it settled with: the
 * batch its own result carried when the user answered inside the window,
 * otherwise the batch its late reply carried, because that call's own result
 * recorded the timeout. A transcript row reads what the user finally answered
 * from here, and only a call listed here was a timed one.
 */
interface SettledUserQuestion {
  /** The settled call. */
  readonly callId: ToolCallId
  /** The recorded batch, one entry per question; empty when the late reply carried none. */
  readonly answers: readonly AskUserQuestionAnswerItem[]
}
```

```ts type-equiv
/**
 * Both halves of one Session's timed `ask_user_question` state, as every
 * Client reads them. A call made while the blocking legacy tool was in
 * effect appears in neither half.
 */
interface UserQuestionProjectionView {
  /** Calls that can still take an answer, in ask order. */
  readonly active: readonly PendingUserQuestion[]
  /** Calls an answer settled, in settlement order. */
  readonly settled: readonly SettledUserQuestion[]
}
```

열린 질문은 waterfall을 통해서만 응답을 받습니다. 질문이 `continued`가 되면 `answer` Remote 메서드가 소유 에이전트를 위해 사용자 메시지를 큐에 넣고, 유휴 상태이면 깨웁니다. 그 메시지는 `user-question-reply` 소스, `answered` 결과, `answer_to_pending_question` 페이로드를 가집니다. 이 메서드는 열린 호출이나 알 수 없는 호출에 `false`를 반환하고, Host 재시작 후에도 두 번째 대기 응답을 `REPLY_QUEUED`로 거부하며, 불완전하거나 중복된 응답 배치를 `BAD_ANSWER`로 거부합니다.

Client 패널을 닫는 것은 아무것도 보내지 않습니다. 포그라운드 타임아웃은 도구 대기만 끝냅니다. 계속된 질문에는 데드라인이 없으며, 응답이 승인될 때까지 응답 가능한 상태로 남습니다.

Host 재시작 후 Remote 레이어는 Session이 다시 열릴 때 루트 에이전트를 재개합니다. 그러면 지연 응답이 새 턴으로 들어갑니다.

## 오류

`UserQuestionError`는 `HarnessError`를 확장하므로, `ctx.tools.execute()`는 `EMPTY_QUESTIONS`, `BAD_INTENT`, `NO_PROVIDER`, `ASK_ABORTED` 또는 UI 측 취소 같은 모델 대상 도구 실패에 대해 `{ name, code }`를 보존합니다.

```ts type-equiv
/** Stable error taxonomy for user-questions failures. */
class UserQuestionError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'UserQuestionError'
  }
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxuserquestions--userquestionservice"></a>

### `ctx.userQuestions` — `UserQuestionService`

`ctx.userQuestions`: validation plus the scoped answerer waterfall.

```ts cordis-catalog
/**
 * Answer a continued question. The reply is steered into the agent as a
 * user message whose source names the call; that message is also the
 * record that closes the question in the projection.
 * @param agent - Live root agent for the owning Session.
 * @param callId - Continued question identity.
 * @param answer - Complete structured answer batch, one item per question of the call.
 * @returns Whether the question is still continued; an accepted reply stays
 *   queued until the agent admits its user message.
 * @throws {UserQuestionError} `BAD_ANSWER` when the batch does not name each
 *   question of the call exactly once, or `REPLY_QUEUED` when a reply is
 *   already waiting for admission.
 */
@Remote answer(agent: Agent, callId: ToolCallId, answer: AskUserQuestionAnswer): boolean

/**
 * Let one answer UI hold a live timed wait. Closing the stream releases its claim.
 * @param agent - Live root agent owning the question.
 * @param callId - Foreground tool call to attach to.
 * @param signal - Remote stream cancellation, including Client disconnect.
 * @returns One Host-computed remaining duration, or no frames once the wait ended.
 */
@Remote({ mode: 'stream' }) async *attachWait(agent: Agent, callId: ToolCallId, signal: AbortSignal): AsyncIterable<{ remainingMs: number }>

/**
 * Foreground wait whose first settlement the Client decides: the Client
 * rejects with `ASK_TIMED_OUT` when its countdown ends, and this method maps
 * that code to the pending result.
 * @param request - Questions, live owner agent, and abort signal.
 * @param callId - Tool call identity the Client card is keyed by.
 * @param timeoutMs - Positive foreground wait in milliseconds.
 * @returns The answer when it arrives inside the window, otherwise a pending
 *   result, also when no connected Client claimed the request by the deadline.
 * @throws {UserQuestionError} `BAD_TIMEOUT` for a non-integer, non-positive,
 *   or oversized wait.
 */
async askTimed( request: AskUserQuestionRequest & { agent: Agent }, callId: ToolCallId, timeoutMs: number, ): Promise<TimedUserQuestionResult>

/**
 * Ask the scoped answerer waterfall and wait for the user's answer.
 *
 * When a caller supplies an agent, human interaction is valid only for the
 * exact live runtime root. Runtime ownership, not durable session lineage,
 * decides this boundary: an owned child has no human answerer and would
 * block forever, while a lineage-bearing session resumed as a new runtime
 * root may ask normally.
 *
 * @param request Questions, owner agent, and abort signal.
 * @returns The answer chosen or typed by the human.
 * @throws {UserQuestionError} code `ASK_ABORTED` when the supplied signal
 *   is already or becomes aborted, `CALLER_NOT_LIVE` when a supplied agent
 *   is not the registry's exact live instance, or `DELEGATED_CALLER` when
 *   that live agent is owned by another agent.
 */
async ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>
```

Types: [Agent](core.ko.md) · [ToolCallId](core.ko.md)

Source: [`packages/interaction/user-questions/src/index.ts`](../../packages/interaction/user-questions/src/index.ts)

<a id="user-questions-events"></a>

### `user-questions/*` events

<a id="user-questionsrequest--waterfall"></a>

#### `user-questions/request` — waterfall

Ask composed answerers for structured user input. Return an answer to claim the request or call `next()` to delegate. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.

```ts cordis-catalog
/**
 * Ask composed answerers for structured user input. Return an answer to
 * claim the request or call `next()` to delegate. Scope-filtered dispatch
 * (`@deepseek-ai/dsh-scope`): agent-scoped listeners receive only that agent.
 * @param request - pending user-question request.
 * @mode waterfall
 */
'user-questions/request'( this: Scoped<Agent>, request: AskUserQuestionRequestEvent, next: () => Promise<AskUserQuestionAnswer>, ): Promise<AskUserQuestionAnswer>
```

Types: [Agent](core.ko.md) · [Scoped](scope.ko.md)

Source: [`packages/interaction/user-questions/src/types.ts`](../../packages/interaction/user-questions/src/types.ts)
<!-- END GENERATED cordis-surface -->
