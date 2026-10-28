# SessionTelemetryBackend

[English](session-telemetry.md) | [中文](session-telemetry.zh.md) | 한국어

[캡처 서비스](../../packages/session/session-telemetry/README.md)는 정규 이벤트 캡처, 리댁션, 핸드오프 커서를 소유합니다. [피드백 백엔드](../../packages/session/session-telemetry-otel/README.md)는 Session 접두사를 승인하고 그 독립 큐, 요청별 스케줄링, 4,000,000바이트 상한을 소유합니다. 어떤 보고 데이터도 모델 요청에 도달하지 않습니다.

출처: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

## 논리 기록

```ts type-equiv
/**
 * Severity of a telemetry record, pre-mapped at capture so a receiver can
 * alert with zero configuration: `error` for events whose own outcome flag
 * says so (the tool message's `isError`, `turn/end` error reasons) and for
 * `agent-error` operational records. Captured events otherwise default to
 * `info`; `warn` remains available to `session-telemetry/record` policies and
 * backends.
 */
type SessionTelemetrySeverity = 'info' | 'warn' | 'error'
```

```ts type-equiv
/**
 * One logical record handed to a backend — the capture contract's whole outbound
 * vocabulary. Ledger records mirror session-log events one-to-one;
 * operational records (`channel: 'ops'`) carry the two signals with no log
 * home (`agent-error`, `shutdown`) and deliberately omit `event.seq`-style
 * identity so they can never be mistaken for ledger rows.
 */
interface SessionTelemetryRecord {
  /** Canonical envelope without data; body carries the separately redacted payload. Absent for operational records. */
  sourceEvent?: { sessionId: SessionId; envelope: Omit<SessionEvent, 'data'> }
  /** Ledger (session-log mirror) or ops (operational signal) channel; backends keep the two under separate instrumentation scopes. */
  channel: 'ledger' | 'ops'
  /** Unix epoch milliseconds — the source event's append time for ledger records, the emission time for ops records. */
  time: number
  /** Pre-mapped alerting severity; see {@link SessionTelemetrySeverity}. */
  severity: SessionTelemetrySeverity
  /**
   * Identity attributes, deliberately minimal: ledger records carry
   * `session.id`, `session.format_version`, `event.type`, `event.seq`, plus optional
   * `session.cwd` / `session.parent_id`; a seeded Session also carries
   * `session.seed_length` from its exact inherited event count;
   * ops records carry `telemetry.op`, `session.id`, and (for `agent-error`)
   * `agent.id`, `turn`, `step`, `error.name`. Anything recoverable from the
   * body is intentionally NOT duplicated here.
   */
  attributes: Record<string, string | number>
  /**
   * The complete payload: a deep copy of the session event's `data` for
   * ledger records (JSON-serializable by `Session.append`'s own
   * validation), or the op payload for ops records. Never mutated after
   * handoff.
   */
  body: unknown
}
```

모든 정규 [세션 이벤트](session.ko.md)가, 완전한 압축 스트림을 담은 각 `assistant/message`나 `assistant/attempt`와 seam이 들어 본 적 없는 플러그인 병합 타입까지 포함해, 하나의 순서 있는 원장 기록으로 온전히 통과합니다. 프로세스 로컬 `agent/assistant-stream` 프레임은 이 영속 피드에 들어가지 않습니다. 새 fork는 자식 소유 접미사에서 시작하며 상속 마커와 fork 종결자를 포함하고, 복원된 Session은 저장된 접두사 뒤에서 시작하며 복원된 fork도 포함합니다. 백엔드는 `includeHistory`를 선택해 완전한 접두사를 포함할 수 있고, 같은 객체를 다시 채택하면 그 핸드오프 커서 뒤에서 재개합니다. 전달은 최선 노력입니다. 커서는 전달됨이 아니라 핸드오프됨을 표시하며, 기록은 유실되거나(크래시, 리로드 창) 중복될(SDK 재시도, 새 객체 재생) 수 있으므로 수신자는 `(session.id, session.format_version, event.seq)`로 원장 기록을 중복 제거합니다. ops 기록은 의도적으로 그 정체성을 생략합니다. 그것들은 합산할 항목이 아니라 알림을 발생시킬 신호이며 중복을 견딥니다.

## 공유 고지

모든 백엔드는 `ctx.sessionTelemetry`의 필수 추상 `sharing` 멤버를 통해 배포가 선택한 모드를 노출합니다([Service Definition README](../../packages/session/session-telemetry/README.md#the-sharing-disclosure)). 이것은 세션별 허용 결정도, 전달 영수증도 아닙니다. `/feedback` 확인은 이를 조회하지 않습니다.

```ts type-equiv
/**
 * Deployment-selected session-sharing mode, not confirmation of SDK delivery.
 */
type SessionTelemetrySharingStatus = 'full' | 'feedback-only' | 'disabled'
```

## 캡처 정책

```ts type-equiv
/** Whether capture follows live events or reads the canonical log only when requested. */
type SessionTelemetryCapture = 'live' | 'on-demand'
```

```ts type-equiv
/** Backend-selected capture mode and history policy. */
interface SessionTelemetryCaptureOptions {
  /** Follow live events, or wait for explicit capture; defaults to live. */
  capture?: SessionTelemetryCapture
  /** Include inherited fork history and stored history from earlier lifecycles; defaults to false. */
  includeHistory?: boolean
}
```

`includeHistory`는 저장된 기록과 상속된 기록을 허용하지만 그 자체로 캡처를 승인하지는 않습니다. [OTel 백엔드](../../packages/session/session-telemetry-otel/README.md)는 요청 시 캡처를 사용하고 새 자체 명시적 피드백을 요구하며, 그 피드백을 통해 모든 제공자에 대해 완전한 접두사만 공개합니다.

## 백엔드 계약

```ts type-equiv
/**
 * The minimum backend contract the coordinator requires. {@link SessionTelemetryBackend} is
 * its service-registered form; tests compose the coordinator with a bare
 * implementation of this interface.
 */
interface SessionTelemetrySink {
  /**
   * Hand one record to the backend's pipeline. MUST be a non-blocking
   * enqueue — the coordinator calls this synchronously from the
   * `session/event` hot path or an explicit canonical-log capture, so anything
   * slower than a queue push would tax the agent loop or feedback handling.
   * Errors thrown here are contained by the coordinator and logged; they
   * never reach the loop.
   * @param record - the logical record to report; owned by the backend after the call.
   */
  emit(record: SessionTelemetryRecord): void
  /**
   * Optional hint that a turn ended. A backend may forward it to its SDK's
   * flush so records are exported after each turn. Called
   * fire-and-forget; implementations must not block and must not throw
   * meaningfully (the coordinator contains exceptions). Most backends should
   * leave this unimplemented and let their SDK's own batching cadence govern
   * export timing: a backend that does implement it owns the interaction
   * between its concurrent flushes and {@link shutdown}'s drain (the OTel
   * backend leaves it unimplemented for exactly that hazard — see the
   * revival Agent Note).
   */
  flush?(): void
  /**
   * Forward the fiber's disposal to the SDK: flush whatever is queued and
   * reach quiescence, per the SDK's own shutdown contract. Everything
   * emitted before this call must still be delivered — including records
   * enqueued while a {@link flush} hint is in flight, so a backend whose SDK
   * guards against concurrent flushes orders behind the outstanding one (the
   * coordinator emits its dispose-time `shutdown` markers immediately before
   * calling this). Awaited by the coordinator's dispose; a rejection is
   * logged as a warning and never fails application teardown.
   * The coordinator captures dispose-time shutdown markers immediately before
   * this call for live capture; on-demand capture creates no ops records.
   * @returns resolves when the backend's pipeline has quiesced.
   */
  shutdown(): Promise<void>
}
```

`SessionTelemetryBackend`(`ctx.sessionTelemetry`, [시그니처](#ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam))는 계약의 로드 가능한 형태입니다. 컨텍스트당 구현 하나이며 중복 로드는 throw하고, 백엔드는 생성자에서 seam의 `SessionTelemetryCoordinator`를 구성해 캡처 측을 설치합니다.

## 리댁션 워터폴: `session-telemetry/record`

모든 기록은 정규 이벤트 사본과 `emit()` 사이에서 `session-telemetry/record` [워터폴](../cordis-primer.ko.md#cordis-워터폴-시맨틱)을 통과합니다([이벤트 항목](#session-telemetryrecord--waterfall)). seam은 자체 규칙을 **전혀** 배포하지 않습니다. 리스너가 마운트되지 않으면 기록은 캡처된 그대로 백엔드에 도달하므로, 내보내는 데이터는 배포가 마운트한 규칙만큼만 깨끗합니다. 리스너는 `next()`의 반환 값을 변환하며 쌓이고, `next()` 없이 반환하면 아래의 모든 것을 대체하며, throw하는 리스너는 코디네이터의 격리 안에서 그 기록 하나를 fail-closed로 보류합니다. 리댁션은 내보내는 사본에만 적용되며, 정규 세션 로그는 절대 다시 쓰이지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessiontelemetry--sessiontelemetrybackend-abstract-seam"></a>

### `ctx.sessionTelemetry` — `SessionTelemetryBackend` (abstract seam)

Loadable form of the backend contract: one implementation per context — the cordis `Service` registration under the `telemetry` key throws on a duplicate, cordis' standard behavior. A backend composes a SessionTelemetryCoordinator in its constructor to install the capture side.

```ts cordis-catalog
/**
 * See {@link SessionTelemetrySink.emit} — that declaration is the contract's one home.
 * @param record - the logical record to report; owned by the backend after the call.
 */
abstract emit(record: SessionTelemetryRecord): void

/** See {@link SessionTelemetrySink.flush}. */
flush?(): void

/**
 * See {@link SessionTelemetrySink.shutdown}.
 * @returns resolves when the backend's pipeline has quiesced.
 */
abstract shutdown(): Promise<void>
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)

<a id="session-telemetry-events"></a>

### `session-telemetry/*` events

<a id="session-telemetryrecord--waterfall"></a>

#### `session-telemetry/record` — waterfall

Transform one outbound record before it reaches the backend. This waterfall is the Service Definition's redaction extension point. It ships NO rules of its own: the innermost `next()` passes the record through unchanged, and with no listener mounted records reach the backend as captured, so exported data is exactly as clean as the rules a deployment mounts. Listeners stack by transforming `next()`'s return value; returning without `next()` replaces everything beneath. Dispatched synchronously on the capture hot path inside the coordinator's containment: a throwing listener withholds that one record (fail-closed) and never reaches the agent loop. Live capture dispatches at append time; on-demand capture dispatches while reading the canonical log. Redaction applies to the exported copy only; the canonical session log is never rewritten.

```ts cordis-catalog
/**
 * Transform one outbound record before it reaches the backend. This
 * waterfall is the Service Definition's redaction extension point. It ships NO rules
 * of its own: the
 * innermost `next()` passes the record through unchanged, and with no
 * listener mounted records reach the backend as captured, so exported
 * data is exactly as clean as the rules a deployment mounts. Listeners
 * stack by transforming `next()`'s return value; returning without
 * `next()` replaces everything beneath. Dispatched synchronously on the
 * capture hot path inside the coordinator's containment: a throwing
 * listener withholds that one record (fail-closed) and never reaches the
 * agent loop. Live capture dispatches at append time; on-demand capture
 * dispatches while reading the canonical log. Redaction applies to the
 * exported copy only; the canonical session log is never rewritten.
 * @param record - the candidate record, already the coordinator's own deep
 *   copy; listeners return a (possibly new) record and must not mutate it.
 * @mode waterfall
 */
'session-telemetry/record'(record: SessionTelemetryRecord, next: () => SessionTelemetryRecord): SessionTelemetryRecord
```

Source: [`packages/session/session-telemetry/src/index.ts`](../../packages/session/session-telemetry/src/index.ts)
<!-- END GENERATED cordis-surface -->
