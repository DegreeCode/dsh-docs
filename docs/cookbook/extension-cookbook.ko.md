# 쿡북: 확장 플러그인 형태

[English](extension-cookbook.md) | [中文](extension-cookbook.zh.md) | 한국어

하네스 확장을 위한 참조 패턴입니다. 코드 조각은 import와 헬퍼 구현을 생략했으며 그대로 복사해 실행할 수 있는 완전한 예제가 아닙니다. 구체적인 작성 경로는 [패키지 체크리스트](adding-a-package.ko.md), [첫 도구 자습서](../user/develop/basic/tool.ko.md), [도구 참조](adding-a-tool.ko.md), [LLM 어댑터 가이드](adding-an-llm-adapter.ko.md), [세션 형식 버전 자습서](adding-a-session-format-version.ko.md)를 참고하세요. 시스템과 확장 지점 지도는 [아키텍처](../architecture.ko.md)가 소유합니다.

## 도구 플러그인

도구는 `ctx.tools`에 등록합니다. 주석이 달린 `defineTool` 예제(타입이 지정된 `execute` 인수, 결과 구성, `run_in_background` 패턴)는 [adding-a-tool.md](adding-a-tool.ko.md)에 있습니다. 그 가이드가 도구 정의의 기준입니다. 원시 JSON 스키마 `ToolDefinition`도 `ctx.tools.register()`가 직접 받습니다(MCP에서 온 도구가 그렇게 도착합니다). `defineTool`은 자사 도구를 위한 타입 지정 헬퍼입니다.

<a id="훅-플러그인권한-게이트-예제"></a>
## 훅 플러그인(권한 게이트 예제)

이 권한 게이트는 훅 플러그인의 한 예입니다. `tools/pre-execute` 게이트에서 타입 지정 결정을 반환해 호출을 허용하거나 거부하며, 샌드박스·권한·계획 모드 플러그인이 이 확장 지점을 사용할 수 있습니다. 훅 플러그인은 다른 확장 지점도 가로챌 수 있으며 본질적으로 권한 게이트인 것은 아닙니다. "네이티브 훅"은 가로채기 지점에 붙은 평범한 Cordis 플러그인이며 외부 프로토콜이 필요 없습니다.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

declare function isAllowed(exec: ToolExecution): Promise<boolean>

export const name = 'permission-gate'

export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) {
      return { kind: 'deny', reason: 'Denied by policy.' }
    }
    return next()
  })
}
```

이 워터폴은 재정렬 가능한 정책 계층입니다. 불변 조건에 단조로운 최종 거부가 필요하면 `ctx.tools.guard()`를, 플러그인이 디스패치 수명(타임아웃/재시도/메트릭, 교체 가능한 것은 `exec.signal`뿐)을 감싸야 하면 `tools/execute`를, 명시적 결과 변환에는 `tools/post-execute`를, 불변 최종 결과를 제한적으로 관찰하려면 `tools/result`를 사용하세요. 선택 규칙은 [adding-a-tool 가이드](adding-a-tool.ko.md#실행-정책과-관찰)에 있습니다.

## UI 플러그인

UI 플러그인은 영속 `session/event` 레코드(어시스턴트 확정(settlement), 턴/단계 경계, 도구 활동)와 실시간 토큰 표시를 위한 일시적 `agent/assistant-stream` 프레임을 결합하고, `agent.followup()` / `agent.steer()`로 입력을 다시 밀어 넣습니다. 대신 내장 Web 클라이언트에 비즈니스 행을 기여하는 브라우저 플러그인은 `ConversationNodeDefinition`과 키가 지정된 Chat 렌더러를 등록합니다. [Conversation 하위 시스템 참조](../subsystems/conversation.ko.md)를 따르세요.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

declare function render(text: string): void
declare function onUserInput(handler: (text: string) => void): void

export const name = 'my-ui'
export const inject = ['agents']

export function apply(ctx: Context) {
  ctx.on('agent/assistant-stream', ({ frame }) => {
    if (frame.type === 'chunk' && frame.chunk.type === 'text-delta') {
      render(frame.chunk.text)
    }
  })
  onUserInput(text => ctx.agents.get(brandString<SessionId>('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

## 외부 프로토콜 드라이버

*프로토콜 드라이버*는 와이어 피어를 `ctx.agents`에 맞춰 적응시키며, UI나 자동화 클라이언트를 서비스할 수 있습니다. stdio 드라이버는 stdout을 소유하고, 팩토리로 에이전트를 만들거나 재개하며, 프로토콜 요청을 `followup()` 또는 `cancel()`로 매핑합니다. 저수준 프롬프트 요청은 영속 큐잉 영수증을 반환하며, `MessageId`를 `turn/end`와 연관 지어 결과를 얻지는 않습니다. 전체 에이전트 상태는 별도로 게시하세요. 자동화 메서드는 영수증에서 다음 유휴 시점까지 기다려 그 명시적으로 소유한 구간을 요약할 수 있지만, UI는 보통 열린 이벤트 스트림을 계속 관찰합니다. 에이전트는 `AgentHandle.dispose()`로 정리해 폐기가 정지 상태에 도달하도록 하세요.

[`packages/acp/acp`](../../packages/acp/acp)는 자동화 전용 실제 예제입니다. Agent Client Protocol JSON-RPC stdio로 새 텍스트 세션을 노출하고, 커밋된 어시스턴트 텍스트를 내보내며, 자신이 소유한 에이전트를 위한 일회성 기계 권한 응답자를 등록합니다. 정확한 메서드, 이벤트 순서, 수명 주기 계약은 [README](../../packages/acp/acp/README.md)에 정의되어 있습니다.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { expandAssistantStream } from '@deepseek-ai/dsh-llm'

export const name = 'my-protocol-bridge'
export const inject = ['agents', 'sessions', 'sessionPersistence']

export function apply(ctx: Context) {
  // Publish every committed Assistant text delta to the client.
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/message' || event.type === 'assistant/attempt') {
      for (const { chunk } of expandAssistantStream(event.data.stream)) {
        if (chunk.type === 'text-delta') {
          // sendToClient({ kind: 'message_chunk', text: chunk.text })
        }
      }
    }
  })
  // Inbound "prompt": create/resume an agent, feed it, and return its enqueue receipt.
  // Whole-agent status is a separate notification; no turn end belongs to this prompt.
  // Teardown reaches quiescence via AgentHandle.dispose() (stop + await exit).
}
```

## 실행 가능한 배선

배포되는 애플리케이션은 `packages/bundle/*/cordis.patch.yml`을 통해 프로필 계층을 기여하고, 제품 `dsh` 런처는 이름 있는 프로필을 통해 Web, ACP, SDK, 일회성 헤드리스 실행을 소유합니다. 선택적 사용자 대상 오버레이는 `apps/cli/config/examples/` 아래에, 프로필 통합 테스트는 `apps/cli/tests/profiles/` 아래에 있으며, 패키지별 Loader 구성은 해당 패키지 테스트에 남습니다.

## 기능 → 메커니즘 지도

모든 제품 기능은 문서화된 확장 지점의 리스너로 매핑됩니다. 즉 마이크로커널 주장을 검증 가능하게 만든 것입니다([마이크로커널 참조](../architecture.ko.md)). 루프를 수정하는 행은 없습니다.

`system-prompt/assemble`은 전문가용 협력적 전체 조립 변환입니다. 반환된 조립이 권위 있으므로 리스너 작성자는 활성 PTC 모드와 구조화 출력 프로토콜 기여를 보존할 책임이 있습니다. 표시·조회·실행 전반에서 정렬을 유지해야 하는 도구 필터링에는 `ctx.tools.restrict()`를 선호하세요.

| 제품 기능 | 플러그인 메커니즘 |
|---|---|
| 훅 시스템(사용자 + 프로젝트 수준) | `agent/created`, `agent/pre-step`, `tools/pre-execute`, `tools/post-execute`, `agent/turn-stopping`의 리스너. 워터폴은 타입 지정 결정을 반환하고 `agent/turn-stopping`은 다음 단계로 끼어들 수 있습니다. `dsh-hooks-claude-code` / `dsh-hooks-codex` 브리지가 훅 구성 파일을 이 확장 지점에 매핑합니다 |
| `/goal` | `ctx.goals`가 영속 상태를 소유하고, `dsh-goal-round-driver`가 공개 `Agent`를 통해 같은 세션의 라운드를 예약하며, 별도의 명령/도구 생산자가 사용자·모델 제어를 노출합니다 |
| `/loop` | `turn/end` 세션 이벤트에서 다음 반복을 `followup()`하거나 강제로 계속합니다 |
| 동적 워크플로 | `ctx.workflowEngine` + PTC 워크플로 엔진 + `workflow` 도구. 구조화된 인프로세스 자식은 범위 지정 프롬프트/도구 등록, 단조 도구 가드, 최종 `tools/result` 커밋(`run_code` 포함), 구조화 출력 실행의 단조 `concludeTurn()` 마커로 출력을 강제합니다 |
| 대기 메시지 + 끼어들기 메시지 | 코어 `Agent.followup()` / `Agent.steer()` |
| 컨텍스트 압축(자동 + 수동) | `ctx.compaction` seam + `dsh-compaction-basic`. 자동 압박은 직렬 `agent/pre-step`에서, 표준 오버플로 복구는 `agent/request-error`에서 실행되며, 수동 호출자도 같은 압축 서비스를 사용합니다([압축 참조](../../packages/compaction/compaction/README.md)) |
| 시스템 프롬프트 구성 가능성 | 순서와 범위 로컬 섀도잉이 있는 `ctx.systemPrompt.section()` |
| AGENTS.md(루트) | 파일을 읽는 섹션 제공자 |
| AGENTS.md(하위 디렉터리, 접촉 시) + 파일 변경 알림 | 감시자/도구 결과 리스너에서 `agent.inject()` |
| 내장 도구 | `ctx.tools.register()`. 스키마가 조립으로 자동 흐르며, `dsh-tool-*` 계열(bash, fs, web, subagent, todo)이 배포 예제입니다 |
| ToolSearch / 점진적 공개 | 가시 집합이 바뀔 때 범위 지정 `ctx.tools.restrict()` 등록을 교체합니다. 레지스트리가 표시·조회·실행을 정렬해 유지합니다 |
| 도구 기한 / 재시도 / 메트릭 | 코어 디스패치를 `tools/execute`로 감쌉니다. 래퍼는 `exec.signal`을 교체하고 위임하며 정규화된 결과를 하나의 어휘적 수명 안에서 검사할 수 있습니다 |
| 최종 도구 결과 메트릭 / 감사 / 캡처 | `tools/result`로 불변의 권위 있는 결과를 관찰합니다. 플러그인이 결과를 변환하거나 컨텍스트를 첨부해야 할 때만 `tools/post-execute`를 사용하세요 |
| 단조 터미널 턴 정책 | 성공한 터미널 도구에서 `ToolExecution.concludeTurn()`을 호출합니다. 같은 응답의 이후 도구 호출은 계속 가드 가능하며 루프는 단계 후 중지됩니다 |
| 하위 프로세스 샌드박스(landlock / sandbox-exec) | `dsh-bash-sandbox`를 통해 `ctx.sandbox` 백엔드를 사용하고, 기능 수준 거부에는 `tools/pre-execute`를 사용합니다 |
| 권한 시스템 / AskUserQuestion | `tools/pre-execute`에서 `ask`를 반환하고 `ctx.approval`로 응답합니다. 일반 사용자 질문에는 별도의 모델 대상 ask 도구를 등록하세요 |
| 계획 모드 | [`@deepseek-ai/dsh-plan-mode`](../../packages/plan/plan-mode/README.md) — 로그된 `plan/mode` 상태, `plan:policy` 안내 섹션, `/plan [message]` 진입, `/plan off` 즉시 종료, 사용자 검토를 거치는 `exit_plan_mode` 종료. 적용은 독립적인 샌드박스/승인 축에 남습니다 |
| 서브에이전트 위임 | `ctx.subagents` 제공자 레지스트리(`dsh-subagent-spawn-in-process`/`dsh-subagent-fork-in-process`/`dsh-subagent-acp`/`dsh-subagent-codex`/`dsh-subagent-claude-code`/`dsh-subagent-dsh-sdk`) + 구성된 제공자 하나를 모델에 노출하는 `dsh-tool-subagent` |
| MCP | 서버마다 플러그인 하나: 도구를 탐색하고 `ctx.tools.register()`합니다 |
| 스킬 | 섹션 + 도구 등록. 호출 시 `inject()`로 스킬 내용을 주입합니다 |
| 메모리 | 섹션 제공자 + 도구 |
| 예약 작업(cron) | 플러그인이 모델 호출 가능한 예약 도구를 등록하고, 예정된 타이머가 `followup(…, {source: {kind: 'schedule'}})`로 전달합니다 |
| UI(GUI, CLI는 JSONL 출력) | 실시간 청크는 `agent/assistant-stream`, 영속 턴 확정(settlement)·경계·도구 활동은 `session/event`를 수신합니다. 입력은 `followup()`으로 보냅니다 |
| Web 클라이언트 Chat 비즈니스 노드 | `ConversationNodeDefinition`과 `conversation.chat.node` 키 렌더러를 등록합니다 |
| SessionTelemetryBackend / 재생 가능 추적 | `session/event` → JSONL. 재생은 `sessions.create(id, { seed })`입니다 |
| 모델 어댑터 | `registerAdapter`로 `LlmAdapter` 서브클래스를 등록합니다(`dsh-llm-deepseek`, `dsh-llm-pi-ai`) |
| 플러그인 핫 리로드 | 모든 등록이 `ctx.effect`이므로 벤더링된 HMR이 그대로 동작합니다 |
