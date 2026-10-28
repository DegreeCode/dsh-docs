# 클라이언트 컴포넌트 규칙

[English](client-components.md) | [中文](client-components.zh.md) | 한국어

클라이언트 컴포넌트와 그 상태, 효과에 대한 규칙입니다. 세부 규율은 [packages/client/AGENTS.md](../../packages/client/AGENTS.md)에 있고, 슬롯 설계는 [slots.md](../subsystems/slots.ko.md)가, 스타일 규칙은 [web-styling.md](../web-styling.ko.md)가 소유합니다. 아래의 각 절은 요구 사항, 리뷰어가 판단하는 방식, 경계와 예외가 놓이는 자리, 올바른 예와 잘못된 예를 제시합니다.

## 상태는 주입을 통해 도착합니다

슬롯의 컴포넌트는 자신이 렌더링하는 모든 것을 자체 등록의 주입 면을 통해 받습니다. 일반 데이터, 액션 콜백, 그리고 렌더러가 `use<Name>` 훅으로 바인딩하는 예약된 `hooks` 구획이 그것입니다. 부모의 렌더 위치는 파생된 `renderSlot`을 통해 소유자 데이터를 전달합니다. 트리 최상단에서 하나의 거대한 전역 상태를 읽어 값을 내려 주는 일은 없습니다. 모든 라이브 값을 그 면에 두어야 바뀌지 않은 prop이 정체성을 유지하고, 컴포넌트가 자신이 읽는 하위 상태에만 구독할 수 있습니다. 그렇지 않으면 무관한 필드 변경 하나가 하위 트리 전체를 다시 렌더링하며, 스트리밍 이벤트가 이어지는 긴 세션에서 사용자가 스크롤하거나 입력하는 동안 프레임이 떨어지는 이유가 바로 이것입니다.

- 판단 기준: 등록 지점과 렌더 위치에서 작성자는 렌더링되는 컴포넌트가 어떤 하위 상태에 구독하는지, 들어오는 props 중 무엇이 렌더 사이에 안정적인 정체성을 유지하는지 밝힐 수 있어야 합니다. 모든 prop의 가변성을 살피세요. 렌더마다 다시 만들어지는 값(새 객체, 배열, 인라인 콜백)은 내용이 하나도 바뀌지 않았어도 다시 렌더링을 전파합니다.
- 적용되지 않는 범위: 컴포넌트 자체의 지역 상태(폴드, 호버, 초안을 위한 `useState`)는 주입 내용이 아니며, React 밖의 무엇에도 구독하지 않는 컴포넌트에는 새 시트가 필요하지 않습니다.
- 예외: 새 훅 시트는 슬롯 계약을 바꾸므로 그 변경은 어떤 컴포넌트가 무엇에 구독하는지라는 영향을 리뷰에서 밝혀야 합니다. 기존 면을 사용하는 것은 컴포넌트별 승인이 필요하지 않습니다.
- 해결: 주입을 뷰가 렌더링하는 것으로 좁히고, 읽기마다 필드 하나를 훅 시트로 노출하며, 스토어나 서비스 핸들 대신 좁은 액션 집합을 전달하세요. 주입 팩토리, 표준 훅 시트, 각각이 prop이 되는 방식은 [컴포넌트 입력](../subsystems/slots.ko.md#컴포넌트-입력)이 소유합니다.

등록은 일반 데이터, 좁은 액션 집합, 훅 시트 하나를 담고, 렌더 위치는 소유자 데이터를 전달하며, 컴포넌트는 자신이 렌더링하는 필드만 읽습니다:

```tsx
// The inject factory returns plain data and callbacks; hooks is the reserved compartment.
ctx.slots.register(
  {
    name: 'sidebar.right',
    inject: () => ({
      rename,
      hooks: { info: infoSource },   // bound by the renderer as useInfo()
    }),
  },
  SidebarRight,
)

// The parent's render site passes owner data through the derived renderSlot.
{renderSlot('sidebar.right', { id })}

function SidebarRight({ id, useInfo, rename }: Props) {
  const { title } = useInfo()   // subscribes to title only
  return <button onClick={() => rename(id)}>{title}</button>
}
```

최상단 컴포넌트가 뷰 스토어 전체를 읽어 하나의 prop으로 내려 주면, 렌더 위치는 위의 두 질문 중 어느 것에도 답할 수 없습니다:

```tsx
function Sidebar() {
  const view = useViewStore()           // one top-level global read
  return <SidebarRight view={view} />   // the whole store travels down
}

function SidebarRight({ view }: { view: ViewStore }) {
  return <span>{view.activePanel.title}</span>
}
```

그 스토어의 모든 필드 변경이 사이드바 하위 트리 전체를 다시 렌더링하며, 컴포넌트의 구독 집합은 그것을 바인딩한 위치에서 보이지 않습니다.

## props는 데이터와 콜백을 담고 React 노드는 담지 않습니다

prop은 데이터이거나 콜백이고, React 노드는 선언된 슬롯을 통해 이동합니다. 엘리먼트를 prop 값이나 주입 멤버로 전달하면 슬롯 계약이 설명하지 않는 두 번째 조합 경로가 숨고, 렌더 제어가 등록 표면에서 호출 지점으로 옮겨 가며, 한 패키지가 다른 패키지의 마크업을 조립하게 됩니다. 노드 값을 가진 새 prop이나 주입 멤버는 결코 추가하지 않으며, 호스트가 제공하는 마크업이 필요한 위치는 자식 슬롯으로 선언합니다.

- 판단 기준: 컴포넌트의 props 타입, 주입 팩토리의 반환값, 또는 렌더 위치의 소유자 props 객체에 `ReactNode`, `ReactElement`, `() => JSX.Element`가 있는지입니다.
- 적용되지 않는 범위: 이미 배포된 노드 값 필드는 계속 동작합니다. 규칙은 어떤 변경이 그 필드를 건드릴 때 발동하며, 그 변경은 필드를 확장하는 대신 변환합니다.
- 예외: 같은 변경에서 변환할 수 없을 때는 해당 도메인 전문가가 유예를 확인하고 변경이 그 확인을 기록합니다. 작성자가 스스로 승인할 수는 없습니다.
- 해결: 부모 등록의 `children`에 위치를 선언하고 `renderSlot`으로 렌더링하며, 자식의 props를 통해 데이터를 전달하세요. 어떤 패키지가 어떤 슬롯을 선언하고 렌더링할 수 있는지는 [확장 규칙](../subsystems/slots.ko.md#확장-규칙)이 소유합니다.

헤더 위치는 선언된 자식 슬롯이므로, 호스트는 데이터를 전달하고 등록된 컴포넌트가 자신의 마크업을 소유합니다:

```tsx
// The card declares the header location; the host passes data only.
ctx.slots.register(
  {
    name: 'tool.call.toolview',
    children: { header: { kind: 'single', scope: 'session' } },
  },
  ToolCard,
)

function ToolCard({ title, renderSlot }: Props) {
  return <article>{renderSlot('header', { title })}</article>
}
```

React 노드가 prop 값으로 경계를 넘으면 그 노드가 지나는 조합 경로는 어디에도 선언되어 있지 않습니다:

```tsx
type ToolCardProps = {
  header?: React.ReactNode
  footer?: React.ReactNode
}

// The call site assembles another package's markup.
<ToolCard header={<ArchiveBadge />} />
```

카드의 슬롯 계약은 무엇을 렌더링하는지 설명하지 못하게 되고, 렌더 제어는 호출 지점에 남으며, 배지의 패키지는 전달하는 쪽의 런타임 참조가 됩니다.

## 슬롯 등록 값은 안정적인 함수 컴포넌트입니다

슬롯에 등록되는 값은 모듈 스코프에서 선언한 안정적인 함수 컴포넌트입니다. 렌더 중에 만든 컴포넌트 함수는 매 렌더마다 새 컴포넌트 타입이며, React는 바뀐 타입을 다른 컴포넌트로 취급합니다. 즉 하위 트리를 언마운트하고 새로 마운트하므로 펼쳐 둔 행, 입력 포커스, 스크롤 위치가 초기화됩니다. 등록 시점의 매개변수는 렌더 시점 변수를 클로저로 잡지 않고 props를 통해 컴포넌트에 도달합니다.

- 판단 기준: 등록되는 값이 어디서 만들어지는가. 등록이나 렌더 호출 안의 인라인 화살표 함수, 렌더 본문 안에서 정의한 컴포넌트, 인라인 컴포넌트를 감싼 `useCallback`은 모두 실패하며, 모듈 스코프의 `function` 선언은 통과합니다.
- 적용되지 않는 범위: 이 규칙은 등록되는 값의 정체성을 제한할 뿐 그 복잡도를 제한하지 않습니다. 안정적인 컴포넌트도 주입된 props, 훅, 콜백을 읽을 수 있습니다.
- 예외: 렌더 중 컴포넌트를 만드는 것은 호출자가 리마운트를 원할 때만 옳으며, 평범한 변경에는 별도 승인이 필요하지 않습니다. 슬롯 계약의 형태를 바꾸는 변경은 “상태는 주입을 통해 도착합니다”에서 설명한 주입 면 리뷰를 따릅니다.
- 해결: 컴포넌트를 모듈 스코프로 옮기고, 등록의 공유(share)에서 props 타입을 얻으며, 변하는 값은 클로저 대신 주입 면을 통해 전달하세요.

등록은 모듈 스코프 컴포넌트에 대한 하나의 안정적인 참조를 가지며, 변하는 값은 주입으로 도착합니다. 렌더 위치는 지역 컴포넌트를 제공합니다:

```tsx
function PanelTitle({ title, count }: Props) {
  return <span>{title} ({count})</span>
}

// Registration: the local slot's scope is declared, never a component.
ctx.slots.registerFactory(
  {
    name: 'panel',
    scope: 'root',
    slots: { title: { scope: 'root' } },
    inject: () => ({ title: 'Sessions', count: 3 }),
  },
  Panel,
)

// The render site passes the local component, keeping its identity stable.
renderFactorySlot('panel', { /* owner data */ }, { slots: { title: PanelTitle } })
```

렌더 위치의 인라인 화살표 함수는 그 렌더가 실행될 때마다 새 컴포넌트 타입을 만듭니다:

```tsx
// A new component type each time this render runs.
renderFactorySlot('panel', { /* owner data */ }, { slots: { title: (p) => <span>{p.title}</span> } })
```

React는 이전 등록과 다른 타입을 보고 시트를 다시 마운트하며, 그 밖에는 무관한 갱신에서도 펼침, 포커스, 스크롤 위치 같은 지역 상태를 초기화합니다.

## 컴포넌트는 Cordis 컨텍스트를 받지 않습니다

`ctx`는 apply 세계, 즉 플러그인 본문과 ctx를 클로저로 잡은 `inject` 팩토리에 속합니다. 컴포넌트는 Cordis 컨텍스트를 받지 않고, 서비스 클래스를 임포트해 찔러 보지도 않으며, React 컨텍스트도 읽지 않습니다. 업무 컴포넌트는 어떤 컨텍스트도 보지 못하며, 렌더러의 바인딩 컨텍스트는 렌더러 내부의 것입니다. 맨 옵저버블은 Injection이 훅으로 감싼 뒤에야 컴포넌트에 도달하며, 직접 구독하는 컴포넌트는 주입 면의 어떤 것도 해제하지 않는 수명 주기를 소유하게 됩니다.

- 판단 기준: 컴포넌트의 매개변수나 props 타입에 `ctx` 또는 `Context`가 있는지, 컴포넌트 본문이 `observable.value`를 읽거나 `subscribe`를 호출하거나 `useSyncExternalStore`를 연결하는지, 서비스 클래스가 기능 `.tsx` 모듈로 임포트되는지입니다.
- 적용되지 않는 범위: React 밖의 무엇에도 구독하지 않는 컴포넌트 내부의 동작 훅(타이머, 미디어 쿼리)은 주입 내용이 아니며 컴포넌트에 남습니다.
- 예외: 없습니다. `TabSlot`에 아직 남아 있는 직접 구독은 그 항목의 소유자가 맡은 교정 작업이며, 새 코드의 선례가 아닙니다.
- 해결: 그 사실을 등록의 `inject`(일반 데이터와 콜백, 맨 옵저버블은 예약된 `hooks` 구획)로 옮기거나 선언된 스토어로 옮기고, 파생된 시트를 통해 읽으세요.

Injection이 옵저버블을 바인딩하고, 컴포넌트는 구독을 렌더러가 소유하는 파생 훅 하나를 읽습니다:

```tsx
// The inject factory is the only place that closes over ctx.
const inject = () => ({
  hooks: { tab: tabStore.observable },
  action: { openTab },
})

function TabView({ useTab, action }: Props) {
  const { loaded } = useTab()   // the renderer owns the subscription
  return <button hidden={loaded} onClick={() => action.openTab('files')} />
}
```

컴포넌트가 `ctx`를 들고 소스를 직접 읽으므로 구독과 그 수명이 컴포넌트에 속합니다:

```tsx
function TabView({ ctx }: { ctx: Context }) {
  const store = ctx.get('tabStore')                     // component holds the container
  return <span>{store.observable.value.title}</span>    // raw observable read in render
}
```

그 구독을 해제하는 쪽이 없고, 다시 렌더링이 React의 스케줄링 밖에서 일어나며, 컴포넌트는 이제 하나의 스토어 구현에 묶입니다.

## 컨텍스트는 현재 스코프에서 옵니다

`session`, `panel`, `tab` 같은 값은 현재 스코프, 즉 제공자나 주입된 멤버 또는 프레임워크 훅에서 옵니다. 새로운 전역 `current`, `active`, `selection`, `viewId`는 그것에 닿는 통로가 아니므로, 한 세션의 여러 컴포저와 대화가 각각 독립적으로 동작합니다.

판단 조건은 컴포넌트가 자신의 컨텍스트를 스코프를 통해 얻는지, 전역 필드를 통해 얻는지입니다. 다중 인스턴스 동작이 시험대입니다. 한 세션 아래의 두 컴포저가 서로 교차해서는 안 됩니다. 객체가 정말로 전역적으로 유일하다면 서비스나 인스턴스가 그것을 담고 호출자가 명시적으로 `inject`합니다.

```ts
// The injected factory closes over the scope's own session and panel.
interface Scope { readonly session: string; readonly panel: string }
const inject = (ctx: Scope) => ({ session: ctx.session, panel: ctx.panel })
```

```ts ignore-check
const activeTabId = globalThis.__activeTabId   // every tab reads the same value
```

잘못된 형태는 인스턴스가 서로 간섭하게 만들고 상태의 소유권을 감사할 수 없게 합니다.

## 리소스 소비자는 `useResource`를 거칩니다

리소스를 표시하는 엘리먼트는 주입된 `useResource` 훅을 통해 그것을 읽으며, 리소스의 프로토콜과 주소로 지정합니다. 도메인 래퍼(탭, 패널)는 `useResource` 위에 자체 훅을 조합하며 반환 구조는 자유롭지만, 그 아래의 가져오기, 캐시, 구독을 다시 만들지는 않습니다. 프로토콜마다 두 번째 읽기 경로를 두면 캐시와 무효화 정책이 갈라져, 같은 주소가 한곳에서는 최신이고 다른 곳에서는 오래된 상태가 될 수 있습니다.

- 판단 기준: 읽기 경로입니다. `useResource<Protocol>(address)` 또는 그 본문에서 이를 호출하는 업무 훅은 통과하며, 손으로 만든 구독·캐시, 제공자의 스트림 처리 사본, `useTabStream` 같은 평면적 일반 훅은 실패합니다.
- 적용되지 않는 범위: 리소스가 아닌 지역 UI 상태(접힘, 호버, 초안)는 `useState`로 남고 리소스 주소를 받지 않습니다. 상태 값과 리소스를 열어 두는 조건은 [클라이언트 리소스](../subsystems/client-resources.ko.md)가 소유합니다.
- 예외: 스냅샷을 재구성하는 것은 자유롭지만, 프로토콜 차이를 조건 분기 뒤에 숨기는 래퍼는 리뷰에서 소유권을 밝혀야 하며, 새 프로토콜의 훅은 그 프로토콜의 소유자에게서 옵니다.
- 해결: 도메인 훅 안에서 `useResource`를 호출하고 그 결과를 컴포넌트가 렌더링하는 형태로 매핑하며, 맞춤 캐시를 삭제하세요.

도메인 래퍼는 주입된 훅을 인수로 받아 결과만 재구성하므로 맨 아래 계층은 하나로 유지됩니다:

```tsx
// The bottom layer is the standard hook, reached through the component's inject face.
function useChatMessages(useResource: UseResource, id: string) {
  const resource = useResource<'chat'>(`dsh-resource://chat/${id}`)
  return resource.status === 'live' && resource.value !== undefined
    ? { messages: resource.value.messages, loading: false }
    : { messages: [], loading: true }
}

function ChatBody({ id, useResource }: Props) {
  const { messages } = useChatMessages(useResource, id)
  return <ol>{messages.map((message) => <li key={message.id}>{message.text}</li>)}</ol>
}
```

래퍼가 구독, 캐시, 무효화를 자기 이름으로 다시 만들면 제공자의 수명 주기와 공유 캐시가 더는 적용되지 않습니다:

```tsx
export function useTabStream(id: string) {
  const [value, setValue] = useState<TabData>()            // bespoke cache
  useEffect(() => {
    const subscription = tabProtocol.open(id).subscribe(setValue)   // bespoke subscription
    return () => subscription.close()                              // bespoke teardown
  }, [id])
  return value
}
```

프로토콜마다 자체 가져오기와 무효화 로직을 기르고, 캐시 항목과 새로 고침 정책을 통일할 수 없으며, 같은 주소의 소비자들이 현재 값에 대해 서로 다른 말을 합니다.

## 스토어 사용은 좁고 명시적입니다

프런트엔드 스토어는 공유 보기 상태나 상호 작용 상태를 담습니다. 그 명세는 초기 상태, 이를 변경하는 액션, 그리고 값이 다시 로드되어도 살아남아야 할 때 프레임워크가 기계적으로 실행하는 영속성 키를 선언합니다. 세션 스코프 인스턴스는 그 키에 접미사를 붙여 세션별 인스턴스가 독립적으로 영속되게 합니다. 스토어의 속성과 이를 변경하는 액션은 캡슐화되어 좁은 인터페이스로 주입되므로, 컴포넌트는 그것들과 필요한 셀렉터를 받고 뷰 스토어 전체를 받는 일은 없습니다. 업무 데이터는 스토어가 아니라 객체 계층에 살고, 설정 변경은 스토어 상태가 아니라 설정 인터페이스를 거칩니다.

- 판단 기준: 주입 면이 좁은 인터페이스인지 스토어 객체 자체인지, 그리고 핸들이 `apply` 안에서 만들어지는지 모듈 수준에서 만들어지는지입니다.
- 영속성: 명세의 `persist` 키가 전체 메커니즘이며 프레임워크가 실행합니다. 엔진 인스턴스는 `getSnapshot`, `subscribe`, 구워진 액션, `clearPersisted`를 노출하며, 어느 것도 손으로 수화(hydrate)하지 않습니다.
- 적용되지 않는 범위: 스토어의 렌더 상태는 설정을 바꾸지 않는 한 괜찮으며, 컴포넌트 지역 상태는 스토어 내용이 아닙니다. 선언된 스토어가 props가 되는 방식은 [스토어 계약](../subsystems/slots.ko.md#컴포넌트-입력)이, 업무 데이터가 사는 곳은 [웹 클라이언트 아키텍처](../subsystems/web-client.ko.md)가 소유합니다.
- 예외: 모듈 수준으로 내보낸 스토어 핸들은 금지됩니다. 모듈 캐시 정체성은 플러그인 리로드 사이에서 위장된 싱글턴입니다. 주입 면을 좁은 형태로 재구성하는 데는 별도 승인이 필요하지 않습니다.
- 해결: inject 반환값의 스토어 핸들을 컴포넌트가 렌더링하는 필드와 액션 콜백으로 바꾸고, 핸들은 `apply` 안에 두세요.

핸들 하나를 `apply` 안에서 만들어 등록에 전달하고, 주입 면은 뷰가 렌더링하는 필드와 액션만 담습니다:

```tsx
// The handle is built in apply; persistence is the spec's own key.
const sidebarStore = createSidebarStore()   // defineStore({ init, actions, persist: 'sidebar' })

ctx.slots.register(
  { name: 'sidebar.header', store: sidebarStore, inject: () => ({ onSelect: selectPanel }) },
  SidebarHeader,
)

// The component reads through the framework-bound seat and writes through the actions.
function SidebarHeader({ useStore, actions, onSelect }: Props) {
  const { title } = useStore()
  return <button onClick={onSelect}>{title}</button>
}
```

뷰 스토어 전체를 주입해 컴포넌트가 필드를 골라 쓰게 하면, 모듈 수준 핸들이 인스턴스 수명 주기를 프레임워크에서 빼앗습니다:

```tsx
// The component receives the store itself and picks its own fields.
const inject = () => ({ viewStore })

function SidebarHeader({ viewStore }: Props) {
  return <button onClick={viewStore.select}>{viewStore.activePanel.title}</button>
}

// Module-level handle: one identity shared by every plugin load.
export const paneStore = createPaneStore()
```

컴포넌트의 의존 면은 감사할 수 없게 되고, 공유 모듈 정체성은 모든 스코프 정리보다 오래 살아남습니다. 두 패널이 각자 하나씩이 아니라 하나의 인스턴스를 함께 쓰게 됩니다.

## 정체성과 초기 상태는 의도적으로 정합니다

상태를 전환해도 컨트롤을 다시 마운트하거나 그 DOM 노드를 교체하지 않습니다. 인스턴스와 DOM 정체성이 상태 변경 전후로 같아서 포커스, 선택, 작성 중인 초안이 살아남습니다. 초기 상태는 첫 흐름이 실행될 때 준비됩니다. 같은 경로가 데이터를 준비하고 상태를 확립하며, 나중에 효과로 채우지 않습니다. 컴포넌트는 서비스 전체가 아니라 훅, 셀렉터, 액션 콜백을 받습니다.

- 판단 기준: 상태 변경 후 컨트롤 인스턴스와 그 DOM 노드가 정체성을 유지하는지입니다. 언마운트 후 마운트가 일어나면 위반입니다. 초기화 경로도 같은 방식으로 판단합니다. 첫 흐름 안에서 확립한 상태는 통과하고, 효과에서 쓴 상태는 실패합니다.
- 의존 면: 훅이 읽고, 셀렉터가 하위 상태를 고르고, 액션 콜백이 다시 씁니다. 서비스 전체를 prop이나 주입 멤버로 전달하면 실패합니다.
- 범위: 내부 인스턴스와 지역 상태를 가진 입력·명령 컨트롤, 그리고 팩토리가 만드는 업무 뷰입니다.
- 예외: 정말로 필요한 리마운트(인스턴스 상태를 옮길 수 없는 데이터 집합으로 전환하는 경우)는 상태 마이그레이션 계획과 함께 리뷰에서 설명하며, 컨트롤의 인스턴스 수명에 영향을 주는 변경의 리뷰어가 이를 받아들입니다.
- 해결: 첫 흐름이 상태를 만드는 곳에서 초기 값을 도출하고, 레이아웃 노드는 마운트한 채 props만 바꾸며, 서비스 prop을 세 가지 좁은 공유로 대체하세요.

초안은 세션과 함께 존재하고, 컴포저 노드는 마운트된 채 props만 바뀝니다:

```tsx
// The draft is built by the first flow; nothing fills it in later.
const draft = useDraftState(sessionId)
const { canSend } = useComposerSelectors(draft)

// The node stays mounted; state changes reach it as props.
return (
  <div className={s.composer} data-ready={canSend || undefined}>
    {draft.text}
  </div>
)
```

초기 상태가 한 커밋 늦게 도착하고, key가 붙은 컨트롤은 세션이 바뀔 때마다 다시 만들어집니다:

```tsx
// The draft is filled in after the first commit.
useEffect(() => { setDraftState(initialDraft) }, [])

// The keyed composer unmounts on every session switch.
<Composer service={composerService} key={sessionId} />
```

첫 프레임은 빈 초안을 렌더링하고, 세션을 전환할 때마다 포커스와 선택, 사용자가 입력해 둔 내용이 사라집니다.

## `useLayoutEffect`는 기본값이 아닙니다

`useLayoutEffect`는 기본적으로 사용하지 않으며, 이를 `useEffect`로 바꾸는 것은 해결이 아닙니다. 둘은 코드가 하는 일이 아니라 타이밍에서 다르기 때문입니다. 레이아웃 측정은 먼저 왜 이곳에서 일어나는지, 왜 CSS로 표현할 수 없는지, 왜 픽셀 측정이어야 하는지에 답한 뒤에야 해당 도메인 전문가의 승인을 받아 주입된 측정 훅으로 옮깁니다. 어느 종류의 효과든 상태를 기록하거나 로직을 바인딩하지 않습니다. 그것은 Injection에 속합니다.

- 훅 이름이 아니라 목적으로 판단합니다. 그 효과가 어떤 측정 또는 어떤 바인딩을 위해 존재하는가입니다. 상태를 기록하거나 로직을 바인딩하는 효과는 제공자나 주입된 훅으로서 Injection으로 돌아갑니다. 세 가지 질문을 통과한 측정만 남고, 그 결과는 선언적 레이아웃 매개변수로 소비됩니다.
- 적용되지 않는 범위: 두 효과의 타이밍 차이는 `@types/react`가 `useLayoutEffect`에 대해 DOM 변이 후, 페인트 전에 동기적으로 실행된다고 문서화한 배경 지식일 뿐이며, 하나를 다른 하나로 다시 쓸 수 있는 허가가 아닙니다.
- 예외: 남겨 두는 `useLayoutEffect`는 어떤 것이든 해당 도메인 전문가의 확인이 필요하며, 변경은 그 확인을 기록합니다.
- 해결: 레이아웃을 CSS(grid, `aspect-ratio`, 컨테이너 쿼리)로 표현하거나, 주입된 훅 안에서 측정을 모아 값 하나로 노출하세요.

레이아웃은 CSS로 선언하고, 질문을 통과한 유일한 측정은 주입된 훅에 둡니다:

```tsx
// Fix 1 — express the layout in CSS and delete the measurement.
// .card { display: grid; grid-template-columns: minmax(0, 1fr) auto; aspect-ratio: 16 / 9; }

// Fix 2 — the approved measurement is injected and returns one value.
function CardBase({ useLayoutMeasurements }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const { gutterWidth } = useLayoutMeasurements(ref)
  return <div ref={ref} className={s.card} style={{ '--gutter': `${gutterWidth}px` }} />
}
```

아래의 처음 두 효과는 잘못된 질문(어떤 효과를 쓸 것인가)에 답하고, 세 번째는 바인딩을 효과에 세워 둡니다:

```tsx
// A synchronous pixel measurement the design did not need.
useLayoutEffect(() => { setHeight(ref.current.getBoundingClientRect().height) }, [])

// The same measurement with the hook name swapped.
useEffect(() => { setHeight(ref.current.getBoundingClientRect().height) }, [])

// Logic binding parked in an effect instead of Injection.
useEffect(() => { bindShortcut(handler) }, [])
```

이름만 바꾸면 레이아웃 문제는 그대로 남고, 측정된 높이는 이제 어떤 효과를 골랐는지에 달려 있으며, 단축키는 Injection을 거치지 않고 한 렌더 늦게 바인딩됩니다.

## 효과는 렌더에서 파생된 데이터를 부모로 밀어 올리지 않습니다

효과 본문은 props나 슬롯 props로 받은 setter를 호출해 부모로 데이터를 밀어 올리지 않습니다. 그 데이터를 컴포넌트가 이미 가진 props나 상태에서 렌더 중에 결정할 수 있는 경우에는 특히 그렇습니다. 그러한 밀어 올리기는 두 번째 렌더를 치르게 하고, 부모가 첫 프레임에서 값을 갖지 못하게 하며, 이후의 모든 상태 변경을 렌더 연쇄로 바꿉니다. 값은 렌더 중에 결정하거나, 호스트가 렌더 시점 통로로 받아 가거나, 사용자 제스처가 자기 핸들러에서 자기 상태를 갱신합니다.

- 판단 기준: 효과 안에서 props나 슬롯 props의 setter를 호출하고, 그 인수가 현재 props나 상태에서 파생되며, 이를 이끄는 외부 이벤트나 구독 콜백이 없는 경우입니다. 정리 함수 `return () => setX(undefined)`도 같은 위반의 일부입니다.
- 리뷰에서 밝혀야 할 결과: 추가 렌더 패스, 부모의 첫 프레임에서 값이 빠짐, 멤버를 빠뜨렸을 때 낡아 버리는 의존성 배열, 효과 → 부모 상태 → 렌더 연쇄, 부모 상태와 뒤엉킨 자식 수명 주기입니다.
- 적용되지 않는 범위: 진짜 외부 이벤트(구독 콜백, 소켓 프레임, 사용자 제스처)에 반응하는 효과는 이 패턴이 아니며, 이벤트 핸들러는 상태를 직접 갱신해도 됩니다.
- 예외: 기본적으로 없으며, 예외가 있으면 해당 도메인 전문가의 확인이 필요합니다.
- 해결(순서대로): 상태가 이미 있는 곳에서 UI를 렌더링하고, 호스트가 렌더링해야 한다면 렌더 중에 값을 넘기며, 상태가 항목 사이에서 공유된다면 주입 면이나 선언된 스토어로 옮기세요.

컨트롤은 상태가 이미 사는 곳에서 렌더링하고, 공유 변형은 렌더 중에 읽으며 쓰기는 제스처 핸들러에 둡니다:

```tsx
// 1. Render it where the state already lives; no channel is needed.
return <Button onClick={() => setShowOriginal((v) => !v)}>{label}</Button>

// 2. The host renders it: the flag is declared state, read during render
//    and written only from the gesture handler.
const { showOriginal } = useStore()
const { toggleOriginal } = actions
return <Button onClick={toggleOriginal}>{showOriginal ? rendered : source}</Button>
```

`label`과 `disabled`는 렌더에서 도출할 수 있으므로, 효과에서 부모의 setter를 호출하면 부모가 두 번 렌더링하고도 첫 프레임에서는 여전히 헤더가 없습니다:

```tsx
useEffect(() => {
  setHeaderAction({ label, disabled, onClick })   // render-derivable data pushed up
  return () => { setHeaderAction(undefined) }
}, [label, disabled, setHeaderAction])
```

부모는 첫 패스에서 가질 수 있었던 데이터를 위해 두 번 렌더링하고, 헤더는 한 프레임 늦게 나타나거나 깜빡이며, 손으로 쓴 의존성 배열이 게시 시점을 결정합니다.

## 빌드와 스타일은 소유자를 따릅니다

클라이언트 패키지의 모든 빌드 조정은 그 패키지의 tsdown 플러그인을 거치며, 패키지가 자체 빌드 분기를 기르는 일은 없습니다. 스타일은 CSS Modules를 거치고, 이미지와 GIF, SVG만 인라인하며, 그것도 JSX가 아니라 CSS로 인라인합니다. 큰 텍스트는 TSX에 인라인으로 등장하지 않고, `style` 객체는 런타임 계산 값만 담습니다. 정적 값과 스타일 변형은 CSS Module 클래스 이름에 속하기 때문입니다.

- 판단 기준: tsdown 플러그인 대신 패키지 안에 새 빌드 분기가 있는지, 기능 스타일에 리터럴 색상이나 컴포넌트 라이브러리, Tailwind가 있는지, TSX에 base64 데이터나 큰 텍스트가 있는지, `style` 객체가 정적 값이나 변형 스위치를 담는지입니다.
- 적용되지 않는 범위: 측정된 거터나 진행률처럼 런타임에 계산된 값은 `style`에 들어갈 수 있고, 컴포넌트 지역 사용자 지정 속성이 레이아웃 값을 담을 수 있습니다. 토큰, CSS Module, 클래스 이름 규칙은 [컴포넌트 규칙](../web-styling.ko.md#컴포넌트-규칙)이 소유합니다.
- 예외: 새 빌드 분기나 새 인라인 형태는 반영 전에 리뷰에서 설명하며, 그것이 남을지는 소유 패키지의 규칙이 결정합니다.
- 해결: 변형을 `className`으로 전환되는 CSS Module 클래스로 옮기고, base64는 빌드 체인이 만들어 내는 CSS에 두며, TSX 모듈에서 큰 텍스트 상수를 삭제하세요.

컴포넌트는 클래스 이름과 데이터 속성을 전환하고, 프레젠테이션은 CSS Module이 소유합니다:

```tsx
import s from './card.module.css'

// Style variants are class names, not style-object branches.
export function Card({ active, tone, children }: Props) {
  return (
    <div className={clsx(s.card, active && s.active)} data-tone={tone}>
      {children}
    </div>
  )
}
```

큰 텍스트와 인라인된 바이너리 데이터가 모듈에 들어오고, `style` 객체가 테마가 덮어쓸 수 없는 변형을 인코딩합니다:

```tsx
const HUGE = '...several KB of text...'   // large text inline in the module

// A variant switch and an inlined asset both sit in the style object.
<div style={{ color: toneColor, backgroundImage: `url(${AVATAR_DATA_URL})` }} />
```

번들이 CSS와 자산에 속해야 할 텍스트와 바이너리 데이터를 짊어지고, diff에는 읽을 수 없는 덩어리가 실리며, 테마 덮어쓰기가 더는 그 색에 닿지 못합니다.

## key는 식별 대상을 밝힙니다

`key`는 엘리먼트가 어떤 엔티티나 인스턴스를 나타내는지 밝힐 때만 전달하고, 그 정체성을 밝히세요. 예를 들어 `turnId`는 한 세션 안에서 유일합니다. 대부분의 목록은 이미 안정적인 업무 id를 가져 추가 key가 필요하지 않습니다. 경고를 잠재우거나 렌더 순서를 인코딩하려고 지어낸 key는 데이터에 없는 정체성을 선언하며, 배열 인덱스는 결코 그 정체성이 될 수 없습니다. 삽입이나 삭제가 뒤따르는 모든 항목을 다른 엘리먼트로 밀어내기 때문입니다.

- 판단 기준: 항목의 정체성을 위치로 표현할 수 있는지 안정적인 id로 표현할 수 있는지입니다. key를 전달할 때는 변경이 무엇이 그것을 유일하게 만드는지 밝히며, 가변 목록에 대한 `key={index}`는 실패합니다.
- 적용되지 않는 범위: 목록 항목이 key를 가져야 한다는 React 자체의 요구 사항은 여전히 적용됩니다. 그 key는 항목의 안정적인 업무 id이며 그 옆의 두 번째 key가 아닙니다.
- 예외: 없습니다. 평범한 변경에는 승인이 필요하지 않으며, 공유 컴포넌트의 key 시맨틱은 리뷰에서 밝힙니다.
- 해결: 엔티티의 안정적인 id를 사용하고, 두 행이 정말로 하나의 id를 공유한다면 key에 인덱스를 섞는 대신 id 출처를 고치세요.

key는 턴 자체의 id이며, 세션 안에서의 유일성이 엘리먼트가 나타내는 정체성입니다:

```tsx
// turnId is unique inside a session; the id is the identity.
export function TurnList({ turns }: Props) {
  return (
    <ol>
      {turns.map((turn) => <TurnRow key={turn.turnId} turn={turn} />)}
    </ol>
  )
}
```

인덱스가 정체성을 대신하므로 목록이 바뀔 때 뒤따르는 모든 행의 정체성이 바뀝니다:

```tsx
// The index stands in for identity.
{items.map((item, index) => (
  <Row key={index} data={item} />
))}
```

삽입이나 삭제 후에 뒤따르는 각 행은 새 데이터에 이전 상태를 유지하므로, 펼쳐 둔 행이나 작성 중인 편집이 엉뚱한 항목에 나타납니다.

## 각 공유 계층은 자체 격리 수준을 유지합니다

기능은 자신의 요구 사항을 자체 패키지에서 흡수하며, 공유 코드와 얼마나 분리해야 하는지는 그 코드가 속한 공유 계층에 따라 다릅니다. 찾아야 할 위반은 공유 계층에 놓인 기능 전용 개념입니다. 그러면 다른 모든 소비자가 자기 것이 아닌 개념을 이해해야 하고, 그 분기를 철회하기도 어렵습니다.

| 공유 코드 | 기능이 유지하는 격리 |
|---|---|
| `ui-primitives`, 카탈로그에 오른 컨트롤 | 카탈로그의 컨트롤을 소비합니다. 새 컨트롤은 기능 패키지에서 시작하고, 두 번째 소비자가 필요로 할 때만 공유 카탈로그로 승격합니다. |
| `ui-layout`과 셸 레이아웃 | 소비합니다. 기능 패키지에서 래퍼, 덮어쓴 스타일, 추가 계층으로 적응시키세요. |
| `ui-renderer`와 그 밖의 렌더 기계 | 업무 코드에서 값 의존성을 두지 않습니다. 문서화된 등록 seam(슬롯, provide/inject로 바인딩된 훅, 선언된 스토어)을 통해서만 확장합니다. |
| 다른 기능 플러그인 | 런타임 임포트도, 그 값의 재내보내기도 없습니다. UI는 슬롯으로, 동작은 주입된 서비스로 건넙니다. 공유 런타임 코드는 `client/store`, `ui-primitives`, 브라우저 안전 유틸리티 패키지처럼 좁은 정적 소유자에 삽니다. |
| 데이터 객체 계층(`client/connection`, `session-controller/client`, `client/store`) | 문서화된 표면을 통해 읽습니다. 기능 자체의 개념은 이 객체들이나 그 스토어에 들어가지 않습니다. |
| 기능 자체의 패키지 | 제한 없음 — 요구 사항은 이곳에서 흡수하며, 자체 행과 정렬, 프레젠테이션도 포함합니다. |

- 판단 기준: diff가 기능 전용 분기, 필드, 개념을 기능 자체의 패키지가 아닌 다른 계층에 넣는지입니다.
- 적용되지 않는 범위: 기능이 소유한 코드, 그리고 한 기능의 필요가 아니라 정말로 일반적인 공유 계층 변경입니다.
- 예외: 공유 계층 변경은 해당 도메인 전문가의 확인을 받고 모든 소비자에 대해 회귀를 확인합니다. GUI 변경은 [packages/client/AGENTS.md](../../packages/client/AGENTS.md)의 최소 검사를 실행합니다.
- 해결: 요구 사항을 기능 패키지에서 흡수하거나, 필요가 정말로 일반적이라면 소유자의 승인과 함께 별도 변경으로 공유 계층에 승격하세요.

기능이 자신의 행 렌더링과 정렬 규칙을 소유하고, 기반 컴포넌트는 바꾸지 않고 소비됩니다:

```tsx
// The feature owns its rows; the base is consumed, not edited.
// packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx
export function WorkspaceBrowser({ rows, onArchive }: Props) {
  const ordered = [...rows].sort((a, b) => Number(b.archived) - Number(a.archived))
  return (
    <ul>
      {ordered.map((row) => <WorkspaceRow key={row.id} row={row} onArchive={onArchive} />)}
    </ul>
  )
}
```

기반 컴포넌트가 한 기능의 정렬 규칙을 배우면, 모든 소비자가 자기 것이 아닌 개념을 물려받습니다:

```tsx
// ui-layout: the base learns one feature's ordering rule.
export function BrowserList({ rows, ...rest }: Props) {
  const ordered = [...rows].sort((a, b) => Number(b.archived) - Number(a.archived))
  return <ul {...rest}>{ordered.map((row) => <Row key={row.id} row={row} />)}</ul>
}
```

이제 `ui-layout`의 다른 모든 소비자가 한 기능에만 있는 보관(archive) 개념을 이해해야 하고, 그 분기를 철회하려면 그들 모두를 감사해야 합니다.
