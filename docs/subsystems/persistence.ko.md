# 세션 영속성

[English](persistence.md) | [中文](persistence.zh.md) | 한국어

이벤트 로그를 위한 **내구성 seam**입니다. [session.md](session.ko.md)는 메모리 내 `Session`, 즉 진실 공급원인 추가 전용 `SessionEvent` 로그를 설명합니다. 이 페이지는 그 로그를 어떻게 내구성 있게 만드는지 다룹니다. 추상 `SessionPersistence` 서비스, 그 제공자 모델과 배포되는 JSONL 백엔드, 플러시 체크포인트, 충돌 복구, 그리고 로그와 나란히 이동하는 메타데이터 헤더입니다. 로그가 나르는 이벤트 어휘는 생성된 [영속성 로그 이벤트 카탈로그](../persistence-catalog.ko.md)에 멤버 단위로 열거되어 있습니다.

이 seam은 [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)입니다. 기존 `SessionEvent` 위에서 `create`/`open`/`stat`/`list`를 노출하는 추상 서비스 하나([dsh-session-persistence](../../packages/session/session-persistence), `ctx.sessionPersistence`)이며 **병렬 영속 이벤트 타입은 없습니다**. `create`와 `open`은 모든 로그 접근과 단일 기록자 소유권을 나르는 세션별 `SessionHandle`(`read`/`append`/`flush`/`close`)을 반환합니다. 저장소는 [dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)을 제공자로 배포하며, 저장소 밖 제공자도 같은 서비스 계약을 구현할 수 있습니다. [핸들 기반 영속성 Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md)와 [session-persistence 참조](../../packages/session/session-persistence/README.md)를 참고하세요.

## `SessionHandle` — 저장된 세션에 열린 하나의 통로

모든 로그 읽기와 쓰기는 id 주소 방식 서비스 메서드가 아니라 핸들을 통해 흐릅니다. 핸들은 프로세스 간 쓰기 임대가 지키는 유일한 문입니다. 읽기는 호출자가 소유하는 바깥 슬라이스와 이벤트 값의 생산자 확립 별칭 상태를 반환합니다. 하나의 핸들 타입이 두 접근을 모두 처리하며(`read` 핸들에 대한 변경은 타입 분리가 아니라 런타임 `SessionReadOnlyError`입니다), 인프로세스 단일 기록자 소유권 덕분에 소유자가 활성인 동안 두 번째 `open(id, 'write')`는 `SessionAlreadyOwnedError`로 거부됩니다.

```ts type-equiv
/** One persistence event slice returned by {@link SessionHandle.read}. */
interface SessionHandleReadResult {
  /**
   * Whether event values are exclusively owned or shared only after deep
   * freezing. Slicing preserves the producer's state even when no events remain.
   */
  readonly eventState: SessionSeedEventState
  /** Event values in a caller-owned outer array. */
  readonly events: readonly SessionEvent[]
}
```

```ts type-equiv
/**
 * One open channel onto a stored session. A handle is single-owner state, not
 * a shared service: `read` never backtracks below what this handle already
 * observed, a `write` handle reads its own successful appends, and `close()`
 * is the one teardown (idempotent, uncancellable; `Symbol.asyncDispose`
 * delegates to it). Every operation on a closed handle rejects with
 * `SessionHandleClosedError`.
 *
 * Freshness across handles: once an `append` or `flush` resolves on a write
 * handle, every read STARTED afterwards on the same backend instance — on any
 * handle, or through `stat`/`list` — observes at least that prefix.
 * Reads concurrent with a mutation carry no ordering promise beyond the valid
 * contiguous prefix.
 */
interface SessionHandle extends AsyncDisposable {
  /** The stored session this handle addresses. */
  readonly id: SessionId
  /** The immutable stored header, fixed at `create`/`open`. */
  readonly header: SessionHeader
  /**
   * Exact fork-inherited prefix length stored with the log; `0` when
   * `header.isSeeded` is false. Storage metadata paired with the header for
   * every body read, never part of the replayable event log.
   */
  readonly inheritedEventCount: SessionLogOffset
  /** Whether this handle may mutate the log. */
  readonly access: SessionAccess

  /**
   * Read a slice of the valid contiguous logical log. The slice is a legal log
   * prefix segment: a torn physical tail is never returned, and repeated reads
   * on this handle never observe an older state than a prior read.
   * @param offset - first logical event seq to include; defaults to `0`.
   * @param length - maximum number of events to return; defaults to the rest
   *   of the log. An offset at or past the end returns an empty list.
   * @param options - optional cancellation.
   * @returns the caller-owned outer slice plus the ownership state of its event values.
   */
  read(offset?: number, length?: number, options?: SessionHandleReadOptions): Promise<SessionHandleReadResult>

  /**
   * Append a contiguous batch continuing the current logical end. The first
   * event's `seq` MUST equal the stored next-seq; committed events are never
   * rewritten. Persistence is best-effort: on resolution the batch is
   * accepted, ordered, and visible to reads on this backend instance, but
   * only a resolved {@link flush} promises it survives a crash — a backend
   * may buffer or batch physical writes behind append. Rejects with
   * `SessionReadOnlyError` on a read handle and `SessionOwnershipLostError`
   * when write ownership is gone.
   * @param events - the contiguous batch, in seq order.
   * @param options - optional cancellation observed before the write starts.
   */
  append(events: readonly SessionEvent[], options?: SessionHandleAppendOptions): Promise<void>

  /**
   * The durability barrier — the one operation that promises storage: on
   * resolution every acknowledged append is durable and the session is
   * materialized for other processes; an empty created session becomes
   * durably listable here. Callers that must survive a crash flush; a backend
   * whose `append` already persists on resolution treats this as
   * materialize-if-needed. Rejects with `SessionReadOnlyError` on a read
   * handle.
   * @param options - optional cancellation observed before the barrier starts.
   */
  flush(options?: SessionHandleFlushOptions): Promise<void>

  /**
   * Release the handle: a read handle frees local resources; a write handle
   * completes pending durability and releases write ownership. Idempotent,
   * asynchronous, and deliberately not cancellable.
   */
  close(): Promise<void>
}
```

생성된 세션은 `create`가 이행되는 순간부터 이 프로세스에서 관찰 가능하며, 백엔드는 첫 `append`나 `flush`까지 물리적 구체화(순수한 최적화)를 미룰 수 있습니다. 다른 프로세스는 구체화된 세션만 보고, 충돌 전에 구체화되지 않은 세션은 존재하지 않았던 것이 됩니다.

## 플러시 체크포인트

`session/event`는 *동기* 알림입니다. 마운트된 백엔드는 세션 id로 이를 활성 쓰기 핸들의 경계 있는 write-behind 창으로 라우팅하며 생산자를 막지 않습니다(영속성이 이미 id당 활성 쓰기 핸들 하나를 강제하므로 백엔드는 이 리스너들을 한 번만 설치합니다). 첫 대기 이벤트가 고정된 내부 배칭 창을 시작하고, 이후 이벤트는 기한을 재설정하지 않고 합류합니다. 만료되면 세션의 쓰기 핸들을 통해 내구성 있는 `append` 하나를 시작하며, 그 쓰기 중에 허용된 이벤트는 자체 기한을 받아 후속 배치를 이룹니다. `session/flush`는 대기를 취소하고 정지 상태까지 비우므로, 루프는 다음 일반 턴을 시작하기 전의 순서 및 오류 관찰 체크포인트로 여전히 이를 사용합니다. 거부된 백그라운드 쓰기는 이벤트를 순서대로 보유하고 자동 경로를 일시 중지하며 로거를 통해 보고됩니다. 다음 명시적 플러시가 재시도하고 호출자에게 크게 거부합니다. `session/disposed`는 같은 최종 비우기를 수행하고 핸들을 닫으며, `close()` 자체도 라우팅된 버퍼를 여전히 열린 저장소를 통해 비우므로 백엔드 정리의 닫기 훑기가 아무것도 잃지 않습니다. 이 창은 의도적 배칭 대기만 제한하며, 이벤트 루프 스케줄링이나 백엔드 내구성 지연을 제한하지 않습니다.

## 충돌 복구는 중단된 턴을 보존합니다

턴 중간에 충돌한 로그는 열린 `turn/start`로 끝나고 `turn/end`가 없습니다. 영속성은 이를 **절단하거나 복구하지 않습니다**. 장기 과제에서 턴 하나는 거대할 수 있고(많은 단계, 큰 도구 출력), 그 이벤트들은 충돌 전에 내구성 있게 추가되었습니다. 영속성은 물리적으로 유효한 연속 로그를 반환하며, 결코 이행되지 않은 추가에 속하는 찢어진 물리적 꼬리의 불완전한 조각만 버립니다. 그로부터 복구된 완전한 기록(JSONL 백엔드는 찢어진 Zstandard 프레임을 부분 디코딩합니다)은 핸들의 첫 새 추가 전에 쓰기 경로가 내구성 있게 다시 씁니다. 복구는 판독기의 몫입니다. 재개(agent-loop)는 쓰기 핸들을 통해 저장된 로그를 읽고 `interruptedTurnClosers`(누락된 도구 오류, 열린 `step/end`, 그리고 합성 `turn/end { reason: { kind: 'interrupted' } }`)를 계산하고, 세션을 게시하기 전에 같은 핸들을 통해 일반 배치로 추가합니다. `interrupted`는 어떤 루프도 내보내지 않는 유일한 `TurnEndReason`입니다([session.md](session.ko.md#턴이-끝난-이유-turnendreasonmap) 참고).

따라서 복구는 쓰기 소유권 아래에서만 씁니다. 라이브 세션의 쓰기 핸들은 그 수명 주기 소유자가 보유하므로, 동시 `open(id, 'write')`는 라이브 턴에 대한 복구와 경쟁하는 대신 `SessionAlreadyOwnedError`로 거부됩니다. 읽기 전용 관찰자(session-query)는 중단된 콜드 로그를 같은 클로저로 메모리에서만 균형 맞추고 아무것도 다시 쓰지 않습니다.

읽기 전용 관찰은 `open(id, 'read')`입니다. 핸들은 검증된 연속 프리픽스 슬라이스를 제공하고 찢어진 꼬리는 결코 제공하지 않으며, 한 핸들에서의 반복 읽기는 이전 읽기보다 오래된 상태를 관찰하지 않습니다. 영속성 측 준비된 세션 캐시는 없습니다. session-query가 자체 콜드 읽기 캐시를 소유하며, id당 균형 잡힌 콜드 세션 하나를 `stat().revision` 변경 토큰에 키잉하고 토큰이 바뀔 때만 다시 읽습니다. 이 수명 주기는 [핸들 기반 영속성 Agent Note](../../.agents/notes/implemented/architecture/2026-08-27-handle-based-session-persistence.md)가 소유하며, 보관된 [세션 준비 기록](../../.agents/notes/archived/architecture/2026-08-05-session-preparation.md)이 원래의 게시 경계 `SessionPreparation` 결정을 기록합니다.

## `SessionLocation` — 세션별 아티팩트 메타데이터

`SessionLocation`은 진단과 내보내기를 위한 관찰 메타데이터이며, 로그 접근은 여전히 세션 핸들의 `read`를 거칩니다. 구체화된 영속 스냅샷은 선택된 아티팩트 경로를 담고, `SessionFormatUnsupportedError`는 빌드가 해석하기를 거부한 원시 로그를 지목할 수 있습니다. JSONL은 프로젝트/세션 디렉터리 안의 절대 트랜스크립트 경로를 제공하며, 세션당 아티팩트 하나가 없는 백엔드는 아무것도 제공하지 않습니다.

```ts type-equiv
/**
 * A backend-resolved, per-Session local artifact path used by observational
 * snapshots and refusal diagnostics. It names a backend target for the Session
 * and does not authorize reads; log access still goes through a session
 * handle's `read`. It is not persisted Session content.
 */
interface SessionLocation {
  /** Backend-specific artifact kind, for example `jsonl`. */
  readonly kind: string
  /** Absolute path to this session's backend-owned artifact. */
  readonly path: string
}
```

<a id="sessionheader--metadata-beside-the-log"></a>

<a id="sessionheader--로그-옆의-메타데이터"></a>
## `SessionHeader` — 로그 옆의 메타데이터

세션별 메타데이터는 이벤트 로그와 **별도로** 이동합니다. 헤더는 형식 버전, cwd, `isSeeded` 계보 비트를 담고, 본문을 가진 저장 값은 그 옆에 정확한 상속 절단점을 담습니다. 어느 것도 `SessionEventMap`에 속하지 않으며 `deriveMessages()`에 도달하지 않습니다. 논리 헤더는 `session.header`를 통해 붙고, 세션은 그 절단점을 `inheritedEventCount`로 노출합니다.

출처: [`packages/core/session/src/types.ts`](../../packages/core/session/src/types.ts)

```ts type-equiv
/**
 * Immutable validated storage metadata, kept outside the conversation event log.
 */
interface SessionHeader {
  /**
   * Current logical format version, stamped from {@link SESSION_FORMAT_VERSION}.
   * Historical physical headers are translated before entering this interface.
   */
  readonly version: typeof SESSION_FORMAT_VERSION
  /** The session's id (mirrors the {@link Session}'s id). */
  readonly id: SessionId
  /** Non-negative safe-integer Unix epoch milliseconds when the session was created. */
  readonly createdAt: number
  /** Absolute working directory the session was created in (if any). */
  readonly cwd?: string
  /**
   * Direct creator of a subagent Session. Ordinary forks omit this field;
   * historical ordinary forks may retain their source id here. Presence alone
   * does not classify a Session as a subagent; use `origin` for that distinction.
   */
  readonly parentSession?: SessionId
  /**
   * Whether this Session contains a fork-inherited event prefix. The exact prefix
   * length is Session state rather than ordinary header metadata.
   */
  readonly isSeeded: boolean
  /**
   * Coarse product classification for a session created as a subagent child.
   * This is presentation metadata, not proof that the child is continuable.
   */
  readonly origin?: 'subagent'
  /**
   * Delegation depth: absent (zero) for a top-level session, parent depth + 1
   * for a subagent child. Persisted so a recursion budget survives restart and
   * resume — a runtime-only depth would reset a resumed child to top-level.
   */
  readonly delegationDepth?: number
  /**
   * Id of the agent preset this session's agent was composed from, when the
   * deployment composes per session. Durable because the preset decides the
   * session's tools and prompt: a resume that restored a different composition
   * would replay history the model can no longer act on.
   */
  readonly agentPreset?: string
}
```

## 형식 거부 — 빌드가 충실히 읽을 수 없는 로그

백엔드는 충실히 해석할 수 없는 로그를 `SessionFormatUnsupportedError`로 거부하며, 아무것도 손상되지 않았으므로 `SessionPersistenceCorruptionError`와 구별됩니다. `stat`과 `list`는 가장 높은 정규 세대를 분류하고, 지원되는 과거 헤더를 그 본문을 읽거나 변경하지 않고 변환합니다. 과거 `open` 호출은 현재 논리 값을 반환하기 전에 세션별 마이그레이션 준비 하나를 공유하고 모든 원본 경로, 바이트, 아이노드를 그대로 둡니다. JSONL 제공자는 그 메모리 내 결과에서 게시 없이 읽기 핸들을 반환합니다. 쓰기 open은 준비를 재사용하는 동안 단일 기록자 클레임과 파일 임대를 보유하고, 최종 현재 세대를 배타적으로 게시한 뒤에야 쓰기 가능한 핸들을 반환합니다. 더 새로운 최고 세대는 더 오래된 읽기 가능 세대가 남아 있어도 거부합니다. 현재 형식 복원은 설치된 확장과 `ignorable: true`를 가진 알 수 없는 이벤트를 보존하고, 과거 v0/v1/v2 마이그레이션은 무시 가능으로 표시된 알 수 없는 타입도 거부합니다. 백엔드가 세션당 아티팩트 하나를 유지하면 메시지에 선택된 원시 로그 경로를 덧붙입니다. 저장소 밖 백엔드는 물리 형식 진입점에서 동등한 현재 전용 핸들 값과 방향 인식 거부를 강제해야 합니다. [릴리스된 형식 마이그레이션 결정](../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md)이 그 체인과 불변 게시 규칙을 소유합니다.

## `CreateSessionOptions` — 시딩과 메타데이터

스토어를 통해 `Session`을 만들 때는 `seed`(초기 재생 또는 포크 이력), 선택적 정확한 `inheritedEventCount`, `meta`(스토어가 `SessionHeader`로 접는 저장 수준 필드)를 받습니다. 스토어가 `version`/`id`를 채우고 `createdAt`에 기본값을 주며, 호출자는 검증된 절대 `cwd`, `parentSession` 계보, `isSeeded` 계보 비트, 선택적 거친 `origin`, `delegationDepth`, `agentPreset`, 기존 `createdAt`을 제공할 수 있습니다. 시드된 생성은 상속 프리픽스와 같은 명시적 시드와 정확한 절단점을 요구하며, 생성자는 설정이 자식 소유 이벤트를 추가하기 전에 그 절단점에 자식 소유 태그된 종료 시드 마커를 덧붙입니다. `origin: 'subagent'`는 제품 내비게이션이 중복된 자식 행을 숨기게 하지만, 디스크립터가 유효하거나 자식이 재개될 수 있음을 증명하지는 않습니다.

```ts type-equiv
/**
 * Options for creating a {@link Session} via the store. `seed` replays/forks
 * an existing event log; `meta` carries the caller-supplied storage fields the
 * store folds into a {@link SessionHeader}.
 */
interface CreateSessionOptions {
  /** Initial replay or fork history supplied at construction. */
  readonly seed?: readonly SessionEvent[]
  /**
   * Exact fork-inherited prefix length when `meta.isSeeded` is true. The
   * constructor appends the child-owned tagged marker at the cut unless
   * the seed already includes it followed by child-owned fork closers.
   */
  readonly inheritedEventCount?: SessionLogOffset
  /**
   * Storage metadata read once before publication. `isSeeded` marks fork
   * lineage; supplying replay history alone does not make it inherited.
   */
  readonly meta?: {
    readonly cwd?: string
    readonly parentSession?: SessionId
    readonly createdAt?: number
    readonly isSeeded?: boolean
    readonly origin?: 'subagent'
    readonly delegationDepth?: number
    readonly agentPreset?: string
  }
}
```

따라서 재생/포크는 `ctx.agents.create({ sessionId, seed, meta })`입니다. 포크는 추가로 `meta.isSeeded: true`와 함께 `inheritedEventCount`를 제공하며, agent-loop가 게시한 세션만 영속되고 루프는 게시 전에 새 세션의 쓰기 핸들을 통해 시드를 저장합니다. *영속된* 세션을 라이브 에이전트로 재개하는 것은 `ctx.agents.resume({ resumeSessionId })`입니다.

## 준비와 복원 소유권

`SessionStore.prepare()`는 일반 생성 옵션이나 `RestoredSessionOptions`를 통한 채택 가능 시드를 받습니다. 그 `eventState`는 이벤트 값이 독립 소유인지 아니면 깊은 동결 후에만 공유되는지를 밝히며, 그 상태는 생산자가 확립하고 슬라이싱은 결과 길이에서 다른 상태를 추론하지 않습니다. 복원은 다른 복사나 동결 패스 없이 그 값들을 검증하고 채택합니다. 그런 다음 `SessionPreparation`이 게시나 롤백까지 그 정확한 미게시 세션을 소유하며, 디스포즈는 동기적이고 멱등입니다. agent-loop의 재개는 세션의 쓰기 핸들을 통해 이 결과를 읽고 준비 전에 독립 소유 `interruptedTurnClosers`를 추가합니다.

```ts type-equiv
/**
 * Aliasing state of an adoptable Session seed. `shared-frozen` permits deeply
 * frozen aliases plus independently owned unfrozen values in the same seed.
 */
type SessionSeedEventState = 'detached' | 'shared-frozen'
```

```ts type-equiv
/**
 * Adoptable storage values transferred to {@link SessionStore.prepare}
 * without another copy or freeze pass.
 */
interface RestoredSessionOptions {
  /** Events that are independently owned or already deeply frozen. */
  readonly seed: SessionEvent[]
  /** Independently owned storage metadata to validate and freeze in place. */
  readonly meta: SessionHeader
  /** Exact number of fork-inherited leading events decoded from storage. */
  readonly inheritedEventCount: SessionLogOffset
  /** Aliasing state carried from the operation that produced the seed. */
  readonly eventState: SessionSeedEventState
}
```

```ts type-equiv
/** Inputs accepted while constructing an unpublished Session. */
type PrepareSessionOptions =
  | (CreateSessionOptions & { readonly eventState?: undefined })
  | RestoredSessionOptions
```

```ts type-equiv
/** Options for a preparation whose provider retains unpublished state. */
interface SessionPreparationOptions {
  /** Release provider-owned state when the Session was not published. */
  readonly release?: () => void
}
```

```ts public-api
/**
 * One exact unpublished Session and the provider state that keeps it usable.
 * Disposal is synchronous and idempotent. Providers decide whether release
 * returns the Session to a cache or discards it; publication may consume that
 * state before disposal, making the callback a no-op.
 */
declare class SessionPreparation implements Disposable {
  /** The exact Session to use for setup and publication. */
  readonly session: Session;
  /**
   * Wrap an unpublished Session in one preparation lifetime.
   * @param session - exact unpublished Session.
   * @param options - optional provider release behavior.
   * @returns a preparation disposed after publication or rollback.
   */
  static create(session: Session, options?: SessionPreparationOptions): SessionPreparation;
  /** Release provider state once when this preparation leaves its caller. */
  [Symbol.dispose](): void;
}
```

## 가벼운 원본 리비전

파생 읽기 모델의 소비자는 전체 이벤트 로그를 로드하기 전에 저렴한 불투명 리비전을 비교합니다. 리비전은 `stat`/`list`에서 오는 백엔드 인스턴스별 변경 토큰입니다. 같은 리비전은 변경되지 않은 로그로 취급될 수 있고, 다른 리비전은 아무것도 약속하지 않으며, 쓰기 소유권 변동은 결코 리비전을 바꾸지 않습니다. session-query가 콜드 읽기 캐시를 여기에 키잉하며, 이 토큰은 open, read, resume에서 아무 역할도 하지 않습니다.

```ts type-equiv
/**
 * Backend-owned token that identifies both one storage source and one revision
 * of a persisted session log.
 */
type SessionPersistenceRevision = Branded<'SessionPersistenceRevision'>
```

```ts type-equiv
/**
 * Lightweight stored-session observation returned by {@link SessionPersistence.stat}
 * and {@link SessionPersistence.list} without reading the full event log.
 */
interface SessionPersistenceSnapshot {
  /** Detached metadata for one stored session. */
  readonly header: SessionHeader
  /** Header-only format classification; absent without versioned artifact metadata. */
  readonly formatStatus?: 'current' | 'migration-required'
  /** Opaque change token; see {@link SessionPersistence.stat}. */
  readonly revision: SessionPersistenceRevision
  /** Logical event count, when the backend can provide it cheaply from metadata; otherwise absent. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend can provide it cheaply (JSONL); otherwise absent. */
  readonly sizeBytes?: number
  /**
   * Backend-resolved location of the selected materialized per-Session
   * artifact, for diagnostics and export. Absent when the backend has no
   * materialized per-Session file, including an unmaterialized pending Session.
   */
  readonly location?: SessionLocation
}
```

선택적 `eventCount`/`sizeBytes` 필드는 이를 명시적으로 필요로 하는 소비자를 위한 저렴한 백엔드 관찰로 남습니다. 세션 나열은 콜드 로그를 열기 위해 두 필드 중 어느 것도 사용하지 않습니다. 헤더와 신원이 확인된 프로젝션 캐시 힌트만 읽으므로, 캐시나 세션 형식 업그레이드가 시작을 본문 스캔으로 바꾸는 일은 없습니다.

## 백엔드

배포되는 제공자는 추상 `SessionPersistence` 계약(`create`/`open`/`stat`/`list`, `read`/`append`/`flush`/`close`와 전반적 선택적 취소를 나르는 세션별 `SessionHandle`)을 구현하고 공유 영속성 계약 스위트를 통과합니다:

- **[dsh-session-persistence-jsonl](../../packages/session/session-persistence-jsonl)** — 세션당 추가 전용 논리 JSONL 로그이며, 기본적으로 체크섬된 연결 Zstandard 프레임으로, 구성에 따라 원시 줄로 저장되고, 충돌 안전한 원자적 구체화, 배치별 `fsync` 추가, 첫 새 추가 전의 찢어진 꼬리 절단을 갖춥니다. `stat`/`list`는 `sizeBytes`와 최선 노력의 `fs.stat` 기반 리비전을 담습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionpersistence--sessionpersistence-abstract-seam"></a>

### `ctx.sessionPersistence` — `SessionPersistence` (abstract seam)

Durable append-only session storage addressed through per-session handles.

Storage semantics shared by every backend: events are contiguous from seq 0 and never rewritten; a torn physical tail is never returned to a reader and is truncated by the write path before its first append; reads validate current-format records only and refuse unknown vocabulary fail-closed. `append` persists best-effort; `flush` — per handle or service-wide — is the durability barrier.

Visibility: a created session is observable through `stat`/`list`/`open` in this process from the moment `create` resolves, even while a backend defers physical materialization (a pure optimization); other processes see the session only once it materializes, and a session that never materialized before a crash never existed. `SessionHandle.flush` forces materialization.

Freshness: once an `append` or `flush` resolves, reads started afterwards on this backend instance observe at least that prefix.

```ts cordis-catalog
/**
 * Create a new stored session and take its write ownership.
 * @param header - the immutable header (id, version, cwd, lineage) to store.
 * @param options - optional cancellation.
 * @returns a `write` handle owned by the caller; close it to release ownership.
 * @throws {SessionAlreadyExistsError} when the id already exists.
 */
abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

/**
 * Open an existing stored session.
 *
 * `read` never takes ownership and works while another handle (or process)
 * holds write ownership. `write` atomically claims single-writer ownership;
 * an existing active owner rejects.
 * @param id - the stored session to open.
 * @param access - `read` or `write`.
 * @param options - optional cancellation.
 * @returns the open handle.
 * @throws {SessionPersistenceNotFoundError} when the session does not exist.
 * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
 */
abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

/**
 * Flush every active write handle owned by this service instance in one
 * durability barrier: each handle's routed live events drain durably and
 * its session materializes, exactly as that handle's own
 * `SessionHandle.flush` would. Read handles buffer nothing and are
 * untouched. A handle closed concurrently counts as flushed — close itself
 * drains durably.
 * @returns resolution once every write handle active at the call has flushed.
 * @throws {AggregateError} naming each session whose flush failed; the
 *   remaining handles still flush.
 */
abstract flush(): Promise<void>

/**
 * Observe one stored session without reading its event log or taking
 * ownership.
 *
 * The snapshot's `revision` is an opaque change token comparable only
 * against revisions from the same service instance and session id: equal
 * revisions may be treated as an unchanged log; unequal revisions promise
 * nothing. Write-ownership churn does not change a revision. It exists for
 * derived read-model caches keyed off `stat`/`list`; it plays no part in
 * open, read, or resume.
 * @param id - the stored session to observe.
 * @param options - optional cancellation.
 * @returns the snapshot, or `undefined` when the session does not exist.
 */
abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

/**
 * List every stored session visible to this process, in no promised order.
 * @param options - optional cancellation.
 * @returns one snapshot per stored session.
 */
abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>
```

Types: [SessionId](core.ko.md)

Source: [`packages/session/session-persistence/src/index.ts`](../../packages/session/session-persistence/src/index.ts)
<!-- END GENERATED cordis-surface -->
