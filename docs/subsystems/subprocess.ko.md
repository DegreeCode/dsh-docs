# 하위 프로세스

[English](subprocess.md) | [中文](subprocess.zh.md) | 한국어

하위 프로세스 seam은 Service Definition([dsh-subprocess](../../packages/subprocess/subprocess), `ctx.subprocess`)과 Service Provider([dsh-subprocess-local](../../packages/subprocess/subprocess-local))로 나뉩니다. 그 Consumer는 다른 capability seam과 프로세스 밖 백엔드입니다. [bash 실행기 계열](shell.ko.md)은 수집된 배치 출력을, LSP는 원시 프로토콜 파이프를, PTY 백엔드는 터미널 원시 연산을, ACP 서브에이전트 백엔드는 파이프된 ndjson과 상속된 stderr를 사용합니다. 이 seam은 관리형 `DSH_*` 환경 네임스페이스, 공유 자격 증명 정리(`scrubbedParentEnv`), `CollectedOutput` 형태를 소유하며, [dsh-shell](../../packages/shell/shell)이 그 어휘를 다시 내보내므로 bash 소비자는 임포트 루트를 하나만 유지합니다.

출처: [`packages/subprocess/subprocess/src/types.ts`](../../packages/subprocess/subprocess/src/types.ts)와 [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)

## 실행 파일 조회

한 제공자의 spawn 작업 디렉터리, 실행 파일 경로, 일반 프로세스, 터미널 세션은 마운트된 파일 시스템 제공자와 같은 경로·프로세스 네임스페이스에 있습니다. `resolveExecutable(command, env?, signal?)`은 절대 실행 파일 경로를 검증하거나, 제공자의 정리된 `PATH`와 의도적 재정의를 통해 맨 이름을 해석합니다.

## 관리형 환경 네임스페이스와 수집된 출력

`DSH_*` 변수는 하네스가 소유하는 하위 프로세스 사실입니다. 구현은 호출자의 명시적 `env`가 병합되기 전에 주변 `DSH_*` 이름을 버리므로, 현재 사실은 의도적인 문자열 항목으로만 도착하고, 명시적 `undefined` 묘비는 일반 주변 값을 제거합니다. 수집된 각 스트림은 잘림과 스필 복구 상태를 `CollectedOutput`으로 보고합니다.

```ts type-equiv
/** One environment key inside the managed {@link DSH_ENV_PREFIX} namespace. */
type DshEnvironmentKey = `${typeof DSH_ENV_PREFIX}${string}`
```

```ts type-equiv
/** Trusted DeepSeek Harness variables for one child-process execution. */
type DshEnvironment = Readonly<Record<DshEnvironmentKey, string>>
```

```ts type-equiv
/** One captured stream: the (possibly truncated) text plus recovery info. */
interface CollectedOutput {
  /** Collected text — the TAIL of the stream when truncated. */
  text: string
  /** True when bytes were dropped from `text`. */
  truncated: boolean
  /** Path to a file holding the COMPLETE stream, when truncated and available. */
  spillPath?: string
}
```

## Node 형태의 stdio 배치

각 스트림의 배치는 소비자별로 명시적으로 선택합니다. 프로토콜 프레이밍에는 원시 파이프(LSP JSON-RPC, ACP ndjson), 통과 진단에는 상속, 경계 있는 배치 출력에는 수집 모드를 쓰며, 스필 파일은 선택 사항이므로 진단 꼬리(언어 서버의 stderr)는 파일을 남기지 않고 버퍼링됩니다.

```ts type-equiv
/**
 * stdin disposition. `'ignore'` leaves fd 0 on `/dev/null`; `'pipe'` exposes
 * {@link SubprocessHandle.stdin} for the caller's ongoing protocol writes;
 * `{ data }` writes the bytes and closes (the batch shape).
 */
type SubprocessStdinMode = 'ignore' | 'pipe' | { readonly data: string }
```

```ts type-equiv
/**
 * Bounded in-memory collection for one output stream, with an optional
 * full-stream spill file. Omitting `spill` keeps only the in-memory tail —
 * the diagnostic-tail shape (a language server's stderr); including it makes
 * the complete stream recoverable up to its cap (the bash tool shape).
 */
interface SubprocessCollect {
  /** In-memory cap in bytes; overflow keeps the TAIL. */
  maxBytes: number
  /** Full-stream spill file; absent disables spilling entirely. */
  spill?: {
    /** Whole-stream byte cap; a larger stream discards its now-incomplete spill. */
    maxBytes: number
  }
}
```

```ts type-equiv
/**
 * stdout/stderr disposition. `'pipe'` exposes the raw `Readable` for the
 * caller's protocol decoding; `'inherit'` passes the parent's descriptor
 * through (child diagnostics land on the harness's own stream); a
 * {@link SubprocessCollect} object buffers boundedly with offset-based reads.
 */
type SubprocessOutputMode = 'pipe' | 'inherit' | SubprocessCollect
```

```ts type-equiv
/** Per-stream stdio dispositions, all explicit — this seam applies no defaults. */
interface SubprocessStdio {
  stdin: SubprocessStdinMode
  stdout: SubprocessOutputMode
  stderr: SubprocessOutputMode
  /** Request a separate byte-mode duplex channel; omission creates none. */
  control?: 'pipe'
}
```

## 완전히 명시적인 spawn 스펙

이 seam은 기본값을 적용하지 않습니다. 모든 배치, 한도, 디렉터리가 스펙에 명시되므로 숨은 하위 프로세스 서비스 기본값이 아니라 호출자 자신의 구성이 이를 결정합니다. `argv`는 결코 셸로 해석되지 않습니다.

```ts type-equiv
/**
 * A fully-specified spawn request. This seam applies no defaults: every
 * disposition, limit, and directory is explicit, so the caller's own config —
 * not a hidden subprocess-service default — decides them (the `dsh-shell`
 * request/spec split is the owning template).
 */
interface SubprocessSpawnSpec {
  /** Executable and arguments; `argv[0]` is the program. Never shell-interpreted here. */
  argv: readonly string[]
  /** Working directory for the child. */
  cwd: string
  /** Per-stream stdio dispositions. */
  stdio: SubprocessStdio
  /**
   * Positive finite grace period in milliseconds, no greater than
   * `MAX_TIMER_DELAY_MS`, available to the provider's termination procedure
   * and used for draining still-open collected pipes after the process exits
   * (an inherited descriptor held by a survivor cannot hold the outcome open
   * indefinitely). Providers document whether range termination is staged or
   * immediate.
   */
  graceMs: number
  /**
   * Abort signal — starts the terminate escalation on the managed range when
   * it fires. The caller owns deadlines and cause classification; this seam
   * only reacts to the abort.
   */
  signal?: AbortSignal | undefined
  /**
   * Explicit environment entries merged onto the implementation's scrubbed
   * parent base (see `scrubbedParentEnv`), with no namespace validation. A
   * string is a deliberate caller opt-in, so a forwarded credential-shaped
   * entry or current `DSH_*` fact survives the scrub; `undefined` is a
   * tombstone that removes an ordinary ambient entry from the child.
   */
  env?: NodeJS.ProcessEnv | undefined
}
```

## 핸들: 스트림, 판독기, 관리 범위 종료

spawn은 대상과 관리 범위의 정체성이 제공자 비공개로 남은 채 라이브 핸들을 동기적으로 반환합니다. 수집 모드 판독기는 전체 스트림 바이트 오프셋을 받고 결코 소비하지 않으므로 독립 판독기가 서로의 델타를 훔칠 수 없으며, 파이프된 스트림은 호출자 소유입니다. `terminate()`는 제공자가 문서화한 절차를 시작하고, `waitForExit()`은 같은 제공자 관리 범위를 관찰합니다. 단계적 제공자는 `graceMs`를 쓸 수 있고, 즉시 제공자는 지연하지 않습니다. 소비자는 이 두 연산 위에 자체 정리 사다리를 만들 수 있습니다(ACP 백엔드의 stdin-EOF 우선 `disposeAcpChild`가 템플릿입니다).

```ts type-equiv
/**
 * A live subprocess and its provider-managed process range. Collected output
 * remains readable after exit; piped streams belong to the caller.
 *
 * Termination and {@link SubprocessHandle.waitForExit} use the same managed
 * range. Each provider documents the range it can observe and its signalling
 * and observation limits.
 */
interface SubprocessHandle {
  /** The child's stdin, present iff spawned with `stdin: 'pipe'`. */
  readonly stdin: Writable | undefined
  /** The child's raw stdout, present iff spawned with `stdout: 'pipe'`. */
  readonly stdout: Readable | undefined
  /** The child's raw stderr, present iff spawned with `stderr: 'pipe'`. */
  readonly stderr: Readable | undefined
  /** Separate caller-owned byte channel when requested; native startup failure may leave it absent. */
  readonly control: Duplex | undefined
  /** Offset-based readers for collect-mode streams (also readable after exit). */
  readonly collected: SubprocessCollectedOutputs
  /** Resolves with spawned-command exit facts; rejects for spawn or provider failures. */
  readonly done: Promise<SubprocessOutcome>
  /**
   * Begin the provider's documented termination procedure on the managed range
   * — the seam's only termination verb. Idempotent, a no-op once that range is
   * gone, and also triggered by the spec's abort signal.
   */
  terminate(): void
  /**
   * Wait until the same managed range is empty — not just until the spawned
   * command reports its outcome, so surviving work remains observable.
   * @param signal - optional bound for the wait.
   * @returns `true` when the managed range is empty, `false` when the signal aborted first.
   * @throws when the selected provider can no longer observe its managed range.
   */
  waitForExit(signal?: AbortSignal): Promise<boolean>
}
```

```ts type-equiv
/**
 * Cursor-free incremental access to one collected output stream. Offsets are
 * whole-stream byte coordinates owned by the caller, so independent readers
 * cannot consume one another's output; `readFrom(0)` after settlement is the
 * batch result (`lossy` then means the in-memory tail lost its head — the
 * {@link CollectedOutput.truncated} fact).
 */
interface SubprocessOutputReader {
  /**
   * Read everything captured since `fromByte`. When that offset has slid out
   * of the in-memory tail window the read is `lossy` — it returns the whole
   * retained tail and the gap is only recoverable from the spill file.
   * @param fromByte - whole-stream offset to resume from (a prior read's `nextOffset`; 0 for the first read).
   * @returns the delta text, the next offset, the `lossy` flag, and the spill path when one exists.
   */
  readFrom(fromByte: number): SubprocessOutputRead
}
```

```ts type-equiv
/** One incremental {@link SubprocessOutputReader.readFrom} read. */
interface SubprocessOutputRead {
  /** Stream text from the requested offset (the whole retained tail when lossy). */
  text: string
  /** Whole-stream offset to resume from on the next read. */
  nextOffset: number
  /** True when the requested offset slid out of the in-memory tail window. */
  lossy: boolean
  /** Path to the full-stream spill file, when one was created and remains intact. */
  spillPath?: string
}
```

```ts type-equiv
/** Offset-based readers for the streams spawned in collect mode. */
interface SubprocessCollectedOutputs {
  /** Present iff stdout is a {@link SubprocessCollect}. */
  readonly stdout?: SubprocessOutputReader
  /** Present iff stderr is a {@link SubprocessCollect}. */
  readonly stderr?: SubprocessOutputReader
}
```


## 결과는 종료 사실만 담습니다

`done`은 Node의 close 이벤트 어휘를 보고하며 원인 분류는 하지 않습니다. 서비스는 중단 시 프로세스를 종료시키지만 그 이유를 결코 판단하지 않습니다(호출자가 자신이 소유한 기한 신호를 직접 판별합니다. 예: bash 실행기의 `timedOut`/`aborted` 구분). 수집된 출력은 프로세스 종료(settlement) 후에도 `handle.collected`로 계속 읽을 수 있으므로 배치와 스트리밍 호출자가 하나의 접근 경로를 공유합니다.

```ts type-equiv
/**
 * Exit facts of one closed process — Node's `close`-event vocabulary.
 * Deliberately carries NO timeout or cancellation classification (the caller
 * reads the signal it owns to classify causes) and NO output: collected
 * streams stay readable through {@link SubprocessHandle.collected} after
 * settlement, so batch and streaming callers share one access path.
 */
interface SubprocessOutcome {
  /** Exit code; null when the process died from a signal. */
  exitCode: number | null
  /** Terminating signal (e.g. 'SIGTERM'); null on normal exit. */
  signal: NodeJS.Signals | null
}
```

## 터미널 프로세스 원시 연산

`spawnTerminal(spec)`은 파이프를 쓰지 않는 프로세스 원시 연산입니다. 제공자는 제어 터미널을 할당하고 UTF-8 텍스트 전송, 포그라운드 프로세스 그룹 검사와 신호 전달, 그리고 제공자가 여전히 관찰할 수 있는 모든 세션 구성원에 대해 정지 상태에 도달하는 대기형 TERM→KILL 연산 하나를 소유합니다. 제공자는 기반 매체별 관찰 한도를 문서화합니다. PTY 백엔드는 프롬프트 감지, 준비 상태 추론, 스크롤백, 샌드박스 정책, 영속 세션 소유권을 계속 담당하며, 일반 `spawn()`은 제어 터미널 시맨틱을 재구성할 수 없습니다.

터미널 스펙은 argv, cwd, 환경 재정의, 터미널 타입, 크기, 정리 유예, 선택적 할당 취소와 셸 활동 관찰을 완전히 명시합니다. 그 핸들은 `pid`, 순서 있는 출력, `done`, `write`, `resize`, `inspectForeground`, `inspectActivity`, `signalForeground`, 대기형 `terminate`를 노출하며, [`SubprocessTerminalSpawnSpec`과 `SubprocessTerminalHandle`](../../packages/subprocess/subprocess/src/types.ts)이 이 필드와 연산을 정의합니다. `resize(cols, rows)`는 라이브 PTY 크기를 갱신하고 프로세스 종료 후에는 거부합니다.

`inspectActivity()`는 `SubprocessTerminalActivity`를 반환합니다. `state`는 `idle`, `busy`, `unknown` 중 하나이고, `revision`은 제공자가 관찰한 활동이나 입력에 따라 바뀝니다. 터미널 요청은 `shellActivity`로 지원되는 셸 수명 주기 관찰을 선택하며, 제공자별 지원과 보수적인 unknown 사례는 [subprocess-local](../../packages/subprocess/subprocess-local/README.md#running-terminal-sessions)에 문서화되어 있습니다.

`terminalEnvironment(signal?)`은 `SubprocessTerminalEnvironment`를 반환합니다. 실행 환경 플랫폼(`posix` 또는 `windows`)과 선택적 `defaultShell`입니다. 이 사실은 웹 서버나 브라우저가 아니라 제공자에서 옵니다. `resolveExecutable`은 셸 후보를 검증하고, `SubprocessExecutableNotFoundError`는 없는 실행 파일을 식별하며, 제공자와 전송 실패는 오류로 남습니다.

## 서비스 동작

추상 [`SubprocessRuntime`](../../packages/subprocess/subprocess/src/index.ts) Service Definition은 실행 세계 좌표, 실행 파일 조회, 일반 `spawn`, `spawnTerminal`을 규정합니다. [`LocalSubprocessRuntime`](../../packages/subprocess/subprocess-local/src/index.ts)은 플랫폼이 선택한 관리 범위, 배치별 배선, 자격 증명 정리, `node-pty`, 플랫폼 프로세스 검사, 종료 후 결합 정리로 이를 제공합니다. Service Definition 계약은 [`dsh-subprocess`](../../packages/subprocess/subprocess/README.md), 로컬 메커니즘은 [`dsh-subprocess-local`](../../packages/subprocess/subprocess-local/README.md)를 참고하세요.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsubprocess--subprocessruntime-abstract-seam"></a>

### `ctx.subprocess` — `SubprocessRuntime` (abstract seam)

Abstract subprocess service. Subclass, implement spawn, and load the subclass as a plugin — it registers as `ctx.subprocess` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- Executable paths belong to one execution world shared with the mounted filesystem provider.
- spawn returns a live handle synchronously. Target identity remains provider-private; `done` resolves with the spawned command's exit facts and may reject for spawn or provider failures.
- Collect-mode readers are offset-based and non-consuming, so independent readers never consume one another's output; lossy reads report truncation and the spill file holding the complete stream when one exists. Piped streams are handed to the caller raw and never buffered here.
- SubprocessHandle.terminate (and the spec's abort signal) starts the provider's documented procedure against its managed range. SubprocessHandle.waitForExit observes that same range so a consumer-owned teardown ladder can hold each tier on real quiescence; each provider documents its signalling and observability limits.
- Disposal of the service terminates all still-running managed processes and awaits their exit.
- spawnTerminal owns terminal allocation, text transport, foreground groups, signalling, and whole-session quiescence behind one awaited termination method; readiness and persistent-shell policy stay in the PTY consumer. Its output stream ends after queued terminal output when the top-level process exits.

```ts cordis-catalog
/**
 * Resolve one configured executable in this provider's execution world.
 * Absolute paths are verified; bare names use the provider's scrubbed PATH
 * plus explicit environment overrides. Relative paths containing separators
 * are rejected: the resolution base is undefined, so providers fail loud
 * instead of guessing.
 * @param command - absolute executable path or bare PATH name.
 * @param env - explicit environment entries used for lookup.
 * @param signal - aborts remote or local lookup.
 * @returns a canonical executable path.
 */
abstract resolveExecutable( command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal, ): Promise<string>

/**
 * Inspect shell-selection facts in the provider's execution environment.
 * @param signal - cancellation of remote environment inspection.
 * @returns platform and preferred shell; executable lookup and allocation remain separate operations.
 */
abstract terminalEnvironment(signal?: AbortSignal): Promise<SubprocessTerminalEnvironment>

/**
 * Start one managed child process from a fully-specified spec; this seam
 * applies no defaults.
 * @param spec - argv, directory, stdio dispositions, grace, cancellation, and environment.
 * @returns the live process handle (streams/readers, signalling, outcome promise).
 * @throws synchronously when pre-aborted or when argv, cwd, environment, or grace is invalid before handle creation.
 */
abstract spawn(spec: SubprocessSpawnSpec): SubprocessHandle

/**
 * Allocate a real terminal and start one owned process session. This is the
 * only non-pipe process primitive: implementations own terminal byte I/O,
 * foreground groups, signals, and whole-session quiescence.
 * @param spec - fully specified argv, cwd, environment, dimensions, grace, and allocation cancellation.
 * @returns the live terminal handle after allocation succeeds.
 */
abstract spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
```

Source: [`packages/subprocess/subprocess/src/index.ts`](../../packages/subprocess/subprocess/src/index.ts)
<!-- END GENERATED cordis-surface -->
