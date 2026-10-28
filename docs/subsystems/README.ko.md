# 하위 시스템

[English](README.md) | [中文](README.zh.md) | 한국어

DeepSeek Harness의 하위 시스템마다 한 페이지: 무엇인지, 어떤 데이터 구조를 옮기는지, 그리고 `ctx` 서비스나 이벤트 범위가 뒤에서 받쳐 주는 곳에서는 그 서비스와 이벤트 참조를 담은 생성된 **Cordis API** 섹션이 있습니다. 이 폴더는 하위 시스템 전반의 *동작*(서비스 맵, 세션/턴/단계 수명 주기, 이벤트 분류 체계)을 설명하는 [architecture.md](../architecture.ko.md)를 보완합니다. 여기 있는 각 페이지는 하위 시스템 하나의 어휘와 배선을 위한 참조입니다.

| 페이지 | 담당 |
|---|---|
| [boot.md](boot.ko.md) | 현재 프로필의 플러그인 관리와 런처 재로드 조정 |
| [core.md](core.ko.md) | `packages/core`가 에이전트 루프를 제어하는 방식: 패키지별 루프 설명, 에이전트 생성과 소유(`AgentHandle`), `Agent` 핸들의 전달/취소/가로채기 계약, 저장소 전반의 타입 패턴(`…Map → derived-union`, 브랜드 id) |
| [llm-streaming.md](llm-streaming.ko.md) | `packages/llm`의 대화 타입 — `Message`/`ContentBlock`, 조립된 모델 요청, `StreamChunk` 와이어 프로토콜과 어댑터 계약, `BlockAssembler`, 그리고 `LlmAdapter` 제공자 계약 |
| [token-meter.md](token-meter.ko.md) | 소비 로그 개정을 반영하는 불변 스칼라 및 위치 기반 재생 측정값 |
| [scope.md](scope.ko.md) | 범위 지정 등록 정체성, 디스패치 캐리어, 소유된 `Scope` 컨텍스트 |
| [typert.md](typert.ko.md) | Remote 호출 디스크립터, 조회/Context 선언, Typert 레지스트리, 호스트 게이트웨이/클라이언트 API 경계 |
| [goal.md](goal.ko.md) | 영속 목표 정체성, 수명 주기 스냅샷, 활성화, 변경 기록, 라운드 귀속 |
| [schedule.md](schedule.ko.md) | 호스트가 소유하는 알림 기록, 영속 전이, 활성 및 종료 뷰, 일반 대화 전달 |
| [todo.md](todo.ko.md) | todo 패키지의 전체 목록 항목 타입, 영속 이벤트 소유, 프로젝션 |
| [deliverables.md](deliverables.ko.md) | 턴이 사용자에게 넘기는 것: `present`의 `PresentedFile` 전달과 git 스냅샷에서 만든 변경 파일의 호스트 제공 `WorkspaceChangesSummary` |
| [commands.md](commands.ko.md) | 사용자 명령 레지스트리 서비스: 정의, 어댑터 탐색, 직접 호출, 결과, 파싱 뷰 |
| [session.md](session.ko.md) | 전체 `SessionEventMap` 변형 카탈로그, `TurnEndReason`, `deriveMessages()`, 실행 인클로저, 독립 이벤트 |
| [working-directory.md](working-directory.ko.md) | 세션 실행 디렉터리, 영속 변경, 복구, 사용자 컨텍스트 |
| [worktrees.md](worktrees.ko.md) | 기존 권한 아래에서의 실험적 Git 브랜치 및 체크아웃 생성 |
| [persistence.md](persistence.ko.md) | 영속성 seam: `SessionPersistence`, JSONL 제공자, `session/flush`, 크래시 복구, `SessionHeader` |
| [settings.md](settings.ko.md) | 사용자 설정 seam: `SettingsNamespace` 등록, 계층 해석(기본값 → 구성 `base` → 사용자 문서), 소유자 범위, 핫 커밋 |
| [credentials.md](credentials.ko.md) | 자격 증명 seam: 구성에 담기는 `CredentialRef` 참조(값이 아님), 작업별 해석, UI에 안전한 `CredentialInfo`, 제공자 소스 계층 |
| [session-query.md](session-query.ko.md) | 논리 레코드, 제한된 정확 이벤트 읽기, 관계 추적, 시맨틱 필터/문서, 전체 텍스트 결과 페이지 |
| [feedback.md](feedback.ko.md) | 수명 주기에 묶인 메시지별 피드백 기록, 낙관적 버전, 사이드카 영속화, 호스트 Remote 계약 |
| [session-title.md](session-title.ko.md) | 영속 제목 스냅샷, 인용된 원본 메시지 seq, 비동기 제공자 계약 |
| [session-reference.md](session-reference.ko.md) | 구조화된 세션 간 참조: `SessionReferenceInput`/`Candidate`, 준비된 메시지 컨텍스트, 안정적인 오류 분류 체계 |
| [system-prompt.md](system-prompt.ko.md) | 조립별 컨텍스트, 도구 제공자 결과, 프롬프트 섹션, 협력적 조립 |
| [tools.md](tools.ko.md) | `ToolDefinition` 전체 필드, 스키마 DSL, `ToolExecution`/`ToolResult`, 도구 표시 UI 타입, 가드된 실행 파이프라인 |
| [mcp.md](mcp.ko.md) | 외부 MCP 연결, 범위 지정 도구와 리소스, 서버 지침, 프로토콜 결과, 구성 소유 |
| [user-questions.md](user-questions.ko.md) | UI 기반 사용자 질문/응답 seam: `AskUserQuestionRequest`, 응답/선택지 어휘, 제공자 API, 오류 분류 체계 |
| [approval.md](approval.ko.md) | 일회성 사용자 승인 seam: `ApprovalRequest`, `ApprovalOutcome`, 세션별 정책, 감사 이벤트, 응답자 계약 |
| [office-to-pdf.md](office-to-pdf.ko.md) | 승인된 Office-PDF 변환, 네이티브/WASM 엔진, 제한된 공유 재사용 |
| [attachment.md](attachment.ko.md) | 영속 이미지 정체성과 메타데이터, 검증 입력, 검증된 읽기, `AttachmentStore` seam |
| [shell.md](shell.ko.md) | 셸 실행기 seam: `ShellExecRequest`/`Spec`, `ShellRunResult`, 백그라운드 `ShellProcess` 핸들 |
| [subprocess.md](subprocess.ko.md) | 하위 프로세스 seam: 완전히 명시적인 `SubprocessSpawnSpec`, 오프셋 기반 출력 리더, 분류되지 않은 `SubprocessOutcome`, 관리되는 `DSH_*` 환경 어휘 |
| [ssh.md](ssh.ko.md) | POSIX SSH 연결과 원격 파일 시스템, 하위 프로세스 및 샌드박스 제공자 |
| [terminal.md](terminal.ko.md) | 영구 터미널 id, 백엔드/세션 계약, 전송 준비 상태, 제한된 읽기, 소유자가 볼 수 있는 스냅샷 |
| [sandbox.md](sandbox.ko.md) | 세션별 정책 해석과 프로세스 격리 seam: 파일 효과 모드, 실행/제공자 정책, `ConfinedArgv`, 적용과 실패 시 차단 오류 |
| [ptc-runtime.md](ptc-runtime.ko.md) | PTC 실행 seam: `PtcRunRequest`/`Result`, 바인딩 네임스페이스, 캡처된 로그, `PtcRunFailure` 분류 체계 |
| [computer-use.md](computer-use.ko.md) | 이름별 배타적 컴퓨터 사용 제공자 등록과 Cua Driver 통합 선택지 |
| [browser-use.md](browser-use.ko.md) | 이름별 배타적 브라우저 사용 등록, 제공자 선택지, 세션별 브라우저 소유 |
| [extensions.md](extensions.ko.md) | 버전이 지정된 동적 Cordis 플러그인과 패키지, 호스트/클라이언트 활성화, 승인, 런타임 검사, 수명 주기 정리 |
| [filesystem.md](filesystem.ko.md) | 파일 시스템 seam: `FsTarget`, 읽기/쓰기/편집 결과, 관찰된 파일 상태, `FsErrorCode` |
| [lsp.md](lsp.ko.md) | LSP 탐색 seam: `LspQueryRequest`/`Result`, `LspProvider`/`Service`, 네 가지 작업, `LspError` |
| [skills.md](skills.ko.md) | 스킬 서비스: 탐색 우선순위, `SkillSummary`/`SkillDefinition`, 세션 접두사 카탈로그, 모델 대상 `skill` 로딩 |
| [compaction.md](compaction.ko.md) | 압축 seam: `compaction/*` 세션 이벤트, `CompactionResult`, `CompactionEngine` 인터페이스 |
| [subagent.md](subagent.ko.md) | 서브에이전트 seam: 이름 있는 제공자 레지스트리, `SubagentStartRequest`/`Result`/`Run`, 시작 시점과 런타임의 기능 분리 |
| [voice-input.md](voice-input.ko.md) | 실험적 이름 지정 인식기, 일시적 오디오, 개정 가드된 초안 삽입 |
| [translation.md](translation.ko.md) | 실험적 익명 텍스트 번역과 명시적 제공자 요청 |
| [agent-team.md](agent-team.ko.md) | Agent Teams: 암묵적 Lead 정체성, 이름 있는 계속 가능한 팀원, 직접 peer 받은편지함 전달, 공유 작업 DAG |
| [claude-code-mods.md](claude-code-mods.ko.md) | 실험적 브리지를 통한 Claude Code mods: 모든 이벤트, `$` 멤버, 체인 규칙, 드로잉 기능, Claude Code와 다른 예제 모드 |
| [web.md](web.ko.md) | 웹 접근 seam: `WebSearchRequest`/`Result`, `WebFetchRequest`/`Result`, `WebFetchBody`, 제공자 가용성, `WebError` |
| [spill.md](spill.ko.md) | 스필 저장소 seam: `SaveTextSpill`, `SpillOwner`/`SpillSource`, `SpillRef`, 브랜드 타입 `SpillLocator` |
| [workflow.md](workflow.ko.md) | 워크플로 seam: `WorkflowStartRequest`, `WorkflowMeta`, `WorkflowRun`/`Result`, `workflow/*` 이벤트 페이로드, `WorkflowError`의 치명성 |
| [jobs.md](jobs.ko.md) | 백그라운드 작업 런타임: 브랜드 타입 `JobId`, 생산자 계약, 소비자 뷰, `ctx.jobs` 서비스 동작 |
| [permission-presets.md](permission-presets.ko.md) | 권한 프리셋 계층: `PresetSpec`/`PresetOption`, 파생된 `custom` 상태, 로그 전용 `permission/preset` 이벤트 |
| [plan.md](plan.ko.md) | 계획 모드: 로그 전용 `plan/mode` 상태, 대기 선택 플러시, `PlanModeConfig`, `exit_plan_mode` 검토 흐름 |
| [web-server.md](web-server.ko.md) | HTTP 캐리어: `WebRouteKind`/`WebRoute`, 매칭 순서, 클레임 가능한 폴백 자리, 인덱스 탭 |
| [webhook.md](webhook.ko.md) | 인증된 제공자 전달, 임의의 프로그래밍 방식 규칙, 결과를 기다리지 않는 워크스페이스 세션 생성 |
| [storage.md](storage.ko.md) | 저장소 하위 시스템: 백엔드 계약(`StorageBackend`), `StorageForms`, `DomainSpec`/`Domain`, `domain/changed` |
| [workspace.md](workspace.ko.md) | 워크스페이스 레지스트리: `Workspace`/`WorkspaceId`, 등록과 해석, 세션 `cwd` 관계 |
| [web-client.md](web-client.ko.md) | 브라우저 아키텍처: 부트, Remote 통신, 짝을 이룬 클라이언트 모델, UI 어댑터, 대화 조립, 슬롯, 재연결 의미 |
| [client-modules.md](client-modules.ko.md) | 웹 플러그인 표: `dsh.client` 선언, `WebBootGraph` 와이어 구성, 번들 라우트와 인덱스 탭 |
| [slots.md](slots.ko.md) | 타입 지정 웹 UI 구성: 선언 소유권, 카디널리티와 범위, 프레임워크와 기능 주입, props 파생, 배포된 계층 |
| [client-resources.md](client-resources.ko.md) | 클라이언트 리소스 모델: `dsh-resource://<type>/…` 주소, 프로토콜 제공자와 `ResourceProtocolMap`, `useResource` 전역 훅과 그 상태, 핀과 해제 |
| [sidebar-right.md](sidebar-right.ko.md) | 오른쪽 사이드바: 리소스와 탐색 주소, 탭 유형 등록과 라우팅, `ctx.sidebarRight` 탐색 서비스, 팬 탭 슬롯과 소유자 props, 리소스 모델, 워크스페이스 파일 서비스 |
| [conversation.md](conversation.ko.md) | 대상 중립적 세션 이벤트 조립: Context 정체성, Location 데이터, 재생 경로, 뷰 빌더, 대상이 소유하는 렌더 노드 |
| [session-projection.md](session-projection.ko.md) | 프로젝션 seam: `SessionProjectionMap`, 순수한 `ProjectionDefinition` 단위, `ProjectionSnapshot`의 일관된 절단, 변경 피드 |
| [session-telemetry.md](session-telemetry.ko.md) | 아웃바운드 세션 보고 기능 seam: `SessionTelemetryRecord`/`SessionTelemetrySeverity`, `SessionTelemetrySink` 계약, `session-telemetry/record` 가림 처리 워터폴 |
| [otel.md](otel.ko.md) | 공유 일반 이벤트 및 세션 로그 OTLP 채널 |
| [product-telemetry.md](product-telemetry.ko.md) | 명시적 제품 분석 제출과 OTLP/HTTP 전송 |

> 이 페이지들의 타입 선언과 JSDoc은 소스와 동등하며 `pnpm run verify-type-equiv`로 드리프트를 검사합니다([development.md](../development.ko.md#타입을-그대로-문서화하기ts-type-equiv) 참고). 일반 블록은 완전한 선언을 보존하고, `public-api` 블록은 본문을 제거한 공개 클래스 선언을 보존합니다. Cordis 서비스와 이벤트는 각 페이지의 생성된 **Cordis API** 섹션을 사용합니다.
