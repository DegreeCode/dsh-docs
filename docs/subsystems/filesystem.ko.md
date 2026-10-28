# 파일 시스템

[English](filesystem.md) | [中文](filesystem.zh.md) | 한국어

선택적 파일 시스템 기능은 네 부분으로 구성됩니다. [dsh-fs](../../packages/fs/fs)가 `ctx.fs`와 선택적 가드를 갖춘 원자적 텍스트 연산을 소유하고, [dsh-fs-local](../../packages/fs/fs-local)이 로컬 디스크를 구현하며, [dsh-fs-observation-policy](../../packages/fs/fs-observation-policy)가 관찰된 존재 또는 부재를 기록하고 서비스가 아니라 이벤트를 통해 최신성 규칙을 추가하고, [dsh-tool-fs](../../packages/fs/tool-fs)가 모델 대상 read/write/edit 호출을 직접 실행하고 창을 렌더링합니다. 이는 에이전트 루프 척추 밖에 있으며, 대체 백엔드는 정책이나 도구 스키마를 바꾸지 않습니다.

`dsh-fs-observation-policy`는 선택 사항입니다. 이것이 없으면 `FileSystem` 서비스 정의, 제공자, `dsh-tool-fs` 소비자가 제약 없는 완전한 파일 시스템 seam을 이룹니다. 즉 `write`는 무조건 생성하거나 덮어쓰고, `edit`는 무조건 리터럴 텍스트를 교체합니다. 정책 플러그인은 `fs/*` 워터폴을 결정해 이 연산들을 바꿉니다. 도구는 `ctx.fs`를 호출하고 이벤트를 디스패치할 뿐 정책 메서드를 호출하지 않으므로, 이것을 제거해도 도구가 깨지지 않습니다. `dsh-tool-fs`를 로드하는 배포는 기본 동작이 쓰기/편집 전 읽기가 되도록 `dsh-fs-observation-policy`도 함께 로드하는 것이 기대됩니다.

제공자 출처: [`packages/fs/fs/src/types.ts`](../../packages/fs/fs/src/types.ts)와 [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts). 정책 출처: [`packages/fs/fs-observation-policy/src/types.ts`](../../packages/fs/fs-observation-policy/src/types.ts). 읽기 렌더링 출처: [`packages/fs/tool-fs/src/read-render.ts`](../../packages/fs/tool-fs/src/read-render.ts).

## 대상 정체성과 메타데이터(제공자 계약)

모든 연산은 먼저 사용자가 제공한 경로를 불투명한 백엔드 대상으로 해석합니다. 소비자는 `displayPath`를 표시할 수 있지만, `targetKey`(브랜드가 붙은 불투명 id)를 파싱하거나 로컬 절대 경로라고 가정해서는 안 됩니다.

파일 시스템의 실행 세계를 공유하는 소비자는 그 정체성을 해석하는 대신 제공자를 통해 기능 간 좌표를 얻습니다. `processPath(target)`는 하위 프로세스가 열 수 있는 정규 절대 경로를 반환하고, `processPathFromHostPath(hostPath)`는 그 실행 세계가 공유할 때만 하네스 호스트의 절대 파일을 매핑하며, `fileUrl(target)`은 제공자 플랫폼의 `file:` URI를 반환하고, `contains(parent, child)`는 정규 정체성 또는 하위 포함 관계를 검사합니다.

```ts type-equiv
/**
 * A path resolved by a backend into a stable identity. `resolve()` produces
 * this; every other operation takes it.
 */
interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  targetKey: FsTargetKey
  /**
   * Path for model/UI-facing output. May be a local absolute path,
   * workspace-relative path, or remote URI depending on the backend.
   */
  displayPath: string
}
```

백엔드는 파일 버전 토큰, 즉 쓰기/편집이 가드하는 최신성 토큰을 소유합니다. 정책 플러그인이 오래된 상태 검사를 위해 이를 저장하며, 소비자는 이를 해석하지 않습니다. 두 id 모두 브랜드가 붙은 불투명 문자열입니다.

```ts type-equiv
/**
 * Opaque key for stale guards and target lookup. The local backend uses a
 * realpath-like string; a remote backend might use a workspace URI or file id.
 * Consumers MUST NOT parse it or assume it is a local absolute path.
 */
type FsTargetKey = Branded<'FsTargetKey'>
```

```ts type-equiv
/**
 * Opaque file-version token — the freshness token a write/edit guards against.
 * The local backend derives it from high-resolution stat identity and freshness
 * fields; a remote backend might use a revision id. The policy layer records it
 * for stale checks; consumers may display related metadata but MUST NOT
 * interpret this token.
 */
type FsVersion = Branded<'FsVersion'>
```

`stat`은 메타데이터를 반환하며(콘텐츠는 절대 반환하지 않습니다) 대상이 없으면 `undefined`를 반환합니다. `type`은 소비자가 읽기 전에 디렉터리와 특수 파일을 거부하게 하고, `size`는 텍스트 소비자가 실패로 탐색하지 않고 `readText`와 `streamText` 중 하나를 고르게 합니다. 텍스트 소비자는 `streamText`를 소비하면서 자체 보유 상한을 적용합니다. 원시 바이트 소비자는 `readBytes(target, signal, maxBytes)`를 사용하며, 필수인 완전 콘텐츠 상한 덕분에 알려졌거나 발견된 초과분이 자르거나 무제한 버퍼링하는 대신 `FS_TOO_LARGE`로 실패합니다.

```ts type-equiv
/**
 * Metadata about a target — what {@link FileSystem.stat} returns. Lets the
 * policy layer reject directories/special files before reading and choose
 * `readText` vs `streamText` from `size` without probing by failure. `version`
 * is the freshness token. `undefined` from `stat` means the target is absent.
 */
interface FsInfo {
  /** Opaque freshness token of the target right now. */
  version: FsVersion
  /** Whether the target is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

`lstat`은 경로 수준의 비추적(no-follow) 메타데이터 기본 연산입니다. `resolve`가 안정적인 정체성을 만들려고 의도적으로 심볼릭 링크를 따라가므로 `FsTarget` 대신 경로를 받습니다. 신뢰 경계 검사가 필요한 소비자는 먼저 `lstat`을 호출하고 해석 전에 `symlink`를 거부할 수 있습니다.

```ts type-equiv
/**
 * Metadata about a path without following the final path component when it is a
 * symbolic link. Unlike {@link FsInfo}, this path-level probe can report
 * `symlink` so consumers with trust-boundary rules can reject repository-owned
 * links before resolving a target.
 */
interface FsPathInfo {
  /** Opaque freshness token of the path entry right now. */
  version: FsVersion
  /** Whether the path entry is a regular file, directory, symlink, or other. */
  type: 'file' | 'directory' | 'symlink' | 'other'
  /** Byte size of the path entry, when the backend can report it. */
  size?: number
}
```

`listDir`은 안정적인 이름 순서로 직계 자식 항목을 반환합니다. 각 항목은 자식 기본 이름, 타입, 해석된 대상, 그리고 백엔드가 보고할 수 있을 때의 값싼 메타데이터를 담습니다. 파일 내용을 읽어서는 안 되므로 `size`는 일반 파일에만 해당하고 `version`은 메타데이터에서 파생됩니다. 깨졌거나 사라진 자식은 메타데이터 없이 `other`로 반환될 수 있으며, 자식 메타데이터를 나열하거나 해석하는 중의 권한 또는 백엔드 I/O 실패는 `FS_PERMISSION_DENIED`나 `FS_IO_ERROR`로 전체 나열을 실패시킵니다.

```ts type-equiv
/**
 * One direct child returned by {@link FileSystem.listDir}. Listing returns
 * metadata and resolved targets only; it must not read file contents.
 */
interface FsDirEntry {
  /** Basename of the child inside the listed directory. */
  name: string
  /** Whether the child is a regular file, a directory, or something else. */
  type: 'file' | 'directory' | 'other'
  /** Resolved child target for follow-up operations. */
  target: FsTarget
  /** Opaque freshness token when the backend can report metadata cheaply. */
  version?: FsVersion
  /** Byte size of a regular file, when the backend can report it. */
  size?: number
}
```

## 쓰기와 편집 가드(제공자 계약)

`writeText`와 `editText`는 모두 버전 가드를 선택적으로 받습니다. 무조건적인(베어 제공자) 변경에는 생략하고, 가드하려면 제공합니다. `writeText`의 가드는 `FsWriteIntent`입니다. `createIfAbsent`는 없는 대상을 생성하고 존재하는 대상은 `FS_NOT_OBSERVED`로 거부하며, 제공자의 최초 탐색 이후 나타난 대상도 포함됩니다. 게시 자체가 무교체여야 하기 때문입니다. `replaceIfVersion`은 대상이 관찰된 버전으로 존재할 때만 교체하고 아니면 `FS_STALE_VERSION`입니다. `expected`를 생략하면 무조건 생성하거나 덮어씁니다. 유니언 자체는 두 가드 의도만 담고, 가드 없음은 생략으로 표현되므로 쓰기와 편집 모두 같은 선택적 `expected` 필드를 사용합니다.

```ts type-equiv
/**
 * Guarded write intent. `createIfAbsent` rejects an existing target with
 * `FS_NOT_OBSERVED`; `replaceIfVersion` rejects absence or mismatch with
 * `FS_STALE_VERSION`. Omitting the intent from `writeText` means unconditional
 * create-or-overwrite, not a third union arm.
 */
type FsWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: FsVersion }
```

```ts type-equiv
/** Outcome of a full-file write. */
interface FsWriteOutcome {
  /** Whether the write created a new file or replaced an existing one. */
  operation: 'create' | 'update'
  /** Opaque version of the file after the write. */
  version: FsVersion
  /**
   * The file's content BEFORE the write, or `null` when the file did not exist
   * (a create) or the backend declined a contextual basis (for example, a
   * binary/non-UTF-8 prior file or either overwrite side reaching its exclusive limit).
   * LF-normalized storage text (the diff basis), never a diff — a consumer
   * computes the result-time contextual diff from `before`/`after` when
   * `before` is present, else falls back to a whole-file diff.
   */
  before: string | null
  /** The file's content AFTER the write, LF-normalized to share `before`'s diff basis. */
  after: string
}
```

`editText`는 다른 곳에서 `read`와 `write`를 조합한 것이 아니라 제공자 수준의 변경입니다. 가드되면 리터럴 일치 전에 예상 버전을 검증하므로 오래된 편집은 새 콘텐츠에 대한 불일치가 아니라 `FS_STALE_VERSION`을 보고하고, 가드되지 않으면 현재 콘텐츠를 편집합니다. 어느 쪽이든 교체를 적용하고 원자적으로 씁니다. 즉 일치, 줄바꿈 처리, 오래된 상태 검사, 원자적 교체를 하나의 변경 임계 구역 안에 유지하며, 대상이 없으면 두 경로 모두 `FS_STALE_VERSION`을 보고합니다.

```ts type-equiv
/** A literal-replacement edit request. */
interface FsEditRequest {
  /** Literal non-empty text to replace. Must match exactly (after line-ending normalization). */
  oldString: string
  /** Literal replacement text. An empty string deletes the matched text. */
  newString: string
  /** Replace every match instead of requiring exactly one. */
  replaceAll: boolean
}
```

```ts type-equiv
/** Outcome of a literal edit. */
interface FsEditOutcome {
  /** Opaque version of the file after the edit. */
  version: FsVersion
  /**
   * The file's content BEFORE the edit. Raw storage text (LF-normalized by the
   * backend), never a diff — a consumer computes the result-time contextual diff
   * (the applied hunk with context) from `before`/`after`.
   */
  before: string
  /** The file's content AFTER the edit. */
  after: string
}
```

## fs 정책 이벤트(제공자 계약 어휘)

`dsh-fs`는 도구가 디스패치하고 정책 플러그인이 수신하는 이벤트 세 개를 소유하므로, 이미터(`dsh-tool-fs`)와 리스너(`dsh-fs-observation-policy`)가 이미터가 정책 플러그인에 의존하지 않고 어휘를 공유합니다. 이들은 `dsh-fs` 어휘와 불투명한 `object` 행위자만 담습니다. 즉 모델 대상 개념도, 에이전트/세션 소유자 구조도 없습니다.

`fs/write-intent`와 `fs/edit-intent`는 **단일 슬롯 결정 워터폴**입니다. 도구가 각각을 `undefined`(베어 제공자)를 반환하는 기본 thunk와 함께 디스패치하고, 리스너는 `next()`를 호출하지 않고 완전히 결정합니다. 슬롯은 등록 순서상 선착순이며, 이를 소유하는 정책 플러그인은 강제되는 불변 조건이 아니라 배포 관례입니다. `fs/observed`는 `FsObservation`을 담는 발사 후 망각(fire-and-forget) 기록 이벤트입니다. 즉 어떤 버전으로 존재함 또는 부재 확인입니다. 일반 `ctx.emit`으로 디스패치되며, 그 리스너는 동기적이고 부수 효과만 있어야 합니다. 도구가 emit을 가드하지 않기 때문에, 예외를 던지는 리스너는 읽기 오류를 대체하거나 변경이 이미 성공한 뒤 도구의 `isError` 결과로 드러날 수 있습니다. 아래 생성된 [cordis 표면](#cordis-surface)이 정확한 시그니처를 보여 줍니다.

```ts type-equiv
/**
 * One authoritative observation of a target. A present observation carries the
 * version used by guarded replacement; an absent observation authorizes only a
 * guarded create, never an edit.
 */
type FsObservation =
  | { readonly kind: 'present'; readonly version: FsVersion }
  | { readonly kind: 'absent' }
```

## 실행 컨텍스트(정책 플러그인)

정책 플러그인은 `fs/*` 이벤트가 담는 불투명 `object` 행위자를 좁혀 관찰 상태 소유자를 도출할 만큼의 실행 컨텍스트만 필요로 합니다. `ToolExecution`에 필수 필드가 있으므로, `dsh-tool-fs`는 `dsh-fs-observation-policy`가 도구, 에이전트, 세션 패키지를 import하게 하지 않고 자신의 실행 객체를 행위자로 그대로 전달합니다.

```ts type-equiv
/**
 * Minimal structural view of a tool execution the policy plugin needs to derive
 * an observed-state owner. `@deepseek-ai/dsh-tools`' `ToolExecution` contains
 * these fields, so the tool passes its `exec` straight through as the opaque
 * `object` actor on the `fs/*` events; this plugin narrows that actor to
 * `FsObservationActor` without importing `dsh-tools`, `dsh-agent`, or `dsh-session`.
 *
 * The owner is `agent.session` when present. It is treated as an opaque object
 * identity (a `WeakMap` key); this package never reads any of its fields.
 */
interface FsObservationActor {
  /** The agent on whose behalf the call runs, when there is one. */
  agent?: {
    /** The session that owns observed-file state, used as an opaque key. */
    session?: object
  }
}
```

## 읽기 결과(소비자 / 읽기 렌더링)

텍스트 읽기는 줄 창, 바이트 상한, 백엔드 한도로 제한됩니다. 바이트 상한에 도달한 뒤에도 스캔은 더 이상 줄을 보유하지 않고 계속되므로 `totalLines`가 정확하게 유지됩니다. 모델 대상 `read` 도구가 렌더링하는 결과는 순수하게 표시용이며 `full`/`partial` 뷰가 없습니다. 권한 부여는 최신성 기반이므로(도구가 stat의 버전과 함께 존재 관찰 `fs/observed`를 직접 emit합니다), 어떤 창 읽기든 파일이 변경되지 않았을 때 이후 쓰기/편집을 승인할 수 있습니다. 메타데이터 미스는 도구가 `FS_NOT_FOUND`를 반환하기 전에 부재 관찰을 emit하므로, 이후 가드된 쓰기가 편집을 승인하지 않고 외부에서 삭제된 대상을 다시 만들 수 있습니다. 읽기를 소유한 실행기인 `dsh-tool-fs`가 읽기 창 처리를 구현하고 이 결과를 구성하며, 정책 플러그인은 그렇지 않습니다.

```ts type-equiv
/** Outcome of a bounded text read — what {@link formatReadOutput} renders. */
interface FileReadOutcome {
  /** 1-based first line requested. */
  offset: number
  /** Returned lines, already numbered. */
  lines: FileTextLine[]
  /** Exact total line count in the file. */
  totalLines: number
  /** Whether selected output hit the byte cap. */
  truncatedByBytes?: true
}
```

## 관찰된 파일 상태(정책 플러그인)

관찰 상태는 `dsh-fs-observation-policy` 플러그인 안에 있는 `WeakMap<owner, Map<targetKey, FsObservation>>`입니다. 맵 항목이 없으면 미확인을 뜻하고, `{ kind: 'absent' }`는 `read`나 `str_replace_editor`의 `view`, `str_replace`, `insert` 메타데이터 미스가 부재를 확인했음을 뜻하며, `{ kind: 'present', version }`은 읽기·쓰기·편집이 그 버전을 관찰했음을 뜻합니다. 쓰기 결정은 미확인과 부재를 `createIfAbsent`로 매핑하고 존재는 `replaceIfVersion`으로 매핑하며, 편집 결정은 미확인을 `FS_NOT_OBSERVED`로, 부재를 `FS_NOT_FOUND`로, 존재를 그 버전 가드로 매핑합니다. 소유자는 이벤트 행위자(보통 `exec.agent.session`)에서 도출되며 불투명하게 취급되고 절대 읽지 않습니다. 폐기하면 모든 것이 사라지고(HMR 안전성), 정책은 파일 시스템 I/O를 수행하지 않습니다.

## 오류 분류 체계(제공자 계약)

파일 시스템 실패는 `FsError`(`HarnessError`)가 담는 안정적인 `FsErrorCode` 문자열을 사용합니다. 도구 레지스트리는 오류 결과에 `{ name, code }`를 보존하므로, 재시도·권한·UI 계층이 텍스트를 파싱하지 않고 분기할 수 있습니다.

```ts type-equiv
/**
 * Stable, machine-routable codes for filesystem failures. Carried on
 * {@link FsError}; the tool registry exposes `{ name, code }` on `isError`
 * results so retry/permission/UI layers can branch without parsing messages.
 */
type FsErrorCode =
  | 'FS_NOT_FOUND'
  | 'FS_NOT_DIRECTORY'
  | 'FS_NOT_TEXT'
  | 'FS_NOT_REGULAR_FILE'
  | 'FS_TOO_LARGE'
  | 'FS_PERMISSION_DENIED'
  | 'FS_SANDBOX_DENIED'
  | 'FS_IO_ERROR'
  | 'FS_STALE_VERSION'
  | 'FS_NOT_OBSERVED'
  | 'FS_AMBIGUOUS_EDIT'
  | 'FS_EDIT_NOT_FOUND'
  | 'FS_ABORTED'
```

`FS_NOT_DIRECTORY`, `FS_PERMISSION_DENIED`, `FS_IO_ERROR`는 디렉터리 나열에서 기존 비디렉터리 대상, 거부된 나열, 예상치 못한 백엔드 I/O 실패를 구분하는 데 쓰입니다. `FS_SANDBOX_DENIED`는 샌드박스를 강제하는 백엔드(`dsh-fs-sandbox`)의 **정책** 거부이며(모드 펜스가 쓰기/편집을 거부), 호스트 커널이 거부하는 `FS_PERMISSION_DENIED`와 구분됩니다. `FS_NOT_OBSERVED`는 정책 플러그인에 이 소유자의 사전 관찰 기록이 없음을 뜻합니다(또는 `createIfAbsent`가 기존 파일을 만난 경우). `FS_NOT_FOUND`는 확인된 부재로 거부된 편집도 나타냅니다. `FS_STALE_VERSION`은 백엔드 버전이 더 이상 관찰된 버전과 일치하지 않음을 뜻합니다(또는 제공자 자체가 없는 대상에 대한 편집을 받은 경우). 최신성 권한 부여에는 부분/전체 구분이 없으므로 `FS_PARTIAL_OBSERVATION`은 없습니다.

## 파일 IO에는 타임아웃이 없습니다

`read`/`write`/`edit`는 `timeoutMs`를 받지 **않으며**, 제공자 계약은 데드라인을 두지 않습니다. [`@deepseek-ai/dsh-timeout`](../../packages/util/timeout/README.md)을 소비하는 bash·web과, 선언된 `timeoutMs`를 `@deepseek-ai/dsh-tool-call-timeout-policy`가 강제하는 하위 프로세스 기반 `glob`/`grep`과 다릅니다. 그것들은 프로세스 기반이라 데드라인이 실제로 작업을 죽일 수 있습니다. 로컬 시스템 호출은 기껏해야 최선 노력 중단이 가능할 뿐이므로, 타임아웃이 진행 중인 `fsync`/`rename`을 강제로 멈출 수 없습니다. 따라서 여기 `timeoutMs`는 seam이 강제할 수 없는 데드라인이 되며, 명시적 우선 원칙이 금지하는 바로 그 자리에 암묵적 기본값이 생깁니다. 취소는 여전히 도구 실행 신호를 통해 전파되어 시스템 호출 경계에서 최선 노력 중단을 제공합니다.

## 서비스와 플러그인

`FileSystem`(`ctx.fs`, 추상)은 제공자 기본 연산을 소유합니다. 즉 `resolve`, `processPath`, `processPathFromHostPath`, `fileUrl`, `contains`, `stat`, `lstat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText`, `editText`입니다. `dsh-fs-observation-policy`는 **서비스를 등록하지 않습니다**. `fs/*` 이벤트 게이트를 통해 정책을 추가하는 플러그인으로서, 미확인/부재/존재 상태에서 쓰기·편집 의도 워터폴을 결정하고 `FsObservation` 값을 기록합니다. 실행기는 `dsh-tool-fs`이며, `ctx.fs`를 통해 읽고 쓰고 편집하고, 워터폴을 디스패치하며, 기록 이벤트를 emit합니다. 아래 생성된 [`ctx.fs` 섹션](#ctxfs--filesystem-abstract-seam)이 정확한 시그니처를 보여 줍니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxfs--filesystem-abstract-seam"></a>

### `ctx.fs` — `FileSystem` (abstract seam)

Abstract filesystem provider. Targets must preserve identity across aliases; reads expose regular UTF-8 text or typed errors, listings are stable and content-free, and mutations are atomic. Optional guards add stale protection without changing the unguarded provider contract.

```ts cordis-catalog
/**
 * Observe one file or a directory's direct entries in this provider's execution world.
 * @param target - resolved file or directory, including an absent path to observe for creation.
 * @param changed - invalidation callback; errors can be reported during or after initialization.
 * @param signal - cancels watcher initialization; the caller closes an initialized watcher.
 * @returns a promise resolving once observation is active, with an asynchronous close function.
 * @throws when the provider does not support watching or cannot initialize the watcher.
 */
watch(target: FsTarget, changed: (error?: Error) => void, signal: AbortSignal): Promise<() => Promise<void>>

/**
 * Resolve a model/plugin-supplied path into a stable {@link FsTarget}. May perform I/O (a
 * remote/sandboxed backend may need a round-trip to map a path to a stable identity), hence
 * async even though the local backend only normalizes + realpaths.
 *
 * @param path - the path to resolve; relative paths resolve against `opts.cwd`.
 * @param opts - optional cwd override and cancellation signal.
 * @returns the stable target; the same file yields the same `targetKey`.
 */
abstract resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget>

/**
 * Return the canonical absolute path a subprocess in this filesystem's
 * execution world can open. The path is deliberately separate from
 * {@link FsTarget.targetKey}: consumers may pass this value to another OS
 * capability, but must continue treating the target key as opaque.
 * @param target - the resolved target whose process path is required.
 * @returns an absolute path in the backend's execution world.
 */
abstract processPath(target: FsTarget): string

/**
 * Map an absolute path from the harness host into this filesystem's
 * execution world when both paths identify the same file. The base provider
 * exposes no mapping; host-backed or explicitly shared backends override it.
 * @param hostPath - absolute path in the harness host filesystem.
 * @returns the process path for the same file, or undefined when this
 *   execution world cannot read that host file.
 */
processPathFromHostPath(hostPath: string): string | undefined

/**
 * Return the canonical `file:` URI for a target in this filesystem's
 * execution world. Backends own URI encoding because the host platform may
 * differ from the execution platform.
 * @param target - the resolved target to encode.
 * @returns the target's canonical file URI.
 */
abstract fileUrl(target: FsTarget): string

/**
 * Test canonical containment without exposing or parsing backend target
 * keys. Both targets must come from this provider.
 * @param parent - canonical directory target.
 * @param child - canonical candidate target.
 * @returns true when `child` is `parent` or a descendant of it.
 */
abstract contains(parent: FsTarget, child: FsTarget): boolean

/**
 * Return target metadata, or `undefined` when the target does not exist.
 * @param target - the resolved target to stat.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent target.
 */
abstract stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>

/**
 * Return path metadata without following the final path component when it is a
 * symbolic link. This is intentionally path-shaped, not target-shaped:
 * {@link resolve} follows symlinks to produce the stable identity used by
 * normal reads/writes, while `lstat` lets a consumer reject the path itself
 * before that follow happens.
 *
 * `opts.cwd` follows {@link resolve}'s cwd rules. `undefined` means the path is
 * absent.
 * @param path - the path to inspect; relative paths resolve against `opts.cwd`.
 * @param opts - `cwd` overrides the backend's default base for relative paths.
 * @param signal - aborts the metadata round-trip.
 * @returns metadata only, never content; undefined for an absent path.
 */
abstract lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined>

/**
 * Read the whole regular text file as a single decoded string.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @returns the full decoded UTF-8 content.
 */
abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>

/**
 * Stream the whole regular text file as decoded text chunks (same text
 * semantics as {@link readText}, for large files). The backend owns
 * cross-chunk UTF-8 decoding and binary rejection so the policy layer never
 * touches raw bytes.
 * @param target - the resolved target to read.
 * @param signal - aborts the stream, including between chunks.
 * @returns the chunk iterable, decoded and validated like {@link readText}.
 */
abstract streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>

/**
 * Read the whole regular file as raw bytes with no decoding or binary
 * rejection. The bound lives at this seam so a backend can never buffer an
 * unbounded file: a target known or discovered to exceed `maxBytes` fails
 * with `FS_TOO_LARGE` instead of returning a truncated result.
 * @param target - the resolved target to read.
 * @param signal - aborts the read.
 * @param maxBytes - inclusive byte cap on the complete content.
 * @returns the full raw content, at most `maxBytes` long.
 */
abstract readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>

/**
 * Read one byte window of the regular file as raw bytes with no decoding or
 * binary rejection: the bytes at `[offset, offset + length)`, shorter when
 * the file ends inside the window and empty when `offset` lies at or past
 * its end. The window is the bound here, not the file: a backend transfers
 * at most `length` bytes of content beyond the prefix it skips to reach
 * `offset` and never buffers the whole file, so the caller's cap on `length`
 * is the guard against unbounded buffering.
 * @param target - the resolved target to read.
 * @param range - `offset`, the 0-based first byte, and `length`, the largest byte count; both non-negative integers.
 * @param signal - aborts the read.
 * @returns the window's bytes, at most `length` long.
 */
abstract readByteRange(target: FsTarget, range: { offset: number; length: number }, signal?: AbortSignal): Promise<Uint8Array>

/**
 * List direct children of a directory in stable name order. Returns resolved
 * child targets plus cheap metadata only; never reads file contents.
 * @param target - the resolved directory target.
 * @param signal - aborts the listing.
 * @returns one entry per direct child, in stable name order.
 */
abstract listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>

/**
 * Atomically create or replace UTF-8 text. `expected` guards intent and
 * staleness; omission allows unconditional overwrite.
 * @param target - the resolved target to write.
 * @param content - the full new file content.
 * @param expected - the write intent guarding the write; omit for unconditional.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this write
 *   runs under; a sandboxing backend fences the write by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the write produced.
 */
abstract writeText( target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsWriteOutcome>

/**
 * Atomically edit literal text. When supplied, the version guard is checked
 * before matching so stale content reports `FS_STALE_VERSION`; omission edits
 * the current content without a freshness precondition.
 * @param target - the resolved target to edit.
 * @param edit - the literal search/replace request.
 * @param expected - the version guard; omit for an unconditional edit.
 * @param signal - aborts before atomic publication takes effect.
 * @param sandboxPolicy - the per-call mode and workspace root this edit runs
 *   under; a sandboxing backend fences the edit by it, the bare backend
 *   ignores it. Omit to leave the backend its own default.
 * @returns the outcome, including the version the edit produced.
 */
abstract editText( target: FsTarget, edit: FsEditRequest, expected?: { version: FsVersion }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy, ): Promise<FsEditOutcome>
```

Types: [SandboxExecutionPolicy](sandbox.ko.md)

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fs-events"></a>

### `fs/*` events

<a id="fsedit-intent--waterfall"></a>

#### `fs/edit-intent` — waterfall

Single-slot decision for the next FileSystem.editText. Calling `next()` yields an unconditional edit; the first returned guard wins.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.editText}. Calling
 * `next()` yields an unconditional edit; the first returned guard wins.
 * @param target - the resolved target about to be edited.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/edit-intent'(target: FsTarget, actor: object | undefined, next: () => { version: FsVersion } | undefined | Promise<{ version: FsVersion } | undefined>): Promise<{ version: FsVersion } | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fsobserved--emit"></a>

#### `fs/observed` — emit

Record an authoritative positive or negative observation. Listeners must be synchronous recorders: throws fail the tool call and returned promises are not awaited.

```ts cordis-catalog
/**
 * Record an authoritative positive or negative observation. Listeners must
 * be synchronous recorders: throws fail the tool call and returned promises
 * are not awaited.
 * @param target - the target whose presence or absence was observed.
 * @param observation - present with its version, or confirmed absent.
 * @param actor - the observing tool-execution context; undefined records nothing useful.
 * @mode emit
 */
'fs/observed'(target: FsTarget, observation: FsObservation, actor: object | undefined): void
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)

<a id="fswrite-intent--waterfall"></a>

#### `fs/write-intent` — waterfall

Single-slot decision for the next FileSystem.writeText. Calling `next()` yields the bare provider's unconditional write; the first listener that returns an intent owns the decision rather than composing with peers.

```ts cordis-catalog
/**
 * Single-slot decision for the next {@link FileSystem.writeText}. Calling
 * `next()` yields the bare provider's unconditional write; the first listener
 * that returns an intent owns the decision rather than composing with peers.
 * @param target - the resolved target about to be written.
 * @param actor - the opaque tool-execution context the decider keys off.
 * @mode waterfall
 */
'fs/write-intent'(target: FsTarget, actor: object | undefined, next: () => FsWriteIntent | undefined | Promise<FsWriteIntent | undefined>): Promise<FsWriteIntent | undefined>
```

Source: [`packages/fs/fs/src/index.ts`](../../packages/fs/fs/src/index.ts)
<!-- END GENERATED cordis-surface -->
