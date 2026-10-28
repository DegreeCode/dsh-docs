# 토큰 미터

[English](token-meter.md) | [中文](token-meter.zh.md) | 한국어

`@deepseek-ai/dsh-token-meter`는 요청 압력과 위치별 표면 가격 책정을 위한 분리된 재생 스냅샷 하나를 노출합니다. `logRevision`은 측정의 모든 필드에 대해 소비된 영속 이벤트 수입니다.

출처: [`packages/llm/token-meter/src/types.ts`](../../packages/llm/token-meter/src/types.ts)

## `TokenMeasurement`

```ts type-equiv
/** Detached immutable request-pressure and surface snapshot at one consumed log revision. */
interface TokenMeasurement {
  /** Number of durable events consumed; equal to the next unread event seq. */
  readonly logRevision: SessionLogOffset
  /** Provider or heuristic anchor used for this measurement. */
  readonly baseline: TokenMeasurementBaseline
  /** Signed repricing of current surface content relative to the baseline anchor. */
  readonly surfaceDeltaTokens: number
  /** Non-negative current request-and-response pressure. */
  readonly totalTokens: number
  /** Total route-priced request tokens across the current surface; equals the sum of the node prices. */
  readonly surfaceTokens: number
  /** Current surface nodes in positional head-to-tail order. */
  readonly nodes: readonly TokenSurfaceNode[]
}
```

모든 측정은 `ctx.llm`을 통해 유효 엔벨로프의 라우팅된 제공자·모델을 그 라우트가 선언한 요청 이미지 가격으로 해석하므로, 이미지 발생은 시각 토큰에 요청이 실제로 보내는 모델 가시 텍스트를 더한 값으로 가격이 매겨집니다. 선언된 가격이 없는 라우트와 조합은 고정 휴리스틱을 유지합니다. `baseline.kind === 'usage'`는 최신 성공 제공자 호출이 같은 정규 요청 엔벨로프를 가지고 그 총량이 그 호출의 전체 라우트 가격 앵커보다 낮지 않음을 뜻합니다. `estimated`는 재사용 가능한 보수적 사용량 앵커가 없어 서비스가 완전한 엔벨로프와 표면을 스스로 가격했다는 뜻입니다. 이후 성공한 요청이 이전 앵커를 대체하며, 부호 있는 `surfaceDeltaTokens`는 일치하는 앵커 대비 증가와 감소를 보존하고 양쪽을 같은 라우트 아래에서 다시 가격합니다. `totalTokens`는 요청·응답 압력으로 남고, `surfaceTokens`는 표면 전용 라우트 가격 총량이며 노드 가격의 합과 같습니다.

## `TokenSurfaceNode`

```ts type-equiv
/** One token-priced node in the current ordered session surface. */
interface TokenSurfaceNode {
  /** Durable sequence number of the surface event. */
  readonly seq: SessionSeq
  /**
   * Request-pressure tokens for the exact message projected by this node under
   * the measured route: image occurrences carry the route's declared visual
   * price when the routed adapter declares one, and the fixed heuristic
   * otherwise. Trigger, retention, and range selection all read this price.
   */
  readonly tokens: number
  /**
   * Fixed-heuristic tokens for the same message, independent of any route.
   * The shadow-price protocol prices replacements with this value so the O(1)
   * projection fold stays in agreement with its own appends.
   */
  readonly heuristicTokens: number
}
```

표면 순서가 권위 있습니다. 대체 노드는 이후 위치 노드보다 더 높은 영속 seq를 가질 수 있습니다. 스냅샷은 불변이며 기반 재생 폴드가 진행되어도 커지지 않습니다.

## `ContextPressureProjection`

`ctx.tokenMeter.contextPressure(session)`는 기록된 최신 `pressureTokens`와 `contextWindow`를 동기적으로 읽고, 클라이언트 프로젝션은 표면 변경에서 `projectedTokens`도 도출합니다. 이 표시 값들은 새 요청의 가격을 매기지 않으며, 요청 가격 책정에는 `measure()`를 사용하세요.

출처: [`packages/llm/token-meter/src/projection.ts`](../../packages/llm/token-meter/src/projection.ts)

```ts type-equiv
/**
 * Approximate context occupancy for a status display.
 *
 * The fields, when present, are deliberately NOT one atomic request
 * observation: each is a last-wins record of a different moment. Switching
 * models can therefore pair a fresh capacity with the previous route's
 * pressure until the next request reports usage. This is an intentional trade
 * — the value is a user-facing reference, not a billing or gating input. See
 * the token-meter README for the full rationale.
 */
interface ContextPressureProjection {
  /**
   * Provider-reported prompt size of the most recent request: uncached input
   * plus cache reads and writes. Response output is excluded, so this does not
   * grow as the current turn streams. Absent until a provider reports usage.
   */
  pressureTokens?: number
  /**
   * What the NEXT request's prompt would cost: {@link pressureTokens} plus the
   * heuristic repricing of everything the surface gained or lost since that
   * sample. Only the delta is estimated, so the figure stays anchored to the
   * provider while still reacting the moment a compaction shadows a span —
   * which `pressureTokens` alone cannot do, since compaction reports no usage
   * of its own. Absent until a provider reports usage.
   */
  projectedTokens?: number
  /** Newest recorded route capacity; absent when no adapter advertised one. */
  contextWindow?: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxtokenmeter--tokenmeter"></a>

### `ctx.tokenMeter` — `TokenMeter`

Replay owner for one service-wide estimator and isolated per-session folds.

```ts cordis-catalog
/**
 * Read the latest logged provider prompt size and route capacity.
 * @param session - Session whose committed usage and request capacity are read.
 * @returns context pressure; fields remain absent until their source events are recorded.
 */
contextPressure(session: Session): Pick<ContextPressureProjection, 'pressureTokens' | 'contextWindow'>

/**
 * Measure current request pressure and surface through the durable tail.
 *
 * The effective envelope's routed provider/model selects the request-image
 * pricing every node is priced under: a route whose adapter declares image
 * pricing charges each retained image its visual tokens plus its
 * model-visible text, while other routes keep the fixed heuristic. Provider
 * usage is reused only when the latest successful call's canonical request
 * envelope matches `requestHeader` and its total is no lower than that
 * call's full route-priced anchor; otherwise the complete envelope and
 * surface are repriced. The anchor includes all surface nodes immediately
 * before the assistant message, including inputs admitted after step/start.
 *
 * `requestHeader` replaces the latest logged envelope for pressure and node
 * pricing; the node set always describes the current session surface. Every
 * call clones those positional nodes, so measurement is O(surface).
 *
 * @param session - session to replay through its current durable tail.
 * @param requestHeader - optional effective request envelope replacing the latest logged header.
 * @returns a detached deeply immutable pressure and surface measurement.
 */
measure(session: Session, requestHeader?: EpochHeader): TokenMeasurement

/**
 * Heuristically price one model-visible message (instance face of the pure
 * `estimateMessage` export from `estimate.ts`).
 * @param message - message to price without mutation.
 * @returns content and role-framing tokens under the fixed service heuristic.
 */
estimateMessage(message: Message): number
```

Types: [EpochHeader](session.ko.md) · [Message](llm-streaming.ko.md) · [Session](session.ko.md)

Source: [`packages/llm/token-meter/src/index.ts`](../../packages/llm/token-meter/src/index.ts)
<!-- END GENERATED cordis-surface -->
