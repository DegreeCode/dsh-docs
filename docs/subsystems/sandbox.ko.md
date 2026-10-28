# 프로세스 샌드박스

[English](sandbox.md) | [中文](sandbox.zh.md) | 한국어

[dsh-sandbox](../../packages/sandbox/sandbox)의 프로세스 샌드박스 seam은 같은 세계의 서브프로세스 argv를 파일 효과 정책으로 감싸면서 소비자를 플랫폼 러너에 결합하지 않습니다. [dsh-sandbox-local](../../packages/sandbox/sandbox-local)이 Linux bwrap/Landlock, macOS Seatbelt, Windows ACL 제한 토큰 백엔드를 제공하고, [dsh-bash-sandbox](../../packages/shell/bash-sandbox)와 [dsh-pwsh-sandbox](../../packages/shell/pwsh-sandbox)가 이를 소비합니다. [dsh-sandbox-ssh](../../packages/ssh/sandbox-ssh/README.md)는 SSH 파일시스템·서브프로세스 제공자와 짝을 이룬 원격 백엔드를 통해 같은 정책을 적용합니다.

출처: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

## 모드와 강제

`SandboxMode`는 파일시스템 효과만 관장합니다. `read-only`는 백엔드에 쓰기 거부를 요청하며, POSIX 러너는 셸이 요구하는 `/dev/null` 싱크를 추가로 부여하고, Windows ACL 러너는 명시적 쓰기 가능 루트를 부여하지 않고 주변 ACL 공백에 대해 부분 강제를 보고합니다. `workspace-write`는 워크스페이스 루트, 명시적 추가 디렉터리, 백엔드가 약속한 임시 영역 아래의 쓰기를 허용하고, `danger-full-access`는 격리를 우회합니다. 네트워크와 프로세스 가시성은 이 어휘 밖입니다.

```ts type-equiv
/**
 * File-effect policy for confined processes. `read-only` permits only required
 * sinks such as `/dev/null`; `workspace-write` also permits the workspace,
 * explicit extra roots, and backend-defined temp areas; `danger-full-access` bypasses confinement. Network
 * and process visibility are outside this vocabulary.
 */
type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
```

처음 두 모드만 제공자에게 보낼 수 있습니다. `danger-full-access` 소비자는 원래 argv를 spawn하고 `ctx.sandbox`를 호출하지 않습니다.

```ts type-equiv
/** A confining (non-`danger-full-access`) mode — the modes a {@link SandboxPolicy} can carry. */
type ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>
```

강제는 보고되는 사실입니다. `full`은 백엔드가 모드가 약속한 모든 파일 효과를 관장한다는 뜻이고, `partial`은 활성 백엔드나 구형 커널 ABI가 일부만 관장한다는 뜻이므로, 절대적 약속을 요구하는 소비자는 그 구분을 거부하거나 표면화해야 합니다. 구형 Landlock ABI와 Windows ACL 러너의 하드 링크·비격리 읽기·AppContainer ACL 경계가 현재의 부분 사례입니다.

```ts type-equiv
/**
 * Enforcement completeness for this host. `partial` means an active backend or
 * older kernel ABI cannot govern every promised file effect; callers requiring
 * an absolute boundary must not treat it as `full`.
 */
type SandboxEnforcement = 'full' | 'partial'
```

## 호출별 정책

완전한 실행 정책은 기능 호출마다 해석되고 전달됩니다. 여기에는 `danger-full-access`가 포함되므로 소비자는 격리 우회 여부를 결정하기 전에 정책을 한 번 해석할 수 있습니다. 일반 도구 호출은 호출 세션의 불변 cwd에서 `workspaceRoot`를 도출하고, 배포 구성이 에이전트 없는 폴백과 명시적 추가 쓰기 허가를 제공합니다. 리졸버는 절대 실행 세계 표기를 보존합니다. 강제 제공자는 파일이 존재하는 곳에서 루트를 정규화하므로 `symlink/..`를 담은 cwd는 짝을 이룬 서브프로세스 제공자가 실제로 실행되는 디렉터리를 지목합니다.

```ts type-equiv
/**
 * The complete file-effect policy resolved for one capability call. The root
 * is carried even under modes that do not consume it so callers can resolve
 * policy once before choosing the enforcement path.
 */
interface SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: SandboxMode
  /** Absolute root directory `workspace-write` may write under. */
  workspaceRoot: string
  /**
   * Extra physical absolute directories `workspace-write` may also write under.
   * Absence means none. The enforcing host rejects missing, non-directory, and
   * symlinked entries on each call. Remote paths are checked on the remote host.
   * These grant nothing under `read-only` or `danger-full-access`.
   */
  additionalWritableRoots?: readonly string[]
  /**
   * Opaque identity of the calling session (the branded `dsh-session`
   * SessionId). Backends key per-session state off it (e.g. windows-acl gives
   * each live session/workspace pair a random private temp directory and SID,
   * while the workspace SID and standing grant remain per-workspace); absent
   * for agentless calls, which fall back to per-call backend state.
   */
  sessionId?: SessionId
}
```

`ctx.sandboxPolicy.resolve()`는 활성 세션과, 승인된 재시도에 대해서는 명시적 모드를 받습니다. 우선순위와 루트 폴백은 서비스가 소유하므로 bash와 fs가 이를 반복하지 않습니다.

```ts type-equiv
/** Inputs that select the sandbox policy for one capability call. */
interface SandboxPolicyRequest {
  /** Calling session; its immutable cwd becomes the workspace boundary. */
  session?: Session
  /** Explicit approved mode override, which outranks session policy. */
  mode?: SandboxMode
}
```

격리된 실행만 `ctx.sandbox`에 도달하며, 그 제공자 정책이 같은 루트를 유지한 채 모드를 좁힙니다. 덕분에 동시 세션, 소비자, 일회성 에스컬레이션 재시도가 제공자 상태를 변경하지 않고 같은 제공자에게 서로 다른 경계를 요청할 수 있습니다.

```ts type-equiv
/**
 * What one confined execution is allowed to touch — carried PER CALL, not
 * fixed on the provider: two consumers may confine under different policies
 * at the same instant (bash under `read-only` while a confined child agent
 * needs its state directory writable), and an approved escalated retry is a
 * new call with a wider policy. Defaulting/resolution is an explicit step at
 * the consumer boundary; the provider treats the policy as fully specified.
 */
interface SandboxPolicy extends SandboxExecutionPolicy {
  /** The file-effect mode this execution runs under. */
  mode: ConfinedSandboxMode
}
```

<a id="wrapped-argv-and-classification-dialects"></a>

## 감싼 argv와 분류 방언

`RunnerFailureRule`은 러너가 명령을 실행하기 전에 실패했다는 증거를 결합합니다. 소비자는 비제로 종료, 선택적 허용 종료 코드 게이트, 그리고 남은 stderr 한 줄 안의 대소문자 무시 치명 시그니처를 요구합니다. 대소문자를 무시하는 정확한 전체 줄 정보성 제외가 먼저 제거되므로 무해한 러너 알림만으로는 실패를 증명할 수 없습니다. 일치한 줄은 오류 세부 정보로 남고, 분류는 stderr를 다시 쓰지 않습니다.

```ts type-equiv
/**
 * Evidence that identifies a sandbox runner failing before it executes the
 * wrapped command. A consumer first applies {@link allowedExitCodes} when
 * present, removes {@link informationalLines} by case-insensitive exact line
 * equality, then matches {@link fatalSignatures} case-insensitively within
 * each remaining stderr line. Exit status alone never proves runner failure.
 */
interface RunnerFailureRule {
  /** Nonzero process exit codes on which this rule may match; omitted permits any nonzero exit. */
  allowedExitCodes?: readonly number[]
  /** Non-empty substrings identifying a fatal runner diagnostic on one stderr line. */
  fatalSignatures: readonly string[]
  /** Benign stderr lines excluded by exact full-line equality before fatal matching. */
  informationalLines?: readonly string[]
}
```

`ConfinedArgv`는 소비자가 spawn하는 것입니다. 대체 argv 외에도 백엔드의 강제 사실과 서로 직교하는 두 stderr 분류기를 담습니다. `denialSignatures`는 샌드박스가 정상 동작하는 상태에서 격리된 명령이 차단되었음을 식별합니다. `runnerFailureRules`는 샌드박스 러너가 명령을 실행하기 전에 거부하거나 실패했음을 식별하며, 소비자는 이를 먼저 확인해 평범한 작업 실패가 아니라 샌드박스 인프라 실패로 표면화합니다.

```ts type-equiv
/**
 * A {@link SandboxProvider.confine} result: the argv to spawn in place of
 * the caller's own, plus the enforcement completeness the selected backend
 * achieves for it.
 */
interface ConfinedArgv {
  /** The wrapped argv (runner, profile, separator, then the caller's argv). */
  argv: string[]
  /** How completely the selected backend enforces the policy's file effects. */
  enforcement: SandboxEnforcement
  /**
   * The selected backend's denial DIALECT: the case-insensitive stderr
   * substrings a file effect denied by THIS backend produces (EROFS text
   * under bwrap's read-only binds, EACCES under Landlock, EPERM under
   * Seatbelt). A consumer that infers denials from a failed run's stderr
   * matches against exactly these rather than a cross-backend union — the
   * union claims denials a given backend never produces.
   */
  denialSignatures: readonly string[]
  /**
   * Structured runner-failure evidence rules. Consumers require a matching
   * fatal stderr line (after informational exclusions) and any rule-specific
   * exit-code gate before checking denial signatures: runner failure means the
   * command never ran, while denial means confinement worked and blocked it.
   */
  runnerFailureRules: readonly RunnerFailureRule[]
}
```

[로컬 제공자](../../packages/sandbox/sandbox-local/README.md)가 운영자 구성을 소유하고 그 러너 방언을 이 규칙들로 매핑합니다. [샌드박스 bash 소비자](../../packages/shell/bash-sandbox/README.md)가 spawn과 결과 귀속을 소유합니다.

## 제공자와 fail-closed 오류

`await ctx.sandbox.confine(argv, policy, signal)`은 정책 경로를 해석하고 실행 세계에서 `ConfinedArgv`를 반환하거나, 사용 가능한 백엔드가 없으면 `SANDBOX_UNAVAILABLE` 코드의 `SandboxUnavailableError`로 거부합니다. 선택적 시그널은 실행 전에 해석을 취소합니다. 소비자는 반환된 argv를 spawn하거나 관찰하는 중의 실패도 분류할 수 있으며, 그 귀속은 소비자 계약에 속합니다. 격리 정책에 대해 조용한 비격리 통과는 결코 허용되지 않습니다.

제공자 선택, 프로빙, 캐싱, 백엔드별 강제 보고는 [로컬 제공자](../../packages/sandbox/sandbox-local/README.md)에 속합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsandbox--sandboxprovider-abstract-seam"></a>

### `ctx.sandbox` — `SandboxProvider` (abstract seam)

Abstract process-sandbox service. confine must return enforcing argv or fail closed at wrap or runner-execution time; silent unconfined passthrough is forbidden. Functional probes arbitrate multi-runner chains and may be skipped for a sole candidate, whose own refusal remains the fail-closed end.

```ts cordis-catalog
/**
 * Wrap `argv` so it executes confined under `policy` on this host; the
 * caller spawns the returned argv in place of its own.
 * @param argv - the exact argv the caller is about to spawn (program plus
 *   arguments), NOT a shell string — a shell-shaped consumer passes
 *   `['bash', '-c', command]`.
 * @param policy - the file-effect policy this execution runs under,
 *   carried per call (see {@link SandboxPolicy}).
 * @param signal - cancellation while the provider resolves the policy and runner.
 * @returns the argv to spawn instead, plus the enforcement completeness
 *   the selected backend achieves for it.
 */
abstract confine(argv: readonly string[], policy: SandboxPolicy, signal?: AbortSignal): Promise<ConfinedArgv>
```

Source: [`packages/sandbox/sandbox/src/index.ts`](../../packages/sandbox/sandbox/src/index.ts)

<a id="ctxsandboxpolicy--sandboxpolicyservice"></a>

### `ctx.sandboxPolicy` — `SandboxPolicyService`

The sandbox-policy service (`ctx.sandboxPolicy`). Owns the deployment default mode, fallback workspace root, and current request-time policy section. Tool layers call resolve for each execution so a session's mode log and immutable cwd travel together to every enforcing capability.

```ts cordis-catalog
/**
 * Resolve the complete policy for one capability call. An approved explicit
 * mode outranks the session's last `sandbox/mode` event, which outranks the
 * deployment default. A session cwd is its workspace-write boundary; the
 * configured root is the fallback for agentless calls and sessions without a
 * cwd.
 * @param request - optional session and approved mode override.
 * @returns the fully resolved per-call mode and absolute workspace root.
 */
resolve(request: SandboxPolicyRequest = {}): SandboxExecutionPolicy

/**
 * Read the session override without applying the deployment default.
 * @param session - session whose log supplies the override.
 * @returns the last logged mode, or `undefined` without one.
 */
overrideOf(session: Session): SandboxMode | undefined
```

Types: [Session](session.ko.md)

Source: [`packages/sandbox/sandbox-policy/src/index.ts`](../../packages/sandbox/sandbox-policy/src/index.ts)
<!-- END GENERATED cordis-surface -->
