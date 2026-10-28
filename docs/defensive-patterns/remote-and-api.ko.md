# 원격과 API 규칙

[English](remote-and-api.md) | [中文](remote-and-api.zh.md) | 한국어

`packages/api` 계층과 그 계층이 노출하는 원격 메서드에 대한 규칙입니다. [api-gateway.md](../api-gateway.ko.md)는 호출 모델 자체를 설명합니다. 아래의 각 절은 요구 사항, 리뷰어가 판단하는 방식, 적용되지 않는 범위, 해당 예외와 승인자, 올바른 예와 잘못된 예를 제시합니다.

## 새로운 원격 기능은 자체 서비스를 가집니다

새로운 원격 업무 기능은 새 서비스, 즉 자체 패키지나 자체 객체이며, `@Remote`는 그 서비스의 구체 메서드를 표시합니다. 기존의 큰 서비스를 메서드 하나씩 늘려 가면 하나의 객체가 인증, 세션, 워크스페이스, 이벤트 전달을 동시에 떠맡고, 도메인별 활성화 정책과 이력 페이지네이션이 뒤섞이며, 이후 한 기능에 대한 모든 변경이 그 전부를 건드리게 됩니다. 호출자 수가 아니라 업무 경계로 나누세요. 오늘 호출자가 하나뿐인 기능도 자체 서비스를 가지며, 소유자가 바뀌는 엔드포인트는 떠나는 객체에 합류하지 않고 새 소유자로 옮깁니다.

- 판단 기준: 어떤 객체가 새 원격 메서드를 가지는가. 이미 다른 업무 계열을 소유한 서비스에 새 업무 계열의 메서드를 추가한 것이 결함이며, 고치는 방법은 새 기능의 이름을 딴 서비스를 만들고 그 구체 메서드에 `@Remote`를 붙이는 것입니다. 마이그레이션도 같은 방식으로 판단합니다. 옮긴 메서드는 떠난 객체가 아니라 새 소유자에 나타나며, `packages/subagent/subagent`의 `SubagentRuntime`이 그렇습니다.
- 적용되지 않는 범위: 모든 메서드가 하나의 업무 경계에 봉사하는 서비스는 그대로 두며, 그 기능의 새 비공개 도우미도 그 서비스에 속합니다. 자체 프로토콜이 필요한 데이터도 새 서비스의 Remote 메서드가 되지 않습니다. 세션 이벤트 스트림, 페이지네이션, 증분 리듀스, 프로젝션, 엔터티 하위 스트림은 각자의 등록 모델을 유지합니다([게이트웨이 경계](../api-gateway.ko.md#경계)).
- 예외: 기록된 예외는 없습니다. 호출자가 하나라는 것은 병합할 이유가 아닙니다. 업무 경계 자체가 다툼의 대상이라면 변경이 반영되기 전에 도메인 소유자가 아키텍처 문제로 정리합니다.
- 해결: 기능 자체의 서비스 객체나 패키지를 만들고 그 구체 메서드에 `@Remote`를 붙이며, 호출자는 `ctx.remote.<namespace>`를 통해 접근합니다.

서브에이전트 기능은 자체 서비스를 소유하며, 모든 원격 메서드는 그 서비스의 구체 메서드입니다:

```ts ignore-check
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

interface SubagentList { ids: string[] }
interface PromptRequest { text: string }
interface PromptResult { accepted: boolean }

class SubagentRuntime extends TypertRemoteService {
  @Remote list(): SubagentList { return { ids: [] } }
  @Remote prompt(request: PromptRequest): PromptResult {
    return { accepted: request.text !== '' }
  }
  @Remote interruptByParent(id: string): void { }
}
```

잘못된 형태는 같은 기능을 이미 다른 도메인을 담고 있는 객체에 추가합니다:

```text
class ApiProxy {
  @Remote goalList(): GoalList            // goal domain
  @Remote subagentPrompt(request): ...    // subagent domain
}
```

그러면 하나의 객체가 두 도메인을 모두 떠맡게 되어, 어느 기능의 활성화 정책, 페이지네이션, 이벤트 처리를 바꾸든 같은 곳을 고치게 되고, 두 기능 중 어느 것도 다른 하나 없이 옮길 수 없습니다.

## `@Remote`는 기능 메서드를 표시합니다

`@Remote`는 리뷰어가 각각 확인하는 다섯 가지 규율을 담습니다. 기능을 수행하는 구체 메서드를 표시하고, 클라이언트 대상 타입은 손으로 쓴 사본이 아니라 제너레이터를 통해 기존 정의에서 오며, 페이로드는 JSON이고 원격 메서드는 출력 측 디코드를 수행하지 않으며, 기존 메서드와 필드 이름에는 추가만 하고, 메서드는 자신이 건드리는 모든 리소스를 이름으로 밝히고 호출자는 호출 정보에서만 읽습니다. 각 규율은 서로 다른 실패를 없앱니다. 래퍼는 어떤 연산이 노출되는지 숨기고, 두 번째로 손으로 쓴 타입 집합은 생성된 것과 어긋나며, 출력 측 디코드는 게이트웨이가 이미 실행하는 코덱 옆에 두 번째 결과 경로를 추가하고, 이름 변경은 한 번의 변경으로 모든 호출자를 깨뜨리며, 이름이 없는 리소스, 필터링되지 않은 집계, 인수로 전달된 호출자는 소유자가 아닌 쪽이 어떤 바인딩도 허용하지 않는 것에 닿게 합니다.

- **기능 메서드.** 애노테이션은 연산을 수행하는 구체 메서드(`list`, `prompt`, `interruptByParent`)에 붙이며, 실제 구현으로 전달하는 래퍼에는 절대 붙이지 않습니다. 데코레이션된 메서드의 본문으로 판단합니다. 본문이 위임만 한다면 애노테이션이 잘못된 메서드에 붙은 것입니다.
- **추론에서 오는 타입.** 클라이언트 대상 타입은 두 번째로 작성하는 대신 제너레이터가 만들어 내는 것에서 별칭을 만듭니다(`type SessionRemote = TypertClientRemote['session']`). 필드가 생성된 클라이언트 타입을 반복하는 손으로 쓴 선언으로 판단합니다. 생성된 맵과 그 선언 병합은 [typert.md](../subsystems/typert.ko.md)가 소유합니다.
- **와이어에서는 JSON, 출력 측 디코드 없음.** Remote 메서드의 **와이어 페이로드**는 JSON이며, 바이너리 콘텐츠는 필드 수준으로 표현합니다. 호스트 시그니처는 게이트웨이가 이미 지원하는 것(호스트 객체로 해석되는 조회 인수, 끝에 오는 `AbortSignal`, `@Remote({ mode: 'stream' })`로 선언한 스트림)을 유지하며, `@Remote`는 나가는 길에 디코드를 수행하지 않습니다. 결과는 생성된 코덱과 게이트웨이가 검증합니다. 데코레이터가 붙은 메서드의 페이로드에 디코드, 스트림 재조립, JSON이 아닌 값 전체가 있는지로 판단합니다. Remote 메서드를 넘을 수 있는 것은 [프로그래밍 모델](../api-gateway.ko.md#프로그래밍-모델)이 소유합니다.
- **기존 이름에는 추가만.** 마이그레이션은 클라이언트가 이미 호출하는 원격 메서드나 필드의 이름을 바꾸지 않습니다. 새 의미에는 새 항목을 주고, 이름 변경은 자체 리뷰를 가진 별도의 변경입니다. `ctx.remote.<namespace>`를 통해 이미 노출된 이름을 바꾸거나 제거하는 diff로 판단합니다.
- **호출자 신원과 접근.** 모든 Remote 메서드는 접근 제어 아래에 있습니다. `@Remote({ resources })` / `@RemoteScope(key, { resources })` 판독기와 자동 해석은 메서드가 건드리는 모든 리소스를 밝혀야 합니다. 접근 제어는 빠뜨린 리소스를 결코 검사하지 않기 때문입니다. 여러 리소스를 반환하는 메서드는 `this.ctx.remoteAccess.allows(resource)`를 통해 각 항목을 필터링합니다. 호출자는 `this.ctx.invocation.peer.principal`에서만 읽으며 인수에서는 읽지 않습니다. 사용자 메시지 소스를 만드는 Remote 메서드는 `principalOf(this.ctx.invocation)`을 통해 기록하고, 주체(principal)를 함수 인수로 전달하는 대신 만들어진 소스를 아래로 전달합니다. 모든 호출 경로는 자신의 Peer를 명시합니다. 해석된 리소스가 건드리는 리소스 하나를 빠뜨린 메서드, 필터링되지 않은 집계, 와이어 데이터에서 읽거나 도우미 매개변수로 전달된 주체, `principalOf` 없이 Remote 메서드에서 만든 사용자 메시지 소스로 판단합니다. 설계는 [Peer 주체 Agent Note](../../.agents/notes/implemented/architecture/2026-10-12-peer-principal-and-remote-access.md)가 소유합니다.
- **적용되지 않는 범위.** 데코레이터가 없는 메서드는 프로세스 내 호출자를 가진 평범한 서비스 메서드로 남습니다. 다섯 가지 규율은 무엇이 Remote 메서드가 되는지를 규율할 뿐, 서비스가 무엇을 구현할 수 있는지를 규율하지 않습니다.
- **예외.** 이름 변경이나 새 디코드 경로는 이점과 기존 호출자에 미치는 영향을 먼저 밝히고 도메인 소유자의 확인을 받아야 하며, 작성자가 스스로 승인할 수 없습니다.

생성된 맵이 클라이언트 대상 타입의 유일한 출처이고, 데코레이터는 구체 메서드에 붙으며, 페이로드는 JSON으로 유지됩니다:

```ts ignore-check
import { Remote, TypertRemoteService, type TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'

// Client-facing types come from the generated map, never from a second hand-written set.
type SessionRemote = TypertClientRemote['session']

class SessionController extends TypertRemoteService {
  @Remote('search')
  search(query: string): SessionSearchValue {
    return this.runSearch(query)
  }
}
```

손으로 쓴 두 번째 타입 집합, 이미 배포된 이름의 변경, 출력 측 디코드는 각각 다른 규율을 깨뜨립니다:

```text
type SessionRemote = { list(): ...; rename(id: string): ... }   // hand-written copy
@Remote('renameSession') rename(...)                            // shipped name changed
@Remote decode(payload: Uint8Array): Result                     // output-side decode
```

손으로 쓴 사본은 빌드를 실패시키지 않은 채 생성된 타입과 어긋나고, 이름 변경은 기존 클라이언트 호출을 한꺼번에 깨뜨리며, 디코드는 생성된 코덱을 검사되지 않는 두 번째 결과 경로로 대체합니다.

## `packages/api`는 일반 오케스트레이션만 담습니다

`packages/api` 아래의 패키지들, 즉 컨트롤러와 `gateway`, `remotes`는 전송, 호출 형태, 세션 수명 주기, 그 밖의 일반 오케스트레이션을 담습니다. 업무 분기가 이곳에 모이는 일은 없습니다. 구체적인 업무 상태에 의존하는 결정, 한 기능에 묶인 처리, 기능별 필터는 자체 패키지나 모듈에 속하며 프로젝션된 데이터나 등록 표면을 통해 이 계층에 도달합니다. 기준은 로직이 속하는 곳이지 파일이 놓인 곳이 아니므로, 한 기능에만 말이 되는 분기는 그것을 담은 파일이 일반적이더라도 결함입니다.

- 판단 기준: 분기가 어디서 조건을 읽는가. `packages/api` 안에서 기능 상태를 검사하는 `if`나 `switch`, 기능별 필터, 한 기능의 이름을 딴 도우미가 결함입니다. 같은 결정을 소유 패키지에서 내리고 이곳에서는 프로젝션된 데이터나 등록된 항목으로 소비하면 결함이 아닙니다. 패키지 집계가 그 영향을 보여 줍니다. `packages/api`에는 아홉 개 패키지가 있습니다(`account-controller`, `gateway`, `job-controller`, `remotes`, `session-controller`, `settings-controller`, `terminal-controller`, `workspace-controller`, `workspace-files`). 그중 `session-controller`가 `src` 파일 34개로 가장 큽니다(terminal-controller 12, gateway 11, workspace-controller 10, workspace-files 8, job-controller 8, remotes 4, settings-controller 3, account-controller 2).
- 적용되지 않는 범위: 일반적인 세션 수명 주기, 전송, 저장소 추상화는 남습니다. `gateway` 디스패치, `remotes` 선택, 공유 세션 목록과 카탈로그 읽기는 인프라이지 업무 로직이 아닙니다. [업무 소유권](../api-gateway.ko.md#비즈니스-소유권)은 게이트웨이 쪽에서 같은 분리를 밝힙니다.
- 예외: 기본적으로 없습니다. 이곳에 업무 분기를 추가하려면 독립 패키지 리뷰가 필요하며, 그 리뷰는 그 로직이 기능을 소유한 패키지에 살 수 없는 이유에 답합니다.
- 해결: 결정을 소유 패키지로 옮기고, 그 결과를 프로젝션된 데이터로 게시하거나 이 계층이 이미 주입하는 레지스트리에 등록하며, 그것을 읽는 오케스트레이션만 남깁니다.

소유 패키지가 자신의 단위를 결정하고 등록하며, 컨트롤러는 프로젝션된 값만 읽습니다:

```ts ignore-check
// packages/workspace/<feature>/src/index.ts: the rule lives with the feature it serves.
export const durablePageProjectionDefinition = {
  key: 'durablePage',
  stateSchema: durablePageState,
  init: () => ({ durable: false }),
  apply: applyDurablePage,
  stateVersion: 1,
}
await ctx.sessionProjections.register(durablePageProjectionDefinition)

// packages/api/session-controller: generic orchestration reads the projected value.
const durablePage = await ctx.sessionProjections.register(durablePageProjectionDefinition)
const { durable } = durablePage.stateOf(session)
```

잘못된 형태는 공유 계층 안에서 규칙을 결정합니다:

```text
// packages/api/session-controller: a feature branch inside the shared layer
if (session.page.transport === 'durable') { /* durable-transport handling */ }
```

그러면 규칙에 두 번째 자리가 생겨 이후 변경은 두 곳을 모두 찾아야 하며, 공유 계층은 계속 한 기능의 시맨틱을 짊어집니다.
