# 셸 실행기

[English](shell.md) | [中文](shell.zh.md) | 한국어

셸 실행 seam은 [dsh-shell](../../packages/shell/shell)을 `ctx.shell`의 Service Definition으로 사용합니다. [셸 패키지 그룹](../../packages/shell/README.md)이 그 Bash 및 PowerShell 제공자와 모델 대상 Consumer를 나열합니다. 일반 백그라운드 작업 id, 소유권, 제어는 [jobs.ko.md](jobs.ko.md)에 있고, 이 seam은 작업 등록 없이 프로세스 핸들을 반환합니다. 관리 범위 역학은 [subprocess seam](subprocess.ko.md) 뒤에 있습니다.

출처: [`packages/shell/shell/src/types.ts`](../../packages/shell/shell/src/types.ts)

## 관리형 셸 환경 네임스페이스

`DSH_*` 변수는 Harness가 소유하는 자식 프로세스 사실입니다. 모델 대상 bash 도구는 `ctx.shellEnv`를 통해 이를 수집하고 `ShellExecRequest.dshEnv`로 전달하며, 서브프로세스 서비스는 현재 스냅샷을 병합하기 전에 상속된 `DSH_*` 이름을 제거합니다. `DshEnvironmentKey`/`DshEnvironment` 어휘는 [subprocess seam](subprocess.ko.md)이 소유하고 `dsh-shell`이 다시 내보냅니다.

## 요청과 명세: `resolve()` 분리

이 seam은 **모델/플러그인 대상 요청**(선택적 `workdir`/`timeoutMs`/`stdoutMaxBytes`, 구성이나 요청 정책에서 채워짐)과 실행기가 작용하는 **완전히 해석된 명세**(이 필드들이 필수)를 분리합니다. 도구 계층이 그 사이에서 `ctx.shell.resolve(request)`를 호출하며(저장소의 “패키지 경계에서 명시 > 암시” 규칙), `ShellExecSpec`이 해석된 값을 담습니다.

```ts type-equiv
/**
 * A caller's execution REQUEST: `workdir` and `timeoutMs` are optional and
 * filled by {@link ShellExecutor.resolve} from the implementation's config.
 * This is the model-/plugin-facing shape; pass it to `resolve()` to obtain a
 * fully-resolved {@link ShellExecSpec}.
 */
interface ShellExecRequest {
  command: string
  /** Working directory override (default: implementation-configured). */
  workdir?: string | undefined
  /** Timeout override in milliseconds (implementations cap it). */
  timeoutMs?: number | undefined
  /** Deadline policy at `timeoutMs` expiry (default `'kill'`). */
  onExpiry?: ShellExpiryPolicy | undefined
  /**
   * Foreground stdout capture budget in bytes. Absent uses the executor's
   * default output cap. Trusted in-process consumers use this when they must
   * parse complete stdout up to their own bounded limit; the model-facing bash
   * tool does not expose it as a parameter.
   */
  stdoutMaxBytes?: number | undefined
  /** Abort signal — implementations kill the command when it fires, and treat a signal that is already aborted as fired. */
  signal?: AbortSignal | undefined
  /**
   * Bytes to write to the command's stdin, then close it. Absent leaves stdin
   * closed/empty (the default for model-driven tool calls). Set by in-process
   * plugins (e.g. the hooks bridges, which write a hook command's JSON payload
   * to its stdin); the model-facing bash tool does not expose it as a parameter
   * (a model that needs stdin uses shell syntax like a heredoc or a pipe).
   */
  stdin?: string | undefined
  /**
   * Ordinary environment entries for the command, merged after the credential
   * scrub. Managed facts belong in {@link dshEnv}, which merges after this
   * map, so an entry here can never displace one. Set by in-process plugins
   * (the hooks bridges set `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, …); the
   * model-facing bash tool does not expose it as a parameter.
   */
  env?: Record<string, string> | undefined
  /**
   * Harness-owned `DSH_*` variables for this execution (typed to managed
   * keys). Executors discard ambient `DSH_*` entries before merging this
   * snapshot last, so an unavailable current fact cannot inherit a stale
   * value from the harness process and a caller {@link env} entry cannot
   * displace a managed one.
   */
  dshEnv?: DshEnvironment | undefined
  /** Fully resolved per-call sandbox policy; sandboxing executors default it. */
  sandboxPolicy?: SandboxExecutionPolicy | undefined
}
```

```ts type-equiv
/**
 * A resolved execution spec. {@link ShellExecutor.resolve} fills and caps the
 * required fields; under `onExpiry: 'none'` the resolved `timeoutMs` arms no
 * timer and is only echoed into {@link ShellRunResult.timeoutMs}.
 */
interface ShellExecSpec {
  command: string
  workdir: string
  timeoutMs: number
  /** Deadline policy at `timeoutMs` expiry ({@link ShellExecutor.resolve} defaults it to `'kill'`). */
  onExpiry: ShellExpiryPolicy
  /**
   * Resolved stdout capture budget in bytes, applied to every execution's
   * stdout; stderr keeps the executor's own output cap.
   */
  stdoutMaxBytes: number
  /** Abort signal — implementations kill the command when it fires, and treat a signal that is already aborted as fired. */
  signal?: AbortSignal | undefined
  /** Bytes to write to stdin before closing it; absent means no stdin. */
  stdin?: string | undefined
  /**
   * Ordinary environment entries carried through from
   * {@link ShellExecRequest.env}; {@link dshEnv} still merges after them.
   * OPTIONAL on the spec for the same reason as `stdin`: absent means no
   * ordinary extra environment.
   */
  env?: Record<string, string> | undefined
  /** Managed `DSH_*` snapshot (typed to managed keys); merges after {@link env}. */
  dshEnv?: DshEnvironment | undefined
  /** Resolved sandbox policy; ignored by executors that do not confine. */
  sandboxPolicy: SandboxExecutionPolicy | undefined
}
```

`stdin`과 `env`는 신뢰된 프로세스 내 플러그인 입력이며 `dsh-tool-bash`가 노출하지 않습니다. 로컬 실행기는 호출자가 제공한 명시적 env를 병합하기 전에 주변 자격 증명을 정리합니다.

`stdoutMaxBytes`도 신뢰된 플러그인 전용입니다. 포그라운드 소비자가 stderr, 백그라운드 작업, 모델 대상 bash 도구의 일반 출력 상한을 바꾸지 않고 한정된 파서 예산까지 완전한 stdout을 요청할 수 있게 합니다.

## 포그라운드 실행: `ShellRunResult`

완료된(또는 종료된) 포그라운드 실행 하나의 결과입니다. 직교하는 결과는 **독립적으로** 보고됩니다. 프로세스가 신호를 잡아 타임아웃이면서 종료 코드 0일 수 있으므로 `timedOut`, `aborted`, `signal`, `exitCode`가 각각 별도 필드이며, 호출자는 중단된 실행을 깨끗한 성공으로 읽지 않습니다.

```ts type-equiv
/** The outcome of a foreground run, including timeout during preparation. */
interface ShellRunResult {
  /** Exit code; null when preparation expired or the process died from a signal. */
  exitCode: number | null
  /** Terminating signal, or null when none was reported, including preparation expiry. */
  signal: NodeJS.Signals | null
  /**
   * True when the executor's own timeout was the FIRST cause to cut the command
   * short. Mutually exclusive with {@link aborted}: one fused deadline drives
   * both the timeout and the caller's cancellation, so a timeout and an abort
   * racing before process close report the single first-abort cause, not both
   * (see the [timeout-library Agent Note](../../../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)).
   */
  timedOut: boolean
  /**
   * True when the caller's `AbortSignal` was the FIRST cause to kill the command
   * (and it was not the executor's own timeout). Mutually exclusive with
   * {@link timedOut} — see there for the first-cause classification.
   */
  aborted: boolean
  /** The effective timeout applied to this run (after defaulting/capping). */
  timeoutMs: number
  stdout: CollectedOutput
  stderr: CollectedOutput
  /** Sandbox execution facts, absent for an unsandboxed executor. */
  sandbox?: ShellSandboxInfo
}
```

각 스트림은 `CollectedOutput`입니다. 즉 (잘렸을 수 있는) 텍스트와 복구 정보이며, 잘린 경우 `text`는 **꼬리**이고 전체 스트림은 비공개 파일로 흘러나갑니다. 이 필드는 [subprocess seam](subprocess.ko.md)이 소유하고 `dsh-shell`이 다시 내보냅니다.

## 파일 샌드박스: `ShellSandboxInfo`

샌드박스를 소비하는 실행기는 구성된 모드 폴백을 `ShellExecutor.sandboxMode`로 노출합니다. 도구 계층은 [`@deepseek-ai/dsh-sandbox-policy`](../../packages/sandbox/sandbox-policy/README.md)에 각 호출 세션의 영속 `sandbox/mode` 재정의와 불변 cwd를 `ShellExecRequest.sandboxPolicy`로 해석하도록 요청하며, 사용자가 승인한 더 넓은 호출은 모드만 교체합니다. 모드/루트/집행 어휘는 [`@deepseek-ai/dsh-sandbox` seam](sandbox.ko.md)이 소유하고, 모드는 파일 효과만 지배합니다.

샌드박스 실행은 그 모드, 보수적 거부 분류, 집행 완전성을 보고합니다. `runnerFailed`는 명령이 실행되기 전 샌드박스 러너 실패를 표시하며, 포그라운드 실행은 `SANDBOX_UNAVAILABLE`을 던지고 종료(settled)된 백그라운드 프로세스는 사실 채널만 가집니다.

```ts type-equiv
/**
 * Sandbox facts for one run, present iff a sandboxing executor handled it.
 * Facts are reported independently of process exit status so callers can
 * distinguish command failures from policy denials and runner failures.
 */
interface ShellSandboxInfo {
  /** The mode the command actually ran under. */
  mode: SandboxMode
  /** Whether the sandbox denied a file operation. */
  denied: boolean
  /** How completely the selected runner enforced the requested mode. */
  enforcement?: SandboxEnforcement
  /** Whether the sandbox runner failed before the command could run. */
  runnerFailed?: boolean
}
```

`SANDBOX_UNAVAILABLE` 오류 코드([sandbox seam](sandbox.ko.md) 소유)는 제한된 모드에 사용 가능한 백엔드가 없을 때 `ctx.sandbox` 제공자가 던지고 실행기가 전파하는 것입니다. 선택된 러너가 자기 프로필을 거부하는 경우도 같은 폐쇄 실패 포그라운드 오류에 도달하며, 종료(settle)된 백그라운드 작업은 `runnerFailed`를 기록합니다. 모델은 결과에서 거부/러너 사실을 받고, 거부 표시자가 이름을 밝힐 때만 유효 모드를 알게 되며, `sandbox_permissions`와 `justification`으로 일회성 엄격히 더 넓은 재시도를 요청할 수 있습니다. 무엇이든 실행되기 전에 `ctx.approval`이 그 정확한 호출을 승인해야 합니다. 완전한 정책과 전환 설계는 [샌드박스 참조](../../packages/sandbox/sandbox-policy/README.md)입니다.

## 백그라운드 프로세스: `ShellProcess`

`start()`는 비동기 시작 준비 후 핸들로 해석됩니다. 취소나 준비 실패는 게시 전에 거부합니다. 이 핸들에는 id나 소유자가 없습니다. `dsh-tool-bash`가 이를 `ctx.jobs.start()` 훅으로 적응시키고, 그다음 일반 런타임이 작업 아이덴티티와 수명 주기를 소유합니다. `done`은 기반 프로세스가 종료(settle)될 때 이행되며 결코 거부(reject)되지 않고, 서브프로세스 제공자 거부는 stderr에 단계 중립 오류를 담은 `killed` 프로세스가 됩니다. 읽기는 종료 후에도 유효하고, 샌드박스 사실은 `done`이 해석되기 전에 각인됩니다.

```ts type-equiv
/**
 * A background process handle returned by {@link ShellExecutor.start}. It is the
 * only access path; buffered output remains readable after exit. Composition
 * teardown (the subprocess service's disposal) kills running processes and
 * awaits {@link done}; an executor-only reload leaves them running.
 */
interface ShellProcess {
  /** Process lifecycle state (settled exactly once). */
  status: ShellProcessStatus
  /** Exit code once finished (null = killed by signal / still running). */
  exitCode: number | null
  /** Terminating signal name, when signal-killed. */
  signal: NodeJS.Signals | null
  /**
   * Resolves when the underlying process settles (never rejects — provider
   * rejection settles as `killed` with a stage-neutral error on stderr).
   */
  readonly done: Promise<void>
  /** Sandbox facts, stamped once a confined process settles. */
  sandbox?: ShellSandboxInfo
  /**
   * Read output produced since the previous read (consuming — consecutive
   * reads never re-deliver). Reads that lost data flag `lossy` and point at
   * full-stream spill files when available.
   */
  readOutput(): ShellProcessRead
  /**
   * Non-consuming offset readers over the same captured streams the consuming
   * {@link readOutput} cursor drains, including the provider-failure note a
   * rejected spawn leaves on stderr. Independent observers read here at their
   * own offsets without stealing bytes from `readOutput`.
   */
  observed: ShellObservedStreams
  /**
   * Terminate the provider-managed range. Returns false when it had already finished
   * (no-op); idempotent.
   */
  kill(): boolean
}
```

`readOutput()`은 증분 델타와 스필 복구 사실을 반환합니다:

```ts type-equiv
/** One incremental {@link ShellProcess.readOutput} read. */
interface ShellProcessRead {
  /** Output produced since the previous read (stderr in a marked section). */
  delta: string
  /** True when truncation dropped unread bytes the delta cannot include. */
  lossy: boolean
  /** Full stdout spill file, when stdout truncation occurred and a safe path is available. */
  stdoutSpillPath?: string
  /** Full stderr spill file, when stderr truncation occurred and a safe path is available. */
  stderrSpillPath?: string
}
```

## 서비스

`ShellExecutor`는 `resolve`, 포그라운드 `run`, 백그라운드 프로세스 `start`, `sandboxMode` 기능 사실을 소유합니다. `dsh-bash-local`은 명령 기본값, 타임아웃/중단 분류, 터미널 환경, 백그라운드 읽기 병합을 소유하며, 관리 범위 종료, 한정된 수집기, 스필 파일, 자격 증명 정리, dispose 정지는 [subprocess 서비스](subprocess.ko.md)의 몫입니다. `dsh-tool-bash`는 모델 대상 렌더링을 소유하고 백그라운드 핸들을 [일반 작업 런타임](jobs.ko.md)으로 적응시킵니다. `dsh-shell`은 셸 도구의 공유 종료 상태 계약을 소유합니다. 내보내는 `parseExitStatus`/`ParsedExitStatus`가 `dsh-tool-bash`의 `renderResult`와 `dsh-tool-pwsh`의 `renderPwshResult`가 덧붙이는 `[exit code: N]` / `[killed by signal: X]` 표시자를 역변환하고, 두 도구의 `presentResult`가 이를 사용해 렌더링된 텍스트를 터미널 카드의 출력 본문과 종료 상태 알약으로 나눕니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxshell--shellexecutor-abstract-seam"></a>

### `ctx.shell` — `ShellExecutor` (abstract seam)

Abstract bash execution service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.shell` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

execute resolves with the process handle after preparation. "Foreground" is a property of what the caller awaits, not of the spawn — a caller that awaits ShellExecution.result ran the command in the foreground; one that keeps the handle ran it in the background. A caller that waits only for a while runs the command under `onExpiry: 'none'` and bounds its own wait; the handle stays valid after the caller stops waiting.

Implementations must honor these semantics:

- ShellExecution.result rejects only for infrastructure failures. Nonzero exits, timeout kills, and abort kills resolve with a descriptive result: first-cause `timedOut`/`aborted`, the spec's `timeoutMs` echoed.
- The handle is published after preparation. `done` settles at process close and never rejects; spawn failures settle as `killed` with the error on the read path, while `result()` carries the same failure as its rejection.
- `onExpiry: 'none'` arms no deadline; `'kill'` kills at expiry. Expiry during preparation returns a settled timed-out handle without output.
- ShellProcess.readOutput is incremental: consecutive reads never repeat output. Lossy reads report truncation and available spill files.
- A still-running process is stopped and awaited when its owning composition tears down. With the subprocess seam that boundary is `ctx.subprocess` disposal, so a process survives an executor-only reload.

```ts cordis-catalog
/**
 * Apply implementation-owned defaults and caps to a request before execution.
 * @param request - the caller's request; omitted fields get this
 *   implementation's defaults, capped fields are clamped.
 * @returns the fully-specified spec to hand to {@link execute}.
 */
abstract resolve(request: ShellExecRequest): ShellExecSpec

/**
 * Prepare and spawn the command under its resolved deadline.
 * @param spec - a resolved spec from {@link resolve}, never a raw request.
 * @returns the prepared handle, including its result projection;
 *   preparation timeout yields an already-settled handle with no output.
 * @throws on preparation failure or caller cancellation before process publication.
 */
abstract execute(spec: ShellExecSpec): Promise<ShellExecution>
```

Source: [`packages/shell/shell/src/index.ts`](../../packages/shell/shell/src/index.ts)

<a id="ctxshellenv--shellenvregistry"></a>

### `ctx.shellEnv` — `ShellEnvRegistry`

Registry (`ctx.shellEnv`) for trusted, per-execution `DSH_*` variables. The namespace is rebuilt for every model shell call: ambient `DSH_*` values are discarded by the executor, then the registry's current snapshot is injected. Built-in shell facts remain owned by the registry itself while plugins can register additional, enumerable facts with effect-scoped disposal.

```ts cordis-catalog
/**
 * Register one environment contributor. Names and keys are unique; built-in
 * keys are reserved. Registration is disposed with the calling plugin fiber.
 * @param contributor - declared key ownership and per-execution resolver.
 * @returns the disposer that unregisters the contribution.
 */
register(contributor: BashEnvContributor): () => void

/**
 * Build the trusted `DSH_*` snapshot for one shell tool execution.
 * @param execution - the current tool execution.
 * @returns an immutable environment overlay containing built-ins and current contributions.
 */
collect(execution: ToolExecution): DshEnvironment

/**
 * Enumerate plugin-contributed variables without executing their resolvers.
 * @returns declarations sorted by environment variable name.
 */
list(): BashEnvVariableInfo[]
```

Types: [DshEnvironment](subprocess.ko.md) · [ToolExecution](tools.ko.md)

Source: [`packages/shell/shell-env/src/index.ts`](../../packages/shell/shell-env/src/index.ts)
<!-- END GENERATED cordis-surface -->
