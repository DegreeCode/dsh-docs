# Web 클라이언트 슬롯

[English](slots.md) | [中文](slots.zh.md) | 한국어

슬롯은 Web 클라이언트의 타입 지정 React 조합 시스템입니다. [`dsh-client-ui-slots`](../../packages/client/ui-slots/README.md)가 React 없는 레지스트리와 타입 대수를 정의하고, [`dsh-client-ui-renderer`](../../packages/client/ui-renderer/README.md)가 관찰 가능한 소스를 훅에 결속하고, 트리를 렌더링하며, React 컨텍스트를 내부적으로 소유합니다. 기능 플러그인은 `ctx.slots.register()`를 통해 UI를 기여하며 다른 기능 플러그인의 컴포넌트를 절대 import하지 않습니다.

이 페이지는 슬롯 소유권, 컴포넌트 입력, 확장 API, 배포되는 계층을 문서화합니다. 주변 부트, Remote, 클라이언트 모델, Conversation 경로는 [Web 클라이언트 아키텍처](web-client.ko.md)에 있습니다.

`plugins.bundle.config`는 npm 패키지 이름으로 키잉된 번들 상세 구성을 공급합니다. `plugins.bundle.activation`은 사용자가 요청한 활성화 이후 선택적 안내를 렌더링하며, 그 번들의 상세를 닫거나 열도록 소유자 콜백을 받습니다. `conversation.input.activity`는 모델 선택기와 보내기 사이에 동작 하나를 공급하며, 툴바 확장은 언마운트 시 해제됩니다.

플러그인 카탈로그는 설치 후 추가 플러그인 메뉴에서 `MenuItemButton` 행을 위한 루트 범위 목록 `plugins.add.actions`를 선언합니다. 그 소유자는 동작을 시작하기 전에 메뉴를 닫도록 `onDismiss()`를 공급합니다. 슬롯은 소유 Plugins 페이지 선언 수명을 따릅니다.

루트 범위 목록 `sidebar.panellist.actions`, `conversation.session.header.views.actions`, `sidebar.right.tab.guide.actions`는 패널 행, View 탭, 오른쪽 사이드바 안내 카드 다음의 더 보기 메뉴 행을 공급합니다. 영역은 그 목록에 등록이 있는 동안에만 더 보기 버튼과 메뉴를 그리고, 사용자 지정 가능한 항목을 고정 상태, `onOpen`, `onPinnedChange`, `onDismiss`와 함께 전달합니다. 패널과 View 항목은 고정 상태와 무관하게 현재 선택에 대한 선택적 `active` 상태도 담습니다. 각 영역은 고정되지 않은 항목 id를 메모리에 유지하며, [`ui-entry-customization`](../../packages/client/ui-entry-customization/README.md)이 배포되는 행을 등록합니다.

[ui-workspace](../../packages/client/ui-workspace/README.md#understand-the-implementation)는 세션 행 확장 위치, 가시성, 키보드 동작을 문서화합니다.

## 선언과 수명 주기

`SlotMap`은 컴파일 타임 레지스트리입니다. 패키지가 키, 카디널리티, 범위, 소유자 props, 키 지정 props, 선택적 슬롯 수준 inject 얼굴을 선언 병합합니다. 런타임 선언은 렌더 위치를 소유한 컴포넌트의 대응 `children` 항목입니다.

자식을 선언하면 세 가지 효과가 있습니다. 즉 자식 키를 살아 있게 만들고, 그 부모 항목의 `renderSlot` 또는 `renderSlotChain` 호출을 승인하며, 런타임 디스패치 명세를 기록합니다. 살아 있는 항목 하나가 각 선언을 소유합니다. 선언되지 않은 슬롯에 등록하거나 다른 곳이 이미 소유한 자식을 선언하면 플러그인 활성화 중에 실패합니다.

`root`는 유일한 내장 선언이며 Cordis 서비스 자체를 통해 렌더링되는 유일한 키입니다. `ui-renderer`가 `ctx.slots.renderSlot('root', {})`를 호출하고, 모든 하위는 그것을 선언한 항목의 `renderSlot` 또는 `renderSlotChain` prop을 통해 렌더링됩니다.

등록과 선언은 Cordis 효과 수명을 따릅니다. 항목을 폐기하면 그 기여가 제거되고 그것이 선언한 자식 슬롯이 재귀적으로 접힙니다. 따라서 다른 패키지의 슬롯에 기여하는 기능은 `ctx.slots.inject(key, callback)`을 사용합니다. 콜백은 선언 수명마다 실행되고, 소유자가 접히면 그 효과가 제거되며, 소유자가 다시 마운트되면 다시 실행됩니다.

```tsx ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function HeaderAction({ useSession }: HeaderActionProps) {
  const running = useSession(snapshot => snapshot.running)
  return <button disabled={running}>Review</button>
}

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'review',
      order: 100,
    }, HeaderAction))
}
```

## 카디널리티와 범위

슬롯 선언은 두 개의 독립 축을 고정합니다.

| 축 | 값 | 의미 |
|---|---|---|
| 카디널리티 | `single` | 셀 하나입니다. 활성 우선순위 승자가 렌더링됩니다. 추가 목록으로 취급하지 말고 자식 슬롯을 사용하세요. |
| 카디널리티 | `list` | 셀은 필수 `id`로 주소 지정되고 `order`, 그다음 등록 순서로 정렬됩니다. |
| 카디널리티 | `keyed` | 소유자가 `entryKey`를 디스패치하고, 일치하는 셀이 키별 props와 함께 렌더링됩니다. |
| 카디널리티 | `chain` | 각 항목이 순수 `select(owner)` 함수를 공급합니다. 우선순위 순서에서 첫 null이 아닌 결과가 렌더링되고 그 결과를 `matched`로 받으며, 없으면 소유자 폴백이 렌더링됩니다. |
| 범위 | `root` | 루트 범위 컴포넌트와 스토어 인스턴스 하나입니다. |
| 범위 | `session-maybe` | 주변 Provider 바인딩을 상속하지만 없이도 렌더링 가능하며, 세션 값은 선택적입니다. |
| 범위 | `session` | 해석된 주변 Provider 바인딩을 요구하고 확정적인 세션 값을 받습니다. |

`priority`는 `single`, `list`, `keyed` 셀에 대한 가림 순위이고 `chain`에 대한 선출 순서입니다. 낮은 값이 먼저 실행되거나 렌더링됩니다. 일반적인 추가 기여는 새 목록 `id`나 키 지정 `key`를 골라야 하며, 배포된 셀을 의도적으로 재사용하면 그 표시가 교체됩니다.

## 컴포넌트 입력

등록된 컴포넌트는 결속 지점에서 조립된 입력을 받습니다. 컴포넌트는 그 멤버를 복사하지 않고 이 타입들을 파생합니다.

| 입력 | 선언 주체 | 컴포넌트 타입 |
|---|---|---|
| 소유자 값과 표준 범위 값 | `SlotMap` 행과 설치된 범위 어댑터 | `PropsRuntime<K>` |
| 승인된 자식 렌더러 | 등록의 `children` 키 | `PropsRenderSlots<S>` |
| 공유 뷰 상태의 선택기 훅과 변경 콜백 | 등록의 `store` | `PropsStore<H>` |
| 비공개 데이터, 콜백, 관찰 가능한 훅 | 등록의 `inject` 팩토리 | `InjectFace<I>` |
| 지역화된 `t` 함수 | 등록의 `locale` 네임스페이스 | `PropsLocale<N>` |
| 선택된 chain 값 | 등록의 `select` 결과 | `ComposedProps`를 통한 `matched` |

`SessionProvider`는 항목이 `session` 또는 `session-maybe` 자식을 선언하면 `PropsRenderSlots`에도 있습니다. `session` prop이 없으면 주변 바인딩을 상속하고, 명시적 `SessionReference`나 `undefined`는 그 하위 트리만 덮어씁니다. Provider는 자신의 전체 본문을 키잉하지 않습니다. 엄격한 `session` 항목은 바인딩 세대가 바뀌면 다시 마운트됩니다. 빈 `session-maybe` 항목은 다시 마운트하지 않고 첫 바인딩을 채택한 뒤, 이후 세대나 부재로의 회귀에서 다시 마운트됩니다.

컴포넌트는 `ctx`를 절대 받지 않습니다. 부모 소유의 시점 값은 `renderSlot`의 소유자 인수를 통해 들어오고, 공유 뷰 상태는 선언된 스토어를 쓰며, 서비스와 모델 객체는 `apply` 클로저에 남아 콜백이나 관찰 가능한 소스로 투영됩니다.

## 프레임워크 제공 훅

배포되는 어댑터가 이 표준 props를 추가합니다. 어느 패키지가 컴포넌트를 등록했는지와 무관하게 대상 슬롯의 범위에 따라 사용할 수 있습니다.

| 가용성 | Props | 소유자 |
|---|---|---|
| 모든 범위 | `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess` | `ui-session` |
| 모든 범위 | `useWorkspaces`, `useWorkspaceAccess` | `ui-workspace` |
| 모든 범위 | `useRemoteAccess`(`global` 리소스) | `api-remote-access` |
| 모든 범위 | `usePanelInfo` | `ui-layout` |
| `session` | `sessionId`, `useSession`, `useProjection`, `useAccess`(결속된 세션의 답) | `ui-session` |
| `session-maybe` | 선택적 `sessionId`, `useSession`, `useProjection`, `useAccess` 결과 | `ui-session` |
| `session` | `useConversation`, `useInput`, `inputActions` | `ui-conversation` |
| `session-maybe` | 선택적 `useConversation`, `useInput`, `inputActions` 결과 | `ui-conversation` |
| `session` | `useChat` | `ui-chat` |
| `session` | `useTrajectory` | `ui-trajectory` |

렌더러는 선언된 스토어에서 `useStore`를, 선언된 로케일 네임스페이스에서 `t`를 만들기도 합니다. 이들은 전역 표준 props가 아니라 등록에서 파생된 props입니다.

프레임워크와 도메인 어댑터 소유자는 대응하는 `GlobalStandardProps`, `SessionStandardProps`, `SessionMaybeStandardProps` 선언 병합과 함께 `ctx.slots.provideRoot()`나 `ctx.uiSession.provide()`를 통해 표준 집합을 확장할 수 있습니다. 기능 컴포넌트는 자체적으로 React 훅 prop을 만들거나 항목 비공개 데이터를 위한 전역 표준 prop을 추가해서는 안 됩니다.

## 개발자 제공 주입

등록의 `inject` 옵션은 평범한 기능 소유 주입 지점입니다. 그 팩토리는 플러그인의 `apply` 세계에서 실행되고, 주입된 Cordis 서비스를 클로저로 잡을 수 있으며, 컴포넌트가 필요로 하는 데이터와 콜백만 반환합니다. `session` 슬롯에서는 `sessionId`를, `session-maybe`에서는 `sessionId | undefined`를 받으며, 스토어가 선언되면 그 스토어의 결속된 동작도 받습니다.

그 반환 값의 예약된 `hooks` 객체는 순수 `getSnapshot`/`subscribe` 소스를 받습니다. 렌더러는 `hooks: { status }`를 `useStatus(selector)` 컴포넌트 prop으로 변환하고 소스 정체성으로 결속을 캐시합니다. 컴포넌트는 소스 자체를 받지 않고 `useSyncExternalStore`를 직접 호출하지도 않습니다.

슬롯 소유자는 모든 점유자가 같은 기능을 필요로 할 때 자식 선언에 `inject` 얼굴을 둘 수 있습니다. 일반 멤버는 모든 점유자에게 그대로 전달됩니다. 그 `hooks` 객체 안의 함수 값 멤버는 훅 팩토리입니다. 이들은 슬롯의 표준 props와 선택적 렌더별 `hookContext`를 받은 뒤 점유자에게 노출되는 제약된 훅을 반환합니다. `conversation.chat.node`가 이 메커니즘으로 현재 렌더링 중인 노드에 `useTurnData(key)`를 제공합니다.

한 렌더 시점에 이미 알려진 값에는 소유자 props를, 한 항목의 콜백과 비공개 옵저버블에는 등록 `inject`를, 슬롯 소유자가 제어하는 기능에는 슬롯 수준 `inject`를, 항목 간에 공유되거나 재마운트 전반에서 보존되는 가변 뷰 상태에는 선언된 스토어를 사용하세요. React 노드는 주입된 값이 아니라 자식 슬롯을 통해 조합됩니다.

<a id="current-hierarchy"></a>

## Conversation 계층

다음 Conversation 경로는 선언 소유자와 재사용 가능한 Factory 루트를 구분하며, 무관한 셸 위치는 생략합니다. 항목은 자신이 선언한 자식을 소유하고, Factory는 등록된 정의의 수명 동안 자신의 자식 선언을 소유합니다. 대괄호 이름은 기본 React 컴포넌트를 식별하며, 순수 React 하위가 소유자의 슬롯을 렌더링할 수 있습니다. Factory 호출은 새 슬롯 선언이 아니라 독립적이고 재사용 가능한 정의에 대한 참조입니다.

```text
root [AppFrame]
└─ main[key=conversation] [ConversationPanel]
   └─ main.conversation [ConversationRoot / ConversationMainPanel]
      ├─ conversation.header [ConversationHeader]
      │  ├─ conversation.header.leading
      │  └─ conversation.session.header [ConversationSessionHeader]
      │     ├─ conversation.session.header.lineage
      │     ├─ conversation.session.header.actions
      │     ├─ conversation.session.header.utilities
      │     ├─ conversation.session.header.views.actions
      │     └─ conversation.session.header.corner
      └─ calls Factory: conversation.content

Factory: conversation.content [ConversationContent]
├─ conversation.session [ConversationSession / DefaultConversationViews]
│  └─ conversation.view
│     ├─ id=chat [ChatView]
│     │  ├─ conversation.chat.text-interaction [list]
│     │  └─ conversation.chat.flow [ChatFlow]
│     │     └─ conversation.chat.node [ChatNodeSeat dispatch]
│     │        ├─ key=user,steering [UserMessageNodeView]
│     │        │  └─ calls Factory: conversation.chat.user.content
│     │        ├─ key=assistant-step [AssistantNodeView / AssistantMarkdown]
│     │        │  ├─ conversation.chat.message.images [MessageImages]
│     │        │  └─ conversation.chat.reasoning.body [DefaultReasoningBody]
│     │        │     └─ calls Factory: conversation.chat.reasoning.content
│     │        ├─ key=tool-call [ToolCallTree]
│     │        │  └─ tool.call.toolview
│     │        │     └─ key=read_image [ReadImageRow / ToolRow]
│     │        │        └─ tool.call.images [MessageImages]
│     │        ├─ key=command-input [GoalCommandInputView]
│     │        │  └─ calls Factory: conversation.user.text
│     │        ├─ key=command [CommandNodeView]
│     │        │  └─ conversation.chat.commandview
│     │        └─ key=turn-tail [TurnTailNodeView]
│     │           ├─ conversation.chat.turnTail
│     │           └─ conversation.chat.assistant-actions
│     └─ id=trajectory [TrajectoryView / TrajectoryTable]
│        └─ conversation.trajectory.images [MessageImages]
├─ conversation.composer
│  ├─ conversation.approval.detail
│  └─ conversation.plan-review.actions
├─ conversation.composer.bar [InputBar]
│  ├─ conversation.input.attachments
│  ├─ conversation.input.permission
│  ├─ conversation.input.plan
│  ├─ conversation.input.model
│  │  └─ conversation.input.model.label
│  ├─ conversation.input.overlay
│  ├─ conversation.composer.dock
│  ├─ conversation.input.left
│  └─ conversation.input.right
├─ conversation.input.dock
│  └─ id=queue [QueueDock]
│     └─ calls Factory: conversation.user.text
├─ conversation.hero.brand.mark
├─ conversation.hero.workspace
│  └─ conversation.hero.workspace.directoryFlow
├─ conversation.hero.agentPreset
└─ conversation.hero.options

Factory: conversation.chat.user.content [UserContent]
├─ conversation.chat.user.images [MessageImages]
└─ calls Factory: conversation.user.text

Factory: conversation.user.text [UserText]
└─ conversation.user.text.node [keyed, inline]

Factory: conversation.images.content [MessageImagesContent / ImageGallery]
Factory: conversation.chat.reasoning.content [ReasoningContent / MarkdownText]
```

네 이미지 슬롯 모두 기본적으로 `MessageImages`를 쓰며, 이는 호출자의 이미지 참조와 승인된 로더로 `conversation.images.content`를 호출합니다. 사용자 이미지와 출력 이미지 교체는 서로 독립적입니다. `conversation.user.text` Factory는 사용자 콘텐츠, 큐, 목표가 공유하며, 그 `inline: true` 키 지정 슬롯은 블록 래퍼가 아니라 span 앵커와 인라인 오류 자리표시자를 렌더링합니다.

생성된 [클라이언트 inspect 카탈로그](../../packages/extensions/cordis-client-runner/src/client/slot-catalog.ts)는 모든 셸 분기를 포괄하며 각 키의 카디널리티, 범위, 소유자 props, 표준 props, 현재 점유자, 선언 소유자, 교체 위험에 대한 완전한 계약입니다. 실행 중인 동적 패키지는 라이브 트리와 정확한 키를 `cordis_inspect what:"client"`로 질의할 수 있습니다. 소스 카탈로그는 `SlotMap` 선언과 `slots.register()` 호출 지점에서 `pnpm run gen-client-catalog`로 생성됩니다.

## 확장 규칙

- 다른 기능 패키지는 선언을 `import type`으로만 가져오고, 그 런타임 값을 절대 import하거나 다시 내보내지 않습니다.
- 새 자식 슬롯은 그 위치를 소유하고 렌더링하는 컴포넌트에서만 선언합니다. 다른 패키지는 `ctx.slots.inject()`로 기다렸다가 `ctx.slots.register()`로 기여합니다.
- 비즈니스 상태와 전송 상태는 소유 Cordis 서비스나 클라이언트 모델에 둡니다. 슬롯 스토어는 공유 보기·상호작용 상태만 담습니다.
- 관찰 가능한 소스와 스냅샷 정체성을 변경 사이에도 안정적으로 유지합니다. 값이 바뀌면 항상 같은 소스로 다시 게시하세요.
- UI 도메인 사이에는 JSON 호환 데이터와 콜백을 전달합니다. `hooks` 구획은 순수 옵저버블에 대한 유일한 예외이며, React 콘텐츠는 슬롯을 통해 이동합니다.
- `single`과 점유된 키 지정 셀은 교체 지점으로 취급합니다. 추가 확장에는 목록 id나 점유되지 않은 키를 사용하세요.
