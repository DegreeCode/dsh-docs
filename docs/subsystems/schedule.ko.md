# 호스트 전역 Schedule

[English](schedule.md) | [中文](schedule.zh.md) | 한국어

Schedule은 세션 활성화와 무관하게 알림을 저장하고 원래 세션으로 전달합니다. 이 페이지는 [`types.ts`](../../packages/schedule/schedule/src/types.ts)의 영속 타입과 모델 대상 타입을 기록하며, 조합 방식과 알림 프레이밍은 [패키지 README](../../packages/schedule/schedule/README.md)가 소유합니다.

## 영속 기록

`ScheduleId`는 전역적으로 유일한 [브랜드 id](core.ko.md#브랜드-id)입니다. 버전 1 `schedule` storage domain은 `tasks` 테이블을 소유하며, 그 항목은 `ScheduleRecord`를 원래 `sessionId`에 묶고 `status: 'active' | 'inactive'`와 선택적 `lastDelivery`를 저장합니다. 상태가 없는 기록은 과거 세션을 스캔하거나 다시 만들지 않고 `active`로 정규화합니다. 생성은 대상을 RFC 3339 UTC `scheduledAt`으로 정규화합니다. `after`는 제출된 지연을 유지하고, `every`는 고정 간격을, `daily`와 `weekly`는 정규화된 로컬 `time`과 명시적 `timeZone`을, `cron`은 정규화된 다섯 필드 `expression`과 명시적 `timeZone`을 유지합니다. daily, weekly, cron 디코딩은 커밋된 시점과 저장된 시간대 표기를 보존합니다. 저장된 작업 기록은 필수 `title`, 즉 작업 화면이 표시하는 짧은 이름을 선언하며, 생성 시 이를 요구하고 지시문에서 절대 도출하지 않습니다. 어떤 저장 기록도 제목을 빠뜨릴 수 없습니다. `title`이 없거나, 트리밍 후 비어 있거나, 트리밍되지 않았거나, 120자를 넘는 기록은 `ScheduleLogError`와 함께 영속 디코딩에 실패하며, schedule domain은 백업 후 건너뛰기 정책을 선언하지 않으므로 그런 저장 작업 하나가 그 domain 전체의 열기를 거부하게 만들고 버려지지 않습니다. 명시적 삭제만 작업을 제거하며, 이전에 물리적으로 삭제된 작업은 복원되거나 만들어지지 않습니다.

```ts type-equiv
/** Durable one-shot reminder created from a positive delay. */
interface AfterScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a delayed one-shot reminder. */
  readonly kind: 'after'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Positive safe-integer delay accepted at creation. */
  readonly afterSeconds: number
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable one-shot reminder created from an absolute instant. */
interface AtScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for an absolute one-shot reminder. */
  readonly kind: 'at'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Four-digit-year RFC 3339 UTC target. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable fixed-rate reminder aligned to creation or its most recent interval edit. */
interface EveryScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a fixed-rate recurring reminder. */
  readonly kind: 'every'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Fixed safe-integer interval, never below one minute. */
  readonly everySeconds: number
  /** Next anchor-aligned occurrence while active, or final occurrence when inactive. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** Durable daily wall-clock reminder; gaps skip a date and overlaps use the earlier instant. */
interface DailyScheduleRecord {
  /** Globally unique task identity. */
  readonly id: ScheduleId
  /** Rule discriminator for a daily wall-clock reminder. */
  readonly kind: 'daily'
  /** Required stored task name; already trimmed, non-empty, and at most 120 characters. */
  readonly title: string
  /** Trimmed reminder content supplied at creation. */
  readonly prompt: string
  /** Local time normalized to HH:mm:ss.SSS. */
  readonly time: string
  /** Explicit IANA zone; equivalent timing edits retain the stored spelling. */
  readonly timeZone: string
  /** Committed next UTC instant while active, or final occurrence when inactive. */
  readonly scheduledAt: string
}
```

```ts type-equiv
/** One-shot task variants. */
type OneShotScheduleRecord = AfterScheduleRecord | AtScheduleRecord
```

```ts type-equiv
/** Recurring Host task variants. */
type RecurringScheduleRecord = EveryScheduleRecord | DailyScheduleRecord | WeeklyScheduleRecord | CronScheduleRecord
```

```ts type-equiv
/** Reminder rule and target, stored with its original Session binding. */
type ScheduleRecord = OneShotScheduleRecord | RecurringScheduleRecord
```

## 절대 시각 입력

`at` 선택자는 엄격한 오프셋 포함 RFC 3339 문자열이거나 정확한 로컬 달력 객체입니다. 로컬 형태는 도구 경계에서 그 해석을 명시적으로 유지합니다:

```ts type-equiv
/** Structured local-calendar input accepted by creation and timing edits. */
interface LocalAtInput {
  /** Four-digit ISO calendar date. */
  readonly date: string
  /** Local wall-clock time with optional one-to-three digit milliseconds. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

```ts type-equiv
/** Absolute selector accepted by creation and timing edits. */
type AtInput = string | LocalAtInput
```

배포되는 웹 구성은 `schedule` 서비스와 `ui-schedule` 작업 페이지를 마운트합니다. 시계 읽기와 네 개의 알림 도구는 프리셋이 소유합니다. `standard`, `cordis`, `ptc`는 `time-context`와 `@deepseek-ai/dsh-tool-schedule`을 함께 선언하고, `minimal`은 둘 다 선언하지 않습니다. 그 세 프리셋의 `tool-subagent`와 `tool-subagent-fork` 행은 네 도구를 거부하며, 각 도구는 위임된 호출자를 `subagent_session`으로 거부하므로 위임된 자식은 도구를 보지도 못하고 호출이 받아들여지지도 않습니다. time-context는 열린 턴에 모호하지 않은 브라우저 시간대가 하나 있을 때 그 요청 지역 시간대로 자격 요건을 갖추지 않은 자연어 날짜·시각을 해석하라고 모델에 알려 줍니다. 브라우저 시간대 기록이 섞여 있거나 없으면 모델은 질문하라는 안내를 받습니다. 그 안내는 영속 세션 기본값이 아닙니다. 모델은 여전히 문자열 형태에는 오프셋을, 로컬 형태에는 `time_zone`을 전달해야 하며, Schedule은 브라우저, 세션, 프로세스, 모델 컨텍스트를 결코 읽지 않습니다.

Schedule은 유효하지 않은 오프셋과 시간대, 오프셋이 없는 문자열, 미래가 아닌 대상, 일광 절약 시간의 공백에 들어가는 로컬 시각을 거부합니다. 일광 절약 시간의 중복 구간에서는 첫 번째, 즉 더 이른 시점을 선택합니다. 성공한 생성은 정규 UTC `scheduledAt`만 저장하므로 재생은 주변 시간대 상태에 의존하지 않습니다.

<a id="daily-wall-clock-input"></a>
## 일별 벽시계 입력

`daily`는 `after_seconds`, `at`, `every_seconds`, weekly 선택자, cron 선택자와 함께 상호 배타적인 생성 선택자 중 하나입니다. 예를 들어 `daily: { time: '23:00:00', time_zone: 'Asia/Shanghai' }`는 자격을 갖춘 각 로컬 날짜에 그 시간대의 23:00을 선택합니다. 이 정확한 객체에는 날짜, 오프셋, 간격 필드가 없습니다:

```ts type-equiv
/** Daily local-time selector accepted by creation and timing edits. */
interface DailyInput {
  /** Local HH:mm:ss time with optional one-to-three fractional digits. */
  readonly time: string
  /** Explicit UTC or IANA Area/Location zone. */
  readonly time_zone: string
}
```

생성은 선택적 1~3자리 소수 초를 허용하는 `HH:mm:ss`를 요구하고, 윤초와 `24:00`을 거부하며, 명시적 IANA 시간대를 정규화하고, `time`을 `HH:mm:ss.SSS`로 저장합니다. 첫 `scheduledAt`은 생성 시각보다 엄격히 뒤입니다. 존재하지 않는 로컬 시각이나 날짜 전체는 건너뛰고, 중복 구간은 로컬 날짜마다 한 번 더 이른 시점을 선택합니다. 그 더 이른 시점이 지났다면 나중 중복은 자격이 없습니다. 제약되는 것은 UTC 대상 연도 0001~9999뿐이며, UTC 범위 가장자리의 로컬 날짜는 0년이나 10000년에 들어갈 수 있습니다.

저장된 다음 대상은 커밋된 UTC 시점입니다. 호스트 디코더와 재시작은 그 시점을 시간대 규칙에 다시 대조하지 않고 보존하며, 정규 이름이 바뀌어도 유효한 저장 시간대 별칭은 계속 읽을 수 있습니다. 이후 대상은 호스트의 현재 IANA 데이터를 사용합니다. 다음 대상은 전달 결정 이후이면서 선택된 발생의 날짜보다 뒤인 로컬 날짜여야 합니다. 미래의 UTC 대상을 표현할 수 없으면 생성이 `time_out_of_range`로 실패합니다.

## 고정 비율 입력과 따라잡기

`every_seconds`는 최소 60초의 안전한 정수 간격이며 생성 시각에 정렬됩니다. 이것은 경과 시간을 측정할 뿐 일별 벽시계 시간을 측정하지 않으므로, 오프셋이 바뀌면 `every_seconds: 86400`이 `daily`를 대신할 수 없습니다. 프로토콜은 공유 쿨다운이나 기록 간 허용 규칙을 제공하지 않습니다. 아래에서 설명하는 cron 선택자는 고정 비율 간격이 아니라 벽시계 타이밍입니다.

호스트가 기한이 지난 Every, Daily, Weekly, Cron 기록을 안고 시작하면 가장 최근의 도래한 발생만 보냅니다. Every는 전달 결정 이후 현재 간격 앵커에 정렬된 첫 대상으로 진행하고, Daily, Weekly, Cron은 위와 아래의 로컬 날짜 규칙을 따릅니다. 놓친 발생은 누적되지 않습니다. 다음 UTC 대상을 표현할 수 없으면 전달은 그 기록을 최신 영수증과 함께 비활성으로 유지합니다.

일회성 기록은 각각의 후속 호출을 만듭니다. 같은 스캔에서 같은 세션에 도래한 반복 기록은 `renderRecurringReminderBatchFraming`이 렌더링하는 하나의 후속 호출을 공유하며, 기록마다 최신 발생 하나를 담습니다. 1분 최소값은 고정 비율 간격에만 적용되며, 전달은 대상 에이전트가 유휴가 되기를 기다리지 않습니다.

<a id="cron-wall-clock-input"></a>
## Cron 벽시계 입력

`cron`은 상호 배타적인 생성 선택자 중 하나입니다. 그 정확한 객체는 엄격한 다섯 필드 Vixie 식 `minute hour day-of-month month day-of-week`와 명시적 IANA 시간대만 담습니다. 예: `cron: { expression: '*/15 9-17 * * 1-5', time_zone: 'Asia/Shanghai' }`. 필드 범위는 다음과 같습니다:

| 필드 | 허용 범위 | 비고 |
|---|---|---|
| minute | 0-59 | |
| hour | 0-23 | |
| day-of-month | 1-31 | |
| month | 1-12 | |
| day-of-week | 0-7 | `0`과 `7`은 모두 일요일을 뜻합니다. |

모든 필드는 `*`, 단일 값, `a-b` 범위, `n >= 1`인 `*/n` 또는 `a-b/n` 스텝, 그리고 그 형태들의 쉼표 구분 목록을 받습니다. 그 밖의 모든 것은 문제가 된 필드를 지목하는 메시지와 함께 `invalid_rule`로 거부됩니다. `L`, `W`, `#` 연산자, `JAN`/`MON` 이름, `@daily` 형식 매크로, 초 필드가 있는 여섯 필드 식, 범위를 벗어난 값, 뒤집힌 범위, 0 스텝, 빈 필드가 그렇습니다. 이 방언은 다섯 필드이므로 가장 작은 간격은 1분이며, 1분 미만 스케줄링은 계속 지원되지 않습니다.

생성은 저장 전에 식을 정규화합니다. 정규화는 각 필드를 일치하는 값 집합으로 확장하고 그 집합을 결정적으로 다시 인코딩합니다. 반복 값은 합쳐지고, 인접 값과 범위는 병합되며, 균일한 스텝은 `a-b/n`으로, `*`로 시작한 필드라면 스타 스텝(`*`는 모든 값, 그 밖에는 가장 넓은 스타 스텝 순회에 남은 값을 더한 형태)으로 기록되고, `1` 스텝은 생략되며, 일요일은 `0`으로 기록됩니다. `*`로 시작하지 않은 필드는 결코 스타 스텝이 되지 않습니다. 각 필드의 스타 플래그를 보존하는 것이 아래의 day-of-month/day-of-week 규칙을 저장된 식 전체에서 Vixie에 충실하게 유지합니다. 영속 디코더는 정규 형식이 아닌 저장 식을 거부합니다.

첫 대상은 그 시간대의 로컬 날짜와 시각이 일치하는 첫 번째 엄격한 미래 시점입니다. Daily와 Weekly의 로컬 시각 해석을 재사용합니다. 존재하지 않는 로컬 시각은 건너뛰고, 모호한 시각은 그 날짜에 한 번 더 이른 발생을 취합니다. 커밋된 UTC `scheduledAt`은 재시작 시 다시 계산되지 않습니다.

day-of-month과 day-of-week는 Vixie 시맨틱을 따릅니다. 필드의 텍스트가 `*`로 시작하면 일치하는 값과 무관하게 스타이므로 `*/1`과 `*/2`는 스타이고 `1-31`과 `0-7`은 제한됩니다. 둘 중 하나가 스타이면 로컬 날짜는 두 필드가 모두 일치할 때만 일치하고, 둘 다 스타가 아니면 둘 중 하나가 일치하면 일치합니다.

cron 디코딩은 커밋된 시점과 저장된 시간대 표기를 보존하고, 정규 형식이 아닌 저장 식을 거부합니다. cron은 현재 호스트 `ScheduleRecord`에만 속하며, 동결된 과거 세션 디코더는 이를 허용하지 않습니다.

## 과거 세션 변경

버전 1 `schedule/change` 이벤트는 과거 세션 데이터로 계속 디코딩할 수 있습니다. 그 create와 fold 타입은 `LegacyScheduleRecord`를 사용하며, 이는 After, At, Every만 허용합니다. Daily, Weekly, Cron은 현재 호스트 `ScheduleRecord`에만 속합니다. 호스트 기록 디코더는 동결된 과거 디코더와 별개입니다. 제목이 존재하기 전에 작성된 create 기록은 `title`을 담지 않으므로 과거 디코더는 그 없는 멤버를 허용하고, 호스트 디코더는 여전히 이를 요구합니다. 과거 이벤트는 storage domain을 채우거나 전달을 예약하지 않습니다. 이 이벤트에 있는 기존 알림은 `schedule_create`를 통한 명시적 재생성이 필요하며, 암묵적 세션 마이그레이션이나 오래된 `at` 기록의 변환은 일어나지 않습니다.

```ts type-equiv
/**
 * Frozen Session event and fold vocabulary; daily rules belong only to Host storage.
 *
 * A version-1 event written before titles existed persists no `title` member, so
 * `after`, `at`, and `every` decode without one and stay readable. The Host task
 * record requires the member and never persists a record without it.
 */
type LegacyScheduleRecord =
  | LegacyAfterScheduleRecord
  | LegacyAtScheduleRecord
  | LegacyEveryScheduleRecord
```

```ts type-equiv
/** Creates one durable reminder record. */
interface ScheduleCreateChange {
  readonly version: 1
  readonly operation: 'create'
  readonly schedule: LegacyScheduleRecord
}
```

```ts type-equiv
/** Deletes one currently active reminder. */
interface ScheduleDeleteChange {
  readonly version: 1
  readonly operation: 'delete'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records that one active one-shot reminder entered the durable dispatch history. */
interface OneShotScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
}
```

```ts type-equiv
/** Records one fixed-rate decision and advances directly past missed occurrences. */
interface EveryScheduleDispatchChange {
  readonly version: 1
  readonly operation: 'dispatch'
  readonly id: ScheduleId
  /** Wall-clock decision time used to select the latest due occurrence. */
  readonly acceptedAt: string
}
```

```ts type-equiv
/** Durable dispatch shapes supported by the current rule set. */
type ScheduleDispatchChange = OneShotScheduleDispatchChange | EveryScheduleDispatchChange
```

```ts type-equiv
/** Strict version-1 durable Schedule mutation union. */
type ScheduleChange = ScheduleCreateChange | ScheduleDeleteChange | ScheduleDispatchChange
```

과거 디코더와 폴드는 알 수 없는 버전, 추가 필드, 재사용된 id, 유효하지 않은 전이를 거부합니다. 이 이벤트는 [영속성 카탈로그](../persistence-catalog.ko.md#schedulechange--log-only)에 계속 색인되어 있습니다. 세션 기록은 활성 작업의 권위가 아닙니다.

## 활성 뷰와 관리

도구 값은 저장된 기록에 현재 벽시계에서 도출한 타이밍을 결합합니다. 호스트는 전달이 필요할 때 원래 세션을 복원하며, 작업을 나열하고 삭제하는 것은 그 세션을 활성화하지 않습니다.

```ts type-equiv
/** Current delivery timing derived from the durable record and wall clock. */
type ScheduleState = 'scheduled' | 'overdue'
```

```ts type-equiv
/** Host-driven delivery resumes the original Session when needed. */
type ScheduleDeliveryMode = 'host'
```

```ts type-equiv
/** Complete model-facing view of one active reminder. */
type ScheduleView = ScheduleRecord & {
  /** Whether the target remains in the future. */
  readonly state: ScheduleState
  /** Reminder delivery never leaves the owning session. */
  readonly deliveryMode: ScheduleDeliveryMode
}
```

`schedule_create`, `schedule_list`, `schedule_delete`, `schedule_update`의 스키마는 [도구 카탈로그](../tool-catalog.ko.md#deepseek-aidsh-tool-schedule)가 소유하며, [`@deepseek-ai/dsh-tool-schedule`](../../packages/schedule/tool-schedule/README.md)이 이를 마운트하는 각 프리셋에 기여합니다. 호스트 서비스는 저장과 전달을 소유합니다. create, delete, update는 storage domain 쓰기를 승인합니다. 호스트 전역 큐가 이 변경들을 도래한 전달에 대해 직렬화하며, 작업을 삭제해도 이미 대기 중인 메시지는 제거되지 않습니다. 모델 도구는 현재 세션을 다루고, 공유 호스트의 create, list, update, delete 메서드는 명시적 세션 바인딩을 받습니다. `create`와 `update`는 위임 깊이가 0보다 클 때 위임된 자식이 소유한 세션을 `subagent_session`으로 거부하며, 전달도 그런 세션에 닿을 수 없습니다. 네 모델 도구는 도구 계층에서 위임된 호출자를 거부하지만, `list`, `catalog`, `history`, `delete`는 그 세션에 계속 서비스합니다. 생성은 트리밍 후 비어 있지 않고 최대 120자인 `title`을 요구하며, 없거나 비어 있거나 너무 긴 제목은 `invalid_prompt`로 거부되고 생성은 지시문에서 제목을 도출하지 않습니다. create와 list 뷰는 지시문과 함께 저장된 `title`을 담고, `title`이 없거나 유효하지 않은 저장 기록은 디코딩에서 거부됩니다.

```ts type-equiv
/** Reminder creation selector, shared by the model consumer and Host service. */
interface ScheduleCreateRequest {
  /** Non-empty reminder text. */
  prompt: string
  /** Required task name of at most 120 characters, non-empty after trimming; names the card, detail heading, and task lists. */
  title: string
  /** Relative one-shot delay in seconds. */
  after_seconds?: number
  /** Absolute one-shot target. */
  at?: AtInput
  /** Fixed recurrence interval in seconds. */
  every_seconds?: number
  /** Daily wall-clock time in an explicit IANA zone. */
  daily?: DailyInput
  /** Weekly wall-clock time and explicit ISO weekday set in an IANA zone. */
  weekly?: WeeklyInput
  /** Five-field cron expression evaluated in an explicit IANA zone. */
  cron?: CronInput
}
```

```ts type-equiv
/** Session-scoped task list, without Agent activation. */
interface ScheduleListRequest {
  /** Original Session binding. */
  sessionId: SessionId
}
```

```ts type-equiv
/** Delete request identifying a task within its original Session binding. */
interface ScheduleDeleteRequest extends ScheduleListRequest {
  /** Task to remove. */
  id: ScheduleId
}
```

```ts type-equiv
/** Successful `schedule_delete` value, including the non-mutating not-found result. */
type ScheduleDeleteResult =
  | { readonly id: ScheduleId; readonly deleted: true }
  | { readonly id: ScheduleId; readonly deleted: false; readonly code: 'schedule_not_found' }
```

```ts type-equiv
/** Successful Host-wide removal of every ended task, whether or not any remained. */
interface ScheduleDeleteInactiveResult {
  /** Ended task rows this call removed; zero when the Host held none. */
  readonly deleted: number
}
```

## 웹 카탈로그

Remote `schedule.catalog()` 메서드는 활성 및 비활성 호스트 작업을 원래 세션 바인딩과 함께 반환하며, `scheduledAt` 오름차순, 그다음 `id` 사전순으로 정렬합니다. 이 메서드는 세션을 활성화하거나 그 기록을 읽지 않고 Schedule domain만 읽습니다. 브라우저 소비자는 이 브라우저 안전 타입을 받습니다:

```ts type-equiv
/** Durable Session inbox delivery acknowledgment, not model execution completion. */
interface ScheduleDeliveryReceipt {
  /** Canonical UTC target of the delivered occurrence. */
  readonly scheduledAt: string
  /** Canonical UTC time sampled after Session persistence acknowledged delivery. */
  readonly deliveredAt: string
  /** Identity of the delivered message, shared by tasks in one recurring batch. */
  readonly messageId: MessageId
}
```

```ts type-equiv
/** Browser-safe retained reminder with its original Session binding. */
type ScheduleCatalogEntry = ScheduleRecord & {
  /** Session receiving this reminder when it becomes due. */
  readonly sessionId: SessionId
  /** Inactive reminders remain visible but never schedule another delivery. */
  readonly status: 'active' | 'inactive'
  /** Most recent durably acknowledged inbox delivery, when available. */
  readonly lastDelivery?: ScheduleDeliveryReceipt
}
```

Remote `schedule.list({ sessionId })`, 모델 `schedule_list`, 세션 헤더 카탈로그는 활성 작업만 반환합니다. 모델 뷰의 파생 타이밍 `state`는 저장된 수명 주기 `status`와 구별됩니다. 삭제는 항목의 원래 바인딩과 함께 `schedule.delete({ sessionId, id })`를 사용하며, 바인딩이 일치하지 않으면 찾을 수 없음으로 반환합니다. 모델 도구는 현재 에이전트의 세션을 제공하고, 전역 사용자 인터페이스는 선택한 작업의 바인딩을 제공합니다. 바인딩 검사만으로는 호출자 권한이 확립되지 않습니다. `schedule.deleteInactive()`는 세션 전반에서 종료된(비활성) 모든 작업을 각 행이 가진 저장 전달 기록과 함께 제거합니다. 성공하면 제거한 개수와 함께 `{ deleted }`로 응답하고, 정상적인 실패 배치는 아무것도 제거하지 않은 채 거부하며, `unknown-state` 실패는 행을 제거했을 수 있고 호스트 schedule domain을 격리하므로 이후 schedule 작업은 다시 열릴 때까지 거부됩니다. 어떤 거부든 `schedule/changed`를 알리고 클라이언트는 그때 다시 읽습니다. 자동화 작업 페이지의 일괄 정리가 이를 사용합니다. 종료된 작업은 결코 타이머를 무장하지 않으므로 제거가 대상을 다시 계산하지 않습니다. 페이로드가 없는 `schedule/changed` 이벤트는 클라이언트 목록을 무효화하며, 재연결한 클라이언트는 현재 상태를 다시 가져옵니다.

배포되는 웹 구성은 호스트 기능과 함께 `ui-schedule`을 마운트합니다. [클라이언트 패키지](../../packages/client/ui-schedule/README.md)가 카탈로그, 빈 상태, 삭제 컨트롤을 소유합니다. 페이지는 전체, 활성, 비활성 작업을 각각 필터링하고, 상세 탭 스트립에 비활성 상세와 원래 세션 컨트롤을 유지하며, 명시적 확인 삭제를 요구합니다. Rules와 Records 탭은 작업 설정과 지연 페이지로 불러오는 저장 영수증을 분리합니다. 영수증도 비활성 상태도 모델 실행을 확인하지 않습니다.

## 타이밍 편집

`schedule.update({ sessionId, id, expected, change })`는 세션을 활성화하지 않고 활성 작업을 편집합니다. `expected`는 관찰된 완전한 `ScheduleRecord`이며 추가 메타데이터가 붙은 카탈로그 항목이 아닙니다. 호스트는 디스패치와 삭제가 쓰는 같은 FIFO 안에서 이를 현재 기록과 비교합니다. 편집 중에 정상 전달이 대상을 진행시킬 수 있으며, 그 낡은 스냅샷은 현재 규칙을 덮어쓰는 대신 `schedule_conflict`를 반환합니다. 바인딩이 없거나 일치하지 않으면 `schedule_not_found`를, 비활성 작업이면 `schedule_ended`를 반환합니다.

```ts type-equiv
/** Timing-only edit; it may select a different recurrence kind than the stored record, and one-shot targets use an absolute `at`. */
type ScheduleTimingChange =
  | { readonly kind: 'at'; readonly at: AtInput }
  | { readonly kind: 'every'; readonly every_seconds: number }
  | { readonly kind: 'daily'; readonly daily: DailyInput }
  | { readonly kind: 'weekly'; readonly weekly: WeeklyInput }
  | { readonly kind: 'cron'; readonly cron: CronInput }
```

```ts type-equiv
/** Compare-and-update request within the original Session binding. */
interface ScheduleUpdateRequest extends ScheduleDeleteRequest, ScheduleUpdateContent {
  /** Complete record observed when editing began, including the committed target. */
  readonly expected: ScheduleRecord
  /** New timing; its kind may differ from the stored record's kind, and an omitted value keeps the committed target. */
  readonly change?: ScheduleTimingChange
}
```

```ts type-equiv
/** Successful current record, non-mutating lookup/conflict failure, or invalid name/instruction/timing. */
type ScheduleUpdateResult =
  | { readonly id: ScheduleId; readonly updated: boolean; readonly record: ScheduleRecord }
  | ScheduleUpdateMiss
  | ScheduleToolError
```

변경된 Daily 규칙은 저장된 로컬 시각과 시간대 시맨틱으로 첫 번째 엄격한 미래 대상을 계산합니다. 변경된 Cron 규칙은 식을 정규화하고 같은 로컬 날짜·공백·이른 중복 규칙 아래 첫 번째 엄격한 미래 대상을 계산합니다. 변경된 Every 간격은 승인된 저장 시각에 그 간격을 더한 지점에서 새 앵커를 시작합니다. After나 At 작업은 같은 id를 가진 At 기록으로 다른 절대 대상을 받을 수 있습니다. 이 연산들은 저장된 `title`, 프롬프트, 원래 세션 바인딩, 수명 주기 상태, 모든 저장 영수증을 보존합니다. 변경은 다른 반복 종류를 선택할 수도 있으며, 그러면 같은 id, 제목, 프롬프트, 세션 바인딩, 상태, 저장 영수증으로 새 규칙에서 대상을 다시 계산합니다. 동등하게 정규화된 규칙은 변경되지 않은 기록과 함께 `updated: false`를 반환하며, 저장소를 다시 쓰거나 대상을 초기화하거나 변경 이벤트를 내보내지 않습니다. 표기만 다르고 동등한 Cron 식도 그런 무변경이며, 비교가 정규 식과 정규 시간대를 사용하기 때문입니다.

입력 검증은 기존 타이밍 오류를 사용합니다. 변경된 절대 대상은 FIFO 슬롯이 실행될 때에도 미래여야 합니다. 성공한 작업 put은 변경 알림과 타이머 재계산보다 앞섭니다. 저장소와 수명 주기 실패는 거부되며, 취소는 큐와 초기화 대기 뒤에 확인되지만 진행 중인 쓰기를 되돌릴 수는 없습니다. 일회성 기록은 편집 형태의 IANA 시간대가 아니라 UTC 시점을 유지합니다. 타이밍 편집은 과거 세션 이벤트를 덧붙이지 않습니다. 모델은 `schedule_update`를 통해 같은 제자리 갱신에 도달하며, 이는 작업을 삭제하고 다시 만드는 대신 읽은 기록을 저장된 기록과 비교합니다.

## 저장된 전달 기록

`schedule.history({ sessionId, id, limit })`는 세션을 활성화하지 않고 저장된 영수증을 읽습니다. 명시적 limit은 1~100의 안전한 정수입니다. 페이지는 벽시계 정렬이 아니라 추가 역순을 따르며, 선택적 메시지 id 커서는 앞 페이지의 가장 오래된 기록을 제외합니다. 새로 도착한 항목은 그 커서를 밀지 않습니다. 작업이 없거나 세션 바인딩이 틀리면 `schedule_not_found`를, 알 수 없는 커서면 빈 성공 페이지가 아니라 `delivery_cursor_not_found`를 반환합니다.

```ts type-equiv
/** Saved inbox delivery with its immutable sent prompt when recorded by this Host. */
interface ScheduleDeliveryRecord extends ScheduleDeliveryReceipt {
  /** Prompt sent for this occurrence; unavailable for legacy receipts. */
  readonly prompt?: string
}
```

```ts type-equiv
/** Explicitly bounded saved-delivery query within one Session binding. */
interface ScheduleDeliveryHistoryRequest extends ScheduleDeleteRequest {
  /** Required safe-integer page size from 1 through 100. */
  limit: number
  /** Message identity of the oldest entry in the previous page; excluded from this page. */
  before?: MessageId
}
```

```ts type-equiv
/** Configured limits applied when appending one task's delivery receipt. */
interface DeliveryRetentionBounds {
  /** Retained window in days, measured back from the acknowledgment being appended. */
  readonly days: number
  /** Maximum retained records per task; the newest survive. */
  readonly records: number
}
```

```ts type-equiv
/** Newest-first saved deliveries, or a non-mutating task/cursor lookup failure. */
type ScheduleDeliveryHistoryResult =
  | {
    readonly id: ScheduleId
    readonly records: ScheduleDeliveryRecord[]
    /** Whether earlier delivery records may be unavailable; missing receipts are never reconstructed. */
    readonly earlierRecordsUnavailable: boolean
    /** True only after an append removed saved records; absent legacy evidence is false. */
    readonly earlierRecordsPruned: boolean
    /** Current Host retention configuration, also used by the delivery writer. */
    readonly retention: DeliveryRetentionBounds
    /** Oldest returned message identity, present only when older saved records remain. */
    readonly nextBefore?: MessageId
  }
  | { readonly id: ScheduleId; readonly code: 'schedule_not_found' | 'delivery_cursor_not_found' }
```

새 작업은 빈 기록으로 초기화됩니다. 기록이 없는 오래된 작업 행은 기존 최신 영수증만 노출하고 이전 기록을 사용할 수 없음으로 표시하며, 읽기로 다시 쓰이지 않습니다. 이후 승인은 그 영수증을 보존하고 지시문 스냅샷이 담긴 실제 새 영수증을 덧붙입니다. 잃어버린 기록과 없는 레거시 지시문 스냅샷은 결코 재구성되지 않습니다. 같은 작업 행 쓰기가 기록, 최신 영수증, 상태, 다음 대상을 커밋합니다. 명시적 작업 삭제는 향후 전달을 멈추고, 작업 행을 저장 영수증과 함께 제거하며, `list`와 `catalog`에서 빼냅니다. 대화 메시지는 영향을 받지 않습니다. 저장 전달 기록은 추가 시 설정된 `deliveryHistoryDays` 창(각 영수증의 `deliveredAt`에서 거슬러 측정)과 `deliveryHistoryRecords` 상한으로 정리되며, 추가된 최신 영수증은 항상 살아남고, 정리된 창은 이전 기록을 사용할 수 없음으로 표시합니다. 페이지네이션은 저장 크기나 지시문 바이트가 아니라 반환되는 기록 수를 제한합니다.

## 호스트 전달

호스트는 시작 시 영속된 작업을 읽고 타이머를 가장 이른 활성 대상에 설정합니다. 비활성 작업은 조회할 수 있지만 결코 다른 전달을 예약하지 않습니다. 전달 시에는 `schedule/resolve-agent`를 통해 콜드 세션을 포함한 원래 세션을 해석합니다. 활성화는 임베딩이 소유합니다. SDK 핸들러는 초기화를 기다리고 세션 핸들과 모델 옵션을 보유하며, 핸들러가 없으면 웹 세션 컨트롤러가 세션을 복원합니다. 조합은 Schedule을 시작하기 전에 자신의 활성화 제공자를 기다립니다. 복원 후에는 벽시계를 다시 샘플링하고 롤백 이후 더는 도래하지 않는 멤버를 제외하며, 그 작업들은 타이머 의무를 유지합니다. Goal도 별도의 Run 완료 기록도 디스패치에 참여하지 않습니다.

플러그인에서 온 `followup()`은 메시지를 세션 인박스에 동기적으로 덧붙입니다. 세션 플러시가 성공하면 작업 기록 put 하나가 지시문 스냅샷과 함께 저장 전달을 덧붙이고, 최신 `ScheduleDeliveryReceipt`를 일회성의 `inactive` 상태 또는 반복 작업의 다음 대상 및 상태와 함께 저장합니다. 같은 배치의 반복 작업은 영수증의 `messageId`를 공유하며, 각 영수증은 그 작업의 전달된 발생 시각을 유지합니다. 전달은 현재 턴을 조종하거나 취소하지 않으며 모델 완료를 기다리지 않습니다.

세션 해석, 메시지 큐잉, 영속성 확인 중 실패하면 작업은 저장된 채로 남고 호스트 경고가 보고됩니다. 이후 관리 변경이나 호스트 재시작이 이를 재시도합니다. 세션 영속성과 작업 put은 저장소에 걸쳐 원자적이지 않습니다. 인박스 영속 후 작업 put 전에 충돌하면 전달이 반복될 수 있으며, 영수증이 이 간극을 닫지 않습니다. Schedule은 모델 결과 승인, 실행 취소, 외부 알림 채널을 제공하지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxschedule--scheduleservice"></a>

### `ctx.schedule` — `ScheduleService`

Shared management service; reads, deletion, and timing edits never activate a Session.

`sessionPersistence` is a load-order requirement rather than a directly called service: a delivery commits only when `ctx.sessions.flush()` reports that a `session/flush` listener participated, and the persistence backend providing this service is the plugin that registers that listener.

```ts cordis-catalog
/**
 * Create a reminder bound to the caller-selected Session without activating it.
 *
 * The request must supply a title; a missing, blank-after-trim, or over-long
 * title rejects with `invalid_prompt` instead of deriving one from the prompt.
 * A Session a delegated child owns rejects with `subagent_session`, because delivery
 * can never reach it: the child is one whose delegation depth is above zero.
 * The record is built from the clock reading taken before the request joins the
 * serialized queue, so a create that waits behind a longer operation keeps its
 * request-time anchor and may already be due when the queue reaches it.
 * @param sessionId - Original Session receiving the reminder.
 * @param request - Validated tool selector, required title, and reminder content.
 * @param signal - Optional cancellation checked before persistence begins, including after FIFO waits.
 * @returns The durably stored schedule. Cancellation does not roll back an in-flight write.
 */
async create(sessionId: SessionId, request: ScheduleCreateRequest, signal?: AbortSignal): Promise<ScheduleRecord>

/**
 * Read the selected Session's active tasks without resuming its Agent.
 * @param request - Session whose task list is requested.
 * @returns Persisted reminders in storage order.
 */
@Remote('list') async list(request: ScheduleListRequest): Promise<ScheduleRecord[]>

/**
 * Read all active and inactive Host reminders with their original Session bindings.
 * A deleted reminder has no row, so it is absent here.
 * Does not activate Sessions or read Session history.
 * @returns Reminders ordered by scheduledAt ascending, then lexicographically by id.
 */
@Remote('catalog') async catalog(): Promise<ScheduleCatalogEntry[]>

/**
 * Read saved inbox deliveries without activating or reading the original Session.
 * The task's own row supplies its binding, so its records stay readable through this lookup.
 * @param request - Session binding, task identity, explicit limit, and optional exclusive message cursor.
 * @returns Newest-first deliveries in append order, or a task/cursor lookup failure.
 * @throws ScheduleInputError when limit is not a safe integer from 1 through 100.
 */
@Remote('history') async history(request: ScheduleDeliveryHistoryRequest): Promise<ScheduleDeliveryHistoryResult>

/**
 * Delete one task belonging to the selected Session, leaving queued messages intact.
 *
 * The row is removed: the task no longer schedules, leaves `list` and `catalog`, and its
 * saved delivery records go with it. A task bound to a Session a delegated child owns
 * stays deletable even though creation and timing edits refuse that binding, so a task
 * stored before that rule existed remains removable.
 * @param request - Session and exact task identity.
 * @param signal - Optional cancellation checked before persistence begins, including after FIFO waits.
 * @returns Whether that Session owned a deleted task. Cancellation does not roll back an in-flight write.
 */
@Remote('delete') async delete(request: ScheduleDeleteRequest, signal?: AbortSignal): Promise<ScheduleDeleteResult>

/**
 * Delete every ended Host task, leaving active tasks armed.
 *
 * Ended tasks never schedule another delivery, so the removal changes no pending
 * target and no timer is recomputed. Rows are enumerated and removed in one FIFO
 * slot, so a delivery ordered behind this call ends its task after the
 * enumeration rather than during it. The batch is one domain write: a normal
 * failure rejects with every listed row still stored, while a backend
 * `unknown-state` failure may have removed rows and quarantines the Host
 * domain, so later schedule operations reject until the domain is reopened.
 * Every rejection announces `schedule/changed` because it does not establish
 * which rows landed, and clients then re-read the catalog.
 * @returns Count of removed rows; zero when the Host held no ended task.
 */
@Remote('deleteInactive') async deleteInactive(): Promise<ScheduleDeleteInactiveResult>

/**
 * Update the name, instruction, and timing of an active task within the original Session
 * binding without activating the Session or changing saved deliveries.
 *
 * Each supplied field replaces its stored value; an omitted field keeps it. A name or
 * instruction change alone does not reset the committed target. A Session a delegated
 * child owns returns the non-mutating `subagent_session` result, so an edit cannot
 * re-arm a task bound to a Session delivery can never reach, and the Web editor can
 * explain the refusal through the ordinary result it already renders.
 * @param request - Task binding, complete observed record, and any combination of timing, name, and instruction.
 * @param signal - Cancellation checked after domain readiness and FIFO waits, before persistence begins.
 * @returns The committed record, unchanged record for a no-op, or a non-mutating input/lookup/conflict/refusal result.
 * Storage and lifecycle failures reject; cancellation after a write starts does not roll it back.
 */
@Remote('update') async update(request: ScheduleUpdateRequest, signal?: AbortSignal): Promise<ScheduleUpdateResult>
```

Types: [SessionId](core.ko.md)

Source: [`packages/schedule/schedule/src/index.ts`](../../packages/schedule/schedule/src/index.ts)

<a id="schedule-events"></a>

### `schedule/*` events

<a id="schedulechanged--emit"></a>

#### `schedule/changed` — emit

Durable task set changed; clients refetch global task and Session-active catalogs.

```ts cordis-catalog
/** Durable task set changed; clients refetch global task and Session-active catalogs.
 * @mode emit
 */
'schedule/changed'(): void
```

Source: [`packages/schedule/schedule/src/types.ts`](../../packages/schedule/schedule/src/types.ts)

<a id="scheduleresolve-agent--waterfall"></a>

#### `schedule/resolve-agent` — waterfall

Restore a reminder's Session through its embedding's owning controller. Call next() to use the Web Session controller.

```ts cordis-catalog
/**
 * Restore a reminder's Session through its embedding's owning controller.
 * Call next() to use the Web Session controller.
 * @param sessionId - Original Session receiving the reminder.
 * @mode waterfall
 */
'schedule/resolve-agent'(sessionId: SessionId, next: () => Promise<Agent>): Promise<Agent>
```

Types: [Agent](core.ko.md) · [SessionId](core.ko.md)

Source: [`packages/schedule/schedule/src/index.ts`](../../packages/schedule/schedule/src/index.ts)
<!-- END GENERATED cordis-surface -->
