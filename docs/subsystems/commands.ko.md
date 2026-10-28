# 사용자 명령

[English](commands.md) | [中文](commands.zh.md) | 한국어

[`dsh-commands`](../../packages/interaction/commands)의 사용자 명령(human command) 레지스트리 서비스입니다. 대화형 어댑터가 이를 활용하여 모델에 메시지를 전달하지 않고 대상 에이전트에 대해 플러그인이 소유한 슬래시 명령어를 탐색하고 직접 실행합니다. 디스패치 및 수명 주기 설계 배경은 [과거 명령 Agent Note](../../.agents/notes/archived/feature/2026-07-19-plugin-command-registration.md)에 기록되어 있으며, 번들 조합 및 제약 사항은 [패키지 README](../../packages/interaction/commands/README.md)에서 다룹니다.

출처: [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

## 입력 메타데이터

이 서비스는 선택적 비구조화 입력 디스크립터 하나를 노출합니다. 힌트와 첨부 허용 플래그입니다. 명령 가용성은 플러그인 조합을 따르며, 레지스트리를 소비하는 모든 어댑터가 모든 유효 정의를 봅니다.

```ts type-equiv
/** Immutable metadata for a command's optional unstructured input. */
interface CommandInputDescriptor {
  /** Placeholder shown before the user supplies free-form input. */
  readonly hint: string
  /**
   * Whether composer attachments may accompany an invocation. Absent or
   * false = the executor rejects an invocation carrying attachments and capable
   * composers refuse the submission before dispatch. A declaring command's
   * handler receives the admitted durable blocks and owns every further
   * grammar decision, including rejecting sub-commands that cannot use them.
   */
  readonly attachments?: boolean
}
```

## 정의

`CommandDefinition`은 플러그인이 작성한 등록입니다. 레지스트리는 분리된 유효 정의를 검증하고 동결합니다.

```ts type-equiv
/** Plugin-owned command registration. */
interface CommandDefinition {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
  /**
   * Whether `command/run` records `rawInput`. Defaults to true. A command
   * whose domain event owns the payload sets this false to avoid duplicating
   * that payload in the session log.
   */
  readonly recordInput?: boolean
  /** Execute against the receiving agent without sending the command to the model. */
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
}
```

## 호출과 결과

취소는 어댑터가 소유하며 정확한 대상 에이전트를 전달합니다. `rawInput`은 파싱된 이름 바로 뒤에서 시작하고 어댑터가 전달한 구분자와 접미사를 유지합니다. 결과는 도구 결과나 세션 이벤트가 아니라 직접적인 UI 결과입니다.

```ts type-equiv
/** Invocation passed to one registered command handler. */
interface CommandInvocation {
  /** Pairing id already written to this invocation's `command/run` event. */
  readonly commandId: CommandId
  /** Exact agent whose UI received the command. */
  readonly agent: Agent
  /** Exact text following the registered command name, including separator whitespace. */
  readonly rawInput: string
  /**
   * Durably admitted image and file blocks accompanying this invocation, in submission
   * order; empty unless the definition declares `input.attachments`. The handler
   * owns their model-visible use — the registry never schedules them itself —
   * and a handler whose grammar cannot use them in this invocation returns an
   * error so the dispatching composer retains the originals.
   */
  readonly attachments: readonly (ImageBlock | FileBlock)[]
  /** Cancellation signal owned by the dispatching UI request. */
  readonly signal: AbortSignal
}
```

```ts type-equiv
/** Expected command outcome rendered directly by the dispatching UI. */
type CommandResult =
  | {
    readonly kind: 'success'
    readonly text?: string
    /** Earlier authoritative domain event that owns a richer presentation. */
    readonly sourceEventSeq?: SessionSeq
  }
  | { readonly kind: 'error'; readonly text: string }
```

`sourceEventSeq`는 선택 사항이며 성공 시에만 있습니다. 존재하면 수신 세션 로그에서 더 이른 비명령 이벤트를 지목하고, `command/done`이 같은 참조를 영속화하므로 클라이언트는 `text`를 파싱하거나 인접 행에 의존하지 않고 명령 수명 주기를 그 도메인 프로젝션과 결합할 수 있습니다.

## 탐색과 파싱 뷰

어댑터는 범위 해석 후 핸들러가 없는 불변 디스크립터를 받습니다. `parseCommand()`는 레지스트리 해석 전에 `ParsedCommand`를 반환하며, 구문상 유효한 입력이 여전히 사용할 수 없는 명령을 지목할 수 있습니다.

```ts type-equiv
/** Handler-free immutable command view returned to UI adapters. */
interface CommandDescriptor {
  /** Stable plugin-owned identity; absent for definitions without identity-based client behavior. */
  readonly definitionId?: CommandDefinitionId
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Human-readable summary used in discovery UI. */
  readonly description: string
  /** Optional free-form input hint advertised to capable clients. */
  readonly input?: CommandInputDescriptor
}
```

```ts type-equiv
/** Syntactically valid slash command before registry resolution. */
interface ParsedCommand {
  /** Lowercase command name without the leading slash. */
  readonly name: string
  /** Exact text following the command name. */
  readonly rawInput: string
}
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcommands--commandruntime"></a>

### `ctx.commands` — `CommandRuntime`

Human-command registry. Plain-context definitions are global; definitions registered through a command-injected child of an agent context shadow globals for that agent.

```ts cordis-catalog
/**
 * Register a global or calling-agent-scoped command.
 * @param definition - discovery metadata and direct UI handler.
 * @returns the exact effect disposer that unregisters this definition.
 */
register(definition: CommandDefinition): () => void

/**
 * Register the sole authority that resolves staged file receipts for command submissions.
 * @param resolver - Session-aware receipt resolver.
 * @returns disposer that removes this exact resolver.
 */
registerFileReceiptResolver(resolver: CommandFileReceiptResolver): () => void

/**
 * List the effective immutable command descriptors for one agent.
 * @param agent - exact receiving agent and scoped-layer key.
 * @returns name-sorted descriptors after scoped shadowing.
 */
@Remote list(agent: Agent): readonly CommandDescriptor[]

/**
 * Resolve one effective command definition.
 * @param agent - exact receiving agent and scoped-layer key.
 * @param name - command name without a slash.
 * @returns the scoped shadow or global definition.
 */
find(agent: Agent, name: string): CommandDefinition | undefined

/**
 * Parse and execute a known command without sending it to the model.
 *
 * A resolved command's lifecycle is logged: `command/run` is appended
 * before the handler is invoked and `command/done` after settlement (a
 * thrown or aborted handler settles as `kind: 'error'`). Both are direct
 * log-only appends — no turn wraps them, and persistence drains them at
 * ordinary checkpoints. Admission misses (syntax or unknown name) log
 * nothing — they never entered a handler. A `command/run` append failure
 * fails the execution loud; a `command/done` append failure on the
 * handler-failure path is contained so the handler's own error stays the
 * reported failure.
 *
 * Attachment admission is enforced here, not in the composer: attachments sent to a
 * command that does not declare `input.attachments`, an absent attachment store,
 * and an exceeded image limit each settle as an error result before
 * the handler runs. Validation rejection starts no attachment writes;
 * a storage failure can leave only unreachable content-addressed objects
 * for deferred collection.
 *
 * @param agent - exact receiving agent.
 * @param line - complete slash-command line.
 * @param submittedAttachments - encoded images and staged file receipts accompanying the line,
 *   in submission order; empty for a plain invocation.
 * @param signal - cancellation signal owned by the UI request.
 * @returns the settled execution (result + lifecycle pairing id), or
 *   `undefined` when syntax or name does not resolve.
 */
@Remote async execute( agent: Agent, line: string, submittedAttachments: readonly CommandSubmitAttachment[], signal: AbortSignal, ): Promise<CommandExecution | undefined>
```

Types: [Agent](core.ko.md)

Source: [`packages/interaction/commands/src/index.ts`](../../packages/interaction/commands/src/index.ts)

<a id="commands-events"></a>

### `commands/*` events

<a id="commandschange--emit"></a>

#### `commands/change` — emit

A command was registered or unregistered. This is an unfiltered registry notification because a global or scoped change may affect any UI view. Observer failures are contained and cannot veto the registry mutation.

```ts cordis-catalog
/**
 * A command was registered or unregistered. This is an unfiltered registry
 * notification because a global or scoped change may affect any UI view.
 * Observer failures are contained and cannot veto the registry mutation.
 * @mode emit
 */
'commands/change'(): void
```

Source: [`packages/interaction/commands/src/types.ts`](../../packages/interaction/commands/src/types.ts)
<!-- END GENERATED cordis-surface -->
