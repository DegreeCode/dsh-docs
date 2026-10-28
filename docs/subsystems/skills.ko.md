# 스킬

[English](skills.md) | [中文](skills.zh.md) | 한국어

[스킬 기능 패밀리](../../packages/skill)는 서비스 정의([dsh-skill](../../packages/skill/skill), `ctx.skills`), 로컬 서비스 제공자([dsh-skill-filesystem](../../packages/skill/skill-filesystem)), 선택적 패키지 제공자([dsh-skill-badge](../../packages/experimental/skill-badge), [dsh-skill-office](../../packages/skill/skill-office), 그리고 [dsh-sandbox-windows-acl](../../packages/sandbox/sandbox-windows-acl)의 Windows ACL 진단 제공자), 소비자([dsh-tool-skill](../../packages/skill/tool-skill))를 포함합니다. 레지스트리는 호스트 계층과 범위별 계층에 걸쳐 제공자 카탈로그를 병합하고, 제공자는 로컬 또는 패키지 스킬을 기여하며, 소비자는 최초 및 교체 카탈로그와 모델 대상 `skill` 도구를 소유합니다. 스킬은 선택적 지침이며 세션 이벤트가 아니므로, 그 어휘는 [core.md](core.ko.md)가 아니라 이곳에 있습니다.

출처: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts), [`packages/skill/skill-filesystem/src/index.ts`](../../packages/skill/skill-filesystem/src/index.ts), [`packages/experimental/skill-badge/src/index.ts`](../../packages/experimental/skill-badge/src/index.ts), [`packages/skill/skill-office/src/index.ts`](../../packages/skill/skill-office/src/index.ts), [`packages/sandbox/sandbox-windows-acl/src/acl-skill.ts`](../../packages/sandbox/sandbox-windows-acl/src/acl-skill.ts), [`packages/skill/tool-skill/src/index.ts`](../../packages/skill/tool-skill/src/index.ts).

## 제공자 레지스트리

`ctx.skills`는 로컬, 내장, 원격 또는 기타 제공자를 결합합니다. 등록은 동기적이며, 원격 초기화와 탐색은 대기하는 `list()`에 속합니다. 제공자 객체, 옵션, 후보는 읽기 전용으로 빌려오며, 시맨틱 필드는 검증됩니다.

레지스트리는 호스트+범위별 계층 구조이며, [도구 레지스트리](tools.ko.md)가 [dsh-scope](../../packages/core/scope) 위에 세운 형태입니다. 즉 등록은 호출 컨텍스트 범위의 계층으로 들어가므로 호스트 행과 저장소 플러그인은 전역 계층에, 에이전트 프리셋의 상설 구성이 마운트한 플러그인은 그 프리셋의 계층에 들어가며, 제공자 이름은 프로세스 전역이 아니라 계층별로 고유합니다. 읽기는 전역 계층과 보는 범위의 체인을 병합합니다. 즉 가장 가까운 계층의 항목이 중복 스킬 이름을 완전히 이기고, 아래 순위 규칙은 한 계층 안에서만 중복을 결정합니다. 탐색 캐시는 해석된 범위 체인으로 키잉되므로, 범위를 다시 부모에 붙이는 것(빈 세션 재구성)이 레지스트리 변경 없이 다음 읽기에 보입니다.

한 계층 안에서 중복 이름은 순위, 제공자 순서, 로컬 순서로 해석되고, 요약은 이름으로 정렬됩니다. 거부된 `list()`는 기록되고 불완전 관찰에서 생략되며, 명시적 불완전 관찰은 사용 가능한 후보를 기여하되 결과를 캐시 가능하게 만들지는 않습니다. 잘못된 후보는 즉시 실패합니다. 각 제공자 팩토리는 등록 범위 제어를 받는데, 그 `invalidate()`는 정확히 그 등록이 활성인 동안에만 완료된 카탈로그를 지우고 그 signal은 등록 실패나 폐기 시 중단됩니다. 진행 중인 탐색은 제공자 세대가 바뀌면 한 번 재시도하고, 두 번째 변경은 최신 후보를 불완전하고 캐시되지 않은 채로 반환합니다. 제공자와 런타임 변경은 필터링되지 않은 `skills/change` 무효화 이벤트를 emit하며, 이는 diff를 담지 않으므로 소비자는 자신의 조회 옵션으로 `snapshot()`을 다시 가져옵니다.

`SkillProvider.list()`가 반환한 배열은 완전 탐색 축약형입니다. `SkillProviderObservation`은 제공자가 직접 로드 가능한 후보를 노출하면서 그 관찰이 권위 있지 않음을 보고하게 합니다.

```ts type-equiv
/** Provider candidates plus whether the current discovery is authoritative. */
interface SkillProviderObservation {
  /** Candidates available from the current provider discovery. */
  readonly candidates: readonly SkillCandidate[]
  /** Whether discovery completed and these candidates may be cached. */
  readonly complete: boolean
}
```

```ts type-equiv
/** Provider interface for one source of skills, such as local directories or a remote registry. */
interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string
  /**
   * List available skill candidates for the current lookup context. Provider
   * plugins register synchronously during `apply()`; remote initialization,
   * authentication, and discovery are awaited inside this method. Implementations
   * should settle promptly when `options.signal` aborts.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns provider candidates as a complete-array shorthand, or an explicit
   *   observation when usable candidates came from incomplete discovery.
   */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>
  /**
   * Load a complete skill body for a previously listed candidate.
   * @param candidate - the winning candidate originally returned by this provider.
   * @param options - lookup options; `cwd` selects workspace-sensitive skills and `signal` cancels work.
   * @returns the full skill body, or `undefined` if it is no longer loadable.
   */
  readonly get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>
}
```

```ts type-equiv
/** Registration-scoped lifecycle and invalidation capability borrowed by one provider. */
interface SkillProviderControl {
  /** Aborts if registration fails or when the exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Invalidate completed catalogs and notify consumers only while the exact registration remains active. */
  readonly invalidate: () => void
}
```

## 로컬 탐색 우선순위

배포되는 로컬 제공자는 순위 순서로 루트를 스캔합니다:

| 순위 | 소스 | 루트 |
|---|---|---|
| 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
| 200 | `project-agents` | `<projectRoot>/.agents/skills` |
| 300 | `custom` | `Config.customSkillDirs` |
| 400 | `user-dsh` | `<dshHome>/skills` |
| 500 | `user-agents` | `<agentsHome>/skills` |
| 600 | `bundled` | 구성된 경우 `Config.bundledSkillDir` |

프로젝트 루트는 `.git`을 담은 가장 가까운 상위입니다. 없으면 현재 cwd를 사용합니다. `ctx.fs`를 사용할 수 있으면 git 루트 탐색이 파일 시스템 서비스를 통해 `.git`을 탐색하므로 원격이나 샌드박스 워크스페이스가 호스트 파일 시스템 경계로 폴백하지 않습니다. 사용자 DSH 루트는 `.system` 자식을 건너뜁니다. 로컬 제공자는 내장 시스템 스킬을 합성하지 않으며, 배포가 구성된 번들 루트나 전용 제공자를 통해 패키지 스킬을 공급합니다.

`dsh-skill-badge`는 `BUNDLED_SKILL_RANK`에 불변 `bundled` 후보 하나를 등록하고 `resourceBase`를 통해 자신의 패키지 자산 디렉터리를 노출합니다. 배포되는 CLI는 그 플러그인을 비활성으로 선언하므로, 그 구성 행을 켜는 것이 명시적 옵트인입니다.

Chokidar는 기존 루트에서 직접 번들/플랫 엔트리 추가·제거와 직접 스킬 엔트리 변경을 감시합니다. 없는 루트는 가장 가까운 기존 상위에서 Chokidar가 붙을 수 있을 때까지 부재 경로 세그먼트를 하나씩 따라갑니다. 번들 아래 리소스 파일은 카탈로그 변경이 아닙니다. 모델 대상 `write`와 `edit` 관찰은 대상이 카탈로그 관련이면 제공자를 동기적으로 무효화하고, 호스트 감시자는 IDE, Git, 셸, 외부 프로세스 변경을 담당합니다. 감시자 실패는 직접 로드에서 읽을 수 있는 후보를 숨기지 않으면서 현재 관찰을 불완전하게 만듭니다. 프로젝트 범위 감시자는 구성된 유한 LRU를 사용합니다.

## 스킬 정체성

스킬 이름은 케밥 케이스(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)입니다. 로컬 제공자는 디렉터리 번들(`<name>/SKILL.md`)과 플랫 Markdown 파일(`<name>.md`)을 받습니다. 중첩 재귀 `**/SKILL.md` 탐색은 지원되지 않습니다.

```ts type-equiv
/** Origin bucket for a skill contribution. The value is prompt-visible metadata, not precedence by itself. */
type SkillSource = 'project-dsh' | 'project-agents' | 'runtime' | 'user-dsh' | 'user-agents' | 'custom' | 'bundled' | (string & {})
```

## 요약, 후보, 완전 정의

`SkillSummary`는 레지스트리의 호출 중립 요약 형태입니다. 소비자는 어떤 항목과 필드를 렌더링할지 고르며, 모델 세션 카탈로그는 모델 호출 가능한 `name`과 `description`만 사용하고 본문이나 절대 파일 경로는 절대 쓰지 않습니다. `SkillInvocationPolicy`는 두 독립 호출 제어를 양의 불리언으로 정규화하며, 해석된 모든 요약·후보·정의가 이를 담되 임의의 frontmatter를 도메인 모델로 바꾸지는 않습니다.

```ts type-equiv
/** Invocation controls shared by skill discovery consumers. */
interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean
}
```

```ts type-equiv
/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
interface SkillSummary {
  /** Absolute instruction file path when supplied by the provider; absent for virtual skills. */
  readonly path?: string
  /** Kebab-case identifier used to address the skill. */
  readonly name: string
  /** Short routing description shown by discovery consumers. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy
  /** Discovery source that produced this winning skill. */
  readonly source: SkillSource
  /** Provider that owns this skill body. */
  readonly provider: string
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase
}
```

`ctx.skills.list()`는 네 가지 정책 조합을 모두 보존합니다. `isModelInvocable(skill)`과 `isUserInvocable(skill)`은 대응하는 필수 필드를 읽습니다. 모델 전용 스킬은 `{ modelInvocable: true, userInvocable: false }`를, 사용자 전용 스킬은 `{ modelInvocable: false, userInvocable: true }`를 설정하며, 두 필드를 모두 `false`로 두면 신뢰된 `ctx.skills.get()` 호출자를 통해서만 그 스킬을 사용할 수 있습니다. 로컬 제공자는 정확한 케밥 케이스 frontmatter 키 `disable-model-invocation`과 `user-invocable`을 읽고, 생략된 필드는 `true`로 기본값을 두며, 파싱한 모든 스킬을 이 정규화 정책으로 투영합니다.

`SkillCatalogSnapshot`은 권위 있는 부재와 일시적 제공자 실패 또는 탐색 중 계속 바뀐 카탈로그를 구분합니다. `skills`는 그 관찰에서 수집된 정렬된 호출 중립 요약을 담고, `complete`는 등록된 모든 제공자가 동시 카탈로그 개정 없이 완료했을 때만 true입니다. 불완전 스냅샷은 캐시되지 않으므로, 각 소비자가 마지막 정상 필터링 카탈로그를 유지하고 재시도할 수 있습니다.

```ts type-equiv
/** One catalog observation plus whether discovery completed within a stable catalog revision. */
interface SkillCatalogSnapshot {
  /** Sorted invocation-neutral summaries collected in this observation. */
  readonly skills: SkillSummary[]
  /** Whether every registered provider completed without a concurrent catalog revision. */
  readonly complete: boolean
}
```

`SkillCandidate`는 제공자에서 레지스트리로 가는 형태입니다. `locator`는 불투명 제공자 상태이며, 레지스트리는 이를 저장만 하고 승리한 제공자의 `get()`에 돌려줍니다.

```ts type-equiv
/** Provider catalog entry used by the registry to merge and later load skills. */
interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names before provider registration order is considered. */
  readonly rank: number
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

`SkillDefinition`은 `ctx.skills.get()`이 반환하고 `skill` 도구가 사용하는 완전한 파싱 결과입니다. `resourceBase`는 로컬, URL, 제공자 관리 스킬에 대해 도구가 상대 리소스 안내를 렌더링하는 방법을 알려 줍니다.

```ts type-equiv
/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
type SkillResourceBase =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'opaque'; readonly description: string }
```

```ts type-equiv
/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after any provider-specific metadata removal. */
  readonly content: string
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>
}
```

런타임 스킬 입력은 호출 제어와 제공자 레이블을 생략할 수 있습니다. 레지스트리는 두 기본값을 한 번 해석한 뒤 제공자와 같은 완전 정의 형태와 선착순 수집 순서를 사용합니다. 반환된 disposer는 기여를 제거하고 탐색 캐시를 무효화합니다.

```ts type-equiv
/** Runtime skill contribution accepted by `ctx.skills.register()`. */
type SkillRegistration = Omit<SkillDefinition, 'invocation' | 'provider'> & {
  /** Invocation controls; omission permits both model and user surfaces. */
  readonly invocation?: SkillInvocationPolicy
  /** Provider label; omission uses the registry-owned runtime provider. */
  readonly provider?: string
}
```

## 조회와 구성

스킬 조회는 제공자가 워크스페이스 로컬 스킬을 노출할 수 있으므로 cwd에 민감하며, 그 선택적 signal은 호출자를 위해 제공자 작업을 취소합니다. 레지스트리 읽기는 추가로 보는 범위를 받으며(소비자는 자신이 곧 범위 키인 호출 에이전트를 전달합니다), `SkillViewOptions`를 통해 전달합니다. 레지스트리는 계층 선택에 `scope`를 소비하고, 제공자는 같은 빌려온 옵션 객체에서 자신의 `SkillLookupOptions` 계약만 읽습니다. 취소는 카탈로그 선택 전후에 확인되며 캐시 적중도 포함하고, 탐색과 완전 정의 로딩 모두와 경쟁합니다. git 루트를 찾지 못하면 로컬 제공자는 공급된 cwd 자체를 프로젝트 루트로 취급합니다.

완전 정의는 레지스트리가 캐시하지 않습니다. 각 `get()`은 선택된 후보로 승리한 제공자를 호출하므로 로컬 제공자는 현재 본문을 다시 읽습니다. 이름이 더 이상 그 후보와 일치하지 않는 정의는 거부되고 정확히 그 제공자를 재탐색을 위해 무효화합니다.

```ts type-equiv
/** Caller context used for cwd-sensitive and abortable provider work. */
interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined
}
```

```ts type-equiv
/**
 * Registry read options: provider lookup context plus the viewing scope.
 * The registry consumes `scope` to select layers; providers receive the same
 * borrowed options object and read only their {@link SkillLookupOptions}
 * contract from it.
 */
interface SkillViewOptions extends SkillLookupOptions {
  /** Viewing scope (the calling agent); omitted reads the global layer alone. */
  readonly scope?: ScopeKey | undefined
}
```

레지스트리는 자신의 탐색 캐시 한도만 소유합니다. 로컬 제공자는 파일 시스템 루트(`dshHome`, `agentsHome`, `customSkillDirs`, 선택적 `bundledSkillDir`/`DSH_BUNDLED_SKILL_DIR`)와 감시자 활성화, 폴링, 안정성, 심볼릭 링크, 프로젝트 용량 제어를 소유합니다. 소비자는 자신의 카탈로그 설명 한도를 소유합니다. 정확한 기본값과 검증은 생성된 [구성 카탈로그](../config-catalog.ko.md)에 있습니다.

```ts type-equiv
/** Skill registry configuration. */
interface Config {
  /** Maximum number of completed cwd/provider catalogs kept in memory. */
  readonly collectCacheMaxEntries?: number
}
```

## 세션 카탈로그와 도구 계약

`dsh-tool-skill`은 비어 있지 않은 완전 뷰를 관찰한 라이브 세션의 첫 `agent/pre-step`에서 최초 영속 user 역할 `<system-reminder>`를 주입합니다. 카탈로그는 정렬된 스킬 `name`과 정규화되어 XML 이스케이프된 `description`만 담고, 본문, 경로, 소스, 제공자, 라우팅 힌트는 생략합니다. 탐색은 단계의 중단 signal을 `SkillLookupOptions`를 통해 전달합니다. `catalogDescriptionMaxLength`는 설명 한도에 대한 소비자 구성이며 기본값은 `500`, 정수 최솟값은 `3`입니다.

이후 모델 단계 전마다 소비자는 정확한 도구 가시성을 적용하고, 완전 스냅샷의 `<available_skills>` 태그 사이에 있는 정확한 렌더링 항목을 다이제스트합니다. 비교 기준선은 플러그인이 소스인 가장 최신의 인식 가능한 가시 카탈로그 메시지에 있는 같은 항목에서 도출합니다. 다이제스트가 바뀌면 `agent.inject()`를 통해 영속 완전 교체를 덧붙이고, 모든 스킬을 삭제하면 명시적 빈 교체를 덧붙입니다. 불완전 스냅샷은 마지막 정상 모델 뷰를 보존합니다. 압축이 모든 역사적 카탈로그 메시지를 숨기면 다음 완전 스냅샷이 현재 카탈로그를 다시 확립하며, 이전 카탈로그 없는 빈 뷰는 아무것도 emit하지 않습니다. 이 카탈로그 메시지는 월드 상태가 아니라 세션 이력입니다.

모델 대상 `skill({ name })` 도구는 케밥 케이스 이름을 검증하고, 호출 중립 카탈로그에서 요약을 찾고, `isModelInvocable`이 접근을 허용하지 않으면 로딩 전에 거부한 뒤, 호출 에이전트 cwd에 대한 완전 정의를 다시 읽고 콘텐츠를 반환하기 전에 정책을 재확인합니다. 해석되지 않은 스킬은 알 수 없거나 더 이상 사용할 수 없음으로 보고하고, `<skill_content name="...">`, `<skill_resources>`, `<skill_instructions>`를 담은 도구 결과를 반환합니다. `resourceBase`는 명시적으로 참조된 스크립트, 참조, 자산을 필요할 때만 해석하며, 로드된 결과는 스킬 디렉터리를 열거하지 않습니다. 따라서 본문만 편집하면 카탈로그 메시지를 만들거나 이전 도구 결과를 다시 쓰지 않고 이후 도구 호출이 바뀝니다.

## 브라우저 세션 카탈로그

`SkillListRequest`는 `sessionId`로 세션 하나를 지칭하고, `SkillListValue`는 사용자 호출 가능 항목을 이름, 설명, 선택적 사용 안내, 모델 호출 가용성과 함께 반환합니다. `SessionSkillCatalog`는 에이전트를 활성화하지 않고 세션 cwd와 기록된 프리셋을 읽습니다. 라이브 에이전트는 자신의 범위 지정 레지스트리를 공급할 수 있고, 콜드 세션은 프리셋의 상설 범위를 사용합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsessionskillcatalog--sessionskillcatalog"></a>

### `ctx.sessionSkillCatalog` — `SessionSkillCatalog`

Host service backing `ctx.remote.skills` without activating a cold Agent.

```ts cordis-catalog
/**
 * List the user-invocable skills visible to one Session composition.
 * @param request - Session identity whose cwd and preset select the catalog view.
 * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
 * @returns user-invocable skill metadata without loading skill bodies.
 * @throws RemoteError when the Session cannot be inspected or no registry can serve it.
 */
@Remote async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue>
```

Source: [`packages/api/session-controller/src/skill-catalog.ts`](../../packages/api/session-controller/src/skill-catalog.ts)

<a id="ctxskills--skillregistry"></a>

### `ctx.skills` — `SkillRegistry`

Layered registry of skill providers, the host+per-scope shape the tools registry established. A registration files into the layer of its calling context's scope (scopeOf): host rows and repository plugins land in the global layer, while a plugin mounted by an agent preset's standing composition lands in that preset's layer. A read merges the global layer with the viewing scope's chain — the nearest layer's entry wins a duplicate name outright, and the rank order decides duplicates only within one layer. It exposes sorted invocation-neutral summaries and loads full skill bodies on demand.

```ts cordis-catalog
/**
 * Register a borrowed same-process provider synchronously during plugin
 * apply, into the calling context's layer: a scoped context (an agent
 * preset's standing mount) registers for that scope alone, an unscoped
 * context registers globally. Duplicate names within one layer and reserved
 * names throw; remote initialization belongs in `list()`. Fiber disposal
 * unregisters the provider and invalidates catalog caches.
 * @param create - synchronous factory receiving this registration's lifecycle and invalidation control.
 * @returns the exact Cordis effect disposer that unregisters this provider;
 *   composite effects may yield it directly to preserve teardown ordering.
 */
registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void

/**
 * Register a borrowed readonly runtime skill into the calling context's
 * layer. Project entries outrank runtime entries, which outrank user
 * entries, within one layer. Same-name runtime entries in one layer are
 * first-wins; a duplicate logs a warning and receives a no-op disposer so
 * it cannot remove the winner.
 * @param skill - the skill definition input; omitted invocation and provider fields receive defaults.
 * @returns the exact Cordis effect disposer, preserving composite teardown order and invalidating caches.
 */
register(skill: SkillRegistration): () => void

/**
 * List invocation-neutral skill summaries for a workspace. Consumers apply
 * model or user invocation policy at their operational boundary. Lookup
 * options and provider candidates are readonly same-process values borrowed
 * throughout discovery.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns all sorted winning summaries.
 */
async list(options: SkillViewOptions = {}): Promise<SkillSummary[]>

/**
 * Observe the current invocation-neutral catalog and whether discovery completed within a stable revision.
 * Incomplete observations are never cached, allowing consumers to retain last-good state and
 * retry on their next request boundary.
 * @param options - view options; `scope` selects the viewing agent's layers, `cwd` selects project roots, and `signal` cancels discovery.
 * @returns sorted summaries plus discovery-completeness state.
 */
async snapshot(options: SkillViewOptions = {}): Promise<SkillCatalogSnapshot>

/**
 * Load and validate the winning candidate, passing its opaque discovery locator back to the
 * provider. Cancellation is rechecked after selection, including cache hits, and raced against
 * loading so an uncooperative provider cannot hang the caller.
 * @param name - kebab-case skill name.
 * @param options - view options; `scope` selects the viewing agent's layers,
 *   `cwd` selects workspace-sensitive skills, and `signal` cancels work.
 * @returns the full skill, including body content, or `undefined`.
 */
async get(name: string, options: SkillViewOptions = {}): Promise<SkillDefinition | undefined>
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)

<a id="skills-events"></a>

### `skills/*` events

<a id="skillschange--emit"></a>

#### `skills/change` — emit

A skill provider, runtime contribution, or provider-backed catalog may have changed. This is an unfiltered invalidation notification; consumers refetch the catalog for their own lookup options. Listener failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A skill provider, runtime contribution, or provider-backed catalog may
 * have changed. This is an unfiltered invalidation notification; consumers
 * refetch the catalog for their own lookup options. Listener failures are
 * contained and cannot veto the registry mutation.
 * @mode emit
 */
'skills/change'(): void
```

Source: [`packages/skill/skill/src/index.ts`](../../packages/skill/skill/src/index.ts)
<!-- END GENERATED cordis-surface -->
