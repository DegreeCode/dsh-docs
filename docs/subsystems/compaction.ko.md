# 압축

[English](compaction.md) | [中文](compaction.zh.md) | 한국어

압축 seam은 bash와 같은 방식으로 분할된 [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)입니다. Service Definition([dsh-compaction](../../packages/compaction/compaction), `ctx.compaction`), Service Provider([dsh-compaction-basic](../../packages/compaction/compaction-basic) 같은 백엔드), 사람 Consumer([dsh-command-compact](../../packages/compaction/command-compact))로 나뉩니다. 압축은 **선택적 기능 하나**이며 agent-loop 중심 축의 일부가 아니므로, 그 어휘는 [core.ko.md](core.ko.md)가 아니라 이곳에 있습니다. 토크나이저나 템플릿 기반 백엔드는 같은 인터페이스를 구현하는 형제 패키지입니다. bash와 달리 이 인터페이스는 반드시 `dsh-session`과 `dsh-llm`에 의존합니다. 그 동사들이 에이전트 소유 `Session`에 작용하고, 영속 요약 이벤트가 `ContentBlock` 어휘를 사용하기 때문입니다([압축 capability-seam 참조](../../packages/compaction/compaction/README.md) 참고).

출처: [`packages/compaction/compaction/src/types.ts`](../../packages/compaction/compaction/src/types.ts)

## `compaction/*` 세션 이벤트

압축은 선언 병합으로 [`SessionEventMap`](session.ko.md)을 세 가지 이벤트 타입으로 확장합니다. 세 이벤트 모두 **로그 전용**이며, 표면에 합류하지 않고 잠금, 요약, 선택 범위, 가려진 이벤트 seq, 토큰 수, 모델 호출을 기록합니다. `SurfaceEventType`은 의도적으로 확장하지 않습니다(메시지를 생성하는 이벤트만 모델에 도달). 그래서 요약 자체는 `surfaceOp: { op: 'replace', startSeq, endSeq }`를 가진 별도 `user/message`로 전달되며, 이것이 요약 압축이 수행하는 유일한 표면 변이입니다. [과거 Agent Note](../../.agents/notes/archived/feature/2026-06-18-compaction-capability-seam.md)가 `user/message`를 재사용한 근거를 기록합니다.

| 이벤트 | 페이로드 | 역할 |
|---|---|---|
| `compaction/start` | `{ turn }` | 로그에 기록된 잠금을 획득합니다. 숫자는 열린 자동 턴을, `null`은 독립 실행형 수동 시도를 식별합니다 |
| `compaction/summary` | `{ summary, rawOutput?, llmStreamCall?, shadowedRange, shadowedSeqs, shadowedTokenCount, provider, model, maxTokens?, usage? }` | 안전한 요약 프로젝션, 선택적 완전 제공자 출력과 사용량, 결과 생성이 이 컨텍스트의 `ctx.llm.stream()`을 통한 정확히 한 번의 호출을 소비했을 때의 `llmStreamCall: true` 표시자(이때 완전한 `rawOutput` 필요), 가려진 표면 경계 쌍(`start`/`end` seq — 숫자 구간이 아닌 위치 범위), 표면 순서의 가려진 seq, 추정 토큰 수, 요약 호출의 봉투(`provider`, `model`, 적용된 경우 그 생성 상한)를 기록하며, 로그와 코드로 일회성 요청을 재구성할 수 있도록 남깁니다(재구성 가능성 Agent Note). 표시가 없는 `rawOutput`은 호출 경로를 식별하지 않습니다 |
| `compaction/end` | `{ turn, error? }` | 같은 숫자-또는-null 소유자로 잠금을 해제합니다(`error`는 실패한 시도를 기록) |

잠금은 작업 **전체**를 감쌉니다. `compaction/start`가 먼저 추가되고, 요약, `compaction/summary` 기록, `user/message` 교체가 모두 반영된 뒤에야 `compaction/end`가 옵니다. 잠금을 마지막에 해제하므로 작업 중 크래시는 압축이 끝났다고 거짓 주장하는 `compaction/end`가 아니라, 탐지 가능한 고아 잠금(짝이 되는 `compaction/end`가 없는 `compaction/start`)이 됩니다.

이 표시자들은 배타적 컨테이너가 아니라 잠금 시점입니다. 요약이 대기 중일 때 독립 실행형 수동 시작과 종료 사이에 무관한 유휴 주입이 나타날 수 있습니다. 수동 경로는 선택한 위치 범위만 다시 검증하므로, 주입된 컨텍스트는 교체 체크포인트 이후에도 살아남습니다. 살아 있는, 짝이 없는 start는 모든 진입점을 막고, 더 새로운 `session/end-seed`보다 앞선 짝 없는 start는 이전 수명 주기의 오래된 증거이므로 무시됩니다.

이 변형들은 `declare module '@deepseek-ai/dsh-session/types'` 블록 안에서 병합되므로, 다른 하위 시스템 페이지의 최상위 타입과 달리 드리프트 검사 대상 ` ```ts type-equiv ` 블록으로 붙여 넣지 않습니다(`verify-type-equiv` 추출기는 이름으로 최상위 선언만 매칭). 위의 페이로드 표가 카탈로그 항목이며, 권위 있는 필드는 소스 링크를 따르세요.

<a id="image-offload"></a>
## 이미지 오프로드

`compaction-image-offload`가 `image/offload` 선언과 그 순수 메시지 프로젝션을 소유합니다. 각 대상은 현재 입력 노드와 정확한 깊이 우선 이미지 발생을 식별합니다. 이 이벤트는 노드와 메시지 아이덴티티를 보존하고 `surfaceOp`를 담지 않습니다. [패키지 README](../../packages/compaction/compaction-image-offload/README.md)가 복구 정책, 등록, 분리 재생을 소유합니다.

```ts type-equiv
/** Exact input-image occurrences selected by one durable offload decision. */
interface ImageOffloadTarget {
  /** Current message-producing event containing these occurrences. */
  seq: SessionSeq
  /** Zero-based depth-first image indexes within the immutable message. */
  imageIndexes: number[]
}
```

## `CompactionResult`

성공한 압축이 호출자에게 반환하는 것: 부기 이벤트 seq, 안전한 요약 프로젝션, 가려진 범위와 seq, 추정 토큰 수입니다.

```ts type-equiv
/** Result of a successful compaction operation. */
interface CompactionResult {
  /** Stable identity shared by this compaction's complete durable lifecycle. */
  compactionId: CompactionId
  /** Human command that initiated this compaction, when it was manual. */
  sourceCommandId?: CommandId
  /** The seq of the appended `compaction/start` event. */
  startSeq: SessionSeq
  /** The seq of the appended `compaction/summary` event. */
  summarySeq: SessionSeq
  /** The seq of the appended `compaction/end` event. */
  endSeq: SessionSeq
  /** The summary content blocks produced by the backend. */
  summary: ContentBlock[]
  /**
   * The surface-boundary pair that was shadowed: the seqs of the first
   * (`start`) and last (`end`) surface nodes of the replaced range. A
   * surface-POSITION span, not a numeric seq interval — after a prior replace
   * lands a fresh high-seq summary node at an older range's position, `start`
   * can be GREATER than `end`. {@link CompactionResult.shadowedSeqs} is the
   * authoritative set of shadowed nodes, in surface order.
   */
  shadowedRange: { start: SessionSeq; end: SessionSeq }
  /** The seqs of all shadowed surface nodes, in surface order. */
  shadowedSeqs: SessionSeq[]
  /** Estimated token count of the shadowed content. */
  shadowedTokenCount: number
}
```

## 서비스

자동 호출자는 정책이 실행되는 이유를 명시하며, 구현은 확인된 오버플로를 일반 압력보다 더 공격적으로 다룰 수 있습니다.

```ts type-equiv
/** Why automatic policy is asking a backend to consider compaction. */
type CompactionTrigger = 'pressure' | 'context-overflow'
```

`CompactionEngine`은 자동 `pressure` 또는 `context-overflow` 정책을 위해 `compactIfNeeded(agent, trigger, signal)`을, 압력 이하에서도 유용한 유휴 세션 축소 한 번을 위해 `compactNow(agent, signal)`을, 명시적 포괄 표면 범위를 위해 `compactRegion(...)`을 노출합니다. `compactNow()`는 턴 사이의 에이전트 유지 관리로 실행되고, 유용한 범위가 없으면 쓰지 않고 `null`을 반환하며, 요약 전에 독립 실행형 `turn: null` 브래킷을 기록하고, 이후 대기 프롬프트가 새 표면에서 도출되기 전에 닫힌 시도를 플러시합니다. 모든 백엔드는 `compactCheckpointSource(compactionId, sourceCommandId?)`로 교체 `user/message` 소스를 만들며, 클라이언트와 와이어 소비자는 그 생성자, `CompactionCheckpointSource`, `isCompactCheckpointSource()`를 cordis 없는 `@deepseek-ai/dsh-compaction/checkpoint` 하위 경로에서 import하고, 패키지 루트는 호스트 소비자를 위해 이를 다시 내보냅니다. 필수 트랜잭션 아이덴티티가 교체 체크포인트를 상관시키고, 술어는 어떤 단일 백엔드와도 무관하게 인식을 유지합니다. 구현은 공급된 신호를 요약으로 전달해야 합니다. 이 seam은 가격 책정 API를 소유하지 않습니다. 싱글턴 [`ctx.tokenMeter`](token-meter.ko.md)가 추정과 재생을 직접 소유하고, `dsh-compaction-basic`이 보존, 이벤트 시퀀싱, 라우팅된 요약 호출과 그 구성을 소유합니다.

예상된 수동 실패는 `ManualCompactionErrorCode`를 사용합니다:

```ts type-equiv
/** Expected failure classes for an explicit idle-session compaction request. */
type ManualCompactionErrorCode =
  | 'busy'
  | 'cancelled'
  | 'changed'
  | 'summary'
  | 'commit'
  | 'persistence'
```

`changed`와 `summary`는 요약 교체 없이 실패한 시도를 닫고 영속하며, 복구 중 기록된 이미지 생략은 계속 유효합니다. `commit`은 부분 변이 뒤에 올 수 있고, `persistence`는 메모리 내 브래킷이 닫혔지만 플러시가 실패했음을 뜻합니다. 취소는 별개로 유지되며 필요한 정리 후 정확한 중단 사유를 던집니다.

압력 압축은 커밋된 요청 헤더에 대해 `agent/pre-step`에서, 그리고 헤더가 기록되기 전 변경된 목적지에 대해 `agent/request`에서 실행됩니다. 모델 전환 요약은 명시적 요약 대상이 구성되지 않은 한 이전 라우트를 유지하며, 실패한 전환은 그 헤더와 완료된 축소를 보존합니다. 압력이나 정규 오버플로가 조건을 충족하면 compaction-basic은 범위 선택 전에 선택적 [`ctx.toolResultPruner`](../../packages/compaction/compaction-tool-result-pruner/README.md)를 호출하고, `ctx.tokenMeter`로 다시 측정하며, 요약 없이 표면을 진행할 수 있습니다. 실패한 요청 복구는 실패한 단계가 닫힌 뒤 `agent/request-error`를 통해 실행되고, 이후 요약 작업이 정리 후 예외를 던지더라도 표면 교체 세대가 진행될 때만 재시도 동작을 반환합니다. 취소는 여전히 우선합니다. 범위 경계는 도구 호출/결과 짝짓기를 보존하지만 턴 전체는 보존하지 않으므로, 한 거대한 턴의 이른 닫힌 단계들이 압축될 수 있습니다. 임계값, 유지 꼬리 정책, 오버플로 상한, 실패 처리는 `dsh-compaction-basic`이 소유합니다.

Service Definition은 seq 앞뒤의 도구 호출/결과 짝짓기 검사를 위해 `toolPairingBalancedBefore(session, seq)`와 `toolPairingBalancedAfter(session, seq)`를 내보냅니다. 둘 다 현재 표면 멤버십을 검증하고 누락된 seq와 고아 결과를 거부하며, [패키지 계약](../../packages/compaction/compaction/README.md#tool-pairing-boundaries)이 그 캐시 동작을 정의합니다.

## 도구 결과 정리 결과

선택적 도구 결과 정리 서비스는 각 영속 콘텐츠 교체와 집계된 유니코드 코드 포인트 감소를 보고합니다. 그 공개 결과 타입은 [`compaction-tool-result-pruner/src/types.ts`](../../packages/compaction/compaction-tool-result-pruner/src/types.ts)에 있습니다.

```ts type-equiv
/** Cited source event and size accounting for one landed surface replacement. */
interface PrunedEntry {
  /** Full-fidelity tool-result event shadowed by the replacement. */
  readonly originalSeq: SessionSeq
  /** Newly appended pruned tool-result event. */
  readonly replacementSeq: SessionSeq
  /** Tool call shared by the original and replacement. */
  readonly callId: ToolCallId
  /** Original text size in Unicode code points. */
  readonly charsBefore: number
  /** Replacement text size in Unicode code points. */
  readonly charsAfter: number
}
```

```ts type-equiv
/** Aggregate outcome of one stable-surface pruning pass. */
interface PruneResult {
  /** Replacements in the snapshotted surface order. */
  readonly pruned: readonly PrunedEntry[]
  /** Total Unicode code points removed across replacements. */
  readonly charsRemoved: number
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcompaction--compactionengine-abstract-seam"></a>

### `ctx.compaction` — `CompactionEngine` (abstract seam)

Abstract compaction service. Implementations own trigger policy, retention, and summarization, and may consume a separate measurement service. A successful run replaces the selected surface span with one summary node and prevents concurrent compaction of the same session. The replacement user message uses compactCheckpointSource with the transaction identity so consumers recognize and correlate it independently of the backend. Load one implementation per context as `ctx.compaction`.

```ts cordis-catalog
/**
 * Consider automatic compaction for one explicit trigger. Pressure policy
 * uses the latest durable routed request, while context-overflow policy may
 * force a useful balanced reduction even below the normal threshold. Return
 * `null` when no safe range can be compacted. A single oversized retained
 * unit or request envelope cannot be repaired through surface compaction.
 *
 * @param agent - agent context owning the session surface and routing options.
 * @param trigger - normal pressure or provider-confirmed context overflow.
 * @param signal - cancellation signal; model-backed implementations must forward it.
 * @returns the compaction result, or `null` if no compaction was needed.
 */
abstract compactIfNeeded( agent: CompactionAgentContext, trigger: CompactionTrigger, signal: AbortSignal, ): Promise<CompactionResult | null>

/**
 * Explicitly compact useful history even below automatic pressure thresholds.
 * Implementations synchronously start an idle task before any asynchronous
 * work, select a useful range without writing on a no-op, then
 * append a standalone `compaction/start` before summarization. That durable
 * marker is the compaction lock until one `compaction/end` attempt. Later waking
 * prompts remain accepted in FIFO order and start only after the optional
 * durability checkpoint and idle-task settlement. Context injected while the
 * summary runs may sit between the marker pair; only the selected span must
 * remain stable.
 *
 * @param agent - idle agent whose durable history should be compacted.
 * @param signal - cancellation scoped to this compaction request.
 * @param sourceCommandId - initiating command identity for a manual compaction.
 * @returns the compaction result, or `null` when no safe useful range exists.
 * @throws {@link ManualCompactionError} for expected busy, agent-cancellation,
 * changed-span, summarization/shrink, commit-stage, or persistence failures;
 * an aborted request preserves its exact abort reason. Failed attempts remain
 * visible in the log.
 */
abstract compactNow( agent: ManualCompactAgentContext, signal: AbortSignal, sourceCommandId?: CommandId, ): Promise<CompactionResult | null>

/**
 * Forcibly compact a range of surface nodes into a single summary node.
 * `start` and `end` name an inclusive span by surface position, not numeric seq
 * order; replacements can make visible seqs non-monotonic. Both edges must be
 * balanced so assistant tool calls remain paired with their results. A model-
 * backed implementation forwards cancellation and rejects active, missing,
 * reversed, or unbalanced ranges. The target session is `agent.session`.
 * Its replacement user message must use {@link compactCheckpointSource} with
 * the transaction's `CompactionId`.
 * Use {@link toolPairingBalancedBefore} and {@link toolPairingBalancedAfter}
 * for the edge checks.
 *
 * @param start - first surface seq, inclusive.
 * @param end - last surface seq, inclusive.
 * @param agent - context whose session is mutated and whose routing options guide summarization.
 * @param signal - optional cancellation; model-backed implementations must forward it.
 * @throws when compaction is active or the range is missing, reversed, or unbalanced.
 * @returns the appended event seqs, summary, replaced range, and token accounting.
 */
abstract compactRegion( start: SessionSeq, end: SessionSeq, agent: CompactionAgentContext, signal?: AbortSignal, ): Promise<CompactionResult>
```

Types: [CommandId](commands.ko.md) · [SessionSeq](session.ko.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)

<a id="ctxtoolresultpruner--toolresultpruner"></a>

### `ctx.toolResultPruner` — `ToolResultPruner`

Deterministic head/middle/tail pruning for current tool-result surface nodes.

```ts cordis-catalog
/**
 * Measure text content in Unicode code points; non-text blocks cost zero.
 * @param blocks - tool-result content to measure.
 * @returns total Unicode code points across text blocks.
 */
measureContent(blocks: readonly ContentBlock[]): number

/**
 * Replace an over-budget text middle while retaining rich-block order.
 * Text slicing is by Unicode code point, not UTF-16 code unit, so a retained
 * boundary cannot split a surrogate pair. Grapheme clusters may still split.
 * @param blocks - original tool-result content.
 * @returns pruned content, or `null` when the text is within budget.
 */
pruneContent(blocks: readonly ContentBlock[]): ContentBlock[] | null

/**
 * Prune every over-budget tool result from one stable current-surface snapshot.
 * Each replacement preserves the complete event data except for `content`,
 * cites the shadowed node so replay can recover the replacement input, and is
 * immediately preceded by a `compaction/prune` shadow-price event pricing the
 * shadowed node through the injected token meter, so pure consumers can
 * subtract it without per-node state.
 * @param session - session whose current surface is rewritten.
 * @returns landed replacements and aggregate Unicode-code-point savings.
 * @throws when the session rejects a replacement; replacements committed
 * earlier in the pass remain durable.
 */
pruneSession(session: Session): PruneResult
```

Types: [ContentBlock](llm-streaming.ko.md) · [Session](session.ko.md)

Source: [`packages/compaction/compaction-tool-result-pruner/src/index.ts`](../../packages/compaction/compaction-tool-result-pruner/src/index.ts)

<a id="compaction-events"></a>

### `compaction/*` events

<a id="compactionsummary-error--waterfall"></a>

#### `compaction/summary-error` — waterfall

Recover a failed summary request by synchronously recording a durable change to its selected input. Return true only after making progress; the provider re-derives and re-prices the selection before retrying. Call next() when the failure cannot be recovered. Decisions survive a later summary failure or cancellation.

```ts cordis-catalog
/**
 * Recover a failed summary request by synchronously recording a durable
 * change to its selected input. Return true only after making progress;
 * the provider re-derives and re-prices the selection before retrying.
 * Call next() when the failure cannot be recovered. Decisions survive a
 * later summary failure or cancellation.
 * @param payload.session - session containing the selected input.
 * @param payload.sourceEventSeqs - selected message events in request order.
 * @param payload.error - failure thrown by the summarizer.
 * @param payload.signal - optional compaction cancellation signal.
 * @param next - delegate to the next recovery listener.
 * @mode waterfall
 */
'compaction/summary-error'(payload: { session: Session; sourceEventSeqs: readonly SessionSeq[]; error: unknown; signal?: AbortSignal }, next: () => boolean): boolean
```

Types: [Session](session.ko.md) · [SessionSeq](session.ko.md)

Source: [`packages/compaction/compaction/src/index.ts`](../../packages/compaction/compaction/src/index.ts)
<!-- END GENERATED cordis-surface -->
