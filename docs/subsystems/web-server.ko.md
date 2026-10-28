# HTTP 서버

[English](web-server.md) | [中文](web-server.zh.md) | 한국어

[dsh-host-webserver](../../packages/host/webserver)는 GUI 호스트의 브라우저 HTTP 캐리어입니다. `node:http` 서버 하나(`tls`가 구성되면 `node:https`)로 `ctx.webServer`, 이름 있는 라우트 레지스트리, 선택적 gzip 응답 압축, index.html 변환 콜백, 그리고 플러그인이 차지할 수 있는 폴백 하나(핸들러 또는 리소스)를 제공합니다. 에이전트 루프의 일부도, 기능 seam도 아닙니다. 이 패키지의 유일한 하네스 개념은 index 렌더가 대변하는 Peer이며, `/api` 브리지, 플러그인 번들, HMR 이벤트 스트림을 포함한 모든 기능 라우트는 다른 플러그인이 등록합니다([계층 참조](../../packages/boot/app-boot/README.md)). 브라우저에만 서비스합니다. Electron은 빌드된 파일을 `file://`로 로드하고 fetch 요청은 이 서버 대신 IPC 브리지를 통해 보냅니다.

출처: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

## 라우트

```ts type-equiv
/** Route match kind: 'exact' matches the pathname verbatim; 'prefix' p matches p and p/<anything>. */
type WebRouteKind = 'exact' | 'prefix'
```

```ts type-equiv
/** One named route registration. */
interface WebRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Owns the full response lifecycle (may hold the response open, e.g. SSE). */
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}
```

```ts type-equiv
/**
 * Answers one GET or HEAD request with a Fetch response. An HTTP request
 * arrives without a Peer and carries the client's headers; an in-process
 * {@link WebServer.readResource} read passes the Peer its caller admitted.
 */
type WebResource = (request: Request, peer?: PeerScope) => Promise<Response>
```

```ts type-equiv
/** One named route answered by a resource instead of a handler. */
interface WebResourceRoute {
  kind: WebRouteKind
  /** Absolute pathname, no trailing slash. */
  path: string
  /** Answers HTTP GET and HEAD requests and in-process reads. */
  resource: WebResource
}
```

매치 순서는 고정입니다. 먼저 정확 테이블, 다음 가장 긴 일치 접두사, 마지막으로 등록된 폴백입니다. 등록 순서는 요청 관점의 의미를 갖지 않습니다. 이름 있는 라우트는 서로 겹치지 않도록 구성되고, 폴백 자리는 어떤 이름 있는 라우트도 차지하지 않은 요청에 응답하며, 소유자는 하나뿐이라 두 번째 등록은 throw합니다. 배포되는 Web 구성은 [`dsh-host-frontend-static`](../../packages/host/frontend-static/src/index.ts)으로 그 자리를 차지하며, SPA dist 서버는 잠긴 시맨틱을 따릅니다. Connection이 HTML을 읽기 전에 dist 루트와 구성된 index를 인증하고, index가 아닌 자산은 공개로 남으며, GET/HEAD가 아니면 405, dist 루트 밖 순회는 403, 존재하는 파일은 직접 서비스하고, 없거나 파일이 아닌 대상은 빈 404 응답이며, 알 수 없는 확장자는 octet-stream으로 전달됩니다.

라우트나 폴백은 핸들러 대신 리소스, 즉 Fetch `Request`에서 `Response`로 가는 함수를 줄 수 있습니다. HTTP `GET`과 `HEAD` 요청은 Peer 없이 도달하고, `readResource(request, peer)`는 호출자가 허용한 Peer를 위해 프로세스 내에서 이를 읽습니다. 읽기는 같은 매치 순서를 따르지만 리소스에만 도달하므로, 소유자 전용 데이터를 반환하거나 동작을 수행하는 라우트는 `GET`에 응답하더라도 핸들러로 남습니다.

<a id="config"></a>

## 구성

```ts type-equiv
/** Web server listen, TLS, and response-compression config. */
interface Config {
  /**
   * Listen address: a concrete IPv4 or IPv6 literal of one local interface,
   * for example the container's own Pod address from `hostname -i`. A loopback
   * literal (any address in 127/8, `::1`, or a mapped form of either) keeps the
   * server on this machine; any other literal serves the network that address
   * belongs to, over plain HTTP unless `tls` is set. The unspecified address —
   * IPv4 any, IPv6 any, and the IPv4-mapped forms of IPv4 any — is rejected at
   * load: it would expose the port on every interface at once.
   */
  host: string
  /** Listen port; zero requests an OS-assigned port. */
  port: number
  /**
   * Serve HTTPS with this certificate and key instead of plain HTTP. Both files
   * are read once, before the listener binds: an unreadable or empty file,
   * invalid PEM, or a key that does not match the certificate rejects
   * initialization rather than falling back to HTTP. The material is never
   * re-read, so replacing a certificate takes a reload. Omitted or null listens
   * over plain HTTP.
   */
  tls?: TlsConfig
  /** Response compression for socket-backed HTTP requests. @default 'none' */
  compression?: 'none' | 'gzip'
  /** Gzip DEFLATE level from 0 through 9. @default 1 */
  compressionLevel?: number
  /** Minimum known response length eligible for gzip; unknown-length streams are eligible. @default 1024 */
  compressionThresholdBytes?: number
}
```

```ts type-equiv
/**
 * TLS material for the HTTPS listener: one certificate chain file and the
 * private key file it pairs with. Both hold PEM text and both resolve against
 * the process working directory.
 */
interface TlsConfig {
  /** Certificate chain file, leaf certificate first, PEM, no passphrase. */
  certFile: string
  /** Private key file for the chain's leaf certificate; unencrypted PEM. */
  keyFile: string
}
```

어떤 구성도 모든 인터페이스를 한 번에 바인드할 수 없습니다. 지정되지 않은 주소는 로드 시점에 거부됩니다. 내보내는 `isWildcardHost`와 `isLoopbackHost`는 파싱된 값으로 바인드 주소를 분류하며, IPv6 `%zone`은 `listen`을 위해 유지되고 분류는 주소만 읽습니다. 캐리어는 인증이나 Origin 정책을 소유하지 않으며, `tls`가 인증서와 키를 제공하지 않는 한 평문 HTTP로 서비스합니다. `compression`의 기본값은 `none`이고, 배포되는 Web 번들은 1024바이트 임계값에 gzip 레벨 1을 선택합니다. 배포되는 `dsh web` 명령은 기본으로 루프백을 선택하고 구체적인 `--host` 주소 하나를 받으며, 루프백이 아닌 바인드가 평문 HTTP를 서비스하면 시작 시 경고합니다. 그 Connection 플러그인은 모든 Host API 라우트와 스트림에 Host/Origin 검사와 브라우저 세션 인증을 제공하고, 바인드 주소와 `--trusted-host`가 어떤 브라우저 Host를 허용할지 결정하며, `--public-url`은 광고되는 URL만 바꿉니다. 다른 구성은 자기 바인드와 라우트 인증 정책을 소유합니다. dist 위치는 그 자리를 차지하는 프론트엔드 플러그인의 어셈블리 사실입니다.

## 서비스

`WebServer`(`ctx.webServer`)는 활성화되면 즉시 listen합니다. listen 실패(EADDRINUSE 등)는 초기화를 거부하고 부트 프로세스가 실패한 fiber를 보고합니다. `tls` 쌍은 리스너가 바인드되기 전에 한 번 읽히며, 읽을 수 없거나 비어 있거나 짝이 맞지 않는 쌍은 HTTP로 폴백하는 대신 같은 방식으로 초기화를 거부합니다. `register(route)`는 이름 있는 라우트 하나를 추가하고 그 disposer를 반환합니다. 중복 `(kind, path)`는 throw합니다. 라우트 패턴은 구성 수준 계약이고 충돌은 구성 오류이기 때문입니다. Gzip은 서버 내부에서 소켓 기반의 해당 응답을 감싸므로 핸들러는 직접 `ServerResponse` 소유권을 유지하고, 리소스는 서비스에 되쓸 `Response`를 넘깁니다. 기존 콘텐츠 인코딩, `Cache-Control: no-transform`, ranges, SSE, ZIP, 패키징된 `.gz` Worker 이미지는 항등 응답으로 남습니다. `collectIndexInjections(peer)`는 페이지가 대변하는 Peer를 전달하는 `webserver/index-inject` emit 하나로 구조화된 `IndexInjection` 행을 모으고, `renderIndex(html, peer)`는 성공한 루트와 구성된 index 응답에 이를 렌더링한 뒤 원시 `tapIndex(transform)` 탈출구 변환을 등록 순서대로 적용합니다. [dsh-client-modules](../../packages/client/modules)가 부트 매니페스트 행으로 그 이벤트에 응답합니다. `port`는 `config.port`가 0일 때 OS가 할당한 포트를 포함해 listening 포트를 읽고, `protocol`은 리스너가 서비스하는 스킴(`http:` 또는 `https:`)을 보고합니다.

처리가 throw하는 요청(잘못된 %-escape가 `decodeURIComponent`에 걸리거나 클라이언트가 본문 중간에 끊는 경우)은 경고로 기록되고 400으로 응답되며, 헤더가 이미 나간 상태라면 소켓이 파괴됩니다. 프로세스 종료는 없습니다. 폐기는 `close()`와 `closeAllConnections()`를 함께 씁니다. 핸들러가 응답을 열린 채 유지할 수 있고(SSE) 그런 연결은 스스로 끝나지 않으므로, 강제 종료가 없으면 정리가 멈춥니다. TLS 소켓은 핸드셰이크 이후에야 연결로 집계되므로 서버는 업그레이드된 소켓 옆에 원시 TLS 소켓을 추적하고 폐기 시 둘 다 파괴합니다. 이 패키지는 아무것도 출력하지 않습니다. URL 줄은 셸의 몫입니다. 개발 모드 번들 워치 파이프라인을 포함한 패키지별 운영 세부 사항은 [README](../../packages/host/webserver/README.md)에 있습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconnection--hostconnectionhandle"></a>

### `ctx.connection` — `HostConnectionHandle`

Host `ctx.connection` members consumed by transport-independent adapters.

```ts cordis-catalog
/**
 * Compose exact Fetch routes and the shared-channel RPC interceptor.
 * @param channel - shared channel mounted by Connection.
 * @returns Fetch handler for trusted, authenticated requests.
 */
createSharedFetchHandler(channel: '/api'): ConnectionFetchHandler

/**
 * Apply Connection's Host/Origin checks and browser authentication to
 * another Web route.
 * @param request - request headers from the HTTP or upgrade request.
 * @returns rejection status, or undefined when the route may accept the request.
 */
requestRejection(request: ConnectionTrustRequest): ConnectionRequestRejection

/**
 * Admit an HTTP request against its signed browser or API credential and live Peer.
 * @param request - request headers from the HTTP or upgrade request.
 * @returns the credential's Peer, or the rejection status.
 */
admit(request: ConnectionTrustRequest): PeerAdmission

/**
 * Create an independent in-process Peer, disposed with the Context that read `ctx.connection`.
 * @param options - fixed principal and optional interaction participation (default `answer`).
 * @returns a new Peer distinct from every other Peer.
 */
createPeer(options: { readonly principal: Principal; readonly interactions?: 'answer' | 'none' }): PeerScope

/**
 * Claim a physical socket for an API Peer; browser sockets share their owner Peer.
 * @param request - authenticated upgrade request headers.
 * @returns the Peer and idempotent release, or 409 for duplicate API ownership.
 * The carrier releases on socket termination or failed upgrade; release removes
 * API admission synchronously without cancelling independent HTTP calls.
 */
admitConnection(request: ConnectionTrustRequest): ConnectionAdmission

/**
 * Authenticate one frontend index request, owning a token redirect or 401.
 * The cookie this mints is `Secure` when the mounted Web carrier serves TLS,
 * which only that listener's protocol decides.
 * @param request - root or configured-index HTTP request.
 * @param response - response owned when the result is false.
 * @returns true only when the frontend may serve index.html.
 */
authorizeIndex(request: ConnectionIndexRequest, response: ConnectionIndexResponse): boolean

/**
 * Add the fresh process token to an ordinary Web application URL.
 * @param baseUrl - clean application URL whose authority and mount are preserved.
 * @returns tokenized URL for initial login; a mount proxy strips its prefix before {@link authorizeIndex}.
 */
authenticatedUrl(baseUrl: string): string
```

Types: [Principal](typert.ko.md)

Source: [`packages/client/connection/src/rpc.ts`](../../packages/client/connection/src/rpc.ts)

<a id="ctxwebapp--webapp"></a>

### `ctx.webApp` — `WebApp`

The Web GUI this process serves, provided by the `web-runtime` row.

```ts cordis-catalog
/**
 * The URL this GUI advertises, also used for `DSH_WEB_URL` and the startup URL line.
 * @returns the configured `publicUrl`, otherwise the listener origin.
 */
getAdvertisedUrl(): string
```

Source: [`packages/bundle/web-app/src/index.ts`](../../packages/bundle/web-app/src/index.ts)

<a id="ctxwebserver--webserver"></a>

### `ctx.webServer` — `WebServer`

The browser HTTP carrier service. Activation loads any configured TLS material, then listens immediately; a material or listen failure rejects initialization, and the boot process reports the failed fiber. Route registration order does not affect requests because configured named routes must be distinct, and a request no named route matches is answered 404 until the fallback owner registers.

```ts cordis-catalog
/**
 * The root URL local clients use to reach the bound listener: the protocol,
 * the {@link bindUrlHost} form of the bind address, and the listening port.
 * @returns the origin, for example `http://127.0.0.1:3080`.
 * @throws before `listen` binds a port, or when the bind address has no URL form.
 */
getOrigin(): string

/**
 * Register a named route. Duplicate (kind, path) throws — route patterns are
 * a composition-level contract, so a collision is a misconfiguration.
 * @param route - kind, path, and the owning handler or resource.
 * @returns the disposer removing the route.
 */
register(route: WebRoute | WebResourceRoute): () => void

/**
 * Register an exact-path HTTP upgrade route. Duplicate paths throw because
 * one socket can have only one protocol owner.
 * @param route - pathname and handler owning negotiation plus socket use.
 * @returns the disposer removing the route.
 */
registerUpgrade(route: WebUpgradeRoute): () => void

/**
 * Claim the fallback seat: the handler or resource answering every request
 * no named route matches (the SPA dist server in the shipped Web
 * composition). One owner only — a second registration throws, because two
 * fallbacks cannot compose.
 * @param fallback - a handler owning the full response lifecycle of
 * unmatched requests, or `{ resource }` answering them.
 * @returns the disposer releasing the seat.
 */
registerFallback(fallback: WebRoute['handler'] | Pick<WebResourceRoute, 'resource'>): () => void

/**
 * Read the response an HTTP request for the same URL would receive, as the
 * resource computes it for `peer`, without an HTTP exchange. The request
 * path picks the responder by the HTTP match order — exact, longest prefix,
 * then the fallback — and only a resource answers. This method checks no
 * cookie, Host, or Origin: the caller admits the reader before reading.
 * @param request - the read; its URL path selects the responder.
 * @param peer - the Peer the read speaks for, passed to the resource.
 * @returns the resource's response, without a body for HEAD as over HTTP;
 * 405 with `Allow: GET, HEAD` for any other method, checked before matching,
 * where over HTTP a handler route or an unmatched path answers such a
 * method itself; 404 when the path matches a handler route, or reaches the
 * fallback seat while it is unclaimed or holds a handler. A resource that
 * throws rejects the read, where an HTTP request would receive 400.
 */
async readResource(request: Request, peer: PeerScope): Promise<Response>

/**
 * Register a raw-HTML index transform, the escape hatch for markup no
 * {@link IndexInjection} row expresses: {@link renderIndex} applies taps in
 * registration order after rendering the structured rows.
 * @param transform - pure html-to-html function.
 * @returns the disposer removing the transform.
 */
tapIndex(transform: (html: string) => string): () => void

/**
 * Run an index.html body through the registered taps in registration order
 * — called by the fallback owner on every index response it renders.
 * @param html - the raw index.html body.
 * @returns the transformed body.
 */
applyIndexTaps(html: string): string

/**
 * Gather the structured injection table for one Peer: one
 * `webserver/index-inject` emit, every subscriber pushes its current rows.
 * Fresh per call, so subscribers read live state (module graph, theme
 * preference, the Peer's access) at emit time.
 * @param peer - the Peer the page speaks for.
 * @returns rows in subscriber activation order.
 */
collectIndexInjections(peer: PeerScope): IndexInjection[]

/**
 * Render one index.html body for one Peer: the structured injection table
 * first, then the raw `tapIndex` transforms over the result.
 * @param html - the raw index.html body.
 * @param peer - the Peer the page speaks for.
 * @returns the transformed body.
 */
renderIndex(html: string, peer: PeerScope): string
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)

<a id="connection-events"></a>

### `connection/*` events

<a id="connectionrequest--waterfall"></a>

#### `connection/request` — waterfall

Admit or wrap an authenticated shared API request, including body transfer. Existing requests continue when a listener refuses subsequent requests.

```ts cordis-catalog
/**
 * Admit or wrap an authenticated shared API request, including body transfer.
 * Existing requests continue when a listener refuses subsequent requests.
 * @param request - Authenticated incoming HTTP request.
 * @param response - Response owned until the delegated bridge settles.
 * @param next - Delegate to the next listener or the shared API bridge.
 * @mode waterfall
 */
'connection/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>
```

Source: [`packages/client/connection/src/index.ts`](../../packages/client/connection/src/index.ts)

<a id="webserver-events"></a>

### `webserver/*` events

<a id="webserverindex-inject--emit"></a>

#### `webserver/index-inject` — emit

Collect the structured index injection table for the page `peer` speaks for. Emitted on every index render and every worker boot-payload request; listeners push their current rows, so a row's data is read fresh at emit time.

```ts cordis-catalog
/**
 * Collect the structured index injection table for the page `peer` speaks
 * for. Emitted on every index render and every worker boot-payload
 * request; listeners push their current rows, so a row's data is read
 * fresh at emit time.
 * @param table - Mutable row table; listeners append in activation order.
 * @param peer - The Peer the rendered page speaks for.
 * @mode emit
 */
'webserver/index-inject'(table: IndexInjection[], peer: PeerScope): void
```

Source: [`packages/host/webserver/src/index.ts`](../../packages/host/webserver/src/index.ts)
<!-- END GENERATED cordis-surface -->
