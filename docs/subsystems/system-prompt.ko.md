# 시스템 프롬프트 조립

[English](system-prompt.md) | [中文](system-prompt.zh.md) | 한국어

[system-prompt 패키지](../../packages/core/system-prompt)는 프롬프트 기여자와 하나의 조립 호출 사이에서 교환되는 데이터를 소유합니다. [패키지 README](../../packages/core/system-prompt/README.md)는 등록, 순서, 범위 지정, 렌더링 동작을 문서화하고, 이 페이지는 플러그인이 구현하거나 전달하는 정확한 교차 패키지 타입을 기록합니다.

출처: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts).

## 조립 컨텍스트

`AssembleContext`는 한 조립이 해석하는 범위 계층을 식별하고 그 요청의 명시적 제어 시그널을 담을 수 있습니다. 선언 병합으로 확장 가능하며, `dsh-agent`가 선택적 `agent`와 `modelSelection` 필드를 추가합니다. `assembleContextFor(agent, signal)`은 에이전트, 범위, 시그널을 설정하고, 루프는 그 단계에 대해 캡처되어 재시도 간에 유지되는 모델 선택을 제공하며, 추론 노력이 생략되면 어댑터 기본값을 씁니다. 맨 조립에는 범위도 시그널도 없습니다.

```ts type-equiv
/** Merge-extensible context for one prompt assembly. */
interface AssembleContext {
  /**
   * Scope whose providers and waterfall listeners participate. When absent,
   * only global providers and subject-less listeners participate.
   */
  scope?: ScopeKey
  /** Explicit control signal for the turn that requested this assembly, when any. */
  signal?: AbortSignal
}
```

## 도구 제공자 결과

`ToolProviderResult.schemas`는 현재 조립에 대한 모델 가시 집합입니다. `knownNames`는 제공자의 제한 이전 이름 우주로, 구성된 이름의 오타와 이 범위에서 의도적으로 숨겨진 알려진 도구를 구분하는 데 쓰입니다.

```ts type-equiv
/** Tool schemas visible in one assembly and their pre-restriction name set. */
interface ToolProviderResult {
  /** The schemas this provider contributes to THIS assembly. */
  readonly schemas: readonly ToolSchema[]
  /** The pre-restriction name universe for config validation (defaults to `schemas`' names). */
  readonly knownNames?: readonly string[]
}
```

## 프롬프트 섹션

내보내는 `PERSONA_PREFIX_SECTION`(`deployment:persona-prefix`)과 `PERSONA_SUFFIX_SECTION`(`deployment:persona-suffix`)은 전역 구성과 범위 지정 기여가 공유하는 슬롯을 지명합니다. 그 `PromptSectionOrderName` 항목은 `DEPLOYMENT_PERSONA_PREFIX`와 `DEPLOYMENT_PERSONA_SUFFIX`이며, 배치와 템플릿 구성은 [패키지 README](../../packages/core/system-prompt/README.md#configure-the-prompt)가 소유합니다.

`PromptSection`은 읽기 전용 동일 프로세스 등록 계약입니다. 그 텍스트는 정적이거나 현재 조립 컨텍스트에서 해석될 수 있습니다. 섹션은 오름차순 order, 그다음 코드 단위 이름으로 정렬되며, 저장소 기여자는 `getSectionOrder()`로 서비스 소유 이름 할당을 해석합니다. 런타임 컨텍스트 기여자는 `getContextOrder()`로 독립 할당을 해석합니다. 협력적 조립 후 하나의 실효 `complete` 섹션이 유일한 프롬프트 섹션이 됩니다. agent-loop는 조립된 섹션을 `renderPrompt`로 렌더링하고 그 텍스트를 `system/message` 표면 노드로 커밋합니다. 즉 첫 단계에서 표면 노드 0으로 추가되고, 이후 렌더링된 텍스트가 바뀌면 제자리에서 교체되거나, 준비된 호출이 `systemPromptUpdate: 'in-history'`를 선언하면 계속되는 시리즈의 비어 있지 않은 갱신에 대해 캐시된 이력 뒤에 추가됩니다. 따라서 프롬프트는 요청 필드가 아니라 파생 이력의 메시지로 모델에 도달합니다([결정](../../.agents/notes/implemented/architecture/2026-09-02-system-prompt-as-surface-node.md), [결정 규칙](../../packages/core/agent-loop/README.md#understand-the-implementation)).

```ts type-equiv
/** One contributed section of the system prompt (registry input). */
interface PromptSection {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.section}). */
  readonly name: string
  /**
   * Sections are concatenated in ascending order. Equal orders use code-unit
   * name order.
   */
  readonly order: number
  /**
   * Static text or a provider evaluated at each assembly with that assembly's
   * {@link AssembleContext}. The text may reference `{{variable}}`s — they are
   * interpolated later, by {@link renderPrompt}, unless `interpolate` is false.
   */
  readonly text: string | ((context: AssembleContext) => string)
  /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
  readonly interpolate?: boolean
  /**
   * Treat this contribution as the complete system prompt. Assembly still
   * runs the cooperative waterfall so tools, contexts, and variables can be
   * resolved, then restores this exact section as the sole prompt section.
   * More than one effective complete section makes assembly fail.
   */
  readonly complete?: boolean
}
```

## 동적 프롬프트 컨텍스트

`PromptContext`는 `PromptSection`의 캐시 안전 대응물입니다. 조립이 이 기여들을 해석하고 정렬하며, agent-loop는 보존된 모델 이력 뒤에 그 완전한 현재 스냅샷을 바뀌었거나 압축이 제거했을 때만 기록합니다.

```ts type-equiv
/** Dynamic model context materialized as a durable user-role snapshot. */
interface PromptContext {
  /** Unique name — a duplicate registration throws (see {@link SystemPrompt.context}). */
  readonly name: string
  /** Contexts are joined in ascending order. */
  readonly order: number
  /** Static text or a provider evaluated at assembly and admission refresh. Empty text contributes nothing. */
  readonly text: string | ((context: AssembleContext) => string)
  /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
  readonly interpolate?: boolean
  /** Keep this operational context when optional runtime context is disabled. */
  readonly required?: boolean
}
```

`required: true`는 선택적 런타임 컨텍스트가 억제될 때 운영상 기여를 유지합니다. `interpolate: false`는 변수처럼 보이는 디렉터리 이름을 포함해 리터럴 텍스트를 보존합니다. `AssembledContext`는 해석된 텍스트와 그 보간 선택을 렌더링으로 전달합니다.

```ts type-equiv
/** One resolved dynamic context contribution. */
interface AssembledContext {
  /** The contributing context's unique name. */
  name: string
  /** The resolved text before variable interpolation. */
  text: string
  /** Whether to interpolate prompt variables. Defaults to true; false preserves literal text. */
  interpolate?: boolean
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsystemprompt--systemprompt"></a>

### `ctx.systemPrompt` — `SystemPrompt`

Registry service for the prompt inputs assembled before each model step.

```ts cordis-catalog
/**
 * Register an ordered prompt section in the calling context's scope. A scoped
 * section shadows a global section with the same name; duplicates within one
 * layer and non-finite orders throw. Registration and disposal emit
 * `system-prompt/change`.
 * @param section - the section to register.
 * @returns the exact Cordis effect disposer.
 */
section(section: PromptSection): () => void

/**
 * Resolve the centrally owned placement of a repository prompt section.
 * @param name - stable section placement name.
 * @returns the section's numeric sort order.
 */
getSectionOrder(name: PromptSectionOrderName): number

/**
 * Resolve the centrally owned placement of a repository runtime context.
 * @param name - stable context placement name.
 * @returns the context's numeric sort order.
 */
getContextOrder(name: PromptContextOrderName): number

/**
 * Register ordered dynamic context in the calling context's scope. Scoped
 * entries shadow global entries with the same name.
 * @param context - the context contribution to register.
 * @returns the exact Cordis effect disposer.
 */
context(context: PromptContext): () => void

/**
 * Suppress optional dynamic runtime-context contributions in the calling
 * context's scope without changing the services that own or enforce those
 * facts. Multiple suppressors remain independently disposable.
 * @returns the exact Cordis effect disposer.
 */
suppressRuntimeContext(): () => void

/**
 * Register a tool-schema provider in the calling context's scope. Global and
 * matching scoped providers both contribute; returning the reserved
 * {@link TOOL_ORDER_REST} name makes assembly fail.
 * @param provider - evaluated for each assembly with its context.
 * @returns the exact Cordis effect disposer.
 */
tools(provider: (context: AssembleContext) => ToolProviderResult): () => void

/**
 * Register a prompt variable in the calling context's scope. Scoped values
 * shadow globals; invalid or duplicate names throw. A provider may return
 * `undefined`, but rendering a section that references that value then fails.
 * @param name - the `[a-z][a-z0-9_]*` reference name.
 * @param provider - evaluated for each assembly.
 * @returns the exact Cordis effect disposer.
 */
variable(name: string, provider: (context: AssembleContext) => string | undefined): () => void

/**
 * Refresh accepted registered runtime facts for request admission. Contexts
 * added only by the assembly waterfall retain their accepted values. Current
 * suppression removes optional contexts, and missing required registrations
 * are restored in registry order. Sections, tools, and interpolation variables
 * retain the accepted assembly; their providers and waterfall do not rerun.
 * @param assembly - accepted assembly for this scope and step.
 * @param context - the same scope and current plugin-defined assembly fields.
 * @returns the accepted assembly with current runtime-context provider text.
 */
refreshContext(assembly: PromptAssembly, context: AssembleContext = {}): PromptAssembly

/**
 * Assemble global and scoped providers, detach tool parameters, apply
 * canonical ordering, then run the presentation waterfall. Scoped sections
 * and variables shadow globals. The waterfall's text is authoritative except
 * that an effective complete section is restored afterwards as the sole
 * prompt section; tool declarations stay provider-owned.
 * @param context - the optional scope, step tool set, and plugin-defined assembly fields.
 * @returns the post-waterfall assembly with ordered tool declarations and any complete prompt enforced.
 */
async assemble(context: AssembleContext = {}): Promise<PromptAssembly>
```

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)

<a id="system-prompt-events"></a>

### `system-prompt/*` events

<a id="system-promptassemble--waterfall"></a>

#### `system-prompt/assemble` — waterfall

Presentation waterfall over assembled sections, contexts, and variables. Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): scoped listeners receive only that scope's assemblies. The returned text is authoritative; tool declarations remain provider-owned. A supplied signal controls only this explicit assembly request and must not be retained to control later turns. A registered complete section is restored after this waterfall, so listeners cannot add to or replace that scope's system prompt.

```ts cordis-catalog
/**
 * Presentation waterfall over assembled sections, contexts, and variables.
 * Scope-filtered dispatch (`@deepseek-ai/dsh-scope`): scoped listeners
 * receive only that scope's assemblies. The returned text is authoritative; tool declarations remain provider-owned.
 * A supplied signal controls only this explicit assembly request and must not
 * be retained to control later turns. A registered complete section is
 * restored after this waterfall, so listeners cannot add to or replace
 * that scope's system prompt.
 * @param assembly - the mutable assembly built from registered providers.
 * @param context - the caller's per-assembly context.
 * @mode waterfall
 */
'system-prompt/assemble'(this: Scoped<SystemPrompt>, assembly: PromptPresentation, context: AssembleContext, next: () => Promise<PromptPresentation>): Promise<PromptPresentation>
```

Types: [Scoped](scope.ko.md)

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)

<a id="system-promptchange--emit"></a>

#### `system-prompt/change` — emit

Emitted when any prompt provider changes. This registry notification is unfiltered because a global change affects every scope.

```ts cordis-catalog
/**
 * Emitted when any prompt provider changes. This registry notification is
 * unfiltered because a global change affects every scope.
 * @mode emit
 */
'system-prompt/change'(): void
```

Source: [`packages/core/system-prompt/src/index.ts`](../../packages/core/system-prompt/src/index.ts)
<!-- END GENERATED cordis-surface -->
