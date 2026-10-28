# 세 역할 기능 설계

[English](index.md) | [中文](index.zh.md) | 한국어

이 문서는 두 부분으로 구성됩니다. 세 역할 기능 패턴에 대한 개념 참조를 먼저 설명하고, 이어서 하나의 기능을 직접 만들어 보는 고급 자습서를 진행합니다. 시작하기 전에 [기본 플러그인 학습 경로](../basic/index.ko.md)와 [서비스 자습서](../framework/service.ko.md)를 완료하세요.

## 개념 참조

Bash 실행처럼 교체 가능한 제공자가 필요할 만큼 일반화된 기능은 Harness가 **Service Definition**, **Service Provider**, **Consumer**의 세 역할로 분리합니다. 역할이 독립적으로 진화하거나 교체되어야 할 때는 역할별로 패키지를 나누고, 그렇지 않으면 하나의 패키지가 둘 이상의 역할을 맡을 수 있습니다. 완전한 기능이 곧 seam이며, 개별 역할은 seam이 아닙니다.

## Bash 예제

Bash 실행 기능은 다음으로 구성됩니다:

- **Service Definition** (`dsh-shell`) — Cordis 서비스와 Bash 요청·결과 타입을 정의합니다
- **Service Provider** (`dsh-bash-local`) — 로컬 머신에서 명령을 실행합니다
- **Consumer** (`dsh-tool-bash`) — 이 기능을 모델이 호출할 수 있는 도구로 노출합니다

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  dsh-shell   │────▶│  dsh-bash-local  │     │ dsh-tool-bash│
│(definition) │     │    (provider)     │     │(consumer/tool)│
└─────────────┘     └──────────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
                    inject: ['shell']
```

## 분할의 이점

### 제공자 교체

하나의 Service Definition에 `cordis.yml`을 통해 선택되는 여러 제공자를 둘 수 있습니다:

```yaml
# Local execution
- name: '@deepseek-ai/dsh-bash-local'

# Replace this row with another package that provides the same service.
```

제공자가 바뀌어도 Service Definition과 도구는 그대로 유지됩니다.

### 독립적으로 진화

- 호출자가 계약에 의존하기 시작하면 Service Definition은 거의 바뀌지 않습니다.
- Service Provider는 성능과 보안을 독립적으로 개선할 수 있습니다.
- Consumer는 기능을 모델에 제시하는 방식을 바꿀 수 있습니다.

### 의존성 분리

- Service Provider는 Service Definition에 의존합니다.
- Consumer는 Service Definition에 의존합니다.
- Service Provider와 Consumer는 **서로 의존하지 않습니다**.

현재 내장 패밀리와 패키지 링크는 [기능 seam 참조](../../../capability-seams.ko.md)가 관리합니다.

## 자습서: 세 역할 기능 개발

### 1단계: Service Definition 작성

```ts ignore-check
// packages/my-cap/my-cap/src/index.ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    myCap: MyCapService
  }
}

export abstract class MyCapService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myCap')
  }

  /** Execute the capability. */
  abstract execute(request: MyCapRequest): Promise<MyCapResult>
}

export interface MyCapRequest {
  input: string
}

export interface MyCapResult {
  output: string
}
```

### 2단계: Service Provider 작성

```ts ignore-check
// packages/my-cap/my-cap-local/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { MyCapService, type MyCapRequest, type MyCapResult } from '@deepseek-ai/dsh-my-cap'

class MyCapLocal extends MyCapService {
  async execute(request: MyCapRequest): Promise<MyCapResult> {
    // Local provider behavior.
    return { output: request.input.toUpperCase() }
  }
}

export const name = 'my-cap-local'

export function apply(ctx: Context) {
  ctx.plugin(MyCapLocal)
}
```

### 3단계: Consumer 작성

```ts ignore-check
// packages/my-cap/tool-my-cap/src/index.ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-my-cap'
export const inject = ['tools', 'myCap']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_cap',
    description: 'Execute my capability.',
    parameters: {
      input: { type: 'string', required: true },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const result = await ctx.myCap.execute({ input: args.input })
      return result.output
    },
  }))
}
```

### cordis.yml에서 조합하기

```yaml
- name: '@deepseek-ai/dsh-my-cap-local'
- name: '@deepseek-ai/dsh-tool-my-cap'
```

## 설계 시 유의점

- **미리 분할하지 마세요** — 역할이 독립적으로 진화해야 할 때만 패키지를 분리합니다. 단순한 도구 플러그인에는 필요하지 않습니다.
- **Service Definition이 Request/Result 타입을 소유합니다** — Service Provider와 Consumer는 Service Definition 패키지에만 의존합니다.
- **명시적 > 암묵적** — `run()` 안에 `?? default` 식을 숨기는 대신 명시적인 `resolve(request): Spec` 단계에서 기본값을 결정합니다.

## 다음 단계

- [LLM 어댑터](./llm-adapter.ko.md) — LLM 제공자 구현
