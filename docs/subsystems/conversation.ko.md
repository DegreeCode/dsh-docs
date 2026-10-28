# 대화 조립

[English](conversation.md) | [中文](conversation.zh.md) | 한국어

Conversation은 클라이언트 `SessionEventLikeEntry` 창과 브라우저 뷰 사이에 있는 대상 중립 조립 계층입니다. [`ui-conversation`](../../packages/client/ui-conversation/README.md)이 이벤트·뷰 레지스트리, `SessionBinding`마다 하나씩 있는 정체성이 안정적인 바인딩, 턴/단계 위치, 증분 컨텍스트 조립, 대상 소스, 공유 셸, 입력 오케스트레이션을 소유합니다. [`ui-chat`](../../packages/client/ui-chat/README.md)과 [`ui-trajectory`](../../packages/client/ui-trajectory/README.md) 같은 대상 패키지는 자신의 Definition, 최종 스냅샷, 렌더링을 소유합니다.

이 페이지는 비즈니스가 소유하는 Conversation 노드의 데이터 모델과 확장 경로를 정의합니다. [Web 클라이언트 아키텍처](web-client.ko.md)는 이 하위 시스템을 클라이언트 모델과 슬롯 사이에 배치하며, 근거는 [Conversation 노드 조립 결정](../../.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md)이 소유합니다.

## 데이터 모델과 소유권

세션 컨트롤러는 연속으로 로드된 논리 이벤트 창을 소유합니다. 각 `SessionEventLikeEntry`는 영속 이벤트 하나를 담는 `{ type: 'event', event: SessionEvent }`이거나 클라이언트 전용 `assistant/live-chunk` 표시 하나를 담는 `{ type: 'transient', event: AssistantLiveChunkEvent }`입니다. 두 내부 이벤트 모두 `type`, `seq`, `time`, `data`를 노출합니다. `ui-conversation`은 두 번째 이력 스트림을 열지 않고 이 엔트리들을 조립기에 넘깁니다. 세션마다 `ConversationNodeAssembler` 하나가 등록된 모든 Definition을 적용하고 등록된 뷰 대상마다 독립 소스를 게시합니다.

| 개념 | 소유자와 목적 |
|---|---|
| Event Definition | 비즈니스 패키지가 영속 또는 클라이언트 전용 일시 이벤트 하나를 한 번에 일치시키고, 안정적인 `(kind, id)`로 상관시키며, 결정적 State를 폴드하고, 선택적으로 대상 노드 하나를 구체화합니다. |
| Context | `(kind, id)` 하나에 대한 엔진 소유의 순서 있는 Match 집합과 현재 State입니다. 영속 이벤트와 일시 이벤트가 시작이 될 수 있습니다. 가장 이른 로드된 시작이 State를 초기화하고 이후 Match가 이를 갱신합니다. 업데이트 전용 증거는 그 시작이 로드될 때까지 대기 상태로 남습니다. |
| Location | 영속 경계 이벤트에서 파생되는 엔진 소유의 세션·턴·단계 좌표입니다. Definition은 턴 또는 단계 하나에 타입 지정 데이터를 게시할 수 있습니다. |
| View Definition | 대상 패키지가 세션마다 증분 빌더 하나를 만들고 그 대상의 최종 스냅샷 타입을 소유합니다. |
| Group Definition | 비즈니스 패키지가 구체화된 노드에서 대상 하나의 루트 참조와 그룹 스냅샷을 파생하며, 멤버십, 분할, 요약, 증분 캐시를 소유합니다. |
| View | Chat이나 Trajectory 같은 슬롯 엔트리가 자신의 대상 스냅샷만 읽고 대상 소유 노드를 렌더링합니다. |

Chat과 Trajectory는 같은 영속 이벤트 패밀리를 인식할 수 있지만, 각자 자신의 Definition State와 최종 노드 페이로드를 유지합니다. 공유 대상 중립 기계는 정체성 라우팅, 순서 있는 재생, Location 데이터, 선행 의존성, 게시 주기로 제한됩니다.

## 대상 활성화

각 세션은 활성 대상의 단조 증가 집합을 유지합니다. 대상 소스를 만들거나 읽는 것만으로는 활성화되지 않습니다. 셸은 자신이 유지하거나 새로 선택한 View를 명시적으로 활성화하고, 다른 소비자는 대상의 첫 소스 구독을 통해 활성화합니다. 첫 활성화는 그 대상의 빌더를 만들고 현재 대상 인덱스 컨텍스트에서 `replace()`를 한 번 호출합니다. 이후 플러시는 활성 대상마다 `apply()`를 호출하며, 구독 해제는 대상을 제거하지 않습니다.

셸은 View 선택을 소유하며, 바인딩이 만들어지거나 현재로 선택될 때와 View 명단이 바뀐 뒤에 렌더링 전에 등록된 선호 View 또는 Chat 폴백을 해석합니다. 조립기는 해석된 대상 id만 받고 Chat이나 다른 기본 대상을 선택하지 않습니다. 서드파티 View도 같은 선택·활성화 연산으로 참여합니다. View Definition은 `toolCallFocus(callId)`를 노출할 수 있으며, 셸은 이 기능을 선언한 가시 대상에만 Inspect를 제공하고 대상이 호출 id를 자신의 포커스 정체성으로 매핑합니다.

<a id="group-definitions"></a>
## Group Definition

선택적인 `ctx.uiConversation.groups.register(definition)` 기여는 이벤트·뷰 등록과 같은 효과 소유 레지스트리 수명 주기를 사용합니다. 기존 View 대상이 필요하며, 빌더를 만들지 않고 대상 중복 등록을 거부합니다. 각 세션은 그 대상이 활성화될 때만 자신의 Group 컨텍스트를 만듭니다. 등록 교체는 기존 레지스트리 재구축 중에 이전 컨텍스트를 폐기하고 관찰된 그룹을 정리합니다.

[그룹 타입](../../packages/client/ui-conversation/src/client/contract/groups.ts)이 전체 프로토콜을 정의합니다:

| 타입 | 의미 |
|---|---|
| `ConversationGroupDefinition<Node, State, Data>` | `create()`가 세션 로컬 State를 초기화하고, `update(context, input)`이 다음 State를 반환하며, `buildGroups(context)`가 대기 중 출력 또는 `null`을 반환합니다. 교체 입력에는 엔트리와 완전한 그룹 교체가 필요합니다. |
| `ConversationGroupInput<Node>` | `replace`는 대상 순서, 타임라인, 동기 `readNode`, `readTurn`, `readPosition` 리더를 제공합니다. `apply`는 투영된 `previous/current` 노드 변경, 수명 주기 `changedTurns`, `changedTurnOrders`를 추가합니다. 리더를 State에 보관하지 마세요. |
| `GroupNodePosition` | 해당하는 경우 소유 턴과, 바로 이전/다음 가시 노드 키입니다. 이웃 정보는 턴 전용 키 목록이 생략하는 중단을 보존합니다. |
| `NodeReference` / `GroupReference` | `kind`로 구분되는 브랜드 타입 `NodeKey` 또는 `GroupKey`입니다. 노드 참조는 렌더러 소유 `groupPart`를 선택할 수 있으며, 생략하면 전체 노드를 선택합니다. |
| `GroupSnapshot<Data>` | 불변 그룹 키, 비즈니스 데이터, 순서 있는 노드 참조입니다. 그룹은 다른 그룹을 포함하거나 소스 노드 데이터를 소유할 수 없습니다. |
| `GroupUpdate<Data>` | `entries`는 전체 루트 시퀀스를 교체하며, apply 입력만 시퀀스 보존을 위해 이를 생략할 수 있습니다. 교체 입력에는 `entries`와 `groups.replace`가 모두 필요합니다. `groups.replace.snapshots`는 모든 그룹을 교체하고, `groups.apply.upserts/removes`는 이름 있는 그룹 레코드만 갱신합니다. 제거는 노드를 삭제하지 않습니다. |
| `ConversationGroupDataMap` | 등록과 `views.grouped(target)`이 공유하는 선언 병합 대상-데이터 연결입니다. 선언되지 않은 대상에는 그룹 페이로드 타입이 없습니다. |
| `ConversationGroupedView<Data>` | 안정적인 루트 `entries`와 키 기반 `groupSource(key)` 리더입니다. 제거된 그룹은 `undefined`로 읽힙니다. |

빌더는 그룹화가 등록되면 `groupInput()`을 노출하며, 입력이 없으면 첫 활성화에서 실패합니다. 빌더는 자신의 투영 이후 노드 값을 기록하고 콘텐츠 전용 순서 정체성을 보존합니다. 조립기는 모든 업데이트에 변경된 턴을 제공하며, 그룹화되지 않은 직접 빌더 호출자는 이를 생략할 수 있습니다. 독립 소스를 가진 빌더는 알림을 `publish()`로 미룹니다. 첫 활성화와 일반 플러시는 같은 순서를 공유합니다. 즉 Location 데이터와 노드를 구체화하고, 빌더를 갱신하고, Group Definition을 호출하고, 그룹화를 검증·설치한 뒤 영향을 받는 모든 대상과 Location 소스를 게시합니다. 그룹 단계는 기존 게시 주기를 재사용합니다.

대상 위치 인덱스가 리더를 제공하고, 가시 키나 이웃이 바뀐 턴을 식별합니다. `changedTurnOrders`에는 이동한 노드의 양쪽 소유자와, 삽입·제거된 범위 밖 노드에 인접한 턴이 포함됩니다. 수명 주기만 바뀐 경우는 `changedTurns`에 남습니다. 비즈니스 Definition은 그 턴들을 다시 분할하고 변경된 콘텐츠를 포함한 그룹만 새로 고칠 수 있습니다. 구조적 출력은 여전히 전체 루트 참조 배열을 교체하지만, 바뀌지 않은 노드 콘텐츠를 다시 읽을 필요는 없습니다.

Group 저장소는 설치 전에 제출된 결과 전체를 검증합니다. 즉 루트 Group 참조와 레코드가 일대일로 대응하고, 참조된 모든 노드가 존재하며, 각 `(NodeKey, groupPart)`가 루트 또는 멤버 위치에 많아야 한 번 나타납니다. 전체 노드는 자신의 파트 중 하나와 공존할 수 없습니다. 중복 upsert, 중복 제거, 같은 그룹의 upsert와 제거 동시 발생은 실패합니다. 데이터 전용 upsert는 루트·멤버 배열을 유지하고 노드를 읽지 않으며 변경된 그룹 소스만 알립니다. 전체 교체는 모든 참조를 다시 검증합니다.

렌더러는 두 참조 종류로 분기하고 그룹 데이터의 렌더러 필드가 아니라 소유 View 안에서 컴포넌트를 고릅니다. 루트 노드 참조와 참조된 그룹 멤버가 전체 렌더 목록을 이루며, 참조되지 않은 대상 노드는 저장되어 있지만 렌더링되지 않습니다. 그룹 본문은 요약 데이터와 별도로 멤버를 읽습니다. 표시 모드는 컴포넌트 타입, 키, 멤버 부모를 유지해야 하며, 데이터 멤버십이 바뀌면 이동한 멤버가 다시 마운트되는 것이 정당합니다. 프레임워크는 파트 완전성, 분할, 표시 정책을 해석하지 않습니다.

## 재생 가능한 이벤트 패밀리

Definition을 작성하기 전에 안정적인 비즈니스 id 하나를 고르세요. 같은 노드에 기여하는 모든 이벤트는 그 id를 담거나 자체 페이로드에서 독립적으로 파생해야 합니다. 클라이언트가 업데이트를 "가장 최근의 미완료" 컨텍스트에 배정해서는 절대 안 됩니다.

리뷰 작업이라면 이벤트 계약은 다음과 같을 수 있습니다:

| 이벤트 | 역할 | 필수 영속 사실 |
|---|---|---|
| `review/start` | 고유 시작 | `reviewId`, 턴/단계 좌표, 제목 |
| `review/progress` | 업데이트 | 같은 `reviewId`, 좌표, 재생 가능한 진행률 |
| `review/end` | 업데이트 | 같은 `reviewId`, 좌표, 최종 요약 |

프로세스 경계를 넘을 때는 생산자가 소유한 브랜드 id 타입을 사용하세요. `SessionEventMap` 병합과 페이로드 타입은 생산자의 타입 전용 익스포트에 두고, 클라이언트 패키지에서는 부수 효과를 위해 그 익스포트를 import하세요. 각 `(kind, id)`는 시작 이벤트를 최대 하나만 가질 수 있습니다. 단일 이벤트 비즈니스는 `event.seq`처럼 이벤트의 안정적인 정체성을 Definition 로컬 id로 쓸 수 있습니다.

증분 이벤트도 지원됩니다. 생산자가 저렴하게 내보낼 수 있다면 전체 값 체크포인트를 선호하세요. 시작이 로드된 창 밖에 있어도 유용하기 때문입니다. 각 델타는 안정적인 id를 담고 오름차순 로그 `seq`로 재생할 때 결정적 State를 만들어야 하며, 라이브 전용 메모리에 의존해서는 안 됩니다. 현재 이력 창에 업데이트만 있으면 조립기는 대기 중 컨텍스트를 유지하고, 이전 페이지가 시작을 제공할 때까지 State를 만들지 않습니다. 시작이 로드되기 전에 제품이 렌더링해야 한다면 터미널 또는 체크포인트 이벤트가 Definition이 그 결과를 직접 만들 수 있을 만큼의 전체 폴백 상태를 담아야 하며, 관련 없는 이벤트를 스캔해 복구해서는 안 됩니다.

라이브 어시스턴트 델타는 클라이언트 전용 `assistant/live-chunk` 이벤트로 도착합니다. 재연결 기준선은 활성 프로세스 로컬 컴팩트 스트림을 같은 일시 이벤트로 확장하고, 영속 `assistant/message`와 `assistant/attempt` 이벤트는 이력 재생을 위해 완전한 컴팩트 스트림을 내장합니다. 일시 이벤트가 컨텍스트를 초기화할 수 있습니다. 모든 도구 델타와 이후의 `tool/call`은 이름이 오기 전이라도 같은 callId 아래 시작으로 일치될 수 있으며, 가장 이른 것만 `start()`를 호출하고 이후 Match는 `update()`를 호출합니다. 준비 중인 도구 노드는 이름이 준비된 뒤에야 가시해집니다. 과거 페이지는 정착된 메시지를 라이브 델타로 확장하지 않습니다. 어시스턴트 출력을 소비하는 Definition은 라이브 청크와 영속 정착을 같은 일치·갱신 인터페이스로 처리하고, 관련 없는 Definition은 스트림을 확장하지 않고 `null`을 반환합니다.

## Definition과 타입 지정 Chat 페이로드

예제는 완전한 관계를 볼 수 있도록 생산자 선언과 클라이언트 기여를 한 블록에 담습니다. 패키지 패밀리에서는 브랜드 id와 `SessionEventMap` 선언을 이벤트 생산자와 함께 두고, Definition, Chat 데이터 병합, 렌더러는 클라이언트 플러그인에 둡니다.

```ts ignore-check
import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ConversationLocation, ConversationNodeContext,
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatNodeViewProps } from '@deepseek-ai/dsh-client-ui-chat/client'

type ReviewId = Branded<'ReviewId'>

interface ReviewStartData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly title: string
}

interface ReviewProgressData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly completed: number
}

interface ReviewEndData {
  readonly reviewId: ReviewId
  readonly turn: number
  readonly step: number
  readonly summary: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Opens one durable review job.
     * @mode emit
     * @param data - stable identity, location, and initial display state.
     */
    'review/start': ReviewStartData
    /**
     * Records replayable progress for one review job.
     * @mode emit
     * @param data - stable identity, location, and latest progress.
     */
    'review/progress': ReviewProgressData
    /**
     * Closes one review job with its final summary.
     * @mode emit
     * @param data - stable identity, location, and final display state.
     */
    'review/end': ReviewEndData
  }
}

interface ReviewChatData {
  readonly title: string
  readonly completed: number
  readonly status: 'running' | 'completed'
  readonly summary?: string
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    'review-job': ReviewChatData
  }
}

interface ReviewState extends ReviewChatData {
  readonly turn: number
  readonly step: number
}

function locationOf(context: ConversationNodeContext): ConversationLocation {
  return context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
}

function viewData(state: ReviewState): ReviewChatData {
  return {
    title: state.title,
    completed: state.completed,
    status: state.status,
    ...state.summary === undefined ? {} : { summary: state.summary },
  }
}

const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => {
    if (event.type === 'review/start') {
      return { id: String(event.data.reviewId), role: 'start' }
    }
    if (event.type === 'review/progress' || event.type === 'review/end') {
      return { id: String(event.data.reviewId), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'review/start') throw new Error('review-job requires review/start')
    return {
      turn: match.event.data.turn,
      step: match.event.data.step,
      title: match.event.data.title,
      completed: 0,
      status: 'running',
    }
  },
  update: (context, match) => {
    if (match.event.type === 'review/progress') {
      return { ...context.state, completed: match.event.data.completed }
    }
    if (match.event.type === 'review/end') {
      return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
    }
    return context.state
  },
  publication: match => match.event.type === 'review/progress'
    ? 'animation-frame'
    : 'immediate',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.state === undefined) return null
    return {
      kind: 'step',
      turn: context.state.turn,
      step: context.state.step,
      key: 'review-job',
      value: viewData(context.state),
    }
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null
    return {
      key: context.key,
      kind: 'review-job',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start?.event.seq ?? context.matches[0]?.event.seq ?? 0,
      location: locationOf(context),
      visibility: 'visible',
      data: viewData(context.state),
    }
  },
}

function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}

export const inject = ['uiConversation', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.uiConversation.events.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

`match(event)`는 폴드가 아니라 정체성 추출기입니다. 현재 `SessionEventLike`만 받고 Definition 로컬 id와 수명 주기 역할을 반환합니다. 일치 후 조립기는 `(kind, id)`로 컨텍스트를 찾고 영속이든 일시든 가장 이른 로드된 시작부터 초기화합니다. 이후의 모든 Match는 다른 시작을 포함해 `update`를 호출합니다. 일시 Match를 제거하면 남은 증거에서 시작을 다시 선택하고 State를 다시 계산하며, 남은 시작이 없으면 State는 undefined로 남습니다. 두 함수는 엔진이 채택하는 State를 반환합니다. 새 불변 값을 반환하는 편이 좋지만, 변경 후 같은 객체를 반환하는 함수도 채택 의미는 같습니다.

`ConversationNodeDefinitionInput`은 이 함수 또는 이벤트 타입에서 일치 함수로 가는 읽기 전용 표를 받습니다. 함수 형태 등록은 모든 이벤트를 받고, 표 등록은 나열된 타입만 받습니다. 레지스트리는 표 항목을 복사하고 등록이 바뀔 때 순서 있는 후보 집합을 미리 계산해, 이벤트별 디스패치에서 후보 구성을 빼냅니다. 표를 교체하려면 등록을 해제하고 다시 등록하세요. 두 경우 모두 해석된 `ConversationNodeDefinition` 값은 호출 가능한 `match(event)`를 유지합니다.

`exclusive: true`가 있는 일치 결과는 Definition의 대상에서 그 이벤트를 점유합니다. 조립기는 어떤 일치도 받아들이기 전에 이벤트의 모든 일치를 평가하므로 결과는 등록 순서와 무관합니다. 점유된 대상의 다른 Definition은 그 이벤트에 컨텍스트를 만들지 않고, 그 대상의 미일치 이벤트 폴백도 실행되지 않습니다. 다른 대상의 Definition과 대상이 없는 Definition은 여전히 이벤트를 받습니다. 한 대상에 대한 두 점유, 또는 대상 없는 Definition의 점유는 디스패치 중 예외를 던지며, 폴백 자체가 반환한 점유는 효과가 없습니다. 비즈니스 Definition은 같은 대상의 일반 Definition이 함께 표시할 메시지 종류(예: 늦은 질문 응답) 하나만 표시하려고 점유를 사용합니다.

`buildLocationData(context, scope)`는 선택적으로 Definition 소유 데이터를 엔진 소유 턴이나 단계에 게시합니다. 선언 병합으로 각 키에 정확한 값 타입을 부여하세요. 같은 Location의 다른 노드는 제약된 슬롯 훅(예: `useTurnData(key)`)으로 그 값을 소비할 수 있으며, 세션을 받거나 `snapshot.chat.nodes`를 스캔할 필요가 없습니다.

`target`과 `buildViewNode(context)`는 하나의 대상 소유 렌더링 기여를 선언하며 함께 나타나야 합니다. `context.key`를 React가 보는 정체성으로 유지하고, 일치된 이벤트 순서에서 `anchorSeq`를 고르며, 렌더러가 바로 쓸 수 있는 데이터만 반환하세요. 대상 노드가 게시된 뒤에는 같은 키를 계속 반환하고, 가시 흐름에서 잠시 빠져야 하면 `null`로 철회하는 대신 `visibility: 'hidden'`을 사용하세요.

Chat 노드는 `groupTree`를 통해 행이 서는 위치도 고릅니다. 위치는 가장 바깥쪽에서 안쪽으로 정렬되며, 어떤 위치의 노드는 그 안쪽 모든 위치의 효과도 가집니다. Chat 프로세스 그룹화, 전체 턴 접기, 턴 입력 감지는 이 위치만 읽으며, 전체 계약은 [group-tree.ts](../../packages/client/ui-chat/src/client/contract/group-tree.ts)에 있습니다.

| 노드가 다음일 때 | 선언 |
|---|---|
| 1단계에서 점유된 사람의 입력이며 그 턴이 교환을 여는 경우 | `exchange` |
| 그 턴의 다른 입력(이후 사람 입력이나 트리거 알림 등). 프로세스 이전에는 시작 입력이고 이후에는 전체 턴이 열린 상태로 남습니다 | `input` |
| 오류나 완료 턴 푸터처럼 전체 턴 접기 밖에 머무는 턴 알림 | `turn` |
| 모델 재시도처럼 전체 턴 접기가 여전히 숨기는 독립 행 | `process` |
| 주변 단계 실행에 합류하는 일반 프로세스 콘텐츠 | `groupTree` 생략 |

[Chat 비즈니스 규칙](../../packages/client/ui-chat/src/client/conversation-nodes/README.md#process-grouping)에 내장 노드가 선언하는 위치가 나열되어 있습니다. 같은 대상의 일반 Definition이 여러분 노드가 표시하는 이벤트와도 일치하면, 위에서 설명한 대로 `exclusive: true`로 그 이벤트를 점유하세요.

## 선행 읽기

일부 Definition은 다른 비즈니스 종류의 가장 최근 이전 State가 필요합니다. `start`는 `ConversationContextReader`를 받으므로, 컨텍스트 컬렉션을 받거나 이벤트를 스캔하는 대신 그 안에서 `reader.previous<State>(kind)`를 호출하세요. 리더는 현재 시작 `seq` 이전의 가장 가까운 시작된 컨텍스트를 읽기 전용 데이터로 반환합니다.

조립기는 그 의존성을 기록합니다. 나중에 이전 페이지 prepend가 더 가까운 선행자를 제공하거나, 이전에 알려지지 않았던 창 갭을 메우거나, 선행자 State를 개정하면, 조립기는 의존 컨텍스트를 `start`부터 다시 실행하고 그 업데이트를 `seq` 오름차순으로 재생합니다. 조회한 Definition은 유용한 State를 쓰는 책임을 계속 지며, 리더는 비즈니스별 조회 메서드를 노출하지 않고 다른 컨텍스트에 대한 변경 권한도 부여하지 않습니다.

## 창 갱신 경로

이력은 꼬리에서 한 페이지씩 뒤로 요청할 수 있습니다. 세션 저널이 겹치지 않는 논리 시퀀스 범위를 먼저 검증하고, 조립기는 수락된 입력을 첫 `seq` 기준으로 정렬한 뒤 State를 재생합니다.

| 경로 | 엔진 작업 | Definition에 보이는 동작 |
|---|---|---|
| 열기·재동기화·갭 복구 시 교체 | 로드된 창을 다시 만들고, 모든 표준 이벤트나 패킹된 실행을 Definition마다 한 번 일치시킨 뒤 시작된 각 컨텍스트를 재생합니다 | `start`, 이어서 논리 `seq` 오름차순 업데이트. 업데이트 전용 대기 컨텍스트는 State 없이 남습니다 |
| 이전 페이지 하나 prepend | 새 이전 입력만 일치시키고 `(kind, id)`로 컨텍스트에 병합하며, 기존 키 노드를 보존하고, 영향을 받은 컨텍스트와 의존성만 재생합니다 | 새로 발견된 스칼라 시작이 수집된 스칼라·패킹 업데이트를 활성화하고, Location이나 선행자가 바뀌면 컨텍스트를 다시 실행할 수 있습니다 |
| 라이브 이벤트 하나 append | Definition마다 `match`를 한 번 호출하고, 키로 일치된 컨텍스트를 찾아 그 컨텍스트만 갱신합니다 | 시작 이후 이벤트와 일치할 때 스칼라 `update` 하나와 요청된 게시 하나. 기존 컨텍스트 스캔 없음 |

등록된 Definition이 `D`개일 때 들어오는 스칼라 이벤트나 패킹 실행 하나는 `D`번의 현재 입력 일치와, 일치 후 상수 시간 컨텍스트 키 조회를 수행합니다. Definition 코드는 이 성질을 지켜야 합니다. 정상 append 경로에서 전체 이벤트 창, 모든 컨텍스트, `context.matches`, 렌더링된 노드 컬렉션을 순회하지 마세요. 누적 사실에는 State를, 같은 턴/단계 공유에는 Location 데이터를, 인덱스된 선행 의존성에는 `reader.previous()`를 사용하세요.

`publication`은 변경된 State를 언제 구체화할지 제어합니다. 구조적·터미널 변경에는 `immediate`, 고빈도 가시 델타에는 `animation-frame`, State 변경이 이후 게시로만 이어질 때는 `none`을 사용하세요. 엔진은 모든 스칼라 업데이트를 로그 순서로, 모든 패킹 실행을 한 배치 업데이트로 적용하며, 주기는 뷰 게시만 병합합니다.

## 검증 의무

다음 결과를 확립하는 집중 테스트를 추가하세요:

1. replace를 통해 전달된 완전한 창이 기대한 최종 State, Location 데이터, 노드 페이로드, `anchorSeq`를 만듭니다.
2. 업데이트 전용 꼬리는 대기 상태로 남고, 그 시작을 prepend하면 완전한 replace와 같은 결과가 됩니다.
3. 초기 이력 뒤의 라이브 append는 결합된 창을 재생한 것과 같은 결과를 만듭니다.
4. 이전 페이지 prepend는 데이터가 바뀌지 않은 기존 키 노드 값을 교체하지 않고 이전 행을 추가합니다.
5. 반복된 가시 델타는 `context.key`를 유지하고 요청 시 애니메이션 프레임당 최대 한 번 게시합니다.
6. 키 지정 렌더러는 `node.data`와 제약된 Location 훅만 소비하며, 세션 이벤트 창, 컨텍스트, Chat 노드를 스캔하지 않습니다.
7. 스칼라와 패킹된 어시스턴트 이력은 같은 최종 State, 타이밍 경계, 대상 스냅샷을 만들며, 패킹 실행 하나는 replace, prepend, Location 재생, 레지스트리 재구축 전반에서 하나의 Match로 남습니다.
8. 대상 소스를 만드는 것은 빌더 작업을 수행하지 않습니다. 명시적 선택이나 첫 구독이 완전한 교체를 한 번 수행하고, 이후 업데이트는 모든 활성 대상에 도달하며, 반복 활성화는 교체를 수행하지 않습니다.

스트리밍과 중단에는 [`packages/client/ui-chat/src/client/conversation-nodes/assistant.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/assistant.ts)를, 선행자 조회에는 [`inbox.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/inbox.ts)와 [`message.ts`](../../packages/client/ui-chat/src/client/conversation-nodes/message.ts)를, 자신의 노드를 만들지 않고 턴 데이터를 게시하는 Definition 예제에는 [`packages/client/ui-deliverables`](../../packages/client/ui-deliverables)를 참고하세요.
