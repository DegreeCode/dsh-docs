# 4. 이벤트

[English](04-events.md) | [中文](04-events.zh.md) | 한국어

서비스는 직접 호출을 지원하고, **이벤트**는 어떤 플러그인이 듣고 있는지 모르는 상태에서 플러그인이 무언가를 알릴 수 있게 합니다. 하네스는 도구 결과, 모델 요청, 승인 결정 같은 상호 작용에 이벤트를 사용합니다.

## 선언하고, 발생시키고, 수신하기

`tmp/cordis-tutorial`에서 `stats.ts`를 만듭니다. 무언가를 세고 변경마다 알리는 서비스입니다:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    stats: StatsService
  }
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

export class StatsService extends Service {
  private counts = new Map<string, number>()

  constructor(ctx: Context) {
    super(ctx, 'stats')
  }

  bump(name: string) {
    const next = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, next)
    this.ctx.emit('stats/report', name, next)
  }
}

export const name = 'stats'

export function apply(ctx: Context) {
  ctx.plugin(StatsService)
}
```

`interface Events` 병합은 3장의 `interface Context` 병합에 대응하는 이벤트 시스템 버전입니다. 이벤트 이름과 리스너 시그니처를 선언하므로 `ctx.emit`과 `ctx.on`이 완전한 타입 검사를 받습니다. `namespace/action` 명명 규칙은 평면 이벤트 네임스페이스의 가독성을 유지합니다.

`reporter.ts`를 만듭니다:

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from './stats.ts'

export const name = 'reporter'
export const inject = ['stats']

export function apply(ctx: Context) {
  ctx.on('stats/report', (name, count) => {
    console.log(`[stats] ${name} -> ${count}`)
  })
  ctx.stats.bump('tool_call')
  ctx.stats.bump('tool_call')
  ctx.stats.bump('prompt')
}
```

`import type {} from './stats.ts'` 줄은 런타임에 아무것도 가져오지 않습니다. TypeScript가 선언 병합을 인식하도록 하기 위해 존재합니다. 조합해 실행합니다:

```yaml
- name: './stats.ts'
- name: './reporter.ts'
```

```
[stats] tool_call -> 1
[stats] tool_call -> 2
[stats] prompt -> 1
```

`ctx.on()`은 효과이므로 리스너는 플러그인과 함께 사라집니다. 수동으로 `removeListener`를 관리할 일이 없습니다.

## 디스패치 모드

`emit`은 다섯 가지 디스패치 모드 중 하나입니다. 이벤트가 어떤 모드를 쓰는지는 계약의 일부이며, 리스너가 값을 반환할 수 있는지, 동시에 실행되는지, 서로 단락시킬 수 있는지를 결정합니다:

| 모드 | 호출 | 의미 |
|---|---|---|
| emit | `ctx.emit(name, ...args)` | 동기 브로드캐스트이며, 반환된 프로미스와 값은 await하거나 수집하지 않습니다. |
| parallel | `await ctx.parallel(name, ...args)` | 모든 리스너가 동시에 실행되고 함께 await됩니다. |
| serial | `await ctx.serial(name, ...args)` | 리스너가 순서대로 실행되고 await됩니다. `null`/`false`/`undefined`가 아닌 첫 반환값이 채택되어 나머지를 중단합니다. |
| bail | `ctx.bail(name, ...args)` | serial의 동기 버전입니다. |
| waterfall | `ctx.waterfall(name, ...args, next)` | 어라운드 미들웨어입니다. 아래를 참고하세요. |

모든 하네스 이벤트는 자신을 소유한 [하위 시스템 페이지](../subsystems/core.ko.md)의 생성된 참조에 모드를 문서화합니다.

## 워터폴: 변환 또는 단락

워터폴은 가로채기를 가능하게 하는 모드입니다. 각 리스너는 인수와 함께 `next()` 연속 함수를 받습니다. `next()`가 반환하는 값을 변환할 수도 있고, `next()`를 호출하지 않고 반환해 체인의 나머지를 단락시킬 수도 있습니다. Cordis 문서에서는 이를 거부권(veto)이라고 부릅니다. `waterfall-demo.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}

export const name = 'waterfall-demo'

export function apply(ctx: Context) {
  // Listener 1: wrap the downstream result.
  ctx.on('demo/transform', async (input, next) => {
    const downstream = await next()
    return downstream.toUpperCase()
  })

  // Listener 2: short-circuit when it owns the decision.
  ctx.on('demo/transform', async (input, next) => {
    if (input.includes('blocked')) return '** blocked **'
    return next()
  })

  void (async () => {
    console.log(await ctx.waterfall('demo/transform', 'hello', async () => 'hello'))
    console.log(await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words'))
  })()
}
```

`cordis.yml`이 이 파일만 가리키게 하고 실행합니다:

```
HELLO
** BLOCKED **
```

두 번째 출력을 따라가 봅니다. 리스너 1이 먼저 실행되어 `next()`를 호출하고, 그 호출이 리스너 2를 실행합니다. 리스너 2는 `blocked`를 보고 `next()`를 호출하지 않은 채 반환하므로 가장 안쪽 기본값(`ctx.waterfall`에 전달한 함수)은 실행되지 않으며, 리스너 1이 돌아오는 길에 대체 메시지를 대문자로 바꿉니다.

반드시 지켜야 하는 규칙은 다음과 같습니다. **단순 관찰이나 로깅만 수행하는 워터폴 리스너는 반드시 `next()`를 호출해야 합니다.** `next()`를 호출하지 않고 반환하면 의도적인 단락(short-circuit)으로 간주됩니다. 로깅 리스너에서 실수로 `next()` 호출을 누락하면 이후 모든 다운스트림의 기본 실행이 조용히 차단됩니다. 이는 이 저장소의 엄격한 상시 규칙입니다([워터폴 시맨틱](../cordis-primer.ko.md#cordis-워터폴-시맨틱)).

하네스는 협력하는 플러그인이 감싸거나 응답할 수 있는 결정에 워터폴을 사용합니다. [`agent/pre-step`](../subsystems/core.ko.md#agentpre-step--waterfall)은 플러그인이 제안된 단계를 거부하거나 입력을 교체할 수 있게 하고, [`approval/request`](../subsystems/approval.ko.md#approvalrequest--waterfall)는 사용자 대신 정책이 응답할 수 있게 합니다.

다음: [구성](05-config.ko.md) — `cordis.yml`의 플러그인 옵션.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
