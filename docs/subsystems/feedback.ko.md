# 메시지 피드백

[English](feedback.md) | [中文](feedback.zh.md) | 한국어

[`@deepseek-ai/dsh-message-feedback`](../../packages/feedback/message-feedback)는 개별 어시스턴트 메시지에 대한 편집 가능한 피드백을 소유합니다. 정규 세션 로그는 `feedback/message-put`과 `feedback/message-delete`를 저장하고, 불변인 세션 수준 논평은 `feedback/record`로 남으며, 두 종류의 피드백이 분류되는 `FeedbackCategory` 분류 체계와 함께 [`@deepseek-ai/dsh-command-feedback`](../../packages/feedback/command-feedback)가 소유합니다. 셋 모두 모델 컨텍스트에 결코 들어가지 않는 로그 전용 이벤트입니다.

출처: [`packages/feedback/message-feedback/src/types.ts`](../../packages/feedback/message-feedback/src/types.ts)

## 공개 타입

```ts type-equiv
/** Opaque compare-and-set token for one exact feedback item revision. */
type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>
```

```ts type-equiv
/** The human's overall judgment of one assistant message. */
type MessageFeedbackRating = 'positive' | 'negative'
```

```ts type-equiv
/** One current feedback value and its opaque mutation token. */
interface MessageFeedbackItem {
  /** Stable identity of the assistant message inside the owning Session. */
  readonly messageId: MessageId
  /** Overall positive or negative judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional explanation, preserved verbatim after validation. */
  readonly note?: string
  /** Category the human filed the judgment under. */
  readonly category?: FeedbackCategory
  /** Equality-only token replaced by every material create or update. */
  readonly version: MessageFeedbackVersion
  /** Host-assigned creation time in Unix epoch milliseconds. */
  readonly createdAt: number
  /** Host-assigned time of the most recent material update. */
  readonly updatedAt: number
}
```

```ts type-equiv
/** A material creation or edit, retaining its complete current value. */
interface MessageFeedbackPut {
  /** Owning Session; inherited feedback in a fork belongs to its parent. */
  readonly sessionId: SessionId
  /** Value after this mutation, including the original creation time. */
  readonly item: MessageFeedbackItem
}
```

```ts type-equiv
/** A material deletion of one current feedback item. */
interface MessageFeedbackDelete {
  /** Session that owns the deleted feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback was removed. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Read all message feedback belonging to one persisted Session lifecycle. */
interface MessageFeedbackListRequest {
  /** Session whose feedback events should be read. */
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Current feedback values for one Session, in first-creation order. */
interface MessageFeedbackListValue {
  /** Fresh immutable item snapshots. */
  readonly items: readonly MessageFeedbackItem[]
}
```

```ts type-equiv
/** Create or replace feedback for one assistant message. */
interface MessageFeedbackPutRequest {
  /** Persisted Session that owns the target message. */
  readonly sessionId: SessionId
  /** Target assistant-message identity. */
  readonly messageId: MessageId
  /** Desired overall judgment. */
  readonly rating: MessageFeedbackRating
  /** Optional non-blank explanation. */
  readonly note?: string
  /** Optional category; absent keeps the item uncategorized. */
  readonly category?: FeedbackCategory
  /** Observed item version, or `null` to require that no item exists. */
  readonly ifVersion: MessageFeedbackVersion | null
}
```

```ts type-equiv
/** Delete feedback for one message after observing its current version. */
interface MessageFeedbackDeleteRequest {
  /** Session that owns the feedback. */
  readonly sessionId: SessionId
  /** Message whose feedback should be absent after this operation. */
  readonly messageId: MessageId
  /** Observed item version; ignored when the item is already absent. */
  readonly ifVersion: MessageFeedbackVersion
}
```

```ts type-equiv
/** Idempotent deletion acknowledgement. */
interface MessageFeedbackDeleteValue {
  /** Stable postcondition shared by the first deletion and every retry. */
  readonly absent: true
}
```

```ts type-equiv
/** No persisted Session header exists for the requested id. */
interface MessageFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** The id does not name a derived, append-origin assistant message. */
interface MessageFeedbackTargetNotFound {
  readonly code: 'target-not-found'
  readonly sessionId: SessionId
  readonly messageId: MessageId
}
```

```ts type-equiv
/** A material mutation did not match the addressed item's current version. */
interface MessageFeedbackVersionConflict {
  readonly code: 'version-conflict'
  /** Authoritative current item, or `null` when it does not exist. */
  readonly current: MessageFeedbackItem | null
}
```

```ts type-equiv
/** A supplied note contains no non-whitespace character. */
interface MessageFeedbackNoteBlank {
  readonly code: 'note-blank'
}
```

```ts type-equiv
/** A supplied note exceeds the configured UTF-8 byte limit. */
interface MessageFeedbackNoteTooLarge {
  readonly code: 'note-too-large'
  readonly maxBytes: number
  readonly actualBytes: number
}
```

```ts type-equiv
/** Failures shared by the public message-feedback operations. */
type MessageFeedbackFailure =
  | MessageFeedbackSessionNotFound
  | MessageFeedbackTargetNotFound
  | MessageFeedbackVersionConflict
  | MessageFeedbackNoteBlank
  | MessageFeedbackNoteTooLarge
```

```ts type-equiv
/** Successful public operation result. */
interface MessageFeedbackSuccess<T> {
  readonly ok: true
  readonly value: T
}
```

```ts type-equiv
/** Rejected public operation result with a stable business failure. */
interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {
  readonly ok: false
  readonly error: E
}
```

```ts type-equiv
/** Result returned by the message-feedback `list` operation. */
type MessageFeedbackListResult =
  | MessageFeedbackSuccess<MessageFeedbackListValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound>
```

```ts type-equiv
/** Result returned by the message-feedback `put` operation. */
type MessageFeedbackPutResult =
  | MessageFeedbackSuccess<MessageFeedbackItem>
  | MessageFeedbackRejected<
    | MessageFeedbackSessionNotFound
    | MessageFeedbackTargetNotFound
    | MessageFeedbackVersionConflict
    | MessageFeedbackNoteBlank
    | MessageFeedbackNoteTooLarge
  >
```

```ts type-equiv
/** Result returned by the message-feedback `delete` operation. */
type MessageFeedbackDeleteResult =
  | MessageFeedbackSuccess<MessageFeedbackDeleteValue>
  | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>
```

## 세션 피드백 타입

출처: [`packages/feedback/command-feedback/src/types.ts`](../../packages/feedback/command-feedback/src/types.ts)

```ts type-equiv
/** One of the fixed feedback categories; the ids are durable log vocabulary. */
type FeedbackCategory =
  | 'task-result'
  | 'instruction-following'
  | 'product-interaction'
  | 'service-stability'
  | 'resource-cost'
  | 'security-privacy-permission'
  | 'other'
```

```ts type-equiv
/**
 * One recorded human remark about a Session. Both members are optional: a
 * submission with neither still records that the human asked for the
 * Session to be reviewed, which is what authorizes log delivery.
 */
interface FeedbackRecord {
  /** Free-text remark with surrounding whitespace removed; never empty when present. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Record one Session-level remark through the Host Remote. */
interface SessionFeedbackRecordRequest {
  /** Live Session the remark describes. */
  readonly sessionId: SessionId
  /** Free-text remark; blank text is recorded as absent. */
  readonly text?: string
  /** Category the human filed the remark under. */
  readonly category?: FeedbackCategory
}
```

```ts type-equiv
/** Stable postcondition of a recorded remark. */
interface SessionFeedbackRecordValue {
  /** The remark is appended to the Session log; flushing follows the Session's own schedule. */
  readonly recorded: true
}
```

```ts type-equiv
/** No live Session carries the requested id. */
interface SessionFeedbackSessionNotFound {
  readonly code: 'session-not-found'
  readonly sessionId: SessionId
}
```

```ts type-equiv
/** Result returned by the `sessionFeedback.record` operation. */
type SessionFeedbackRecordResult =
  | { readonly ok: true; readonly value: SessionFeedbackRecordValue }
  | { readonly ok: false; readonly error: SessionFeedbackSessionNotFound }
```

## 데이터와 동시성

현재 항목은 페이로드의 `sessionId`가 소유 세션과 일치하는 정규 피드백 이벤트에서 폴드됩니다. 각 항목은 긍정 또는 부정 평가, 선택적 노트, 선택적 분류, 호스트가 부여한 `createdAt`/`updatedAt` 타임스탬프, 자체 불투명 버전을 담습니다. 버전은 동등성만 비교되고 대상 메시지에 대해서만 비교되며, 호출자가 순서를 매기거나 합성하지 않습니다.

`put`은 엄격한 낙관적 동시성을 사용합니다. 기존 항목에 대한 모든 요청은 무변경(저장된 평가, 노트, 분류를 그대로 반복하는 put)을 포함해 현재 `ifVersion`과 일치해야 합니다. 충돌은 권위 있는 현재 항목(또는 `null`)을 반환하므로, 호출자는 추가 읽기 없이 유실된 응답이나 동시 편집을 조정할 수 있습니다. 이미 없는 항목을 삭제하는 것은 성공합니다. 세션별 큐가 읽기와 변경을 직렬화하며, 콜드 변경은 읽기, 비교, 추가, 플러시에 걸쳐 영속 쓰기 핸들을 보유합니다. 일치하는 무변경은 이벤트를 추가하지 않습니다.

## 대상과 수명 주기 권위

라이브 소유자의 메모리 내 로그가 대상 세션 관찰을 직접 제공하고, 콜드 읽기는 `SessionPersistence.open(id, 'read')` 핸들을, 변경은 쓰기 핸들을 사용합니다. 어느 경로도 세션이나 에이전트를 만들지 않습니다. `stat(id)` 사전 검사가 확실한 부재를 분류하며, `stat`으로 확인된 세션의 읽기 실패는 인프라 실패로 전파됩니다. `put`은 요청된 `MessageId`를 가진 비어 있지 않은 append-기원 `assistant/message`만 받아들이며, replacement-기원, usage 전용 빈 레코드, 비어시스턴트 레코드는 피드백 대상이 아닙니다.

포크 시드는 부모 피드백 이벤트를 담을 수 있지만 그 페이로드가 부모 `sessionId`를 유지하므로 자식의 현재 피드백이 되지 않습니다. 항목을 삭제하면 묘비가 추가되며, 이전 평가와 노트는 로그에 남습니다.

## 영속성과 Remote 계약

성공한 메시지 피드백 변경은 정규 영속성을 기다립니다. 라이브 연산은 소유 세션을 통해 추가되고 참여하는 `ctx.sessions.flush` 리스너를 요구하며, 콜드 연산은 쓰기 핸들을 통해 추가하고 플러시합니다. 영속 실패는 성공을 보고하는 대신 전파됩니다. `maxNoteBytes`는 필수이며 노트 텍스트를 UTF-8 바이트로 제한하고, 웹 호스트 구성은 `8192`를 설정합니다. 이 패키지는 `TypertRemoteService`와 `@Remote`를 통해 호스트 `messageFeedback.list`, `messageFeedback.put`, `messageFeedback.delete` 단항 Remote 계약을 게시하며, `command-feedback`은 라이브 세션의 세션 수준 논평을 위해 `sessionFeedback.record`를 같은 방식으로 게시합니다. 아래의 생성된 Cordis API가 메서드 수준 권위입니다.

플러그인 디스포즈는 연산 허용을 닫고 이미 받아들인 세션별 큐 작업을 비웁니다.

기본적으로 [`session-log-deepseek`](../../packages/session/session-log-deepseek/README.md)는 이후의 적격한 DeepSeek 요청에서 피드백을 일반 `dsh_session_log` 접미사의 일부로 나릅니다. 구성에서 `enabled: false`로 비활성화할 수 있습니다. 피드백 기록은 LLM 요청이나 별도의 `dsh_feedback` 업로드를 유발하지 않습니다. DeepSeek이 아닌 라우트에서는 [OTel 백엔드](../../packages/session/session-telemetry-otel/README.md)가 기록된 피드백을 통해 정규 프리픽스를 해제할 수 있습니다. 명령 승인은 기록을 확인하고 세션과 익명 사용자를 식별하지만, 텔레메트리 정책도 전달도 보고하지 않습니다.

## 웹 표면

[`@deepseek-ai/dsh-client-ui-message-feedback`](../../packages/client/ui-message-feedback)가 브라우저 소비자입니다. `@deepseek-ai/dsh-api-remotes`가 생성된 `messageFeedback`과 `sessionFeedback` 기여분을 마운트하므로, 플러그인은 `ctx.remote.messageFeedback`과 `ctx.remote.sessionFeedback`을 호출하고 전송 계층에는 결코 닿지 않습니다.

컨트롤은 `ui-conversation`이 선언하고 확정된 어시스턴트 메시지의 IconActions 행 안에 렌더링하는 `conversation.chat.assistant-actions` 목록 슬롯의 `feedback` 항목(순서 10)입니다. `AssistantMessageNode`는 `assistant/message` 이벤트의 선택적 `messageId`를 나릅니다. 이 필드는 중단으로 동결된 부분 메시지에는 없으며, 렌더 위치는 없을 때 슬롯을 건너뜁니다. 스트립은 턴마다 한 번, 닫는 어시스턴트 메시지에 렌더링됩니다. 호스트는 모든 append-기원 단계 메시지를 대상으로 받아들이지만, 다단계 턴의 이전 단계는 평가 가능한 본문이 아니라 도구 행을 렌더링하므로 UI는 호스트 계약이 허용하는 것보다 좁은 집합을 노출합니다.

세션마다 하나의 `MessageFeedbackController`가 그 세션의 모든 메시지 컨트롤을 뒷받침합니다. `list` 읽기 하나가 트랜스크립트 전체를 시드하며, 마운트 시 실행되지 않고 첫 호버나 포커스까지 미뤄집니다. 각 변경은 컨트롤러가 마지막으로 관찰한 버전을 `ifVersion`으로 보내고, `version-conflict` 응답이 권위 있는 항목을 담으므로 컨트롤러는 다시 가져오지 않고 응답에서 조정합니다. 변경은 세션별로 직렬화되어 대기 중인 연산이 커밋된 버전과 비교합니다. 주입된 `retract` 연산은 그 큐 안에서 커밋된 평가를 다시 확인하고 동시 변경 이후에는 무변경이 되므로, 낡은 UI가 맨 평가만 기록해 대화 상자를 우회할 수 없습니다. `connection/reset`은 이미 읽은 세션만 새로 고칩니다.

기록되지 않은 어느 평가든 세션의 피드백 대화 상자, 즉 `conversation.input.overlay`의 `feedback-dialog` 항목을 엽니다. 일곱 개 분류 칩과 상세 상자가 있는 공유 Modal 카드입니다. 제출하면 선택한 분류와 트리밍된 설명을 담은 선택된 판단을 기록하거나, 둘 다 없이 기록합니다. 성공하면 대화 상자를 닫고 승인 토스트를 보여 주며, 실패하면 대화 상자와 초안을 열어 둔 채 경고 토스트를 보여 줍니다. 같은 대화 상자는 맨 `/feedback`(`ui-commands`가 `action`으로 라우팅하는 장식)으로도 세션에 대해 열리고 `sessionFeedback.record`를 통해 기록합니다. `/feedback <text>`는 호스트 명령 경로를 유지합니다. 기록된 평가를 클릭하면 대화 상자를 열지 않고 철회합니다.

## 경계와 한계

- 연산 큐는 프로세스 지역이며, 콜드 기록자 배제는 선택된 영속 제공자에 의존합니다.
- 삭제는 현재 항목만 제거하며, 추가 전용 로그의 이전 노트 텍스트나 이미 전달된 접미사는 제거하지 않습니다.
- 라이브 분리 이후 영속 카탈로그가 헤더를 구체화하기 전의 좁은 구간에 들어온 요청은 `session-not-found`를 받을 수 있으며, 호출자는 은퇴 구체화 이후 재시도합니다.
- 콜드 요청은 전체 로그를 읽으며, 서비스에는 항목 수나 총 바이트 상한이 없습니다. `maxNoteBytes`는 각 노트만 제한합니다.
- 호스트 계약은 인증된 행위자나 감사 신원을 기록하지 않으므로 신뢰된 호출자 경계를 가정합니다.
- 웹 컨트롤은 채팅 뷰에만 나타납니다. 궤적(trajectory)과 워터폴 뷰는 어시스턴트 노드가 같은 `messageId`를 나르더라도 피드백 항목을 렌더링하지 않습니다.
- 웹 컨트롤러는 피드백 로그 이벤트를 소비하지 않으므로, 두 번째 탭의 평가는 즉시가 아니라 재연결이나 다음 충돌 응답에서 보입니다.
- 대화 상자는 `maxNoteBytes`를 미리 검사하지 않으므로, 메시지에 대한 너무 큰 설명은 입력 중이 아니라 제출 시 `note-too-large`로 실패합니다. 세션 논평에는 크기 제한이 없는데, `/feedback` 명령에 그런 제한이 없었기 때문입니다.
- `sessionFeedback.record`는 라이브 세션만 서비스하고 그 밖에는 `session-not-found`로 응답합니다. 대화 상자가 열려 있는 동안 세션이 은퇴하면 대화 상자가 그 실패를 보고합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmessagefeedback--messagefeedbackservice"></a>

### `ctx.messageFeedback` — `MessageFeedbackService`

Session-log service; cold operations never construct a Session or Agent.

```ts cordis-catalog
/**
 * Read current feedback from the canonical log.
 * @param request - Session to inspect.
 * @returns immutable items or a definite persistence miss.
 */
@Remote('list') list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>

/**
 * Create or replace feedback after checking its current version.
 * Matching no-ops retain the version and append no event.
 * @param request - Target, desired value, and observed item version.
 * @returns the durable item or an explicit business failure.
 */
@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>

/**
 * Delete one item after checking its version; absence succeeds without an event.
 * @param request - Session, message, and observed item version.
 * @returns the stable absent postcondition or an explicit failure.
 */
@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>
```

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)

<a id="ctxsessionfeedback--sessionfeedbackservice"></a>

### `ctx.sessionFeedback` — `SessionFeedbackService`

Host Remote through which a product surface records a Session-level remark.

```ts cordis-catalog
/**
 * Record one remark on a live Session.
 * @param request - target Session plus the optional text and category.
 * @returns the recorded postcondition, or `session-not-found` when no live
 * Session carries the id.
 */
@Remote('record') record(request: SessionFeedbackRecordRequest): Promise<SessionFeedbackRecordResult>
```

Source: [`packages/feedback/command-feedback/src/index.ts`](../../packages/feedback/command-feedback/src/index.ts)

<a id="feedback-events"></a>

### `feedback/*` events

<a id="feedbackcommitted--parallel"></a>

#### `feedback/committed` — parallel

Observe a durable cold feedback mutation without publishing a live Session. Observers run before write ownership is released and must not await another message-feedback operation for this Session. The payload is borrowed read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).

```ts cordis-catalog
/**
 * Observe a durable cold feedback mutation without publishing a live Session.
 * Observers run before write ownership is released and must not await
 * another message-feedback operation for this Session. The payload is borrowed
 * read-only; deep-clone it before transferring ownership (for example, to Session.fromRestore).
 * @param inspection - committed canonical prefix, including the feedback as its last event.
 * @mode parallel
 */
'feedback/committed'(inspection: SessionInspection): void
```

Types: [SessionInspection](persistence.ko.md)

Source: [`packages/feedback/message-feedback/src/index.ts`](../../packages/feedback/message-feedback/src/index.ts)
<!-- END GENERATED cordis-surface -->
