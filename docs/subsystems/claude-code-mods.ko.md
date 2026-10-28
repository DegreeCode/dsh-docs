# Claude Code mods: 호환성

[English](claude-code-mods.md) | [中文](claude-code-mods.zh.md) | 한국어

이 브리지를 통해 mod가 Claude Code에서와 다르게 동작하는 모든 지점입니다(Claude Code 2.1.287 기준, [mods 참조](https://code.claude.com/docs/en/plugins/mods/reference) 및 그 `claude-code.d.ts`, 그리고 2026-10-01 [Claude Code mods 시작하기](https://claude.dev/blog/getting-started-with-claude-code-mods/) 글). 각 행은 Claude Code의 동작, 이 브리지의 동작, 그 이유나 후속 작업을 적습니다. 여기 없는 것은 참조가 설명하는 대로 동작합니다. 이 호스트가 결코 발생시키지 않는 이벤트의 훅은 mod 로드 시 경고로 이름이 나열되고, 제공되지 않는 테이블 밖의 `$` 호출은 `no implementation for <namespace>.<method>`로 거부됩니다.

## 패키징과 로딩

| Claude Code | 이 브리지 | 이유 또는 후속 작업 |
|---|---|---|
| `.claude-plugin/plugin.json`과 훅 모듈 하나를 지목하는 `hooks/hooks.json`을 가진 플러그인 디렉터리; `claude --plugin-dir`, 마켓플레이스, `/plugin install` | mod는 플러그인입니다. `defineMod({ name, version, root, userConfig, register })`가 훅 모듈을 감싸고 브리지 뒤에서 cordis.yml을 통해 마운트합니다. `plugin.json`과 `hooks.json`은 읽지 않습니다 | mod는 모든 DSH 플러그인이 쓰는 하나의 구성 메커니즘에 합류합니다. 예제 디렉터리는 매니페스트를 유지하므로 `claude --plugin-dir`에서도 실행됩니다 |
| `plugin.json`의 `userConfig` 스키마와 타입 지정 기본값; 로드 시 옵션 검증 | `userConfig`는 `defineMod` 스펙의 기본값 객체입니다. 플러그인의 cordis.yml `config`가 이를 덮고, 문자열, 숫자, 불리언, 문자열 목록의 레코드로 검증됩니다 | 매니페스트를 읽지 않습니다 |
| 계층(`user`, `project`, `managed`)과 `next.to(e, tier)` | 모든 mod는 `user`로 로드됩니다. 테스트에서 `tier()`는 받아들이고 무시하며, `next.to`는 거부합니다 | 관리형 설정은 DSH 개념이 아닙니다 |
| 편집 시 훅 모듈 핫 리로드; `claude plugin validate`, `claude plugin test`, `types/index.d.ts`에서 타입 생성 | 그런 명령은 없습니다. 리마운트는 같은 평가된 모듈에서 `register`를 다시 실행하므로 모듈 수준 변수는 값을 유지합니다 | 후속 작업은 요청 시에만. 테스트 킷의 `createModTestKit`이 Vitest 안에서 `claude plugin test`를 대체합니다 |
| 훅 모듈은 TypeScript일 수 있음 | `.ts` 훅 모듈은 런처가 트랜스파일하는 곳에서만 로드됩니다(소스 실행은 그렇고, 빌드된 설치는 아닙니다) | DSH는 순수 Node를 배포합니다 |
| mod는 `$`를 호스트 접근의 유일한 통로로 삼아 프로세스 내에서 실행 | 훅 모듈은 Node 전역과 접근 규칙 없이, 프로세스의 전체 권한으로 프로세스 내에서 실행됩니다. `$.env`는 하네스 환경을 읽고 쓰고, `$.http.fetch`는 어떤 URL에도 도달하며, `$.fs`와 `$.tool.call`은 세션으로서 동작합니다 | mod에는 샌드박스가 적용되지 않습니다. 플러그인으로 실행할 mod만 마운트하세요 |
| `import type { … } from 'claude-code'`, `declare module 'claude-code' { interface PluginState }` | `claude-code` 모듈 이름은 이 저장소의 테스트 설정 안에서만 브리지 타입으로 해석됩니다. 그 밖의 mod는 `@deepseek-ai/dsh-experimental-claude-code-mods`를 가져옵니다 | 타입 이름은 브리지 자신의 것입니다 |
| `hooks.json`의 `settings hooks`가 mod 훅과 나란히 실행 | 실행되지 않습니다. 그것들을 위해 `@deepseek-ai/dsh-hooks-claude-code`를 마운트하세요 | 다른 브리지입니다 |

## 이벤트

| 이벤트 | Claude Code | 이 브리지 |
|---|---|---|
| `session.start` | 세션당 한 번, 첫 프롬프트 전에 발생 | 루트 에이전트에 대해 `agent/created`에서 발생하고 첫 턴 전에 await됩니다. 서브에이전트에는 발생하지 않습니다 |
| `session.end` | 세션당 한 번 발생 | 루트 에이전트에 대해 `agent/disposed`에서 발생합니다. `$.state`는 훅의 실행이 완료(settle)될 때까지 읽을 수 있습니다 |
| `prompt.submit` | `e.text`는 입력된 프롬프트입니다. `context` 항목은 입력된 프롬프트 뒤에 각각 하나의 블록이 되고, 플러그인이 제출한 프롬프트는 `origin: { kind: 'plugin', name }`을 담습니다 | 같습니다. `e.text`는 수용된 배치에서 사람 자신의(`user` 출처) 메시지 텍스트 블록을 합치고, 주입된 컨텍스트만 있는 배치는 아무것도 발생시키지 않으며, `$.prompt.submit`이 큐에 넣은 프롬프트는 제출한 mod를 출처로 담습니다 |
| `turn.start`, `turn.complete` | 턴마다. 서브에이전트 턴은 `agentId`를 담습니다 | 같습니다. `turn.complete`의 `{ text }`는 답변 아래 줄이 아니라 호스트 로그에 도달하고, `durationMs`는 `turn/start`부터 셉니다 |
| `tool.call` | Claude Code의 권한 검사 전에 실행됩니다. `next({ ...e, command })`는 도구가 실행되는 인자를 다시 쓰고, `next({ ...e, tool })`은 호출을 다른 곳으로 돌립니다 | 하네스 권한 결정 후 `tools/execute`를 감쌉니다. 인자를 다시 쓰거나 다른 도구를 지목하는 훅(또는 `.catch` 핸들러)은 보고와 함께 건너뜁니다. 인자 경우는 [도구 실행 전 입력 재작성 제안](../../.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md)을 지목합니다. 기록된 호출은 기록된 대로 실행되기 때문입니다. `{ deny }`, `{ result }`, 관찰, `next` 후 결과나 `isError` 재작성은 설명대로 동작합니다 |
| `command.run` | mod가 등록한 명령에 대해 실행 | 같습니다 |
| `ui.render` | 모든 렌더 지점(`AbovePrompt`, `Pane`, `ToolUse`, `AssistantMessage`, `Spinner`, …)에 대해 발생 | `AbovePrompt`에만, 세션 밴드의 다시 그리기마다 한 번 발생합니다. `Pane` 훅은 테스트 킷의 `$.ui.mount({ component: 'Pane' })`를 통해서만 실행됩니다 |
| `tool.check`, `tool.describe`, `tool.list`, `tool.register` | 도구 목록과 권한을 형성 | 발생하지 않습니다. `$.tool.register`와 `$.tool.list`는 `$` 호출로 제공됩니다 |
| `turn.step` | 모델 단계마다 | 발생하지 않습니다 |
| 그 밖의 모든 참조 이벤트: 다른 `prompt.*` 이벤트, `skill.prompt`, `attribution.text`, `command.describe`, `config.*`, 다른 `session.*` 이벤트, `agent.*`, `plugin.register`, `engine.create`, `telemetry.*`, `ui.resolve`, `ui.press`, `ui.input`, `ui.select`, `ui.focus`, `ui.scroll`, `ui.close`, `ui.message` | 엔진이 발생 | 등록되지만 발생하지 않으며, 로드 시 경고에 이름이 나열됩니다 |
| `classic.*` | 클래식 설정 훅을 이벤트로 | 알 수 없는 이벤트 이름과 마찬가지로 `register`에서 거부됩니다 |
| `<namespace>.<method>` op 이벤트(`fs.read`, `store.set`, …) | 나중에 로드된 mod의 `$` 호출이 먼저 로드된 mod에 도달합니다 | 같습니다. `tool.call`은 대신 도구 파이프라인을 통해 도착합니다 |

## 체인

| Claude Code | 이 브리지 | 이유 |
|---|---|---|
| 훅이 `next`를 두 번 이상 호출할 수 있고, 각 호출이 아래 체인을 다시 실행 | `next`는 한 번 실행됩니다. 두 번째 호출은 첫 실행의 결과를 반환합니다 | 기록된 호출당 도구 실행 하나 |
| 훅이 `next`가 아직 실행 중일 때 답하는 경우 | 하위 실행을 await한 뒤 훅의 응답이 완료(settle)됩니다. 응답 이후 하위의 실패는 보고됩니다 | 이벤트가 시작한 작업이 하나도 실행 중이지 않을 때만 완료(settle)됩니다 |
| 자체 시간 예산 10초, `.catch`에 1초, `next`와 `$` 호출 내부 시간은 `$.clock.sleep`을 제외하고 제외 | 같으며 구성 가능합니다(`hookTimeoutMs`, `catchTimeoutMs`) | — |
| 결과 객체를 반환하지 않으면 실패 | 같습니다. `null`은 답으로 허용됩니다(표면을 비워 그림) | 그릴 것이 없는 `ui.render` |
| 결과의 알 수 없는 필드는 버려지고 잘못된 타입은 훅을 실패시킴 | 잘못된 타입을 가진 `prompt.submit` 결과는 원문 텍스트와 문자열 컨텍스트 줄만 유지합니다 | 부분 결과가 흔한 유일한 이벤트에서 관대합니다 |

## `$` 멤버

| 네임스페이스 | Claude Code | 이 브리지 |
|---|---|---|
| `$.plugin` | `name`, `root`, `tier` | `defineMod` 스펙의 `name`, `root` |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `log`, `toast`, `status`, `notice`, `ask`, `blit`, `copy`, `press`, `input`, `select` | `resolve`, `invalidate`, `open`, `close`, `panes`, `log`, `toast`, `status`, `ask`. `open`은 이유와 함께 `{ isPlaced: false }`로 답하고 밴드를 다시 그립니다. `log`, `toast`, `status`는 호스트 로그에 도달하고, 나머지는 거부합니다 |
| `$.command` | `register`, `run`, `list` | 같습니다. 아무도 응답하지 않는 명령의 `run`은 등록한 mod를 지목하며 거부합니다 |
| `$.tool` | `register`, `call`, `list` | 같습니다. 등록된 도구는 `mcp__<plugin>__<tool>`입니다. `call`은 하네스 파이프라인을 실행하고 도구의 지연 컨텍스트를 세션에 주입합니다 |
| `$.prompt` | `submit`, `compose` | `submit`만. 메시지는 `user` 출처이고, `asUser`가 아니면 `Message from the "<plugin>" mod:`로 프레이밍되며, 그것이 발생시키는 `prompt.submit`은 mod를 출처로 지목합니다 |
| `$.session` | `id`, `cwd`, `root`, `repo`, `model`, `turns`, `messages`, `usage`, `version`, `send`, `append`, `authorize`, `compact`, `surfaces` | `id`, `cwd`, `root`, `model`, `turns`, `messages`, `usage`, `version`. `cwd`는 커밋된 현재 디렉터리를 보고하고, `root`는 원래 프로젝트를 유지합니다. `usage.context.window`는 토큰 미터가 라우트의 창을 알기 전까지 `0`이고 `percent`는 없으며, `rateLimits`는 비어 있고, `version`은 이 브리지를 지칭합니다 |
| `$.state` | 세션별, 핫 리로드를 견딤 | 세션별, 메모리에 저장. `ui.render` 중 읽기는 밴드를 그 슬롯에 구독시킵니다 |
| `$.store` | 플러그인별, 영속 | 같으며, `claude_code_mods` 저장소 도메인에서 플러그인당 4 MiB입니다 |
| `$.clock` | `now`, `sleep`, `after`, `every`; 타이머는 플러그인과 함께 종료 | 같습니다. 타이머는 그 이벤트를 예약한 세션과도 함께 종료되고, `sleep`은 이벤트가 취소되면 거부합니다 |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors` | `ancestors`를 뺀 모두. 파일당 4 MiB, `stat.mtimeMs`는 `0`입니다 |
| `$.process` | `run`, `spawn` | `run`만, 셸 없는 argv, `processTimeoutMs` 기본값 |
| `$.http` | `fetch` | 같으며 본문은 최대 4 MiB입니다 |
| `$.env` | `get`, `set` | 같습니다. 프로세스 환경은 모든 세션과 플러그인이 공유합니다 |
| `$.model`, `$.agent`, `$.config`, `$.settings`, `$.mcp`, `$.audio`, `$.telemetry`, `$.turn` | 제공됨 | `no implementation`으로 거부합니다. `$.model.complete`는 기록되는 사이드 요청 이벤트를 기다립니다 |

## 그리기

| Claude Code | 이 브리지 |
|---|---|
| `Box`, `Text`, `Button`, `Input`, `Spacer`, 그리고 호스트 자체의 엘리먼트 종류 | `$.ui.resolve(e)`의 `Box`, `Text`, `Button`. 트리가 검증되고, `Button`의 `onPress`는 그리기별 액션 id 뒤에서 호스트에 남습니다 |
| `Box` props: `flexDirection`, `padding*`, `gap`, `border*`, `width`, `height`, `overflow`, `scroll` | `flexDirection`, `padding`, `paddingX`, `paddingY`, `gap`, `border`, `borderColor`. 나머지는 직렬화되고 Web 밴드는 무시합니다 |
| `Text` props: `color`, `bold`, `dimColor`, `italic`, `underline`, `wrap`, `truncate` | `color`(터미널 팔레트 이름), `bold`, `dimColor`, `italic`, `underline`. Web 밴드는 줄바꿈합니다 |
| `Button` props: `label`, `hotkey`, `disabled`, `onPress`; 숫자 키를 누르면 핫키가 무장됨 | `label`, `hotkey`(힌트로 표시), `disabled`, `onPress`(클릭) |
| 밴드는 인스턴스 하나이며 `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`가 터미널을 반영 | 세션당 인스턴스 하나이며 mod 로드 순서로 조회합니다. `bodyColumns`와 `viewport.columns`는 브리지의 `bandColumns`(기본 `120`), `maxRows`는 `bandRows`(기본 `10`), `hasSurvey`와 `isWorking`은 `false`입니다. Web 밴드는 스크롤 대신 줄바꿈합니다 |
| 밴드는 호스트 프레임과 렌더가 읽은 `$.state` 값이 바뀔 때 다시 그려짐 | `session.start` 후, 마지막 그리기가 읽은 `$.state` 값이 기록될 때, `$.ui.open`, `$.ui.close`, `$.ui.invalidate` 후, 각 `tool.call` 체인과 `turn.complete` 완료(settle) 후, 그리고 누름 후에 다시 그립니다. 다른 시점에 모듈 수준 상태를 바꾼 mod는 다음 트리거에서 그것을 그립니다. 누름은 시간 제한 없이 `onPress`를 실행합니다 |
| `focus`, `scroll`을 가진 `Pane`이 트랜스크립트 옆에 도킹됨 | 페인은 없습니다. `$.ui.open`이 `{ isPlaced: false }`로 답하므로 mod는 밴드로 폴백하고, 테스트 킷이 `Pane` 훅을 직접 마운트합니다 |
| 핫키, `TextInput`, 포커스, 스크롤, `ui.press`, `ui.input`, `ui.select` | 제공되지 않음. 후속 작업 |

## 테스트

| `claude-code/testing` | 이 브리지 |
|---|---|
| `describe`, `test(name, ($, on) => …)`, `expect`, `mock`, `tier` | 이 저장소 안에서는 같은 모듈 이름이 Vitest 위에서 그것들을 제공합니다. `test`는 테스트 파일 위치에서 mod를 추론하며(`<mod>/tests/*.test.ts` → `<mod>/index.ts`), `defineModTests`가 이를 덮습니다. 저장소 밖에서는 `createModTestKit`과 `mock`을 `@deepseek-ai/dsh-experimental-claude-code-mods/testing`에서 가져옵니다 |
| `on`은 엔진의 답을 스텁하고, 킷은 `ui.*`에 스스로 답함 | 같습니다. `ui.open`은 `{ isPlaced: false }`로 답하고 `ui.invalidate`와 `ui.close`는 성공합니다. `session.cwd`, `process.run`, `fs.*`, `store.*`, `env.*`에는 스텁이 필요합니다(`mock.store`, `mock.env`, `mock.clock`이 네임스페이스 전체에 답합니다) |
| `$.ui.mount({ plugin, surface, component, props })` → `find`, `findAll`, `press`, `unmount` | 같으며 `tree()`와 `text()`가 추가됩니다. 모든 읽기는 로드된 모든 mod의 훅을 통해 새로 렌더링합니다. `plugin`과 `surface`는 소스 호환을 위해 받아들입니다 |
| 테스트에서 훅 예산 5초 | 같습니다(`budgetMs`) |

## 예제 mod

| Mod | 소스 | 이 브리지를 통한 동작 |
|---|---|---|
| Token Weather | 글의 모듈, 타입 계약, 테스트를 변경 없이 | 게시된 대로 실행됩니다. 테스트의 `as any` 캐스트 세 개는 킷이 타입 지정되어 있어 제거했습니다. `$.session.usage`에서 토큰 미터를 통해 밴드에 그립니다 |
| Blast Radius | 글의 `tool.call` 훅을 변경 없이; `classify`, `measure`, 트리는 글의 설명에 맞게 완성 | 실제 `sleep` 폴링으로 명령을 붙잡고, 밴드에 보고서를 그리며(`isPlaced: false`), Proceed 또는 Cancel이 결정합니다. Token Weather보다 먼저 로드하세요 |
| Replay Theater | 글의 훅 다섯 개를 변경 없이; `stepsFor`, diff, `openReplay`, 페인, 힌트를 완성 | Edit와 Write 호출을 기록하고, 턴 뒤에 밴드에 힌트를 내며, 페인이 배치되지 않으므로 밴드에서 diff를 단계별로 넘깁니다 |
| `diff` ([anthropics/claude-code](https://github.com/anthropics/claude-code/tree/main/mods/diff), `52c7644`에서 읽음) | TypeScript, 약 570개 파일, 훅 `command.run`, `prompt.submit`, `session.start`, `tool.call`, `ui.close`, `ui.focus`, `ui.render`, `ui.scroll` | 실행 불가. `$.settings.read`, `$.telemetry.*`, 페인 위의 `$.session.messages`, `ui.focus`와 `ui.scroll` 이벤트, 배치된 `Pane`이 필요합니다. 읽어서 평가했으며, 저장소 약관이 픽스처 사본을 허용하지 않습니다 |
| `agents-md` (같은 저장소) | 훅 `agent.spawn`, `prompt.context`, `session.start`, `tool.call` | 실행 불가. `prompt.context`와 `agent.spawn`은 발생하지 않고 `$.fs.ancestors`, `$.telemetry.*`는 제공되지 않습니다 |
| `sec-default` (같은 저장소) | 훅 `tool.check`, `prompt.compose`, `settings.read`, `classic.*`, `plugin.register`, … | 실행 불가. 이 호스트가 발생시키지 않는 이벤트 위의 관리형 계층 정책입니다 |
| `telemetry` (같은 저장소) | 훅 `engine.create`, `telemetry.*`, `session.start`, `session.end`; `$.session.repo`, `$.settings.read` 호출 | 실행 불가. `telemetry.*`와 `engine.create`는 발생하지 않고 두 `$` 멤버는 제공되지 않습니다 |

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxclaudecodemods--claudecodemods"></a>

### `ctx.claudeCodeMods` — `ClaudeCodeMods`

The bridge service: loaded mods, their hooks, and the harness listeners that raise their events. Mods join through ClaudeCodeMods.add, which defineMod calls when a mod plugin mounts. The Remote methods let a Client draw each session's band above the prompt and press its buttons.

```ts cordis-catalog
/**
 * Watch the band above the prompt of one session: the current drawing, then
 * every redraw, until the Client stops watching.
 * @param agent - the session's agent, resolved by the Gateway.
 * @param signal - carrier cancellation.
 * @returns the band's snapshots.
 */
@Remote({ mode: 'stream' }) watchBand(agent: Agent, signal: AbortSignal): AsyncIterable<SurfaceSnapshot>

/**
 * Press a button of the band's current drawing: runs the mod's `onPress` and redraws.
 * @param agent - the session's agent, resolved by the Gateway.
 * @param generation - the drawing the Client saw.
 * @param actionId - the button's action id in that drawing.
 * @returns the snapshot after the press.
 */
@Remote pressBand(agent: Agent, generation: number, actionId: string): Promise<SurfaceSnapshot>

/**
 * Load one mod beneath every mod loaded before it: run its `register`,
 * keep its hooks, and report which of its events this host never raises.
 * @param definition - the mod as its plugin defined it.
 * @returns the disposer that removes the mod's hooks, closes its timers, and releases its registrations.
 * @throws Error when the name is invalid or taken, or when `register` throws (Claude Code's `hooks module did not load` wording).
 */
async add(definition: ModDefinition): Promise<() => Promise<void>>
```

Types: [Agent](core.ko.md)

Source: [`packages/experimental/claude-code-mods/src/index.ts`](../../packages/experimental/claude-code-mods/src/index.ts)
<!-- END GENERATED cordis-surface -->
