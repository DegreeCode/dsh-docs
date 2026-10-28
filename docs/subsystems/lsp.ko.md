# LSP 내비게이션

[English](lsp.md) | [中文](lsp.zh.md) | 한국어

LSP seam은 하나의 `ctx.lsp` 서비스에서 시맨틱 코드 내비게이션을 노출하는 [capability seam](../glossary.ko.md#기능-seamcapability-seam)이며, 패키지로 나뉩니다. Service Definition([dsh-lsp](../../packages/lsp/lsp), `ctx.lsp` + 제공자 레지스트리), 일반 Service Provider([dsh-lsp-stdio](../../packages/lsp/lsp-stdio), 구성된 stdio 언어 서버 호스트), Consumer([dsh-tool-lsp](../../packages/lsp/tool-lsp), `lsp` 도구 스키마)입니다. LSP는 **선택적 기능 하나**이며 agent-loop 척추의 일부가 아니므로, 그 어휘는 [core.md](core.ko.md)가 아니라 이곳에 있습니다. 제공자를 바꿔도 모델이 내비게이션을 요청하는 방식은 바뀌지 않습니다.

출처: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)

## 연산과 좌표

이 seam과 모델은 정확히 네 가지 시맨틱 질의를 노출합니다. 유니온이 닫혀 있으므로 하나를 추가하는 것은 seam, 제공자, 도구 전반에 걸친 컴파일 강제 변경입니다. 위치와 범위는 프로토콜과 일치하는 0부터 시작하는 UTF-16이며, 모델 대상 도구가 1부터 시작하는 커서 관례를 소유하고 들어오고 나가는 길에 변환합니다.

```ts type-equiv
/**
 * The four semantic queries the seam and model expose. A closed union: adding an operation is a
 * compile-enforced change across the seam, providers, and the tool. Symbols and call hierarchy are
 * not operations here; they need different schemas.
 */
type LspOperation = 'goToDefinition' | 'findReferences' | 'goToImplementation' | 'hover'
```

```ts type-equiv
/** A zero-based UTF-16 cursor coordinate, matching the LSP wire convention. */
interface LspPosition {
  /** Zero-based line. */
  readonly line: number
  /** Zero-based UTF-16 code-unit offset within the line. */
  readonly character: number
}
```

```ts type-equiv
/** A zero-based UTF-16 half-open range `[start, end)`. */
interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}
```

## 요청

모든 필드가 필수입니다. `workspaceRoot`는 호출자가 제공하고, `languageId`는 요청이 아니라 제공자의 등록에서 오며, 시간 초과와 결과 한도는 소비자가 소유합니다. 따라서 구현 기본값이 필요한 필드가 없고 `resolve()` 단계도 없습니다. 제공자는 호출자의 요청과 파생된 `languageId`를 받으며, 후자는 일시적 문서를 동기화할 뿐 선택에는 결코 참여하지 않습니다.

```ts type-equiv
/**
 * A caller's normalized query. Every field is required: `workspaceRoot` is caller-supplied,
 * `languageId` comes from the provider registration (not here), and consumers own timeouts and
 * result limits — so no field needs implementation defaulting and there is no `resolve()` step.
 */
interface LspQueryRequest {
  /** Which semantic query to run. */
  readonly operation: LspOperation
  /** The source file to query (relative to `workspaceRoot` or absolute; the provider canonicalizes). */
  readonly filePath: string
  /** The zero-based UTF-16 cursor position to query at. */
  readonly position: LspPosition
  /** The workspace root the provider resolves against and indexes; required, never defaulted. */
  readonly workspaceRoot: string
}
```

```ts type-equiv
/**
 * A request as a provider receives it: the caller's {@link LspQueryRequest} plus the `languageId`
 * the seam derived from the provider's extension mapping. The language id only synchronizes the
 * transient document; it does not participate in selection.
 */
interface LspProviderQuery extends LspQueryRequest {
  /** The LSP language id for `filePath`, from this provider's extension mapping. */
  readonly languageId: string
}
```

## 결과

**닫힌** 판별 유니온입니다. 내비게이션 연산은 `locations`로, `hover`는 콘텐츠나 `null`로 정규화됩니다. 소비자는 `kind`로 완전 소진까지 `switch`하므로 새 갈래가 생기면 처리하기 전까지 컴파일이 깨집니다. `findReferences`는 항상 선언을 포함하며, 제공자가 이를 내부에서 강제하므로 호출자에게 플래그가 없습니다. `locations` 변형은 제공자의 정규 워크스페이스 `file:` URI인 `resolvedWorkspaceUri`를 담습니다. 위치 URI를 상대화하는 호출자는 심볼릭 링크일 수 있는 요청 루트에 호스트 플랫폼 경로 규칙을 적용하지 않고 그 좌표를 사용합니다.

```ts type-equiv
/** One resolved location: a document URI and the range within it. */
interface LspLocation {
  /** The target document URI (`file:` or otherwise), verbatim from the server. */
  readonly uri: string
  /** The range within the target document. */
  readonly range: LspRange
}
```

```ts type-equiv
/** Normalized hover content, or `null` for no hover at the position. */
interface LspHover {
  /** The normalized hover text (markdown or plaintext, provider-joined). */
  readonly contents: string
  /** The range the hover applies to, when the server supplied one. */
  readonly range?: LspRange
}
```

```ts type-equiv
/**
 * The closed result union. Navigation operations (`goToDefinition`, `findReferences`,
 * `goToImplementation`) normalize to `locations`; `hover` normalizes to content or `null`.
 * Consumers `switch` on `kind` to exhaustiveness so a new arm breaks compilation until handled.
 *
 * The `locations` variant carries `resolvedWorkspaceUri`: the provider's canonical `file:` URI for
 * the request's workspace root. A caller that relativizes location URIs MUST use this, not parse the
 * request's possibly symlinked process path with host-platform rules; the execution platform may
 * differ from the caller's.
 */
type LspQueryResult =
  | { readonly kind: 'locations'; readonly locations: readonly LspLocation[]; readonly resolvedWorkspaceUri: string }
  | { readonly kind: 'hover'; readonly hover: LspHover | null }
```

## 제공자와 서비스

제공자는 안정적인 브랜드 `id`와 배타적인 소문자 선행 점 확장자 맵을 소유합니다. `registerProvider`는 id와 모든 확장자를 원자적으로 예약하며(유효하지 않거나 충돌하는 등록은 아무것도 게시하지 않습니다), 그 디스포저가 모든 예약을 해제합니다. 선택은 질의별이며 순서와 무관하고, 일치가 없으면 `LspError` `LSP_UNAVAILABLE`을 던집니다. 이 seam은 프로토콜 타입도, 프로세스·문서 제어도, 일반 JSON-RPC 우회 통로도 노출하지 않습니다.

```ts type-equiv
/**
 * A language-server backend registered on `ctx.lsp`. Each provider owns a stable {@link
 * LspProviderId} and an extension-to-language-id map (lowercase, leading-dot keys).
 * `findReferences` always includes declarations — the provider enforces this internally; callers
 * get no flag.
 */
interface LspProvider {
  /** Stable provider identity, reserved atomically with the extension mappings. */
  readonly id: LspProviderId
  /** Lowercase leading-dot extension → LSP language id (e.g. `{ '.ts': 'typescript' }`). */
  readonly extensionToLanguage: Readonly<Record<string, string>>
  /**
   * Run one query. The seam has already selected this provider and derived `languageId`.
   * @param request - the resolved provider query (caller request + derived language id).
   * @param signal - optional cancellation; the provider stops its own work when it aborts.
   * @returns the normalized, closed-union result.
   */
  query(request: LspProviderQuery, signal?: AbortSignal): Promise<LspQueryResult>
}
```

```ts type-equiv
/**
 * The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query
 * execution; exposes exactly the four operations and no protocol escape hatch.
 */
interface LspService {
  /**
   * Register a provider, atomically reserving its id and every normalized extension. Any conflict
   * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
   * reservations. Disposed with the calling fiber.
   * @param provider - the backend to register.
   * @returns a synchronous disposer releasing the id and all extension reservations.
   */
  registerProvider(provider: LspProvider): () => void
  /**
   * Select a provider by the file's extension and run one query. Selection is per-query and
   * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
   * @param request - the normalized query.
   * @param signal - optional cancellation forwarded to the selected provider.
   * @returns the normalized, closed-union result.
   */
  query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
}
```

`LspProviderId`는 이 seam의 브랜드 id이며([dsh-brand](../../packages/util/brand)의 `Branded<'LspProviderId'>`), `LspError`는 `HarnessError`를 확장하고 `LSP_INVALID_PROVIDER`, `LSP_CONFLICT`, `LSP_UNAVAILABLE`, `LSP_DISPOSED`, `LSP_UNSUPPORTED_OPERATION`, `LSP_MALFORMED_RESPONSE` 같은 안정적인 코드를 가집니다. 호출자는 `message`를 파싱하는 대신 이 코드로 라우팅합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxlsp--lspservice"></a>

### `ctx.lsp` — `LspService`

The LSP capability seam (`ctx.lsp`). Owns provider registration/selection and normalized query execution; exposes exactly the four operations and no protocol escape hatch.

```ts cordis-catalog
/**
 * Register a provider, atomically reserving its id and every normalized extension. Any conflict
 * or invalid input publishes nothing and throws `LspError`; the returned disposer releases all
 * reservations. Disposed with the calling fiber.
 * @param provider - the backend to register.
 * @returns a synchronous disposer releasing the id and all extension reservations.
 */
registerProvider(provider: LspProvider): () => void

/**
 * Select a provider by the file's extension and run one query. Selection is per-query and
 * order-independent; no match throws `LspError` `LSP_UNAVAILABLE`.
 * @param request - the normalized query.
 * @param signal - optional cancellation forwarded to the selected provider.
 * @returns the normalized, closed-union result.
 */
query(request: LspQueryRequest, signal?: AbortSignal): Promise<LspQueryResult>
```

Source: [`packages/lsp/lsp/src/types.ts`](../../packages/lsp/lsp/src/types.ts)
<!-- END GENERATED cordis-surface -->
