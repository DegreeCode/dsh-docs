# 도구 만들기

[English](tool.md) | [中文](tool.zh.md) | 한국어

이 자습서에서는 웹 UI에 `greet` 도구를 추가합니다. 먼저 [첫 플러그인](./index.ko.md)을 완료하고 해당 `scratch-plugin` 디렉터리를 유지하세요.

## 도구 플러그인 만들기

`scratch-plugin/src/my-plugin.ts`를 다음으로 바꿉니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet someone by name.',
    parameters: {
      name: { type: 'string', required: true, description: 'The name to greet' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return `Hello, ${args.name}!`
    },
  }))
}
```

`inject` 선언은 Cordis가 도구 레지스트리 서비스(`tools`)가 준비될 때까지 대기하도록 합니다. `defineTool`은 `parameters` 스키마로부터 `args` 타입을 추론하고 입력값을 자동으로 검증하며, `execute`는 `output.schema`에 선언된 표준 결과값을 반환하고 `output.render`는 그 값을 모델이 참조하는 텍스트 콘텐츠로 변환합니다.

## 도구 실행 및 호출

개발 서버가 실행 중이 아니라면 다음 명령으로 시작합니다:

```sh
pnpm dsh web --patch ./scratch-plugin/cordis.yml
```

`http://127.0.0.1:3080`을 열고 세션에 `Use the greet tool to greet Ada.`라고 요청합니다. 모델이 `greet` 도구를 호출하고 그 실행 결과로 `Hello, Ada!`를 반환받는 것을 확인할 수 있습니다.

## 다음 단계

- [플러그인 구성](./config.ko.md) — 인사말 문구를 설정으로 변경 가능하게 만듭니다.
- [도구 작성 참조](../../../cookbook/adding-a-tool.ko.md) — 중첩 스키마, 표준 반환값, 백그라운드 작업, 정책 훅, PTC 모드, UI 카드 등의 고급 기능을 살펴봅니다.
- [기능 계층화](../practice/index.ko.md) — 교체 가능한 기능을 Service Definition, Service Provider, Consumer 패키지로 분할합니다.
