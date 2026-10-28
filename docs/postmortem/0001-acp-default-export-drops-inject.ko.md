# 포스트모템 0001: 연결 시 ACP 서버 크래시 — `export default`가 플러그인의 `inject`를 버렸습니다

[English](0001-acp-default-export-drops-inject.md) | [中文](0001-acp-default-export-drops-inject.zh.md) | 한국어

상태: 해결됨 (PR #41 `feat/acp-2-bridge`에서 수정)

## 요약

단위 테스트가 충분했는데도 두 가지 통합 실수가 ACP를 망가뜨렸습니다. 기본 내보내기 때문에 Loader가 `inject`를 버렸고, 추적된 선택적 서비스 조회가 shadow 경계를 넘다가 실패했습니다. 손으로 마운트한 테스트는 두 경로를 모두 우회했습니다. 수정은 키 없는 실제 Loader 커버리지와 플러그인 내보내기·선택적 서비스 접근에 대한 패키지 규칙을 추가했습니다.

## 개요

ACP 서버(`dsh --profile acp`, `@deepseek-ai/dsh-acp`)는 실제 편집기(Zed)가 연결되는 순간 크래시했습니다. 첫 `session/new` 요청이 `Internal error: cannot get property "agents" without inject`를 반환했고, `session/load`는 `sessionPersistence`에 대해 같은 오류를 반환했습니다. 브리지는 178개의 통과하는 단위 테스트와 100% 라인 커버리지에도 불구하고 프로덕션에서 완전히 동작하지 않았습니다. 두 개의 독립적인 버그가 같은 오류 문자열 뒤에 숨어 있었고, 테스트 스위트는 같은 이유로 둘 다 놓쳤습니다. 모든 테스트가 플러그인이 실제로 어떻게 로드되고 서비스가 실제로 어떻게 해석되는지를 실행하지 않는 경로로 플러그인을 마운트했습니다.

## 영향

ACP 서버는 세션을 하나도 만들거나 로드할 수 없었습니다. 편집기가 가장 먼저 호출하는 두 RPC입니다. 에이전트를 Zed에 연결한 사람은 즉시 완전한 실패를 겪었습니다. 데이터 손실은 없었고(크래시 전에 아무것도 영속되지 않았습니다), 비용은 전적으로 "기능이 동작하지 않음"과 그 이유를 두 번 알아내는 디버깅 시간이었습니다.

## 타임라인

- 브리지(RFC 010)는 코덱, 인메모리 전송, 생성된 프로토콜 메시지, 실패 경로, HMR에 대한 전체 단위 스위트와, 키로 게이트된 실제 API e2e, 키 없는 stdout 순수성 e2e와 함께 착륙했습니다. 모두 통과, 100% 커버리지.
- 실제 Zed 세션이 `session/new`에서 `cannot get property "agents" without inject`로 즉시 실패했습니다.
- 조사는 처음에 Cordis의 "traceable/shadow" 이론을 좇았고(그럴듯했고 메커니즘도 실제입니다 — 버그 #2 참조), 그다음 vendored `reflect.ts`의 실제 fiber 순회를 계측하고 실제 서브프로세스를 실행했습니다. 추적 결과 throw는 *플러그인 로드 시점*에 루트 fiber에서 shadow 없이 `apply()` 179행에서 발생해, `session/new`에 대한 shadow 이론을 반증했습니다.
- 근본 원인 #1 발견: 잘못 남은 `export default apply`. 이를 제거하니 `session/new`가 고쳐졌습니다.
- 제거하자 버그 #2가 드러났습니다. `session/load`가 여전히 `sessionPersistence`에서 throw했습니다. 이는 진짜 다른 메커니즘(shadow 순회)이며, 수정을 격리하고 실제 서브프로세스를 다시 실행해 확인했습니다.

## 근본 원인 #1 — `export default apply`가 플러그인의 `inject`를 버림 (`session/new` 중단)

`packages/acp/acp/src/index.ts`는 *네임스페이스 플러그인*입니다. 저장소의 다른 모든 플러그인(`invariants`, `llm-deepseek`, `tool-bash`, `tui`, …)처럼 `name`, `inject`, `Config`, `apply`를 각각 이름으로 내보냅니다. 하지만 이 파일은 *그와 별개로* 다른 플러그인에는 없는 한 줄을 끝에 더 갖고 있었습니다:

```ts ignore-check
export const name = 'acp'
export const inject = ['agents', 'sessions', 'sessionPersistence']
export function apply(ctx: Context, config: AcpConfig): void { /* … */ }
// …
export default apply   // ← the bug
```

플러그인이 `cordis.yml`에서 로드될 때 cordis Loader는 가져온 모듈을 `Loader.unwrapExports`(`vendor/loader/src/index.ts`)로 정규화합니다:

```ts ignore-check
unwrapExports(exports: any) {
  if (isNullable(exports)) return exports
  exports = exports.default ?? exports        // ← prefers `.default`
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}
```

기본 내보내기가 있으면 `exports.default ?? exports`가 **맨 `apply` 함수**로 해석됩니다. 맨 함수에는 `inject`, `name`, `Config` 속성이 없습니다. 그것들은 모듈 네임스페이스의 *형제* 이름 내보내기로 존재했고, `.default`로 풀어내면서 네임스페이스가 버려졌습니다. Loader는 그다음 빈 `inject`로 플러그인의 fiber를 만들었습니다.

결과적으로 `apply`는 **주입된 서비스가 없는** fiber에서 실행되었습니다. 첫 줄인 `const agents = ctx.agents`가 fiber 트리(ROOT → Include → Loader → ROOT)를 순회했고, 어떤 fiber 저장소에도 `agents`가 없고 루트 fiber(`runtime === null`)에 도달하자 `cannot get property "agents" without inject`를 던졌습니다. 크래시는 이후 요청 핸들러가 아니라 *로드 시점*에 발생했습니다. 실패한 추적에서는 요청이 우연히 로드를 촉발했을 뿐입니다.

**수정:** `export default apply`를 삭제합니다. 그러면 Loader가 모듈 네임스페이스를 사용해 `inject`/`name`/`Config`를 존중하고, `apply`는 선언된 서비스를 실제로 부여하는 fiber 안에서 실행됩니다.

## 근본 원인 #2 — 선택적 서비스 읽기가 추적 가능한 shadow를 거치며 inject 가드에 걸림 (`session/load` 중단)

#1을 고치자 `session/new`는 동작했지만 `session/load`는 여전히 `cannot get property "sessionPersistence" without inject`를 던졌습니다. 이쪽은 정말로 Cordis의 traceable/shadow 메커니즘이며, 정확히 이해할 가치가 있습니다.

`session/load`는 `agents.resume(...)`를 호출하고, 이는 `AgentLoop.resume()`에 위임되며, 그 메서드가 `this.ctx.sessionPersistence`를 읽었습니다. `AgentLoop`의 `static inject`는 의도적으로 `sessionPersistence`를 포함하지 않습니다. 주입하면 영속성을 쓰지 않는 데모가 영원히 로드되지 않는 백엔드를 기다리며 영원히 대기하게 되기 때문입니다. 그 서비스는 별도의 형제 플러그인/fiber가 제공하고 기회주의적으로 읽힙니다.

Cordis의 서비스 접근은 컨텍스트 프록시(`vendor/cordis/src/reflect.ts`)를 거칩니다. 서비스 메서드가 외부 fiber에서 얻은 *추적 가능한 프록시*를 통해 호출될 때(여기서는 브리지 fiber가 `ctx.agents.resume`을 호출하고, 레지스트리가 `this.factory`인 `AgentLoop`를 호출자에 바인딩된 새 추적 가능한 프록시로 다시 감싸 반환합니다), `createShadowMethod`(`vendor/cordis/src/utils.ts`)가 `this`를 *shadow* 객체에 다시 바인딩하고, 그 객체의 `ctx`는 `AgentLoop` 자체의 구성 컨텍스트를 가리키는 `[symbols.shadow]`를 갖습니다. 따라서 `resume` 안에서 `this.ctx.sessionPersistence`는 프록시 핸들러가 shadow의 fiber에서 fiber 순회를 시작하며 해석됩니다:

```ts ignore-check
// reflect.ts get handler
let fiber = (ctx[symbols.shadow] as Context ?? ctx).fiber   // ← starts at AgentLoop's fiber
while (true) {
  const impl = fiber.store?.[prop]
  if (impl) return getTraceable(ctx, impl.value)
  if (prop in fiber.inject) { /* inactive-context error */ }
  if (!fiber.runtime) throw error                            // ← reached root, throw
  if (fiber.parent[symbols.isolate][prop] !== key) throw error
  fiber = fiber.parent.fiber                                 // ← ancestor-only
}
```

순회는 **조상 전용**입니다. `sessionPersistence`는 `AgentLoop`의 fiber 저장소에(그의 `static inject`에 없으므로)도, 루트로 가는 어떤 조상에도 없습니다(형제 분기에 있습니다). 그래서 순회는 루트 fiber에 도달해 throw합니다.

인메모리 `AgentLoop` resume 테스트가 왜 이것을 놓쳤을까요? 그 테스트는 테스트 코드에서 *어떤 플러그인 fiber의 바깥에서* `ctx.agents.resume(...)`를 직접 호출하기 때문입니다. 거기서는 `ctx.fiber.runtime`이 `null`이라 프록시 핸들러가 이른 우회 경로를 탑니다:

```ts ignore-check
if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false)   // ← direct global-store lookup, no fiber walk
```

`ctx.reflect.get(name, false)`는 isolate 심볼로 키가 지정된 전역 서비스 저장소의 직접 조회입니다. fiber 위상을 완전히 무시하고 서비스를 찾습니다. 그래서 최상위 테스트에서는 읽기가 동작하고, shadow를 통해 도달한 실제 플러그인 fiber 안에서는 throw합니다. 브리지는 정확히 후자입니다.

**수정:** 선택적 서비스를 `ctx.get('sessionPersistence')`로 읽습니다. 이는 활성 상태 검사를 보존하면서 전역 isolate 키 저장소를 사용합니다. 직접 속성 읽기는 플러그인의 선언된 주입 집합에 있는 서비스에는 여전히 적절합니다.

## 모든 테스트가 놓친 이유 (진짜 실패)

두 버그는 하나의 뿌리 프로세스 빈틈을 공유합니다. 즉 **어떤 테스트도 플러그인을 실제 로드 경로나 실제 호출 위상으로 실행하지 않았습니다.**

- 인메모리 하네스는 플러그인 객체를 손으로 만들어 브리지를 마운트합니다: `ctx.plugin({ name, inject, apply })`. 이는 `inject`를 수동으로 공급하므로 버그 #1을 재현할 수 없습니다. `unwrapExports`는 *Loader*만 호출하고 `ctx.plugin`은 절대 호출하지 않기 때문입니다. `ctx.plugin(NamespaceImport)`조차 그것을 잡지 못했을 것입니다.
- 같은 하네스는 모든 것을 하나의 루트 컨텍스트에 평평하게 마운트하므로, 거기서 도달한 `AgentLoop` resume은 최상위(`!runtime` 우회)로 실행되거나, 기원이 여전히 루트에서 해석되는 shadow를 거칩니다. 그래서 버그 #2의 조상 순회 실패가 가려집니다.
- 유일한 키 없는 e2e는 `initialize`를 보내고 stdout 순수성만 검사했습니다. `initialize`는 팩토리에 도달하지 않으므로 두 버그를 그냥 지나쳤습니다.
- `session/new`/`session/load`를 구동한 유일한 테스트는 키로 게이트되어 CI(키 없음)가 건너뛰었고, 로컬에서는 오래된 빌드 `lib/`(옛 코드 포함)가 모듈 해석을 우연히 만족시켰기 때문에 "통과"했습니다.

100% 라인 커버리지는 그동안 계속 만족되었습니다. 커버리지는 라인이 *실행되었음*을 증명할 뿐, 기능이 *출시되는 방식대로* 동작하는지는 말해 주지 않습니다.

## 추가한 가드레일

- **`export default apply` 제거** (`packages/acp/acp/src/index.ts`) — 버그 #1 수정.
- **`AgentLoop.resume`이 `this.ctx.get('sessionPersistence')`를 읽음** (`packages/core/agent-loop/src/index.ts`) — 버그 #2 수정이며, shadow 순회 함정을 설명하는 주석을 포함합니다.
- **실제 stdio를 통한 키 없는 `session/new` e2e** (`apps/cli/tests/profiles/acp/tests/acp.e2e.ts`): 실제 Loader를 통해 프로필을 서브프로세스로 부팅하고 `session/new`가 해석되는지 단언합니다. 이 테스트는 API 키 없이 버그 #1에서 크게 실패합니다. `export default apply`를 복원하면 실패하는지 확인했습니다.
- **e2e spawn의 `TSX_TSCONFIG_PATH`**: 서브프로세스는 임시 cwd에서 실행되는데, 거기서 tsx는 상위로 검색해 저장소 루트 tsconfig의 `paths` 맵을 찾을 수 없습니다. 그래서 dsh-* 가져오기가 조용히 빌드된 `lib/`로 폴백했습니다. tsx에 저장소 tsconfig를 지정하면 해석이 cwd에 독립적이게 되고 테스트가 오래된 빌드가 아니라 *소스*를 실행하게 됩니다.
- **[docs/testing.md](../testing.ko.md) 규칙**: "실제 진입 경로를 테스트하라", 라인 커버리지는 동작 커버리지가 아니다 — 이 교훈을 모든 향후 플러그인에 규정합니다.

## 교훈

- 네임스페이스 플러그인과 기본 내보내기는 cordis Loader에서 상호 배타적입니다. 네임스페이스 형태(`name`/`inject`/`Config`/`apply`)를 선택하고 `export default`를 추가하지 마세요. `unwrapExports`가 네임스페이스를 버립니다.
- 플러그인이 기회주의적으로 읽지만 `static inject`에 선언하지 **않는** 서비스에는 `ctx.get(name)`을 사용하고 `ctx.<name>`은 절대 쓰지 마세요. 속성 프록시는 외부 shadow를 거치면 실패하는 조상 전용 fiber 순회로 해석합니다. `ctx.get(name)`은 위상 독립 조회이며(기본적으로 엄격합니다 — 비활성 백엔드는 해체 중에 돌려받는 대신 `undefined`로 읽힙니다).
- 손으로 플러그인을 구성하는 테스트는 플러그인이 어떻게 로드되는지 검증할 수 없습니다. 최소 하나의 테스트가 실제 Loader/export 경로를 종단 간 구동해야 합니다. 핵심 작업이 모델을 호출하지 않는다면 그 테스트에 API 키가 필요 없으므로 키 게이트 뒤가 아니라 CI에 있어야 합니다.
- 이론이 아니라 추적을 믿으세요. 우아한 shadow 설명은 실제였지만 *두 번째* 버그였고, *첫 번째*는 fiber 순회 `console.error`가 몇 시간의 그럴듯하지만 틀린 추론 끝에 몇 분 만에 찾아낸 한 줄짜리 내보내기 실수였습니다.
