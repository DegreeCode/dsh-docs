# Typert 원격 호출

[English](typert.md) | [中文](typert.zh.md) | 한국어

생성된 Remote 아티팩트, Host Gateway, 소비자 API 어셈블리가 공유하는 타입입니다. [Typert Gateway Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md)가 아키텍처와 전송 결정을 소유하며, 이 페이지는 [`dsh-typert-protocol`](../../packages/typert/protocol/src/types.ts)과 [`dsh-api-gateway`](../../packages/api/gateway/src/types.ts)의 리터럴 공개 계약을 기록합니다.

## Lookup과 Context 선언

비즈니스 객체 패키지는 선언 병합으로 두 개의 빈 맵을 확장합니다. lookup은 Host 객체 타입 하나를 그 와이어 아이덴티티에 연결하고, Context 선언은 범위 지정된 Context 종류 하나를 그 와이어 아이덴티티에 연결합니다. 생성된 디스크립터가 이 키들을 지정하며, 런타임 제공자가 실제 해석 동작을 제공합니다.

```ts type-equiv
/** Merge-extensible Host object lookup declarations. */
interface TypertLookupMap {}
```

```ts type-equiv
/** Merge-extensible scoped Context declarations. */
interface TypertContextMap {}
```

레지스트리는 리졸버가 언로드된 뒤에도 lookup의 와이어 선언을 유지합니다. 따라서 SRC 탐색은 그 매개변수를 계속 lookup으로 분류하고, 와이어 값을 일반 비즈니스 객체로 받아들이지 않고 사용 불가로 실패합니다.

```ts type-equiv
/** Stable wire declaration retained after a lookup provider unloads. */
interface TypertLookupDefinition {
  /** Merge-declared lookup key. */
  readonly key: string
  /** Source parameter name recognized by the SRC weak parser. */
  readonly parameter: string
  /** Wire field replacing the Host object parameter. */
  readonly wire: string
  /** Canonical Host type symbol used by strict generation. */
  readonly hostTypeSymbol: string
  /** Canonical wire type symbol used by strict generation. */
  readonly wireTypeSymbol: string
}
```

## 호출 디스크립터

`InvocationDescriptor`는 와이어 메시지가 아니라 로컬 리플렉션입니다. Host와 소비자 빌드가 대응하는 디스크립터를 생성하며, 요청은 엔드포인트와 이름 있는 `args`만 보냅니다. strict 코덱은 생성된 스키마 팩토리를 담고, SRC 코덱은 구조적 타입 복구 없이 JSON 안전 입력을 강제합니다. 단항 결과 코덱은 바이트를 포함하는 하위 트리에 `encode()`를, 재귀적 네이티브 바이트 검증에 `decode()`를 제공할 수 있으며, Client 선언은 모든 `Uint8Array`를 `ArrayBuffer` 기반으로 좁힙니다. 순수 JSON 결과에는 바이트 탐지도 Client 디코딩도 필요하지 않습니다. 취소는 비즈니스 매개변수 뒤에 주입되는 대역 외 캐리어 신호이며 `args`에 들어가지 않습니다.

`createTypertRemoteInfo`는 `TypertRemoteInfo`를 구현하는 지연 클래스 인스턴스를 반환하며, 이 인터페이스는 마운트 가능한 `TypertRemoteContribution`을 확장합니다. 그 `methods` 인덱스는 `descriptors`의 직접 객체를 별칭으로 가리킵니다. 각 `TypertRemoteMethod`는 이름 있는 `input(options?)`과 `invoke`를 추가하고, 메서드와 그 매개변수의 문서를 유지하며, `result`를 유일한 출력 코덱으로 사용합니다. 단항 `mode`는 없고, 스트림 `mode`는 `'stream'`입니다. Context 전용 수신자는 디스크립터와 범위 지정 선언에 남습니다. 레지스트리 조회는 기본 디스크립터를 반환하고, `isTypertRemoteMethod`는 엔드포인트별 제네릭을 복구하지 않고 생성된 직접 기능을 좁힙니다.

`TypertSchema`는 임의의 Zod 연산이 아니라 파싱을 보장하지만, 원시 팩토리 명세는 Zod 팩토리를 요구합니다. 문서 누락이나 지원되지 않는 선택적 JSON Schema 프로젝션은 일반 메서드를 무효화하지 않습니다. info 인덱스와 각 입력 정책 뷰, 파서, 파생 프로젝션은 독립적으로 지연 생성되고 캐시되며, 어떤 메타데이터나 스키마 접근도 네트워크를 호출하지 않습니다. [프로토콜 참조](<../../packages/typert/protocol/README.md>)가 이 API들을 정의하고, [생성기 참조](<../../packages/typert/generator/README.md#ordinary-remote-metadata>)가 별도의 Host `./typert`, 소비자 `./remote`, Client `./client/typert` 아티팩트를 정의합니다.

`TypertRemoteSpec`은 패키지와 엔드포인트로 키가 지정된 `TypertRemoteMethodSpec` 값들을 담습니다. 순서 있는 각 `TypertRemoteParameterSpec`은 같은 체커 해석 타입 모델의 일반 `codec` 및 `strictCodec` 팩토리를 담고, 런타임이 아이덴티티, 와이어 이름 기본값, 이름 있는 호출 뷰를 도출합니다. `TypertRemoteInputOptions`에는 `strict?: boolean`만 있고, `method.input(options?)`은 Host 디스패치나 `result`를 바꾸지 않고 일치하는 파싱과 선택적 문서/프로젝션을 가진 캐시된 `TypertRemoteValue<T>`를 선택합니다. `RemoteDecoded<T>`는 임의 파서 출력을 좁히지 않고 캐리어가 재구성한 단항 결과를 설명합니다.

```ts type-equiv
/** Codec attached to one invocation parameter or result. */
type TypertCodec<Value = unknown> =
  | TypertRemoteValue<Value> & {
    readonly mode: 'strict'
    readonly typeSymbol: string
    /**
     * Decode a unary result whose fields require type-specific handling.
     * @param value - result reconstructed by the RPC carrier.
     * @returns the validated result, retaining native byte views.
     */
    readonly decode?: ((value: unknown) => unknown) | undefined
    /**
     * Project typed binary fields into RPC result attachments.
     * @param value - native unary result.
     * @param writeBytes - records a byte view at its result-relative path and returns its JSON placeholder.
     * @returns JSON metadata with untouched JSON subtrees retained.
     */
    readonly encode?: ((value: unknown, writeBytes: (bytes: Uint8Array, path: readonly (string | number)[]) => null) => unknown) | undefined
  }
  | {
    readonly mode: 'src-json'
  }
```

```ts type-equiv
/** One ordered business parameter in a Remote invocation. */
interface InvocationParameterDescriptor {
  /** Source-level parameter name. */
  readonly name: string
  /** Source parameter documentation, independent of JSON Schema support. */
  readonly description?: string
  /** Required key in the wire `args` object. */
  readonly wire: string
  /** Whether the value is JSON or requires a registered Host lookup. */
  readonly source: 'json' | 'lookup'
  /** Lookup key when `source` is `lookup`. */
  readonly lookup?: string
  /** Boundary codec for the wire representation. */
  readonly codec: TypertCodec
  /** Missing wire fields decode to `undefined` only for an explicitly declared `T | undefined`. */
  readonly acceptsUndefined?: true
}
```

```ts type-equiv
/** Carrier-independent description of one exported method invocation. */
interface InvocationDescriptor {
  /** Globally stable generated identity. */
  readonly id: string
  /** Cordis service key owning the method. */
  readonly service: string
  /** Wire namespace, defaulting to the service key. */
  readonly namespace: string
  /** Public instance method name. */
  readonly method: string
  /** Service member invoked when the exported method name is an alias. */
  readonly implementation?: string
  /** Absent for unary calls; stream calls deliver every yielded item as the Host produced it. */
  readonly mode?: 'stream'
  /** Receiver selection mode. */
  readonly invocation:
    | { readonly kind: 'direct' }
    | {
      readonly kind: 'context'
      readonly context: string
      readonly wire: string
      readonly codec: TypertCodec
    }
  /** Optional consuming-Context projection for one direct lookup parameter. */
  readonly scope?: {
    /** Context kind whose Client adapter supplies the identity. */
    readonly context: string
    /** Lookup parameter wire field replaced by the Context identity. */
    readonly wire: string
  }
  /** Ordered business parameters. */
  readonly parameters: readonly InvocationParameterDescriptor[]
  /**
   * Client-to-Host items of the same logical stream, generated from the `In`
   * type argument of the method's `RemoteStream<Out, In>` return type; absent
   * when `In` is `never`. The method reads the items through
   * `RemoteInvocation.uplink()`, so nothing enters the parameter list.
   */
  readonly uplink?: {
    /** Codec validating every uplink item before `uplink()` delivers it. */
    readonly codec: TypertCodec
  }
  /** Transport cancellation injected after business parameters instead of entering wire args. */
  readonly cancellation?: {
    /** Reserved final Host method parameter. */
    readonly parameter: 'signal'
  }
  /** Codec for the unary result or each yielded stream item. */
  readonly result: TypertCodec
  /** Source-owned method documentation; ordinary methods need not have JSDoc. */
  readonly description?: string
  /** Source declaration used only for diagnostics. */
  readonly sourceLocation?: InvocationSourceLocation
}
```

Host 별칭 `RemoteStream<Out, In>`은 한 스트림의 양방향을 나타내며, 수신 메서드는 호출 컨텍스트를 `this.ctx.invocation`으로 읽습니다:

```ts type-equiv
/**
 * One Remote stream as a Host method returns it: the items it yields to the
 * Client, iterated as a plain `AsyncIterable<Out>`. `In` is the type of the
 * items the Client may send back on the same logical stream, read through
 * `RemoteInvocation.uplink()`; it is carried only as a type-level marker. The
 * default `never` declares a method that reads none, and its descriptor
 * carries no uplink codec. A generated Client stream method returns the same
 * stream as a `RemoteStreamHandle<Out, In>`.
 * @template Out - item type the Host method yields.
 * @template In - item type the Client may send; `never` when the method reads none.
 */
type RemoteStream<Out, In = never> = AsyncIterable<Out> & { readonly [STREAM_UPLINK]?: In }
```

```ts type-equiv
/**
 * One open Remote stream as the Client holds it: the downlink items as an
 * `AsyncIterable`, plus the uplink and cancellation of the same logical
 * stream. A generated Client stream method returns it, and calling that
 * method opens the stream: a holder that neither iterates nor disposes the
 * handle keeps the Host stream alive. A handle stands for one generation:
 * when the carrier is lost, iteration fails with the carrier error and the
 * handle is finished.
 * @template Out - item type the Host method yields.
 * @template In - item type the Client may send; `never` when the method reads none.
 */
interface RemoteStreamHandle<Out, In> extends AsyncIterable<Out> {
  /**
   * Send one uplink item. Items sent before the stream has opened are queued
   * and sent once the `open` frame is on the wire. A top-level `undefined`
   * travels as an `item` frame without `value`.
   * @param item - item the Host validates against the method's uplink codec.
   * @throws {Error} when the item is not a lossless JSON value, when `end()`
   * was called, or once the stream has terminated.
   */
  send(item: In): void
  /** Half-close the uplink: the Host's `uplink()` iteration ends. Idempotent; ignored after termination. */
  end(): void
  /**
   * Cancel the logical stream: send `cancel` unless a terminal frame has
   * arrived, and end the downlink iterator quietly. Breaking out of
   * `for await` early does the same.
   */
  dispose(): void
}
```

```ts type-equiv
/**
 * Merge-extensible caller identities. Each driver declares its own entry.
 * Every entry is a JSON value with a unique literal `kind`, carries no
 * credential, and is safe to persist in a Session log.
 */
interface PrincipalMap {
  /** The local user who owns this Host. */
  owner: { readonly kind: 'owner' }
}
```

```ts type-equiv
/** One caller identity; the authorization layer reads only this. */
type Principal = PrincipalMap[keyof PrincipalMap]
```

```ts type-equiv
/**
 * One Peer's session on this Host. Its creator owns it: `ctx` is the Cordis
 * scope that owns connection-lifetime registrations and is disposed with the
 * Peer, and `principal` is the caller identity fixed when the Peer was created.
 */
interface PeerScope {
  readonly id: PeerId
  /** Connection-lifetime registrations; disposed with the Peer. */
  readonly ctx: Context
  /** Caller identity fixed at creation by in-process Host code; no wire field can set it. */
  readonly principal: Principal
  /** Aborted once the Peer is disposed; Remote streams that speak for the Peer end with it. */
  readonly signal: AbortSignal
  /** Whether the Peer may open a forwarded-event stream; this does not grant business permissions. */
  readonly interactions: 'answer' | 'none'
  /**
   * Tear down every registration made through `ctx`.
   * @returns settles once the scope has quiesced; racing calls share one completion.
   */
  dispose(): Promise<void>
}
```

```ts type-equiv
/** Carrier capacity for buffered uplink frames of one logical stream. */
interface RemoteUplinkWindow {
  /** Maximum complete encoded frame bytes waiting for the Host consumer. */
  readonly maxBytes: number
  /** UTF-8 envelope bytes added to a compact JSON item with a present value field. */
  readonly frameOverheadBytes: number
}
```

```ts type-equiv
/**
 * The context of one Remote call, reachable inside the receiving method as
 * `this.ctx.invocation`. The Gateway derives the receiver from a Context that
 * carries it, so no parameter is injected and nothing crosses the wire.
 */
interface RemoteInvocation {
  readonly request: {
    readonly namespace: string
    readonly method: string
    readonly args: Readonly<Record<string, unknown>>
  }
  /** Cordis service key of the receiving Service. */
  readonly service: string
  /** Peer the call speaks for; every carrier names it explicitly. */
  readonly peer: PeerScope
  /** Carrier cancellation: Client cancel, socket close, or an uplink failure. */
  readonly signal: AbortSignal
  /** Carrier frame capacity; absent when the carrier imposes no encoded-frame inbox limit. */
  readonly uplinkWindow?: RemoteUplinkWindow | undefined
  /**
   * The Client's uplink items for this call. Available once; a second call
   * throws. With an uplink codec on the descriptor every item is decoded to
   * `In`; without one items arrive as `unknown` after a JSON-safety check.
   * Iteration ends when the Client ends its uplink; when the method finishes
   * its downlink the Gateway calls the iterator's `return()` and unread items
   * are dropped. `In` is the caller's assertion: the runtime decodes by the
   * descriptor and does not cross-check it.
   * @template In - item type the caller reads; the descriptor codec decides what arrives.
   * @returns the single-consumer uplink iterable.
   */
  uplink<In = unknown>(): AsyncIterable<In>
}
```

## 원격 접근 리소스

모든 Remote 메서드는 [`dsh-api-remote-access`](../../packages/api/remote-access/README.md)의 접근 제어 아래에 있습니다. 비소유자 호출은 그 주체 종류의 정책이 호출이 건드리는 모든 리소스에 엔드포인트 작업을 나열한 역할을 결합할 때만 허용됩니다. 아이덴티티 타입을 소유한 패키지가 `TypertResourceMap`에 그 리소스 종류를 선언 병합하고, 아이덴티티가 없는 내장 리소스인 `global`은 그곳의 종류가 아닙니다. Gateway는 종류의 아이덴티티를 `@Remote({ resources })` 또는 `@RemoteScope(key, { resources })`의 `resources` 판독기에서 읽고, 없으면 그 종류를 `resource`로 선언한 lookup 매개변수나 범위 지정 Context에서, 그것도 없으면 `typert.resources`에 등록된 기본 필드나 리졸버에서 읽습니다. 어떤 리소스도 지정하지 않는 호출은 `global`을 건드립니다. [Peer 주체 Agent Note](../../.agents/notes/implemented/architecture/2026-10-12-peer-principal-and-remote-access.md)가 그 결정을 소유합니다.

```ts type-equiv
/**
 * Merge-extensible resource kinds whose identities a Remote call or forwarded
 * event may carry. The package that owns an identity type declares its kind;
 * the value is that kind's identity type, a string type such as a branded id.
 * `global` names the built-in identity-less resource and is never a kind here.
 */
interface TypertResourceMap {}
```

```ts type-equiv
/** One resource kind: the built-in `global` kind or a declared kind. */
type RemoteAccessResourceKind = 'global' | TypertResourceKind
```

```ts type-equiv
/**
 * One resource a call or forwarded event touches: `global`, or one identity
 * of a declared kind. Identities are wire values, read before any lookup
 * resolves or validates them.
 */
type RemoteAccessResource =
  | { readonly kind: 'global' }
  | {
    [Kind in TypertResourceKind]: { readonly kind: Kind; readonly id: TypertResourceId<TypertResourceMap[Kind]> }
  }[TypertResourceKind]
```

```ts type-equiv
/**
 * Explicit endpoint and resource choices for one Remote Scope method.
 * @template WireArgs - the decorated method's positional parameters as the
 *   wire carries them; the default `never` admits readers of any tuple.
 */
interface RemoteScopeOptions<WireArgs extends readonly unknown[] = never> {
  /** Exported endpoint method; omission retains the implementation member name. */
  readonly name?: string
  /**
   * Per-kind readers of the resources one call touches. Each receives the
   * method's arguments as its own parameters, JSON arguments as their Typert
   * codecs validated them, a lookup parameter as its wire identity and a
   * cancellation parameter as the call's signal, so it performs plain reads
   * only, and returns one identity, several, or `undefined` for none. A
   * throw, an empty list, or an identity other than a non-empty string
   * refuses the call. For a kind without a reader, the Gateway reads the
   * identity of a scoped Context whose Host adapter declares that `resource`
   * and of lookup parameters declaring it, else the registered default of
   * `typert.resources`: a `resolve` function receiving the validated named
   * wire values and their ordered parameters, or a `field` naming a top-level
   * argument or, failing that, a field of the first object argument. A
   * throwing resolver, an array result, or a field holding an array refuses
   * the call. A call that carries no identity touches `global`. The readers
   * and these defaults together must name every resource the method accesses:
   * access control never checks a resource they omit.
   */
  readonly resources?: TypertResourceReaders<WireArgs>
}
```

```ts type-equiv
/**
 * Explicit endpoint, stream, and resource choices for one direct Remote method.
 * @template WireArgs - the decorated method's positional parameters as the
 *   wire carries them; the default `never` admits readers of any tuple.
 */
interface RemoteMethodOptions<WireArgs extends readonly unknown[] = never> extends RemoteScopeOptions<WireArgs> {
  /** `stream`: deliver each Iterable item over the shared logical-stream carrier. */
  readonly mode?: 'stream'
}
```

## Typert 레지스트리

`ctx.typert`는 현재 환경 디스크립터, 명시적으로 선택된 Remote 기여, lookup 제공자, 범위 지정 Context 제공자, 리소스 종류의 기본 필드나 리졸버를 분리합니다. lookup 제공자가 안정적인 와이어 선언과 기본 리졸버를 소유하며, Host 구성은 같은 키에 effect 범위의 동기 또는 비동기 리졸버를 구성할 수 있고, 그 구성을 언로드하면 기본 정책이 복원됩니다. 등록은 Cordis가 소유하는 effect이며 대기 가능한 disposer를 반환합니다.

```ts type-equiv
/** Minimal Typert runtime consumed through dependency inversion. */
interface TypertRegistryContract {
  readonly local: TypertLocalRegistry
  readonly remotes: TypertRemoteRegistry
  readonly lookups: TypertLookupRegistry
  readonly contexts: TypertContextRegistry
  readonly resources: TypertResourceRegistry
}
```

생성된 소비자 선언은 직접 네임스페이스를 `TypertClientRemote`가 상속하는 맵에 병합합니다.

```ts type-equiv
/** Merge-extensible direct namespace surface generated for Client Remote services. */
interface TypertRemoteNamespaceMap {}
```

## Host Gateway

Connection은 `ctx.typertGateway`를 호출하기 전에 캐리어 봉투를 디코드합니다. 요청은 정확한 이름 있는 와이어 필드, 캐리어의 취소 신호, 호출이 대변하는 Peer를 별도로 담습니다. 모든 캐리어와 프로세스 내 호출자가 그 Peer를 명시하며, Gateway는 dispose된 Peer를 `gateway/peer-disposed`로 거부합니다. 비소유자 호출의 경우 Gateway는 인수 검증 후 그리고 어떤 lookup이나 Context 해석 전에 리소스를 해석하고 `ctx.remoteAccess.decide()`를 묻습니다. 인프라와 경계 실패는 `TypertGatewayError`로 전달되며, 그 `gateway/*` 코드는 일반 `RemoteError` 코드이므로 RPC 어댑터는 구조적으로 식별된 모든 `RemoteError`를 코드와 세부 정보 그대로 전달하고 인식되지 않는 예외만 `gateway/internal`로 폴드합니다.

```ts type-equiv
/** One Remote method request after a carrier has decoded its envelope. */
interface InvokeRemoteRequest {
  /** Remote namespace selected by the generated descriptor. */
  readonly namespace: string
  /** Exported Service method name. */
  readonly method: string
  /** Named wire values; fields must exactly match the descriptor. */
  readonly args: Readonly<Record<string, unknown>>
  /**
   * Client uplink items of this logical stream, delivered to the method through
   * `invocation.uplink()`; absent means an immediately ended iterable.
   */
  readonly uplink?: AsyncIterable<unknown>
  /** Carrier-provided frame capacity; absent for carriers without an encoded-frame inbox limit. */
  readonly uplinkWindow?: RemoteUplinkWindow | undefined
  /** Peer the call speaks for; every carrier and in-process caller names it explicitly. */
  readonly peer: PeerScope
  /** Carrier or direct-caller cancellation injected only into cancellation-aware methods. */
  readonly signal?: AbortSignal
}
```

```ts type-equiv
/** Stable infrastructure and boundary failures emitted before or after business execution. */
type TypertGatewayErrorCode =
  | 'gateway/ambiguous-endpoint'
  | 'gateway/arguments-invalid'
  | 'gateway/binding-invalid'
  | 'gateway/context-failed'
  | 'gateway/context-not-found'
  | 'gateway/context-unavailable'
  | 'gateway/definition-unavailable'
  | 'gateway/input-invalid'
  | 'gateway/interactions-forbidden'
  | 'gateway/invocation-unavailable'
  | 'gateway/lookup-failed'
  | 'gateway/lookup-not-found'
  | 'gateway/lookup-unavailable'
  | 'gateway/method-unavailable'
  | 'gateway/peer-disposed'
  | 'gateway/protocol'
  | 'gateway/provider-mismatch'
  | 'gateway/result-invalid'
  | 'gateway/service-unavailable'
  | 'gateway/signature-invalid'
  | 'gateway/uplink-overflow'
```

```ts type-equiv
/** Host dispatcher consumed by Connection adapters. */
interface TypertGateway {
  /** Carrier adapter shared by WebSocket and in-process transports. */
  readonly wireStream: TypertGatewayWireStream
  /**
   * Check for an active owner Client event stream, the only kind that can answer forwarded waterfalls.
   * @returns whether an owner stream is open and has not been cancelled.
   */
  hasLiveClient(): boolean
  /**
   * Register the application-selected forwarded-event source.
   * @param source - stream factory installed by the Remote assembly.
   * @param host - stable Host facts included in each Client generation's opening frame.
   * @returns disposer removing this exact source and cancelling its active streams.
   */
  registerRemoteEvents(
    source: TypertRemoteEventSource,
    host: RemoteEventHostInfo,
  ): () => Promise<void>
  /**
   * Invoke one live Remote method without assuming a carrier or response envelope.
   * @param request - decoded endpoint and named wire arguments.
   * @returns the business result without output decoding.
   * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
   */
  invoke(request: InvokeRemoteRequest): Promise<unknown>
  /**
   * Open one live stream Remote method without assuming a physical carrier.
   * @param request - decoded endpoint, named wire arguments, and the Client uplink when the carrier has one.
   * @returns a cancellation-aware iterable over the business results.
   */
  stream(request: InvokeRemoteRequest): Promise<AsyncIterable<unknown>>
}
```

## Consumer Remote

`ctx.remote`는 import된 `/remote` 아티팩트가 기여한 네임스페이스만 노출합니다. `$mount()`는 생성된 디스크립터와 구체적 메서드를 하나의 fiber 소유 작업으로 설치합니다. 각 네임스페이스는 마운트된 메서드의 수명에 걸친 추적된 `remote.<namespace>` Cordis 자식 Service이며, JavaScript Proxy나 Host 비즈니스 Service 타입은 소비자에 들어가지 않습니다.

메타데이터 소유권은 연결 소유권과 분리되어 있으며, [레지스트리 참조](<../../packages/typert/registry/README.md>)가 오프라인 등록과 마운트 수명을 다룹니다.

```ts type-equiv
/** Client Remote capability implemented by the Gateway and consumed by Remote assemblies. */
interface TypertClientRemote extends TypertRemoteNamespaceMap {
  /**
   * Mount one generated Host-for-Client contribution in the caller's fiber.
   * @param contribution - explicitly selected Remote package artifact.
   * @returns disposer after namespace services and concrete methods are ready.
   */
  $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>
  /**
   * Subscribe to one forwarded Host event. Notifications run in registration
   * order and isolate failures; scoped waterfalls return, delegate through
   * `next()`, or reject the Host dispatch.
   * @template Event - forwarded event name selected by the Host assembly.
   * @param event - forwarded Host event name, unchanged on the wire.
   * @param listener - receives the Client projection of the Cordis `Events` declaration.
   * @returns disposer owned by the calling fiber.
   */
  $on<Event extends TypertRemoteEvent>(event: Event, listener: TypertClientEventListener<Event>): () => void
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxremoteaccess--remoteaccessservice"></a>

### `ctx.remoteAccess` — `RemoteAccessService`

Registry of access policies, the Gateway's access decisions, list filtering, and the per-Peer access snapshot. Every composition that mounts the Gateway mounts this service too.

```ts cordis-catalog
/**
 * Register the policy of one non-owner principal kind in the caller's
 * fiber; open snapshots are recomputed on registration and removal.
 * @param kind - the principal kind the policy serves; never `owner`.
 * @param policy - business-owned bindings and refusal reasons for principals of `kind`.
 * @returns disposer removing this policy.
 * @throws Error when `kind` already has a policy.
 */
registerPolicy<K extends Exclude<keyof PrincipalMap, 'owner'>>(kind: K, policy: RemoteAccessPolicy<PrincipalMap[K]>): () => void

/**
 * Report that the bindings or condition answers for `principal` may have
 * changed. Business packages call this on every grant, revocation, mode
 * change, and expiry; open snapshots re-push, and the next failure of each
 * policy is logged again.
 * @param principal - affected principal; omitted for every principal.
 */
invalidate(principal?: Principal): void

/**
 * Gateway-only: decide one request whose resources the Gateway resolved.
 * The owner is allowed, and so is `remoteAccess/follow`: every Peer reads
 * its own snapshot. Otherwise the action is allowed only when, on every
 * listed resource, some binding of the principal's policy names that
 * resource, has a role listing the action, and has no condition or a
 * condition that allows. `bindings()` is called once per decision.
 * @param request - the caller or recipient, the action, the resources it
 *   touches, and a call's arguments.
 * @returns `allow`; or `deny` with `no-allow` when the principal kind has
 *   no policy, the first refusing condition's reason on the first resource
 *   no binding allows, else `explain()`'s reason, else `no-allow`;
 *   `policy-failed` when `bindings()`, a condition, or `explain()` throws,
 *   logged once per policy until the next `invalidate()`. The Gateway
 *   throws `remote-access/denied` for a denied call and drops a denied event.
 */
decide(request: RemoteAccessRequest<Principal>): RemoteAccessDecision

/**
 * Filter items inside a Remote method. The invocation is read from the
 * Context that accessed this service, so call it as
 * `this.ctx.remoteAccess.allows(resource)` from the Remote method. Each
 * check reads the policy's bindings again, so a long-running stream sees
 * binding changes from the next check on.
 * @param resource - resource of one result item.
 * @returns true for the owner and outside a Remote call; otherwise whether
 *   the invocation's endpoint action is allowed on `resource` without call
 *   arguments, false when the policy is absent or fails.
 */
allows(resource: RemoteAccessResource): boolean

/**
 * The baseline a page opens with before its snapshot stream connects; every
 * index the webServer renders carries it under
 * {@link REMOTE_ACCESS_SNAPSHOT_KEY} for the Peer the page speaks for.
 * @param principal - the page's caller identity.
 * @returns the owner baseline for the owner; otherwise the principal's current grants.
 */
snapshotFor(principal: Principal): RemoteAccessBaseline

/**
 * Stream the calling Peer's access snapshot: one baseline, then `upsert`
 * and `remove` frames after each `invalidate()` and each policy
 * registration or removal that changes a grant. The owner receives only
 * `{ owner: true }`. The generation ends when `signal` aborts or this
 * service unloads, so a reloaded service starts every reader from a fresh
 * baseline.
 * @param signal - generation cancellation.
 * @returns the access frames of one generation.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<RemoteAccessFrame>
```

Source: [`packages/api/remote-access/src/index.ts`](../../packages/api/remote-access/src/index.ts)

<a id="ctxtypert--typertregistry"></a>

### `ctx.typert` — `TypertRegistry`

Registry of generated schemas, package reflection, invocations, and Remote dependency providers.

```ts cordis-catalog
/**
 * Register one generated contribution atomically for the calling fiber.
 * Duplicate package-face identities, schemas, invocation ids, or endpoints
 * reject the whole batch.
 * @param contribution - generated schemas, reflection, and Host invocations.
 * @returns the exact effect disposer that removes this contribution.
 */
register(contribution: TypertContribution): TypertDisposer

/**
 * Look up one schema by `<package>#<name>`.
 * @param key - global schema key.
 * @returns a record containing the cached schema, or `undefined` when absent.
 */
get(key: string): TypertSchemaRecord | undefined

/**
 * Resolve one required schema.
 * @param key - global schema key.
 * @returns a record containing the cached schema.
 * @throws when the key is malformed, the package face is absent, or the schema is not contributed.
 */
resolve(key: string): TypertSchemaRecord

/**
 * Enumerate live schemas in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching records containing the cached schemas.
 */
list(filter: TypertSchemaFilter = {}): TypertSchemaRecord[]

/**
 * Look up generated reflection for one package face.
 * @param packageName - exact npm package name.
 * @param face - face to query; defaults to the host runtime.
 * @returns the live package record, or `undefined` when absent.
 */
getPackage(packageName: string, face: TypertFace = 'host'): TypertPackageRecord | undefined

/**
 * Enumerate generated package reflection in registration order.
 * @param filter - optional package and face restriction.
 * @returns matching package records.
 */
listPackages(filter: TypertPackageFilter = {}): TypertPackageRecord[]

/**
 * Project a live Zod schema to JSON Schema without caching the result.
 * @param key - global schema key.
 * @param params - Zod projection parameters.
 * @returns a fresh JSON Schema document.
 */
toJSONSchema(key: string, params?: z.core.ToJSONSchemaParams): z.core.JSONSchema.BaseSchema
```

Source: [`packages/typert/registry/src/service.ts`](../../packages/typert/registry/src/service.ts)

<a id="ctxtypertgateway--typertgatewayservice"></a>

### `ctx.typertGateway` — `TypertGatewayService`

Resolve strict generated definitions or conservative SRC markers against current Cordis Services and Typert providers.

```ts cordis-catalog
/**
 * Check for an active owner Client event stream, the only kind that can answer forwarded waterfalls.
 * @returns whether an owner stream is open and has not been cancelled.
 */
hasLiveClient(): boolean

/**
 * Register the sole application-selected forwarded-event source.
 * @param source - stream factory installed by the Remote assembly.
 * @param host - stable Host facts included in each Client generation's opening frame.
 * @returns disposer removing this source and cancelling its active streams.
 */
registerRemoteEvents( source: TypertRemoteEventSource, host: RemoteEventHostInfo, ): () => Promise<void>

/**
 * Invoke one live Remote method through strict generated reflection or SRC markers.
 * @param request - decoded endpoint and exact named wire arguments.
 * @returns the business result without output decoding.
 * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
 */
async invoke(request: InvokeRemoteRequest): Promise<unknown>

/**
 * Open one live stream Remote method without assuming a physical carrier.
 * @param request - decoded endpoint, named wire arguments, and the Client uplink when the carrier has one.
 * @returns a cancellation-aware iterable over the business results.
 */
async stream(request: InvokeRemoteRequest): Promise<AsyncIterable<unknown>>
```

Source: [`packages/api/gateway/src/index.ts`](../../packages/api/gateway/src/index.ts)
<!-- END GENERATED cordis-surface -->
