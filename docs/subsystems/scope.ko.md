# 범위 지정 등록

[English](scope.md) | [中文](scope.zh.md) | 한국어

[scope 패키지](../../packages/core/scope)는 하나의 등록 컨텍스트가 에이전트별 가시성과 공유 수명 소유권을 동시에 뜻하게 만드는 아이덴티티, 캐리어, 범위 레이어 어휘를 제공합니다. Cordis 서비스가 아니라 라이브러리 원시 연산입니다. 수명 주기 근거는 [agent-scope 런타임 설계 참조](../../packages/core/agent-loop/README.md)가 소유하고, 호출 가능 API와 필터링 의미는 패키지 [README](../../packages/core/scope/README.md)가 소유합니다.

출처: [`packages/core/scope/src/index.ts`](../../packages/core/scope/src/index.ts) 및 [`packages/core/scope/src/store.ts`](../../packages/core/scope/src/store.ts).

## 아이덴티티와 디스패치 캐리어

`ScopeKey`는 불투명 객체 아이덴티티입니다. 제공되는 루프는 라이브 `Agent` 객체를 자체 키로 사용하지만, 원시 연산은 그 객체를 절대 검사하지 않습니다.

```ts type-equiv
/** An opaque, identity-compared scope key. */
type ScopeKey = object
```

`Scoped<T>`는 `scopeTarget(base, key)`가 반환하는 불투명 라우팅 수신자에 붙는 컴파일 시점 브랜드입니다. 범위 필터링 이벤트 선언은 이 캐리어를 `this` 타입으로 요구하며, 실제 이벤트 주체는 명시적 인수로 남습니다.

```ts type-equiv
/**
 * A routing-only event receiver built by {@link scopeTarget}. The type
 * parameter records the subject type for dispatch checking; the carrier does
 * not expose the subject's properties. Event payloads carry the real subject.
 */
type Scoped<T extends object> = object & { readonly [ScopedBrand]: T }
```

## 소유된 등록 컨텍스트

`Scope`는 태그된 등록 컨텍스트와 두 가지 정리 경로를 짝지웁니다. `rawDispose`는 순서 있는 복합 effect에 필요한 정확한 Cordis disposer 아이덴티티를 보존하고, `dispose()`는 직접 및 경합 호출자를 위한 공개 공유 정지 경계입니다.

```ts type-equiv
/** A minted registration scope and its quiescent disposal boundaries. */
interface Scope {
  /** Context through which scope-owned registrations are made. */
  ctx: Context
  /** Exact Cordis disposer, used when nesting this scope in an ordered composite effect. */
  rawDispose: () => Promise<void> | void
  /** Dispose every scope-owned registration; racing calls await the same completion. */
  dispose(): Promise<void>
}
```

## 범위 지정 레지스트리 레이어

`ScopeLayer`는 전역 또는 정확한 범위 수준에서 한 레지스트리의 완전한 기여를 나타냅니다. 구체적 레이어는 여러 이름 있는 테이블과 익명 테이블을 집계할 수 있으며, 레이어 전체의 공백 덕분에 `ScopedLayers`가 형제 테이블을 버리지 않고 범위 지정 상태를 회수할 수 있습니다.

```ts type-equiv
/** One scope's aggregate contribution to a registry. */
interface ScopeLayer {
  /** Whether every table in this layer is empty. */
  isEmpty(): boolean
}
```

`ScopedLayers<L>`은 즉시 생성되는 전역 레이어와 지연 생성되는 정확한 범위 레이어를 소유합니다. 읽기는 레이어를 만들지 않습니다. `peek(undefined)`는 오버레이가 없음을 뜻하고, `merge()`는 삽입 순서의 전역 이름 있는 항목에 이어 범위 지정 섀도 항목을 구체화합니다. 등록은 가시성과 Cordis effect 소유권에 하나의 컨텍스트를 사용하고, 선택적 알림 전에 동기적 실행 취소 하나를 수집하며, Cordis의 정확한 disposer를 반환하고, 범위 지정 레이어의 완전한 `ScopeLayer`가 비었을 때만 이를 회수합니다.

`NamedEntries<V>`는 삽입 순서 조회와 라이브 반복을 제공하며 중복 오류는 호출자가 소유합니다. `AnonymousEntries<V>`는 모든 추가에 고유 아이덴티티를 부여하므로 값이 같은 항목도 독립적으로 남습니다. 반복은 하나의 비어 있지 않은 테이블 세대 안에서 라이브로 유지되며, 테이블을 비우면 기존 반복자가 이후 삽입에서 분리됩니다. 둘 다 멱등적인 정확한 항목 실행 취소를 반환하며, 공유 `EntryValues` 구현 인터페이스는 공개되지 않습니다.
