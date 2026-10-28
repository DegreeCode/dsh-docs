# 저장소

[English](storage.md) | [中文](storage.zh.md) | 한국어

저장소 하위 시스템은 세션 이벤트 로그가 아닌 모든 것을 영속화합니다(세션 로그에는 자체 seam이 있습니다 — [persistence.md](persistence.ko.md)). 이것은 agent-loop 척추의 일부가 아닌 선택적 기능 하나이며, [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)으로 나뉩니다. 허브와 Service Definition([dsh-storage](../../packages/storage/storage), `ctx.storage`), Service Provider([dsh-storage-json](../../packages/storage/storage-json)은 `json`으로, [dsh-storage-sqlite](../../packages/storage/storage-sqlite)는 `sqlite`로 등록), 그리고 Consumer 데이터 형태([dsh-storage-domain](../../packages/storage/storage-domain), `ctx.storageDomain`, `ctx.storage.domain`으로도 접근 가능)입니다. 마지막 것이 백엔드 계약의 유일한 Consumer이며 나머지 모든 것이 사용하는 타입 지정 API입니다. 허브는 스스로 IO를 하지 않습니다. 백엔드가 매체를 소유하고 데이터 형태가 시맨틱을 소유하며, 제품 패키지는 백엔드에 직접 닿지 않습니다. 설계 기록: [도메인 KV 저장소 Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md).

출처: [`packages/storage/storage/src/backend.ts`](../../packages/storage/storage/src/backend.ts) · [`packages/storage/storage-domain/src/spec.ts`](../../packages/storage/storage-domain/src/spec.ts) · [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)

## 허브: `ctx.storage`

`Storage`([시그니처](#ctxstorage--storage))는 저장소가 아니라 만남의 지점입니다. `ctx.storage.backend`는 이름 → 백엔드 표이며, 여러 백엔드가 나란히 마운트된 채로 남고 어느 백엔드가 어느 소비자를 섬기는지는 그 소비자의 구성(도메인 계층의 라우트 표)이지 허브 전역 선택이 아닙니다. `register(name, backend)`는 디스포저를 반환하고, 중복 이름과 알 수 없는 조회는 `StorageError`를 던집니다. 디스포즈는 이름만 등록 해제하며, 소유 플러그인이 등록 해제 후 백엔드를 닫습니다. 각 백엔드 플러그인은 수명 주기 전용 서비스 키(`storageBackendServiceKey(name)`)도 게시하며, 데이터 형태 제공자가 이를 주입해 그 활성화가 백엔드 등록과 경쟁할 수 없게 합니다.

데이터 형태는 병합 확장 가능한 키 맵 아래 허브에 마운트됩니다:

```ts type-equiv
/**
 * Data forms mountable on the hub, keyed by form name. Form owners extend
 * this map via declaration merging (the domain layer merges
 * `domain: DomainFacility`) and mount the facility in their `apply`.
 */
interface StorageForms {}
```

`mount(form, facility)`는 디스포저가 언마운트하는 효과이며, 같은 키를 두 번째로 마운트하면 `duplicate-mount`를 던집니다. `form(form)`은 마운트된 facility를 해석하고 소유 플러그인이 로드될 때까지 `form-not-mounted`를 던집니다. 조립은 조용히 미루지 않고 그에 맞춰 플러그인을 정렬합니다. 도메인 계층이 `domain: DomainFacility`를 병합하므로 `ctx.storage.domain`과 `ctx.storageDomain`은 같은 객체입니다.

## 백엔드 계약

```ts type-equiv
/**
 * One registered backend. A backend owns exactly one medium and shares its
 * lifecycle across all facets; facets are optional members — a backend that
 * cannot serve a data kind simply omits it, and resolution fails loud instead.
 */
interface StorageBackend {
  /** Key-value operations; absent when this backend cannot serve them. */
  readonly kv?: KvFacet

  /**
   * Drain in-flight writes across all open units and release the medium.
   * Idempotent; concurrent and repeated calls resolve once teardown finishes.
   * @returns resolution after the medium is released.
   */
  close(): Promise<void>
}
```

백엔드는 매체 하나(파일 트리 루트, 데이터베이스 파일)를 소유하고 선택적 연산 그룹을 노출하며, `kv`가 유일하게 배포되는 그룹입니다. `KvFacet.open(descriptor)`는 이름이 지정된 단위 하나를 열며, `KvUnitDescriptor`는 이름, 현재 형식 버전, 선택적 호환 레코드 버전, 표 이름, 전역 싱글턴 슬롯의 존재 여부를 담고, `loadAll`, `putRecord`, `deleteRecord`, `deleteRecords`, `setGlobal`, `close`를 가진 `KvUnit`을 반환합니다. 단위와 표 이름은 `UNIT_NAME_RE`와 일치해야 하며(파일 이름이자 SQL 식별자 세그먼트로 안전합니다), 레코드 키는 `single` 레이아웃에서는 불투명 문자열이고 `per-record` 레이아웃에서는 `[a-zA-Z0-9_-]+` 경로 세그먼트와 일치합니다. 단위는 동시 쓰기를 직렬화하지 않지만(순서는 호출자 몫입니다) 각 단일 호출은 매체에서 원자적입니다. 내구성은 단일 레코드 쓰기와 전체 파일 게시에 성립하며, `per-record` 배치 삭제는 파일 시스템이 디렉터리 항목 갱신을 영속화하는 데 의존합니다. `deleteRecords`는 한 번의 호출로 배치 전체를 적용합니다. 나열된 모든 레코드가 읽기 가능한 상태에서 없고 백엔드가 배치를 받아들인 뒤 이행되며, 거부되면 보통 배치는 적용되지 않은 채로 남습니다. 배치의 상태를 확립하거나 복원할 수 없는 백엔드는 `unknown-state`로 거부하고, 그 뒤 그 단위에 대한 모든 이후 연산은 `close()`가 해제할 때까지 같은 오류로 거부됩니다(닫은 뒤 호출은 `closed`로 거부). 원자적 교체 이후의 `single` 레이아웃 실패(디렉터리 fsync 오류)는 호출자가 거부를 보는 동안 새 파일이 매체에 남을 수 있습니다. 단위는 메모리를 일관되게 유지하고 다음 게시가 파일을 다시 씁니다. 다른 버전이 찍힌 `single` 매체는 `version-mismatch`로 거부하고, 허용 집합 밖의 버전이 찍힌 `per-record` 문서는 없는 것으로 읽힙니다. 단위로 파싱할 수 없는 매체는 `malformed-medium`으로 거부합니다. [`backend.ts`](../../packages/storage/storage/src/backend.ts)가 조항별 규범 계약이며, [`tests/contract.ts`](../../packages/storage/storage/tests/contract.ts)의 공유 적합성 스위트가 각 백엔드에 대해 공유 조항을 검사합니다. [json 백엔드](../../packages/storage/storage-json/README.md)는 단위마다 사람이 읽을 수 있는 파일 하나를 원자적으로 다시 게시하고, [sqlite 백엔드](../../packages/storage/storage-sqlite/README.md)는 자주 갱신되는 데이터를 위해 하나의 데이터베이스에 행마다 문서 하나를 저장합니다.

## 도메인 선언

도메인은 소유 패키지가 스펙 객체로 한 번 선언합니다. 도메인의 정체성, 레이아웃, 레코드 스키마의 단일 출처이며, zod를 쓰므로 `z.infer`가 소비자 타입을 중복 없이 유지합니다:

```ts type-equiv
/** Static declaration of one domain: identity, version, and record layout. */
interface DomainSpec {
  /** Domain name; must match `UNIT_NAME_RE` (doubles as the backend unit name). */
  readonly name: string
  /** Current domain format version; reads enforce it according to the selected layout. */
  readonly version: number
  /**
   * Medium layout for the backend unit: `single` (the default) stores the
   * whole unit as one document; `per-record` stores each record as its own
   * document, for units whose records are large, sparse, or individually
   * disposable — the projection cache — and scopes version checks per record
   * (an unaccepted record document is discarded, never migrated).
   */
  readonly layout?: 'single' | 'per-record'
  /**
   * Older domain versions whose stored records the current record schemas
   * also accept (the declaring owner vouches for that, typically by
   * declaring the fields older records lack as optional). `per-record` backends
   * read documents stamped with a listed version instead of discarding them,
   * and accept a legacy whole-unit file so stamped for the one-time
   * bootstrap; writes always stamp {@link version}.
   */
  readonly compatibleVersions?: readonly number[]
  /**
   * What `open` does with a stored table record that fails its zod schema.
   * Absent (the default), the whole open rejects with `invalid-record` —
   * right for authoritative data. `'backup-and-skip'` is for domains whose
   * records are disposable derived data: the backend moves the record's
   * document aside (`KvUnit.backupRecord`), the failure is logged with
   * its cause, and the open continues with the record absent. A backend
   * without `backupRecord` (no per-record document to move) falls back
   * to the rejecting default. The global slot always rejects.
   */
  readonly invalidRecords?: 'backup-and-skip'
  /** Optional global singleton slot. */
  readonly global?: DomainGlobalSpec<unknown>
  /** Table declarations keyed by table name; each name must match `UNIT_NAME_RE`. */
  readonly tables: Record<string, DomainTableSpec>
}
```

`defineDomain(spec)`는 스펙의 리터럴 타입을 고정하고, 어떤 매체에도 닿기 전에 소유자의 모듈 로드 시점에 크게 실패합니다. `UNIT_NAME_RE` 밖의 도메인이나 표 이름, 음이 아닌 정수가 아닌 버전, `null`을 받아들이는 전역 스키마는 모두 예외를 던집니다(`null`은 매체의 "기록된 적 없음" 표식이므로, nullable 전역을 저장하면 왕복할 수 없습니다). `domainTable<K, V>(schema)`는 팬텀 컴파일 타임 키 타입(보통 [브랜드 id](core.ko.md#브랜드-id))을 가진 표 하나를 선언하고, `descriptorOf(spec)`는 백엔드 대상 단위 디스크립터를 투영합니다.

## 열린 도메인

```ts type-equiv
/** One open domain, typed by its spec. */
interface Domain<S extends DomainSpec> {
  /** Domain name from the spec. */
  readonly name: string
  /** Global singleton handle; a spec without `global` has no usable handle (`never`). */
  readonly global: DomainGlobalHandleOf<S>
  /**
   * Resolve one declared table handle. Handles are stable — repeated calls
   * return the same instance.
   * @param name - Declared table name.
   * @returns the typed table handle.
   */
  table<N extends keyof S['tables'] & string>(name: N): KvTable<TableKeyOf<S, N>, TableValueOf<S, N>>

  /**
   * Close this domain: reject new writes immediately, drain already-queued
   * writes (their events still emit), release the backend unit, then free
   * the domain name for a later open. Idempotent — repeated calls share one
   * teardown. The consumer owns this call (typically as its own `ctx.effect`
   * disposer); the facility closes any domain left open when it unmounts.
   * @returns resolution after the unit is released.
   */
  close(): Promise<void>
}
```

읽기는 권위 있는 메모리 내 상태에서 동기적으로 이루어집니다. `KvTable`은 `get`/`entries`/`keys`/`size`를 노출하며(대기 중인 쓰기가 반영되는 동안에도 안정적인 스냅샷 반복자입니다), 전역 핸들의 `get()`은 첫 `set`이 매체에 슬롯을 구체화할 때까지 스펙의 `initial`을 제공합니다. 모든 쓰기(`put`, `delete`, `deleteMany`, `update`, `global.set`)는 도메인별 체인 하나에 대기하고 먼저 백엔드 내구성에 도달한 뒤 메모리를 변경하고, 그다음 `domain/changed`를 발생시킵니다. 거부된 백엔드 쓰기는 메모리를 건드리지 않으므로 읽기가 매체와 어긋나지 않습니다. 대신 `unknown-state`를 보고하는 백엔드는 도메인을 격리하고, 그 읽기와 이후 쓰기는 `close()`가 해제할 때까지 거부됩니다. `update(key, fn)`은 체인 슬롯에서 원자적 읽기-수정-쓰기이며(없는 키는 `missing-key`로 거부됩니다), 없는 키의 `delete`는 쓰기도 이벤트도 없이 `false`로 이행됩니다. `deleteMany(keys)`는 존재하는 키들을 하나의 체인 슬롯에서 백엔드 배치 하나로 제거하고, 제거된 개수로 이행하며, 제거된 키마다 `domain/changed`를 하나씩 발생시킵니다. 거부된 백엔드 쓰기는 모든 레코드를 제자리에 두고 아무것도 발생시키지 않으며, `unknown-state` 거부는 도메인을 격리합니다. 반환되는 레코드는 사본이 아니라 저장된 객체 자체이므로, `put`/`update`로 대체하고 제자리에서 변경하지 마세요.

## 도메인 facility: `ctx.storageDomain`

`DomainFacility`([시그니처](#ctxstoragedomain--domainfacility))는 라우팅된 백엔드 위에서 선언된 도메인을 엽니다. 라우팅은 도메인 플러그인의 구성이지 허브의 것이 아닙니다. `backend`는 필수 기본 라우트를 지목하고 `routes`가 도메인 이름별로 이를 재정의합니다. `open(spec)`은 엄격한 순서를 실행하며 각 단계가 호출 전체를 실패시킵니다. 이미 열렸거나 아직 닫히는 중인 이름을 거부하고(`already-open`), 라우트를 해석하며(`backend-not-found`), 백엔드의 `kv` facet을 요구하고(`facet-unsupported`), 단위를 열며(백엔드의 `version-mismatch`/`malformed-medium`은 그대로 전달됩니다), 스펙의 zod 스키마에 대해 모든 저장 레코드와 전역을 검증합니다(문제가 된 표와 키와 함께 `invalid-record`). 호출자가 반환된 핸들을 소유하고 `Domain.close()`로 해제하며, 플러그인이 언마운트될 때 아직 열려 있는 도메인은 facility가 닫습니다. 닫힌 도메인의 이름은 정리가 완전히 끝난 뒤에야 다시 열 수 있게 해제됩니다. `get(name)`은 모든 타입 지정 핸들 뒤의 패키지 비공개 `DomainImpl` 런타임으로 향하는 타입 없는 진단 조회이고, `closeAll()`은 언마운트 경로입니다.

## 변경 이벤트: `domain/changed`

모든 영속 쓰기는 백엔드가 내구성을 승인한 뒤에 엄격히, 도메인의 쓰기 체인 순서로 이벤트 하나를 발생시킵니다([이벤트 항목](#domainchanged--emit)):

```ts type-equiv
/** Shared location fields of one durable domain change. */
interface DomainChangedBase {
  /** Owning domain name. */
  readonly domain: string
  /** Table name; `''` for a global-singleton write. */
  readonly table: string
  /** Record key; `''` for a global-singleton write. */
  readonly key: string
}
```

```ts type-equiv
/** One durable domain change; a closed union — switch on `operation`. */
type DomainChanged = DomainChangedPut | DomainChangedDeleted
```

`put`(삽입, 덮어쓰기, 전역 쓰기)은 새 스냅샷을 `value`에 담으며 이전 값은 결코 담지 않습니다. 차분하는 소비자는 자신의 이전 스냅샷을 유지합니다. `deleted`는 값이 없는 묘비입니다. 이벤트는 트랜잭션 참여자가 아니라 알림입니다. 발생 시점에 이미 커밋 지점이 지났으므로, 동기적으로 예외를 던지는 리스너는 이미 내구적인 쓰기를 거부하는 대신 기록된 경고와 함께 격리되고, 발생된 값은 발생 시점의 메모리 상태와 같습니다. 이벤트는 인프로세스 전용이며, 프로세스 간 변경 푸시는 기록된 한계입니다([패키지 README](../../packages/storage/storage-domain/README.md)).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstorage--storage"></a>

### `ctx.storage` — `Storage`

The storage hub service. Backends register under `backend`; data forms mount under their `StorageForms` key and are reached as `ctx.storage.<form>`.

```ts cordis-catalog
/**
 * Mount a data-form facility on the hub. Mounting is an effect: the
 * returned disposer unmounts the form.
 * @param form - Form key declared in {@link StorageForms}.
 * @param facility - The facility instance to expose.
 * @returns the disposer that unmounts the form.
 */
mount<K extends keyof StorageForms>(form: K, facility: StorageForms[K]): () => void

/**
 * Resolve a mounted data form.
 * @param form - Form key declared in {@link StorageForms}.
 * @returns the mounted facility.
 */
form<K extends keyof StorageForms>(form: K): StorageForms[K]
```

Source: [`packages/storage/storage/src/index.ts`](../../packages/storage/storage/src/index.ts)

<a id="ctxstoragedomain--domainfacility"></a>

### `ctx.storageDomain` — `DomainFacility`

The mounted domain facility. Opens declared domains over routed backends; one facility instance owns the open-domain table and enforces single-open per domain name.

```ts cordis-catalog
/**
 * Open one declared domain. Steps, each failing the whole call: reject a
 * name that is already open (`already-open`); resolve the backend route
 * (`backend-not-found` passes through from the hub); require its `kv` facet
 * (`facet-unsupported`); open the unit projected from the spec (backend
 * `version-mismatch`/`malformed-medium` pass through); load and validate
 * every stored record against the spec's zod schemas (`invalid-record`
 * with the offending table and key — unless the spec declares
 * `invalidRecords: 'backup-and-skip'` and the unit can move documents aside, in
 * which case the failing record is backed up, logged, and skipped);
 * construct the domain.
 *
 * Lifecycle: the CALLER owns the returned handle and closes it via
 * `Domain.close()` (typically as its own `ctx.effect` disposer) — the
 * facility does not tie the domain to any consumer fiber. Domains still
 * open when the facility unmounts are closed by the plugin disposer.
 * @param spec - The domain declaration, typically from `defineDomain`.
 * @returns the opened domain handle, typed by the spec.
 */
async open<S extends DomainSpec>(spec: S): Promise<Domain<S>>

/**
 * Look up an open domain by name, untyped. Diagnostic surface; typed
 * consumers hold the handle returned by {@link open}.
 * @param name - Domain name.
 * @returns the open domain runtime, or `undefined` when not open.
 */
get(name: string): DomainImpl | undefined

/**
 * Close every domain still open on this facility. The unmount path for
 * consumers that never called `Domain.close()` themselves; closing is
 * idempotent, so double-closing an already-closed domain is harmless.
 * @returns resolution after every unit is released.
 */
async closeAll(): Promise<void>
```

Source: [`packages/storage/storage-domain/src/index.ts`](../../packages/storage/storage-domain/src/index.ts)

<a id="domain-events"></a>

### `domain/*` events

<a id="domainchanged--emit"></a>

#### `domain/changed` — emit

A domain record or the global singleton changed, emitted once per write strictly after the backend acknowledged durability. Events of one domain arrive in its write-chain order.

```ts cordis-catalog
/**
 * A domain record or the global singleton changed, emitted once per write
 * strictly after the backend acknowledged durability. Events of one
 * domain arrive in its write-chain order.
 * @param change - domain, table (`''` for global), key (`''` for global),
 * operation discriminant, and on `put` the new snapshot.
 * @mode emit
 */
'domain/changed'(change: DomainChanged): void
```

Source: [`packages/storage/storage-domain/src/events.ts`](../../packages/storage/storage-domain/src/events.ts)
<!-- END GENERATED cordis-surface -->
