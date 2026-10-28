# DeepSeek Harness 아키텍처

[English](architecture.md) | [中文](architecture.zh.md) | 한국어

`packages/` 하위 코드를 수정하기 전에 이 문서를 먼저 읽어보세요. Cordis 프레임워크에 대한 기본 지식이 있다고 가정하며, 아직 익숙하지 않다면 [입문서](cordis-primer.ko.md)나 [자습서](cordis-tutorial/index.ko.md)를 먼저 살펴보시기를 권장합니다.

## Cordis

[Cordis](cordis-primer.ko.md)는 dsh의 근간을 이루는 프레임워크입니다. 각 플러그인은 서비스, 타입 안전한 이벤트, 롤백 가능한 효과(effect)를 공유 컨텍스트에 등록하여 시스템에 기여합니다. 모델 어댑터, 도구 레지스트리, 세션 로그, 에이전트 루프 자체를 포함한 제품의 모든 구성 요소가 플러그인으로 만들어져 있어, 설정을 통해 각 요소를 자유롭게 교체할 수 있습니다.

직접 수정해야 하는 특권 코어(core) 계층은 존재하지 않습니다. dsh를 확장할 때는 기존 플러그인들과 나란히 새 플러그인을 마운트하기만 하면 되며, 등록된 모든 기능은 해당 플러그인이 언로드될 때 자동으로 정리(롤백)되는 효과로 동작합니다.

## 프로필과 번들

실행 중인 `dsh`는 부팅 시 순서대로 계층화되어 조립되는 플러그인 트리입니다.

**프로필(profile)**은 Harness 홈 디렉터리에 저장되는 이름이 지정된 조합 명세입니다. 함께 스택으로 구성할 번들 목록을 정의하고, 트리에 포함되지 않은 외부 플러그인을 보관하며, 사용자의 자체 `cordis.patch.yml` 파일을 유지합니다. 기본 템플릿으로 `web`, `headless`, `sdk`, `sdk-minimal`, `acp`가 제공됩니다.

**번들(bundle)**은 Cordis 구성 행(row)과 해당 행이 마운트하는 코드를 묶은 배포 단위입니다. 따라서 특정 번들이 추가한 내용은 상위 계층에서 얼마든지 패치하여 재정의할 수 있습니다.

각 프로필과 번들은 자체 `package.json`의 `dsh` 필드에 정보를 선언합니다. `dsh.profile`은 프로필이 포함하는 번들 목록을 나열하고, `dsh.bundle`은 번들의 패치 파일 경로를 가리킵니다.

[`dsh-base`](../packages/bundle/base/README.md)는 `web`, `headless`, `sdk`, `acp` 프로필이 공통으로 사용하는 기본 첫 번째 계층입니다: 모델 어댑터, 도구, 영속성, 샌드박스 및 승인 정책, 설정, 자격 증명, 텔레메트리 등이 포함됩니다. [`dsh-web-app`](../packages/bundle/web-app/README.md)은 브라우저 애플리케이션을 추가하고, [`dsh-headless`](../packages/bundle/headless/README.md)는 서버 없는 일회성 실행기를 추가하며, [`dsh-sdk-app`](../packages/bundle/sdk-app/README.md)은 SDK JSON-RPC 서버를, [`dsh-acp-app`](../packages/bundle/acp-app/README.md)은 자동화 전용 ACP 서버를 추가합니다. [`dsh-sdk-minimal`](../packages/bundle/sdk-minimal/README.md)은 의도적인 예외로서, 단일 번들이 명시적인 전체 SDK 트리를 소유하며 `dsh-base` 계층을 적용하지 않습니다.

구성 계층은 빈 목록을 바탕으로 다음 순서에 따라 적용됩니다: 프로필에 지정된 순서별 번들 → 프로필의 `cordis.patch.yml` → 홈 디렉터리 패치 → `--patch` 오버레이. 각 패치는 ID로 대상을 지정하여 해당 구성 전체를 교체하거나 새 행을 추가합니다. `preset` 패치는 해당 선언의 `config.plugins` 내부에서 동일한 계층 우선순위에 따라 이 작업들을 수행합니다.

HMR(핫 모듈 대체)은 YAML 설정으로 제어합니다. 기본 base 계층은 구성만 감시하는 `dsh-hmr`을 활성화하며, headless, SDK, ACP는 이를 비활성화하고, `sdk-minimal`은 아예 포함하지 않습니다. 프로필 패치에서 이러한 기본 설정을 재정의할 수 있습니다. HMR은 파일 감시와 리로드를 조율하며, 런처는 프로필 데이터와 준비 상태를 제공합니다.

base 계층에는 Web과 에이전트를 위한 [Plugin Manager](../packages/boot/plugin-manager/README.md)가 포함되어 있습니다.

현재 시스템에서 부팅되는 플러그인 트리를 확인하려면 다음 명령을 실행합니다:

```sh
dsh --profile web --dump-config
```

출력되는 모든 행은 사용자가 직접 작성한 패치로 교체할 수 있습니다.

조립 메커니즘에 대한 자세한 내용은 [app-boot](../packages/boot/app-boot/README.md#profiles)에서, 구성 필드 목록은 자동 생성된 [플러그인 구성 카탈로그](config-catalog.ko.md)에서 확인할 수 있습니다.

## 애플리케이션 실행

지원되는 Node 애플리케이션은 명명된 `dsh` 프로필을 통해 실행됩니다. 제공되는 기본 프로필은 `web`, `headless`, `sdk`, `sdk-minimal`, `acp`이며, `dsh --profile <name>` 또는 `dsh <name>` 형식으로 선택합니다. `plugin`은 관리 명령어의 이름이므로, 동일한 이름의 프로필을 실행하려면 `--profile plugin`으로 명시해야 합니다. TypeScript SDK는 동일한 버전의 `dsh` 의존성을 확인하여 `sdk` 프로필을 선택합니다. 사용자 정의 플러그인 조합은 별도의 실행 파일이나 인라인 애플리케이션 트리를 만드는 것이 아니라, 프로필과 순서가 지정된 패치 파일 형태로 유지됩니다. `sdk-minimal`은 동일한 런처에서 실행되는 저장소 자체의 독립 번들이며, 호출자가 직접 제공하는 Cordis 트리가 아닙니다.

외부에서 가져온 CLI, 빌드 전용 및 테스트 전용 실행 파일, 프로세스 내 직접 플러그인 마운트 방식, 그리고 비공개 브라우저 WebWorker 미리보기는 공식 Harness 애플리케이션 런처가 아닙니다. [`verify-application-entrypoints`](../scripts/verify-application-entrypoints.ts) 검사는 모든 패키지 bin, 실행 파일 소스, 루트 데모, 루트의 `start:web` 및 `dev:web` 스크립트를 명시적으로 분류하며, `dsh`를 우회하는 임의의 Node 애플리케이션 경로를 엄격히 금지합니다.

Python SDK 역시 동일한 애플리케이션 아키텍처를 따릅니다. Python 런타임 wheel은 표준 `dsh` CLI를 `deepseek-harness-sdk-runtime-<platform>-<arch>` 형태로 패키징하며, 클라이언트는 기본적으로 명시적인 Harness 홈 경로와 함께 `dsh --profile sdk`를 실행합니다. 최소 예제는 제공되는 `sdk-minimal` 프로필을 선택합니다. Python은 전체 Cordis 트리를 직접 다루지 않고 프로필 선택과 순서별 패치 파일만 노출하며, 영속적인 외부 플러그인은 `dsh plugin` 명령어로 설치합니다. 과거에 제거된 비공개 직접 구성 전달 방식은 호환 bin이나 대체 파서를 제공하지 않습니다.

## 데스크톱 애플리케이션

[Electron 데스크톱 애플리케이션](../apps/desktop/README.md)은 실제 dsh 프로덕션 런타임을 서명된 리소스 형태로 포함하며 예약된 `$DSH_HOME/profiles/desktop` 경로를 소유합니다. 공유 헬퍼는 프로필 파일을 초기화하고, 번들을 조율하며, pnpm으로 관리되는 패키지를 덮어쓰지 않고 설치 및 번들 의존성을 안전하게 확인합니다. 데스크톱과 npm CLI는 제품 데이터를 서로 공유하지만 패키지, 활성화 상태, 락파일은 분리하여 관리합니다. 데스크톱에 포함된 CLI가 초기화된 플러그인을 관리합니다.

Electron은 Electron Node 모드에서 전용 Desktop Host를 구동합니다. 이 Host는 공유 CLI 프로필 실행기와 전체 Web 애플리케이션을 호출합니다. 창이 열리면 패키징된 Web 정적 리소스를 즉시 로드하고, 동일한 문서에서 클라이언트 플러그인을 활성화하기 전에 부팅 주입을 기다립니다. RPC와 스트림 처리는 Web 레이어가 소유하며, 데스크톱 셸 환경이 로컬 페이지를 인증된 Host와 연결합니다. Node IPC를 통해 부팅 주입 데이터, 준비 상태, 치명적 오류, 프로세스 종료 신호를 전달합니다. 데스크톱은 기본적으로 OS가 동적으로 할당한 포트를 사용하며, 프로필 구성을 통해 포트를 고정할 수도 있습니다. 데스크톱 셸 UI는 일반 사용자 및 프로필 설정을 기반으로 번들된 pnpm을 사용하여 플러그인 설치 및 트랜잭션을 실행합니다.

## 코어 패키지

| 패키지 | 담당 역할 | `ctx` 키 |
|---|---|---|
| [`core/session`](subsystems/session.ko.md) | 추가 전용(append-only) `SessionEvent` 로그 및 인메모리 저장소 | `ctx.sessions` |
| [`core/system-prompt`](subsystems/system-prompt.ko.md) | 프롬프트 섹션 및 도구 스키마 조립 | `ctx.systemPrompt` |
| [`core/tools`](subsystems/tools.ko.md) | 스코프 기반 도구 레지스트리 및 보호된 실행 파이프라인 | `ctx.tools` |
| [`core/agent`](subsystems/core.ko.md) | `Agent` 인터페이스, 실시간 레지스트리, `agent/*` 이벤트 | `ctx.agents` |
| [`core/agent-loop`](subsystems/core.ko.md) | Agent 인터페이스를 구현하는 기본 실행 드라이버 | `ctx.agentLoop` |
| [`core/scope`](subsystems/scope.ko.md) | 에이전트별 스코프 지정 등록을 위한 기본 원시 연산 | 라이브러리 (키 없음) |
| [`llm/llm`](subsystems/llm-streaming.ko.md) | 메시지/스트림 도메인 어휘 및 어댑터 seam | `ctx.llm` |

## 이벤트

이벤트는 시스템의 주요 확장 지점이며, 변경 작업을 진행할 때 가장 먼저 해야 할 결정은 올바른 이벤트 영역을 선택하는 것입니다.

- **세션 이벤트**는 로그에 지속적으로 추가되고 `session/event`를 통해 브로드캐스트되는 영속적인 사실 기록입니다. 시스템 재시작 후에도 데이터가 유지되어야 할 때 사용합니다.
- **에이전트 이벤트**(`agent/*`)는 활성화된 `Agent` 인스턴스를 전달합니다: 수신함(inbox), 실행 단계(step), 상태, 요청, 유효성 검증, 연속 실행 등. 현재 진행 중인 작업을 모니터링하거나 가로채고자 할 때 사용합니다.
- **기능 이벤트**는 에이전트 루프를 직접 import하지 않고 각 기능 seam(`fs/*`, `tools/*`, `telemetry/*`)에 정책과 어댑터를 연결할 때 사용합니다.

AgentLoop는 오류 발생 시 롤백 기능을 포함하여 Agent를 초기화하며, 대기 중인 작업을 시작하기 전에 `agent/created` 이벤트가 직렬로 완료될 때까지 대기합니다. 언로드 시에는 Agent 정리를 진행하면서 리소스를 안전하게 해제합니다. 세부적인 실행 순서는 [agent-loop](../packages/core/agent-loop/README.md#understand-the-implementation)에 정의되어 있습니다.

[이벤트 맵](event-producer-consumer.ko.md)에서 모든 이벤트의 생산자와 소비자 목록을 확인할 수 있습니다.

<a id="턴-흐름"></a>
## 턴(Turn) 흐름

**단계(step)**는 하나의 모델 요청과 해당 요청이 호출하는 도구들의 묶음입니다. **턴(turn)**은 0개 이상의 단계로 구성됩니다: 첫 번째 입력을 가져오기 전에 턴이 시작되고, 더 이상 처리할 작업이 남아 있지 않을 때 턴이 종료됩니다.

```text
turn/start
  claim next-step input plus one queued message
  snapshot Session model selection; assemble prompt sections + step-admitted tool schemas
  -> agent/pre-step; project runtime context at fallback
                                     reject | enter(messages, startsRequestSeries?)
     reject, or a first enter rewritten empty -> close the turn with no step
     step/start
     agent/request -> prepareCall (cancellation commits neither system nor users)
     reconcile system/message using the prepared call capability
     append entered messages as user/message; reconcile retained runtime context
     log request/header and request/context as needed
     derive and freeze model history from the log
     stream the bound prepared call -> llm/stream -> agent/assistant-stream start
       agent/assistant-stream chunk*
       assistant/message | assistant/attempt -> agent/assistant-stream end
     tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
     step/end
     tools owe another request, or next-step input arrived -> claim -> next step
  -> agent/turn-stopping
turn/end
```

`turn/*`, `step/*`, `system/message`, `user/message`, `assistant/message`, `assistant/attempt`, `tool/*`는 영속적인 세션 이벤트이며, 나머지는 세 영역에 걸친 실시간 확장 지점입니다. `agent/assistant-stream`은 프로세스 로컬의 시작(start), 일시적 청크(chunk), 종료(end) 프레임을 발행합니다. 에이전트 루프는 확정된 end 프레임이 전달되기 전에 압축된 전체 스트림을 하나의 메시지 또는 로그 전용 시도(attempt)로 커밋하며, Web의 세션 추적 어댑터가 이 실시간 이벤트의 유일한 원격 소비자입니다. `agent/pre-step`, `agent/request`, `llm/stream`, 그리고 세 가지 `tools/*` 이벤트는 waterfall 방식으로 동작하므로 리스너가 다음으로 위임하려면 반드시 `next()`를 호출해야 합니다. 반면 `agent/turn-stopping`은 순차(serial) 방식이며 `next()`를 호출하지 않습니다.

팩토리 설정은 SessionStore 등록 및 `session/created` 이후, `agent/created` 이전에 수행됩니다. 세션 종료 이벤트는 리소스가 제거되기 전에 최종 커밋됩니다.

단일 수신함(inbox)이 드라이버에 작업을 공급하며, 주입된 컨텍스트는 프로세스를 깨우는 새 메시지를 기다립니다. AgentLoop의 영속적인 `inbox` 투영을 사용하면 실제 실행 중인 Agent 없이도 대기 중인 입력을 조회할 수 있습니다.

프롬프트 조립 전에 루프는 세션의 모델 선택 상태를 `AssembleContext.modelSelection`과 `agent/pre-step.modelSelection`에 스냅샷으로 기록합니다. 재시도 시에도 해당 선택이 유지되며, 추론 강도(effort)가 생략된 경우 어댑터 기본값을 사용합니다. `agent/pre-step` 리스너는 가져온 입력 메시지를 수락하거나, 내용을 수정하거나, 거부할 수 있습니다. 첫 번째 입력 배치가 거부되거나 비어 있으면 별도의 단계 실행 없이 영속 턴을 즉시 종료합니다. enter 결정 시 `startsRequestSeries` 플래그를 설정할 수 있으며, 이 경우 루프는 새로운 `request/header`를 기록합니다(이유는 `series`이며, 메시지 엔벨로프까지 변경된 경우에는 `startsSeries: true`를 포함한 `change`로 기록). 이 과정을 감싸는 리스너는 `{ ...decision, messages }` 형태로 해당 선언을 보존해야 합니다. 조립 및 `step/start` 완료 후, 레거시인 `agent/request` 훅은 제공자, 모델, 추론 강도 선택을 변경하지 않는 범위에서 제어 흐름을 조정하며, `prepareCall()`은 시스템 프롬프트와 수락된 사용자 메시지가 커밋되기 전에 어댑터를 바인딩합니다. 두 비동기 단계 중 어느 곳에서든 취소가 발생하면 시스템 및 사용자 메시지 둘 다 커밋되지 않습니다. 준비된 호출의 기능 명세가 앞선 `request/context`가 아닌 프롬프트 수락 여부를 최종 결정합니다. 매 시도마다 등록된 런타임 사실을 새로고침하고, 바인딩된 프롬프트를 조정하며, 사용자 메시지를 1회 수락하고, 임시 제거되었던 런타임 컨텍스트를 복원하며, 필요에 따라 header/context를 기록하고, 바인딩된 호출을 스트리밍하기 전에 요청 내용을 동결합니다. 단순 재시도 시에는 프롬프트 조립이나 `agent/pre-step`을 다시 실행하지 않습니다. 첨부 파일 추가 후의 표면 교체나 이미지 오프로드 결정이 발생하면(재개된 첫 pre-step 포함) 새로운 요청 시리즈가 시작됩니다. 변경 없이 재개되는 경우에는 기존 시리즈를 그대로 이어갑니다. 시스템 프롬프트는 `system/message` 히스토리 형태로 관리됩니다. 빈 텍스트를 전달하면 기존 프롬프트가 지워지고, 동적 업데이트를 지원하는 경로는 변경사항을 덧붙이며, 그 외의 경로는 첫 번째 시스템 노드에 내용을 통합합니다. 프롬프트 수락과 교체에 대한 세부 사항은 [Agent-loop](../packages/core/agent-loop/README.md#understand-the-implementation)에서 소유합니다.

에이전트 루프는 실시간 취소 기능을 갖춘 불변 요청을 전송하며, 동결된 엔티티에 대해서는 기존에 동결된 증거 데이터를 재사용합니다. 요청 구성 및 취소 사유 처리는 [agent-loop](../packages/core/agent-loop/README.md)가 담당합니다.

실행에 실패한 단계는 [누락된 도구 실행 결과를 명시적으로 기록합니다](../packages/core/agent-loop/README.md#understand-the-implementation).

세부 사항은 [시퀀스 다이어그램](agent-lifecycle.ko.md), [도구 실행 파이프라인](tool-execution-pipeline.ko.md), 그리고 [취소 및 오류 복구 가이드](subsystems/core.ko.md#에이전트-핸들)를 참고하세요.

[`ctx.tools.execute()`](subsystems/tools.ko.md)는 원시 배치 배열과 동시성 제한 값을 전달받습니다.

## 세션 로그

세션 로그는 모델이 참조하는 모든 컨텍스트의 단일 원천입니다. `deriveMessages()` 함수는 이 로그를 기반으로 모델 대화 히스토리를 투영(프로젝션)합니다. 각 `assistant/message`에는 조립된 콘텐츠를 생성할 때 사용된 정확한 압축 시점 스트림 데이터가 내장됩니다. `assistant/attempt`는 모델 대화 히스토리에는 추가되지 않지만, 실패, 재시도, 취소, 스트림 오류 등으로 확정(settle)된 시도 내역을 영속적으로 보존합니다. 세션 포크, 재개, 텍스트 트랜스크립트, 텔레메트리, 영속성 등 모든 기능은 이 영속적인 확정 기록에서 파생되며, 실시간 UI의 점진적 업데이트는 `agent/assistant-stream`을 통해 제공됩니다. 작업이 확정되기 전에 프로세스가 강제 종료되면 영속적인 시도 스트림 기록이 남지 않습니다([아키텍처 결정 기록](../.agents/notes/implemented/architecture/2026-09-01-v2-embedded-assistant-streams.md)).

세션 소비자는 현재의 논리적 데이터 포맷만 인식합니다. 헤더만 검사하는 `stat` 및 `list`는 각 세션 디렉터리를 스캔하여 가장 높은 번호의 정규 세대(canonical generation)를 선택하며, 전체 이벤트를 로드하거나 후속 세대 파일을 생성하지 않고도 지원되는 이전 버전의 헤더를 변환합니다. 저장된 세션을 열 때(`open`) 동일한 최신 세대를 선택하고, 상위 미래 버전을 거부하거나, 정적 인접 마이그레이션 체인을 1회 디코딩 및 합성하여 검증된 현재 논리 이벤트를 반환합니다. 읽기 전용 open은 후속 세대 파일을 만들지 않고 인메모리 결과만 사용하며, 쓰기 open은 먼저 인코딩 및 검증을 거친 후 변경되지 않은 원본 파일 옆에 최종 버전명이 지정된 후속 세대 파일을 배타적으로 생성합니다. 닫히지 않은 채 중단된 꼬리(interrupted tail) 데이터를 일반 복구하는 것은 세션 핸들 소비자의 책임입니다. 마이그레이션 도구는 이후의 `turn/start`로 이미 봉인된 제한된 릴리스 재시작 건에 대해서만 누락된 `turn/end` 종료 이벤트를 보충합니다. JSONL v0은 `session.jsonl[.zstd]`를 사용하고, v1 이상은 소문자 `session.vN.jsonl[.zstd]`를 사용하며, 한 번 커밋된 세대 파일 경로는 이름 변경, 덮어쓰기, 삭제가 절대 일어나지 않습니다. JSONL 제공자는 물리적 프레이밍, 압축, 세대 선택, 배타적 파일 쓰기를 소유하며, 각 인접 마이그레이션 패키지는 정확히 하나의 `vN -> vN+1` 변환 단계만을 담당합니다([아키텍처 결정 기록](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md)).

**모델에 노출되는 모든 정보는 반드시 로그에 기록됩니다.** 모든 모델 요청은 로그 데이터로부터 온전히 재구성될 수 있어야 합니다. 모델에 보여줄 새로운 입력이 있다면 반드시 세션 이벤트로 정의해야 합니다. 기존 메시지 콘텐츠를 변환하는 플러그인은 [순수 메시지 프로젝션](subsystems/session.ko.md#플러그인-소유-메시지-투영)을 등록하며, 독립형 리더는 동일한 정의를 명시적으로 제공해야 합니다. 도구 변경 사항은 기능 seam과 독립적이며, [세션 도구 히스토리](../packages/core/session/README.md)가 제공자 선언을 제공합니다.

**프로젝션 seam:** `dsh-session-projection`은 `ctx.sessionProjections`를 소유합니다. 등록된 프로젝션 단위들이 커밋된 이벤트를 점진적으로 취합(fold)하고, 캐리어는 `snapshot()`을 통해 필요한 클라이언트 뷰만 잘라내어 일괄 처리합니다. 도메인 서비스는 활성화 중에 프로젝션 등록을 대기하고, 비공개 핸들을 유지하며, 다른 플러그인을 위한 비즈니스 메서드를 제공합니다. 등록을 해제하면 전역 참여에서는 빠지지만, 유지된 핸들은 계속해서 세션 이벤트를 취합합니다. `AgentRegistry`는 턴과 단계의 상태를 소유하고 `turnBoundaryOf(session)`을 노출합니다([등록 수명 주기](../packages/session/session-projection/README.md)). `AgentLoop`은 `modelSelection`을 소유하며 수신함과 함께 각 Agent의 `model` 인스턴스를 구성합니다.

[작업 디렉터리](subsystems/working-directory.ko.md)는 원래의 프로젝트 식별자, 샌드박스 쓰기 루트, 기존 프로세스 실행 디렉터리를 훼손하지 않으면서 사용자 컨텍스트와 실행 경로를 안전하게 제공합니다.

## 기능 seam (Capability Seams)

**seam**은 다음 세 가지 역할로 구성된 교체 가능한 기능 단위입니다: 인터페이스를 선언하는 **Service Definition**, 이를 구현하는 **Service Provider**, 그리고 이를 활용하는 **Consumer**(주로 모델 대상 도구). 하나의 패키지가 여러 역할을 겸할 수도 있지만 단일 역할만으로는 seam이 될 수 없습니다. 기능을 추가한다는 것은 이 세 가지 역할을 모두 설계한다는 것을 의미합니다([기능 그래프](capability-seams.ko.md)).

seam 아키텍처 덕분에 단 하나의 제공자만 교체해도 제품 전체의 동작 환경을 바꿀 수 있습니다. 예를 들어 파일시스템과 서브프로세스 제공자는 하나의 실행 환경을 공유하므로, 이들을 원격 샌드박스로 연결하면 Bash, PTY, LSP가 별도의 제공자 포크 없이 원격 환경으로 함께 전환됩니다. [서브에이전트 제공자](subsystems/subagent.ko.md) 역시 동일한 단일 인터페이스 뒤에서 완전히 새로운 자식 에이전트 생성부터 다른 제품으로의 턴 위임까지 광범위하게 교체할 수 있습니다.

[실험적 기능: Agent Teams](subsystems/agent-team.ko.md)는 지속 가능한 서브에이전트를 기반으로 영속 명단, 작업 상태, 수신함 직접 메시징을 제공하는 옵트인 형태의 `ctx.agentTeams` 조율 기능을 제공합니다.

## 새로운 동작의 추가 위치

새로운 기능 동작은 공식적으로 문서화된 확장 지점에 연결해야 합니다. 에이전트 루프 자체를 변경하면 이 매핑 가이드도 함께 갱신됩니다.

| 원하는 목표 | 연결 메커니즘 |
|---|---|
| 새 모델 제공자 추가 | `ctx.llm`에 어댑터 등록 |
| 모델이 사용할 도구 추가 | `ctx.tools`에 등록 (스키마가 프롬프트 조립에 자동 포함됨) |
| 특정 세션에 별도의 도구/기능 집합 부여 | 에이전트 프리셋 구성 (해당 서비스 행에 `isolate` realm 필요) |
| 셸 명령 실행 기능 추가 | `ctx.shell` 백엔드 등록 (로컬 백엔드는 `ctx.subprocess`로 프로세스 생성) |
| 영속 터미널 실행 기능 추가 | `ctx.terminals` 백엔드 및 `dsh-tool-terminal` 등록 |
| 사용자 슬래시 명령 추가 | `ctx.commands`에 등록 (모델 턴을 거치지 않고 직접 디스패치) |
| 백그라운드 작업 관리 | `ctx.jobs`에 등록 (`job_*` 도구로 작업 조회 또는 중지) |
| 외부 웹훅에서 세션 시작 | `ctx.webhookRuntime`에 신뢰 규칙 등록 및 제공자 어댑터 마운트 |
| 파일시스템 접근 또는 정책 추가 | `ctx.fs` 제공자 등록 또는 `fs/*` 이벤트 구독 |
| 생성된 프로세스 격리 (샌드박스) | `ctx.sandbox` 백엔드 사용 (소비자가 생성 전 argv 래핑) |
| 요청, 도구, 턴 가로채기 | 해당 `agent/*` 또는 `tools/*` 이벤트 활용 (`agent/turn-stopping`으로 턴 중지 가능) |
| 모델 대상 컨텍스트 추가 | `agent.inject()` 호출 (다음 수락된 요청에 자동 반영) |
| UI 또는 코드 에디터 연동 추가 | `ctx.agents` 구동 및 `session/event` 기반 렌더링 |
| Web Client 채팅 노드 추가 | `ConversationNodeDefinition` 및 키 매핑 렌더러 등록 |
| 세션 상태 데이터 영속화 | `SessionEventMap` 확장 (로그 저장 및 재생 지원) |
| 세션 제목 자동 생성 | 단일 `ctx.sessionTitle` 제공자 등록 |
| 세션 내 단일 목표 관리 | `ctx.goals` 사용 (`agent/*`로 계속 진행) |
| 턴 경계에서 세션 포크 | `ctx.agents.create({ sessionId, seed, inheritedEventCount, meta: { isSeeded: true } })` — agent-loop가 발행한 세션만 영속화 |
| 새로운 백엔드에 세션 저장 | 공유 핸들 기반 구조 위에 `SessionPersistence`(`create`/`open`/`stat`/`list`/`export`) 구현 |
| 특정 에이전트로 등록 범위 한정 | 해당 에이전트의 `agent.ctx` 사용 |

[확장 패턴 가이드](cookbook/extension-cookbook.ko.md)는 각 기능이 어떤 seam에 해당하는지 정리하고 [패키지](cookbook/adding-a-package.ko.md), [도구](cookbook/adding-a-tool.ko.md), [LLM 어댑터](cookbook/adding-an-llm-adapter.ko.md), [설정 카드](cookbook/adding-a-settings-card.ko.md)의 단계별 추가 매뉴얼을 안내합니다. 채팅 노드 조립은 [대화 조립 하위 시스템](subsystems/conversation.ko.md)에서 담당합니다.
