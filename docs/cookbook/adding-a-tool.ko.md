# 도구 작성 참조

[English](adding-a-tool.md) | [中文](adding-a-tool.zh.md) | 한국어

모델 대상 도구가 충족해야 하는 계약을 정리한 참조 문서입니다. 단계별로 첫 도구를 만들어 보려면 [도구 만들기](../user/develop/basic/tool.ko.md)를 먼저 확인하세요. `packages/shell/tool-bash` 패키지가 3패키지 구조로 구현된 프로덕션 수준의 대표적인 예제입니다.

## 최소 구현 형태

```ts
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',          // what the model sees
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' },                     // optional by default
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // args is TYPED from the schema: { path: string; limit?: number }
      // exec carries immutable identity + token; signal is the operational field
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
    },
  }))
}
```

등록은 effect 기반으로 동작합니다. 따라서 플러그인 fiber가 정리(dispose)되면 도구 등록도 자동으로 해제됩니다. 정의된 스키마는 시스템 프롬프트 조립 단계로 자동 반영됩니다.

## execute() 계약 규칙

- **인자(arguments)는 사전에 자동으로 검증됩니다.** `defineTool`은 `execute`가 실행되기 전에 모델이 생성한 `arguments`를 통합 `ParameterSchemaSpec`에 맞춰 자동으로 검증합니다(타입, 필수 키, 리터럴 제약, 1개 선택 유니언, 중첩 값 등). 따라서 `execute` 함수 내부에서 인자는 `InferArgs` 타입과 완벽히 일치합니다. 명시적인 객체 노드는 `additionalProperties: true | false`를 선언하며, 암묵적인 파라미터 루트는 열린(open) 상태로 유지됩니다. 비어 있지 않은 문자열, 양수, 필드 간 교차 검증 등 DSL로 표현할 수 없는 추가 제약 조건은 코드 내에서 직접 검사해야 합니다. 원시(raw) JSON Schema로 직접 등록한 도구는 입력 검증을 자체적으로 구현해야 합니다.
- **등록 시 정의는 읽기 전용으로 대여됩니다.** 동일 프로세스 내의 타입 기여는 직렬화 경계가 아니므로, 등록 후에 스키마를 동적으로 변경하거나 콜백 함수를 교체해서는 안 됩니다. `schemas()`는 모델에 노출되는 명시적 프로젝션만 생성합니다. 도구를 핫 스왑(교체)하려면 해당 effect를 폐기(dispose)하고 대체할 도구를 새로 등록하세요. 콜백 클로저 내부의 가변 상태는 일반적인 플러그인 상태로 유지됩니다.
- **실행 식별 정보(identity)는 안전하게 보호됩니다.** 레지스트리는 `arguments`를 1회의 재귀 탐색을 통해 완전히 독립적인 무손실 JSON으로 구체화하고, 정책 검사가 시작되기 전에 해당 값을 동결(freeze)한 뒤 불투명한 `exec.token`을 발급합니다. `callId`, `name`, `arguments`, `agent`, `token`, 호출자가 소유하는 필수 `signal`, 선택적 상위 전송 토큰인 `parent`는 디스패치 전 과정에서 불변으로 유지됩니다. `parent`는 식별 전용 필드이며 상위의 라이브 실행 객체를 노출하지 않습니다. `args`는 읽기 전용 입력값으로 취급해야 합니다. 디스패치를 감싸는 래퍼 미들웨어만 가변 뷰를 전달받으며, 래퍼는 실행 마감 기한을 설정하기 위해 필수 `exec.signal`을 일시적으로 교체했다가 복원할 수는 있지만 제거할 수는 없습니다.
- **단 하나의 표준(canonical) JSON 값을 선언하고 반환해야 합니다.** `output.schema`는 `ValueSchemaSpec`을 사용하며 객체, 배열, 스칼라, null 루트를 가질 수 있습니다. `execute`는 타입 추론된 결과값만 반환해야 하며, 레지스트리가 이를 무손실 JSON으로 스냅샷하고 검증 및 동결한 후 `output.render(args, value)`에 넘겨줍니다. `execute` 본문에서 직접 콘텐츠 블록을 반환하거나, 호출자가 ID나 필드를 얻기 위해 자연어 텍스트를 파싱하도록 구현해서는 안 됩니다.
- **예외가 발생(throw)하거나 유효하지 않은 값이 반환되면 `isError`로 처리됩니다.** 레지스트리는 발생한 예외를 포착하며, 옵저버가 실행되기 전에 스키마 검증 실패, 렌더러 오류, 메타데이터 투영 오류, 무손실 JSON 변환 실패 등을 모두 격리합니다. 인프라 수준의 오류가 발생하면 예외를 던지세요(throw). 프로세스 비정상 종료(non-zero exit)와 같이 이상적이지 않은 상태라 하더라도, 네이티브 렌더러가 상태를 설명할 수 있는 도메인 수준의 성공적인 실행 결과라면 표준 반환값으로 표현해야 합니다.
- **`exec.signal`을 반드시 준수해야 합니다.** 취소 신호가 전달되면 현재 진행 중인 비동기 작업을 즉시 중단하세요.
- **`presentationMeta`로 영속 UI 카드 데이터를 투영할 수 있습니다(선택 사항).** `output.presentationMeta(args, value)`는 동일한 표준 반환값으로부터 재생 가능한 JSON 데이터를 파생합니다. 코어는 이를 `tool/result`에 영속화하여 `presentResult`에 전달하므로, 결과 시점의 사실(`write`/`edit`가 적용한 변경 hunk 등)이 필요한 카드는 표준 반환값을 그대로 저장하지 않고도 세션 재생 시 완벽하게 복원됩니다. 중첩된 Code 디스패치에는 UI 카드가 없으므로 투영기 실행을 건너뜁니다.
- **비동기 알림에는 `exec.agent`를 사용합니다.** `agent.inject({ content, source: { kind: 'my-plugin' } })`는 다음 모델 요청이 참조할 영속 컨텍스트를 추가합니다. 이는 에이전트를 깨우는(wake-up) 신호가 아니므로(유휴 상태의 에이전트는 그대로 유휴 상태를 유지합니다), 해당 `kind`를 플러그인의 [`MessageSourceMap`](../subsystems/llm-streaming.ko.md#콘텐츠-블록과-메시지)에 선언해야 합니다. 세션 형식 V4는 메시지 수락 시 더 이상 사용되지 않는 구형 `{ kind: 'plugin', plugin: '<name>' }` 래퍼를 거부합니다. 에이전트가 이미 폐기(disposed)되었을 수 있으므로 try/catch로 예외에 대비하세요.

## 장기 실행 작업 (Background Jobs)

`run_in_background` 플래그는 생산자 구성으로 제어한 뒤 `ctx.jobs.start({ kind, label, owner: exec.agent, run })`을 통해 등록합니다. 레지스트리는 생산자 본문이 실행되기 전에 이미 취소된 호출을 거부하며, 런타임은 `run()`이 작업을 시작하기 전에 소유권과 작업 컨트롤러의 가용성을 검증한 후 ID, 세션 펜스, 범용 제어 도구, 알림, 소유자 정리 루틴을 제공합니다. 백그라운드 작업이 성공적으로 시작되면 `{ kind: 'background', jobId }`와 같은 타입 안전한 표준 핸들을 반환합니다. 네이티브 렌더러는 `started background job bash-1`과 같은 사용자 안내용 텍스트를 표시할 수 있지만, PTC 모드는 절대 이러한 텍스트를 파싱하여 ID를 추출해서는 안 됩니다.

명세는 동기식 `cancel`, 리소스 정리 후 완료되는 비거부형 `done`, 그리고 레지스트리가 작업의 출력 링 버퍼로 밀어넣는(pump) 풀 방식 `output` 소스 또는 `JobHandle`을 통한 푸시 방식을 제공합니다. `dsh-tool-jobs`는 해당 링 버퍼에서 모델이 읽을 수 있는 콘텐츠를 렌더링합니다. 사전에 취소된 호출은 성공 출력 스키마를 만족할 유효한 작업 ID가 존재할 수 없으므로 실패로 처리됩니다. `ctx.jobs.start()`가 ID를 발행한 후에는 `exec.signal` 대신 작업 자체의 취소 신호를 사용해야 합니다. 이후 외부 호출이 취소되더라도 호출 대기가 종료될 뿐 이미 발행된 백그라운드 작업이 강제 종료되지는 않으며, 작업의 수명은 `job_kill`, 소유자 폐기, 서비스 종료에 의해 제어됩니다. 반면 포그라운드 작업은 `exec.signal`에 계속 바인딩됩니다. 자세한 내용은 [백그라운드 작업 런타임 참조](../../packages/jobs/jobs/README.md)와 스트림 생산자 예제인 `dsh-tool-bash`를 참고하세요.

<a id="실행-정책과-관찰"></a>
## 실행 정책과 모니터링

배포 정책 로직은 도구 내부에 직접 구현하지 않는 것이 좋습니다. 확장 가능한 허용/거부/확인(allow/deny/ask) 정책은 `tools/pre-execute`([권한 게이트 예제](extension-cookbook.ko.md#훅-플러그인권한-게이트-예제))를 활용하고, 이후 리스너가 되돌릴 수 없는 최종 단조 거부(monotonic deny)에는 `ctx.tools.guard()`를 사용하세요. 실행 디스패치를 제한 시간(타임아웃), 재시도, 메트릭 수집 등으로 감싸려면 `tools/execute`를 사용하고, 표시 콘텐츠나 반환값을 수정하거나 결과를 차단하고 모델 대상 컨텍스트를 첨부하려면 `tools/post-execute`를, 불변의 표준 결과값을 관찰하려면 `tools/result`를 사용하세요. 콘텐츠 교체는 `value`에 대한 프로그래밍 방식 접근을 유지하지만, 기밀성 정책은 값을 완전히 차단하거나 대체할 수 있습니다. 샌드박싱 로직 역시 도구의 실행기 내부에서 수행될 수 있으며, 각 확장 지점의 입력 인자, 실행 순서, 반환값, 실패 처리 동작은 [`dsh-tools` README](../../packages/core/tools/README.md#extension-points)에 정의되어 있습니다.

## PTC 모드 지원

[PTC 모드](../../packages/core/tools/README.md)에서는 등록된 모든 가시적 도구를 추가 작업 없이 `await tools.<name>(args)` 형태로 직접 호출할 수 있습니다. 생성된 `ToolArgsMap`과 `ToolOutputMap`은 동일한 스키마에서 정확한 인자 및 표준 반환값 타입을 파생하며, 호출은 일반 실행 파이프라인으로 자연스럽게 진입합니다. 성공적인 호출은 렌더링된 네이티브 텍스트가 아니라 정책 검사를 거친 최종 표준 JSON 값으로 반환됩니다. 실패한 호출은 실제 `ToolCallError`로 reject되며, 프로그램은 내부 오류 코드나 실패 유니언 대신 `name`, `toolName`, 그리고 사용자가 읽을 수 있는 `message`만 확인할 수 있습니다.

`output.schema`는 프로그래밍 API로서 유용하도록 설계해야 합니다: 핸들과 필드를 명확하게 직접 반환하고, 스칼라/배열/null 루트가 데이터에 적합하다면 이를 허용하며, 사용자 안내용 설명은 `output.render`에 분리해 두세요. 중간 값들은 실행 로컬 데이터이므로 영속화되거나 프롬프트 길이 제한으로 잘리지 않으며 별도의 바이트 상한도 없습니다. 따라서 생산자가 전달하는 원본 데이터의 크기와 프로세스 메모리 관리가 중요합니다. 설정 가능한 출력 상한과 모델 대상 스필(spill) 파이프라인의 적용을 받는 것은 최상위 `run_code`의 실행 로그 및 결과뿐입니다.

## 도구의 UI 렌더링 방식

도구의 `output.render`는 모델이 참조하는 콘텐츠를 반환하며, **UI 카드**는 순수 표시 프로젝션과 선택적인 `presentCall` / `presentResult` 메서드로 선언하는 별도의 관심사입니다. 이들은 표준 결과값과 함께 설계해야 합니다. 전용 UI 표시가 없는 도구는 기본 제네릭 카드(제목 = 도구 이름, 원시 인자를 입력값으로 표시)로 대체됩니다.

두 메서드 모두 **`card` 태그가 지정된 렌더 의도(render intent)**를 반환합니다. 도구의 동작에 적합한 카드 유형을 선택하세요:

- `presentCall(args)` → `ToolCallView`(PENDING 상태 카드):
  - `{ card: 'generic', title, kind?, rawInput?, content?, locations? }` — 기본 형태. 아이콘을 지정하려면 `kind`(`read`/`search`/…)를 설정하고, 도구가 참조하거나 수정하는 파일이 있다면 `locations: [{ path, line? }]`를 설정하여 에디터가 해당 위치를 추적하거나 이동할 수 있도록 지원합니다.
  - `{ card: 'terminal', title, description?, cwd? }` — 호출 내용이 셸 명령어일 때 사용합니다. `title`은 실행할 명령어이며 `description`은 터미널 카드 상단에 렌더링됩니다. (`tool-bash` 참고)
  - `{ card: 'diff', title, diffs, locations? }` — 도구가 파일을 생성하거나 수정할 때 사용합니다. `diffs: [{ path, oldText, newText }]`(신규 파일인 경우 `oldText: null`) 데이터가 인라인 diff 카드로 렌더링됩니다. (`tool-fs`의 `write`/`edit` 참고)
- `presentResult(args, { content, isError, meta? })`는 실행 완료된 카드를 반환합니다:
  - `generic`: 선택적인 제목과 상세 콘텐츠를 제공합니다.
  - `terminal`: 원시 콘솔 출력과 선택적 종료 메타데이터를 제공하며, 각 UI 플랫폼에 맞는 터미널 뷰 또는 폴백 뷰로 렌더링됩니다.
  - `diff`: 적용된 변경 hunk를 제공하며, 일반적으로 `output.presentationMeta`에서 파생되어 영속적인 `result.meta`에 저장된 후 세션 재생 시 그대로 복원됩니다. 파일 수정 도구는 보류 카드를 완료 카드 뷰로 대체하므로 diff 결과를 유지합니다.
  - `read`: 영속적인 `result.meta`에서 재구성한 파일 읽기 뷰를 제공합니다. 파일 `path`, 1부터 시작하는 `offset`, 반환된 `lines`(각 줄의 원본 파일 행 번호 포함), `totalLines`, 그리고 선택적인 구문 강조 힌트인 `lang`을 포함합니다. `read` 카드 뷰를 지원하지 않는 UI는 원시 결과 텍스트로 대체됩니다. 읽기 작업의 PENDING 상태는 제네릭 카드로 표시되는데, 파일 내용은 `execute`가 완료된 후에만 존재하기 때문입니다. (`tool-fs`의 `read` 참고)
  - `search`: 영속적인 `result.meta`에서 재구성한 검색 결과를 제공합니다. 파일별로 그룹화된 검색 일치 목록(`shape: 'matches'`, grep 방식) 또는 단순 경로 목록(`shape: 'paths'`, glob 방식)과 함께, UI가 일부만 잘린 결과를 전체 결과로 오인하지 않도록 `truncated`/`total` 정보를 제공합니다. 카드 뷰에는 원본 결과 전문이 포함되지 않으며(검색 카드가 없는 UI는 원시 텍스트로 폴백), PENDING 상태는 제네릭 카드로 유지됩니다. (`tool-fs-search`의 `grep`/`glob` 참고)
  - `web`: `kind: 'search' | 'fetch'`로 구분되는 웹 검색 및 스크랩 완료 결과를 `result.meta`에서 파생하여 제공합니다. 본문 전체 사본을 담지 않으므로 `web` 카드 기능이 없는 UI는 원시 텍스트로 대체됩니다. (`tool-web`의 `web_search`/`web_fetch` 참고)

반드시 지켜야 할 주요 개발 규칙:

- **순수 함수 유지 (Purity):** 이 프레젠터 메서드들은 실시간 스트리밍 시점뿐만 아니라 과거 세션 로그를 재생할 때도 동일하게 호출되므로 반드시 `args`와 결과 객체에만 의존하는 순수 함수여야 합니다. I/O 작업, 세션 상태 직접 조회, 시스템 시계나 난수 사용은 엄격히 금지됩니다. diff는 오직 args에서만 파생되어야 하며(`write` 시점에 `oldText: null`을 사용하는 이유는 호출 시점의 프레젠터가 디스크 상의 이전 파일 내용을 알 수 없기 때문입니다), 세션 컨텍스트는 도구가 아니라 상위 UI 어댑터가 제공합니다. `presentCall` 내부에서 파일의 이전 내용이나 현재 작업 디렉터리를 조회하려고 시도하지 마세요. 그러한 정보는 프레젠터가 아니라 영속 결과 메타데이터나 UI 어댑터에서 처리해야 합니다.
- **UI 전용 포맷을 모델 결과에 포함하지 않기:** 코드 블록 펜스(` ```console `), diff 형식, 상대 경로 표기 등은 순수하게 UI 표시를 위한 것이라면 모델이 참조하는 표준 값이나 네이티브 텍스트에 포함되어서는 안 됩니다. `output.render`는 모델 대상 텍스트를 담당하고, `presentationMeta`와 카드 프레젠터는 세션 재생이 가능한 UI 상태를 담당합니다. `terminal` 결과 뷰는 순수 원시 출력을 담고, 폴백 표시용 프레이밍은 어댑터가 덧붙여야 합니다.
- **`defineTool`의 안전한 폴백 검증:** 유효하지 않거나 오래된 과거 기록 인자가 전달될 경우, 래퍼는 예외를 던지는 대신 `undefined`(제네릭 폴백 표시)를 반환합니다. UI 표시 계층의 문제로 인해 세션 재생 전체가 중단되어서는 안 됩니다.

도구와 UI 사이의 중립적인 어휘는 `dsh-tools` 패키지에 정의되어 있습니다. 도구 구현 코드는 UI나 네트워크 전송 타입을 직접 import해서는 안 됩니다. 이 API를 소비하는 각 UI 플랫폼이 개별 `card` 의도를 자체 뷰 컴포넌트로 매핑합니다. 세부적인 설계 배경은 [render-intent-union Agent Note](../../.agents/notes/implemented/architecture/2026-07-02-tool-render-intent-union.md)에 기술되어 있으며, `dsh-tool-fs`(generic/diff)와 `dsh-tool-bash`(terminal)가 공식 참조 구현체입니다.

## Web 클라이언트 표시 방식

내장 Web 클라이언트는 `presentCall`이나 `presentResult`를 직접 소비하지 않습니다. 세션의 `page` 및 `follow` 스트림이 영속적인 `result.meta`를 포함하는 원시 `tool/call`과 `tool/result` 이벤트를 클라이언트로 전송합니다. 클라이언트 플러그인은 `tool.call.toolview` 키 슬롯에 해당 도구 이름을 등록하고, `ToolCallBlock` 인자, 콘텐츠, 오류, 메타데이터, 기존 PTC 디스패치의 `parentCallId`, 세션 경로 정보 등으로부터 UI 컴포넌트 props를 파생합니다. 이러한 전송 값을 클라이언트 로컬에서 안전하게 검증하고, 유효하지 않거나 미지원 입력일 경우에는 기본 제네릭 행으로 안전하게 폴백합니다.

기존 Web 카드에서 모델 대상 텍스트만으로는 무손실 보존이 불가능한 구조화된 결과 사실이 필요할 때 `output.presentationMeta(args, value)`를 활용하세요. 메타데이터에 React props나 특정 카드 컴포넌트를 직접 저장하거나, 호스트 측 도구 구현을 브라우저 클라이언트 번들로 import하거나, 별도의 클라이언트 프레젠터 레지스트리를 중복 생성하지 마세요. 호스트 표시 메서드만 정의한다고 해서 전용 Web 카드가 자동으로 생성되지는 않습니다. 소유권 구조와 폴백 규칙은 [클라이언트 파생 표시 Agent Note](../../.agents/notes/implemented/architecture/2026-08-23-client-derived-tool-presentation.md)에 명시되어 있습니다.

## 검증 절차

[저장소 테스트 정책](../testing.ko.md) 및 해당 패키지의 테스트 지침을 준수하세요. 모델이나 UI에 노출되는 변경 사항을 배포할 때는 관련 문서에서 규정하는 테스트 커버리지를 반드시 확보해야 합니다.
