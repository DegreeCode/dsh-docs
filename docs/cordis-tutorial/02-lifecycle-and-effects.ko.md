# 2. 수명 주기와 효과

[English](02-lifecycle-and-effects.md) | [中文](02-lifecycle-and-effects.zh.md) | 한국어

Cordis 플러그인은 구성 편집, 핫 리로드, 명시적 폐기(disposal), 또는 필수 서비스의 상실로 언로드될 수 있습니다. Cordis API를 통해 이루어진 등록은 효과(effect)이며 소유 플러그인이 언로드될 때 되돌려집니다. 그 API 밖에서 관리되는 리소스는 `ctx.effect()`로 감싸야 합니다.

## 효과

Cordis가 아직 관리하지 않는 리소스(타이머, 연결, 감시자)는 `ctx.effect()`로 감싸고 정리 함수(disposer)를 반환합니다:

`tmp/cordis-tutorial`에서 `lifecycle.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'lifecycle-demo'

function heartbeat(ctx: Context) {
  console.log('heartbeat plugin loading')
  ctx.effect(() => {
    const timer = setInterval(() => console.log('tick'), 200)
    return () => {
      clearInterval(timer)
      console.log('heartbeat cleaned up')
    }
  })
}

export function apply(ctx: Context) {
  // Mount a child plugin and keep its fiber to dispose it later.
  const fiber = ctx.plugin(heartbeat)
  // The demo timer is itself an effect: if THIS plugin is unloaded first,
  // the pending callback is cancelled instead of firing on a dead app.
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      await fiber.dispose()
      console.log('disposed')
      process.exit(0)
    }, 700)
    return () => clearTimeout(timer)
  })
}
```

`cordis.yml`이 이 파일을 가리키게 합니다:

```yaml
- name: './lifecycle.ts'
```

실행하면(`node --import tsx ../../vendor/cordis/bin.js`) 다음이 출력됩니다:

```
heartbeat plugin loading
tick
tick
tick
heartbeat cleaned up
disposed
```

세 가지 눈여겨볼 점이 있습니다:

- `ctx.plugin(heartbeat)`는 함수를 **코드에서** 플러그인으로 마운트합니다. YAML 로더가 각 구성 항목에 수행하는 것과 같은 동작입니다. 함수 플러그인에는 `apply` 메서드가 필요하지 않습니다. Cordis가 함수를 직접 호출하며 이름은 진단에만 사용합니다. `apply` 메서드는 객체 형태 `ctx.plugin({ apply(ctx) { /* ... */ } })`에만 필요합니다. 이 호출은 로드된 플러그인 인스턴스 하나의 런타임 핸들인 **fiber**를 반환합니다.
- 효과 본문은 로드 중에 실행되고, 반환된 정리 함수는 언로드 중에 실행됩니다. 플러그인 수명 주기에 속한 리소스의 정리 함수를 직접 호출할 일은 없습니다.
- `fiber.dispose()`는 비동기 정리 함수를 포함한 플러그인의 모든 정리가 끝난 뒤 이행되며, 플러그인이 마운트한 자식 플러그인도 재귀적으로 언로드합니다.

## fiber 상태 머신

로드된 모든 플러그인 인스턴스는 다음 상태를 거치는 fiber를 소유합니다:

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- **PENDING** — 선언되었지만 필수 서비스(3장)가 아직 사용 가능하지 않습니다.
- **LOADING / ACTIVE** — `apply`가 실행 중이거나 완료되었습니다.
- **FAILED** — `apply` 실행 중 또는 구성 검증 중에 예외가 발생했습니다.
- **UNLOADING / DISPOSED** — 정리 함수가 실행 중이거나 모든 것이 정리되었습니다.

PENDING은 [6장](06-composition-and-hmr.ko.md)에서 다시 만나게 됩니다. "왜 내 플러그인은 아무것도 출력하지 않지?"라는 질문의 흔한 답이 바로 이 상태입니다.

## 이미 효과인 것들

내장 등록 API가 이미 효과이기 때문에 `ctx.effect()`를 직접 작성할 일은 드뭅니다:

- `ctx.on(event, listener)` — 리스너는 언로드 시 제거됩니다([4장](04-events.ko.md)).
- `ctx.plugin(child)` — 자식은 부모와 함께 폐기됩니다.
- 서비스 등록도 효과입니다. `ctx.tools.register(...)` 같은 하네스 레지스트리도 반환된 정리 함수를 호출한 플러그인에 연결하므로 자동으로 되돌려집니다([7장](07-into-the-harness.ko.md)).

Cordis가 관리하지 않는 리소스는 `ctx.effect()` 안에서 획득하고, 이를 해제하는 정리 함수를 반환하세요. 그러면 Cordis가 언로드(핫 리로드 포함) 중에 그 해제를 호출합니다.

순서에 관한 주의점이 하나 있습니다. 정리 함수는 등록의 역순으로 시작되지만, 여러 **비동기** 정리 함수는 동시에 실행됩니다. 정리 단계가 순서대로 실행되어야 한다면 하나의 정리 함수에 모아 두고 그 안에서 await하세요.

다음: [서비스](03-services.ko.md) — 플러그인이 기능을 공유하는 방법.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
