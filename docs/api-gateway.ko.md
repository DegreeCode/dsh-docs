# API 게이트웨이

[English](api-gateway.md) | [中文](api-gateway.zh.md) | 한국어

이 문서는 Typert API 게이트웨이의 현재 상태를 다루는 참조 문서입니다. 비즈니스 서비스가 단항(unary) 및 스트림 Remote 메서드를 선언하는 방법, 빌드가 호스트와 클라이언트 계약을 생성하는 방법, 그리고 호출이 Connection RPC와 `/api` 라우트를 재사용하는 방법을 설명합니다. 세션 이벤트, 증분 데이터 및 기타 스트리밍 프로토콜은 이 문서의 범위 밖입니다. 이들은 같은 Connection을 사용할 수 있지만 Remote 메서드 설명자를 사용하지는 않습니다.

## 프로그래밍 모델

비즈니스 서비스는 `@Remote` 또는 `@RemoteScope`로 클라이언트에 노출할 메서드를 선택합니다. 표시되지 않은 메서드는 생성된 클라이언트 타입이나 런타임 기여에 포함되지 않으며 `ctx.remote`로 호출할 수 없습니다.

`@Remote`는 루트 호스트 컨텍스트에 등록된 Cordis 서비스 호출을 나타냅니다. 복잡한 호스트 객체는 와이어(wire)를 직접 건너갈 수 없습니다. 비즈니스 패키지는 `TypertLookupMap`으로 해당 객체와 와이어 식별자의 연관을 선언하고, 런타임에 `ctx.typert.lookups`에 기본 해석 제공자를 등록해야 합니다. 예를 들어 호스트 시그니처에서 `agent`라는 이름의 `Agent` 매개변수는 `agentId` 와이어 필드를 생성하며, 게이트웨이는 비즈니스 메서드를 호출하기 전에 그 id를 호스트 객체로 해석합니다. 호스트 구성은 `ctx.typert.lookups.configure()`로 비즈니스 패키지가 소유한 매개변수 이름, 와이어 필드, 정규 타입 심볼을 바꾸지 않고도 lookup 키의 해석 정책을 재정의할 수 있습니다.

`@RemoteScope(key)`는 먼저 `ctx.typert.contexts`를 통해 식별자를 범위가 지정된 컨텍스트로 해석한 다음, 그 컨텍스트에서 서비스를 얻어 메서드를 호출합니다. 메서드 자체가 범위 지정된 구성에 의존하며 `Agent` 같은 객체를 명시적으로 받을 필요가 없을 때 적용됩니다.

`@Remote`는 내보내기 이름 또는 `{ name?, mode?, resources? }`를 받고, `@RemoteScope(key, option?)`는 아래의 `@RemoteScope('agent', 'current')`처럼 내보내기 이름을, 또는 두 번째 인자로 `{ name?, resources? }`를 받습니다. `resources`는 호출 한 번이 접근하는 리소스의 식별자를 반환하는 종류별 리더를 담으며, 접근 제어에 쓰입니다. 각 리더는 데코레이션된 메서드에서 타입이 추론되는 메서드의 와이어 인자를 자신의 매개변수로 받습니다. 대부분의 메서드는 리더를 선언하지 않습니다. 게이트웨이가 `resource`를 선언한 lookup 매개변수와 범위 컨텍스트, 그리고 `typert.resources`의 기본 필드나 리졸버에서도 식별자를 읽기 때문입니다. 그 순서는 [Typert 하위 시스템](subsystems/typert.ko.md)이 소유합니다.

서비스는 보통 `TypertRemoteService`를 확장해 생성자에서 Cordis 서비스 키와 기본 Remote 네임스페이스를 명시적으로 바인딩합니다. 이미 다른 기본 클래스가 있는 서비스는 대신 `readonly typertRemote = bindTypertRemote(this, serviceKey)`를 선언할 수 있습니다. 두 방식 모두 검사 가능한 공개 바인딩을 남기며, 컴파일러가 생성자에 심볼을 주입하는 데 의존하지 않습니다.

```ts
import type { Agent } from '@deepseek-ai/dsh-agent'
import { TypertRemoteService, Remote, RemoteScope } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'

export interface CreateGoalRequest {
  objective: string
}

export interface CreateGoalResult {
  accepted: boolean
}

export class GoalService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'goals')
  }

  @Remote('create')
  createForClient(
    agent: Agent,
    request: CreateGoalRequest,
    signal: AbortSignal,
  ): CreateGoalResult {
    signal.throwIfAborted()
    return this.create(agent, request)
  }

  @RemoteScope('agent', 'current')
  currentForClient(): CreateGoalResult {
    return { accepted: true }
  }

  private create(_agent: Agent, request: CreateGoalRequest): CreateGoalResult {
    return { accepted: request.objective.length > 0 }
  }
}
```

Remote 메서드는 값을 동기적으로 반환하거나 Promise를 반환할 수 있습니다. 협력적 취소가 필요하면 호스트 시그니처의 마지막 매개변수가 전역 타입을 사용하는 `signal: AbortSignal`이어야 합니다. 이 매개변수는 `args`에 들어가지 않고 설명자에 기록되며, 생성된 클라이언트 메서드는 마지막에 선택적 `AbortSignal`을 받습니다.

`@Remote({ mode: 'stream' })`는 `Iterable`, `AsyncIterable` 또는 `RemoteStream<Out, In>`을 반환하는 메서드를 표시합니다. 게이트웨이는 호스트 메서드가 산출한 값인 각 항목을 멀티플렉싱된 `/api/remote.mux` WebSocket 또는 프로세스 내 캐리어를 통해 전달하고, 생성된 클라이언트 메서드는 항목을 순회하면서 같은 논리 스트림의 클라이언트→호스트 업링크용 `send`, `end`, `dispose`를 노출하는 `RemoteStreamHandle<Out, In>`을 반환합니다. `RemoteStream<Out, In>`의 두 번째 타입 인자는 업링크 항목 타입을 선언합니다. 클라이언트가 보내는 항목은 브라우저에서 오므로, 게이트웨이는 호스트 메서드가 `this.ctx.invocation.uplink<In>()`로 읽기 전에 생성된 `In` 코덱으로 각 항목을 검증합니다. 업링크는 `args`에도 매개변수 목록에도 들어가지 않습니다. 프레임, 반 닫기(half-close), 취소 및 인박스 상한 계약은 [게이트웨이 README](../packages/api/gateway/README.md)가 소유합니다.

클라이언트는 JavaScript Proxy가 아니라 일반 객체의 구체 함수를 사용합니다. 직접 호출과 범위 호출은 각각 `ctx.remote.<namespace>`와 `agentCtx.remote.<namespace>` 아래에 나타납니다. 각 네임스페이스는 `remote.<namespace>`로 등록되는 추적되는 Cordis 자식 서비스이며, 클라이언트 어셈블리는 `ctx.remote.$mount()`로 기여를 마운트하고, 마지막 메서드가 철회된 뒤 네임스페이스가 언로드됩니다. 의존성 선언은 실제 호출자에게 속합니다. `ctx.remote.<namespace>` 또는 `agentCtx.remote.<namespace>`를 읽는 비즈니스 패키지만 자신의 `inject`에 `remote`와 `remote.<namespace>`를 모두 선언합니다. 기여만 마운트하는 어셈블리와 그 네임스페이스를 호출하지 않는 상위 런타임은 비즈니스 패키지를 대신해 네임스페이스 의존성을 선언하지 않습니다. `@Remote` 메서드에 lookup 매개변수가 정확히 하나 있고 같은 이름의 `TypertContextMap`이 동일한 와이어 식별자를 사용하면, 생성된 범위 시그니처는 그 식별자 매개변수를 생략합니다. `@RemoteScope`는 범위 호출 인터페이스만 생성합니다.

```ts ignore-check
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentContext } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.goals']

declare const ctx: Context
declare const agentCtx: AgentContext
declare const agentId: SessionId

await ctx.remote.goals.create(agentId, { objective: 'ship it' })
await agentCtx.remote.goals.create({ objective: 'ship it' })
```

클라이언트 애플리케이션은 `@deepseek-ai/dsh-api-remotes`만 어셈블합니다. 이 패키지는 선택된 비즈니스 패키지의 `/remote` 하위 경로를 런타임 값으로 가져와 `ctx.remote.$mount()`로 기여를 마운트하고, 같은 파일의 선언 병합을 다시 내보냅니다. 호스트 Remote 패키지를 추가하는 것은 클라이언트 구성 소유자의 명시적 선택입니다. 비즈니스 컴포넌트는 Typert 게이트웨이나 비즈니스 패키지의 Remote JS를 따로 로드할 필요가 없습니다.

`api-remotes` 어셈블리와 `ctx.remote` 계약은 React에 독립적입니다. 어떤 클라이언트 어셈블리에서 보이는 호스트 메서드도 생성 시점에 선택된 Remote 메서드로 제한됩니다.

## 컴포넌트 책임

| 위치 | 패키지 또는 엔트리 | 책임 |
|---|---|---|
| 공유 | `@deepseek-ai/dsh-typert-protocol` | 데코레이터, 게이트웨이 바인딩, 병합 확장 가능한 프로토콜 맵, 호출 설명자 및 제공자 타입을 선언합니다. TypeScript 분석을 시작하지 않고 Cordis 서비스도 등록하지 않습니다 |
| 빌드 | `@deepseek-ai/dsh-typert-generator` | 호스트 `ts.Program`에서 Remote 시그니처, 타입 그래프, lookup, 컨텍스트 및 소스 위치를 엄격히 분석한 뒤 호스트 및 호스트-대-클라이언트 아티팩트를 생성합니다 |
| 호스트 | `@deepseek-ai/dsh-typert-registry` 및 Loader | 생성된 호스트 설명자, 스키마, 비즈니스 패키지 등록을 `ctx.typert`에 배치하고 lookup 및 컨텍스트 제공자를 보유합니다 |
| 호스트 | `@deepseek-ai/dsh-api-session-controller` | 애플리케이션의 에이전트/세션 식별 정책을 소유하고 해당 Typert lookup을 구성합니다 |
| 호스트 | `@deepseek-ai/dsh-api-gateway` | `ctx.typertGateway`를 제공하고, Remote 엔드포인트를 차지하며, 요청 값을 검증하고, 객체 또는 컨텍스트를 해석하고, 실행 중인 Cordis 서비스를 호출합니다 |
| 호스트 | `@deepseek-ai/dsh-api-remote-access` | 비즈니스가 등록한 역할 기반 정책으로 비소유자 피어가 호출할 수 있는 Remote 메서드를 결정하고, 목록 결과를 필터링하며, 각 피어의 접근 스냅샷을 스트리밍합니다. 게이트웨이는 이 서비스를 필요로 합니다 |
| 클라이언트 | `@deepseek-ai/dsh-api-gateway/client` | `ctx.remote`와 `remote.<namespace>` 자식 서비스를 제공하고, 생성된 설명자를 구체 메서드로 마운트하며, Connection을 통해 호출을 시작하고 취소합니다 |
| 클라이언트 | `@deepseek-ai/dsh-api-remotes/client` | 애플리케이션이 허용한 `/remote` 기여를 명시적으로 선택해 마운트하고 해당 선언 병합을 비즈니스 코드로 가져옵니다 |
| 양쪽 | `@deepseek-ai/dsh-client-connection` | RPC 캐리어, 요청 상관 관계, 신뢰 경계, 취소, 응답 엔벨로프 및 `/api` HTTP 브리지를 제공합니다 |

API 게이트웨이 패키지는 호스트 디스패처와 클라이언트 Remote 엔드포인트를 동등한 엔트리로 소유하지만, 두 빌드는 같은 `ts.Program`에 들어가지 않습니다. 호스트 엔트리는 클라이언트 Cordis `Context` 병합을 가져오지 않고, 클라이언트 엔트리는 호스트 게이트웨이 서비스를 가져오지 않습니다.

## 엄격한 생성 파이프라인

루트 빌드는 먼저 `scripts/generate-typert.ts`로 소스만 사용하는 호스트 분석을 실행한 다음, 호스트와 클라이언트 페이스를 컴파일·번들하고 Web을 빌드합니다([단계 순서](development.ko.md#typescript-프로젝트-레이아웃)). 생성기는 호스트 애그리게이트(aggregate)만을 `ts.Program` 시드로 사용하며 패키지 컴파일 전에 Remote 선언을 기록합니다. 호스트 tsdown 단계는 메타데이터를 다시 생성하지 않고 데코레이터를 낮추며, 클라이언트 단계는 그 선언과 런타임 기여를 소비합니다.

두 tsdown 단계 모두 `vendor/*`, `packages/*/*`, `apps/cli`를 대상으로 하고 호스트 단계는 `apps/desktop-host`도 포함하며([빌드 순서](development.ko.md#typescript-프로젝트-레이아웃)), 둘 다 해당 tsc 단계가 `lib/types`에 방출한 JavaScript만 번들합니다. 루트 구성은 클라이언트 아티팩트를 스캔하지 않고, 패키지 이름을 분류하지 않으며, 유지 관리되는 필터를 tsdown에 전달하지 않습니다. 패키지 로컬 구성은 `DSH_BUILD_FACE`에 따라 현재 단계의 엔트리를 반환합니다. 일반 클라이언트 플러그인은 클라이언트 단계에서 Node 로더 엔트리와 브라우저 번들을 함께 생성합니다.

`api/remotes`, `api/gateway`, `api/session-controller`, `api/workspace-controller`(그리고 `client/connection`)는 TypeScript 페이스를 분리합니다. `api/remotes`의 클라이언트 프로젝트는 패키지 컴파일 전에 비즈니스 패키지용으로 생성된 `/remote` 선언에 의존하므로, 루트 애그리게이트와 직접 소비자는 각각 분리된 패키지의 `tsconfig.host.json` 또는 `tsconfig.client.json`을 참조해야 합니다. `api-remotes`의 `clientBundle(..., { hostPhase: true })`는 호스트 tsdown 중에 호스트 엔트리를 만들고 클라이언트 tsdown에는 브라우저 엔트리만 남깁니다. 에이전트/세션 lookup 정책은 `api-remotes`가 아니라 `@deepseek-ai/dsh-api-session-controller`에 있습니다.

각 기여 비즈니스 패키지는 생성 파일을 소스 디렉터리가 아니라 자체 `lib/` 디렉터리에 기록합니다:

| 파일 | 소비자 | 내용 |
|---|---|---|
| `typert.host.js` | 호스트 Loader | 호스트 페이스의 런타임 리플렉션, 엄격한 호출 설명자, 스키마 등록 값 |
| `typert.host.d.ts` | 호스트 타입 시스템 | 호스트 페이스의 생성 선언 |
| `typert.remote-client.js` | `api-remotes` | 엄격한 설명자와 런타임 코덱을 담은 마운트 가능한 `TypertRemoteContribution` |
| `typert.remote-client.d.ts` | 클라이언트 타입 시스템 | `TypertRemoteNamespaceMap`과 `TypertRemoteScopeMap`의 선언 병합, 그리고 클라이언트 안전 타입 참조 |
| `typert.remote-client.d.ts.map` | 편집기 | 생성된 메서드 속성을 호스트 패키지의 Remote 메서드 선언으로 되돌려 매핑합니다 |

비즈니스 패키지는 `./typert`로 호스트 Loader 엔트리를, `./remote`로 호스트-대-클라이언트 엔트리를 노출합니다. 생성기는 이 패키지 export와 게시 파일 목록도 검증하며, 해당 엔트리를 제공하는 명시적 기여 패키지에 대해서만 아티팩트를 생성합니다.

Remote 클라이언트 선언의 매개변수 이름은 와이어 필드에서 오고, 매개변수와 반환 타입은 원래 비즈니스 패키지가 내보내는 클라이언트 안전 타입을 참조합니다. 선언 맵은 `ctx.remote.goals.create` 뒤의 생성된 속성을 `@Remote`가 붙은 호스트 소스 메서드로 되돌려 해석하므로, 선언 맵을 지원하는 편집기에서는 클라이언트 호출에서 생성된 `.d.ts`에 머무르지 않고 실제 구현으로 이동할 수 있습니다.

엄격한 분석은 Remote가 구체 구현을 가진 공개 비정적 인스턴스 메서드일 것을 요구합니다. 메서드는 제네릭일 수 없고, 매개변수는 필수이며 이름이 있는 단순 식별자여야 하고, 구조 분해, 기본값, 나머지 매개변수(rest), 선택적 매개변수를 쓸 수 없습니다. Typert는 JSON으로 표현 가능한 일반 타입에 대해 엄격한 스키마를 생성하며, 워크스페이스 클래스 같은 복잡한 객체는 고유한 `TypertLookupMap` 선언을 가져야 합니다. lookup과 컨텍스트 패키지는 정적 선언 병합과 런타임 제공자 등록을 모두 책임집니다. 어느 한쪽이 없으면 빌드가 실패하거나 해당 제공자를 필요로 하는 첫 호출이 실패합니다.

## 런타임 호출

Remote 호출은 Connection의 `/api` 라우트를 사용합니다. 클라이언트 Remote는 `connection.rpc.call('/api', '<namespace>/<method>', { args }, signal)`을 호출하고, HTTP 캐리어는 이를 이름이 있는 `args` 객체만 담은 페이로드와 함께 `POST /api/<namespace>/<method>`로 매핑합니다.

Connection은 HTTP 브리지 앞에서 `/api`의 통합 신뢰 검사를 수행한 다음 공유 FetchHandler 안에서 디스패치합니다. Typert 게이트웨이는 엄격한 설명자나 활성 SRC 마커가 있는 2세그먼트 엔드포인트만 차지합니다. 이진 Remote 필드를 JSON 호환 메타데이터와 결과 상대 바이트 첨부로 투영하고, Connection이 이를 multipart 응답으로 프레이밍합니다. 기능이 소유한 정확한 Fetch 라우트가 RPC 엔벨로프 밖의 응답을 처리하며, 다른 요청은 404를 반환합니다. 전송, RPC id, 응답 엔벨로프, 요청 취소는 Connection이 소유하고 Remote 데이터 프로토콜과 비즈니스 디스패치는 게이트웨이가 소유합니다. Connection 캐리어를 교체해도 Remote 설명자나 클라이언트 프로그래밍 인터페이스를 바꿀 필요는 없습니다.

모든 호출에서 게이트웨이는 비즈니스 객체를 캐시하지 않고 현재 레지스트리에서 설명자와 실행 중인 서비스를 해석합니다. 모든 호출은 자신이 대표하는 피어를 명시하며, 이미 폐기된(dispose) 피어는 `gateway/peer-disposed`로 거부됩니다. 게이트웨이는 `args`의 필드가 설명자와 정확히 일치할 것을 요구합니다. 피어 주체가 소유자가 아닌 호출은 그다음 호출이 접근하는 리소스를 해석한 뒤 `ctx.remoteAccess.decide()`에 묻습니다. 따라서 거부된 호출은 어떤 lookup도 해석하지 않고 에이전트도 활성화하지 않습니다. 이어서 코덱으로 와이어 값을 검증하고, 등록된 lookup 또는 컨텍스트 제공자를 통해 객체나 수신자를 해석하고, 바인딩이 지시하는 서비스 메서드를 호출합니다. 클라이언트 게이트웨이는 생성된 결과 코덱으로 디코딩된 이진 결과를 검증하며, 일반 JSON 결과는 기존 처리를 유지합니다. 제공자 누락, 알 수 없는 식별자, 바인딩 불일치, 인자 누락이나 초과, 스키마 실패, 메서드 누락은 비즈니스 코드에 들어가기 전이나 나온 뒤에 실패합니다.

lookup 제공자의 `register()`는 안정적인 선언과 기본 리졸버를 함께 제공하고, `configure()`는 호스트 구성이 소유하며 비동기로 실행될 수 있고 effect 수명으로 범위가 지정되는 리졸버를 제공합니다. 구성이 제공자 마운트보다 앞설 수 있으며, 제공자가 없으면 호출은 여전히 `gateway/lookup-unavailable`로 실패하고, 구성을 언로드하면 제공자의 기본 정책이 복원됩니다. 세션 컨트롤러는 `agent`와 `session`의 표준 리졸버 시맨틱을 소유합니다. 실행 중인 에이전트는 재사용하고, 일반적인 콜드 세션은 자동으로 재개하며, 동시 재개를 중복 제거하고, 서브에이전트 라우팅이 소유한 식별자는 거부합니다. `session` lookup은 그 에이전트의 세션을 반환합니다. 재개 실패와 소유권 펜스(ownership fence)는 자체 코드(`session/not-found` 또는 `session/agent-busy`)를 담은 `RemoteError`를 발생시키고, 게이트웨이는 이를 와이어에 그대로 인코딩합니다. 분류되지 않은 throw만 `gateway/internal`로 접힙니다.

클라이언트 기여를 언로드하면 설명자와 구체 메서드가 함께 제거되고, 진행 중인 호출이 중단되며, 외부 코드가 계속 보유한 오래된 메서드 핸들은 이후 호출을 거부합니다. 호스트에서 철회된 엄격한 엔드포인트도 SRC 추론으로 저하되지 않으므로, 핫 언로드가 검증을 조용히 약화하지 못합니다.

## SRC 개발 폴백

호스트가 `node --import tsx/esm`으로 소스에서 시작되면 Typert 컴파일러 플러그인을 실행하지 않습니다. 표준 데코레이터 초기화자는 서비스 프로토타입의 버전이 지정된 설명자에 메서드 이름과 호출 모드를 계속 기록하고, `TypertRemoteService` 또는 `bindTypertRemote()`가 명시적 서비스 바인딩을 제공합니다. 따라서 게이트웨이는 `ts.Program`을 시작하지 않고도 더 약한 임시 설명자를 만들 수 있습니다. 설명자의 안정적인 문자열 속성 이름 덕분에 `remoteMethods()`는 프로토콜 패키지의 다른 설치본이 기록한 마커를 읽을 수 있습니다.

SRC 폴백은 실행 중인 함수에서 단순 매개변수 이름을 파싱합니다. 매개변수 이름이 등록된 lookup의 `parameter`(예: `agent` 또는 `session`)와 일치하면 해당 lookup의 `agentId` 또는 `sessionId` 와이어 필드를 사용해 호스트에서 객체를 해석하고, 다른 매개변수는 특수 프로토타입이 없는 순환 없는 JSON 안전 데이터인지만 검사합니다. `@RemoteScope`는 등록된 호스트 컨텍스트 제공자의 와이어 필드를 직접 사용합니다. SRC는 TypeScript 타입을 읽지 않고, Zod 스키마를 생성하지 않으며, 선택적 매개변수를 추론하지 않고, 구조 분해, 기본값, 나머지 매개변수, 중복 매개변수 이름을 지원하지 않습니다.

SRC는 소스에서 실행되는 호스트 프로세스의 디스패치만 해결합니다. 클라이언트는 실행 중인 호스트에서 데코레이터를 발견하지 않으며, 클라이언트 Remote는 엄격한 코덱이 없는 SRC 설명자를 마운트하지 않습니다. 클라이언트의 타입, 코덱, Remote 등록 값은 항상 가장 최근에 생성된 `lib/typert.remote-client.*` 아티팩트에서 옵니다.

## 개발 모드

Web 개발은 명령 하나로 실행됩니다. 이 명령은 현재 호스트, 클라이언트, Web 아티팩트를 빌드하고, 소스 호스트를 시작하며, 클라이언트 번들을 계속 다시 빌드합니다:

```sh
pnpm run dev:web
```

`dsh`는 tsx를 통해 호스트 소스를 시작하므로 호스트는 SRC 폴백을 사용할 수 있습니다. `dev:web` 감시자는 소스가 수정되면 클라이언트 페이스 타입 출력, 클라이언트 플러그인과 라이브러리 번들, Web 셸을 다시 빌드합니다. 이들은 호스트 데코레이터를 분석하거나 Remote 클라이언트 DTS를 생성하지 않습니다. `dev:web`이 먼저 실행하는 전체 빌드(또는 `pnpm run build`)만 이를 수행합니다.

계약을 바꾸지 않고 Remote 메서드의 구현 본문만 바꾸는 경우 Typert 파일을 다시 생성할 필요가 없습니다. 데코레이터를 추가·제거하거나 내보내기 이름, 네임스페이스, 매개변수, 반환 값, lookup, 컨텍스트, 취소 시그니처를 바꾼 뒤에는 순서가 정해진 lib 빌드를 다시 실행해, 호스트가 엄격한 계약을 먼저 생성하고 클라이언트가 새 기여를 컴파일·번들하도록 하세요:

```sh
pnpm run build:lib
```

실행 중인 클라이언트 감시자는 다시 번들할 때 이 생성 파일을 소비합니다. `pnpm run build:lib:host`로 호스트 계약을 이미 새로 고쳤다면 `pnpm run build:lib:client`로 클라이언트 쪽을 마칠 수 있습니다. 깨끗한 워크트리라고 해서 호스트 단계를 건너뛸 수는 없습니다. 프런트엔드 소스만 다시 컴파일해서는 호스트 데코레이터에서 새 타입을 추론할 수 없습니다. `pnpm run typecheck`는 클라이언트 tsc 전에 번들 없는 Typert 단계로 호스트 계약을 생성하며, CI 빌드 레인과 릴리스 빌드도 패키지 컴파일 전에 같은 소스 전용 생성을 사용합니다.

## 경계

Remote는 하나의 요청과 하나의 결과를 갖는 단항 메서드 호출과, 항목이 호스트 → 클라이언트로 흐르면서 클라이언트의 항목은 `this.ctx.invocation.uplink()`를 통해 실행 중인 호스트 메서드에 도달하는 스트림 메서드를 처리합니다. 세션 이벤트 스트림, 페이지네이션, 증분 reduce, 투영, 엔티티 하위 스트림에는 여전히 별도의 데이터 프로토콜과 등록 모델이 필요합니다. 이들이 Connection을 재사용하더라도 Remote 메서드로 가장하거나 호출 설명자에 들어가서는 안 됩니다.

API 계층은 `remotes → gateway → connection → webserver`로 구성됩니다. BFF와 Typert RPC 계층은 `packages/api` 아래에 있고, Connection과 WebServer는 `packages/client/connection`과 `packages/host/webserver`에 있습니다. 중첩 필드와 배열 항목을 포함해 `Uint8Array`를 담은 단항 결과는 [이진 Remote 전송](../.agents/notes/implemented/architecture/2026-09-17-workspace-file-binary-transfer.md)을 사용합니다. RPC 엔벨로프 밖의 응답이 필요한 기능은 정확한 Connection Fetch 라우트를 등록합니다.

lookup 정책은 키별로 구성되므로 모든 `agent` 또는 `session` 매개변수가 콜드 재개 동작을 공유합니다. 실행 중인 객체만 받아들이려면 매개변수별 또는 엔드포인트별 정책이 명시적으로 필요하지만 그런 정책은 없습니다. 비즈니스 메서드는 객체가 복원에서 왔는지 추측해서는 안 됩니다.

### 비즈니스 소유권

`packages/api`는 전송, 호출 형태, 세션 수명 주기를 소유합니다. 비즈니스 규칙은 독립된 비즈니스 패키지에 속하며 등록 표면이나 투영된 데이터를 통해 이 계층에 도달합니다. 이곳의 변경이 충족해야 하는 요구 사항, 즉 `@Remote`의 네 가지 규율, 이름 추가만 허용하는 규칙, 이 계층이 지키는 경계는 [Remote 및 API 규칙](defensive-patterns/remote-and-api.ko.md)이 소유하며, 리뷰는 그곳에서 이를 확인합니다.
