# 백그라운드 작업 런타임

[English](jobs.md) | [中文](jobs.zh.md) | 한국어

오래 실행되는 생산자, `ctx.jobs`, 작업 제어가 공유하는 타입입니다. 현재 설계는 [seam 통합 Agent Note](../../.agents/notes/implemented/architecture/2026-09-03-jobs-seam-consolidation.md)가 소유하고 그 기원은 [런타임 참조](../../packages/jobs/jobs/README.md)에 있으며, 이 페이지는 [`packages/jobs/jobs/src/types.ts`](../../packages/jobs/jobs/src/types.ts)와 클라이언트 안전 리프 [`view.ts`](../../packages/jobs/jobs/src/view.ts)의 정확한 필드와 변형을 기록합니다.

## id와 상태

`JobId`는 [브랜드 id](core.ko.md#브랜드-id)이며 `<kind>-<short-uuid>` 형태로 생성되고, 종류 뒤에 소문자 UUID 16진수 16자가 붙습니다. 접근 제어는 id의 비밀성에 기대지 않고 소유자 권한에 의존합니다. `JobKind`는 병합 확장 가능한 맵에서 파생되며, 레지스트리는 종류를 불투명한 id 네임스페이스로 취급합니다.

```ts type-equiv
/**
 * Producer-defined job kinds. Plugins extend this map by declaration merging;
 * the registry treats every value as an opaque id namespace.
 */
interface JobKindMap {
  bash: 'bash'
}
```

`JobStatus`는 `'running' | 'stopping' | 'completed' | 'killed' | 'failed'`이며, 생산자별 사실은 작업이 실행 중일 때는 `JobView.progress`에, 작업이 종료(settle)된 뒤에는 `JobView.detail`에 속합니다.

<a id="session-lifecycle-records"></a>

## 세션 수명 주기 기록

소유된 작업은 원래 소유자 세션에 `job/registered`와 `job/settled`를 게시합니다. 전역적으로 유일한 `jobId`가 그 기록들을 짝짓고 라이브 작업을 제어합니다. SDK는 출력 읽기와 무관하게 이 로그 전용 기록을 `session.event`로 전달합니다. 타임스탬프는 레지스트리 커밋을 나타낼 뿐 CPU 시간이나 정확한 OS 프로세스 경계가 아니며, 종료 확정(`job/settled`) 이벤트가 없으면 불완전한 상태로 남습니다. `producerReported`는 생산자가 종료 결과와 함께 `done`을 이행했다는 뜻이고, 강제 정리나 거부의 경우에는 false이며 리소스 해제를 독립적으로 보증하지 않습니다.

`job/settled`는 `turn/end` 뒤에 올 수 있습니다. SDK 실행 결과는 자신의 관찰 구간만 포괄하므로, 이후 작업 종료/확정(settlement)을 확인해야 하는 소비자는 세션 구독을 유지하거나 영속된 기록을 읽어야 합니다. 턴 완료가 소유된 모든 작업이 중지되었다는 뜻은 아닙니다.

애플리케이션 정리는 소유된 작업의 최종 완료(settlement)가 저장소에 도달하기 전에 세션 이벤트 라우팅을 멈추거나 그 기록기를 닫을 수 있습니다. 여기에는 정상적인 일회성 완료와 시그널 종료, 그리고 강제 프로세스 소실이 포함됩니다. 라이브 레지스트리가 종료를 보고했더라도 `job/settled`가 없으면 불완전한 상태로 남으며, 소비자는 완료 타임스탬프를 지어내서는 안 됩니다.

```ts type-equiv
/** Durable identity and registration time of one owned job execution. */
interface JobRegisteredData {
  /** Unique execution id accepted by job controls and retained in Session history. */
  readonly jobId: JobId
  /** Original owner; copied history does not transfer execution ownership. */
  readonly owner: SessionId
  /** Producer kind. */
  readonly kind: string
  /** Producer-supplied label. */
  readonly label: string
  /** Unix epoch milliseconds when registration committed. */
  readonly startedAt: number
  /** Creating tool invocation, when the producer was called through a tool. */
  readonly toolCall?: JobToolCall
}
```

```ts type-equiv
/** Registry settlement, including whether the producer reported a terminal outcome. */
interface JobSettledData extends JobRegisteredData {
  /** Unix epoch milliseconds when the registry committed the terminal record. */
  readonly finishedAt: number
  /** Recorded terminal outcome. */
  readonly status: JobOutcome['status']
  /** Source of the termination request, or producer completion. */
  readonly cause: JobSettleCause
  /** True when done fulfilled; false for rejection or forced failure. Does not certify resource release. */
  readonly producerReported: boolean
  /** Terminal reason, including a recorded kill reason when applicable. */
  readonly detail?: string
}
```

## 생산자 계약

`JobSpec`은 정체성, 소유 세션, 선택적 풀(pull) `output` 소스, 시작 함수를 선언합니다. 런타임은 사전 검사를 마친 뒤 작업의 `JobHandle`과 함께 `run()`을 호출하고, 이후 실패할 수 있는 단계 없이 커밋합니다. 생산자는 실행 리소스를 소유하고, 런타임은 정체성, 접근, 수명 주기 상태, 출력 링을 소유합니다.

```ts type-equiv
/** Tool dispatch that created a job; nested calls retain their root invocation. */
interface JobToolCall {
  /** Exact invocation, including a PTC sub-call when applicable. */
  readonly callId: SessionEventMap['tool/call']['callId']
  /** Root model-requested invocation owning this execution. */
  readonly rootCallId: SessionEventMap['tool/call']['callId']
}
```

```ts type-equiv
/**
 * Producer declaration passed to {@link JobRegistry.start}. The runtime
 * preflights access and cleanup before invoking {@link run}; the producer owns
 * execution resources while the runtime owns identity, lifecycle state, and
 * the output ring.
 */
interface JobSpec {
  /** Producer kind — also the id prefix (`bash`, …). */
  kind: JobKind
  /** One-line model-facing label (the command; the delegation description). */
  label: string
  /**
   * Owning session. Access is fenced by it, and the owner's live Agent must be
   * the one currently registered under that id: its disposal cancels and
   * awaits the job. Omitting the owner creates an unowned job, open to any
   * caller until service disposal.
   */
  owner?: SessionId
  /** Creating tool invocation, retained in the durable lifecycle records. */
  toolCall?: JobToolCall
  /**
   * Optional UTF-8 byte cap for each complete model-facing completion notice or
   * output read, including controller status metadata. Independent of ring
   * retention: it bounds the consuming model surface, never observers.
   */
  outputLimitBytes?: number
  /**
   * Pull sources the registry pumps into the ring at its own cadence.
   * Producers that narrate their own progress use {@link JobHandle.append}
   * instead; a job may use both.
   */
  output?: readonly JobOutputSource[]
  /**
   * Start the work after preflight and synchronously return its hooks. Called
   * once with the job's producer face; a throw leaves nothing registered (the
   * spent ordinal is skipped), and the producer must clean up any partially
   * started resources.
   * @param job - the issued id plus the ring append and progress writers.
   */
  run(job: JobHandle): JobHooks
}
```

```ts type-equiv
/**
 * Producer face of one registered job, handed to {@link JobSpec.run} and
 * valid for the job's whole life. All methods are synchronous. Writes staged
 * inside the starter call are retained and become visible with the
 * registration commit; after settlement — the producer's own outcome, a kill,
 * or a registry-forced teardown end — writes log and drop instead of
 * throwing, so a producer's trailing flush cannot break its own teardown path.
 */
interface JobHandle {
  /** The registry-issued id (`<kind>-<short-uuid>`). */
  readonly id: JobId
  /**
   * Append one chunk to the output ring. Offsets advance by the chunk's UTF-8
   * byte length; an empty chunk is dropped without waking observers.
   * @param text - the chunk text, exactly as produced.
   * @param options - stream label and gap marker.
   */
  append(text: string, options?: JobAppendOptions): void
  /**
   * Replace the live progress line (`3/10`, the current phase). Settlement
   * clears it; the terminal reason travels in {@link JobOutcome.detail}.
   * @param line - the new progress line.
   */
  updateProgress(line: string): void
}
```

`JobHooks.done`은 작업이 끝났을 때가 아니라 생산자가 리소스를 해제한 뒤에 이행됩니다. 결과가 스트림이 아니라 값인 작업(예: 워크플로의 렌더링된 결과)은 이를 `JobOutcome.result`로 반환하며, 작업 완료(settle) 후 모델의 첫 읽기가 이를 한 번 전달합니다.

```ts type-equiv
/** Hooks through which the runtime controls and observes producer work. */
interface JobHooks {
  /**
   * Request termination. Must be synchronous, idempotent, and eventually settle
   * {@link done}; throws propagate. The optional reason is forwarded verbatim.
   */
  cancel(reason?: string): void
  /**
   * Resolves after the producer releases its resources, not merely when work
   * finishes. Must not reject; the runtime converts a rejection to `failed`.
   * If teardown cancellation throws, the runtime may force-fail only the
   * registry record without claiming that the work stopped.
   */
  done: Promise<JobOutcome>
}
```

```ts type-equiv
/** Terminal result supplied by a producer through {@link JobHooks.done}. */
interface JobOutcome {
  /** How the job ended: finished (`completed`), cancelled (`killed`), or broke (`failed`). */
  status: 'completed' | 'killed' | 'failed'
  /**
   * Terminal reason rendered into status lines (`exit code: 3`, `max-tokens`).
   * When the job settles `killed` after a {@link JobRegistry.kill} with a
   * reason, the registry appends that reason.
   */
  detail?: string
  /**
   * Return value for jobs whose result is a value rather than a stream (a
   * workflow's rendered result, a subagent's report). The output ring carries
   * the stream; this is handed out once by the model's next {@link JobRegistry.read}.
   */
  result?: string
}
```

풀 소스는 소비하지 않는 오프셋 판독기를 레지스트리에 넘깁니다. 하위 프로세스의 `readFrom` 계열이 그것입니다. 레지스트리는 모든 소스를 자체 주기(`dsh-jobs-local`의 `pumpPollMs`)로 펌프하고, 종료 확정(settlement)으로 링을 닫기 전에 한 번 더 비우므로 생산자는 `done`에 아무것도 접어 넣지 않습니다.

```ts type-equiv
/**
 * A pull source the registry pumps into the job's output ring — the subprocess
 * `readFrom` family. The registry owns the cadence and drains every source one
 * last time before settlement closes the ring, so a producer folds nothing
 * into its `done`.
 */
interface JobOutputSource {
  /** Stream label attached to every chunk this source yields. */
  channel?: JobChannel
  /**
   * Read everything captured since `fromByte` without consuming it.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 first).
   * @returns the delta text, the next offset, the lossy flag, and the spill path the source currently keeps.
   */
  read(fromByte: number): JobSourceRead
}
```

```ts type-equiv
/** One incremental read from a {@link JobOutputSource}. */
interface JobSourceRead {
  /** Text captured since the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the source's retained window. */
  lossy: boolean
  /**
   * Host path of a file holding the complete stream, when the source
   * currently keeps an intact one. Reported on every read, so the registry
   * tracks it as source metadata: a later read without it withdraws the file.
   */
  spillPath?: string
}
```

## 출력 링

모든 작업은 경계가 있는 링 하나를 소유합니다. 풀 소스는 링으로 펌프되고 `JobHandle.append` 푸시는 통째로 들어갑니다. 모델은 레지스트리가 유지하는 커서(`JobRegistry.read`)로 링을 소비하고, 얼마든지 많은 관찰자가 절대 바이트 오프셋(`JobRegistry.readAt`)으로 링을 읽으며, 둘은 서로를 방해하지 않습니다. `JobChannel`은 `stdout`, `stderr`, `log`를 표시하며, `log`는 관찰자에게만 도달하고 모델의 소비 읽기에는 결코 도달하지 않는 생산자 서술입니다. 작업 종료(settlement) 처리는 스트림을 끝내고 보관량을 종료 보존 상한으로 줄입니다. 링에는 별도의 수명 주기가 없습니다. 풀 소스가 유지하는 스필 파일은 청크별 메타데이터가 아니라 작업 메타데이터(`JobView.output.spillPaths`, 펌프 읽기마다 갱신)이므로, 링이 바이트를 축출한 뒤에도, 심지어 간극 청크 자체가 사라진 뒤에도 모델의 드롭된 출력 알림이 그 파일을 지목합니다. 브라우저는 [`dsh-api-job-controller`](../../packages/api/job-controller/README.md)의 Remote 스트림인 `job.list`와 `job.follow`를 통해 명단과 링에 도달하며, 그 프레임은 아래의 해당 Cordis API 절에 나열됩니다.

```ts type-equiv
/** One chunk of a job's output ring: absolute offset, text, channel, and loss marker. */
interface JobChunk {
  /** Absolute offset of the chunk's first byte; offsets never move once assigned. */
  readonly at: number
  /** Chunk text exactly as appended (possibly tail-trimmed by retention). */
  readonly text: string
  /** Stream label, when the producer supplied one. */
  readonly channel?: JobChannel
  /** Bytes immediately before this chunk were lost, at the producer or to retention. */
  readonly gapBefore?: true
}
```

```ts type-equiv
/** Result of one non-consuming {@link JobRegistry.readAt}. */
interface JobOutputRead {
  /** Retained chunks overlapping `[from, total)`, in offset order. */
  chunks: readonly JobChunk[]
  /**
   * Offset to resume from — the ring's current `total`. Always a chunk
   * boundary: appends land whole and trimming only advances chunk starts, and
   * consumers concatenate `chunks` under that assumption, so a provider
   * serving partial chunks would silently duplicate text.
   */
  next: number
  /** True when `from` fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
}
```

## 소비자 뷰

`JobView`는 모든 판독기가 소비하는 하나의 프로젝션입니다. 모델 도구, 브라우저 명단, 관찰 스트림이 모두 이를 씁니다. `owner`는 접근을 울타리로 막는 세션 id를 담고, 레지스트리는 수명 주기 정리를 위해 그 뒤의 라이브 `Agent`를 해석하되 그 객체를 밖으로 넘기지 않습니다. `progress`는 생산자의 라이브 진행 줄이며 작업 종료(settle) 시 지워지고, `detail`은 기록된 강제 종료(kill) 사유가 병합된 종료 사유입니다.

```ts type-equiv
/**
 * Read-only projection of one job — a fresh object per call, never live
 * registry state. The model tools, the browser roster, and the observation
 * stream all consume this one shape.
 */
interface JobView {
  /** The registry-issued id (`<kind>-<short-uuid>`). */
  readonly id: JobId
  /**
   * The producer kind the job was registered with: a Host-registered
   * `JobKind`, carried as an open string because a browser bundle or a Remote
   * codec sees only the `JobKindMap` merges its own program compiles.
   */
  readonly kind: string
  /** The producer-supplied one-line label. */
  readonly label: string
  /** Owning session; absent for an unowned job, which every caller can see. */
  readonly owner?: SessionId
  /** Producer-owned cap for complete model-facing notices and reads, in UTF-8 bytes. */
  readonly outputLimitBytes?: number
  /** Current lifecycle state. */
  readonly status: JobStatus
  /** The producer's live progress line (`3/10`, the current phase); cleared at settlement. */
  readonly progress?: string
  /** Terminal reason (`exit code: 3`); a recorded kill reason is merged in. */
  readonly detail?: string
  /** Epoch ms when the job was registered. */
  readonly startedAt: number
  /** Epoch ms when the job settled; absent while live. */
  readonly finishedAt?: number
  /**
   * The output ring's absolute coordinates and the complete-stream files
   * behind it. `total` is the offset the next chunk starts at (0 while
   * nothing was written); `earliest` is the oldest retained byte, greater
   * than zero exactly when retention dropped the head. `spillPaths` lists the
   * spill files the job's pull sources currently keep, in source order and
   * deduplicated, and is absent while no source keeps one: it outlives any
   * chunk, so a reader below `earliest` can still name where the bytes went.
   */
  readonly output: { readonly total: number; readonly earliest: number; readonly spillPaths?: readonly string[] }
}
```

`JobRegistry.list`, `get`, `read`, `readAt`, `kill`, `wait`는 각각 호출자의 `SessionId`를 받습니다. 이를 생략하면 소유자가 없는 작업만 허용되고, 세션은 자신의 작업에도 접근할 수 있습니다.

```ts type-equiv
/** Output and post-read state returned by the consuming {@link JobRegistry.read}. */
interface JobRead {
  /** Ring chunks appended since the model cursor, in offset order; every channel included. */
  chunks: readonly JobChunk[]
  /** True when the cursor fell below the oldest retained byte, so bytes are missing before `chunks`. */
  lossy: boolean
  /** The producer's {@link JobOutcome.result}, handed out by the first read after settlement only. */
  result?: string
  /** The job's state at read time. */
  job: JobView
}
```

## 이벤트

레지스트리는 모든 커밋을 하나의 필터링된 스트림으로 알립니다. 수명 주기 이벤트는 자신이 알리는 커밋 이후의 프로젝션을 담고, `settled`는 사유를 밝혀 완료 보고자가 정리를 건너뛸 수 있게 하며, `output`은 id와 새 total만 담으므로 관찰자는 자기 커서에서 읽고 레지스트리는 페이로드를 결코 밀어 넣지 않습니다.

```ts type-equiv
/**
 * One lifecycle or output event. Lifecycle events carry the job's projection
 * after the commit they announce; `output` carries only the id and the new
 * total, so an observer schedules a {@link JobRegistry.readAt} from its own
 * cursor and the registry never pushes payloads.
 */
type JobEvent =
  | {
    /** Registration commit, progress line change, stopping transition, or removal from the visible set. */
    readonly type: 'registered' | 'progress' | 'stopping' | 'removed'
    readonly job: JobView
  }
  | {
    readonly type: 'settled'
    readonly job: JobView
    readonly cause: JobSettleCause
    /**
     * Whether this settlement released a live {@link JobRegistry.wait}. That
     * waiter's caller receives the terminal projection as its own result, so
     * a completion reporter treats an awaited settlement as already delivered
     * and reports only the unawaited ones. A wait that timed out or was
     * aborted before the settlement does not count.
     */
    readonly awaited: boolean
  }
  | {
    readonly type: 'output'
    readonly id: JobId
    /** Owning session, absent for an unowned job. */
    readonly owner?: SessionId
    /** The ring's total after the append (or at settlement, which ends the stream). */
    readonly total: number
  }
```

```ts type-equiv
/**
 * Who a subscription hears about. `{ owner }` delivers that session's jobs
 * plus every unowned job (the set that session can see). `{ owners: 'scope' }`
 * delivers the owners composed under the subscribing context — one registry
 * serves every composition in the process, and a mount under one preset must
 * not hear another preset's agents. `{ owners: 'all' }` delivers everything.
 */
type JobEventFilter =
  | { readonly owner: SessionId }
  | { readonly owners: 'all' | 'scope' }
```

## 서비스 동작

추상 [`JobRegistry`](../../packages/jobs/jobs/src/index.ts) Service Definition은 원자적 `start`, 호출자 범위 `list`, `get`, 소비하는 `read`, 소비하지 않는 `readAt`, `kill`, 상한이 있는 `wait`, 필터링된 `events` 스트림, `attachController`를 규정하며, [`LocalJobRegistry`](../../packages/jobs/jobs-local/src/index.ts)는 프로세스 지역 Service Provider입니다. 권한 부여는 소유자 세션을 비교하고, 소유자 정리와 허용은 작업이 시작될 때 소유자 세션 아래 등록된 라이브 `Agent`를 사용합니다. 로컬 제공자의 양의 안전한 정수 `maxConcurrentJobsPerOwner` 구성은 기본값이 `10`이며 정확한 소유자별로 `running`과 `stopping` 기록을 세고, 소유자가 없는 작업에는 공유 버킷 하나를 씁니다. 생산자의 작업 종료(settlement)가 용량을 해제합니다. `retainBytes`(기본값 262144)와 `settledRetainBytes`(기본값 16384)는 각 링의 활성 실행 및 종료 후(settled) 보존 바이트를 제한하고, 풀 주기는 `pumpPollMs`(기본값 150)입니다. Service Definition 계약은 [`dsh-jobs`](../../packages/jobs/jobs/README.md), 레지스트리 수명 주기와 허용 정책은 [`dsh-jobs-local`](../../packages/jobs/jobs-local/README.md), 모델 대상 Consumer는 [`dsh-tool-jobs`](../../packages/jobs/tool-jobs/README.md)를 참고하세요.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxjobcontroller--jobcontroller"></a>

### `ctx.jobController` — `JobController`

Host service backing the generated `ctx.remote.job` namespace.

```ts cordis-catalog
/**
 * Stream the jobs one session can see — its own plus every unowned job —
 * as whole-set frames: one on open, then one after each coalesced burst of
 * lifecycle commits. The stream has no natural end; the carrier closes it.
 * @param request - the session whose visible set to mirror.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns the roster frames.
 */
@Remote({ mode: 'stream' }) list(request: JobListRequest, signal: AbortSignal): AsyncIterable<JobListFrame>

/**
 * Stream one job's retained output from an absolute byte offset, then its
 * terminal projection once settled and drained. Non-consuming: the
 * model-facing cursor and notice state never observe these reads. The
 * request's session is the fenced read's caller; the registry rejects a
 * job the session cannot see and an unknown job.
 * @param request - target job, owning session, and optional resume offset.
 * @param signal - cancellation owned by the Remote stream carrier.
 * @returns anchor, coalesced output frames, and the terminal status.
 */
@Remote({ mode: 'stream' }) follow(request: JobFollowRequest, signal: AbortSignal): AsyncIterable<JobFollowFrame>

/**
 * Kill one background job on a human's behalf. The request's session is
 * the fenced read's caller, so the job must be one that session can see:
 * the registry's owner fence is the only access rule, and a child session's
 * own jobs are killable from its list like any other. The kill records
 * `cancelled by the user` as its reason; it is not one the model requested,
 * so the owning agent still receives the completion notice, and a shell
 * tool waiting on that job reads the reason in its own result.
 * @param request - Session whose job list carries the job, and the job id.
 * @returns the registry's admission of the kill request.
 */
@Remote('kill') kill(request: JobKillRequest): JobKillValue
```

Source: [`packages/api/job-controller/src/index.ts`](../../packages/api/job-controller/src/index.ts)

<a id="ctxjobs--jobregistry-abstract-seam"></a>

### `ctx.jobs` — `JobRegistry` (abstract seam)

Abstract background job registry. Subclass, implement the abstract members, and load the subclass as a plugin — it registers as `ctx.jobs` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- Registrations outlive producer and controller fibers. Owner and service disposal cancel live work and await compliant producers; a throwing teardown cancel force-fails only the record. Such settlements announce `cause: 'teardown'`, because a job whose owner is being destroyed has no reader left.
- Owned-job access is fenced by the owner's session id. Ids are predictable, so authorization — not secrecy — is the boundary.
- Settlement is first-wins: one terminal record, released waiters, then one round of contained event delivery, even against a late producer outcome. The `settled` event follows every released waiter and reports whether it released one (`awaited`), so a completion reporter can skip settlements a waiting caller already collected.
- A settled record stays listed until its owner's disposal, service disposal, or an explicit remove by a caller that collected the terminal state itself and never handed the id out.
- start refuses work while no attached job controller serves the spec's owner, so a producer cannot start work that owner cannot collect or stop. One registry serves every composition in the process, so this question — and event delivery under `{ owners: 'scope' }` — is owner-relative rather than process-wide: registrations made from an unscoped context serve every owner, and registrations made under an agent composition's scope serve exactly the agents composed under it.
- Every job owns one output ring. Pull sources named by the spec are pumped by the registry and drained once more before settlement; pushed appends land whole. The model's consuming cursor and observers' absolute offsets read the same bytes and never disturb each other.
- Ring retention is bounded. Appends past the live cap drop the oldest retained bytes; a reader below the retained window gets a lossy read, never an error. Settlement trims retention to the settled cap and ends the stream; the ring has no separate lifecycle.

```ts cordis-catalog
/**
 * Preflight access, validation, owner cleanup, and implementation-owned
 * admission before starting and atomically registering work. Any preflight
 * rejection leaves no job id or execution resource. A throwing starter
 * leaves nothing registered; after it returns, registration cannot fail.
 * @param spec - job identity, owner, output sources, and synchronous starter.
 * @returns the registry-issued `<kind>-<short-uuid>` id.
 */
abstract start(spec: JobSpec): JobId

/**
 * List caller-owned and unowned jobs in registration order.
 * @param caller - reading session; omission sees only unowned jobs.
 * @returns fresh projections.
 */
abstract list(caller?: SessionId): JobView[]

/**
 * Project one job without changing its cursor. Throws for an unknown or
 * foreign job.
 * @param id - job to look up.
 * @param caller - reading session checked against the owner.
 * @returns a fresh projection.
 */
abstract get(id: JobId, caller?: SessionId): JobView

/**
 * Consume the ring from the model cursor and advance it to the current
 * total. After settlement the first read also carries the producer's
 * result. Throws for an unknown or foreign job.
 * @param id - job to read.
 * @param caller - reading session checked against the owner.
 * @returns the chunks since the cursor, the lossy flag, the result once, and the post-read projection.
 */
abstract read(id: JobId, caller?: SessionId): JobRead

/**
 * Read retained ring output without moving the model cursor. Resume with
 * a previous read's `next`; an offset inside a retained chunk returns the
 * whole chunk (its `at` may precede `from`). Throws for a negative or
 * non-integer offset, or an unknown or foreign job.
 * @param id - job to read.
 * @param from - absolute byte offset to read from (0 for the retained head).
 * @param caller - reading session checked against the owner.
 * @returns retained chunks overlapping `[from, total)`, the resume offset, and the lossy flag.
 */
abstract readAt(id: JobId, from: number, caller?: SessionId): JobOutputRead

/**
 * Request cancellation, then mark the job stopping. A producer throw
 * propagates without changing job state. A supplied reason is merged into
 * terminal `detail` when the job settles `killed`. Throws for an unknown
 * or foreign job.
 * @param id - job to cancel.
 * @param caller - killing session checked against the owner.
 * @param reason - cancellation reason forwarded verbatim to the producer.
 * @returns `requested` for live work, otherwise `already-finished`.
 */
abstract kill(id: JobId, caller?: SessionId, reason?: string): 'requested' | 'already-finished'

/**
 * Wait for settlement or timeout without cancelling the job. Caller abort
 * rejects only while the job is live; after settlement the terminal
 * projection wins. Rejects for an invalid timeout or an unknown or foreign
 * job.
 * @param id - job to wait for.
 * @param timeoutMs - positive finite wait bound in milliseconds.
 * @param caller - waiting session checked against the owner.
 * @param signal - optional cancellation of the wait itself.
 * @returns projection at settlement or timeout.
 */
abstract wait(id: JobId, timeoutMs: number, caller?: SessionId, signal?: AbortSignal): Promise<JobView>

/**
 * Drop one settled job's record from the visible set and announce
 * `removed`. For a caller that collected the terminal state through its own
 * {@link wait} and never handed the id to the model, such as a shell tool's
 * foreground call. Throws for a job that is still live, unknown, or foreign.
 * @param id - settled job to drop.
 * @param caller - removing session checked against the owner.
 */
abstract remove(id: JobId, caller?: SessionId): void

/**
 * Attach an effect-scoped controller that can read and stop jobs. It serves the
 * owners its registering context's scope covers, and {@link start} refuses an
 * owner no attached controller serves.
 * @param name - diagnostic label; duplicate names remain independent.
 * @returns disposer that detaches this controller.
 */
abstract attachController(name: string): () => void
```

Types: [SessionId](core.ko.md)

Source: [`packages/jobs/jobs/src/index.ts`](../../packages/jobs/jobs/src/index.ts)
<!-- END GENERATED cordis-surface -->
