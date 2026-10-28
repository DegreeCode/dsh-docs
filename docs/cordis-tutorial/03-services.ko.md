# 3. 서비스

[English](03-services.md) | [中文](03-services.zh.md) | 한국어

**서비스**는 한 플러그인이 제공하고 다른 플러그인이 `ctx`를 통해 소비하는 이름 있는 기능입니다. 하네스에서 `ctx.tools`, `ctx.llm`, `ctx.agents`는 서비스입니다. 소비자는 제공자를 임포트하는 대신 `'tools'` 같은 기능 이름을 지정하므로, 소비자를 바꾸지 않고도 구성에서 제공자를 선택할 수 있습니다.

## 서비스 제공

`tmp/cordis-tutorial`에서 `greeter.ts`를 만듭니다:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'greeter')
  }

  greet(who: string) {
    return `Hello, ${who}!`
  }
}

export const name = 'greeter'

export function apply(ctx: Context) {
  ctx.plugin(GreeterService)
}
```

두 가지가 함께 동작합니다:

- **런타임**: `super(ctx, 'greeter')`는 인스턴스를 `greeter`라는 이름으로 등록합니다. 이후 어떤 플러그인이든 `ctx.greeter`로 접근할 수 있습니다. 이 등록은 효과이므로 제공자를 언로드하면 서비스가 제거됩니다.
- **컴파일 타임**: `declare module '@deepseek-ai/cordis'` 블록은 TypeScript 선언 병합입니다. `greeter`를 `Context` 인터페이스에 추가해 어디서든 `ctx.greeter`의 타입 검사가 통과하게 합니다. 코드는 생성되지 않으며, 이 블록이 없어도 런타임에서는 서비스가 동작하지만 소비자는 타입 안전성을 잃습니다.

`Service` 서브클래스 자체가 플러그인(1장의 클래스 형태)이므로 `ctx.plugin(GreeterService)`는 다른 플러그인과 똑같이 이를 마운트합니다.

## `inject`로 서비스 소비하기

`consumer.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  console.log(ctx.greeter.greet('world'))
}
```

`inject`는 이 플러그인이 필요로 하는 서비스를 나열합니다. Cordis는 나열된 모든 서비스가 존재할 때까지 플러그인을 PENDING 상태로 유지하므로, `apply` 안에서는 `ctx.greeter`가 준비되어 있음이 보장됩니다. `cordis.yml`에서의 로드 순서는 중요하지 않습니다. 파일 순서가 아니라 의존성이 플러그인의 시작 시점을 결정합니다.

조합해 실행합니다:

```yaml
- name: './greeter.ts'
- name: './consumer.ts'
```

```
Hello, world!
```

`cordis.yml`에서 두 줄의 순서를 바꾸고 다시 실행해 보세요. 출력은 같습니다. `./greeter.ts`를 완전히 제거해 보면 소비자는 PENDING에 머물며 아무것도 출력하지 않습니다. 크래시도, 부분 실행도 없습니다. PENDING 상태의 fiber는 Node 이벤트 루프도 붙잡지 않으므로, 다른 실행 중인 것이 없는 조합은 조용히 종료 코드 0으로 끝납니다. 이 상태를 진단하는 방법은 [6장](06-composition-and-hmr.ko.md)에서 보여 줍니다.

## 의존성은 로드 후에도 추적됩니다

`inject`는 부팅 시 한 번만 확인하는 검사가 아닙니다. 앱이 실행 중일 때 필수 서비스가 사라지면(그 제공자가 언로드되거나 핫 교체된 경우) 의존하는 모든 플러그인도 언로드되고, 서비스가 돌아오면 다시 로드됩니다. 효과([2장](02-lifecycle-and-effects.ko.md))와 결합되어, 실행 중인 소비자가 사용할 수 없는 서비스에 대한 참조를 유지하지 않도록 합니다. 의존성이 사라지면 소비자 자신의 등록도 되돌려집니다.

구성에서 서비스 교체가 동작하는 이유도 같습니다. `dsh-bash-local` 항목을 언로드하고 다른 `shell` 제공자를 마운트하면, `'shell'`을 주입하는 모든 플러그인이 새 구현을 대상으로 깔끔하게 다시 시작합니다.

## 선택적 의존성

`inject`는 반드시 필요한 요구 사항을 위한 것입니다. 플러그인이 없어도 동작할 수 있는 기능이라면 `inject`를 생략하고 사용 지점에서 확인하세요:

```ts ignore-check
export function apply(ctx: Context) {
  // undefined when no provider is loaded; the plugin still runs.
  const greeter = ctx.get('greeter')
  console.log(greeter?.greet('maybe') ?? 'no greeter available')
}
```

## 이름 규칙

서비스 이름은 애플리케이션 전체에서 단일 전역(flat) 네임스페이스에 존재합니다. 직접 정의하는 서비스에는 구별 가능한 고유 접두사를 붙이세요(`tools`, `llm` 등 일반적인 이름은 하네스 코어 서비스가 선점하고 있습니다). [하위 시스템 페이지](../subsystems/core.ko.md)의 생성된 `cordis-surface` 영역에 하네스가 등록하는 모든 이름이 나열됩니다.

다음: [이벤트](04-events.ko.md) — 공유 서비스 없이 통신하기.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
