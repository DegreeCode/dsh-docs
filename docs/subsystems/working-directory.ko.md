# 작업 디렉터리

[English](working-directory.md) | [中文](working-directory.zh.md) | 한국어

세션의 활성 디렉터리는 [`dsh-working-directory`](../../packages/session/working-directory/README.md)가 소유합니다. 불변 헤더는 원래 프로젝트를 식별하고, `working-directory/change`는 이후 디렉터리 기반 연산이 사용하는 실제 디렉터리를 기록합니다. 이벤트 선언은 생성된 [영속성 카탈로그](../persistence-catalog.ko.md)가 소유합니다.

## 디렉터리 선택

`ctx.workingDirectory.get(session)`은 기록된 값을 읽습니다. `ensure(agent)`는 이를 검증하고 디렉터리가 사라졌으면 원래 프로젝트를 복원합니다. `set(agent, path)`는 요청된 변경을 검증하고 기록합니다. 헤더 디렉터리가 없는 세션은 구성된 런타임 폴백을 사용하며, 폴백을 사용할 수 없으면 오류가 발생합니다.

변경은 한 세션에 지역적입니다. 상대 파일 시스템 연산, 새로 시작된 프로세스, 지침 탐색, 스킬, 파일 완성은 활성 디렉터리를 사용합니다. 기존 터미널과 지속 셸은 자체 디렉터리를 유지합니다. 샌드박스 쓰기 가능 루트와 프로젝트 구성원 자격은 원래 프로젝트에 고정되어 남습니다.

## 모델 컨텍스트

초기 값과 이후의 현재 값은 선택적 런타임 컨텍스트가 비활성화되어 있어도 필수 사용자 컨텍스트 스냅샷으로 모델에 도달합니다. 커밋된 각 변경은 일반 에이전트 인박스를 통해 알림을 큐에 넣으려 시도하며, 취소나 디스포즈는 요청 허용 전에 알림을 버릴 수 있습니다. 디렉터리 이벤트는 살아남고 다음 허용된 요청이 현재 값을 받습니다. 디렉터리 컨텍스트는 결코 시스템 프롬프트에 들어가지 않습니다. [`working_directory`](../../packages/session/tool-working-directory/README.md)는 선택적 `cd` 인수 하나를 노출합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkingdirectory--workingdirectoryservice"></a>

### `ctx.workingDirectory` — `WorkingDirectoryService`

One owner for each Session's effective directory and its model-visible changes.

```ts cordis-catalog
/**
 * Read the committed directory without filesystem I/O.
 * @param session - Session whose directory is requested.
 * @returns its effective absolute directory.
 */
get(session: Session): string

/**
 * Validate the current directory and restore the original project when it disappeared.
 * @param agent - live or unpublished Agent owning the Session.
 * @param signal - cancellation for filesystem inspection.
 * @returns the existing directory; recovery is committed before fulfillment.
 * A notice failure is warned without reverting the committed state.
 * @throws when the original project is also unavailable.
 */
ensure(agent: Agent, signal?: AbortSignal): Promise<string>

/**
 * Change one Session's directory without changing existing processes or permissions.
 * @param agent - live or unpublished Agent owning the Session.
 * @param path - absolute path or a path relative to its current directory.
 * @param signal - cancellation before the durable change.
 * @returns the canonical absolute directory, committed before fulfillment.
 * A notice failure is warned; the next request still receives the committed directory.
 * @throws when the requested path is not an existing directory.
 */
set(agent: Agent, path: string, signal?: AbortSignal): Promise<string>
```

Types: [Agent](core.ko.md) · [Session](session.ko.md)

Source: [`packages/session/working-directory/src/index.ts`](../../packages/session/working-directory/src/index.ts)
<!-- END GENERATED cordis-surface -->
