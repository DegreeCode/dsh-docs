# 클라이언트 모듈

[English](client-modules.md) | [中文](client-modules.zh.md) | 한국어

[dsh-client-modules](../../packages/client/modules)에 있는 클라이언트 모듈 시스템의 Node 절반인 웹 플러그인 테이블이며, `ctx.clientModules`(`ClientModuleRegistry`)로 제공됩니다. 호스트 Loader의 엔트리에서 `dsh.client`를 선언한 패키지를 스캔하고, `window.__DSH_BOOT__` 엔트리 그래프를 구성하고, 버전이 붙은 하나 이상의 리소스 콤보 스크립트를 `/plugins` 아래에 서비스하며, 모든 index 주입 수집에 부트 프로토콜 행으로 응답합니다. 하나의 서비스가 가진 네 가지 면입니다. 웹 GUI 스택의 선택적 기능이며 에이전트 루프 척추의 일부가 아니고, [dsh-host-webserver](../../packages/host/webserver)의 소비자입니다. 즉 [web-server.md](web-server.ko.md)에 설명된 캐리어가 이 서비스가 응답하는 접두사 라우트와 `webserver/index-inject` 이벤트를 제공합니다. 같은 패키지의 브라우저 절반(`ctx.modules`, 이 번들을 가져와 구체화하는 지연 CJS 모듈 테이블)은 커널 기계 장치이며 여기가 아니라 [패키지 README](../../packages/client/modules/README.md)에 문서화되어 있습니다.

출처: [`packages/client/modules/src/client/manifest.ts`](../../packages/client/modules/src/client/manifest.ts)

## 와이어

그래프는 Node 절반과 브라우저 절반 사이의 와이어 단일 원천입니다. 호스트는 스캔한 패키지에서 `WebBootEntry` 행과 `WebBootBatch` 설명자를 구성한 뒤, Vite 엔트리보다 먼저 등록 파사드, 애플리케이션 프리로드, 부트스트랩 스크립트, 그래프 전역을 구조화된 index 주입 테이블에 기여합니다. `global` 행은 `globalThis["__DSH_BOOT__"]`로 렌더링되며 `<`가 이스케이프되어 플러그인이 제어하는 문자열이 script 엘리먼트를 벗어날 수 없습니다. 유효한 매니페스트가 없는 페이지는 부팅할 수 없습니다. 브라우저 파서가 잘못된 행이나 배치, 알 수 없는 멤버, 정확히 하나의 초기 콤보 설명자를 갖지 않는 엔트리를 거부합니다.

```ts type-equiv
/**
 * One composed client entry pushed by the host (a graph row). Wire
 * single source: the host node half (package root) produces this same shape.
 * `immediately` marks stage-one prefetch. `inject` names package rows whose
 * factories must arrive before this row materializes, while Cordis separately
 * uses the same package edges to compose entries. `external` carries exact
 * non-inject module requests (see {@link WebBootGraph.entries}).
 */
interface WebBootEntry {
  /** Entry name == package name. */
  id: string
  /**
   * Revisioned single-resource combo reference used by HMR. It is relative to
   * the document, so the browser resolves it under whatever mount served the page.
   */
  url: string
  /** Opaque plugin-artifact revision used for HMR cache busting. */
  rev: string
  /** Package-name dependency edges used for factory arrival and plugin composition. */
  inject?: string[]
  /** Stage-one prefetch mark: load the script for factory registration during module-face boot. */
  immediately?: boolean
  /** Non-baseline module specifiers this row requests; omitted when it requests none. */
  external?: string[]
}
```

```ts type-equiv
/** Initial scheduling phase for one revisioned combo script. */
type WebBootBatchPhase = 'bootstrap' | 'application'
```

```ts type-equiv
/** One initial combo script; a scheduling phase may span several descriptors. */
interface WebBootBatch {
  /** Parser-blocking bootstrap or preloaded application scheduling. */
  phase: WebBootBatchPhase
  /** Content-addressed combo script reference, document-relative like {@link WebBootEntry.url}. */
  url: string
  /** Revision derived from the ordered entry revisions. */
  rev: string
  /** Graph entry ids whose factories the script registers, in execution order. */
  entries: string[]
}
```

```ts type-equiv
/** Host release identity; two releases are the same when both fields are equal. */
interface WebBootRelease {
  /** Release version label. */
  version: string
  /** Source commit fixed in when the Host was built; absent when the build recorded none. */
  commit?: string
}
```

```ts type-equiv
/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
interface WebBootGraph {
  /** Consistency anchor over the current entry and batch descriptors. */
  rev: string
  /** Host release identity; absent from a Host that publishes none. */
  release?: WebBootRelease
  /**
   * Composed entries in module-graph order — a dynamic package row precedes
   * rows whose `external` requests that package. Cordis activation order is
   * unrelated and remains owned by fiber service waiting.
   */
  entries: WebBootEntry[]
  /** Initial combo descriptors; every entry belongs to exactly one descriptor. */
  batches: WebBootBatch[]
}
```

초기 게시와 HMR은 실행 가능한 바이트를 해시하지 않고 엔트리의 mtime, ctime, 크기에서 각 행의 `rev`를 도출합니다. 같은 산출물은 Host 재시작을 넘어 그 리비전을 유지합니다. 초기 설명자는 행을 부트스트랩과 애플리케이션 스케줄링 단계로 나누며, 어느 단계든 여러 설명자를 담을 수 있습니다. 그 URL은 순서 있는 패키지-리소스 목록과 그 행 리비전에서 도출한 리비전만 담고, 단계 이름은 라우트에 들어가지 않습니다. 그래프 구성은 행 순서를 보존하면서 맵 형식 URL이 3 KiB를 넘기 전에 탐욕적으로 분할하고, 스크립트를 이어 붙이거나 맵을 읽지 않습니다. 그래프 리비전은 엔트리와 배치 설명자를 해시합니다. `immediately`는 1단계 등록 배리어를 표시하며, 한 콤보 안의 행은 그 스크립트 전송을 공유하고 별개 콤보는 독립적으로 로드됩니다.

`release`는 이 패키지의 버전과 클라이언트 빌드가 빌드된 Host 산출물에 고정한 소스 커밋을 짝지으며, 그래프 리비전 밖에 남습니다. 페이지는 Host가 그 페이지의 부트 릴리스를 서비스하는 동안에만 그래프와 재빌드된 프레임을 적용하고, 다른 릴리스는 페이지 새로 고침을 기다립니다([Host 릴리스 변경](../../packages/client/modules/README.md#host-release-changes)).

## 스캔

패키지는 package.json에서 `dsh.client`(`platform: 'web'`, 선택적 `inject` 엣지, 선택적 `immediately`)를 선언하고 `exports["./client"]`에서 빌드된 번들을 내보내 테이블에 합류합니다. 각 라이브 행은 자기 Loader 지정자와 소유 트리 `baseUrl`에서 해석되며, 가능하면 그 Host 면을 가져오는 것과 같은 `loader.internal.resolveSync` 구현을 통합니다. 가장 가까운 소유 패키지 매니페스트가 브라우저 모듈 id를 제공하므로 상대 소스와 빌드된 오버레이가 패키지 정체성을 유지합니다. 하나의 패키지 이름으로 해석되는 서로 다른 활성 Loader 소스는 구성을 실패시키고, 한 소스가 언로드된 뒤에는 살아남은 소스가 fiber 재시작 없이 그 행을 제공합니다.

스캔은 패키지별로 증분적입니다. 전체 재스캔 코드 경로는 없습니다. 모든 cordis `internal/plugin` 방출(fiber 생성 또는 폐기)이 그 fiber의 엔트리 이름을 더티로 표시하고, 마이크로태스크 플러시가 각 더티 이름을 라이브 loader 엔트리와 조정합니다. 활성화 패스는 현재 엔트리 전부로 같은 더티 집합을 시드하고 동기적으로 플러시하므로, 첫 스캔과 정상 상태가 하나의 구현을 공유하며 실패 태도는 반대입니다. 활성화 시점에는 이미 로드된 엔트리 중 잘못된 선언이나 누락된 번들이 깨진 패키지를 모두 나열하는 하나의 큰 `AggregateError`로 집계됩니다. fiber가 실패하고 부트의 fail-loud 스윕이 이를 보고합니다. 정상 상태에서는 깨진 패키지가 경고를 기록하고 다른 패키지를 오염시키지 않아야 합니다.

각 조정은 패키지 매니페스트와 번들 메타데이터를 다시 읽습니다. 같은 선언과 번들 메타데이터를 찾은 같은 소스의 fiber 재시작은 그 행과 rev를 유지하고 번들 바이트를 읽지 않으며, 바뀐 선언, 클라이언트 export, 번들은 그 조정이 게시합니다. 엔트리 재시작 없이 재빌드된 번들은 `rebuilt()`를 통해 그래프에 도달합니다.

## 번들 라우트와 index 주입

`GET`/`HEAD /plugins/??<package-a>/client.js,<package-b>/client.js&rev=<rev>`가 생성된 콤보 스크립트 하나를 지목하며, 리소스 하나짜리 요청도 같은 형식을 쓰고 이것이 HMR 경로입니다. `/plugins/<package>/assets/<path>`는 패키지가 게시한 이미지를 서비스하고, 그 라우트는 [패키지 README](../../packages/client/modules/README.md#package-assets)가 소유합니다. 스크립트는 첫 `GET`에서 한 번 연결되고, 콤보 쿼리만 담은 `sourceMappingURL`로 끝납니다. 즉 `??<package-a>/client.js.map,<package-b>/client.js.map&rev=<rev>`이며, 문서가 아니라 스크립트 자체 디렉터리 기준으로 해석됩니다. 맵 파일은 시작, index 렌더링, 스크립트 `GET`, `HEAD`가 읽지 않습니다. 첫 맵 `GET`이 이를 읽고 검증하며 Indexed Source Map v3 하나로 구성하고 그 본문을 캐시합니다. 작성된 컴포넌트 맵은 자기 섹션을 제공하고, 없는 컴포넌트는 `sourcesContent`가 캡처된 번들이고 소스 이름이 패키징된 `sourceURL` 또는 플러그인 라우트인 항등 섹션을 받습니다. 모든 시작 요청 URL은 UTF-8 바이트로 측정해 최대 3 KiB이며, 분할은 더 긴 맵 형식을 사용합니다. 모든 애플리케이션 URL은 프리로드되고 모든 부트스트랩 URL은 그래프 전역과 Vite 엔트리 전에 실행됩니다. 구체화된 응답은 장기 불변 캐싱을 사용합니다. 알 수 없거나 변경된 리소스 목록, 누락된 리비전, 오래된 리비전은 다른 바이트를 서비스하거나 SPA 폴백이 HTML을 JavaScript로 반환하게 하는 대신 404로 응답하며, 다른 메서드는 405입니다. 주입 행은 모든 index 렌더에서 현재 그래프를 담으므로 새로 고침은 항상 라이브 구성으로 부팅합니다.

## 서비스

```ts type-equiv
/** Filesystem baseline captured before a client artifact snapshot is read. */
interface ClientArtifactBaseline {
  /** Absolute path of the client bundle. */
  readonly path: string
  /** Bundle modification time in milliseconds. */
  readonly mtimeMs: number
  /** Bundle status-change time in milliseconds, including writes that preserve mtime. */
  readonly ctimeMs: number
  /** Bundle size in bytes. */
  readonly size: number
}
```

`ClientModuleRegistry`(`ctx.clientModules`, [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)에 정의)는 읽기와 재빌드 면을 노출하며, 시그니처는 생성된 [서비스 카탈로그](#ctxclientmodules--clientmoduleregistry)에 있습니다. `graph()`는 현재 구성된 그래프를 반환하고(변경 사이에는 안정적인 객체), `clientPath(id)`는 번들의 절대 경로를 반환하며, `artifactBaseline(id)`는 현재 스냅샷을 읽기 전에 캡처한 번들 stat 값을 반환합니다. `fetchBundle()`은 HTTP 라우트와 같은 응답을 반환합니다. 즉 지연 번들 응답과 요청마다 읽는 패키지 자산입니다. `rebuilt(id)`는 엔트리 재시작 없이 재빌드된 번들을 게시합니다. 파일시스템 메타데이터에서 리비전을 도출하고, 리비전이 바뀔 때만 새 바이트를 읽고 그래프를 재구성하고 알림을 보냅니다. 엔트리 재시작은 대신 조정을 통해 게시합니다. `onRebuilt`는 바뀐 번들마다 새 리비전과 함께 발생하고, `onGraphChanged`는 그래프를 재구성한 모든 플러시 뒤에 발생하며(행 추가·제거 또는 재빌드 리비전 변경) 풀 모델입니다. 즉 리스너가 `graph()`를 다시 읽습니다. 두 알림 경로 모두 리스너 예외를 격리하므로 throw하는 구독자 하나가 이후 구독자를 건너뛰거나 플러시를 촉발한 대상을 죽일 수 없습니다.

[`dsh-client-hmr`](../../packages/client/hmr/README.md)이 배포되는 Web 구성에서 라이브 그래프 스냅샷을 전달합니다. Host는 기존 그래프 변경 알림을 즉시 전달하고, 재연결은 현재 전체 그래프를 보냅니다. 그래프는 Host 정리가 완료되었다고 단언하지 않고 원하는 브라우저 엔트리를 설명합니다. 그 산출물 폴링은 재빌드된 리비전을 따로 보고합니다. 소스 맵 변경만으로는 리로드가 촉발되지 않습니다. 새 콤보 맵 URL은 번들 리비전이 바뀐 뒤에만 나타나고, 각 맵 본문은 첫 `GET`에서 고정됩니다. 클라이언트 모듈은 스냅샷을 검증하고 조정을 그 재빌드들과 직렬화하며, 부트가 만든 엔트리 맵, 단일 리소스 도착, 비동기 제거, 미사용 모듈·스타일 정리, 페이지 로컬 재시도 상태를 소유합니다. 정적 플랫폼 모듈과 부트스트랩은 페이지 수명을 유지하고, Electron 설치는 별도 흐름입니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclientmodules--clientmoduleregistry"></a>

### `ctx.clientModules` — `ClientModuleRegistry`

The web plugin table service: incremental `dsh.client` scan + wire composition + bundle and package-asset route + index injection rows. Construction runs the activation scan synchronously — a malformed declaration or missing bundle among the already-loaded entries aggregates into one loud throw (FAILED fiber; the boot activation audit reports it).

```ts cordis-catalog
/**
 * Current composed entry graph (stable object between changes).
 * @returns the graph served as `window.__DSH_BOOT__`.
 */
graph(): WebBootGraph

/**
 * Absolute path of an entry's client bundle.
 * @param id - entry id (package name).
 * @returns the path, or undefined for an unknown id.
 */
clientPath(id: string): string | undefined

/**
 * Serve an advertised revisioned bundle, source map, chunk, or package asset
 * without a Web server. Unknown URLs return 404, unsupported methods return
 * 405, and `HEAD` returns the same immutable headers without materializing a
 * body. Each bundle body is built once on its first `GET`; script
 * construction never reads maps. A package asset is read on every request
 * and answers 304 without a body when `If-None-Match` equals its entity tag;
 * its body holds the file open until the caller consumes or cancels it. A
 * bundle, map, or chunk body is the held buffer itself, not a copy, so a
 * caller must not modify its bytes.
 * @param request - shell-carrier request for a `/plugins` resource.
 * @returns the exact response also exposed by the optional Web route.
 */
async fetchBundle(request: Request): Promise<Response>

/**
 * Filesystem baseline captured before an entry's current bytes were read.
 * HMR compares it with the live files when installing a watch, so a write
 * between startup composition and watch installation cannot disappear into
 * the watcher's initial state.
 * @param id - entry id (package name).
 * @returns the path and baseline, or undefined for an unknown id.
 */
artifactBaseline(id: string): ClientArtifactBaseline | undefined

/**
 * Publish one completed bundle generation (the HMR watch's registration
 * hook; an entry restart publishes through reconciliation instead).
 * Unchanged mtime, ctime and size preserve the graph without reading the bundle.
 * @param id - entry id (package name).
 * @returns the current artifact rev, or undefined for an unknown id.
 */
rebuilt(id: string): string | undefined

/**
 * Subscribe to bundle rebuilds; fires when {@link rebuilt} changes a rev. A rev an
 * entry restart publishes reaches only {@link onGraphChanged} listeners.
 * @param listener - receives the entry id and its new bundle rev.
 * @returns the unsubscriber.
 */
onRebuilt(listener: (id: string, rev: string) => void): () => void

/**
 * Fires after any flush that recomposed the graph (row added/removed, or a
 * rebuilt rev change). Pull model: listeners re-read {@link graph}.
 * @param listener - notified with no payload.
 * @returns the unsubscriber.
 */
onGraphChanged(listener: () => void): () => void
```

Source: [`packages/client/modules/src/index.ts`](../../packages/client/modules/src/index.ts)
<!-- END GENERATED cordis-surface -->
