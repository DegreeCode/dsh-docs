# LLM 어댑터

[English](llm-adapter.md) | [中文](llm-adapter.zh.md) | 한국어

이 가이드에서는 새 LLM 제공자를 Harness에 연결합니다.

## 개요

LLM 어댑터는 `LlmAdapter`를 확장해 `stream()`을 구현하고, Harness의 제공자 중립 요청을 제공자 API 호출로 변환하며 응답을 다시 Harness 청크로 변환합니다.

## 최소 구현

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  private apiKey: string

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. Convert options.messages to the provider format.
    // 2. Call the streaming API.
    // 3. Convert the response into StreamChunk values.
  }
}

export interface Config {
  apiKey: string
  providers: string[]
}

export const Config: Schema<Config> = Schema.object({
  apiKey: Schema.string().required(),
  providers: Schema.array(Schema.string()).required(),
})

export const name = 'my-llm-adapter'
export const inject = ['llm']

export function apply(ctx: Context, config: Config) {
  const adapter = new MyAdapter(config.apiKey)
  ctx.llm.registerAdapter(config.providers, adapter)
}
```

## StreamChunk 프로토콜

`stream()`은 다음 프로토콜로 청크를 생성합니다:

```ts
import { brandString } from '@deepseek-ai/dsh-brand'
import type { StreamChunk, ToolCallId } from '@deepseek-ai/dsh-llm'

async function* exampleChunks(): AsyncIterable<StreamChunk> {
  // 1. Start each content block with block-start.
  yield { type: 'block-start', index: 0, blockType: 'text' }

  // 2. Stream text through text-delta.
  yield { type: 'text-delta', index: 0, text: 'Hello' }
  yield { type: 'text-delta', index: 0, text: ' world' }

  // 3. End each content block with block-end and the complete block.
  yield {
    type: 'block-end',
    index: 0,
    block: { type: 'text', text: 'Hello world' },
  }

  // 4. Tool-call block.
  yield { type: 'block-start', index: 1, blockType: 'tool-call' }
  yield {
    type: 'tool-call-delta',
    index: 1,
    id: brandString<ToolCallId>('call-123'),
    name: 'bash',
    argumentsDelta: '{"command":"ls"}',
  }
  yield {
    type: 'block-end',
    index: 1,
    block: {
      type: 'tool-call',
      id: brandString<ToolCallId>('call-123'),
      name: 'bash',
      arguments: '{"command":"ls"}',
    },
  }

  // 5. Token usage.
  yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } }

  // 6. Finish reason.
  yield { type: 'finish', reason: { kind: 'stop' } }
  // Alternatively, { kind: 'tool-calls' } requests tool execution.
}
```

### 핵심 규칙

- 모든 `block-start`에는 대응하는 `block-end`가 있어야 합니다.
- `index`는 0부터 증가하며 콘텐츠 블록의 순서를 식별합니다.
- `tool-call-delta`는 `argumentsDelta`에 원시 JSON 텍스트를 담으며, 한 번에 전부 보내거나 여러 청크에 나누어 보낼 수 있습니다.
- `finish`는 마지막 청크입니다.
- `finish` 전에 `usage`를 내보냅니다.

## GenerateOptions

`stream()`은 내보낸 `GenerateOptions` 타입을 받습니다. 이 타입에는 모델, 어댑터가 소유한 추론 강도 id, 대화 기록, 시스템 프롬프트, 도구 스키마, 생성 매개변수, 중지 시퀀스, 중단 신호가 포함되며, `@deepseek-ai/dsh-llm`이 내보내는 TypeScript 타입을 기준으로 삼습니다. 지원하는 필드는 제공자 API로 매핑하세요. 제공자가 어떤 필드를 지원할 수 없다면 조용히 버리지 말고 안정적인 code를 가진 `LlmError`를 던지세요.

정확한 제공자·모델 식별자와 선택적 `context`·`reasoning` 메타데이터를 한 번의 조회로 반환하려면 `resolveModel(provider, model, signal?)`을 재정의하세요. 추론 메타데이터에는 순서가 있는 불투명 id와 표시 이름, 그리고 구성된 기본값(선택)이 들어 있습니다. 상위 기능 API가 `off`를 반환하는 경우를 포함해 어댑터가 제공하는 권위 있는 선택 가능 목록을 유지하고, 그 값을 코어 enum으로 승격하지 마세요. 비동기 조회에서는 선택적 신호를 준수해 취소와 정리가 완전히 끝나도록 하세요. 서비스는 집계 결과를 검증하고 `stream()` 전에 지원되지 않는 명시적 추론 강도를 거부합니다. `reasoning`을 생략하면 그 모델에는 선택 가능한 추론 강도 기능이 없다는 뜻입니다.

## 어댑터 등록

```ts ignore-check
ctx.llm.registerAdapter(['my-provider'], adapter)
```

첫 번째 인수는 어댑터가 처리하는 제공자 라우트 목록입니다. `GenerateOptions.provider`가 등록된 어댑터를 선택하고, `GenerateOptions.model`은 수명 주기 등록 없이 어댑터가 소유한 모델 id를 전달합니다. 어댑터가 선택기에 모델 선택지를 알릴 수 있다면 `listModels()`를 재정의하세요.

## cordis.yml에서 사용

```yaml
- id: my-llm
  name: './src/my-llm-adapter.ts'
  config:
    apiKey: !!js process.env.MY_API_KEY
    providers:
      - my-provider

- id: agent-loop
  name: '@deepseek-ai/dsh-agent-loop'
  config:
    agents:
      - id: main
        provider: my-provider
        model: my-model-v1
```

## 참조 구현

저장소에는 완전한 구현이 들어 있습니다:

- `packages/llm/llm-deepseek/` — Messages API를 사용하는 DeepSeek 어댑터
- `packages/llm/llm-pi-ai/` — 다른 API 형식을 사용하는 Pi AI 어댑터

배포된 두 어댑터를 비교하면 같은 하네스(harness) 계약이 서로 다른 제공자 SDK 위에서 어떻게 구현되는지 확인할 수 있습니다.

## 오류 처리

어댑터는 전송과 프로토콜 실패를 안정적인 code가 있는 `LlmError` 값으로 던집니다. 에이전트 루프는 진단과 정책을 위해 오류와 code를 보존하며, 일반 `Error`를 자동으로 변환하지는 않습니다. 모든 제공자 HTTP 요청은 `attributionHeaders()`를 병합하고 `options.signal`을 전달해야 합니다.

```ts
import {
  attributionHeaders,
  LlmAdapter,
  LlmError,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

class HttpAdapter extends LlmAdapter {
  constructor(private readonly endpoint: string) {
    super()
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify({ model: options.model, messages: options.messages }),
      ...options.signal ? { signal: options.signal } : {},
    })
    if (!response.ok) {
      throw new LlmError(`Provider API error: ${response.status}`, 'PROVIDER_HTTP_ERROR')
    }
    // A real adapter parses the response and emits the complete chunk sequence.
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
```
