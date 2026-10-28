# 7. 하네스 실전 연동

[English](07-into-the-harness.md) | [中文](07-into-the-harness.zh.md) | 한국어

이 장에서는 하네스의 `tools` 서비스에 모델이 호출할 수 있는 도구를 직접 등록하고, 실제 하네스 도구 파이프라인을 통해 실행해 보며, 실행 결과 이벤트를 관찰합니다. 별도의 API 키가 필요하지 않으며 실제 LLM 모델을 호출하지도 않습니다.

## 도구 플러그인

`tmp/cordis-tutorial`에서 `greet-tool.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',
    parameters: {
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))

  // Drive one call through the real execution pipeline, standing in for
  // the model. ToolCallId brands the correlation id a provider would issue.
  void (async () => {
    const result = await ctx.tools.execute({
      calls: [{
        type: 'tool-call', id: brandString<ToolCallId>('demo-1'),
        name: 'greet', arguments: JSON.stringify({ name: 'Cordis' }),
      }],
      signal: new AbortController().signal,
    })
    console.log('tool replied:', JSON.stringify(result.results[0]?.result.content))
  })()
}
```

여기에 사용된 모든 패턴은 앞선 장에서 학습한 내용입니다. `inject: ['tools']`([3장](03-services.ko.md))는 도구 레지스트리 서비스가 준비될 때까지 플러그인 로드를 대기시키며, `ctx.tools.register(...)`는 등록에 대한 정리(disposer) 함수를 플러그인 수명 주기에 바인딩하므로([2장](02-lifecycle-and-effects.ko.md)) 플러그인이 언로드될 때 도구 등록도 자동으로 해제됩니다. `defineTool`은 `parameters` 명세를 모델에 제공할 JSON Schema로 변환하고, `args`의 타입을 추론하며, `execute`가 실행되기 전에 모델이 전달한 인자를 자동으로 검증합니다. 도구는 `output.schema`에 선언된 표준 결과값을 반환하고, `output.render`는 네이티브 및 영속화 결과 텍스트를 생성합니다.

## 관찰자 플러그인

`tool-logger.ts`를 만듭니다. 하네스의 `tools/result` 이벤트를 통해 앱의 모든 도구 호출을 지켜보는 별도 플러그인입니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'tool-logger'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.on('tools/result', (exec, result) => {
    const text = result.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
    console.log(`[tool-logger] ${exec.name} -> ${text}`)
  })
}
```

`import type {} from '@deepseek-ai/dsh-tools'` 줄은 패키지의 선언 병합을 가져와 `'tools/result'`와 그 페이로드에 타입이 붙게 합니다. 4장의 `stats.ts` 임포트를 패키지 규모로 적용한 것과 같습니다.

## 조합하고 실행하기

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './tool-logger.ts'
- name: './greet-tool.ts'
```

`@deepseek-ai/dsh-tools`는 도구가 시스템 프롬프트에 스키마를 기여하므로 `systemPrompt` 서비스를 주입합니다. 그래서 조합에는 그 제공자도 나열합니다. 이것이 없으면 도구 플러그인은 [6장](06-composition-and-hmr.ko.md)에서 설명한 대로 PENDING에 머뭅니다.

```sh
node --import tsx ../../vendor/cordis/bin.js
```

```
[tool-logger] greet -> Hello, Cordis!
tool replied: [{"type":"text","text":"Hello, Cordis!"}]
```

로거가 먼저 실행되었습니다. `tools/result`는 결과 구체화의 일부로 발생하며, 이는 `execute`의 프로미스가 호출자에게 이행되기 전입니다. 두 플러그인은 서로의 존재를 모르지만, 레지스트리 서비스와 이벤트가 이들을 연결합니다.

## 여기서 완전한 에이전트로

실제 에이전트는 이 조합에 LLM 어댑터, 에이전트 루프, 영속성, 애플리케이션 진입점 플러그인을 더한 것입니다. [기본 프로필 계층](../../packages/bundle/base/cordis.patch.yml)과 [헤드리스 계층](../../packages/bundle/headless/cordis.patch.yml)을 비교해 보세요. 이제 그 항목들을 읽을 수 있습니다. `greet-tool.ts`는 작은 `--patch` 오버레이로 추가하면 됩니다.

다음으로 나아갈 곳:

- [도구 만들기](../user/develop/basic/tool.ko.md) — 프레젠테이션과 더 풍부한 스키마를 포함한 `defineTool` 활용법.
- [세 계층 기능 설계](../user/develop/practice/index.ko.md) — 하네스가 교체 가능한 기능을 구조화하는 방식.
- [하위 시스템 페이지](../subsystems/core.ko.md)의 생성된 `cordis-surface` 영역 — 주입하고 수신할 수 있는 모든 항목이 각자의 소유 페이지에 있습니다.
- [아키텍처](../architecture.ko.md) — 이 플러그인들이 속한 시스템 지도.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
