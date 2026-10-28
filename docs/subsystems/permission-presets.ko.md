# 권한 프리셋

[English](permission-presets.md) | [中文](permission-presets.zh.md) | 한국어

[dsh-permission-presets](../../packages/interaction/permission-presets)의 권한 프리셋 계층(`ctx.permissionPresets`, `PermissionPresetService`)은 서로 독립적인 두 강제 손잡이인 [샌드박스 모드](sandbox.ko.md)(`sandbox/mode`)와 [승인 정책](approval.ko.md)(`approval/policy`)을, 클라이언트가 하나의 권한 선택기로 제공하는 이름 있는 프리셋으로 묶습니다. 구성된 테이블은 미래 세션 기본값을 소유하고, 고정된 `registerAuto(admit)` 훅은 [Auto review](../../packages/experimental/auto-review/README.md) 통합이 하나의 effect 수명 동안 현재 세션 전용 옵션을 게시하게 합니다. 이 계층은 선택적이며 실행 정책을 소유하지 않습니다. 프롬프트 서술과 재생은 계속 각 손잡이 폴드를 읽고, 추가 강제는 Auto review가 소유합니다. 구성 상태와 한계는 [패키지 README](../../packages/interaction/permission-presets/README.md)가, 원래 손잡이 근거는 [과거 샌드박스 전환 설계](../../.agents/notes/archived/feature/2026-07-06-sandbox.md)가 기록합니다.

출처: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

## 프리셋 테이블

프리셋은 하나의 안정적인 키를 샌드박스/승인 묶음과 선택적 클라이언트 표현에 매핑합니다. 기본 구성 테이블은 `workspace-write`(`workspace-write` + `ask`)와 `danger-full-access`(`danger-full-access` + `never`)를 배포하며, `custom`과 `auto`는 예약되어 있어 구성할 수 없습니다.

```ts type-equiv
/** One preset's sandbox/approval bundle and optional client presentation. */
interface PresetSpec {
  /** The `sandbox/mode` value the preset writes through. */
  sandbox: SandboxMode
  /** The `approval/policy` value the preset writes through. */
  approval: ApprovalPolicy
  /** The display label a client shows for this preset; the raw table key when omitted. */
  name?: string
  /** One user-facing sentence on what the preset means; omitted when not configured. */
  description?: string
}
```

```ts type-equiv
/** The {@link PermissionPresetService} config: preset table and composition default. */
interface Config {
  /**
   * The preset table: name → knob bundle. Defaults to `workspace-write`
   * (workspace-write + ask) and `danger-full-access` (danger-full-access +
   * never). The names `custom` and `auto` are reserved for derived state and
   * the Auto review integration respectively.
   */
  presets: Record<string, PresetSpec>
  /**
   * Default for new sessions. When omitted, the preset matching the composed
   * sandbox and approval defaults is used.
   */
  defaultPreset: Volatile<string | undefined>
}
```

서비스는 격리하는 `ctx.shell` 실행기와 `ctx.approval`을 요구하며, 잘못된 구성은 플러그인 로드 시 실패합니다. `custom`이나 `auto`라는 이름의 구성 항목은 throw하고, 격리하지 않는 bash 실행기(`sandboxMode` 기능 사실 없음) 위에 구성하면 프리셋이 샌드박스 모드를 묶기 때문에 throw합니다.

## 고정된 현재 세션 Auto 등록

Auto 통합은 effect 수명 동안 `registerAuto(admit)`을 호출합니다. 이 서비스는 `auto` 정체성과 그 `danger-full-access` + `ask` 묶음을 고정하며, 기록된 Auto 선택은 위임된 자식이 고정하는 `never` 정책과도 일치합니다. 배포되는 클라이언트 로케일 사전이 Auto의 라벨과 설명을 소유하고, 구성된 프리셋 표현은 Host 소유로 남습니다. 호출자는 일반 기여 API로 다른 프리셋을 게시할 수 없습니다. Auto는 구성된 프리셋 뒤에 나타나고 `permission.defaultPreset` 설정 스키마에 절대 들어가지 않으며, effect가 폐기되면 사라집니다. 동기 `admit` 콜백은 Auto 선택이 Session을 변경하기 전과 저장된 Auto Session이 게시되기 전에 실행되므로, 누락되거나 닫히는 통합이 영속 정체성을 다시 쓰지 않습니다.

Auto를 등록하거나 제거하면 페이로드 없는 `permission-presets/catalog-changed` 알림이 발생합니다. 프로세스 소비자는 `catalog()`를 호출하기 전에 구독하고, 각 알림 뒤에 완전한 선택 가능 카탈로그를 다시 읽습니다. `permissions` Session 프로젝션은 `currentValue`만 담으므로 카탈로그 변경은 Session 이벤트를 추가하지 않고, Session 프로젝션 프레임을 게시하지 않으며, Session 시퀀스를 그대로 둡니다.

## 현재 프리셋과 파생 `custom`

`current(session)`은 필수 `permissions` 프로젝션에서 실효 프리셋을 도출합니다. 그 단위는 세션의 샌드박스 모드, 승인 정책, 기록된 선택을 폴드하며, 그 상태에 없는 값은 실행기의 구성 모드와 승인 서비스 구성, 그다음 `ask`로 폴백합니다. 프로젝션 키가 없으면 명시적으로 실패합니다. 서비스는 아직 일치하는 선택(예: `never` 승인 정책 아래의 기록된 Auto 선택)을 선호하고, 그다음 첫 번째 일치하는 구성 항목을, 그 밖에는 `CUSTOM_PRESET`(`'custom'`)을 반환합니다. `custom`은 파생 전용입니다. 클라이언트가 현재 값으로 표시할 수는 있지만 전환 대상도 이벤트 페이로드도 아닙니다.

`names`는 선언 순서대로 구성된 프리셋을 나열하고, 통합이 살아 있는 동안 그 뒤에 Auto를 붙입니다. `catalog()`는 그 선택 가능 항목을 하나의 프로세스 수준 스냅샷으로 반환합니다. `optionOf(name)`은 사용 가능한 항목(라벨은 키로 폴백)이나 파생 `custom` 표현을 만들고, 다른 이름에는 throw합니다. 클라이언트는 카탈로그를 Session 프로젝션과 결합하며, `custom`은 현재 값에 라벨을 붙일 수 있지만 카탈로그 항목이 되지는 않습니다.

```ts type-equiv
/** Presentation for an available preset or the derived `custom` current value. */
interface PresetOption {
  /** Stable option value: a configured preset key, live `auto`, or derived `custom`. */
  value: string
  /** The display label. */
  name: string
  /** One user-facing sentence on what the value means; omitted when not configured. */
  description?: string
}
```

## 전환과 `permission/preset` 이벤트

`set(session, name)`은 프리셋을 해석하고(알 수 없는 이름은 throw), 해당되면 Auto 허용을 실행하고, `name`이 이미 실효 프리셋이 아니면 로그 전용 `permission/preset` 이벤트를 추가한 뒤, 각 손잡이의 실효 값이 바뀔 때만 그 손잡이의 설정자([dsh-sandbox-policy](../../packages/sandbox/sandbox-policy)의 `setSandboxMode`, [dsh-user-approval](../../packages/interaction/user-approval)의 `setApprovalPolicy`)를 통해 씁니다. 선택 이벤트는 같은 턴에서 손잡이 이벤트보다 앞서고, 실효 프리셋을 다시 선택하면 아무것도 추가하지 않습니다.

`permission/preset`은 영속적이고 로그 전용인 사용자 의도입니다. 모델 트랜스크립트에는 들어가지 않고(손잡이 이벤트가 그 소비자를 통해 모델 가시 결과를 소유합니다), 두 프리셋이 같은 묶음을 공유할 때 `current()`가 사용자가 고른 프리셋을 보존할 수 있도록 존재합니다. `permissions` 프로젝션은 그 선택을 두 손잡이 이벤트와 함께 폴드하고, 복원된 빈 시드와 새 세션을 구분하는 데 쓰는 `session/end-seed` 경계를 유지합니다. 재생에는 따라잡기 상태나 원시 로그 재스캔이 필요 없습니다. 복원된 `auto` 선택은 Agent 게시 전에 라이브 Auto 등록을 요구합니다. 완전한 이벤트 선언은 [영속 로그 이벤트 카탈로그](../persistence-catalog.ko.md)에, 메서드 시그니처는 생성된 [서비스 카탈로그](#ctxpermissionpresets--permissionpresetservice)에 있습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxpermissionpresets--permissionpresetservice"></a>

### `ctx.permissionPresets` — `PermissionPresetService`

Owns the deployment's configured permission presets, the fixed Auto integration hook, and their write path. Requires a confining `ctx.shell` executor and `ctx.approval`; unmatched knob values are reported as CUSTOM_PRESET, not an error.

```ts cordis-catalog
/**
 * Read the complete process-level catalog exposed to current-session UI.
 * @returns every currently selectable preset in contribution order.
 */
@Remote('catalog') catalog(): PermissionCatalog

/**
 * Publish the fixed current-session Auto preset for the calling
 * integration's effect lifetime.
 * @param admit - synchronous gate run before live Auto selection or restore.
 * @returns the async effect disposer that removes Auto.
 */
registerAuto(admit: () => void): () => Promise<void>

/**
 * Resolve the preset matching the effective knob values. A still-matching
 * last selection wins shared-bundle ties, and a still-selected Auto also
 * matches the `never` approval policy; otherwise the first configured
 * match wins. Returns
 * {@link CUSTOM_PRESET} when no available preset matches.
 * @param session - the session whose knob state is read.
 * @returns the effective preset name, or `custom` when nothing matches.
 */
current(session: Session): string

/**
 * Resolve an available preset's knob bundle.
 * @param name - the preset name to resolve.
 * @returns the configured bundle.
 * @throws when `name` is neither configured nor the currently live Auto preset.
 */
resolve(name: string): PresetSpec

/**
 * Build the client option for an available preset or {@link CUSTOM_PRESET}.
 * A missing label falls back to the preset key.
 * @param name - a configured preset key, live `auto`, or `custom`.
 * @returns the option a client renders.
 * @throws when `name` is neither a configured preset, live `auto`, nor `custom`.
 */
optionOf(name: string): PresetOption

/**
 * Record a changed preset, then update each changed knob through its own
 * setter. Selecting the effective preset again appends nothing.
 * @param session - the session the switch belongs to.
 * @param name - the preset to switch to; unknown names throw.
 */
set(session: Session, name: string): void
```

Types: [Session](session.ko.md)

Source: [`packages/interaction/permission-presets/src/index.ts`](../../packages/interaction/permission-presets/src/index.ts)

<a id="permission-presets-events"></a>

### `permission-presets/*` events

<a id="permission-presetscatalog-changed--emit"></a>

#### `permission-presets/catalog-changed` — emit

The selectable process catalog changed. Payload-free by design: consumers subscribe first, then re-read the complete catalog.

```ts cordis-catalog
/**
 * The selectable process catalog changed. Payload-free by design:
 * consumers subscribe first, then re-read the complete catalog.
 * @mode emit
 */
'permission-presets/catalog-changed'(): void
```

Source: [`packages/interaction/permission-presets/src/types.ts`](../../packages/interaction/permission-presets/src/types.ts)
<!-- END GENERATED cordis-surface -->
