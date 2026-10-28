# 대화와 세션 규칙

[English](conversation-and-session.md) | [中文](conversation-and-session.zh.md) | 한국어

세션을 읽고 보유하고, 대화 노드를 계산하고 렌더링하는 규칙입니다. 데이터 모델과 타입별 시맨틱은 [session-projection.md](../subsystems/session-projection.ko.md)와 [conversation.md](../subsystems/conversation.ko.md)에 있습니다.

## Projection이 유일한 읽기·계산 경로입니다

세션 데이터는 Projection을 통해 읽고 계산합니다. 클라이언트는 세션 로그를 끌어오는 대신 프로젝션 값을 읽고, 세션에 속한 계산은 등록된 프로젝션 단위로 실행되어 결과를 게시하며 요청 시 다시 계산되지 않습니다. 같은 질문에 대한 두 답(하나는 끌어온 것, 하나는 밀어낸 것)은 서로 어긋나므로, 렌더링이 세션 로그가 더는 뒷받침하지 않는 값을 보여 줄 수 있습니다.

- 판단 조건: 클라이언트가 렌더링하는 모든 세션 파생 값이 렌더 위치에서의 프로젝션 읽기를 통해 도착하고, 세션 안의 모든 새 계산이 단위로 등록되어 그 결과가 게시된 값으로 클라이언트에 도달해야 합니다. 컴포넌트가 세션 데이터를 직접 가져오거나, 읽는 쪽이 요청 시 계산을 트리거하면 위반입니다.
- 상태와 뷰: 단위는 호스트 측 상태를 폴드하고 그 위의 클라이언트 가시 뷰를 선언하며, 등록이 그 구분을 밝힙니다. `ProjectionDefinition` 필드와 이를 구동하는 레지스트리는 [session-projection.md](../subsystems/session-projection.ko.md#ctxsessionprojections--sessionprojectionregistry)에 속합니다.
- 버전: `stateVersion`은 1에서 시작하며, 직렬화된 상태 필드나 폴드 시맨틱이 바뀔 때마다(호환되든 아니든) 올립니다. 가능하면 호환되는 변경을 선호하되 그래도 버전은 올리세요. 같은 키를 서로 다른 `stateVersion`으로 두 번 등록하면 병합되지 않고 예외가 발생합니다.
- 계산 전략: 단위는 기본적으로 전체를 계산합니다. 단위가 계산하는 범위를 좁히려면 해당 도메인 전문가의 확인이 필요하며, 구현자 스스로 결정할 수 없습니다.
- 경계: 부분 프로젝션 뷰는 연결된 세션이 응답하기 전에 그려지는 캐시 블록처럼 개별 키의 인터페이스 가용성에 쓰일 수 있습니다. 그러나 외부에 보이는 결과를 결정하지는 않으며, 그 결과는 표준 프로젝션 값을 기다립니다.

렌더 위치에서 읽는 컴포넌트와 끌어오지 않고 등록되는 계산은 모두 규칙을 지킵니다:

```tsx
// The client reads the published value; it never fetches Session data itself.
function PlanChip({ useProjection }: PlanChipProps) {
  const plan = useProjection('plan')
  return plan === undefined ? null : <Chip label={plan.label} />
}

// The computation is a registered unit; the registry drives it and publishes changes.
const planDefinition: ProjectionDefinition<'plan', typeof emptyPlan> = {
  key: 'plan',
  stateVersion: 1,
  init: () => emptyPlan,
  apply: (state, event) => foldPlan(state, event),
  wire: { viewSchema: planSchema, view: planView },
}
```

같은 값을 자체 요청으로 끌어오는 컴포넌트는 단일 읽기 경로를 깨뜨립니다:

```tsx
function PlanChip() {
  const [plan, setPlan] = useState<Plan>()
  useEffect(() => {
    void fetchSessionPlan(sessionId).then(setPlan)   // a second read path beside Projection
  }, [sessionId])
  return plan === undefined ? null : <Chip label={plan.label} />
}
```

끌어온 사본과 밀어낸 값이 서로 다르고, 어느 쪽을 세션이 현재 보유하는지 버전 검사로는 알 수 없습니다.

## 콜드 읽기는 최후의 수단입니다

원본 로그보다 사용 가능한 캐시를 먼저 읽고, 어떤 프로젝션도 데이터를 다루지 않을 때만 콜드 읽기에 손을 뻗으세요. “작은 세션은 전체를 읽어도 된다”는 예외는 제거되었고 다시 고려하지 않습니다. 캐시 데이터와 공식 데이터가 동등하지 않을 때, 누락되거나 오래된 행은 조용히 느린 경로로 전환하는 대신 명시적인 결과를 냅니다.

- 판단 조건: 세션 읽기가 프로젝션 캐시를 먼저 조회하고, 없는 행은 호출자를 위해 명시적인 상태를 남겨야 합니다. 캐시 검사의 `else` 분기가 전체 로그를 여는 것이 위반입니다.
- 폴백 시맨틱: 미스가 무엇을 뜻하는지는 호출자가 정하고 반환값에 밝힙니다. 캐시 크기나 세션 크기에 따른 예외는 없으며, 그런 예외를 승인할 사람도 없습니다.
- 경계: 이 제한은 클라이언트의 것입니다. 호스트에 “콜드 읽기를 절대 분기하지 말라”는 절대 규칙은 요구되지 않습니다. 호스트는 클라이언트가 열 수 없는 로그를 열어야 할 수 있기 때문입니다.

저장된 프로젝션 행을 먼저 읽고, 미스는 호출자가 렌더링하는 상태로 남습니다:

```ts ignore-check
// The listing reads stored projection rows; a miss remains an explicit state.
type ListingView =
  | { kind: 'cached'; snapshot: ProjectionSnapshot }
  | { kind: 'unknown' }

function readListing(header: SessionHeader, keys: readonly ProjectionKey[]): ListingView {
  const cached = ctx.sessionProjectionCache.cachedSnapshot(header, keys)
  return cached === undefined ? { kind: 'unknown' } : { kind: 'cached', snapshot: cached }
}
// Opening the complete log is a separate operation the caller names, never this fallback.
```

전체 로그로 빠지는 캐시 검사는 느린 경로를 일상적인 경로로 만듭니다:

```ts ignore-check
function readListing(header: SessionHeader, session: Session): ListingView {
  const cached = ctx.sessionProjectionCache.cachedSnapshot(header)
  if (cached !== undefined) return { kind: 'cached', snapshot: cached }
  return coldReadCompleteLog(session)   // every miss pays the full-log read
}
```

이제 모든 미스가 포그라운드에서 전체 로그를 읽으므로, 느린 세션은 그것을 요청하는 경로에서만이 아니라 모든 목록에서 느려집니다.

## 보유(retention)는 하나의 수명 주기 규칙을 따릅니다

클라이언트는 명시적인 참조(`SessionReference`)를 통해 세션을 보유하고, 참조 수가 0이 되면 해제합니다. 유휴 회수는 하나의 수명 주기 규칙(참조 없음, 진행 중인 작업 없음)을 따르며, 업무 상태에서 어떤 세션을 회수할 수 있는지 열거하지 않습니다. 그러한 목록은 기능을 추가할 때마다 각 기능이 관리해야 하기 때문입니다. 암묵적인 보유자는 보이지 않으므로, 회수는 누가 아직 세션을 사용하는지 알 수 없습니다.

- 판단 조건: 술어는 `refCount == 0 && inflight == 0`입니다. 코드가 획득 → 사용 구간 동안, retain과 release를 감사할 수 있는 참조를 통해 세션을 보유하는가? 모듈 수준 세션 객체나 전역 current id가 위반입니다.
- 경계: 강제되는 부분은 통일된 술어와 업무 상태 열거의 부재입니다. 해제 트리거 자체는 수동으로 확인하므로, 수동 확인만으로 거부 사유가 되지는 않습니다.
- 소유권: `retain`, `release`, `ready`, 정리 순서는 [세션 컨트롤러의 클라이언트 참조](../../packages/api/session-controller/README.md#client-references)에 속합니다. 메시지에 담긴 소스 세션 언급은 다른 타입이며 [session-reference.md](../subsystems/session-reference.ko.md)가 소유합니다.

명시적 참조로 보유하고 정리 시 해제하는 뷰는 규칙을 지킵니다:

```ts ignore-check
class SidebarSessionView implements Disposable {
  private readonly reference: SessionReference

  constructor(readonly id: SessionId, sessions: ISessions) {
    this.reference = sessions.retain(id, { source: 'sidebarView' })
    void this.reference.ready.catch((error: unknown) => { console.error('opening failed:', error) })
  }

  [Symbol.dispose](): void {
    this.reference.release()   // the last reference releases the Session
  }
}
```

세션 객체를 보관하는 모듈 상태는 모든 보유자를 회수자에게서 숨깁니다:

```ts ignore-check
let currentSessionId: SessionId | undefined
const sessionCache = new Map<SessionId, Session>()

export function remember(session: Session): void {
  currentSessionId = session.id
  sessionCache.set(session.id, session)
}

export function reclaimIdle(): void {
  if (state === 'idle' || state === 'closed') reclaim()   // a newly added state is missed
}
```

아무도 세션을 아직 사용하는 쪽을 셀 수 없고, 세션에 추가된 다음 상태는 열거에서 빠져 영원히 회수되지 않습니다.

## 노드 계산은 증분으로, 스트리밍 게시는 배치로 합니다

새 노드 계산은 자신의 복잡도를 밝혀야 하며, 고빈도 스트리밍 청크는 즉시 게시하지도, 전체를 다시 계산하지도 않습니다. 청크마다 전체를 다시 만들어 한꺼번에 게시하면 노드 컬렉션 전체가 프레임 예산에 걸리고 트랜스크립트가 스트림 뒤에서 멈춥니다. 추가 경로 비용(`D`개의 등록된 정의, `D`번의 매치, 한 번의 상수 시간 컨텍스트 키 조회)과 게시 어휘(`none`, `animation-frame`, `immediate`)는 [conversation.md](../subsystems/conversation.ko.md#definition과-타입-지정-chat-페이로드)가 소유합니다.

- 판단 조건: 한 청크가 계산하는 양(이벤트 윈도가 아니라 영향받는 하위 트리의 증분)과 그 결과가 게시되는 시점(청크당 한 번의 게시가 아니라 배칭 정책)입니다.
- 경계: 이 규칙은 구현에 적용됩니다. 주기 자체만으로 거부 사유가 되지는 않으며, 변경은 그것이 밝힌 주기와 사용하는 게시 경로로 판단합니다.
- 고빈도 경로에서 금지: `immediate` 게시와 청크별 전체 재계산.
- 경계: 구조적 변경이나 종료 변경은 `immediate`로 게시해도 됩니다. 주기는 게시마다 선택되기 때문입니다. 배칭은 고빈도 델타 경로에만 적용됩니다.

하나의 컨텍스트를 갱신하며 병합 게시를 요청하는 청크는 규칙을 지킵니다:

```ts ignore-check
const assistantDefinition: ConversationNodeDefinition<AssistantState> = {
  kind: 'assistant-step',
  target: 'chat',
  match: event => matchAssistant(event),
  start: (_context, match) => initialState(match),
  update: (context, match) => appendChunk(context.state, match.event),   // increment, not the window
  publication: () => 'animation-frame',   // high-frequency deltas coalesce; never immediate
  buildViewNode: context => assistantNode(context),
}
```

청크마다 노드 컬렉션 전체를 다시 만들고 즉시 게시하는 경우:

```ts ignore-check
function onChunk(chunk: AssistantLiveChunk): void {
  const nodes = buildNodesFromCompleteWindow(session)   // full recompute per chunk
  target.publish(nodes, { publication: 'immediate' })   // and an immediate publish
}
```

각 청크가 프레임 예산 안에서 전체 윈도 재구성을 치르므로, 그룹화와 렌더링이 스트림 뒤에서 멈춥니다.

## 노드 빌드·그룹화 엔진은 업무 규칙을 담지 않습니다

업무 규칙은 그룹화 엔진에 들어가지 않으며, 업무 요구 사항이 만들어진 페이로드를 재구성하지 않습니다. `ProcessState`, 그룹 산출물 계층, `conversation-nodes/process-groups.ts`의 그룹 시맨틱 집합은 인프라입니다. 엔진은 grouped, standalone, reply 같은 enum 배치 값을 이해하고, 어느 값이 적용되는지는 호출자가 계산합니다. 엔진 내부의 특수 사례는 모든 소비자에 대해 만들어지는 구조를 바꾸고 그룹 계산 경로에 업무 조건을 얹습니다.

- 판단 조건: 엔진에 업무 조건이 있는가? `ProcessState` 필드를 추가하거나, 그룹 계층을 더하거나 없애거나, 특정 업무를 위해 그룹 시맨틱을 바꾸는 diff는 실패합니다. 배치 결정은 enum 값을 계산하는 호출자에게 속합니다.
- 경계: 계층 구조, 그 비용, 기존 업무 기대치가 업무가 그룹화 설계를 다시 만들지 않는 이유입니다.
- 경계: 새로운 배치 의미를 갖는 새 enum 값이 지원되는 확장이며, 호출자가 어디서 계산하든 무방합니다.
- 예외와 승인자: 기본적으로 없습니다. 이 인프라를 바꾸려면 해당 도메인 전문가의 확인이 필요합니다. 그룹 정의 타입은 [conversation.md](../subsystems/conversation.ko.md#group-definition)가 소유합니다.

호출자가 업무 의미를 결정하고 엔진이 배치하는 데 쓰는 배치 enum을 전달합니다:

```ts ignore-check
// Business judgment stays in the caller.
function placementOf(command: CommandView): NodePlacement {
  return isHandoff(command) ? 'reply' : 'grouped'
}

// The engine consumes the enum as data; it reads no business condition.
function groupEntries(commands: readonly CommandView[]): readonly NodePlacement[] {
  return commands.map(placementOf)
}
```

엔진 자체 계산 안에 업무 조건이 있는 경우:

```ts ignore-check
// The grouping engine asks what a node means, not where it goes.
function placeProcessNode(node: ChatConversationViewNode): GroupPlacement {
  if (node.kind === 'command' && isRagMessage(node)) return 'rag'   // business special case
  return 'grouped'
}
```

이제 만들어지는 구조가 특정 업무의 의미를 담으므로, 모든 소비자와 그룹 계산이 그 기능을 따라갑니다.

## 노드 목록과 시트 컴포넌트에는 업무 분기가 없습니다

`ChatNodeList`, `ChatNodeSeat`, `ChatGroupSeat`는 인프라입니다. 업무 조건도, 업무 전용 필드도 담지 않으며, 하나의 업무가 목록 순회나 시트 선택을 바꾸지 않습니다. 새 노드 형태는 자신의 kind를 `ChatNodeDataMap`에 기여하고 kind 등록 표면을 통해 렌더러를 기여하므로, 목록은 계속 kind로 디스패치하고 업무 시맨틱은 업무 모듈에 남습니다. 한 기능을 위해 추가된 분기는 모든 노드의 렌더링을 그 기능에 의존하게 만듭니다.

- 판단 조건: 목록이나 시트 컴포넌트의 업무 분기, 그 props의 업무 전용 필드, 또는 특정 업무만을 위한 순회나 시트 선택 변경입니다.
- 올바른 출구: 업무 패키지가 자체 키를 `ChatNodeDataMap`에 병합하고 노드 kind의 렌더러를 등록하며, 시트는 노드 kind에 등록된 컴포넌트를 렌더링합니다. 등록 규율은 [slots.md](../subsystems/slots.ko.md#확장-규칙)가 소유합니다.
- 경계: 정렬, 가상화, 접근성처럼 모든 업무에 적용되는 렌더링 변경은 업무 수정이 아닙니다.
- 예외와 승인자: 기본적으로 없으며, 예외가 있으면 해당 도메인 전문가가 확인합니다.

자신의 kind를 선언하고 렌더러를 등록하는 업무 패키지는 공유 목록을 건드리지 않습니다:

```tsx
// The business declares its kind and registers its renderer; the shared list is untouched.
declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap { handoff: HandoffData }
}

const HandoffNodeView = memo(function HandoffNodeView({ node, t }: ChatNodeOwnerProps<'handoff'>) {
  return <HandoffCard data={node.data} t={t} />
})

ctx.slots.inject('conversation.chat.node', () => ctx.slots.register(
  { name: 'conversation.chat.node', key: 'handoff', locale: NS }, HandoffNodeView))
```

공유 시트 안에 업무 분기와 업무 필드가 있는 경우:

```tsx
export const ChatNodeSeat = memo(function ChatNodeSeat({ node, handoffFlag }: ChatNodeSeatProps) {
  if (node.kind === 'user' && handoffFlag) return <HandoffSeat node={node} />   // business dispatch
  return <div data-handoff={handoffFlag}>{renderByKind(node)}</div>
})
```

이제 한 기능의 조건이 모든 노드의 렌더링을 결정하고, 다음 기능을 위해 공유 시트를 또 고쳐야 합니다.

## Markdown 파이프라인에는 업무 분기가 없습니다

`AssistantMarkdown`와 그 렌더링 파이프라인은 인프라입니다. Markdown 렌더 경로에 업무 조건이 들어가지 않으며, 어떤 업무도 노드 매핑이나 스타일 주입 규칙을 다시 쓰지 않습니다. 표현상의 필요는 기존 체인에 렌더러를 등록하거나 데이터로 표현하며, 공식 기본 콘텐츠도 호스트 측 인라인 폴백을 가진 선택적 렌더러로 존재하는 대신 같은 등록 표면에 참여합니다. 업무 특수 사례를 품은 파이프라인은 더 이상 그 자체로 리뷰하거나 최적화할 수 없습니다.

- 판단 조건: `AssistantMarkdown`나 그 블록 매핑 안의 업무 분기(예: `if (isXxxBusiness) renderXxx()`) 또는 특정 업무를 키로 한 스타일 주입 규칙입니다.
- 올바른 출구: 기존 체인에 등록된 렌더러, 또는 일반 렌더러가 읽는 데이터의 시맨틱 필드입니다. 컴포넌트 팩토리 등록은 [ui-renderer README](../../packages/client/ui-renderer/README.md)가 소유합니다.
- 감싸기: 표준 렌더링이 필요한 래퍼는 공식 진입점을 호출하고 폴백을 유지합니다. 슬롯을 다시 렌더링하거나 다른 패키지의 비공개 React 컴포넌트를 임포트하지 않습니다.
- 책임: 위치와 호출은 호스트가 소유하고, 플러그인은 자신의 상태, 정리, 컨트롤을 소유하며, 공식 호스트는 기여분을 위한 업무 동작을 담지 않습니다.
- `labels`: 선택적인 완전한 `MarkdownLabels` 객체는 통째로 사용되며 기본값과 필드 단위로 병합되지 않습니다. 생략하면 공식 기본값을 사용합니다. `variant="compact"`는 팩토리가 고정합니다.
- 경계: 구문 지원이나 성능 같은 일반 Markdown 기능은 업무 수정이 아닙니다.
- 예외와 승인자: 기본적으로 없으며, 예외가 있으면 해당 도메인 전문가가 확인합니다.

기존 단일 시트에 등록하고 표준 콘텐츠를 다시 렌더링하지 않고 게시된 팩토리를 재사용하는 기여:

```tsx
// The business contributes its own body into the seat the host already renders.
ctx.slots.inject('conversation.chat.reasoning.body', () => ctx.slots.register(
  { name: 'conversation.chat.reasoning.body', scope: 'session', locale: NS },
  TranslatedReasoningBody,
))

// The contribution keeps the standard rendering by calling the published Factory.
function TranslatedReasoningBody({ text, running, renderFactorySlot, t }: ReasoningBodyProps) {
  return (
    <>
      <p>{t('reasoning.translated')}</p>
      {renderFactorySlot('conversation.chat.reasoning.content', { text, running })}
    </>
  )
}
```

공유 Markdown 파이프라인 안에 업무 분기가 있는 경우:

```tsx
export const AssistantMarkdown = memo(function AssistantMarkdown({ blocks, ...props }: AssistantMarkdownProps) {
  return <>{blocks.map(block => (
    isHandoffBlock(block)
      ? <HandoffBlock block={block} />   // a business special case in the pipeline
      : renderBlock(block, props)
  ))}</>
})
```

모든 업무 특수 사례가 하나의 공유 파이프라인에 쌓이고, Markdown 렌더링은 이제 품고 있는 업무들 없이는 변경하거나 측정할 수 없습니다.

## 사용자 메시지 모델과 렌더링에는 업무 필드가 없습니다

`UserMessage`와 UI의 `user` kind 렌더링은 인프라입니다. 메시지 모델에 업무 전용 필드가 없고, 사용자 메시지 렌더러에 업무 분기가 없습니다. 업무상의 차이는 메시지 페이로드(자체 병합 확장 가능한 소스 kind나 콘텐츠 필드)로, 또는 등록된 렌더러로 전달됩니다. 한 업무를 위해 추가된 필드는 모델의 모든 소비자가 처리해야 하고, 다음 업무는 같은 공유 렌더러에 또 다른 분기를 추가합니다.

- 판단 조건: `UserMessage`의 업무 이름을 가진 필드, 또는 `user` kind 렌더링의 업무 조건입니다.
- 올바른 출구: 페이로드에서의 표현입니다. `MessageSourceMap`은 선언 병합으로 확장 가능하므로 생산자는 `UserMessage`를 넓히는 대신 자체 소스 kind를 선언합니다. 메시지 모델은 [session.md](../subsystems/session.ko.md)에 문서화되어 있습니다.
- 경계: 첨부 파일, 인용, 편집 상태 같은 일반 메시지 기능은 업무 수정이 아닙니다.
- 예외와 승인자: 기본적으로 없으며, 예외가 있으면 해당 도메인 전문가가 확인합니다.

자체 소스 kind를 선언하는 생산자는 업무 차이를 페이로드에 둡니다:

```ts ignore-check
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    handoff: { kind: 'handoff'; sessionId: SessionId }
  }
}

const message = createUserMessage({
  role: 'user',
  content: [{ type: 'text', text: prompt }],
  source: { kind: 'handoff', sessionId: source.id },
})
```

공유 모델에 업무 필드가 있고, 그것이 공유 렌더러에 강제하는 분기:

```ts ignore-check
interface UserMessage extends MessageBase {
  readonly role: 'user'
  readonly handoffKind?: 'handoff' | 'rag'   // one business's field on the shared model
}

// ...and the renderer branches on it.
if (message.handoffKind === 'handoff') return <HandoffBubble message={message} />
```

메시지 모델의 모든 소비자가 한 업무의 필드를 처리하고, 공유 렌더러는 뒤따르는 업무마다 분기를 하나씩 늘립니다.
