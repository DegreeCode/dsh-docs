# 세션 참조

[English](session-reference.md) | [中文](session-reference.zh.md) | 한국어

호스트 기반 파일 탐색과, 구조화된 세션 간 참조 요청 및 준비된 메시지 컨텍스트입니다. 경로 전용 완성 기록과 문법은 [file-reference 계약](../../packages/context/file-reference)이 소유하고, [session-reference 계약](../../packages/context/session-reference)은 정규 URI, 현재 표면 프로젝션, 태그 안전 JSON과 바이트 보유, 안정적인 오류, 신뢰할 수 없는 모델 프롬프트를 정의합니다. 호스트 어댑터는 UI 언급 구문을 에이전트 코어로 넘기는 대신 이 타입들을 사용합니다.

출처: [`packages/context/file-reference/src/types.ts`](../../packages/context/file-reference/src/types.ts) · [`packages/context/session-reference/src/types.ts`](../../packages/context/session-reference/src/types.ts)

## 파일 후보

`FileReferenceCandidate`는 경로 전용 탐색 결과입니다. 지목된 에이전트가 작업 디렉터리 범위를 제공하고, 제공자는 파일 내용을 읽지 않고 순위와 네임스페이스 접근을 결정합니다.

```ts type-equiv
/** One path-only completion candidate inside the target session cwd. */
interface FileReferenceCandidate {
  /** User-facing path accepted by normal prompts and filesystem tools. */
  path: string
  /** Directories keep completion open; files finish the mention. */
  kind: 'file' | 'directory'
}
```

## 입력과 후보

`SessionReferenceInput`은 호스트 독립적인 선택입니다. id가 권위 있고, 레이블은 스냅샷으로 전달되는 표시 메타데이터입니다.

```ts type-equiv
/** One source session selected by a host. */
interface SessionReferenceInput {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Optional user-facing mention label. */
  label?: string
}
```

`SessionReferenceCandidate`는 호스트 대상 탐색 출력입니다. `label`은 세션 제목이 있으면 최신 제목을 쓰고, 선택적 표시 텍스트는 서브에이전트의 영속 생성 레이블을 선호합니다. 필터링은 트랜스크립트 텍스트가 아니라 세션 id, cwd와 함께 둘 다 검색합니다. Remote 후보의 정규 언급은 표시 텍스트가 있으면 이를 사용합니다.

```ts type-equiv
/** One host-facing candidate from exact session metadata. */
interface SessionReferenceCandidate {
  /** Opaque source session identity. */
  sessionId: SessionId
  /** Latest log-backed title, falling back to the opaque session id. */
  label: string
  /** Display and canonical-mention text, preferring a subagent's durable creation label over {@link label}. */
  displayTitle?: string
  /** Source session working directory, when recorded. */
  cwd?: string
  /**
   * True when {@link SessionReferenceCandidate.cwd} is recorded and equals the
   * requesting agent's. Hosts that only surface a distinguishing location
   * read this instead of comparing paths they never received.
   */
  sameWorkspace: boolean
  /** Source session creation time in Unix epoch milliseconds. */
  createdAt: number
}
```

`sessionReferenceResolver/candidates` Remote 메서드는 브라우저 소비자에게 같은 탐색을 제공하고 각 후보의 정규 프롬프트 언급을 붙입니다.

```ts type-equiv
/** One discovery candidate carrying its canonical prompt mention. */
interface SessionReferenceMentionCandidate extends SessionReferenceCandidate {
  /** Canonical `@[label](dsh-session:…)` mention serialized into the prompt draft. */
  mention: string
}
```

## 준비된 메시지

준비는 읽을 수 있는 현재 메시지 내용을 보존하고 기껏해야 하나의 집계된 컨텍스트를 반환합니다. 그 영속 소스 기록은 `capturedThroughSeq`를 참조된 세션의 원래 세대에서의 좌표로 유지하며, 이를 담고 있는 세션의 seq로 재해석하지 않습니다. `capturedFormatVersion`은 그 세대를 기록하고, 없으면 출시된 형식 v0을 뜻합니다.

```ts type-equiv
/** Durable source session, cited event seqs, and snapshot facts for prepared cross-session context. */
interface SessionReferenceSource {
  kind: 'session-reference'
  /** Material lifted out of another session's log (`recall` context form). */
  form: 'recall'
  version: 1
  references: {
    sessionId: string
    label: string
    /** Source Session format generation; absence identifies version 0. */
    capturedFormatVersion?: number
    capturedThroughSeq: OptionalSessionSeq
    compacted: boolean
    originalMessages: number
    retainedMessages: number
    omittedMessages: number
    omittedBytes: number
    truncated: boolean
    inputIndex: number
  }[]
}
```

```ts type-equiv
/** Direct message content and optional referenced-session context. */
interface PreparedReferencedMessage {
  /** Readable message content after host mention tokens are removed. */
  content: ContentBlock[]
  /** Aggregated untrusted snapshot, absent when the message has no references. */
  additionalContext?: UserMessage
}
```

## 오류

`SessionReferenceError.code`는 유효하지 않은 구성이나 입력, 자기 참조, 개수 한도, 소스 읽기 실패, 예산 실패, 취소를 구분합니다. 호스트 프로토콜은 프롬프트 바이트를 들여다보지 않고 이 코드를 자체 오류 봉투로 매핑합니다.

```ts type-equiv
/** Stable failure codes exposed to host adapters. */
type SessionReferenceErrorCode =
  | 'SESSION_REFERENCE_INVALID_CONFIG'
  | 'SESSION_REFERENCE_INVALID_REFERENCE'
  | 'SESSION_REFERENCE_SELF_REFERENCE'
  | 'SESSION_REFERENCE_TOO_MANY'
  | 'SESSION_REFERENCE_READ_FAILED'
  | 'SESSION_REFERENCE_BUDGET_EXCEEDED'
  | 'SESSION_REFERENCE_CANCELLED'
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfilereferences--filereferenceservice-abstract-seam"></a>

### `ctx.fileReferences` — `FileReferenceService` (abstract seam)

Host capability for cancellable file-reference discovery.

```ts cordis-catalog
/**
 * List file and directory candidates for one agent's working directory.
 * @param agent - target agent whose session cwd bounds discovery.
 * @param query - path text following `@` or `@"`.
 * @param signal - caller cancellation.
 * @returns deterministic path-only candidates.
 */
abstract list( agent: Agent, query: string, signal: AbortSignal, ): Promise<FileReferenceCandidate[]>
```

Types: [Agent](core.ko.md)

Source: [`packages/context/file-reference/src/index.ts`](../../packages/context/file-reference/src/index.ts)

<a id="ctxsessionfilereferences--sessionfilereferences"></a>

### `ctx.sessionFileReferences` — `SessionFileReferences`

Host Remote adapter over the composed file-reference provider.

```ts cordis-catalog
/**
 * List file and directory candidates for one Agent's working directory.
 * @param agent - target Agent resolved from the Session identity on the wire.
 * @param query - path text following `@` or `@"`.
 * @param signal - caller cancellation.
 * @returns deterministic path-only candidates from the composed provider.
 */
@Remote list( agent: Agent, query: string, signal: AbortSignal, ): Promise<FileReferenceCandidate[]>
```

Types: [Agent](core.ko.md)

Source: [`packages/api/session-controller/src/file-references.ts`](../../packages/api/session-controller/src/file-references.ts)

<a id="ctxsessionreferenceresolver--sessionreferenceresolver"></a>

### `ctx.sessionReferenceResolver` — `SessionReferenceResolver`

Exact-read consumer that prepares immutable cross-session message context.

```ts cordis-catalog
/**
 * List reference candidates, ranked by working-directory affinity.
 *
 * Discovery runs at keystroke rate, so titles and subagent labels only ever
 * come from projection reads; sessions without either fall back to their id.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title/display-title substring.
 * @param limit - optional positive result cap.
 * @param signal - optional cancellation boundary for host autocomplete teardown.
 * @returns candidates with canonical mention labels and presentation titles.
 */
async listCandidates( agent: Agent, query: string = '', limit: number = this.config.candidateLimit, signal?: AbortSignal, ): Promise<SessionReferenceCandidate[]>

/**
 * Remote face of {@link listCandidates}: the configured candidate limit
 * applies, and every candidate carries the canonical mention a host inserts
 * into the prompt draft.
 * @param agent - target agent; self is excluded and its cwd drives ranking.
 * @param query - optional case-insensitive session-id/cwd/title substring.
 * @param signal - caller cancellation.
 * @returns mention-carrying candidates in rank order.
 */
@Remote('candidates') async remoteExportCandidates( agent: Agent, query: string, signal: AbortSignal, ): Promise<SessionReferenceMentionCandidate[]>

/**
 * Snapshot all references for one accepted direct message and return one aggregated durable context.
 * Automatic budgets use the context capacity of `route`.
 * Missing model capacity or adapter uses 64 KiB; other metadata lookup failures and cancellation reject preparation.
 * Truncated previews include omission facts and a full-snapshot spill locator, or an explicit unavailable notice.
 * Cancellation prevents context publication, including when storage completes after cancellation.
 * @param agent - target agent; references to it are rejected.
 * @param content - already host-normalized readable message content.
 * @param references - structured source sessions in mention order.
 * @param route - provider and model whose context capacity sizes the previews.
 * @param signal - optional cancellation boundary for the active turn.
 * @returns detached content and optional referenced-session context.
 */
async prepare( agent: Agent, content: ContentBlock[], references: SessionReferenceInput[], route: Readonly<Pick<LlmCallConfig, 'provider' | 'model'>>, signal?: AbortSignal, ): Promise<PreparedReferencedMessage>
```

Types: [Agent](core.ko.md) · [ContentBlock](llm-streaming.ko.md) · [LlmCallConfig](llm-streaming.ko.md)

Source: [`packages/context/session-reference/src/index.ts`](../../packages/context/session-reference/src/index.ts)
<!-- END GENERATED cordis-surface -->
