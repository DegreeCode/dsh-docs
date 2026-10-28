# 결과물

[English](deliverables.md) | [中文](deliverables.zh.md) | 한국어

턴이 사용자에게 넘기는 것으로, [결과물 패키지 그룹](../../packages/deliverables/README.md)이 소유합니다. 모델이 `present` 도구로 선언한 파일(로그 전용 세션 이벤트에 기록)과, 턴이 변경한 파일입니다. 후자는 턴 시작과 턴 끝에 찍은 git 작업 트리 스냅샷과, git이 다루지 않는 경로에 대해 각 파일 도구 편집 전후로 찍은 전체 파일 캡처에서 요약되며, 로그 전용 이벤트로 알려지고 세션이 살아 있는 동안 호스트 서비스가 각 나열 파일의 턴 시작·턴 끝 비교와 함께 제공합니다. 오직 클라이언트만 이를 읽으며, 웹 [결과물 플러그인](../../packages/client/ui-deliverables/README.md)이 턴 끝에 둘 다 렌더링합니다. 도구 동작, 스냅샷 메커니즘, 구성은 [`tool-present`](../../packages/deliverables/tool-present/README.md)와 [`workspace-changes`](../../packages/deliverables/workspace-changes/README.md)의 패키지 README에 있습니다.

출처: [`packages/deliverables/tool-present/src/types.ts`](../../packages/deliverables/tool-present/src/types.ts), [`packages/deliverables/workspace-changes/src/types.ts`](../../packages/deliverables/workspace-changes/src/types.ts)

## `PresentedFile` — 선언된 전달물 하나

```ts type-equiv
/** A declared filesystem file whose current contents remain at its source path. */
interface PresentedFile {
  /** Original absolute path or path relative to the Session working directory. */
  path: string
  /** Optional description supplied by the model. */
  description?: string
}
```

## `WorkspaceChangedFile` — 변경된 파일 하나

```ts type-equiv
/** One file changed during a turn, with line counts from git or from the whole-file captures around its file-tool edits. */
interface WorkspaceChangedFile {
  /** Path relative to the Session working directory, or an absolute Host path outside it. */
  path: string
  /**
   * Sort key and label: the relative path inside the working directory, a
   * `../` path for repository files above it, a `~` path under the home
   * directory, otherwise the absolute path. Always slash-separated.
   */
  display: string
  /** Lines added; zero for a binary or oversized file. */
  added: number
  /** Lines deleted; zero for a binary or oversized file. */
  deleted: number
  /** Present when git reported the file as binary, or when a captured side holds a NUL byte. */
  binary?: true
  /** Present when a captured side exceeded the plugin's `maxFileBytes`; the file is listed without counts or comparison. */
  oversized?: true
}
```

## `WorkspaceChangesSummary` — 한 턴의 변경 요약

```ts type-equiv
/** Files changed during one top-level turn, kept on the Host until its Session is disposed. */
interface WorkspaceChangesSummary {
  /** The turn whose file changes this summary describes. */
  turn: number
  /** The Session working directory `path` values are relative to. */
  cwd: string
  /** Changed files in `display` order, capped at the plugin's `maxFiles`. */
  files: WorkspaceChangedFile[]
  /** Complete changed-file count, including files omitted by the cap. */
  total: number
  /** Lines added over every changed file, including files omitted by the cap. */
  added: number
  /** Lines deleted over every changed file, including files omitted by the cap. */
  deleted: number
  /** Git tree ids of the turn-start and turn-end snapshots; absent when no snapshot was taken. */
  snapshot?: { before: string; after: string }
}
```

## `WorkspaceDiffHunk` — 통합 diff 헝크 하나

```ts type-equiv
/** One unified-diff hunk with three context lines; every line keeps its `+`, `-`, or space prefix. */
interface WorkspaceDiffHunk {
  /** First line of the hunk in the turn-start content, 1-based; a side without lines starts at 1 with zero lines. */
  oldStart: number
  /** Lines of the hunk taken from the turn-start content. */
  oldLines: number
  /** First line of the hunk in the turn-end content, 1-based; a side without lines starts at 1 with zero lines. */
  newStart: number
  /** Lines of the hunk taken from the turn-end content. */
  newLines: number
  /** Hunk body in order, each line prefixed with `+`, `-`, or a space. */
  lines: string[]
}
```

## `WorkspaceFileDiff` — 한 파일의 비교

```ts type-equiv
/** The comparison of one listed file's turn-start and turn-end contents, computed when asked for. */
type WorkspaceFileDiff =
  | {
    kind: 'text'
    /** The listed file's `path`. */
    path: string
    /** The listed file's `display`. */
    display: string
    /** Whether the file existed at turn start. */
    before: boolean
    /** Whether the file existed at turn end. */
    after: boolean
    /** Hunks in file order; empty when both sides hold the same lines. */
    hunks: WorkspaceDiffHunk[]
    /** True when the line comparison exceeded the plugin's `diffTimeoutMs` and every line is shown as replaced. */
    coarse: boolean
  }
  /** A side git reported as binary or that holds a NUL byte; no lines are served. */
  | { kind: 'binary'; path: string; display: string }
  /** A side larger than the plugin's `maxFileBytes`; no lines are served. */
  | { kind: 'oversized'; path: string; display: string }
```

## `WorkspaceChanges` — 요약과 비교를 제공하는 호스트 서비스

```ts type-equiv
/** Serves the summaries and file comparisons the recorder keeps for live Sessions. */
interface WorkspaceChanges {
  /**
   * The summary announced by one `workspace/changes` event.
   * @param sessionId - the Session that appended the event.
   * @param seq - the event's sequence number.
   * @returns the summary, or undefined once its Session was disposed or when this Host never recorded it.
   */
  summary(sessionId: SessionId, seq: number): WorkspaceChangesSummary | undefined
  /**
   * Compare one listed file's contents at turn start and turn end.
   * @param sessionId - the Session that appended the event.
   * @param seq - the event's sequence number.
   * @param index - the file's index in the summary's `files`.
   * @param signal - cancels the reads.
   * @returns the comparison, or undefined once its Session was disposed, when this Host never recorded it, or when no file has that index.
   * @throws when a snapshot read fails for a live Session.
   */
  diff(sessionId: SessionId, seq: number, index: number, signal: AbortSignal): Promise<WorkspaceFileDiff | undefined>
}
```

## 영속 이벤트와 제공되는 요약

`tool-present`는 `deliverables/presented: { turn; callId; files: PresentedFile[] }`를 `SessionEventMap`에 선언 병합하며, 성공한 최종 `present` 결과마다 한 번 추가됩니다. `workspace-changes`는 `workspace/changes: { turn }`를 병합하고 최상위 턴이 멈출 때 추가합니다. 그 이벤트가 알린 요약은 로그에 없지만 세션이 디스포즈될 때까지 그 이벤트의 시퀀스에 대해 `workspaceChanges.summary(sessionId, seq)`가 반환하므로, 호스트 재시작 후 다시 연 대화에는 이전 턴의 변경 파일 카드가 없습니다. `workspaceChanges.diff(sessionId, seq, index, signal)`은 같은 조건으로 나열된 파일 하나를 비교합니다. 같은 턴의 이후 이벤트는 이전 이벤트를 대체하므로 클라이언트는 최신 것만 유지합니다. 생성된 [영속성 카탈로그](../persistence-catalog.ko.md#deliverablespresented--log-only)가 두 선언 지점을 기록합니다. 어느 이벤트도 모델에 도달하지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkspacechanges--workspacechanges"></a>

### `ctx.workspaceChanges` — `WorkspaceChanges`

Serves the summaries and file comparisons the recorder keeps for live Sessions.

```ts cordis-catalog
/**
 * The summary announced by one `workspace/changes` event.
 * @param sessionId - the Session that appended the event.
 * @param seq - the event's sequence number.
 * @returns the summary, or undefined once its Session was disposed or when this Host never recorded it.
 */
summary(sessionId: SessionId, seq: number): WorkspaceChangesSummary | undefined

/**
 * Compare one listed file's contents at turn start and turn end.
 * @param sessionId - the Session that appended the event.
 * @param seq - the event's sequence number.
 * @param index - the file's index in the summary's `files`.
 * @param signal - cancels the reads.
 * @returns the comparison, or undefined once its Session was disposed, when this Host never recorded it, or when no file has that index.
 * @throws when a snapshot read fails for a live Session.
 */
diff(sessionId: SessionId, seq: number, index: number, signal: AbortSignal): Promise<WorkspaceFileDiff | undefined>
```

Types: [SessionId](core.ko.md)

Source: [`packages/deliverables/workspace-changes/src/types.ts`](../../packages/deliverables/workspace-changes/src/types.ts)
<!-- END GENERATED cordis-surface -->
