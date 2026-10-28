# 워크스페이스

[English](workspace.md) | [中文](workspace.zh.md) | 한국어

워크스페이스는 사용자가 작업하는 디렉터리에 대한 영속 기록입니다. 정규 경로 위의 안정적인 id, 표시 제목, 그리고 그에 속한 세션의 순서 있는 계정입니다. 이 하위 시스템은 하나의 패키지([dsh-workspace](../../packages/workspace/workspace), `ctx.workspaceRegistry`)이며, 에이전트 루프 척추의 일부가 아닌 선택적 호스트 측 기능이고 모델에는 보이지 않습니다(도구, 프롬프트 텍스트, 세션 이벤트 없음). [storage 도메인 형식](storage.ko.md)으로 기록을 저장하고 [`SessionHeader.cwd`](persistence.ko.md#sessionheader--로그-옆의-메타데이터)에 대해 세션 멤버십을 검증하므로 `storageDomain`과 `sessionPersistence`가 필수 시작 의존성입니다. 사용할 수 없는 영속 피어는 빈 이력으로 오인되지 않고 플러그인을 대기 상태로 남깁니다. 설계 기록: [도메인 KV 스토리지 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md), 부트스트랩과 GUI 순서: [Workspace UI 제품 흐름 Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md).

출처: [`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## 식별자

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId`는 [브랜드 id](core.ko.md#브랜드-id)입니다. 경로 식별자는 별개입니다. `realpathNormalize`(`fs.realpath`; 후행 슬래시, `..`, 심볼릭 링크 해석)가 유일한 고유성 규범입니다. 워크스페이스 경로는 정규화되어 저장되고, 고유성은 정규 경로의 문자열 동등성이며(소유된 디렉터리를 가리키는 심볼릭 링크는 충돌합니다), 연결 시점의 세션 cwd 검사도 같은 규범을 통과합니다.

## 워크스페이스 엔터티

소비자는 `Workspace` 인터페이스만 봅니다. 구현은 패키지 비공개로 남습니다.

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership validates header cwd
 * against the workspace path, but preserves an existing account when its
 * fully qualified cwd is missing. Consumers only see this interface; the
 * implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A fully qualified cwd
   * whose realpath or directory stat fails with ENOENT preserves an existing
   * candidate, including a dangling symlink; other filesystem failures do not.
   * A subsequent mutation prunes filtered candidates, not missing-directory
   * candidates. This does not admit new sessions or recreate directories.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

소유권의 진실은 레코드의 순서 있는 `sessionIds`이며, 세션 cwd에서 파생되지 않습니다. 멤버십은 기록된 헤더 cwd를 워크스페이스 경로에 대해 검증하며, 기존 후보는 완전한 cwd가 해석에 실패하거나 `ENOENT`로 디렉터리 stat에 실패해도 소유된 상태로 남습니다. 이는 새 세션을 허용하지 않으면서 사라진 디렉터리와 끊어진 심볼릭 링크 계정을 보존합니다. 실패한 쓰기는 거부되며(`insertSessionBefore` 계정 오류는 `WorkspaceMoveInvalidError`, 스토리지 실패는 일반 오류), 수용된 모든 변경은 `updatedAt`을 기록하고 더 이상 멤버십 검사를 통과하지 못하는 후보를 영속적으로 정리합니다.

## 레지스트리: `ctx.workspaceRegistry`

`WorkspaceRegistry`([시그니처](#ctxworkspaceregistry--workspaceregistry))가 등록과 해석을 소유합니다. `create(path, title?)`는 완전한 경로를 요구하고, 이를 정규화하고, 존재하지 않는 경로(원래 `ENOENT`)나 디렉터리가 아닌 경로를 거부하며, 정규 경로가 이미 소유되어 있으면 기존 엔터티를 그대로 반환하고, 그렇지 않으면 `title ?? defaultWorkspaceTitle(path)`로 레코드를 만들어 영속 레지스트리 순서 앞에 추가합니다(서로 다른 정규 경로가 같은 표시 제목을 가질 수 있고, 마지막 세그먼트가 없는 경로는 루트 표기를 사용합니다). `get(id)`와 순서 있는 `list()`는 동기 캐시 읽기이며, `resolveByPath(path)`는 생성을 하지 않고 같은 완전한 realpath 규범을 적용합니다. `delete(id)`는 등록, 순서 항목, 세션 계정만 제거합니다. 디렉터리, 사용자 파일, 살아 있는 세션, 영속 로그는 절대 건드리지 않으므로 그 세션들은 Ungrouped가 됩니다([참조](../../packages/workspace/workspace/README.md)). 알 수 없는 id는 `false`를 반환합니다. 생성과 삭제는 두 쓰기(레코드 + 순서)가 어긋나기 전에 대기 중 변경 마커를 영속하고, 시작 시 표시된 변경만 정확히 해소합니다. 표시된 테이블 행을 삭제하여 중단된 삭제를 완료하고 중단된 생성을 롤백하며(등록은 다시 만들 수 있으므로 롤백이 안전한 방향입니다), 표시 없는 순서/테이블 불일치는 손상으로 간주되어 즉시 실패합니다.

세션은 이 레지스트리가 아니라 세션을 만드는 쪽에서 생성 시점에 cwd를 받습니다. API 게이트웨이는 선택한 워크스페이스의 `path`에서 새 세션 cwd를 해석하고(명시적 또는 기본 cwd로 폴백), cwd가 불변 [`SessionHeader`](persistence.ko.md#sessionheader--로그-옆의-메타데이터)에 들어가도록 세션을 만든 뒤 `attachSession`을 호출하며, 이 호출이 저장된 헤더 cwd를 워크스페이스 경로에 대해 다시 검증합니다. 첫 성공적인 시작에서 레지스트리는 영속 헤더만으로(`id`, `cwd`, `createdAt`만 사용하며 이벤트 본문은 절대 사용하지 않습니다) 이력을 부트스트랩하여 유효한 정규 cwd를 가진 세션을 디렉터리별 워크스페이스로 최신순으로 묶습니다. 초기화 마커는 마지막에 기록되므로 중단된 부트스트랩이 안전하게 재개됩니다. 부트스트랩은 일회성입니다. cwd가 없는 레거시 세션은 Ungrouped로 남고, 이후 생성된 세션은 `attachSession`을 통해서만 워크스페이스에 합류합니다.

## 기본 워크스페이스 초기화

컨트롤러의 `initializeDefault`는 요청을 받지 않습니다. 고정된 `default-workspace` 디렉터리 이름을 소유하고, Documents 위치를 해석하고, 레지스트리에 한 번 초기화를 요청합니다. 레지스트리는 디렉터리 리졸버를 받고, 초기 제목을 정규 경로가 아니라 요청된 디렉터리의 마지막 세그먼트에서 도출하고, 영속 식별자와 함께 등록을 커밋합니다. 어떤 언어도 호스트에 도달하지 않습니다. 브라우저 소비자는 그 자동 제목을 아직 지닌 워크스페이스를 컨트롤러의 `workspaceDisplayTitle`을 통해 표기하므로 화면에 보이는 이름만 독자의 언어를 따릅니다. [최초 사용 동작과 구성](../../packages/api/workspace-controller/README.md#first-use-workspace)이 재사용과 실패 처리를 설명합니다.

## 세션 고정

컨트롤러의 [전송 타입](../../packages/api/workspace-controller/src/types.ts)은 `WorkspacePinSessionRequest`와 `WorkspaceUnpinSessionRequest`를 정의하며, 각각 `sessionId` 하나를 담습니다. 두 작업 모두 `WorkspacePinValue`를 반환합니다. 즉 최근 고정순으로 정렬된 세션 id의 전체 `pinnedSessionIds` 배열입니다. 고정은 알려져 있고 보관되지 않은 세션을 요구하며, 고정되지 않은 id를 고정 해제하면 집합을 바꾸지 않고 성공합니다. 보관은 같은 영속 쓰기에서 세션의 고정을 제거하고, 보관 해제는 이를 복원하지 않습니다.

## 보관 허용

보관은 레지스트리 전역의 영속 집합이며, 레지스트리는 그 뒤에 실행 중인 작업을 숨기는 것을 거부합니다. 규칙은 패키지가 선언하고 디스패치하는 두 호스트 이벤트([이벤트](#workspace-events)) 위의 기능 seam입니다. `workspace/session-activity`(waterfall)는 구성된 제공자에게 세션에서 아직 실행 중인 것이 무엇인지 묻고, `workspace/session-stop`(parallel)은 중지를 요청합니다. 각 제공자는 다른 리스너처럼 루트에 등록하므로 패키지는 에이전트, 작업, 예약 어휘를 알지 못하며, 계열은 병합 확장 가능한 맵의 키입니다.

```ts type-equiv
/**
 * Activity families a `workspace/session-activity` listener may report. This
 * package declares none: each provider merges its own key from a module both
 * its Host and Client faces import, so a consumer that renders the families
 * sees exactly the keys its program compiled and falls through to a generic
 * description for any other. The shipped providers merge `turn` (the Agent
 * registry), `job` (the job registry seam), `subagent` (the Subagent
 * runtime), and `schedule` (the Schedule plugin).
 */
interface SessionActivityKindMap {}
```

`SessionActivityKind`는 `keyof SessionActivityKindMap`이므로 제공자를 컴파일하지 않은 프로그램은 키를 전혀 보지 못합니다. 배포되는 키는 클라이언트가 가져올 수 있는 타입 모듈에 있습니다. `turn`은 Agent 레지스트리의 `types.ts`, `job`은 job 레지스트리 seam의 `view.ts`, `subagent`는 Subagent 런타임의 `control-types.ts`, `schedule`은 Schedule 플러그인의 `types.ts`에 있습니다. 계열을 렌더링하는 소비자는 각 case에 그 모듈을 가져오고 다른 키를 위한 일반 줄을 유지합니다. 제공자는 `next()`의 결과 앞에 자신의 `SessionActivity` 항목을 붙여 워터폴에 응답하고, 레지스트리의 가장 안쪽 콜백은 빈 목록을 반환하므로 제공자가 없는 구성은 자유롭게 보관합니다.

```ts type-equiv
/**
 * One reason a session counts as active for archive admission. Families with
 * per-item identity list their items so a caller can name what must stop.
 */
interface SessionActivity {
  readonly kind: SessionActivityKind
  /** Active items of the family; absent for a family without per-item identity (`turn`). */
  readonly items?: readonly SessionActivityItem[]
}
```

`SessionActivityItem`은 계열별 `id`(세션, 작업, 예약 id)와 선택적 표시 `label`을 담습니다. `archiveSession(sessionId)`는 존재 확인 후 워터폴에 한 번 묻고, 비어 있지 않은 응답이면 아무것도 쓰지 않고 `WorkspaceActiveSessionError`(`sessionId`, `activity`)로 거부합니다. 컨트롤러는 이를 `workspace/session-active` 오류로 매핑하며, 그 세부 정보는 같은 두 필드를 담습니다. `archiveSession(sessionId, { stopActivity: true })`(전송 요청이 `stopActivity`로 노출하는 `ArchiveSessionOptions` 필드)는 검사를 건너뛰고 보관을 쓴 뒤 `workspace/session-stop`을 디스패치합니다. 거부하는 제공자는 로그에 남고 보관은 유지되며, 중지된 작업의 완료(settle)를 기다리지 않습니다. 이미 보관된 id는 묻지도 중지하지도 않습니다. 배포되는 제공자와 각자가 중지하는 것, 그리고 보관된 세션이 모델 단계를 실행하지 못하게 하는 `agent/pre-step` 게이트는 [레지스트리 패키지](../../packages/workspace/workspace/README.md#api-behavior)에 문서화되어 있으며, 결정 기록은 [보관이 실행 중 작업을 중지함 Agent Note](../../.agents/notes/implemented/feature/2026-09-21-archive-stops-running-session-work.md)입니다.

## 소비자

[`dsh-workspace-controller`](../../packages/api/workspace-controller)는 GUI 클라이언트에 `ctx.workspaceRegistry`를 통해 워크스페이스 CRUD를 제공하고, [`dsh-session-controller`](../../packages/api/session-controller)는 위의 세션 생성 후 연결 흐름을 수행합니다. [dsh-agent-instructions](../../packages/context/agent-instructions)는 이름과 달리 소비자가 **아닙니다**. 이는 에이전트 자체 cwd 아래에서 AGENTS.md 스타일 지시 파일을 찾아내며 `ctx.workspaceRegistry`를 전혀 건드리지 않습니다. 공유 단어는 이 레지스트리의 엔터티가 아니라 사용자의 작업 디렉터리를 가리킵니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxdirectorypickercontroller--directorypickercontroller"></a>

### `ctx.directoryPickerController` — `DirectoryPickerController`

Host service backing the generated `ctx.remote.directoryPicker` namespace. The seam it exports is abstract and therefore never a Loader entry of its own, so this controller carries the wire verbs: one composed backend serves either the native chooser or the browse primitives, and a verb the composition cannot serve is refused rather than approximated.

```ts cordis-catalog
/**
 * Open the host's OS chooser for a Remote caller.
 * @param signal - caller lifetime; abort terminates the chooser.
 * @returns the chosen absolute path, or null when the operator cancels.
 */
@Remote('pick') async pick(signal: AbortSignal): Promise<string | null>

/**
 * List one directory level for a Remote caller's in-app browser.
 * @param path - absolute directory to list; absent lists the home directory.
 * @param signal - caller lifetime; abort stops the backend's scan instead of
 *   letting it outlive a disconnected caller.
 * @returns the level's listing with its ancestry.
 */
@Remote('list') async list(path: string | undefined, signal: AbortSignal): Promise<DirectoryListing>

/**
 * Create one child directory for a Remote caller's in-app browser.
 * @param path - absolute existing parent directory.
 * @param name - single non-blank path segment.
 * @returns the created directory's absolute path.
 */
@Remote('createDirectory') async createDirectory(path: string, name: string): Promise<string>
```

Source: [`packages/api/workspace-controller/src/directory-picker.ts`](../../packages/api/workspace-controller/src/directory-picker.ts)

<a id="ctxterminalcontroller--terminalcontroller"></a>

### `ctx.terminalController` — `TerminalController`

Typed Remote control of transient Session-owned terminal processes.

```ts cordis-catalog
/**
 * Read the Session's current directory and terminal limits without filesystem validation or shell lookup.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns the logged current directory and terminal limits; retained terminals keep their own process directories.
 */
@Remote environment(agent: Agent, signal: AbortSignal): TerminalEnvironment

/**
 * Discover installed shells in the Session's execution environment.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns verified profiles, with the configured or system default first.
 */
@Remote shells(agent: Agent, signal: AbortSignal): Promise<TerminalShell[]>

/**
 * List retained terminals without resolving or activating an Agent.
 * @param sessionId - displayed Session identity, including offline history.
 * @returns terminals retained for this Host lifetime.
 */
@Remote list(sessionId: SessionId): WebTerminalInfo[]

/**
 * Allocate a user shell once for a caller-generated identity, without Agent sandbox or approval restrictions.
 * @param agent - Session owner supplied by the Gateway.
 * @param request - initial dimensions and idempotency identity.
 * @param signal - allocation cancellation; committed terminals survive disconnection.
 * @returns the existing or newly committed terminal.
 */
@Remote async create(agent: Agent, request: TerminalCreateRequest, signal: AbortSignal): Promise<WebTerminalInfo>

/**
 * Retain an existing terminal for a window without activating its Agent or taking input control.
 * @param sessionId - owning Session identity, including an inactive saved layout.
 * @param id - retained Host terminal identity.
 * @param signal - physical Remote stream cancellation.
 * @returns a hold acknowledgement followed by an open lifetime stream.
 */
@Remote({ mode: 'stream' }) retain(sessionId: SessionId, id: WebTerminalId, signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>

/**
 * Attach terminal input and output to one physical Remote stream.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param signal - attachment cancellation; the process remains alive and input is never replayed.
 * @returns screen recovery, output, writable state and provider-acceptance acknowledgements.
 */
@Remote({ mode: 'stream' }) attach(agent: Agent, id: WebTerminalId, signal: AbortSignal): RemoteStream<TerminalFrame, TerminalInput>

/**
 * Rename a terminal without changing its shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param title - nonempty display title, at most 120 characters.
 */
@Remote rename(agent: Agent, id: WebTerminalId, title: string): void

/**
 * Close an identity to future creation and kill its process range; repeated closes succeed.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @returns after provider cleanup succeeds. A failure retains the terminal for retry.
 */
@Remote async close(agent: Agent, id: WebTerminalId): Promise<void>
```

Types: [Agent](core.ko.md) · [RemoteStream](typert.ko.md) · [SessionId](core.ko.md)

Source: [`packages/api/terminal-controller/src/index.ts`](../../packages/api/terminal-controller/src/index.ts)

<a id="ctxworkspacecontroller--workspacecontroller"></a>

### `ctx.workspaceController` — `WorkspaceController`

Host service backing the generated `ctx.remote.workspace` namespace.

```ts cordis-catalog
/**
 * Create or idempotently resolve one Workspace over an existing directory.
 * @param request - directory path to register.
 * @returns the Workspace and whether this call created it.
 */
@Remote('create') create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>

/**
 * Initialize or reuse the default Workspace during first-use startup. The
 * directory name is fixed, so the Host never renames or relocates an
 * existing default; its initial title is that same name, which browser
 * consumers label in the reader's language.
 * @param signal - caller lifetime; cancels native directory lookup.
 * @returns the durable Workspace, or undefined when first-use initialization is ineligible; creates no Session or message.
 */
@Remote('initializeDefault') async initializeDefault(signal: AbortSignal): Promise<WorkspaceValue | undefined>

/**
 * Rename one Workspace to a unique non-blank title.
 * @param request - Workspace identity and proposed title.
 * @returns the updated Workspace projection.
 */
@Remote('rename') rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue>

/**
 * Remove one Workspace registration while retaining files and Sessions.
 * @param request - Workspace identity to remove.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>

/**
 * Move one Workspace within the registry display order.
 * @param request - moved Workspace and optional anchor.
 * @returns the complete resulting Workspace order.
 */
@Remote('insertBefore') insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue>

/**
 * Move one accounted Session within a Workspace.
 * @param request - Workspace, Session, and optional anchor identities.
 * @returns the updated Workspace projection.
 */
@Remote('insertSessionBefore') insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue>

/**
 * Hide one known Session from Workspace grouping surfaces.
 * @param request - Session identity to archive.
 * @returns the complete resulting archive set.
 */
@Remote('archiveSession') archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Restore one archived Session to Workspace grouping surfaces.
 * @param request - Session identity to unarchive.
 * @returns the complete resulting archive set.
 */
@Remote('unarchiveSession') unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Surface one known unarchived Session ahead of unpinned Sessions.
 * @param request - Session identity to pin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('pinSession') pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue>

/**
 * Remove one Session's pin without changing its saved Session order.
 * @param request - Session identity to unpin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('unpinSession') unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue>

/**
 * Stream a complete Workspace baseline followed by ordered increments. A
 * non-owner receives only the Workspaces and Sessions `allows()` admits.
 * When a delivered Workspace is no longer admitted at its next change or
 * the next order change, the stream sends a `replace` frame with the
 * complete filtered state instead of a `remove`, because a Client never
 * resurrects a removed Workspace; a `remove` frame reports a deletion and
 * reaches only a Client that received that Workspace.
 * @param signal - generation cancellation.
 * @returns baseline followed by ordered Workspace increments.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame>
```

Source: [`packages/api/workspace-controller/src/index.ts`](../../packages/api/workspace-controller/src/index.ts)

<a id="ctxworkspacefiles--workspacefiles"></a>

### `ctx.workspaceFiles` — `WorkspaceFiles`

Host Remote file reads and workspace directory observations over the composed filesystem.

```ts cordis-catalog
/**
 * Read one page of lines from a UTF-8 file readable by the filesystem backend.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the line window; omitted fields take the page defaults.
 * @param signal - caller cancellation.
 * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
 */
@Remote async read( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal, ): Promise<WorkspaceFileText>

/**
 * Read a complete regular file or one byte range without text decoding.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path, absolute or workspace-relative; relative to the base file's directory when provided.
 * @param options - optional base file and range; without a range the complete-file cap applies.
 * @param signal - caller cancellation.
 * @returns native bytes with the file's version and size at the preceding stat, byte offset, and EOF marker.
 */
@Remote async readBytes( workspaceFileScope: WorkspaceFileScope, path: string, options: WorkspaceByteReadOptions, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Report one regular file's identity, version, and size without its content.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, current version, and byte size.
 */
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>

/**
 * List the direct children of one directory inside the Session's workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - workspace path, absolute or relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the directory's children in the backend's stable name order, bounded by the entry cap.
 */
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>

/**
 * Watch one file or a directory's direct entries in the Session's filesystem.
 * Files use the backend's read authority; directories remain workspace-scoped.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - target path; the Host determines its type and confines directories to the workspace.
 * @param signal - generation cancellation.
 * @returns `ready` once the target watch is active, then current metadata for queued and live invalidations.
 * @throws RemoteError when watching is unavailable or a directory is outside the workspace.
 */
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>
```

Source: [`packages/api/workspace-files/src/index.ts`](../../packages/api/workspace-files/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The fully qualified
 * path is canonicalized through `fs.realpath`; a relative, nonexistent, or
 * non-directory path rejects. Repeated calls for the same canonical path
 * return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in a fully qualified path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Initialize the default Workspace only while both the registry and Session
 * history are empty. Repeated requests reuse its durable identity; deleting
 * that registration permanently disables automatic creation.
 * @param resolveDirectory - resolve the absolute directory; called only for
 * eligible creation, inside the registry mutation queue. Missing directories
 * are created recursively before registration, and the initial title is the
 * requested directory's own final segment — not the canonical one, so a
 * symlink at that path does not retitle the Workspace after its target.
 * After resolution, caller cancellation does not roll back creation or registration.
 * @returns the initialized Workspace, or undefined when automatic creation is ineligible.
 */
initializeDefault(resolveDirectory: () => Promise<string>): Promise<Workspace | undefined>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * Without `stopActivity` the session must also be inactive: the
 * `workspace/session-activity` waterfall is asked once, and any reported
 * activity rejects with {@link WorkspaceActiveSessionError} before anything
 * is written. With `stopActivity` the archive is written without an
 * activity check, and the `workspace/session-stop` providers are then asked
 * to stop the session's work: the durable archive set is what a provider's
 * `agent/pre-step` gate reads, so every wake the stops induce is already
 * blocked. Archiving drops the session's pin in the same durable write
 * (pinning and archival are mutually exclusive). An already archived id
 * resolves without writing, asking, or stopping.
 * @param sessionId - The session to archive.
 * @param options - Whether running work is stopped instead of refusing.
 * @returns resolution after durability and, with `stopActivity`, after every stop request was issued.
 */
archiveSession(sessionId: SessionId, options: ArchiveSessionOptions = {}): Promise<void>

/**
 * Unarchive one session durably by dropping it from the registry-global
 * archive set; the accounting slot was never touched, so the session
 * returns to its recorded position. Unarchiving runs no session-existence
 * check because removing an id cannot introduce an unknown one, so an
 * entry whose session is gone still resolves. An id that is not archived
 * resolves without writing.
 * @param sessionId - The session to unarchive.
 * @returns resolution after durability.
 */
unarchiveSession(sessionId: SessionId): Promise<void>

/**
 * Pin one session durably, prepending it to the registry-global pin set.
 * The session must exist (live or in session persistence) and must not be
 * archived. An already pinned id resolves without writing or reordering.
 * @param sessionId - The session to pin.
 * @returns resolution after durability.
 */
pinSession(sessionId: SessionId): Promise<void>

/**
 * Unpin one session durably by dropping it from the registry-global pin
 * set. Unpinning runs no session-existence check because removing an id
 * cannot introduce an unknown one, so an entry whose session is gone still
 * resolves. An id that is not pinned resolves without writing.
 * @param sessionId - The session to unpin.
 * @returns resolution after durability.
 */
unpinSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in a fully qualified spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.ko.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspace-events"></a>

### `workspace/*` events

<a id="workspacesession-activity--waterfall"></a>

#### `workspace/session-activity` — waterfall

Ask the composed providers what still runs for a session before it is archived. A listener prepends its own SessionActivity entries to the result of `next()`; the registry's innermost callback returns an empty list, so a composition without providers archives freely. Any non-empty result refuses the archive without a write.

```ts cordis-catalog
/**
 * Ask the composed providers what still runs for a session before it is
 * archived. A listener prepends its own {@link SessionActivity} entries to
 * the result of `next()`; the registry's innermost callback returns an
 * empty list, so a composition without providers archives freely. Any
 * non-empty result refuses the archive without a write.
 * @param request - the session about to be archived.
 * @param next - delegate to the remaining providers.
 * @mode waterfall
 */
'workspace/session-activity'( request: SessionActivityRequest, next: () => Promise<readonly SessionActivity[]>, ): Promise<readonly SessionActivity[]>
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspacesession-stop--parallel"></a>

#### `workspace/session-stop` — parallel

Stop a session's running work because the caller archived it with `stopActivity`; the archive set is durable when this dispatches. Each provider stops its own families — cancelling a turn, its subagent descendants, owned jobs, or active schedules — through the same cancel paths the user's own stop actions use, so the session log ends every open turn regularly and a later unarchive can continue the conversation. Listeners issue their stop requests without waiting for running work to settle; a listener may await its own durability barrier. A rejection is logged by the registry and does not undo the archive.

```ts cordis-catalog
/**
 * Stop a session's running work because the caller archived it with
 * `stopActivity`; the archive set is durable when this dispatches. Each
 * provider stops its own families — cancelling a turn, its subagent
 * descendants, owned jobs, or active schedules — through the same cancel
 * paths the user's own stop actions use, so the session log ends every
 * open turn regularly and a later unarchive can continue the
 * conversation. Listeners issue their stop requests without waiting for
 * running work to settle; a listener may await its own durability
 * barrier. A rejection is logged by the registry and does not undo the
 * archive.
 * @param request - the session being archived.
 * @mode parallel
 */
'workspace/session-stop'(request: SessionActivityRequest): Promise<void> | void
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED cordis-surface -->
