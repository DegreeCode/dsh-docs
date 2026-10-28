# 방어적 패턴

[English](general.md) | [中文](general.zh.md) | 한국어

어렵게 얻은 버그 부류 규칙: 아래의 각 패턴은 이 저장소에서 실제로 출시되었거나 출시될 뻔한 결함 부류를, 재발을 막는 규칙의 형태로 제시한 것입니다. 수명 주기, 동시성, 하위 프로세스, 정리(teardown) 코드를 작성하기 전에 이 문서를 읽으세요. 테스트 계층의 대응 개념(실제 진입 경로, 세계 검증, 리소스 소유권)은 [testing.md](../testing.ko.md)에 있고, 이 규칙이 참조하는 타입 수준 정의는 [subsystems/](../subsystems/README.ko.md)에 있습니다.

## 직교하는 결과는 따로 보고하세요

결과는 동시에 여러 가지일 수 있습니다. 프로세스가 신호를 잡아 시간 초과이면서 종료 코드 0일 수도 있습니다. 각 독립적인 사실(`timedOut`, `signal`, `exitCode`)을 따로 드러내세요. 한 플래그의 보고를 다른 플래그의 분기 안에 중첩하면, 호출자가 중단된 실행을 깨끗한 성공으로 읽게 됩니다.

리뷰어는 종료시키는 방식이 아니라 보고 형태를 확인합니다. 각 사실이 독립적으로 참이 될 수 있는가, 각 사실을 다른 조건의 분기에 들어가지 않고 읽을 수 있는가? 경계는 보고이며, 프로세스에 어떻게 신호를 보내고 얼마나 시간을 줄지는 별개의 결정입니다.

## 공개 계약을 양쪽에서 지키세요

구현이 하나의 결과에 대한 여러 표현을 받을 때는 공개 API로 반환하기 전에 이를 정규화하세요. `LlmAdapter.stream()` 구현은 예외를 던지거나 `finish {kind:'error'|'aborted'}`를 발생시킬 수 있지만, `LlmRuntime.stream()`은 모델 요청 실패를 종료 finish 청크로만 노출하며 미들웨어와 소비자의 결함은 계속 예외로 던집니다. 덕분에 소비자는 잡은 예외가 제공자, 래퍼, 청크 로깅, 자신의 조립 중 어디에서 왔는지 추측하지 않아도 됩니다. 정규화된 계약은 타입이 정의된 곳에 문서화하고, 모든 소스 형태를 실제 소비자를 통해 검증하세요.

판단 조건은 소비자가 공개 API만으로 실패의 출처를 밝힐 수 있는지입니다. 내부 도우미는 계속 예외를 던져도 됩니다. 이 요구 사항은 소비자가 넘는 경계에만 적용되며, 그 뒤의 모든 함수에 적용되지는 않습니다.

## 비동기 상태는 동기 상태가 아닙니다

`agent.followup()`에는 메시지별 완료나 결과가 없고, 백그라운드 작업의 완료는 턴 경계와 경쟁하며, `reader.close()`는 EOF와 디스포즈 모두에서 발생합니다. `agent/status`나 `whenIdle()`을 후속 호출 하나의 결과로 취급하면 안 됩니다. 대기 중인 여러 후속 호출, 스티어링, 주입된 작업이 하나의 `running` 구간을 공유할 수 있고, 취소나 디스포즈는 시작되지 않은 항목을 버릴 수 있습니다. 실행을 실제로 소유하는 자동화 호출자는 그 구간을 명시해야 하며(예: 해당 메시지의 영속 인박스 영수증부터 다음 전체 에이전트 `idle`까지), 선택한 출력도 그 메시지에 인과적으로 귀속된 것이 아니라 구간 전체에 걸친 것으로 서술해야 합니다. 이 가드에는 양날이 있습니다. 기다리는 전이 상태가 결코 일어나지 않을 수 있다면 기다림이 멈추지 않으므로, “기다릴 것이 없는” 분기를 명시적으로 처리하세요.

판단 조건은 에이전트가 API가 정의하지 않은 단위별 완료를 관찰할 수 있는지입니다. 구간이 정말로 호출자에게 속한다면, 구간과 출력 범위를 밝히는 것도 호출자입니다. 공유 `running` 플래그는 결코 그 선언이 될 수 없습니다.

## 타이밍은 정확성을 담보하지 않습니다

정확성은 명시적인 호출 지점과 명시적인 상태에서 오며, 콜백이 이벤트 루프의 어디에 도착하는지에서 오지 않습니다. 작업이 올바른지를 결정하는 `microtask`, `setTimeout`, `queueMicrotask`는 프로그램의 나머지와 경쟁합니다. 부하가 가벼울 때는 버티지만, 부하가 크거나 배칭이 바뀌면 조용히 실패합니다. React 코드도 같은 규칙을 따릅니다. 효과가 설계에서 명시했어야 할 “렌더 직후” 순서를 대신 제공해서는 안 됩니다.

판단 조건은 정확성이 이름 있는 호출 지점이나 상태 머신이 아니라 “그 콜백이 이미 실행되었음”에 의존하는지입니다. 두 가지 경계가 있습니다. 테스트의 시간 제한 예산은 실패를 기다리는 것이지 타이밍에 의존하는 정확성이 아니며, 사용자에게 보이는 작업의 속도만 조절하는 의도적 지연은 이 규칙에 해당하지 않습니다. 개발자 측 예외는 없으며, 타이밍 기법이 정말로 필요하면 도메인 소유자에게 넘깁니다.

```ts
// The order is written into the code: dispose the old store, then build its successor.
declare let store: { dispose(): void }
declare function createStore(scopeKey: string): { dispose(): void }
declare const scopeKey: string

store.dispose()
store = createStore(scopeKey)
```

```ts ignore-check
queueMicrotask(() => { if (!ready) refresh() })   // assumes the microtask runs before the next frame
setTimeout(() => setMounted(true), 0)             // waits for a render that was never sequenced
```

잘못된 형태는 간헐적으로 실패합니다. 새로 고침이 누락되거나 상태가 동기화되지 않으며, 부하가 있을 때만 재현됩니다.

## 선택적 입력은 두 동작을 모두 밝힙니다

선택적 매개변수는 값이 있을 때와 없을 때 피호출자가 무엇을 하는지 밝히므로, 호출자는 방어적 연산자에서 한쪽 동작을 추론하는 대신 계약에서 두 동작을 모두 읽습니다. `?.`가 쌓이는 것이 신호입니다. 각각은 필드가 존재해야 하는지에 대한 결정을 대신하고 있습니다.

판단 조건은 `?.`가 알려진 값의 진짜 선택적 단계를 처리하는 것이 아니라 필드 존재 여부에 대한 판단을 대체하는지입니다. 이 요구 사항은 인터페이스 계약에 적용됩니다. 두 분기가 반환값과 부수 효과를 밝혀야 하며, 호출자는 그 계약에서 이를 읽습니다. 예외 경로는 없습니다. 두 동작을 밝힐 수 없는 호출 지점은 스타일 선호가 아니라 리뷰 차단 사유입니다.

```ts
// Both behaviors are in the contract: no options object means "unknown", not "skip".
interface ResolveInput { options?: readonly string[] }
type Resolution = { kind: 'unknown' } | { kind: 'value'; value: string }

function resolve(input: ResolveInput): Resolution {
  if (input.options === undefined) return { kind: 'unknown' }
  return { kind: 'value', value: input.options.join(',') }
}
```

```ts ignore-check
const value = a?.b?.c?.d ?? fallback   // four layers of fallback hide whether d should exist
```

잘못된 형태는 계약을 모호하게 두고 오류를 삼키므로, 다음 호출자가 그 위에 또 다른 폴백을 추가하게 됩니다.

## 하나의 값은 하나의 사실만 담습니다

알 수 없는 값, 빈 컬렉션이나 빈 문자열, 정말로 없는 필드는 서로 다른 세 가지 사실이며 세 가지 표현을 가집니다. 하나의 `undefined`나 `null`이 이 여러 가지를 대신할 수 없으며, 경우마다 다르게 동작해야 하는 소비자는 경계에서 이들을 뭉개는 대신 명시적으로 구별합니다.

판단 조건은 하나의 “값 없음”이 둘 이상의 의미(아직 조회하지 않음, 조회했지만 비어 있음, 판단할 수 없음)를 담고 있는지입니다. 판별 유니온이나 명시적인 enum 값이 일반적인 구현이며, 타입이 정의된 [core.md](../subsystems/core.ko.md#저장소-전반의-타입-패턴)에 문서화합니다.

```ts
type ValueState<T> = { kind: 'unknown' } | { kind: 'empty' } | { kind: 'value'; value: T }
```

```ts ignore-check
return null   // means "not queried", "queried, nothing there", and "cannot tell", all at once
```

잘못된 형태는 호출자가 경우를 구별할 수 없게 만들어 UI 상태, 캐시 정책, 재시도 결정이 모두 어긋납니다.

## 새로운 active/current 싱글턴은 거부됩니다

새로운 전역 `active`나 `current` 싱글턴은 도입하지 않으며, 기존 것들은 마이그레이션으로 제거합니다. 전역적으로 유일한 선택은 이 코드베이스가 하지 않는 설계 선언입니다. 같은 데이터를 보는 여러 뷰가 각자 참조나 키를 가집니다.

판단 조건은 변경이 전역적으로 유일한 선택 상태 필드를 도입하는지입니다. 대체 형태는 하나의 데이터와 그 위의 여러 뷰이며, 각 뷰가 자기 참조를 가집니다. 기본 예외는 없습니다. 개념이 정말로 서비스마다 한 번만 존재한다면 `inject`로 표현되는 서비스나 인스턴스 필드가 이를 담으며, 모듈 수준 필드는 절대 안 됩니다.

```ts ignore-check
// Each view holds the key it renders; nothing global decides what is "current".
function ConversationView({ sessionKey }: { sessionKey: SessionKey }) { /* … */ }
```

```ts ignore-check
let activeTabId: TabId | undefined   // module-level; every component reads the same one
```

잘못된 형태는 독립적인 인스턴스가 서로 간섭하게 만들고, 어느 뷰가 포커스를 소유하는지 리뷰어가 감사할 수 없게 합니다.

## 공유 상태에는 소유자가 하나입니다

공유 상태는 서비스나 인스턴스에 매달리므로 소유자가 수명 주기를 가진 이름 있는 객체입니다. 모듈 수준 캐시, 싱글턴, 전역 `WeakMap`, `Symbol.for`/`globalThis`/`window.__X__` 우회는 그 소유자를 숨기고 모든 정리(teardown)보다 오래 살아남습니다.

판단 조건은 값을 소유하는 서비스나 인스턴스를 밝히는 것입니다. 소유자를 밝힐 수 없다면 구현 전에 소유자를 먼저 정합니다. 경계는 서비스나 인스턴스의 필드를 얼마든지 많은 주입된 소비자가 읽을 수 있고, 그 값을 도메인 사이로 전달할 때는 전역 네임스페이스가 아니라 기존 인터페이스를 거친다는 점입니다. 기본 예외는 없으며, 전역 조회 키가 정말로 필요하면 그 회수 정책과 함께 도메인 소유자에게 넘깁니다.

```ts
// The shared value hangs on the session service instance; consumers inject it.
interface Sessions { readonly current: string }
declare const ctx: { get(name: 'sessions'): Sessions }

const sessions = ctx.get('sessions')   // one owner, lifetime tied to the service
```

```ts ignore-check
globalThis.__dshCache = new Map()   // shared across instances, reclaimed never
```

잘못된 형태는 인스턴스가 서로를 덮어쓰게 하고, 회수 시점을 알 수 없게 만들며, 테스트 사이로 상태를 흘립니다.

## 업무 기능은 스스로를 소유합니다

업무 기능은 자체 패키지에 살고 등록 표면(레지스트리, `slots.inject`, 워터폴, 이벤트 구독)을 통해 붙습니다. 런타임, 컨트롤러, 관리자, 게이트웨이는 일반 오케스트레이션을 담당합니다. 레지스트리 구조와 디스포즈 수명 주기는 가질 수 있지만 항목은 각 항목을 소유한 패키지가 작성하며, 업무 행을 중앙 표로 하드코딩하지 않습니다.

새로운 구분, 필드, 어댑터가 필요한지 먼저 확인한 뒤 소유자를 고르세요. 불필요한 개념을 옮겨도 유지 비용은 사라지지 않습니다. 필요한 동작이라면, 지역 구현이 복잡도를 크게 늘리지 않는 한 생산자나 소비자 근처의 기존 확장 지점을 선호하세요. 생산자는 공유 타입을 선언한 패키지를 고치지 않고도 자체 패키지에서 [선언 병합](../subsystems/core.ko.md#map--derived-union-패턴)으로 기능 변형을 선언할 수 있습니다. 모든 소비자에게 공통된 의무는 공유 소유자에 속합니다.

판단 조건은 기능이 스스로를 선언하고 등록하며, 중심 계층은 업무 결정을 내리는 대신 전달하고 수명 주기만 관리하는지입니다. 경계는 중심 계층이 레지스트리 구조와 디스포즈 수명 주기를 가지되 항목은 소유 패키지에서 온다는 점입니다. 예외가 하나 있습니다. 로깅, 전송, 저장처럼 순수한 인프라는 업무 등록 표면을 통해 붙지 않습니다. 중심 계층에 새 분기를 두려면 소유 패키지에 둘 수 없는 이유를 설명해야 합니다.

```ts
// The business package registers its own slot and handlers in its apply.
interface Slots {
  inject(name: string, register: () => void): void
  register(name: string): void
}
interface Context { readonly slots: Slots }

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.footer', () => ctx.slots.register('conversation.footer'))
}
```

```ts ignore-check
if (pluginName === 'ui-attachment') { /* business branch inside the manager */ }
```

잘못된 형태는 새 기능마다 중심 계층을 고치게 만들고, 중심 계층은 변경 병목이자 충돌 지점이 됩니다.

## 변경은 성능 증거를 함께 담습니다

핫 패스의 비용을 움직일 수 있는 변경은 건드린 코드를 전후로 측정하고 그 수치를 조건과 함께 보고합니다. 세 지표는 실행 시간, 최대 메모리, 정상 상태 메모리이며, 하나의 환경에서 하나의 입력으로 측정합니다. 세밀도는 전체 머신 점수가 아니라 변경된 경로입니다. “전체적으로 느려진 것은 없다”는 보고는 증거가 아니며, 다른 곳이 개선되었다고 이곳의 회귀가 정당화되지 않습니다. 최적화된 첫 페인트도 `append`에 대해 답해야 합니다.

판단 조건은 하나의 환경과 하나의 입력에서 세 지표 중 하나라도 변경된 경로에서 유의미하게 나빠지는지입니다.

기준선은 측정 대상 변경이 없는 같은 경로입니다. 보통 측정 훅이 없는 네이티브 구현이지, 이전 구현이 아닙니다. 양쪽에 같은 훅을 붙여 이전과 새것을 비교하면 차이가 희석되어 사라집니다. 양쪽이 같은 오버헤드를 치르므로 둘 다 느린데도 측정값은 “변화 없음”을 보고합니다.

측정은 [benchmarks/](../../benchmarks/AGENTS.md)가 소유하며, 측정 대상 사용자 경로마다 디렉터리가 하나이고 그 시나리오가 진입점입니다:

```sh
# Run the owning scenario before and after the change; the numbers go into the PR.
pnpm run test:bench
```

패키지 지역 진단은 소유자 옆에 `.perf.ts` 접미사로 남기고 `test:bench`에 합류하지 않습니다. CI 게이트는 `pnpm run check:ci:bench`(작업 `node 24 / benchmarks`)이며 스케일된 보고서를 게시합니다. 이 게이트는 통과 판정이 아니라 경보입니다. 여기서 회귀가 나오면 소유 시나리오를 다시 실행하고 로컬에서 구간을 프로파일링해 어느 부분이 느려졌고 어떤 변경이 그것을 도입했는지 찾습니다. 보유 메모리 주장에는 `pnpm run test:bench:memory 4g|8g`를 사용하며, 이는 나열된 파일들을 스왑 없는 cgroup에서 변경되지 않은 예산으로 다시 실행합니다.

경계: 런타임 경로를 건드리지 않는 수정(주석, 문서, 테스트 전용 코드)은 측정이 필요 없고, 프로덕션 성능 코드는 기회가 되면 지워도 되는 벤치마크 계측이 아닙니다(`performance.now()`와 `scheduler.yield()`는 프로덕션 디코드·인코드 청크 스케줄링의 일부입니다). 성능을 실제로 치르는 아키텍처 변경은 측정된 비용과 이유를 밝히고 도메인 소유자의 승인을 받습니다. “계층 구조상 필요했다”는 셀프서비스 사유가 아닙니다. 명령, 수치, 환경, 입력 크기를 기록해 기준선을 다시 만들 수 있게 하세요.

```text
CI benchmark reported green, so the change is accepted as performance-neutral.
```

그런 형태는 벤치마크가 모델링하지 않는 경로에 실제 회귀를 출시합니다.

## 마이그레이션은 동작을 보존합니다

마이그레이션이나 패키지 분할은 외부에서 관찰 가능한 동작을 같게 유지합니다. 오류 코드, 진단, 데이터 흐름 순서, UI 타이밍을 항목별로 비교합니다. 코드를 옮기는 것이 삭제 후 재작성보다 선호되며, 재작성은 의미가 어차피 바뀌는 코드에 어울리고 그때는 변경이 차이점을 나열합니다. 패키지나 export 경로 변경은 동작 변경이 아니라 캐리어(carrier) 변경이며, 동작 변경은 그 자체로 별도의 변경입니다.

판단 조건은 변경 전후의 관찰 가능한 동작을 항목별로 비교하는 것입니다. 완전한 동일성이 불가능한 경우, 변경은 차이나는 항목과 각 항목의 검증 방법을 밝히고 도메인 소유자의 승인을 받습니다. 마이그레이션 중 발견한 결함은 이동에 끼워 넣지 않고 별도 변경으로 고칩니다.

```sh
# The move keeps paths and error codes; the reference updates are the whole diff.
git mv packages/old/src/endpoint.ts packages/new/src/endpoint.ts
```

```ts ignore-check
// The migration silently upgrades the error handling it was only supposed to move.
throw new EndpointError('not found')   // was: return { ok: false, code: 'not_found' }
```

잘못된 형태는 동작 변경을 이동 속에 묻어, 리뷰에서 위치 이동과 의미 변경을 분리할 수 없고 회귀를 국소화할 수 없게 만듭니다.

## 디스포즈는 요청만이 아니라 정지 상태에 도달해야 합니다

종료(kill)나 중단(abort) 후에는 자식의 종료를 await하세요. 선택적 알림은 일찍 멈춰도 되지만, 완료나 최종 영속화에 필요한 리소스와 리스너는 소비자의 처리가 완전히 완료(settle)될 때까지 유지되어야 합니다. [Cordis 소유권 검사](../../.agents/skills/cordis-styling-nitpicking/SKILL.md#p0-cleanup-dependency-released-before-consumer-completion)를 참고하세요.

판단 조건은 정리(teardown)가 실제 정지 상태를 await하는지, 아니면 요청만 하는지입니다. 경계는 기다릴 소유자가 없는 작업, 즉 분리되어 관찰되지 않는 작업이며 정리가 이를 추적할 의무는 없습니다. 반면 컴포넌트가 시작했고 여전히 관찰할 수 있는 것은 완료를 보고하기 전에 await해야 합니다.

## 콜백 예외는 디스패처 안에서 격리합니다

디스패치 프로미스를 거부하거나 이후 리스너가 차단되는 일 없이 각 리스너의 예외를 잡아 보고하세요. 리스너가 변경하는 상태는 리스너의 소유자가 [오류 처리 규칙](../../.agents/skills/dsh-error-handling/SKILL.md#catch-recover-or-stop)에 따라 처리해야 합니다. 예외를 잡는 것만으로는 상태가 복원되지 않습니다.

판단 조건은 예외를 던지는 리스너가 디스패치 프로미스를 거부하거나 뒤의 리스너 실행을 막을 수 있는지입니다. 경계는 호출자 자신의 await입니다. 디스패처가 요청한 작업에 의도적으로 전파하는 오류는 격리 실패가 아닙니다.

```ts
async function dispatch(listeners: ((event: string) => Promise<void>)[], event: string): Promise<void> {
  for (const listener of listeners) {
    try { await listener(event) } catch (error) { console.warn('listener failed', error) }
  }
}
```

## 신뢰할 수 없는 출력에 주변 환경이나 예측 가능한 경로를 넘기지 마세요

실행되는 명령에는 정리된 env를 줍니다(`*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*` 제거). 그래야 하네스 자격 증명이 출력, `env`, 스필 파일로 유출되지 않습니다. 임시·스필 파일은 비공개(0700) 디렉터리, 임의 이름, 소유자 전용 배타적 열기(`'wx'`, `0o600`)를 사용합니다. 예측 가능한 세계 읽기 가능 경로는 심볼릭 링크 경쟁과 정보 노출을 부릅니다.

판단 조건은 실행된 프로세스가 주변 환경을 상속하거나 다른 프로세스가 예측하고 교체할 수 있는 곳에 쓰는지입니다. 경계는 외부 입력이 없는 신뢰된 프로세스 내부 코드이며, 이 규칙은 그런 코드를 규율하지 않습니다.

## 링크 형태의 경로는 unlink로 제거하세요

심볼릭 링크나 Windows 정션(junction)일 수 있는 경로는 `lstatSync().isSymbolicLink()`로 확인한 뒤 `unlinkSync`로 제거합니다. unlink는 링크만 삭제하고 실제 디렉터리는 거부하므로 링크를 따라 대상으로 들어가지 않습니다. Windows에서 `rmSync(link)`는 정션에 대해 `ERR_FS_EISDIR`을 던지며, 재귀 삭제는 정션을 통해 대상으로 내려갈 수 있습니다. 재귀 `rmSync`는 실제 디렉터리임이 확인된 경우에만 사용하세요.

판단 조건은 제거 기본 요소가 링크를 따라 대상으로 들어갈 수 있는지입니다. 경계는 코드가 자신이 소유한 디렉터리에서 직접 만든 경로이며, 이 경우 단순 재귀 제거가 이미 안전하다고 알려져 있습니다.
