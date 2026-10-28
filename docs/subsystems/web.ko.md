# 웹 접근

[English](web.md) | [中文](web.zh.md) | 한국어

웹 접근 seam입니다. 하나의 `ctx.web` 서비스에서 **두 동작**(검색과 가져오기)에 걸쳐 있는 [기능 seam](../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)이며 패키지로 나뉘어 있습니다. Service Definition([dsh-web](../../packages/web/web), `ctx.web` + 제공자 레지스트리), Service Provider([dsh-web-search-exa](../../packages/web/web-search-exa), [dsh-web-search-perplexity](../../packages/web/web-search-perplexity), [dsh-web-search-deepseek](../../packages/web/web-search-deepseek), [dsh-web-deepseek-api](../../packages/web/web-deepseek-api), [dsh-web-fetch-http](../../packages/web/web-fetch-http)), Consumer([dsh-tool-web](../../packages/web/tool-web), `web_search`/`web_fetch` 도구 스키마)입니다. 웹은 에이전트 루프 척추의 일부가 아닌 **선택적 기능 하나**이므로 그 어휘가 [core.md](core.ko.md)가 아니라 여기에 있습니다. 검색 제공자를 바꿔도 모델이 질의를 요청하는 방식은 바뀌지 않고, 가져오기 제공자를 바꿔도 모델이 URL을 요청하는 방식은 바뀌지 않습니다.

출처: [`packages/web/web/src/types.ts`](../../packages/web/web/src/types.ts)

## 기능 하나에 동작이 둘인 이유

검색과 가져오기는 요청 스키마도 비즈니스 로직도 공유하지 않지만, 의도적으로 하나의 `ctx.web` 중간 계층입니다. 제공자 선택 정책 소유자 하나, 중단/오류 어휘 하나, 그리고 제품 관점의 "이 하네스가 웹에 도달하는 방식" 구성 API 하나입니다. 비용은 서비스의 병렬 `searchX`/`fetchX` 메서드 쌍이며, 그 병렬성은 의도된 것이지 빠뜨린 추출이 아닙니다. 제공자는 도구가 아니라 **기능**(`WebSearchProvider` 또는 `WebFetchProvider`)을 등록하고, 모델이 보는 이름, 스키마, 프롬프트 안내, 표현은 모두 단일 `dsh-tool-web` 소비자에 있습니다.

## 검색 요청과 결과

각 seam 요청은 정확히 하나의 `query`를 담습니다. `dsh-tool-web` 소비자는 필수 `queries` 배열을 받아 별도 seam 요청으로 팬아웃하며, 항목이 하나인 배열은 검색 한 번을 수행합니다. `maxResults`는 소비자 소유 경계(`dsh-tool-web`의 `searchMaxResults` 구성, 기본 `8`)로, seam을 통과해 전달되고 돌아오는 길에 강제됩니다. 제공자가 초과 반환하면 seam이 `sources[]`를 잘라내고 `truncated`를 설정합니다.

```ts type-equiv
/**
 * What one search-capable backend is asked to search. Each request carries one
 * query; a consumer may issue several requests. `maxResults` is a
 * `dsh-tool-web`-layer bound passed through unchanged and enforced on the way
 * back by the seam (see {@link WebSearchResult}).
 */
interface WebSearchRequest {
  readonly query: string
  /**
   * Upper bound on returned sources; the seam truncates to it. Omitted = no
   * bound. `dsh-tool-web` always sets it. A provider whose API supports a
   * result-count control (Exa's `numResults`) should apply it at the request
   * layer as a cost/latency optimization; the seam enforces the bound
   * regardless.
   */
  readonly maxResults?: number
}
```

```ts type-equiv
/**
 * Normalized search outcome. `content` is optional provider-generated answer
 * text or summary (Exa and DeepSeek return none; Perplexity returns a
 * generated answer).
 * `sources[]` is the portable citation shape. `truncated` is set by the seam
 * when it cut `sources[]` down to `maxResults`.
 */
interface WebSearchResult {
  /** Optional provider-generated answer text, search context, or summary. */
  readonly content?: string
  /** Citeable sources, already truncated to the request's `maxResults`. */
  readonly sources: readonly WebSearchSource[]
  /** True when the seam dropped sources to honor `maxResults`. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * One citeable source. A source always has a URL; `title`, `snippet`, `summary`,
 * and `publishedAt` are optional because not every provider returns them — forcing
 * adapters to invent them would make the seam lie (Perplexity citations may be
 * URL-only). `dsh-tool-web` renders `title ?? hostname(url)` for display.
 */
interface WebSearchSource {
  readonly url: string
  readonly title?: string
  /** Short excerpt suited to display. */
  readonly snippet?: string
  /** Longer excerpt suited to model reading; consumers bound its length. */
  readonly summary?: string
  /** Publication/crawl timestamp as a provider-supplied ISO-8601 string. */
  readonly publishedAt?: string
}
```

## 가져오기 요청과 결과

```ts type-equiv
/**
 * What one fetch-capable backend is asked to retrieve. The request deliberately
 * omits timeout, format, prompt, and extraction controls: cancellation is a
 * direct execution argument, while presentation and higher-level LLM concerns
 * belong outside safe retrieval.
 */
interface WebFetchRequest {
  readonly url: string
}
```

HTTP 상태는 가져온 리소스 상태의 일부이며 자동으로 실패가 아닙니다. `404`/`500`의 성공적인 네트워크 가져오기는 상태 코드와 경계가 있는 디코딩 본문을 담은 `WebFetchResult`를 반환합니다. `url`은 허용된 리다이렉트 후의 최종 URL입니다. `WebError`는 리소스를 안전하게 가져오거나 표현하지 못한 실패에만 쓰입니다.

```ts type-equiv
/**
 * Normalized fetch outcome. A successful network fetch of a non-2xx response is
 * a result, not an error: the status code is part of the fetched resource
 * state. {@link WebError} is reserved for failures to safely retrieve or
 * represent the resource.
 */
interface WebFetchResult {
  /** The final URL after allowed redirects (the request URL is in the request). */
  readonly url: string
  /** HTTP status code of the fetched response. */
  readonly statusCode: number
  /** Decoded body, classified by content kind. */
  readonly body: WebFetchBody
  /** True when the provider capped the decoded body. */
  readonly truncated: boolean
}
```

```ts type-equiv
/**
 * The decoded body of a fetched resource. A CLOSED discriminated union owned by
 * `dsh-web`: the provider decodes the kind and `dsh-tool-web` renders it, so a
 * new kind is a coordinated change across known packages, not a plugin
 * extension. Consumers `switch` on `kind` ending in `default: assertNever(...)`
 * so adding a kind breaks compilation at every consumer until handled. Each arm
 * stays its own object literal even where fields coincide, so an arm can gain
 * fields the others lack.
 */
type WebFetchBody =
  | { readonly kind: 'html'; readonly content: string }
  | { readonly kind: 'text'; readonly content: string }
```

## 제공자 가용성

제공자의 `available(): boolean`은 값싼 로컬 검사(자격 증명 존재, 파싱 가능한 구성)이며 **네트워크 호출을 하면 안 됩니다**. 이는 실행 시점 선택의 입력이지 상태 모니터링 시스템이 아닙니다. `search()`/`fetch()`가 이를 읽어 쓸 수 있는 제공자를 고르고, 선택 실패는 호출자가 분기하는 구조화된 `WebError`로 표면화되며, 그 코드와 메시지가 분기 가능한 세부 정보(누락된 id 또는 모호한 후보 집합)를 담습니다.

검색이나 가져오기 제공자는 구성만 검사하고 네트워크 호출을 하면 안 되는 `ready(llmProvider): Promise<boolean>`도 구현할 수 있습니다. 이는 그 채팅 라우트에서 모델 요청을 위해 수행된 동작에 보낼 자격 증명이 있는지 답합니다. `searchReady(llmProvider?)`와 `fetchReady(llmProvider?)`는 `search()`나 `fetch()`가 선택할 제공자에게만 묻고, `ready()`가 없는 제공자는 준비된 것으로 취급하며, 선택이 실패하면 true로 답합니다. 동작이 그 실패를 `WebError`로 보고하기 때문입니다. 준비 상태는 선택 입력이 아닙니다. `dsh-tool-web`은 이를 `web_search`와 `web_fetch`의 활성화 조건으로 삼으므로, 라우트가 false로 답하는 모델 단계는 그 도구를 선언하지도 디스패치하지도 않습니다.

선택은 등록, 구성, HMR 순서에 결코 의존하지 않습니다. 기능에는 명시적 제공자 id(구성 `searchProvider`/`fetchProvider`, 또는 같은 필드를 채우는 해당 환경 변수)가 있거나, 사용 가능한 제공자가 정확히 하나 등록되었을 때 자동 선택합니다. 구성된 id 없이 사용 가능한 제공자가 여럿이면 `WEB_PROVIDER_AMBIGUOUS`이며 선착순이 아닙니다. 각 동작은 실행될 때 구성된 id를 읽으므로, 저장된 설정 변경은 `ctx.web`을 다시 마운트하지 않고 다음 검색이나 가져오기에 적용됩니다.

## 가져오기 네트워크 정책

배포되는 Cordis, Code, Standard 프리셋은 모든 샌드박스와 승인 모드에서 호출별 확인 없이 `web_fetch`를 노출합니다. 파일 샌드박스 프리셋은 웹 네트워크 접근을 관장하지 않습니다. 확인이 필요한 배포는 `tools/pre-execute` 정책을 추가하거나 가져오기를 비활성화해야 합니다.

HTTP 제공자는 대상 주소를 제한하지 않습니다. `web_fetch`는 다른 호스트와 마찬가지로 루프백, 사설 네트워크, 클라우드 메타데이터 호스트에 도달하며, 모델은 도달할 수 있는 어떤 URL로든 데이터를 보낼 수 있습니다. 교차 출처 리다이렉트는 새 도구 호출을 요구합니다. 모델을 사설 대상지에서 떼어 놓아야 하는 배포에는 네트워크 격리, `tools/pre-execute` 정책, 또는 가져오기 도구 제거가 필요합니다.

## 오류

`WebError extends HarnessError`([core.md](core.ko.md) 오류 분류)이며 `code: string`을 가지며, 다른 seam의 오류(`LlmError`, `SubagentError`)처럼 닫힌 유니온이 아니라 열려 있습니다. 제공자가 `dsh-web`을 고치지 않고 자기 코드를 낼 수 있고, 소비자는 알 수 없는 코드를 견뎌야 합니다. 코드는 소유자별로 나뉩니다. seam 중립 코드는 공유 `WebRuntime` 계약이 냅니다. `WEB_PROVIDER_UNAVAILABLE`, `WEB_PROVIDER_CONFIGURED_MISSING`, `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`, `WEB_PROVIDER_AMBIGUOUS`, `WEB_DUPLICATE_PROVIDER`(등록 시점 프로그래밍 오류로, `LlmRuntime`의 `DUPLICATE_ADAPTER`에 해당), `WEB_ABORTED`, `WEB_PROVIDER_ERROR`(제공자 자체 실패가 seam을 통해 표면화된 경우의 포괄 코드이며 DNS, 연결 거부, TLS 같은 네트워크·전송 실패를 포함)입니다. 가져오기 전송 코드는 `dsh-web-fetch-http` 구현이 소유하며 다른 가져오기 백엔드가 이를 낼 필요는 없습니다. `WEB_INVALID_URL`, `WEB_BLOCKED_URL`, `WEB_REDIRECT_BLOCKED`, `WEB_FETCH_TOO_LARGE`, `WEB_FETCH_TIMEOUT`, `WEB_UNSUPPORTED_CONTENT_TYPE`입니다.

## 서비스

`WebRuntime`은 검색과 가져오기 제공자를 등록하고, 중복 id를 `WEB_DUPLICATE_PROVIDER`로 거부하며, 실행 시점에 구조화된 선택 오류로 제공자를 해석합니다. 로컬 가져오기 백엔드는 HTTP(S)만 받고, 자격 증명을 거부하며, 모든 요청을 설치된 프록시 정책을 통해 보내고, 같은 출처 리다이렉트 홉마다 URL 검증을 반복하며, 리다이렉트·바이트·문자·시간을 제한하고 본문을 디코딩합니다. 표현은 도구가 소유합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxweb--webruntime"></a>

### `ctx.web` — `WebRuntime`

The web access service. Registered as `ctx.web` (one instance per context).

Selection semantics (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for search. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerSearchProvider(provider: WebSearchProvider): () => void

/**
 * Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
 * if its id is already registered for fetch. Returns a disposer; disposed
 * with the calling fiber.
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerFetchProvider(provider: WebFetchProvider): () => void

/**
 * Run one search through the selected provider. Resolves the provider at call
 * time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. The seam enforces `request.maxResults` on the result:
 * if the provider over-returns, `sources[]` is truncated and `truncated` set.
 * @param request - the query and optional result limit.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the provider's results, capped to `request.maxResults`.
 */
async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>

/**
 * Whether the provider `search()` would select can authenticate a search made for a
 * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
 * one without `ready()` counts as ready. Makes no network calls. A selection failure
 * answers true, because `search()` reports that failure as a structured `WebError`.
 * @param llmProvider - the provider route id of the model request, when known.
 * @returns false only when the selected provider reports that it cannot authenticate.
 */
async searchReady(llmProvider?: string): Promise<boolean>

/**
 * Retrieve one URL through the selected provider. Resolves the provider at
 * call time with the selection rules above; throws {@link WebError} when the
 * capability cannot run. A non-2xx response is a result, not a throw.
 * @param request - the URL plus retrieval options.
 * @param signal - optional cancellation signal forwarded to the provider.
 * @returns the retrieval outcome; non-2xx responses resolve descriptively.
 */
async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult>

/**
 * Whether the provider `fetch()` would select can authenticate a fetch made for a
 * model request on the `llmProvider` chat route. Asks only that provider's `ready()`;
 * one without `ready()` counts as ready. Makes no network calls. A selection failure
 * answers true, because `fetch()` reports that failure as a structured `WebError`.
 * @param llmProvider - the provider route id of the model request, when known.
 * @returns false only when the selected provider reports that it cannot authenticate.
 */
async fetchReady(llmProvider?: string): Promise<boolean>
```

Source: [`packages/web/web/src/index.ts`](../../packages/web/web/src/index.ts)
<!-- END GENERATED cordis-surface -->
