# Git 워크트리

[English](worktrees.md) | [中文](worktrees.zh.md) | 한국어

실험적인 [`dsh-experimental-worktree`](../../packages/experimental/worktree/README.md) 서비스가 `ctx.worktrees`를 제공합니다. 그 [`create_worktree`](../../packages/experimental/tool-worktree/README.md) 소비자가 새 Git 브랜치와 체크아웃을 만들고 [작업 디렉터리 서비스](working-directory.ko.md)를 통해 이를 선택합니다. [Git 워크트리 선택적 번들](../../packages/experimental/tool-worktree/README.md#use-this-package)이 GUI 플러그인 관리자를 통해 두 패키지를 로드합니다. 꺼진 상태로 배포되며, 명시적 조합도 두 패키지를 마운트할 수 있습니다.

## 생성과 보유

호출 세션의 현재 디렉터리가 원본 저장소를 선택합니다. 생성은 체크아웃을 할당하기 전에 요청된 로컬 커밋·브랜치·태그를 고정하며, 생략하면 `HEAD`를 선택합니다. 각 이름은 새 브랜치와 사용되지 않은 체크아웃 경로를 식별해야 합니다. 이 연산은 누락된 객체를 가져오지도, 스테이지된·스테이지되지 않은·추적되지 않은·무시된 파일을 원본 체크아웃에서 복사하지도 않습니다.

기본 대상은 `<current checkout root>/.agents/worktrees/<name>`입니다. `repositoryRoot`는 호출자의 현재 체크아웃 최상위 디렉터리이므로, 링크된 체크아웃은 자체 풀을 가집니다. 서비스는 할당이 구성된 풀 디렉터리를 만들 때만 `*`와 끝 개행을 담은 `.gitignore`를 씁니다. 기존 파일과 무시 규칙은 보존됩니다. 호출 세션의 기존 샌드박스 정책이 대상과 공유 Git 관리 디렉터리에 대한 쓰기를 허용해야 합니다. 작업 디렉터리 변경보다 성공적인 Git 설정이 앞섭니다.

`working_directory({ cd: path })`로 나가면 체크아웃과 브랜치가 유지됩니다. 취소나 실패도 부분 산출물을 남길 수 있으며, 오류가 그 위치를 알려 줍니다. 서비스는 디스포즈 시 대기 중인 연산을 중단하고 비웁니다. 구성과 Git 요구 사항은 [패키지 README](../../packages/experimental/worktree/README.md)가 소유합니다.

## 요청과 결과

요청은 새 이름과 로컬 리비전만 선택합니다. 결과는 생성된 체크아웃과 정확한 커밋을 식별하며, 세션의 원래 프로젝트나 쓰기 권한을 바꾸지 않습니다.

```ts type-equiv
/** A new checkout from a locally available Git commit, branch, or tag. */
interface CreateWorktreeRequest {
  /** New branch name, also used as the relative checkout directory; omission generates a name. */
  name?: string
  /** Local revision to resolve before creation; omission selects HEAD. */
  from?: string
}
```

```ts type-equiv
/** Committed Git baseline and the calling Session's resulting working directory. */
interface CreatedWorktree {
  /** Canonical absolute checkout directory in the filesystem provider's execution world. */
  path: string
  /** Newly created branch name. */
  branch: string
  /** Resolved commit object name; repository-local replacement refs can change its checked-out content. */
  baseCommit: string
  /** Canonical root of the source checkout. */
  repositoryRoot: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworktrees--worktreeservice"></a>

### `ctx.worktrees` — `WorktreeService`

Creates retained Git worktrees under the mounted filesystem and sandbox providers.

```ts cordis-catalog
/**
 * Create a fresh branch and checkout at a pinned local revision, then enter it.
 * Existing branches or checkout paths fail. Uncommitted files stay in the source checkout.
 * Checkout disables configured clean, smudge, and process filters without changing Git config.
 * Repository-local replacement refs still apply; baseCommit reports the resolved object name.
 * The new checkout becomes current only after Git setup succeeds. Failures may retain newly
 * allocated Git/filesystem artifacts; no branch or checkout is removed automatically.
 * @param agent - caller whose current directory selects the source repository and file policy.
 * @param request - optional new name and local revision; defaults are generated name and HEAD.
 * @param signal - cancellation of lookup, creation, and working-directory publication.
 * @returns canonical checkout path, branch name, pinned commit, and source repository root.
 */
async create(agent: Agent, request: CreateWorktreeRequest = {}, signal?: AbortSignal): Promise<CreatedWorktree>
```

Types: [Agent](core.ko.md)

Source: [`packages/experimental/worktree/src/index.ts`](../../packages/experimental/worktree/src/index.ts)
<!-- END GENERATED cordis-surface -->
