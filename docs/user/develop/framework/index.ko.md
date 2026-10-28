# 플러그인과 수명 주기

[English](index.md) | [中文](index.zh.md) | 한국어

이 문서는 Cordis 플러그인 모델과 수명 주기 상태 머신을 설명합니다.

## Fiber 상태 머신

로드된 모든 플러그인은 다음 상태를 갖는 **Fiber** 범위를 소유합니다:

```
PENDING → LOADING → ACTIVE
                 ↘ FAILED
ACTIVE → UNLOADING → DISPOSED
```

| 상태 | 의미 |
|------|------|
| PENDING | 선언되었지만 필수 의존성이 준비되지 않음 |
| LOADING | 의존성이 준비되어 `apply`가 실행 중 |
| ACTIVE | 플러그인이 실행 중 |
| FAILED | `apply`가 오류를 던짐 |
| UNLOADING | 플러그인이 언로드 중이며 리소스를 정리하는 중 |
| DISPOSED | 플러그인이 완전히 언로드됨 |

## 의존성 기반 로딩

`inject`가 있는 플러그인은 로드하기 전에 필요한 모든 서비스를 기다립니다:

```ts ignore-check
export const inject = ['tools', 'llm']

export function apply(ctx: Context) {
  // ctx.tools and ctx.llm are ready here.
}
```

필수 서비스가 사라지면(예: 제공자 교체 중) 플러그인은 자동으로 언로드되고(ACTIVE → DISPOSED), 서비스가 돌아오면 다시 로드됩니다.

## 자동 정리

`ctx`를 통해 수행한 모든 등록은 플러그인이 언로드될 때 취소됩니다:

```ts ignore-check
export function apply(ctx: Context) {
  // Event listener: removed automatically on unload.
  ctx.on('some-event', handler)

  // Custom resource: the returned disposer runs on unload.
  ctx.effect(() => {
    const connection = createConnection()
    return () => connection.close()
  })
}
```

프레임워크는 다음 작업을 모두 추적하고 정리합니다:
- `ctx.on(event, handler)` — 이벤트 리스너
- `ctx.tools.register(tool)` — 도구 등록
- `ctx.llm.registerAdapter(names, adapter)` — LLM 어댑터 등록
- `ctx.effect(() => cleanup)` — 사용자 지정 리소스

언로드 시 정리 함수 호출은 등록의 역순으로 시작되지만, 여러 비동기 정리 함수는 동시에 실행되므로 순차적 완료를 보장하지 않습니다. 순서에 의존하는 정리는 하나의 `ctx.effect()`에서 반환한 정리 함수에 모아 두고 그 안에서 단계를 순서대로 await하세요.

## 중첩 컨텍스트

`ctx.plugin()`은 부모 컨텍스트를 상속하지만 수명 주기는 독립적인 자식 Fiber를 만듭니다:

```ts ignore-check
export function apply(ctx: Context) {
  // Register a child plugin.
  ctx.plugin(childPlugin)

  // The child has its own Fiber and unloads with its parent.
}
```

## dispose 시맨틱

플러그인 인스턴스를 조기에 중지하려면:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare const ctx: Context
declare function myPlugin(ctx: Context): void

const fiber = ctx.plugin(myPlugin)

// Dispose it manually later.
await fiber.dispose()
```

`dispose`는 다음을 보장합니다:
1. 플러그인이 소유한 모든 등록이 제거됩니다.
2. 자식 플러그인이 재귀적으로 언로드됩니다.
3. 반환된 프로미스는 모든 비동기 정리가 끝난 뒤 이행됩니다.

## 핫 교체(HMR)

`cordis.yml`에서 `@deepseek-ai/dsh-hmr`를 로드한 상태에서 플러그인 소스 파일을 편집하면 다음이 트리거됩니다:

1. 이전 플러그인을 언로드하고 등록을 정리합니다.
2. 새 코드를 로드합니다.
3. 새 `apply`를 실행합니다.

플러그인 등록은 스스로 정리되므로 핫 교체 시 이전 인스턴스의 등록이 남지 않습니다.

## 예제 수명 주기

```ts ignore-check
export function apply(ctx: Context) {
  console.log('plugin loading')

  ctx.effect(() => {
    console.log('effect registered')
    return () => console.log('effect cleaned up')
  })
}
```

로드하면 다음이 출력됩니다:
```
plugin loading
effect registered
```

언로드하면 다음이 출력됩니다:
```
effect cleaned up
```

## 다음 단계

- [서비스와 의존성](./service.ko.md) — 다른 플러그인에 기능 노출하기
- [이벤트 시스템](./events.ko.md) — 플러그인 간 통신
- [Cordis 자습서](../../../cordis-tutorial/index.ko.md) — Cordis 런타임을 대상으로 같은 수명 주기, 서비스, 이벤트를 단계별로 구현합니다
