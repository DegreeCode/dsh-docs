# SSH

[English](ssh.md) | [中文](ssh.zh.md) | 한국어

[SSH 제공자 패밀리](../../packages/ssh/README.md)는 배포가 소유한 OpenSSH 연결을 통해 원격 파일시스템/프로세스 세계 하나를 제공합니다. 하네스, 모델 전송, Session 저장소는 호스트에 남습니다. 이 패밀리는 기존 파일시스템, 서브프로세스, 샌드박스 API를 구현하며 SSH 전용 모델 도구를 새로 도입하지 않습니다.

## 실행 좌표

파일시스템 정체성, 실행 파일 조회, 프로세스 cwd, 샌드박스 워크스페이스 루트, 언어 서버 파일 URL은 SSH 호스트를 가리킵니다. 제공자는 파일이 존재하는 곳에서 경로를 정규화하며 `symlink/..`의 파일시스템 해석을 보존합니다. 정책 리졸버는 하네스 호스트에서 원격 경로를 해석하려 하지 않고 절대 실행 세계 표기를 전달합니다.

`processPath()`는 짝을 이룬 서브프로세스 제공자가 쓸 수 있는 경로를 제공합니다. `processPathFromHostPath()`는 SSH에서 사용할 수 없습니다. 원격 산출물을 설치한다고 해서 임의의 호스트 경로가 이식 가능해지지는 않습니다. 따라서 [`NodePtcRuntime`](../../packages/ptc-runtime/ptc-runtime-node/README.md)은 검증된 원격 실행 구성을 받습니다. 즉 설치된 스크립트 부트스트랩이나 [헬퍼 실행 파일의 내장 워커](../../packages/ssh/ssh-helper-runtime/README.md)입니다.

## 전송과 신뢰

관리 RPC는 헬퍼의 SSH exec 스트림을 사용합니다. 일반 stdin, stdout, stderr, 터미널 출력, 선택적 fd 7 제어 트래픽은 별도로 인증된 전달 Unix 소켓을 사용합니다. 전달 스트림마다 자체 SSH 채널 창이 있어 일시 정지된 프로그램 출력이 제어나 관리 창을 공유하지 않습니다. 다만 모든 채널은 여전히 연결 대역폭과 전송 실패를 공유합니다.

배포 인증, 설치된 산출물 검증, 스트림별 TLS 인증은 [`dsh-ssh`](../../packages/ssh/ssh/README.md)에 속합니다. 헬퍼는 원격 머신에서 신뢰된 로컬 제공자로 파일시스템·프로세스 요청을 실행합니다. SSH는 전송이며, 선택된 원격 샌드박스 제공자가 파일 효과를 강제합니다.

## 프로세스 수명과 취소

프로세스는 스트림이 연결되기 전에 예약되고, 실행은 최대 한 번만 수용됩니다. `done`은 직접 결과를 보고하고, `waitForExit`는 원격 관리 범위를 관찰합니다. 터미널 작업은 비동기 공유 API를 유지합니다. 준비 취소, 실행된 프로세스 종료, 제공자 폐기는 헬퍼를 통해 소유 리소스를 해제합니다.

관리 데드라인은 개별 RPC 관찰을 제한하며, Bash나 ptc-runtime 소비자가 고른 실행 데드라인을 대체하지 않습니다. 다른 요청이 진행되는 동안 원격 대기는 계속 대기 중일 수 있습니다. SSH 손실은 대기 중 작업을 무효화하고, 헬퍼 EOF, 시그널, 리스 만료가 원격 정리를 시작합니다. 클라이언트는 확인되지 않은 결과를 정직하게 보고하며, 실행되었을 수 있는 동작을 재생하려고 다시 연결하지 않습니다.

## 구성 범위

Headless는 마운트된 파일시스템 제공자를 통해 Session cwd를 기록하고 확인합니다. 따라서 원격 FS, Bash, 터미널, LSP, PTC 소비자가 그 좌표를 공유할 수 있습니다. 호스트 파일시스템 접근을 가정하는 Web 워크스페이스 뷰는 별도 통합이 필요하며, 제공자만 교체한다고 그 뷰가 원격을 인지하게 되지는 않습니다.

대안과 검증 의무는 [결정 기록](../../.agents/notes/implemented/architecture/2026-09-11-posix-ssh-runtime.md)을 참고하세요.

## 연결 API

```ts type-equiv
/** Installed helper invocation; script deployments may also install a PTC bootstrap. */
type HelperLaunch = {
  /** Run the installed script with a separately installed Node executable. */
  kind: 'node-script'
  /** Absolute remote Node executable. */
  node: string
  /** Absolute remote PTC bootstrap; requires bootstrapHash. */
  bootstrapPath?: string
  /** Lowercase SHA-256 of bootstrapPath; requires that path. */
  bootstrapHash?: string
} | {
  /** Run the helper executable with its embedded Node and PTC worker. */
  kind: 'executable'
}
```

```ts type-equiv
/** Deployment-owned SSH identity and installed helper; no model argument selects these values. */
interface Config {
  /** OpenSSH host alias, including its existing user, key and known-host configuration. */
  host: string
  /** Explicit script or self-contained executable invocation. */
  launch: HelperLaunch
  /** Absolute path to the installed, bundled helper entry. */
  helper: string
  /** SHA-256 of that bundled helper; mismatches refuse the connection. */
  helperHash: string
  /** Absolute remote default workspace. */
  workspace: string
  /** Connection and administrative-request deadline, at most 2,147,483,647 milliseconds. */
  requestTimeoutMs?: number
  /** Maximum JSON payload bytes per helper request or response. */
  maxFrameBytes?: number
  /** Maximum ordinary requests; heartbeat and bounded resource cleanup have reserved capacity. */
  maxPending?: number
  /** Remote helper lease; loss of heartbeats starts remote managed cleanup. */
  leaseMs?: number
}
```

```ts public-api
/** One non-reconnecting SSH session; loss invalidates all active operations. */
declare class SshConnection extends Service {
  static Config: schema<Config>;
  /** Verified remote helper coordinates; callers must await this before launch. */
  readonly ready: Promise<Hello>;
  constructor(ctx: Context, config: Config);
  /** Hold plugin readiness until the remote identity and helper digest are verified. */
  async [Service.init](): Promise<void>;
  /** Verified remote PTC launch configuration; script deployments require a verified bootstrap. */
  get ptcLaunch(): { kind: 'embedded'; executable: string } | { kind: 'node-script'; executable: string; bootstrapPath: string };
  /**
     * Send a helper operation; cancellation never replays an ambiguous mutation.
     * @param method - the private helper operation.
     * @param params - JSON request fields validated by the helper.
     * @param result - response validation before returning provider-visible data.
     * @param signal - cancellation, which does not undo completed remote effects.
     * @param wait - allow a process observation to outlast the administrative deadline.
     * @returns the validated remote result.
     */
  async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>;
  /**
     * Forward one authenticated stream through an independent SSH channel.
     * @param endpoint - private coordinates issued by this connection's helper.
     * @param signal - cancellation of allocation and the resulting socket.
     * @returns a paused socket; attach a consumer before resuming it.
     */
  async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>;
  /** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
  dispose(): Promise<void>;
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxssh--sshconnection"></a>

### `ctx.ssh` — `SshConnection`

One non-reconnecting SSH session; loss invalidates all active operations.

```ts cordis-catalog
/**
 * Send a helper operation; cancellation never replays an ambiguous mutation.
 * @param method - the private helper operation.
 * @param params - JSON request fields validated by the helper.
 * @param result - response validation before returning provider-visible data.
 * @param signal - cancellation, which does not undo completed remote effects.
 * @param wait - allow a process observation to outlast the administrative deadline.
 * @returns the validated remote result.
 */
async request<T>(method: string, params: unknown, result: z.ZodType<T>, signal?: AbortSignal, wait: boolean = false): Promise<T>

/**
 * Forward one authenticated stream through an independent SSH channel.
 * @param endpoint - private coordinates issued by this connection's helper.
 * @param signal - cancellation of allocation and the resulting socket.
 * @returns a paused socket; attach a consumer before resuming it.
 */
async connectStream(endpoint: SshStreamEndpoint, signal?: AbortSignal): Promise<Socket>

/** Tear down the helper's remote managed ranges before releasing the SSH master when reachable. */
dispose(): Promise<void>
```

Source: [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)
<!-- END GENERATED cordis-surface -->
