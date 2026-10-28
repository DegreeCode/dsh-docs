# 계획 모드

[English](plan.md) | [中文](plan.zh.md) | 한국어

계획 모드는 [dsh-plan-mode](../../packages/plan/plan-mode)(`ctx.planMode`, `PlanModeController`)가 소유하는 에이전트별 협업 상태로 기록됩니다. 활성인 동안 배포 소유 안내 섹션이 각 모델 요청에 포함됩니다. 계획 모드는 **소프트 안내**입니다. [샌드박스 모드](sandbox.ko.md)와 [승인 정책](approval.ko.md)은 제한을 독립적으로 강제하며 어느 쪽도 계획 상태를 읽거나 쓰지 않으므로, 배포가 이들을 따로 구성합니다. 이 패키지는 선택적이며 에이전트 루프가 여기에 의존하지 않습니다. `plan:policy` 프롬프트 섹션을 기여하고 `exit_plan_mode` 도구와 `/plan` 명령을 등록합니다. 근거는 [설계 참조](../../packages/plan/plan-mode/README.md)가, 모델 경험과 한계 세부 사항은 [패키지 README](../../packages/plan/plan-mode/README.md)가 소유합니다.

출처: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)

## 기록된 상태와 복구

`plan/mode`(`{ active: boolean }`)는 로그 전용 전체 값 교체 [세션 이벤트](session.ko.md)입니다. 영속적이고 재생 가능하며 모델 트랜스크립트에는 절대 들어가지 않습니다. `plan` 단위는 커밋된 모드, 명령 확정(settlement), 최신 요청 헤더에 기록된 모드를 폴드(fold)합니다. `ctx.planMode`는 레지스트리를 요구하고 활성화 중에 `plan`과 `turnBoundary` 등록을 await한 뒤, 유지된 핸들을 통해 읽습니다. 클라이언트는 `{ active, pending }`만 받고, resume, fork, 압축은 둘 다 로그에서 복구합니다. 완전한 이벤트 선언은 [영속 로그 이벤트 카탈로그](../persistence-catalog.ko.md)에 있습니다.

## 대기 중 선택과 pre-step 추가

모든 세션 이벤트는 턴에 포함되므로, 사용자 선택은 요청 파생 전에 다음으로 수용된 턴 내 pre-step이 이를 추가할 때까지 대기합니다. 어느 턴에서 그 일이 일어나든 마찬가지입니다. 선택은 계속을 강제하지 않으므로, 턴의 마지막 수용된 pre-step 이후에 한 선택은 이후 턴에서 추가됩니다. `set(agent, active)`는 대기 중 선택을 기록하고(대상이 기록되었거나 이미 대기 중인 상태와 같으면 아무 일도 하지 않습니다), `get(agent)`는 `{ active: boolean; pending?: boolean }`을 반환합니다. 즉 현재 단계를 조립하는 데 쓰인 기록 상태와 추가되기를 기다리는 선택 상태입니다.

에이전트가 실행 중일 때 유일한 추가 지점은 앞에 붙은 `agent/pre-step` 리스너입니다. 이는 제안된 모든 요청 단계(턴 1의 1단계와 요청 복구 재시도 포함)를 관찰하고, 하위 리스너를 먼저 호출하며, 그들이 단계를 수용한 뒤에만 추가합니다. 프롬프트 허용은 턴보다 먼저 일어나고 `plan/mode`를 추가할 수 없으므로, 프롬프트에서 한 선택은 시작하는 턴의 첫 수용된 턴 내 pre-step이 추가합니다. 추가 실패는 턴을 막을 수 없고, 선택은 이후 수용된 턴 내 pre-step을 위해 대기로 남습니다. 추가된 사용자 선택은 플러그인 출처 `user/message` 알림 하나도 기록하지만, 마지막으로 기록된 요청 헤더가 다른 상태를 설명했을 때만 그렇게 하므로 모델은 컨텍스트가 바뀐 정확한 시점에만 알림을 받고 결코 중복되지 않습니다. 턴의 마지막 수용된 pre-step 이후에 한 선택은 프로세스 로컬로 남고, 다른 수용된 턴 내 pre-step 전에 프로세스가 종료되면 유실됩니다([README 한계](../../packages/plan/plan-mode/README.md#known-limitations-and-deferred-work)).

## 구성

```ts type-equiv
/** Deployment-owned plan guidance. */
interface PlanModeConfig {
  /** Guidance rendered as the `plan:policy` prompt section while plan mode is active. */
  section: string
}
```

`section`이 없거나 비어 있거나 문자열이 아니면, 그리고 알 수 없는 키는 무시되는 대신 플러그인 로드 시 실패합니다. 계획 모드가 활성인 동안 정확한 `section` 텍스트가 order 50의 `plan:policy` [시스템 프롬프트 섹션](system-prompt.ko.md)으로 렌더링되며, 비활성 계획 모드는 아무 텍스트도 기여하지 않습니다.

## 종료 도구와 `/plan` 명령

[`exit_plan_mode`](../tool-catalog.ko.md#deepseek-aidsh-plan-mode)는 점진적으로 공개됩니다. 선택된 계획 상태가 활성인 첫 단계부터 허용되고 Session의 나머지 동안 허용된 상태로 남으므로, 첫 계획 모드 진입이 요청 도구 선언에 이를 추가하고 이후 전환은 계획 안내만 바꿉니다. 네이티브와 PTC 실행이 같은 허용 집합을 사용하고, 첫 진입 전의 호출은 `UNKNOWN_TOOL`을 반환하며, 계획 모드가 커밋되지 않은 상태의 호출은 실패합니다. 계획 모드에서 이 도구는 `#` 제목으로 시작하는 완전한 markdown 계획을 요구하고 [user-questions seam](user-questions.ko.md)을 통해 검토용으로 제시합니다. 승인은 `{ approved: true }`를 반환하고 다음 수용된 턴 내 pre-step에서 추가될 조용한(서술되지 않는) 대기 종료를 기록합니다. 따라서 계획 안내는 어시스턴트의 현재 도구 배치가 끝날 때까지 계속 활성이고, 도구 결과 자체가 전환을 보고합니다. 계획 유지는 사용자 피드백을 담은 실패한 호출이므로 모델이 수정해 다시 제시합니다. 검토를 닫으면 `{ approved: false }`를 반환하고 턴을 마치므로, 계획 모드는 사용자의 다음 메시지까지 활성으로 남습니다. 상호작용 채널이 없거나 검토 중 서비스가 다시 로드되는 경우도 조용히 계획 모드를 벗어나는 대신 호출이 실패합니다.

[`ctx.commands`](commands.ko.md)가 구성되면 플러그인은 `/plan [off|message]`를 등록합니다. 맨 `/plan`은 계획 모드를 선택하고, 그 밖의 비어 있지 않은 메시지는 계획 모드를 선택한 뒤 `agent.steer()`를 통해 텍스트를 제출해 계획 안내 아래에서 다음 단계의 일반 기록 사용자 메시지가 되며, 정확히 `off` 인자는 비활성을 선택하고 이는 추가되어 요청에 보이기 전에 대기 중 진입도 취소합니다.

## 서비스

`ctx.planMode`는 기록된 계획 상태를 소유하고, 단계 시작에 선택된 상태를 적용·서술하며, `plan:policy` 섹션, `/plan` 명령, 조건부 종료 도구를 소유합니다. `get`/`set` 시그니처는 생성된 [서비스 카탈로그](#ctxplanmode--planmodecontroller)에 있습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxplanmode--planmodecontroller"></a>

### `ctx.planMode` — `PlanModeController`

`ctx.planMode`: owns logged plan state, applies and narrates selected state at step start, the `plan:policy` section, the `/plan` command, and the conditional exit tool. Client carriers expose the projection's cropped `{ active, pending }` view. Agent prompt assembly fails while the projection reader is not ready; callers must await plugin activation before running an agent.

```ts cordis-catalog
/**
 * Read the logged plan state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether plan mode should be active. Between turns the method
 * appends the change immediately because no in-turn pre-step will run until
 * another prompt starts a turn. The open-turn fold is the idle signal:
 * agent status stays `running` through post-turn checkpointing, when no
 * further in-turn pre-step runs. During an open turn the selection remains
 * pending until the next accepted in-turn pre-step. Repeated selection of
 * the current or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether plan mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.ko.md)

Source: [`packages/plan/plan-mode/src/index.ts`](../../packages/plan/plan-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
