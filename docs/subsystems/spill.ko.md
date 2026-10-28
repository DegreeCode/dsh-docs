# 스필 저장소

[English](spill.md) | [中文](spill.zh.md) | 한국어

스필 저장소 [capability seam](../../.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md)은 호출자가 제공한 텍스트를 영속화하고 검색 안내가 담긴 모델 대상 로케이터를 반환합니다. Service Definition은 [dsh-spill](../../packages/spill/spill)(`ctx.spillStore`)이고, 로컬 Service Provider는 [dsh-spill-local](../../packages/spill/spill-local)입니다. 소비자에는 [도구 결과 정책](../../packages/spill/spill-policy)과 [세션 참조](../../packages/context/session-reference/README.md)가 있습니다. 스필은 선택 사항이며 [agent-loop 척추](core.ko.md)의 일부가 아닙니다. 미리 보기와 스필 결정은 소비자가 소유하고, 저장소는 제공된 텍스트를 그대로 저장합니다.

출처: [`packages/spill/spill/src/types.ts`](../../packages/spill/spill/src/types.ts)

## 저장 요청

`saveText`가 유일한 서비스 연산입니다. `content`를 그대로 영속화하고, 불투명 로케이터와 백엔드가 제공하는 검색 힌트, 정확한 바이트 수를 반환합니다. 요청은 저장 시점의 저장 네임스페이스(`owner`), 서술적 생산자 세부 사항(`source`, 접근 제어가 아닙니다), 그리고 백엔드가 경로가 아니라 이름 힌트로 쓸 수 있는 `suggestedName`을 담습니다. 도구 소스는 실제 도구 호출을 식별하고, 세션 참조 소스는 캡처된 원본 세션을 식별하며 그 소유자는 컨텍스트를 받는 대상 세션입니다.

```ts type-equiv
/** One request to persist text to a spill artifact. */
interface SaveTextSpill {
  owner: SpillOwner
  source: SpillSource
  /**
   * A caller-suggested base name (e.g. `web_fetch.txt`). The backend sanitizes
   * it to a single safe path segment before use — it is a hint, never a path.
   */
  suggestedName: string
  /** The full text to persist (UTF-8). */
  content: string
}
```

```ts type-equiv
/**
 * Save-time storage namespace for a spilled artifact. The session id lets a
 * backend group storage under the producing session, but the returned
 * {@link SpillLocator} is the model-facing handle. Forked sessions inherit
 * locators already present in the seeded log; those artifacts are not copied or
 * re-owned, and spills produced after the fork use the child session id.
 */
interface SpillOwner {
  sessionId: SessionId
}
```

보유 기간 정리는 오래된 로케이터를 다른 오래된 세션 아티팩트와 함께 만료시킬 수 있으며, 스필 seam은 세션별 정리 정책을 정의하지 않습니다.

```ts type-equiv
/**
 * Producer of a spilled artifact. Tool results carry their model-issued call id;
 * session references identify the captured source session instead. Descriptive
 * source description only, never access control.
 */
type SpillSource = {
  kind: 'tool'
  /** The tool whose result was spilled (e.g. `web_fetch`). */
  toolName: string
  /** The model-issued call id the result belongs to. */
  callId: ToolCallId
  /** A short human label for the artifact (e.g. `result`). */
  label: string
} | {
  kind: 'session-reference'
  /** Session whose projected conversation was captured. */
  sessionId: SessionId
  /** Host-provided label for the referenced session. */
  label: string
}
```

## 결과

```ts type-equiv
/** A saved spill artifact: its locator, byte length, and backend-specific retrieval guidance. */
interface SpillRef {
  locator: SpillLocator
  bytes: number
  retrievalHint: string
}
```

`SpillLocator`는 백엔드가 반환하는 [브랜드](core.ko.md#브랜드-id) 모델 대상 핸들입니다. 로컬 백엔드는 이를 파일 시스템 경로로 렌더링하고, 원격이나 데이터베이스 백엔드는 URI, 키, 명령 토큰으로 렌더링할 수 있습니다. 소비자는 이를 불투명하게 취급하고 `read`가 항상 올바른 검색 메커니즘이라고 가정하지 않은 채 `retrievalHint`와 함께 렌더링합니다.

```ts type-equiv
/**
 * Opaque model-facing handle for one spilled artifact. A local backend may use a
 * filesystem path; a remote or database backend may use a URI or key. Consumers
 * render it with {@link SpillRef.retrievalHint}, but do not parse it.
 */
type SpillLocator = Branded<'SpillLocator'>
```

## 서비스

`SpillStore`(`ctx.spillStore`, [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)에 정의)는 메서드 하나짜리 추상 서비스입니다. `saveText(input) → Promise<SpillRef>`입니다. `content` **전체**를 영속화하고 실제 저장 실패(권한, ENOSPC, 백엔드 사용 불가)에는 **거부**합니다. 이 seam은 저장소만 소유하며, 보유 정책도, 도구 결과 대체도, 검색 API도 없습니다.

로컬 백엔드([dsh-spill-local](../../packages/spill/spill-local))는 `<root>/session-<hash>/<random>-<safeName>` 아래에 씁니다. 구성되었거나 지연 생성된 비공개(0700) 루트, `sha256(sessionId)` 세션 하위 디렉터리, 그리고 심어 둔 심볼릭 링크가 방향을 바꾸지 못하도록 소유자 전용 배타적(`open(path, 'wx', 0o600)`) 쓰기를 사용합니다. 그 `locator`는 로컬 경로이고 `retrievalHint`는 모델에게 그 경로에 `read`나 `grep`을 쓰라고 알려 줍니다. 정책 소비자([dsh-spill-policy](../../packages/spill/spill-policy))는 `maxInlineTokens`를 넘는 텍스트·이미지 결과를 순서 있는 머리·꼬리 콘텐츠와 스필 주소로 대체하며, 최선 노력으로 수행합니다. 저장 실패 시 성공한 호출을 `isError`로 바꾸지 않고 원래 인라인 결과를 유지합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxspillstore--spillstore-abstract-seam"></a>

### `ctx.spillStore` — `SpillStore` (abstract seam)

Abstract spill storage service. Subclass, implement saveText, and load the subclass as a plugin — it registers as `ctx.spillStore` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

Semantics every implementation must honor:

- saveText persists the FULL `content` verbatim and returns an opaque locator, exact byte length, and model-facing retrieval guidance.
- Storage is scoped by the request's SaveTextSpill.owner session; the backend chooses a private (not world-readable) location and a collision-free name derived from — never equal to — the caller's `suggestedName`.
- `saveText` REJECTS on a real storage failure (permissions, ENOSPC, backend unavailable); the caller decides how to degrade (the spill policy treats a rejection as best-effort and keeps the inline result).

```ts cordis-catalog
/**
 * Persist `input.content` to a session-scoped spill artifact.
 * @param input - the owner, caller-supplied source fields, suggested name, and full text to save.
 * @returns the saved artifact's {@link SpillRef}; rejects on a storage failure.
 */
abstract saveText(input: SaveTextSpill): Promise<SpillRef>
```

Source: [`packages/spill/spill/src/index.ts`](../../packages/spill/spill/src/index.ts)
<!-- END GENERATED cordis-surface -->
