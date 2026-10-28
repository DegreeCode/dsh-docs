# PTC 런타임

[English](ptc-runtime.md) | [中文](ptc-runtime.zh.md) | 한국어

PTC 실행 [기능 seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)은 [dsh-ptc-runtime](../../packages/ptc-runtime/ptc-runtime)을 통해 `ctx.ptcRuntime`을 제공합니다. 호스트 바인딩에 대해 프로그램 하나를 실행하고 출력, 실패, 적용 가능한 샌드박스 사실을 보고합니다. PTC 실행은 [에이전트 루프 척추](core.ko.md)의 일부가 아니라 선택 사항입니다. [PTC 기반](../../.agents/notes/implemented/feature/2026-06-15-ptc.md)이 레지스트리 표시를, [타입 지정 반환 계약](../../.agents/notes/implemented/feature/2026-07-20-ptc-typed-tool-returns.md)이 바인딩 값을, [샌드박스 Node 결정](../../.agents/notes/implemented/architecture/2026-09-11-sandboxed-node-ptc-runtime.md)이 배포되는 실행 제공자를 소유합니다.

출처: [`packages/ptc-runtime/ptc-runtime/src/types.ts`](../../packages/ptc-runtime/ptc-runtime/src/types.ts)

## 실행: 요청 입력, 결과 출력

`PtcRunRequest`는 프로그램, 바인딩, 취소, 선택적 실행 선택지를 담습니다. 제공자의 `resolve`가 지원되는 선택지를 검증하고 배포 기본값을 적용하며, `run`은 명시적 디렉터리와 데드라인 선택지를 가진 `PtcRunSpec`을 받습니다. 생략된 타임아웃은 제공자 기본값을 쓰고, 숫자는 상한이 있는 경과 예산을 요청하며, `null`은 경과 데드라인 없음을 요청합니다. 제공자는 실행 전에 지원되지 않는 선택지를 거부합니다:

```ts type-equiv
/**
 * Caller inputs for one program. The provider's resolve method validates supported
 * options and supplies directory, deadline, and authority before execution.
 */
interface PtcRunRequest {
  /**
   * The program source, in the runtime's {@link ../index.ts | language}. It
   * follows the provider's programFormat: an async function body supports
   * top-level `await` and `return`; a REPL supports top-level declarations,
   * `await`, and a final expression. The completion value becomes
   * {@link PtcRunResult.value}.
   */
  program: string
  /**
   * Object-identity owner for optional in-memory state. Omission requests a fresh
   * environment. Consumers must await runtime.release(owner) when the owner ends.
   * Stateless providers ignore this field; retained state is never durable.
   */
  stateOwner?: object
  /** Host functions exposed to the program, one global object per namespace. */
  bindings: PtcBindingNamespace[]
  /** Working directory in the mounted filesystem and subprocess execution world. */
  cwd?: string
  /**
   * Elapsed execution budget in milliseconds. Omission uses provider defaults;
   * null requests no deadline. Providers validate and cap numeric budgets or reject unsupported choices.
   */
  timeoutMs?: number | null
  /** Resolved authority for this execution. Providers without confinement reject an explicit policy. */
  sandboxPolicy?: SandboxExecutionPolicy
  /**
   * Abort the run: the runtime stops the program (hard, even mid-loop) and
   * resolves with a {@link PtcRunFailure} of kind `'abort'`. In-flight
   * binding calls are the CALLER's to settle — the runtime only stops asking.
   */
  signal?: AbortSignal
}
```

```ts type-equiv
/** Fully resolved execution inputs; run never supplies a missing directory or deadline choice. */
interface PtcRunSpec extends PtcRunRequest {
  /** Absolute directory in the provider's execution world. */
  cwd: string
  /** Positive finite elapsed budget in milliseconds after provider capping, or null for no deadline. */
  timeoutMs: number | null
}
```

```ts type-equiv
/** File confinement applied to a program, independently of its terminal outcome. */
interface PtcRunSandbox {
  /** File-effect mode used for this execution. */
  mode: SandboxMode
  /** Program failure text matched backend diagnostics; not enforcement proof or an exhaustive denial record. */
  denied: boolean
  /** Completeness reported by the selected confining backend; absent for full access. */
  enforcement?: SandboxEnforcement
}
```

프로그램 실패는 `PtcRunResult.error`로 해석되고, 잘못된 호출자 입력은 실행 전에 거부될 수 있습니다. 샌드박스 모드, 관찰된 거부, 적용 완전성은 별개 사실이므로, 성공한 프로그램만으로 요청된 모든 제한이 강제되었다고 증명되지는 않습니다:

```ts type-equiv
/**
 * The outcome of one run. An error is a FIELD on a resolved result, never a
 * rejection of `run()` — reporting a failed program is the caller's job, not
 * an exception path.
 */
interface PtcRunResult {
  /** Applied file policy and observed denial, when the provider enforces file policy. */
  sandbox?: PtcRunSandbox
  /**
   * The program's completion value (a return or final REPL expression), when it ran to
   * completion and the value crossed the runtime's lossless-JSON boundary.
   * Invalid or over-limit completions fail the run instead of substituting a
   * rendered string; a failed or value-less run leaves this absent.
   */
  value?: PtcJsonValue
  /**
   * Captured text. Each source channel preserves emission order; interleaving
   * across independent channels is backend-dependent. Bounded only as part of
   * the outer result.
   */
  logs: string[]
  /** Present iff the run failed; see {@link PtcRunFailure} for the taxonomy. */
  error?: PtcRunFailure
}
```

`programFormat`은 비동기 함수 본문과 REPL 문을 구분합니다. `stateOwner`는 선택적 보존 메모리에 대한 프로세스 내 객체 정체성이며, 서로 다른 객체는 격리된 채 남습니다. 소비자는 그 소유자가 끝날 때 `release(owner)`를 기다리고, 정리 실패는 그 호출을 거부합니다. 생략된 소유자는 일회성이며, 상태 없는 제공자는 소유권을 무시합니다. 리셋과 복구 동작은 [영속 Node 제공자](../../packages/ptc-runtime/ptc-runtime-node/README.md#persistent-repl)가 정의하며, 보존된 객체는 영속 세션 형식에 들어가지 않습니다.

## 바인딩: 프로그램 전역으로서의 호스트 함수

각 `PtcBindingNamespace`는 비동기 호출 가능 객체의 전역 객체가 되며, PTC는 `tools`를 전달합니다. 인수와 해석 결과는 무손실 JSON이어야 합니다. 제공자는 자신의 전송 상한을 강제하고, seam은 균일한 바인딩 바이트 한도를 두지 않습니다. 선택적 오류 클래스 디스크립터는 런타임 안에서 소비자를 지목하지 않고 프로그램에 보이는 타입 지정 거부를 만듭니다. 바인딩 이름은 자체 속성이므로 `__proto__`가 프로토타입을 횡단할 수 없습니다:

```ts type-equiv
/**
 * Program-visible typed rejection for one binding namespace. The runtime
 * injects a real error constructor under `name`; rejected member calls become
 * its instances and expose the exact member name through
 * `memberNameProperty`. Both strings are runtime data rather than knowledge
 * of a particular consumer such as PTC mode.
 */
interface PtcBindingErrorClass {
  /** Constructor global and resulting `Error.name`; same portable identifier rule as {@link PtcBindingNamespace.global}. */
  name: string
  /**
   * Non-empty own property for the member name. The portable exclusion set is
   * `RESERVED_ERROR_MEMBERS` plus dunder-form names (`__x__`, non-empty
   * middle), enforced identically by every backend; any other name —
   * identifiers or not — is accepted everywhere.
   */
  memberNameProperty: string
}
```

```ts type-equiv
/**
 * A named group of {@link PtcBindingFunction}s the runtime exposes to the
 * program as one global object (e.g. `tools`). Function names are arbitrary
 * strings — a runtime must treat names like `__proto__` or `constructor` as
 * ordinary own properties (null-prototype construction), never as prototype
 * collisions.
 */
interface PtcBindingNamespace {
  /**
   * The global identifier the program sees. Must match the LANGUAGE-PORTABLE
   * identifier subset `[A-Za-z_][A-Za-z0-9_]*` and no language's reserved
   * words, so the same namespace list works against every backend regardless
   * of `language` — a JS-only spelling like `$tools` is rejected by design,
   * not just by the Python backend. Names that satisfy the identifier rule but
   * name a backend-owned slot (`RESERVED_BINDING_GLOBALS`, e.g. `console`,
   * `__dsh_main__`) are also refused everywhere; see its declaration for the
   * exact set and why each entry is reserved.
   */
  global: string
  /** The callable members, keyed by the exact name the program calls. */
  functions: Record<string, PtcBindingFunction>
  /** Optional program-visible typed rejection contract for this namespace. */
  errorClass?: PtcBindingErrorClass
}
```

```ts type-equiv
/** A lossless JSON value transferable through the dependency-light Service Definition. */
type PtcJsonValue = null | boolean | number | string | PtcJsonValue[] | { [key: string]: PtcJsonValue }
```

```ts type-equiv
/**
 * One host-side function exposed to the program as an async callable. The
 * runtime bridges calls to it (possibly across a serialization boundary), so
 * `args` and the resolution value MUST be lossless JSON. A runtime rejects a
 * lossy or non-cloneable value with a descriptive error rather than corrupting
 * the run. No seam-level byte cap applies to a binding resolution. A rejection
 * of this function surfaces inside the program as a rejection of the
 * corresponding call.
 */
type PtcBindingFunction = (args: unknown) => Promise<PtcJsonValue>
```

## 캡처된 출력과 실패 분류 체계

로그는 평범한 문자열입니다. 각 소스 채널은 방출 순서를 보존하지만, 채널 메타데이터가 seam의 일부가 아니므로 독립 채널 간 인터리빙은 백엔드에 따라 다릅니다. 런타임은 프로그램의 콘솔과 스트림 출력을 캡처하고 소비자는 텍스트만 렌더링합니다. 구현은 직렬화된 바깥 로그 배열과 완료 값 또는 실패 메시지 페이로드에 상한을 둡니다. 고정된 결과 봉투 구문과 소비자 표시 공백은 그 가변 페이로드 원장의 일부가 아닙니다. 오버플로는 인밴드 값 대체가 아니라 명시적 실패입니다.

실패 종류는 **독립적으로 보고되는 직교 결과**입니다([defensive-patterns](../defensive-patterns/general.ko.md) 참고). 즉 예산 만료는 예외가 아니고, 중단은 타임아웃이 아니며, 기반 프로세스 사망(예: OOM)은 둘 다 아닙니다:

```ts type-equiv
/**
 * Why a run failed. The kinds are orthogonal outcomes reported independently
 * (per docs/defensive-patterns/general.md): a budget expiry is not an exception, an
 * abort is not a timeout, and a substrate death is neither.
 *
 * - `'exception'` — the program threw or failed to parse/transform.
 * - `'timeout'` — an implementation-owned budget expired; the message says which.
 * - `'abort'` — {@link PtcRunRequest.signal} fired.
 * - `'worker-exit'` — the execution substrate died without settling (e.g. OOM).
 * - `'invalid-output'` — the completion value was not lossless JSON.
 * - `'output-limit'` — the serialized outer logs/value/diagnostic exceeded the configured cap.
 * - `'protocol'` — the program sent invalid or over-budget control traffic.
 * - `'sandbox-unavailable'` — required confinement could not be established.
 */
interface PtcRunFailure {
  /** The failure class (see the interface doc for each kind's meaning). */
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit' | 'protocol' | 'sandbox-unavailable'
  /** Human-readable detail, suitable for feeding back to a model to self-correct. */
  message: string
}
```

## 서비스

`PtcRuntime`은 [`src/index.ts`](../../packages/ptc-runtime/ptc-runtime/src/index.ts)에 정의되어 있습니다. `resolve(request)`는 완전한 실행 입력을 반환하고 `run(spec)`이 이를 실행합니다. `executionInstructions`는 소비자 표시를 위한 제공자 소유 사용 안내를 공급합니다. `timeout`은 호출별 재정의가 지원될 때 구성된 경과 시간 기본값과 최대값을 보고하며, `resolve`는 여전히 각 요청을 검증하고 상한을 적용합니다. `language`는 지원되는 프로그램 표시를 선택하고, `isolation`은 보안을 주장하지 않고 기반을 설명합니다. `sandboxMode`는 파일 정책 지원을 알리며, 격리를 공급하지 않는 제공자에서는 `undefined`입니다. 각 구현은 실행 간에 프로그램 상태를 분리하고 폐기 중에 활성 실행을 종료하고 기다립니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxptcruntime--ptcruntime-abstract-seam"></a>

### `ctx.ptcRuntime` — `PtcRuntime` (abstract seam)

Registers one `ctx.ptcRuntime` implementation. Program, budget, abort, and substrate failures resolve in PtcRunResult; only Service Definition contract misuse rejects. Implementations bridge structured-cloneable bindings, materialize each declared namespace rejection class, treat programs as hostile peers, isolate distinct state owners, and terminate and await in-flight runs during disposal.

```ts cordis-catalog
/**
 * Release an owner's retained environment and await its execution resources.
 * Stateless providers have no retained resources to release.
 * @param owner - The exact object supplied as the request's state owner.
 * @returns Completion after all owned execution resources have been released.
 * @throws When managed resource cleanup fails.
 */
release(owner: object): Promise<void>

/**
 * Resolve supported options and provider defaults before execution.
 * @param request - Program, bindings, cancellation and optional execution choices.
 * @returns Complete directory, deadline and supported authority for run.
 * @throws When an explicit choice is invalid or unsupported by this provider.
 */
abstract resolve(request: PtcRunRequest): PtcRunSpec

/**
 * Execute resolved inputs; program outcomes resolve as result fields.
 * @param spec - directory, deadline, program, bindings, cancellation and supported policy.
 * @returns Captured output and the execution outcome.
 */
abstract run(spec: PtcRunSpec): Promise<PtcRunResult>
```

Source: [`packages/ptc-runtime/ptc-runtime/src/index.ts`](../../packages/ptc-runtime/ptc-runtime/src/index.ts)
<!-- END GENERATED cordis-surface -->
