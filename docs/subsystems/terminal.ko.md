# 지속형 PTY 세션

[English](terminal.md) | [中文](terminal.zh.md) | 한국어

PTY 백엔드, `ctx.terminals`, 모델 대상 소비자가 공유하는 타입입니다. 근거는 [지속형 PTY Agent Note](../../.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md)가 소유하며, 이 페이지는 [`packages/terminal/terminal/src/types.ts`](../../packages/terminal/terminal/src/types.ts)의 패키지 간 어휘를 기록합니다.

## 정체성과 준비 상태

`TerminalSessionId`는 서비스가 발급하는 브랜드 id입니다. 선택적 이름은 소유자 지역 표시 메타데이터이며, 권한 부여는 이름이나 추측한 id가 아니라 정확한 소유 `Agent`를 비교합니다.

`TerminalWaitReason`은 한 전송이 왜 반환되었는지 말합니다. 이는 `TerminalSessionStatus`와 독립적입니다. 침묵이나 시간 초과는 최상위 셸이 살아 있는 동안 반환될 수 있고, `session_exit`은 임의의 포그라운드 자식이 아니라 그 셸이 종료되었음을 뜻합니다.

```ts type-equiv
/** Why one interactive send returned control to its caller. */
type TerminalWaitReason = 'stdin_read' | 'inferred_idle' | 'timeout' | 'session_exit'
```

```ts type-equiv
/** Top-level PTY process status, independent of a send's wait reason. */
type TerminalSessionStatus =
  | { kind: 'running' }
  | { kind: 'exited'; exitCode: number | null; signal: NodeJS.Signals | null }
```

## 백엔드와 라이브 세션

백엔드는 등록된 타입 하나가 어떻게 시작하고 준비 상태를 감지하는지를 소유합니다. `TerminalSessionService`는 설정이 성공한 뒤에야 반환된 세션을 게시하고, 그다음 id 권한 부여와 정리를 소유합니다. 부분 시작 리소스를 정리할 수 없는 백엔드는 `TerminalBackendCleanupError`로 거부하며, 이로써 디스포즈는 호출자의 취소 사유를 대체하지 않고 정리 실패를 보유할 수 있습니다. 백엔드 세션은 터미널 상태와 캡처된 리소스의 정지 상태를 소유합니다.

```ts type-equiv
/** Replaceable provider for one PTY session type. */
interface TerminalBackend {
  /** Stable type selected by {@link TerminalSpawnRequest.type}. */
  readonly type: string
  /** Create an unpublished session or reject after cleaning partial resources; cleanup failure uses {@link TerminalBackendCleanupError}. */
  spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>
}
```

```ts type-equiv
/** Backend-owned live session retained by {@link TerminalSessionService}. */
interface TerminalBackendSession {
  /** Initial bounded terminal output returned from `terminal_open`. */
  readonly motd: string
  /** Top-level process id when one exists. */
  readonly pid?: number
  /** Start one exclusive send operation. */
  startSend(request: TerminalSendRequest): TerminalSendOperation
  /** Read one bounded page from retained scrollback. */
  read(request: TerminalReadRequest): TerminalReadResult
  /** Signal the verified foreground process group. */
  signal(signal: TerminalSignal): Promise<TerminalSignalResult>
  /** Observe top-level process status. */
  status(): TerminalSessionStatus
  /** Idempotently close the captured owned process tree and await quiescence. */
  close(reason: string): Promise<void>
}
```

## 전송과 보유 출력

하나의 라이브 세션은 활성 전송 하나를 받아들입니다. 그 연산은 일반 백그라운드 작업을 위한 소비형 출력 커서와 포그라운드 호출자를 위한 종료 결과 하나를 노출합니다. `TerminalReadResult`는 경계 있는 세션 스크롤백을 별도로 페이지 단위로 제공합니다.

```ts type-equiv
/** Live backend-owned send; exactly one may be active per PTY session. */
interface TerminalSendOperation {
  /** Resolves after readiness, timeout, cancellation, or top-level process exit. */
  done: Promise<TerminalSendResult>
  /** Consume output produced since the prior call. */
  readOutput(): TerminalSendRead
  /** Request `SIGINT`; returns false after the operation settled. */
  cancel(): boolean
}
```

```ts type-equiv
/** Settled result for one foreground or background send. */
interface TerminalSendResult {
  /** Bounded rendered terminal delta remaining at settlement. */
  viewport: string
  /** Why the wait returned; this does not imply arbitrary child-process exit. */
  waitReason: TerminalWaitReason
  /** Top-level session status observed at settlement. */
  sessionStatus: TerminalSessionStatus
  /** Whether output was dropped from the operation or retained scrollback. */
  truncated: boolean
}
```

## 소유권과 내구성

`TerminalSessionService`는 정확한 소유자 범위에 대기형 정리 하나를 붙이고, 외부 연산을 거부하며, 백엔드나 도구 플러그인 리로드에 걸쳐 세션을 살려 둡니다. PTY 상태와 원시 바이트는 프로세스 지역으로 남습니다. 모델 입력과 경계 있는 반환 출력은 중복된 PTY 세션 이벤트가 아니라 기존 `tool/call`, `tool/result`, 작업 결과 경로를 통해 영속됩니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxterminals--terminalsessionservice"></a>

### `ctx.terminals` — `TerminalSessionService`

In-process registry for replaceable PTY backends and exact-Agent sessions.

```ts cordis-catalog
/**
 * Register one backend type for this effect scope.
 * @param backend - provider with a non-empty unique type.
 * @returns disposer that removes exactly this contribution.
 */
registerBackend(backend: TerminalBackend): () => void

/**
 * List registered backend types in registration order.
 * @returns fresh backend type names.
 */
listBackends(): string[]

/**
 * Create and publish one owner-scoped session after backend setup succeeds.
 * @param owner - exact registered Agent that owns access and cleanup.
 * @param request - backend type plus optional owner-local name and cwd.
 * @param signal - cancellation of unpublished setup.
 * @returns published identity, metadata, status, and MOTD.
 */
async spawn(owner: Agent, request: TerminalSpawnRequest, signal?: AbortSignal): Promise<TerminalSpawnResult>

/**
 * Test whether an exact owner has a published session or unpublished spawn.
 * @param owner - exact live owner to inspect.
 * @returns true across the entire spawn-to-close interval, with no publication gap.
 */
hasOwnerActivity(owner: Agent): boolean

/**
 * Start one exclusive interactive send.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param request - explicit text, submit behavior, and cancellation.
 * @returns live operation handle for foreground await or task registration.
 */
startSend(owner: Agent, id: TerminalSessionId, request: TerminalSendRequest): TerminalSendOperation

/**
 * Read one bounded scrollback page from an owned session.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param request - optional newest-relative offset and line count.
 * @returns bounded retained text and pagination metadata.
 */
read(owner: Agent, id: TerminalSessionId, request: TerminalReadRequest = {}): TerminalReadResult

/**
 * Deliver an allowed signal through an owned backend session.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param signal - allowed POSIX signal name.
 * @returns delivered foreground process-group identity.
 */
signal(owner: Agent, id: TerminalSessionId, signal: TerminalSignal): Promise<TerminalSignalResult>

/**
 * Close one owned session and remove it only after quiescent backend cleanup.
 * @param owner - exact session owner.
 * @param id - target PTY identity.
 * @param reason - diagnostic cleanup reason.
 * @returns true for a newly closed session, false when the same close is already in flight.
 */
async kill(owner: Agent, id: TerminalSessionId, reason: string = 'model request'): Promise<boolean>

/**
 * List fresh snapshots for exactly one owner.
 * @param owner - exact owner whose sessions are visible.
 * @returns owner-visible snapshots in publication order.
 */
list(owner: Agent): TerminalSessionSnapshot[]
```

Types: [Agent](core.ko.md)

Source: [`packages/terminal/terminal/src/index.ts`](../../packages/terminal/terminal/src/index.ts)
<!-- END GENERATED cordis-surface -->
