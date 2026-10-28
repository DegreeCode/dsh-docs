# Session 프로젝션

[English](session-projection.md) | [中文](session-projection.zh.md) | 한국어

session-projection seam(이하 Session 프로젝션 seam)은 도메인 호스트 플러그인이 로그에서 파생된 세션별 상태의 현재 전체 값을 클라이언트 캐리어에 제공하는 [기능 seam](../capability-seams.ko.md)이며, Service Definition과 레지스트리([dsh-session-projection](../../packages/session/session-projection), `ctx.sessionProjections`), 도메인 기여자(각각 순수 단위 하나를 등록), 캐리어([dsh-session-controller](../../packages/api/session-controller)의 이력 꼬리 페이지와 `session/projection` 푸시 프레임)로 구성됩니다. 호스트 상태 리더는 활성화 중에 레지스트리를 요구합니다. 프레임워크가 구동하고 도메인이 계산합니다. 레지스트리가 `session/event`를 한 번 구독하고 커밋된 모든 이벤트를 모든 단위로 폴드하며, 도메인은 구독을 갖지 않고 클라이언트는 도메인 이벤트를 절대 폴드하지 않습니다. 클라이언트는 완성된 값을 받습니다. 설계 권위는 [session-projection RFC](../../.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md)이고, 구동/캐시/피드 계약은 [패키지 README](../../packages/session/session-projection/README.md)입니다.

출처: [`packages/session/session-projection/src/index.ts`](../../packages/session/session-projection/src/index.ts)

`ProjectionHandle`은 등록 해제 후에도 동기 리더를 유지합니다. `stateOf(session)`는 새로 커밋된 이벤트를 원래 단위로 폴드하며, 전역 스냅샷, 체크포인트, 알림에 다시 합류하지는 않습니다. 핸들을 사용하려면 등록이 여전히 먼저 완료되어야 합니다. [등록 수명 주기](../../packages/session/session-projection/README.md)를 참고하세요.

```ts type-equiv
/** An effect-owned registration with a reader retained independently of registration. */
interface ProjectionHandle<S> {
  /**
   * Read the current state, including after unregistering, by folding new
   * Session events with this handle's original unit. Do not mutate the live value.
   * @param session - Session whose committed events are folded.
   * @returns the projection state at the Session's current cursor.
   */
  stateOf(session: Session): S
  /**
   * Unregister from global drives and snapshots without invalidating this reader.
   * @returns a promise that resolves when this registration is released.
   */
  dispose(): Promise<void>
}
```

[호환성 규칙](../../packages/session/session-projection/README.md#deprecated-plugin-compatibility)이 레거시 폐기, 키 지정 읽기, 그리고 키당 한 번 발생하는 그 폐기 경고를 정의합니다.

## 단위

`ProjectionDefinition<K, S>`는 각 단위의 호스트 상태 타입을 로컬로 담습니다. 등록은 `stateSchema`에서 `S`를 추론하고 `ProjectionHandle<S>`를 반환합니다. 클라이언트에 보이는 키만 `SessionProjectionMap`에 병합되어 그 전체 값의 타입을 정합니다. `wire` 블록이 단위를 클라이언트에 보이게 하며, 렌더링은 이 계층이 아니라 슬롯 시스템에 속합니다:

```ts type-equiv
/**
 * One domain's state-driven computation unit: a pure synchronous fold plus
 * declarations and an optional client view — never an opaque getter. The framework drives
 * `apply` on every committed session event; the domain holds no
 * subscriptions and owns only the computation. All functions MUST be
 * synchronous (an async unit would tear the carriers' consistency cut), and
 * `state` MUST be plain JSON (the persisted-cache precondition).
 */
interface ProjectionDefinition<K extends string, S> {
  /** The projection key this unit owns. */
  key: K
  /** Validates persisted state before it seeds a fold. */
  stateSchema: ZodType<S>
  /**
   * State for the empty log and its immutable Session metadata.
   * @param header - immutable metadata for the Session being projected.
   * @param inheritedEventCount - exact fork-inherited prefix length.
   * @returns the initial state.
   */
  init(header: SessionHeader, inheritedEventCount: SessionLogOffset): NoInfer<S>
  /**
   * Pure transition: previous state + one committed event → next state. A
   * unit uninterested in an event MUST return the same state reference — an
   * unchanged reference (`Object.is`) produces zero downstream work.
   * @param state - the state covering all prior events.
   * @param event - the next committed session event.
   * @returns the next state (same reference when the event is not the unit's).
   */
  apply(state: NoInfer<S>, event: SessionEvent): NoInfer<S>
  /** Client view. Omit for host-only units. */
  wire?: K extends keyof SessionProjectionMap ? {
    /** Validates the wire payload before it leaves the host. */
    viewSchema: ZodType<SessionProjectionViewValue<SessionProjectionMap[K]>>
    /**
     * State → wire payload (the read-side projection). The live drive keeps
     * the two latest raw results and compares them with `Object.is`; an
     * object-valued view must reuse its reference to suppress publication
     * across internal-only state changes.
     * @param state - the current state.
     * @returns the whole current value for this unit's key.
     */
    view(state: NoInfer<S>): SessionProjectionViewValue<SessionProjectionMap[K]>
    /**
     * Whether a Session summary carries this unit; omitted means `true`.
     * Declare `false` on a key whose map entry carries the
     * `SessionProjectionSummaryExcluded` mark: the runtime key set follows this
     * field, while the client view type follows the mark.
     * @default true
     */
    summary?: boolean
  } : never
  /**
   * Persisted-cache invalidation version: bump whenever the serialized state fields or the
   * fold semantics change, so persisted `(sessionId, key, ver, seq, val)`
   * rows from an older unit are discarded instead of being forward-applied
   * into garbage. Non-negative integer.
   */
  stateVersion: number
}
```

제공되는 모든 프로젝션 값은 완전한 읽기 모델입니다. 소스 이벤트는 전체 값을 담거나 도메인 소유 연산을 담을 수 있습니다. 단위의 결정적 `apply`가 재생을 소유하고, 체크포인트와 순방향 꼬리 재생이 같은 상태를 재구성합니다.

## 스냅샷과 변경 피드

```ts type-equiv
/**
 * One consistent read cut over every registered client-visible unit for one session.
 * `asOfSeq` is the shared watermark — the seq of the last event every value
 * reflects (`-1` for an empty log).
 */
interface ProjectionSnapshot {
  /** Seq of the last event the values reflect; -1 for an empty log. */
  asOfSeq: SessionSeqCursor
  /** Whole current client value per registered key. */
  values: Partial<SessionProjectionMap>
}
```

```ts type-equiv
/**
 * Change-feed listener: one unit's raw `view` result changed by `Object.is`
 * for one session. `value` is the schema-validated output; `seq` is the
 * unit's watermark at emission (the seq of the event that caused the change).
 */
type ProjectionChangeListener = (
  session: Session,
  key: Extract<keyof SessionProjectionMap, string>,
  value: unknown,
  seq: SessionSeq,
) => void
```

`snapshot(session)`은 완전히 동기적입니다. 캐리어가 페이지 슬라이스와 같은 틱에서 이를 읽으므로 `asOfSeq`가 두 읽기를 하나의 시퀀스 번호로 덮습니다. 클라이언트 뷰만 반환하며, 모든 값은 반환 전에 해당 단위의 `viewSchema`를 통과합니다. `handle.stateOf(session)`은 관련 없는 뷰를 계산하지 않고 라이브 호스트 상태 하나를 읽으며, 호출자는 차용한 참조를 변경하면 안 됩니다. 상태 참조가 바뀌면 캐시된 원시 뷰 하나를 계산하고, 변경 피드는 그 결과가 `Object.is`로 달라질 때만 발생합니다. 객체 값 뷰는 내부 전용 상태 변경에 걸쳐 게시를 억제하려면 자신의 참조를 보존해야 합니다.

## 요약 읽기

Session 요약은 `SessionProjectionMap` 항목이 `SessionProjectionSummaryExcluded<T>` 표시를 담은 키를 제외한 모든 등록 클라이언트 뷰를 담습니다. 이 표시는 런타임 표현이 없습니다. 즉 클라이언트 뷰 타입을 결정하는 반면 런타임 키 집합은 `wire.summary`가 결정하고, 생략은 `true`를 뜻합니다. 표시를 담은 항목의 키는 둘이 일치하도록 `wire.summary: false`를 선언하며, 그 필드는 단순 불리언이라 타입이 이를 강제하지는 않습니다.

`summaryKeys()`는 라이브 등록에서 키 집합을 도출하고, 등록이나 그 폐기가 키 테이블을 바꿀 때까지 같은 인스턴스를 계속 반환합니다. 요약 소비자는 이를 기존 키 기반 페이스에 전달합니다. 즉 캐시된 셀에는 `cachedSnapshot(session, keys)`, 체크포인트 행에는 `viewCheckpoint(rows, keys)`이며, 둘 다 워터마크 규칙을 유지하고 복사 없이 집합을 사용합니다. 따라서 요약 전용 읽기 페이스도, 집합의 두 번째 정의도 없습니다.

목록 행은 전체 프로젝션이 아니라 그 요약 프로젝션을 담으며, 요약 키 집합만 약속하고 그 이상은 약속하지 않습니다. `snapshot`, `cachedSnapshot`, `viewCheckpoint`는 키 부분 집합 없이 호출하면 완전하게 남으므로, 열린 Session과 그 팔로우 기준선, 제어 기준선은 모든 프로젝션 값을 유지합니다. `@` 참조는 같은 키 기반 페이스를 통해 라벨 키만 읽습니다.

### 요약 어휘

아래 선언들이 요약 규칙을 규정합니다. 표시, 그 제거, 제외 키 검사, 요약 값 타입은 순수 타입 출구에 선언되어 있고, 두 읽기 페이스가 받는 키 선택은 서비스 모듈에 선언되어 있습니다.

```ts type-equiv
/**
 * One `SessionProjectionMap` entry excluded from Session summary payloads
 * (the Session list row and any other summary read). The mark is type-only;
 * `T` keeps its exact runtime value and wire representation. Wrap only the
 * excluded contributor's own map entry, and place a nullable entry's `null`
 * outside the wrapper (`SessionProjectionSummaryExcluded<Item[]> | null`) so
 * the required symbol cannot absorb that member.
 */
type SessionProjectionSummaryExcluded<T> = T & {
  readonly [sessionProjectionSummaryExcluded]: true
}
```

```ts type-equiv
/**
 * One map entry's client view value: the summary mark stripped. The
 * conditional distributes over a nullable entry's union, so a `| null` member
 * written outside the wrapper survives unchanged.
 */
type SessionProjectionViewValue<T> =
  T extends SessionProjectionSummaryExcluded<infer Value> ? Value : T
```

```ts type-equiv
/** Every client view value, keyed by projection key, with no summary mark. */
type SessionProjectionViewValues = {
  [K in keyof SessionProjectionMap]: SessionProjectionViewValue<SessionProjectionMap[K]>
}
```

```ts type-equiv
/**
 * Keys a Session summary omits: map entries whose non-nullish value carries
 * the summary mark. Nullish members are ignored, so a nullable entry is still
 * recognized when its `null` lives outside the wrapper.
 */
type SessionProjectionSummaryExcludedKey = {
  [K in keyof SessionProjectionMap]:
  NonNullable<SessionProjectionMap[K]> extends SessionProjectionSummaryExcluded<unknown> ? K : never
}[keyof SessionProjectionMap]
```

```ts type-equiv
/**
 * The client values a Session summary carries: every client view value except
 * {@link SessionProjectionSummaryExcludedKey}. A summary read returns these
 * keys only; an opened Session's full snapshot keeps every view value.
 */
type SessionProjectionSummaryValues =
  Omit<SessionProjectionViewValues, SessionProjectionSummaryExcludedKey>
```

```ts type-equiv
/**
 * One read's client-visible key selection: an explicit key list, or a derived
 * set such as {@link SessionProjectionRegistry.summaryKeys}. A set is used as
 * given; only a list is copied into one.
 */
type ProjectionKeySelection =
  | readonly Extract<keyof SessionProjectionMap, string>[]
  | ReadonlySet<Extract<keyof SessionProjectionMap, string>>
```

## 레지스트리: `ctx.sessionProjections`

`SessionProjectionRegistry`([시그니처](#ctxsessionprojections--sessionprojectionregistry))가 구동을 소유합니다. 즉 `session/event` 구독 하나, 등록된 모든 단위에 대한 즉시 `apply`, 세션별·단위별 워터마크 셀입니다. 셀은 지연 생성됩니다. 이벤트가 흐른 뒤 등록된 단위나 레지스트리보다 오래된 세션은 첫 접근(이벤트 또는 읽기) 시 인메모리 로그에 `init`을 폴드합니다. 도메인은 활성화 중에 `register(definition)`을 await하고 그 핸들을 유지합니다. 등록은 호출 fiber에 속하므로 마지막 해제가 전역 구동과 스냅샷에서 키를 제거하는 반면, 유지된 핸들은 계속 읽을 수 있습니다. 같은 키·같은 버전 등록자는 단위 하나를 공유하고, 호환되지 않는 버전은 등록을 거부합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionprojectioncache--sessionprojectioncache"></a>

### `ctx.sessionProjectionCache` — `SessionProjectionCache`

The persisted projection cache service. Opens the `session_projcache` domain at init, checkpoints live sessions on a throttled write-behind (count/interval triggers from Config) plus three mandatory points — session creation, `turn/end`, and session disposal (the live-to-cold moment) — and serves the cached rows for a session header. Every durable write is fail-soft: failures log a warning and the cache self-heals on the next write.

```ts cordis-catalog
/**
 * The zero-I/O listing read: whole values viewed straight from the stored
 * rows (version-matching keys only) of the record bound to the caller's
 * lifecycle. The header is the only identity witness a listing holds, so
 * this face matches the lifecycle identity (`formatVersion`, `createdAt`,
 * `cwd`, `isSeeded`) and not the inherited cut: within one format
 * generation the cut is fixed at fork time, so it distinguishes no
 * lifecycle the other fields do not, and a viewed value never seeds a fold.
 * The view is as stale as the last durable checkpoint but never wrong and
 * never from an unrelated log. Its `asOfSeq` is the lowest watermark among
 * the served rows: the stored record's own position, which the header
 * cannot relate to the log the caller later opens. The Session list
 * therefore labels the block as cached, and the client lets every value the
 * connected Session produces supersede it whatever this number says.
 * @param meta - the listed session's header (identity witness; no log read).
 * @param keys - optional projection keys required by the caller's audience.
 * @returns the viewed block, or `undefined` when no usable row exists for
 *   this lifecycle at the current Session format.
 */
cachedSnapshot( meta: SessionHeader, keys?: ProjectionKeySelection, ): ProjectionSnapshot | undefined

/**
 * Read only a predecessor checkpoint's title as a zero-I/O listing hint.
 *
 * The authoritative Session header supplies the lifecycle identity. A cache
 * checkpoint can lag that log but cannot lead it because writes flush the
 * log first, so a matching predecessor title is a genuine (possibly stale)
 * fact from this Session. The registry still requires the current title
 * projection's row version and schema. No other predecessor projection is
 * exposed: format normalization can change their current meaning, and the
 * {@link cachedSnapshot} / hydration paths continue to reject them.
 * @param meta - authoritative listed Session header.
 * @returns a title-only block at the stored title row's watermark, or
 *   `undefined` when the record is current, newer, unrelated, missing, or
 *   incompatible with the title unit.
 */
cachedPredecessorTitle(meta: SessionHeader): ProjectionSnapshot | undefined

/**
 * Hydrate projection cells for an already-prepared Session without another
 * persistence read. The cache seeds matching rows; the supplied exact log
 * advances every unit to the observation cut. No checkpoint is written
 * because the logical observation may contain recovery events not yet durable.
 * @param session - exact unpublished Session retained by persistence.
 * @param events - exact logical event prefix represented by the observation.
 * @returns all projection values at the event cut.
 */
hydratePrepared( session: Session, events: readonly SessionEvent[], ): ProjectionSnapshot

/**
 * Durably checkpoint one live session NOW (all mandatory points call
 * this; tests and carriers may too). The registry cut is snapshotted at
 * this boundary (states are live references), then the session's record is
 * replaced on the domain's write chain. NOT fail-soft — callers on the
 * fail-soft paths contain it.
 * @param session - the live session to checkpoint.
 * @returns resolution after durability and event emission.
 */
async write(session: Session): Promise<void>

/**
 * Cold-read one session's projections from its complete log. Each unit is
 * seeded from the identity-checked cached rows — the registry skips `apply`
 * for the already-folded prefix (events at or below the row's `seq`) — and
 * the refreshed checkpoint is written back (fail-soft, fire-and-forget), so
 * the first cold read creates the cache row and later ones seed from it.
 * The caller supplies the complete log in seq order: this service never
 * consults the persistence layer.
 * @param meta - the stored session header (identity witness).
 * @param inheritedEventCount - exact inherited prefix length for projection initialization and identity.
 * @param events - the session's complete log, in seq order.
 * @returns the projection cut at the log end.
 */
coldSnapshot( meta: SessionHeader, inheritedEventCount: SessionLogOffset, events: readonly SessionEvent[], ): ProjectionSnapshot
```

Types: [Session](session.ko.md) · [SessionEvent](session.ko.md) · [SessionHeader](persistence.ko.md) · [SessionLogOffset](session.ko.md)

Source: [`packages/session/session-projection-cache/src/index.ts`](../../packages/session/session-projection-cache/src/index.ts)

<a id="ctxsessionprojections--sessionprojectionregistry"></a>

### `ctx.sessionProjections` — `SessionProjectionRegistry`

`ctx.sessionProjections`: the projection unit table and its drive. The service subscribes to `session/event` once; every committed event passes every registered unit's `apply` (eager drive). A changed state reference computes the next client view; the change feed is notified only when its raw result changes by `Object.is`. Cells build lazily — a unit registered after events flowed, or a session older than the registry, folds `init` over the in-memory log on first touch (event or read). Consumers declare `sessionProjections` as a required injection, await registration during activation, and retain its ready handle. Registrants sharing a key share one unit and are counted. The last release removes the unit from live drives, checkpoints, and client snapshots; retained handles still fold new events on demand using the original unit.

```ts cordis-catalog
/**
 * Register one domain's unit on the calling context's fiber. Fiber or handle
 * disposal releases one reference; the final release removes live participation.
 * Retained handles remain readable after release.
 * Callers must await registration before publishing consumers; registration may perform asynchronous work.
 * @param definition - key, state schema, pure unit functions, and stateVersion.
 * @returns an awaitable yielding a ready handle; the callable runtime value is deprecated.
 */
register<K extends keyof SessionProjectionMap, S>( definition: Omit<ProjectionDefinition<K, S>, 'wire'> & { wire: NonNullable<ProjectionDefinition<K, S>['wire']> }, ): Promise<ProjectionHandle<S>>

/**
 * Register one host-only unit. Its state is omitted from client snapshots
 * and always checkpointed like every other unit.
 * Callers must await registration before publishing consumers; registration may perform asynchronous work.
 * @param definition - key, state schema, pure unit functions, and stateVersion.
 * @returns an awaitable yielding a ready handle; the callable runtime value is deprecated.
 */
register<K extends string, S>( definition: ProjectionDefinition<K, S> & { key: Exclude<K, keyof SessionProjectionMap> }, ): Promise<ProjectionHandle<S>>

/**
 * Subscribe to the change feed. The registration is an effect on the
 * calling context's fiber.
 * @param listener - called once per client-visible unit whose raw view changed by `Object.is`, per committed event.
 * @returns the exact disposer that unsubscribes.
 */
onChanged(listener: ProjectionChangeListener): () => void

/**
 * One consistent cut over every registered client-visible unit for one session, read from
 * the watermark cache (missing cells fold lazily over the in-memory log).
 * Fully synchronous — every value and `asOfSeq` reflect the same log
 * position. Each value passes its unit's `viewSchema` before leaving.
 * @param session - the session whose projection values are read.
 * @param keys - optional client-visible outputs; state materialization remains complete.
 * @returns the snapshot; `values` is empty when no selected client-visible unit is registered.
 */
snapshot( session: Session, keys?: ProjectionKeySelection, ): ProjectionSnapshot

/**
 * Read only already-materialized client-visible cells without folding history.
 * Values may trail the live Session and are therefore hints, not a complete
 * baseline. Missing cells are omitted.
 * @param session - attached Session whose cached cells are inspected.
 * @param keys - optional wire keys to view.
 * @returns the lowest common cached cut, or `undefined` when no wire cell exists.
 */
cachedSnapshot( session: Session, keys?: ProjectionKeySelection, ): ProjectionSnapshot | undefined

/**
 * The keys a Session summary carries: every registered client-visible key
 * whose unit does not declare `summary: false`. The returned set is stable —
 * the same instance on every call — until a registration or its disposal
 * changes the key table, so a consumer may hold it across rows. Callers pass
 * it to a key-taking read face such as `cachedSnapshot(session, summaryKeys())`
 * or `viewCheckpoint(rows, summaryKeys())`; those faces use the set as-is.
 * @returns the current summary key set; do not mutate it.
 */
summaryKeys(): ReadonlySet<Extract<keyof SessionProjectionMap, string>>

/**
 * State-level checkpoint of every persisted unit for one session, read
 * from the watermark cache (missing cells fold lazily over the in-memory
 * log). This is the write side of the persisted projection cache: the
 * returned rows are the `(key → {ver, seq, val})` part of the durable
 * `(sessionId, key, ver, seq, val)`
 * rows. Every `val` is a DETACHED structured clone — never the live
 * cell reference: the watermark cache is this registry's authoritative
 * mutable state, and a caller reaching the live reference could corrupt
 * every subsequent snapshot and frame through it (plain JSON by the unit
 * contract, so the clone is total).
 * @param session - the session whose unit states are checkpointed.
 * @returns one row per registered key.
 */
checkpoint(session: Session): ProjectionCheckpoint

/**
 * The stored seq a {@link restore} tail read over `checkpoint` must start
 * at: one event BELOW the lowest usable watermark (a row is usable when
 * its `ver` matches the live unit's `stateVersion`; an absent or mismatched row
 * pulls the floor to `0` — that key must refold the full log). The
 * one-below anchor is load-bearing: the tail then proves how far the
 * stored log still extends, so {@link restore} can detect a log that
 * shrank below a row's watermark (crash-repair truncation) instead of
 * serving the stale row as current — an empty tail read from the anchor
 * yields an end below every watermark and the restore rejects for a full
 * re-read.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @returns the offset for the stored-log suffix read (`SessionHandle.read`),
 *   or `undefined` when no unit is registered (no read needed —
 *   {@link restore} would serve empty values regardless).
 */
restoreFloor(checkpoint: ProjectionCheckpoint): SessionLogOffset | undefined

/**
 * View a checkpoint's rows without any log read: for every registered
 * client-visible unit whose row's `ver` matches, serve the schema-validated
 * `view` of the schema-validated stored state; mismatched, malformed, or absent rows leave their key
 * absent (a cold or listing consumer treats it as not-yet-available and a
 * fuller read path refolds it). The zero-I/O rung of the read ladder —
 * values are as stale as their rows, never wrong.
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @param keys - optional wire keys to view.
 * @returns whole values per key with a usable row; empty when none.
 */
viewCheckpoint( checkpoint: ProjectionCheckpoint, keys?: ProjectionKeySelection, ): Partial<SessionProjectionMap>

/**
 * Cold read: fold every persisted unit over a stored log suffix, seeding
 * each from its checkpoint row when usable — the one read recipe (cached
 * state + forward tail replay + `view`) applied without a live `Session`.
 * Call with the stored events at or past `restoreFloor(checkpoint)` (a
 * `SessionHandle.read` slice) and that same floor as
 * `baseSeq`; the floor's one-below anchor makes the supplied end honest,
 * so a shrunk log is detected here. A row is usable iff its
 * `ver` matches the live unit's `stateVersion`, it does not predate `baseSeq`
 * (`seq >= baseSeq - 1`), and it does not claim events past the
 * supplied end (`seq <= endSeq`); an unusable row is discarded
 * and its key refolds from `init` — which is only sound over the full
 * log, so a discarded row with `baseSeq > 0` throws (the caller re-reads
 * from seq 0, e.g. after a crash-repair truncation shrank the log below
 * a row's watermark).
 * @param checkpoint - persisted rows for one session (possibly stale or empty).
 * @param events - the stored events with `seq >= baseSeq`, in seq order.
 * @param baseSeq - the seq `events` starts at (its first event's seq when non-empty).
 * @param header - immutable metadata for the Session being restored.
 * @param inheritedEventCount - exact fork-inherited prefix length supplied to unit initialization.
 * @returns the snapshot cut at the supplied log end (`asOfSeq` is the last
 *   supplied event's seq, `baseSeq - 1` for an empty tail) plus the
 *   refreshed checkpoint rows at that cut, ready for a durable write-back.
 */
restore( checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset, header: SessionHeader, inheritedEventCount: SessionLogOffset, ): { snapshot: ProjectionSnapshot; checkpoint: ProjectionCheckpoint }

/**
 * Restore an exact cut and install its states on the supplied prepared Session.
 * A later publication reuses these cells; ordinary live reads and event drive
 * advance any constructor-owned suffix exactly once.
 * @param session - exact prepared Session that owns the restored log prefix.
 * @param checkpoint - persisted rows for this Session lifecycle.
 * @param events - exact events at the observation cut.
 * @param baseSeq - first supplied event sequence.
 * @returns all projection values at the supplied cut.
 */
hydrate( session: Session, checkpoint: ProjectionCheckpoint, events: readonly SessionEvent[], baseSeq: SessionLogOffset, ): ProjectionSnapshot
```

Types: [Session](session.ko.md) · [SessionEvent](session.ko.md) · [SessionHeader](persistence.ko.md) · [SessionLogOffset](session.ko.md)

Source: [`packages/session/session-projection/src/index.ts`](../../packages/session/session-projection/src/index.ts)
<!-- END GENERATED cordis-surface -->
