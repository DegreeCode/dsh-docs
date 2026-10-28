# 컴퓨터 사용

[English](computer-use.md) | [中文](computer-use.zh.md) | 한국어

컴퓨터 사용은 모델이 구성된 제공자를 통해 로컬 데스크톱을 관찰하고 조작하게 합니다. 공유 DSH 기능은 **컴퓨터 사용**이라 하고, **Cua Driver**는 업스트림 구현의 이름입니다.

[Computer Use](../../packages/experimental/cua-bundle/README.md)는 macOS CUA 권한 설정을 위한 선택적 실험 스위치를 제공합니다.

[`macOS CUA provider`](../../packages/experimental/cua-macos/README.md)는 [공유 CUA 객체와 실행기](../../packages/experimental/cua/README.md)를 사용하며, 이들이 사용자 질문과 프로필 구성을 통해 애플리케이션 동의를 강제합니다.

CUA 제공자는 시스템 권한 상태, 명시적 시스템 요청, 애플리케이션 철회를 위해 `ctx.cuaAccess`를 소유합니다. 그 [권한 페이지](../../packages/experimental/cua/README.md)가 이 컨트롤들을 투영하며, 앱·창 연산은 디스패치 전에 제공자의 동의 정책을 강제합니다.

| 권한 타입 | 의미 |
|---|---|
| `CuaApplicationId`, `CuaApplicationGrant` | 실행 파일·서명 정체성과 그 표시되는 저장된 결정입니다. |
| `CuaSystemPermission` | 사람이 선택한 손쉬운 사용 또는 화면 기록입니다. |
| `CuaPermissionProcess`, `CuaSystemPermissionState` | 네이티브 권한 검사, 관찰된 도우미·부모 프로세스, 그리고 도우미 시작 시 macOS 프로세스 책임으로 식별된 애플리케이션입니다. 선택적 시스템 질의나 애플리케이션 조회를 사용할 수 없으면 애플리케이션 메타데이터는 없습니다. |
| `CuaApplicationState` | 저장된 허가, 거부된 애플리케이션, 영속성 사용 가능 여부입니다. 세션 전용 허가는 제공자 내부에 남습니다. 시스템 관찰과 애플리케이션 아이콘은 따로 조회되므로 페이지가 각 결과를 도착하는 대로 표시할 수 있습니다. |

## 제공자 선택

같은 조합에 [`dsh-computer-use`](../../packages/computer-use/computer-use/README.md)와 제공자 하나를 마운트하세요. 두 Cua Driver 제공자 모두 실험적인 공개 npm 패키지이며 명시적 활성화가 필요합니다.

| 제공자 | 런타임 |
|---|---|
| [Cua Driver MCP](../../packages/experimental/computer-use-cua-driver-mcp/README.md) | MCP를 통해 연결된, 이미 설치된 `cua-driver` 실행 파일 |
| [Cua Driver native](../../packages/experimental/computer-use-cua-driver-native/README.md) | npm 의존성과 함께 설치되는 플랫폼 네이티브 런타임 |

각 제공자는 자신의 업스트림 도구 카탈로그를 제공합니다. 공유 서비스는 이름만 등록하고 같은 이름을 가진 다른 인스턴스를 포함해 두 번째 제공자를 거부합니다. 공통 데스크톱 연산 메서드도, 모델이 제어하는 선택자도 없습니다.

## 수명과 데스크톱 공유

제공자는 도구와 소유 리소스를 종료하는 동안에도 등록을 유지합니다. 시작 실패는 시도된 등록을 해제합니다. MCP 제공자는 재연결 중에도 등록을 유지합니다.

등록된 제공자 하나가 세션을 위해 데스크톱을 예약하지는 않습니다. 호출자는 세션과 별도 DSH 프로세스에 걸쳐 완전한 관찰·동작·검증 워크플로를 조정합니다. 취소된 호출은 데스크톱이 이미 받은 입력을 되돌릴 수 없습니다.

## 결과와 플랫폼 요구 사항

도구는 일반 실행 파이프라인과 세션 로그를 사용합니다. 첨부 저장소가 있는 이미지 지원 모델 라우트는 영속 스크린샷을 받고, 이미지를 지원하지 않는 라우트는 기존 MCP 이미지 진단을 받습니다. 설치, 권한, 플랫폼 한도는 제공자 README가 소유합니다.

[결정 기록](../../.agents/notes/implemented/architecture/2026-09-12-computer-use-provider-registration.md)이 등록 전용 서비스와 두 Cua Driver 통합을 설명합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomputeruse--computeruseregistry"></a>

### `ctx.computerUse` — `ComputerUseRegistry`

Owns one optional provider registration in the shared computer-use service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: ComputerUseProviderName): () => Promise<void>
```

Source: [`packages/computer-use/computer-use/src/index.ts`](../../packages/computer-use/computer-use/src/index.ts)

<a id="ctxcuaaccess--cuaaccess"></a>

### `ctx.cuaAccess` — `CuaAccess`

Browser controls for provider-owned native permission and application decisions.

```ts cordis-catalog
/** Read PTC execution state separately from native permission checks.
 * @returns Whether the shared runtime retains memory and has an editable profile entry.
 */
@Remote ptcConfiguration(): { persistent: boolean; writable: boolean }

/** Persist in-memory PTC execution through the existing profile editor and Loader lifecycle.
 * @returns Completion after the shared runtime reload; already-persistent runtimes are left intact.
 */
@Remote async enablePersistentPtc(): Promise<void>

/**
 * Read application decisions without waiting for the native helper.
 * @returns Saved grants and refused applications with their persistence owner.
 */
@Remote applications(): CuaApplicationState

/**
 * Inspect system privileges independently of application decisions and icons.
 * @returns Fresh native preflight and launch metadata.
 */
@Remote async systemStatus(): Promise<CuaSystemPermissionState>

/**
 * Load presentation icons separately from application decisions.
 * @returns Optional native PNG icons keyed by executable path for saved and blocked applications.
 */
@Remote async applicationIcons(): Promise<Record<string, string>>

/**
 * Request a system privilege explicitly selected by the user.
 * @param permission macOS privilege to request.
 * @returns Preflight state after requesting; a false value never implies consent.
 */
@Remote async requestPermission(permission: CuaSystemPermission): Promise<CuaSystemPermissionState>

/**
 * Open the macOS privacy pane selected by the user.
 * @param permission Corresponding system privilege.
 * @returns Completion after macOS accepted the open request.
 */
@Remote async openSettings(permission: CuaSystemPermission): Promise<void>

/**
 * Remove saved and session access and join affected operations.
 * @param id Application identity displayed on the permission page.
 * @returns Completion after persistence and cancellation; dispatched input cannot be undone.
 */
@Remote revoke(id: CuaApplicationId): Promise<void>

/**
 * Clear this application's refusals across sessions so each session may ask for access again.
 * @param id Refused or revoked application displayed on the permission page.
 * @returns Completion after clearing refusals; no permission is granted and no action is replayed.
 */
@Remote async retryApproval(id: CuaApplicationId): Promise<void>
```

Source: [`packages/experimental/cua/src/access.ts`](../../packages/experimental/cua/src/access.ts)
<!-- END GENERATED cordis-surface -->
