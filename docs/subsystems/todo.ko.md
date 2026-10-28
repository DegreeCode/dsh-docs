# 할 일

[English](todo.md) | [中文](todo.zh.md) | 한국어

[`@deepseek-ai/dsh-tool-todo`](../../packages/todo/tool-todo/README.md)가 소유하는 영속 할 일 어휘입니다. 모델 대상 도구가 한 에이전트 세션의 목록 전체를 대체하며, 이 패키지는 이벤트 선언과 재생 프로젝션도 소유합니다. 도구 동작과 구성은 [패키지 README](../../packages/todo/tool-todo/README.md)에 있습니다.

출처: [`packages/todo/tool-todo/src/types.ts`](../../packages/todo/tool-todo/src/types.ts)

## `TodoItem` — 목록 항목 하나

```ts type-equiv
/**
 * One entry in an agent's todo list — the unit of the `todo/write`
 * whole-list snapshot declared by this package.
 *
 * Deliberately minimal: a human-readable `content` line and a three-state
 * `status`. No id, priority, or `activeForm` — the list is replaced wholesale
 * on every write (last-write-wins), so entries need no stable identity. The
 * three statuses describe the complete portable lifecycle needed by model and
 * UI consumers.
 */
interface TodoItem {
  /** What this task is — a short imperative line shown in the UI. */
  content: string
  /** Lifecycle state. `in_progress` marks a task being worked now; parallel work may mark several. */
  status: 'pending' | 'in_progress' | 'completed'
}
```

## 영속 이벤트

이 패키지는 `todo/write: { todos: TodoItem[] }`를 `SessionEventMap`에 선언 병합합니다. 이벤트는 로그 전용이며 완전한 대체 목록을 담고, 생성된 [영속성 카탈로그](../persistence-catalog.ko.md#todowrite--log-only)가 그 선언 지점을 기록합니다.
