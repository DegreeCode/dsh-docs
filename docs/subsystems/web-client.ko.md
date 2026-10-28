# Web 클라이언트 아키텍처

[English](web-client.md) | [中文](web-client.zh.md) | 한국어

Web 클라이언트는 독립적으로 로드되는 플러그인으로 조립된 브라우저 측 Cordis 애플리케이션입니다. 그 아키텍처에는 재사용 가능한 기반 네 가지가 있습니다. [클라이언트 모듈](client-modules.ko.md)이 플러그인 그래프를 로드하고, [API 게이트웨이](../api-gateway.ko.md)가 타입 지정 호스트 통신을 제공하며, [슬롯](slots.ko.md)이 React UI를 조합하고, [Conversation](conversation.ko.md)이 세션 이력 창을 대상 소유 뷰로 바꿉니다. 이 페이지는 그 시스템들을 연결하고 클라이언트 모델과 기능 패키지가 어디에 속하는지 정의합니다.

[키보드 단축키](../../packages/client/shortcuts/README.md)는 창 로컬 명령 등록과 물리 키 디스패치를 소유하고, [단축키 참조](../../packages/client/ui-shortcuts/README.md)는 사용 가능한 명령과 로컬 입력 동작을 제시합니다. 명령 소유자는 런타임/플랫폼별 기본값을 선언하고 기존 동작을 마우스 제어와 공유합니다. 공유 모달 프리미티브가 최상위 레이어 Escape를 중재하고 포커스를 복원합니다.

## 계층과 소유권

| 계층 | 주요 소유자 | 책임 |
|---|---|---|
| 호스트 애플리케이션 | 비즈니스 서비스와 `packages/api/*-controller` 호스트 엔트리 | 권위 있는 상태, 영속화, 변경 순서, 접근 정책, 스트림 생성을 소유합니다. |
| 전송과 API 조립 | `client/connection`, `api/gateway`, `api/remotes` | 클라이언트 세대를 확립하고, 생성된 `ctx.remote` 메서드와 스트림을 노출하며, 선택된 Cordis 이벤트를 전달하고, 취소와 결과를 나릅니다. |
| 클라이언트 모델 | `api/session-controller/client`, `api/workspace-controller/client` | 호스트 상태의 React 없는 미러를 유지하고, 스트림/단항 경쟁을 해소하며, 객체 정체성과 구독을 소유하고, 좁은 명령 서비스를 노출합니다. |
| UI 어댑터 | `client/ui-session`, `client/ui-workspace` | 모델 옵저버블을 루트 또는 Provider에 결속된 세션 슬롯 소스로 변환하고, 뷰 수준 탐색과 상태 정책을 소유합니다. |
| Conversation 데이터 | `client/ui-conversation`, `ui-chat`·`ui-trajectory` 같은 대상 패키지 | 표준 이벤트와 컴팩트한 역사적 어시스턴트 실행을 독립 대상 스냅샷으로 조립하고, 공유 대화 셸과 입력 흐름을 소유합니다. |
| 구성과 렌더링 | `client/ui-slots`, `client/ui-renderer`, `client/ui-layout`, 기능 UI 패키지 | 확장 위치를 선언하고, 컴포넌트 props를 파생하며, 옵저버블을 React 훅에 결속하고, 최종 트리를 마운트합니다. |

의존 방향은 호스트 상태 → Remote 전송 → 클라이언트 모델 → UI 어댑터 → Conversation 또는 표시 → 슬롯 → React입니다. 사용자 동작은 주입된 클라이언트 서비스나 생성된 Remote 네임스페이스를 클로저로 잡는 콜백을 통해 되돌아옵니다. 표시 컴포넌트는 Cordis `ctx`, 전송 객체, 다른 기능 플러그인의 구현을 절대 받지 않습니다.

## 브라우저 부트

호스트는 조립된 `WebBootGraph`를 `window.__DSH_BOOT__`에 쓰고, 파서가 미리 로드한 스크립트가 실행되기 전에 브라우저 모듈 로더 파사드를 설치합니다. 모듈 시스템은 지연 CommonJS 테이블입니다. 즉 번들을 로드하면 그 팩토리가 등록되고, 엔트리를 구체화하면 플랫폼 모듈과 선언된 동적 의존성에 대해 동기 `require`로 팩토리를 실행합니다.

Web 부트 커널은 모듈 시스템을 만들고, `immediately` 엔트리를 미리 가져오고, 벤더링된 Cordis Loader를 마운트하며, 그래프의 모든 엔트리를 만듭니다. Cordis 서비스 주입이 활성화를 결정하고, 모듈 그래프 순서는 동기 import를 구체화할 수 있는지만 결정합니다. 전체 명부가 정착 상태에 도달하면 `ui-renderer`가 프레임워크 없는 부트 DOM을 하이드레이트하고 유일한 컨텍스트 수준 `renderSlot('root')` 연산을 호출합니다. 그래프, 번들 라우트, 캐시 개정, 로더 세부는 [클라이언트 모듈](client-modules.ko.md)이 소유합니다.

## Remote 통신

호스트 비즈니스 서비스는 호출 가능한 메서드에 Typert Remote 데코레이터를 붙입니다. 호스트 생성은 엄격한 디스크립터, 런타임 코덱, 선언 병합, 소스 맵을 출력합니다. 클라이언트 측 `api-remotes` 조립이 그 생성 기여를 선택하고 `ctx.remote.<namespace>`와 세션 범위 `agentCtx.remote.<namespace>` 아래에 구체 메서드를 마운트합니다. 기능 패키지는 게이트웨이 구현이나 호스트 패키지의 런타임 엔트리가 아니라 생성된 서비스 얼굴에 의존합니다.

Connection은 요청 URL 해석, 상관, `/api` 캐리어, 신뢰 검사, 정확한 Fetch 라우트, 연결 세대를 소유합니다. API 게이트웨이는 Remote 디스패치, 취소, 논리 스트림, 선택된 호스트 이벤트 전달을 소유합니다. 컨트롤러 연산은 생성된 Remote 메서드나 명시적 Remote 스트림에 속하고, 기능 소유 다운로드는 정확한 Fetch 라우트를 등록합니다. 세대와 호출은 [API 게이트웨이 참조](../api-gateway.ko.md)가, 물리 캐리어와 신뢰 정책은 [Connection README](../../packages/client/connection/README.md)가 정의합니다.

내부 `$events` 논리 스트림이 Connection 세대 소스입니다. 그 여는 `ready` 프레임은 경로 표시에 쓰는 호스트 홈을 담고, 호스트 리스너가 붙은 뒤 어떤 컨트롤러도 기준선 읽기를 시작하기 전에 세대를 확립합니다. `ctx.remote.$on()`은 허용 목록에 있는 일반 이벤트를 루트 클라이언트 컨텍스트에, 범위 지정 워터폴 이벤트를 해석된 세션 컨텍스트에 전달합니다. 워터폴 리스너는 결과를 반환하거나 `next()`를 호출하거나 거부합니다.

## 클라이언트 모델

각 API 컨트롤러 패키지는 짝을 이룬 호스트와 클라이언트 얼굴을 소유합니다. 호스트 측은 권위 있는 변경과 스트림 생성을 소유합니다. 클라이언트 측은 같은 생성 와이어 타입 위에 정체성이 안정적인 React 없는 모델을 소유하고, 관찰 가능한 스냅샷과 명령을 노출합니다. UI 패키지는 이 클라이언트 서비스를 소비하며 컴포넌트 스토어에 전송 상태를 재현하지 않습니다.

### 세션

[`api/session-controller`](../../packages/api/session-controller/README.md)는 목록, 검색, 생성, 프롬프트, 큐, 취소, 페이지 처리, follow/control 스트림에 대한 호스트 명령을 노출합니다. 그 클라이언트 측은 `ClientSessions → SessionManager → Session`으로 구성됩니다:

- `ClientSessions`는 `ctx.sessions`를 제공하고, 참조, 소스 개수, 세션 범위, 안정적인 `SessionBinding` 객체를 소유하며, 전역 현재 세션을 선택하지 않고 카탈로그 상태를 투영합니다.
- `SessionManager`는 목록 기준선, 라이브 목록/제어 갱신, 지연 세션 인스턴스, 프로젝션 스토어, 서브에이전트 카탈로그, 풀과 이후 갱신 사이의 충돌 순서를 소유합니다.
- 각 `Session`은 `SessionEventLikeEntry` 값으로 표현되는 연속 논리 이벤트 창 하나와 페이지 처리, follow, 프롬프트/제어 상태, 어댑터가 소비하는 관찰 가능한 스냅샷을 소유합니다.

영속 이벤트 경로는 `follow()`를 엽니다. 그 첫 프레임은 현재 헤더, 꼬리 페이지, 커서, 완전한 프로젝션 기준선을 담습니다. 이력 레코드는 명시적 `event` 또는 `chunks` 판별자와 정렬된 내부 `event`를 가지며, 저널이 각 포괄적 논리 시퀀스 범위를 검증한 뒤 클라이언트가 레코드별 변환 없이 그 레코드를 `SessionEventLikeEntry` 값으로 보유합니다. 각 물리 세대는 그 스냅샷에서 보유 창을 원자적으로 교체하고, 이후 표준 라이브 이벤트가 시퀀스로 덧붙습니다. `page()`는 더 오래된 이력과 갭 복구를 위해 예약되어 있습니다. 일시적 제어 스트림은 세대마다 완전한 기준선으로 시작한 뒤 프로젝션 갱신을 적용합니다.

### 워크스페이스

[`api/workspace-controller`](../../packages/api/workspace-controller/README.md)는 워크스페이스 변경 정책과 권위 있는 follow 피드를 호스트에 유지합니다. `ClientWorkspaceModel`은 브라우저 행, 워크스페이스 순서, 보관 및 고정된 세션 id 배열, 명령 에코, 스트림/단항 경쟁 해소를 소유합니다. 모든 스트림 세대는 완전한 기준선으로 시작한 뒤 `upsert`, `remove`, `order`, `archived`, `pinned` 증분이 이어지며, 재연결은 새 기준선으로 모델을 대체합니다. `WorkspaceController`가 그 모델을 `ctx.workspaces`로 노출하고, `ui-workspace`가 `useWorkspaces`와 탐색 콜백을 기여합니다. 사이드바의 `ArchivedFilter`는 목록과 검색에서 기본 숨김, 표시, 보관 전용 행을 제어합니다. 보관된 행은 순서 슬롯을 유지하고 회색으로 렌더링되며, 행이나 검색 결과의 보관 해제 동작으로 복원하기 전에는 열 수 없습니다. 복원은 `workspace.unarchiveSession`을 호출하고, 그 완전한 보관 집합이 단항 응답과 `archived` 증분을 통해 클라이언트에 도달합니다. 세션 표시 순서는 브라우저 로컬이며 숨겨진 보관 항목을 포함합니다. 고정은 그 전체 순서 안에서 세션을 옮기고, 고정 해제는 이전 위치를 복원하지 않습니다.

이 짝짓기는 비즈니스 진실의 두 번째 소스가 아닙니다. 호스트 컨트롤러가 영속 상태와 변경 결과를 결정하고, 클라이언트 모델은 최신의 사용 가능한 로컬 투영을 유지하며, 렌더링에 유용한 곳에서 객체 정체성을 보존하고, 지연된 응답과 교체 기준선이 병합되는 방식을 인코딩합니다.

## Conversation과 표시

Web과 데스크톱은 [Coding Tools 기본 설정](../../packages/client/ui-settings/README.md#use-this-package)을 공유합니다. 이 설정은 세션 레코드를 바꾸지 않고 진단 뷰, [사용 가능한 프리셋 선택지](../../packages/client/ui-agent-preset/README.md), 변경 파일 카드, 내장 HTML 미리보기 정책을 제어합니다.

`ui-session`은 세션 범위 어댑터를 설치하고 [remote-access](../../packages/api/remote-access/README.md) 클라이언트 서비스 위에 `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess`, `useSession`, `sessionId`, `useProjection`, 세션 범위 `useAccess`를 게시합니다. `SessionProvider`는 바깥 바인딩을 상속하거나 명시적 `SessionReference`를 결속하므로, 동시 하위 트리가 서로 다른 세션을 대상으로 할 수 있습니다. 도메인 어댑터는 모델 객체에 React 훅을 얹지 않고 추가 표준 소스를 더합니다.

`ui-conversation`은 각 `SessionBinding.eventSource`에 한 번 결속합니다. 그 이벤트 레지스트리는 영속 세션 이벤트와 클라이언트 전용 `assistant/live-chunk` 갱신을 안정적인 비즈니스 컨텍스트로 상관시키고, 뷰 레지스트리는 대상 스냅샷을 구체화합니다. Chat 어시스턴트, Trajectory 어시스턴트, 턴 꼬리는 라이브 청크와 영속 턴 확정(settlement)에 내장된 컴팩트 스트림을 모두 해석하므로, 재연결과 페이지 처리된 이력이 영속 토큰 행 없이 같은 어시스턴트 상태를 재현합니다. `ui-chat`과 `ui-trajectory`는 별도 Definition과 빌더를 등록합니다. 같은 이벤트 패밀리를 해석할 수 있지만 서로의 최종 표시 모델을 import하거나 공유하지는 않습니다. 셸은 등록된 뷰를 선택하고 그 스냅샷을 표준 훅과 슬롯을 통해 전달합니다. 컨텍스트 정체성, 재생, Location 데이터, 대상 빌더, 키 지정 렌더러는 [Conversation](conversation.ko.md)이 정의합니다.

`ui-slots`는 타입 지정 레지스트리와 수명 주기 원장을 제공하고, `ui-renderer`는 순수 옵저버블을 `useSyncExternalStore`로 결속하고 React 컨텍스트를 소유하며 루트 트리를 렌더링하는 유일한 패키지입니다. 기능 컴포넌트는 파생된 props를 통해 프레임워크 훅, 소유자 props, 스토어 동작, 명시적 주입을 받습니다. 그 입력, 확장 API, 현재 슬롯 계층은 [Web 클라이언트 슬롯](slots.ko.md)에 나열되어 있습니다.

## 데이터 경로

| 경로 | 시퀀스 |
|---|---|
| 영속 세션 표시 | 호스트 세션 로그 → 패킹된 Remote `follow`/`page` 이력 → 클라이언트 `SessionEventLikeEntry` 창 → Conversation 컨텍스트 → 대상 스냅샷(`chat`, `trajectory` 또는 다른 등록 대상) → 슬롯 뷰 → React |
| 일시적 세션 제어 | 호스트 제어 기준선 → Remote 스냅샷 스트림 → `SessionManager` 프로젝션 스토어 → 세션 및 목록 스냅샷 → 표준 훅 → 컴포넌트 |
| 백그라운드 작업 | 호스트 작업 레지스트리 → `job.list` / `job.follow` → [`ClientJobs`](../../packages/api/job-controller/README.md) 명부와 출력 뷰 → 작업 목록과 패널 |
| 워크스페이스 상태 | 호스트 워크스페이스 기준선과 증분 → `ClientWorkspaceModel` → `ctx.workspaces.list` → `useWorkspaces` → 사이드바, 히어로, 탐색 항목 |
| 범위 지정 상호작용 | 호스트 Cordis 워터폴 → API Remotes `$events` → 세션 컨텍스트의 `ctx.remote.$on()` → 소유 UI 패키지 → 결과 또는 `next()` |
| 사용자 명령 | 컴포넌트 콜백 → 등록된 주입 인터페이스 또는 슬롯 소유자 → `ctx.sessions`, `ctx.workspaces` 또는 생성된 범위 지정 Remote → 호스트 컨트롤러 → 권위 있는 갱신 → 스트림 또는 이벤트 프로젝션으로 클라이언트에 회귀 |

## 재연결

물리 복구와 논리 복구는 별개입니다. 게이트웨이 mux가 물리 WebSocket을 복원하고, 각 `RemoteStream`은 Connection이 사용 가능한 세대를 게시하면 자신의 논리 소스를 다시 엽니다. 캐리어 실패는 재시도 가능하지만, 비즈니스 오류, 잘못된 여는 항목, 프로토콜 위반은 소유 논리 스트림에 치명적입니다.

복구는 데이터의 시맨틱을 따릅니다:

- 영속 세션 저널은 논리 시퀀스 범위를 검증하고 모든 세대의 여는 스냅샷에서 창을 교체하며, `page()`가 더 오래된 이력을 공급하고 이후 범위 갭을 복구합니다.
- 세션 제어 스트림과 워크스페이스 스트림은 연결이 끊긴 동안 마지막 게시 값을 유지한 뒤 새 여는 기준선에서 원자적으로 교체합니다.
- 일반 전달 알림은 재생되지 않습니다. 상태 기반 도메인에는 기준선, 커서 또는 명시적 질의가 필요하며, 범위 지정 워터폴은 자체 요청 수명을 유지합니다.

모놀리식 클라이언트 `Runtime`, `HostFrame`, `events.mux`, `events.host`, 범용 `resync()` API는 없습니다. Connection은 세대 상태를 노출하고, 게이트웨이는 논리 스트림 감독을 소유하며, 각 클라이언트 모델이 자기 데이터에 맞는 교체 또는 재개 시맨틱을 정의합니다.

## 패키지 경계

기능 플러그인 패키지는 `import type`으로 선언을 공유할 수 있지만, 다른 기능 플러그인의 값을 런타임 import하거나 다시 내보내지 않습니다. 패키지 간 동작은 주입된 Cordis 서비스를 쓰고, 패키지 간 UI는 슬롯을 씁니다. 대상별 Conversation Definition, 프로젝션 헬퍼, 최종 뷰 데이터는 Chat과 Trajectory가 의도적으로 병렬 로직을 구현하더라도 그 대상 패키지에 남습니다.

공유 런타임 값에는 기능 수명 주기가 없는 좁은 정적 소유자가 필요합니다. 예를 들어 `client/store`, `ui-primitives`, 브라우저 안전 유틸리티 패키지입니다. 전송과 생성 API 조립은 하나의 프로토콜을 조립하는 것이 명시적 책임이므로 런타임 기여를 import할 수 있습니다. 기능 패키지는 이 규칙을 우회하려고 `dsh.client.external`을 추가하지 않습니다.

추가하는 확장에 따라 네 가지 상세 참조를 사용하세요:

- 패키지 탐색, 로딩, 공유 모듈 정체성, 부트 순서에는 [클라이언트 모듈](client-modules.ko.md)을 봅니다.
- 호스트 메서드, 생성된 Remote 기여, 스트림, 전달된 이벤트에는 [API 게이트웨이](../api-gateway.ko.md)를 봅니다.
- 컴포넌트, 훅, 스토어, 주입, 배치에는 [Web 클라이언트 슬롯](slots.ko.md)을 봅니다.
- 영속 이벤트 상관, 대상 스냅샷, Chat 또는 Trajectory 뷰 기여에는 [Conversation](conversation.ko.md)을 봅니다.
