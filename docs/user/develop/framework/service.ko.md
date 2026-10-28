# 서비스와 의존성

[English](service.md) | [中文](service.zh.md) | 한국어

서비스는 한 플러그인이 다른 플러그인에 공개하는 기능입니다. `inject`는 플러그인이 필요로 하는 서비스를 선언합니다.

## 서비스란 무엇인가요?

Harness에서 `tools`, `llm`, `agents`는 서비스입니다. 각각 `ctx`에 마운트되는 이름 있는 기능입니다:

```ts ignore-check
ctx.tools    // ToolRuntime service
ctx.llm      // LLM service
ctx.agents   // Agent service
```

어떤 플러그인이든 다른 플러그인이 사용할 서비스를 제공할 수 있습니다.

## 서비스 사용

기존 서비스를 사용하려면 `inject`를 선언합니다:

```ts ignore-check
export const inject = ['tools']

export function apply(ctx: Context) {
  // ctx.tools exists and is ready here.
  ctx.tools.register(/* ... */)
}
```

`apply`가 실행될 때 `inject`로 선언한 서비스는 모두 준비된 상태입니다. 서비스가 준비되지 않았으면 플러그인은 실행되지 않고 기다립니다.

## 서비스 제공

### Service 확장

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

export default class MetricsService extends Service {
  static inject = ['llm']  // A service may depend on other services.

  constructor(ctx: Context) {
    super(ctx, 'metrics')  // 'metrics' is the service name.
  }

  // Public service method.
  record(event: string, value: number) {
    // ...
  }
}
```

이 플러그인을 로드한 뒤에는 소비자가 `ctx.metrics`로 서비스에 접근합니다:

```ts ignore-check
export const inject = ['metrics']

export function apply(ctx: Context) {
  ctx.metrics.record('tool_call', 1)
}
```

### 타입 선언

TypeScript 선언 병합으로 `ctx.metrics`에 타입을 부여합니다:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    metrics: MetricsService
  }
}

export default class MetricsService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'metrics')
  }

  record(event: string, value: number) { /* ... */ }
}
```

## 의존성 동작

### 필수 의존성과 선택적 의존성

```ts ignore-check
// Required: the plugin does not load while the service is absent.
export const inject = ['tools']

// Optional: omit inject and query with ctx.get() at the use site.
export function apply(ctx: Context) {
  const metrics = ctx.get('metrics')
  metrics?.record('plugin_loaded', 1)
}
```

### 서비스가 사라질 때

애플리케이션이 실행 중일 때 필수 서비스가 사라지면, 예를 들어 해당 제공자가 언로드되면:

1. 의존하는 플러그인이 자동으로 dispose됩니다.
2. 서비스가 돌아오면 다시 로드됩니다.

이렇게 하면 플러그인이 더 이상 존재하지 않는 서비스를 호출하는 일을 막을 수 있습니다.

## 서비스 격리

`cordis.yml`은 서비스를 격리해 서로 다른 플러그인 그룹이 같은 서비스의 서로 다른 인스턴스를 보도록 할 수 있습니다:

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 5000
    - name: './src/plugin-a.ts'

- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate:
    shell: true
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config:
        timeoutMs: 60000
    - name: './src/plugin-b.ts'
```

`plugin-a`와 `plugin-b`는 각각 자기 그룹의 Bash 인스턴스를 보며 그룹 간 영향은 없습니다.

## Harness 내장 서비스

저장소는 각 서비스의 이름, 공개 메서드, 소스 위치를 [하위 시스템 페이지](../../../subsystems/core.ko.md)에 생성합니다. 플러그인을 개발할 때는 이 생성 영역과 서비스의 TypeScript 인터페이스를 기준으로 삼고, 별도의 정적 목록은 유지하지 마세요.

## 다음 단계

- [이벤트 시스템](./events.ko.md) — 강한 결합 없이 플러그인 간에 통신합니다
- [기능 계층화](../practice/index.ko.md) — 서비스를 기능 인터페이스로 사용합니다
