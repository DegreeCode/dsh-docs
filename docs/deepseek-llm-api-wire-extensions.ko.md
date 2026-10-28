# 공식 DeepSeek LLM API 와이어 확장

[English](deepseek-llm-api-wire-extensions.md) | [中文](deepseek-llm-api-wire-extensions.zh.md) | 한국어

이 참조는 [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.md)가 `deepseek-official` Messages 요청에 보내는 모든 DeepSeek Harness 전용 HTTP 헤더와 추가 JSON 필드를 정의합니다. 업스트림 DeepSeek API가 소유한 필드는 다시 정의하지 않습니다. 제공자 중립 LLM 인터페이스와 `llm-pi-ai`는 이러한 추가를 구현하지 않습니다.

어댑터는 해석된 `baseURL`로 추가를 보내며, 구성된 게이트웨이도 포함합니다. 이들은 `messages`, 시스템 프롬프트, 도구 스키마 밖에 있으므로 모델 입력 토큰을 늘리거나 모델 가시 접두사를 바꾸지 않습니다.

## 와이어 네임스페이스와 버전 지정

| 위치 | 명명 | 예 |
|---|---|---|
| HTTP 필드 이름 | 소문자 케밥 케이스. HTTP 매칭은 대소문자를 구분하지 않음 | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek 요청 본문 확장 필드 | 예약된 `dsh_` 접두사를 붙인 스네이크 케이스 | `dsh_plugin_packages`, `dsh_session_log` |
| DSH 소유 중첩 JSON 멤버 | 카멜 케이스 | `afterSeq`, `throughSeq`, `sessionId` |
| 태그된 값 | 케밥 케이스 문자열. 영속 이벤트는 `domain/action` 사용 | `session-log-deepseek/delivery-accepted` |

각 본문 확장은 자체 `version`을 독립적으로 소유합니다. 버전은 이를 담은 객체에만 적용되며, 서로 다른 필드의 버전 사이에는 호환성이나 순서 관계가 없습니다. JSON 멤버 순서는 프로토콜의 일부가 아닙니다.

[`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.md)는 최상위 확장 이름마다 제공자 하나를 예약합니다. 비어 있거나 공백으로 채워진 이름, 중복 등록, 기본 DeepSeek 요청과의 충돌은 HTTP 디스패치 전에 실패합니다.

## 요청 헤더

| 헤더 | 존재 조건 | 값 |
|---|---|---|
| `user-agent` | Files API 작업을 포함한 모든 제공자 HTTP 요청 | `product/version (+url)` 형식의 애플리케이션 아이덴티티. 기본 제품은 `deepseek-harness` |
| `x-deepseek-harness-user-id` | 모든 승인된 모델 요청 | 해석된 Harness 홈의 안정적인 익명 UUID |
| `x-deepseek-harness-session-id` | Session id를 담은 모델 요청 | 정확한 요청 `sessionId` 문자열 |
| `x-deepseek-harness-compact` | 목적이 `compaction`인 모델 요청 | 리터럴 문자열 `1` |

자격 증명 실패는 익명 사용자 id 해석 전에 발생하므로, 승인되지 않은 요청은 이 헤더들을 보내지 않고 아이덴티티 파일도 만들지 않습니다. Session 없는 직접 요청은 `x-deepseek-harness-session-id`를 생략합니다. Session 제목 요청에는 추가 목적 헤더가 없으며, `sessionId`를 담은 경우 일반 Session id 규칙이 그대로 적용됩니다.

## 본문 확장 트랜잭션

어댑터는 등록된 제공자에게 필드 준비를 요청하기 전에 정확한 `messages`를 포함한 완전한 기본 본문을 직렬화합니다. 제공자는 그 불변 본문, 요청 취소 신호, 선택적 `sessionId`와 보조 호출 `purpose`를 받습니다. `undefined`를 반환하면 그 제공자의 필드가 해당 요청에서 생략됩니다.

준비된 JSON 값은 제공자 소유 상태에서 분리되어 기본 필드의 최상위 형제로 병합되고 같은 HTTP 본문에서 직렬화됩니다. 준비에 실패한 기여자는 그 요청에서 생략되고 첫 실패만 기록되며 나머지 필드는 계속 전송됩니다. 기본 필드와 충돌하는 필드는 요청을 막습니다. 병합된 본문의 직렬화가 실패하면 어댑터는 확장 필드 없이 기본 본문을 보내고, 승인 트랜잭션을 건너뛰어 기여자가 이후 요청에서 상태를 다시 보내게 하며, 생략된 필드 이름을 기록합니다. 레지스트리가 없는 구성은 확장되지 않은 기본 본문을 보냅니다.

구성된 엔드포인트가 HTTP 2xx를 반환하면 어댑터는 SSE 응답 본문을 읽기 전에 준비된 `accept()` 트랜잭션을 실행합니다. 전송 실패와 2xx가 아닌 응답은 어떤 기여도 승인하지 않습니다. 승인 실패는 기록되며 모델 요청을 실패시키지 않고, 기여자는 승인되지 않은 상태를 이후 요청에서 다시 보냅니다. 승인은 엔드포인트 수준의 HTTP 성공을 기록할 뿐, SSE 스트림 완료나 엔드포인트의 확장 영속을 단정하지 않습니다.

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.md)가 Loader 기반 활성 플러그인 패키지 인벤토리 전체를 기여합니다. 이 필드는 기본으로 활성화됩니다.

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| 멤버 | 타입 | 의미 |
|---|---|---|
| `version` | `1` | `dsh_plugin_packages`의 스키마 버전 |
| `packages` | 배열 | 이 요청의 완전한 활성 집합 |
| `packages[].name` | 문자열 | 소유 매니페스트의 정확한 비어 있지 않은 npm 패키지 이름 |
| `packages[].version` | 선택적 문자열 | 같은 매니페스트의 정확한 공백 없는 패키지 버전. 사용할 수 없으면 생략 |

모든 요청은 호스트 트리에서 활성 비그룹 Loader 항목을, 요청 Session에 대해 사용 가능하면 그 상시 에이전트 프리셋 트리도 다시 읽습니다. 상대 및 절대 모듈은 가장 가까운 소유 매니페스트를 사용하고, 베어 패키지 항목은 이를 활성화한 Loader 해석 기준을 따릅니다. 공백 없는 문자열 버전이 없는 이름 있는 매니페스트는 `private` 여부와 무관하게 `{ name }`을 기여합니다. 이름 누락과 읽을 수 없는 매니페스트는 영향을 받는 항목만 생략하며, 패키지 메타데이터는 요청을 막지 않습니다.

송신자는 정확한 `(name, optional version)` 쌍을 중복 제거하고 `name`으로 먼저, 그다음 `version`으로 정렬하며, 로케일 독립 텍스트 비교를 사용하고 버전이 없는 항목을 먼저 둡니다. 한 패키지의 동시 활성 버전들은 이름만 있는 항목을 포함해 별도 항목으로 남습니다. 수신자는 버전 부재를 받아들여야 하고, 패키지 이름으로 배열을 합치거나 배열 순서에서 패키지 활성화를 추론해서는 안 됩니다.

비활성, 대기, 실패, 언로드 중, dispose된, 구조적 Loader 항목은 포함되지 않습니다. 일반 의존성, 이름 있는 소유 패키지가 없는 느슨한 모듈, 프로그래밍 방식으로 마운트된 자식 fiber, 인메모리 동적 플러그인도 권위 있는 Loader 기반 패키지 아이덴티티가 없으므로 포함되지 않습니다.

활성화된 인벤토리에 해당 항목이 없으면 `packages: []`를 보내고, 기여자를 비활성화하면 `dsh_plugin_packages` 필드 전체가 생략됩니다. 패키지 아이덴티티는 제공자 메타데이터이며 모델 입력에 절대 들어가지 않습니다.

## `dsh_session_log`

[`@deepseek-ai/dsh-session-log-deepseek`](../packages/session/session-log-deepseek/README.md)가 정규 Session 로그의 연속 접미사 하나를 기여합니다. 이 필드는 기본으로 활성화됩니다. 라이브 Session과 이벤트가 하나 이상 있는 요청에 적용되며, 직접 요청, 오래된 Session id, 빈 로그는 필드를 생략하고, 첫 대기 이벤트 하나만으로 `maxBytes`를 넘거나 직렬화할 수 없는 요청도 마찬가지입니다. 구성에서 `enabled: false`로 비활성화할 수도 있습니다. 아래 예시는 와이어 필드를 설명하려고 논리 Session 형식 2만 사용하며, [현재 기록기 형식](session-format-status.ko.md)을 나타내지 않습니다.

```json
{
  "dsh_session_log": {
    "version": 1,
    "sessionFormatVersion": 2,
    "session": {
      "version": 2,
      "id": "session-id",
      "createdAt": 1780000000000
    },
    "afterSeq": -1,
    "throughSeq": 0,
    "events": [
      {
        "type": "turn/start",
        "seq": 0,
        "time": 1780000000001,
        "data": {
          "turn": 1
        }
      }
    ]
  }
}
```

| 멤버 | 타입 | 의미 |
|---|---|---|
| `version` | `1` | `dsh_session_log`의 스키마 버전 |
| `sessionFormatVersion` | 음이 아닌 정수 | 이 접미사가 나타내는 Session 형식 세대 |
| `session` | 객체 | 현재 Session 헤더의 불변 와이어 프로젝션 |
| `afterSeq` | 정수 | 이 요청 전에 승인된 것으로 기록된 최대 시퀀스 또는 `-1` |
| `throughSeq` | 음이 아닌 정수 | 이 요청이 나타내는 최대 시퀀스 |
| `events` | 배열 | `afterSeq + 1`부터 `throughSeq`까지의 연속 이벤트 |

첫 업로드는 `afterSeq: -1`을 사용하고, 이후 업로드는 같은 Session id의 최대 승인 워터마크 다음에서 시작합니다. 각 업로드는 그 지점부터 직렬화된 필드가 `maxBytes`(기본 8 MiB이며 헤더와 숫자 필드를 포함한 UTF-8 바이트로 계산)에 맞는 가장 긴 연속 구간을 담으므로, 한도를 넘는 백로그는 승인된 여러 요청에 걸칩니다. 송신자는 요청마다 이벤트 배열을 한 번 스냅샷하며, 그 스냅샷 이후의 추가는 이후 요청에 속합니다.

### 와이어 Session 헤더

`session` 멤버는 논리 Session 메타데이터를 원시 JSON 프리미티브로 프로젝션합니다. 시드된 Session은 정확한 `Session.inheritedEventCount`를 `seedLength`로 보내고, 시드되지 않은 Session은 그 필드를 생략합니다. 논리 `isSeeded` 플래그는 이 와이어에 나타나지 않습니다. 바깥 `dsh_session_log.version`이 이 확장 스키마를 선택하고, `session.version`이 논리 Session 형식을 선택합니다. Session 헤더 프로젝션을 바꾸면 내장된 논리 형식도 함께 바뀌는 경우에도 확장 스키마 올림이 필요합니다.

| 멤버 | 존재 | 의미 |
|---|---|---|
| `version` | 필수 | `Session.header`의 논리 Session 형식 버전. [형식 상태](session-format-status.ko.md) 참고 |
| `id` | 필수 | 정확한 Session id |
| `createdAt` | 필수 | 음이 아닌 안전한 정수 Unix 에포크 밀리초 |
| `cwd` | 선택 | Session 생성 시 기록된 절대 작업 디렉터리 |
| `parentSession` | 선택 | 포크의 부모 Session id |
| `seedLength` | 시드된 Session만 | 정확한 상속 이벤트 수. 상속 접두사가 비어 있으면 0 포함 |
| `origin` | 선택 | 서브에이전트 자식의 리터럴 `subagent` |
| `delegationDepth` | 선택 | 음이 아닌 영속 서브에이전트 위임 깊이 |
| `agentPreset` | 선택 | 이 Session을 구성하는 데 사용한 에이전트 프리셋 id |

### 정규 이벤트 봉투

각 `events` 항목은 다른 모든 요청 필드와 독립적으로 정규 이벤트를 원시 JSON 프리미티브로 담습니다. 모든 이벤트는 `type`, 숫자 `seq`, `time`, `data`를 포함하며, `ignorable: true`가 있으면 보존합니다. 표면 이벤트는 `surfaceOp`를 요구하고, 교체 범위는 숫자 `startSeq`와 `endSeq`를 사용하며, 시스템·사용자·도구 이벤트는 숫자 `sourceEventSeqs`도 담을 수 있습니다. 어시스턴트 제공자 메타데이터는 내장 스트림에 남습니다. 알려진 로그 전용 이벤트는 표면 메타데이터를 생략하고, 복원된 알 수 없는 무시 가능 기록은 불투명 메타데이터를 표면 작업으로 취급하지 않고 보존합니다.

### 승인 워터마크와 최소 한 번 전달

엔드포인트가 HTTP 2xx를 반환하면 기여는 이 정규 이벤트를 같은 Session에 추가합니다:

```json
{
  "type": "session-log-deepseek/delivery-accepted",
  "seq": 8,
  "time": 1780000000002,
  "data": {
    "sessionId": "session-id",
    "sessionFormatVersion": 2,
    "throughSeq": 7
  }
}
```

`delivery-accepted`는 구성된 엔드포인트가 이를 담은 LLM 요청에 HTTP 2xx를 반환했음을 뜻합니다. SSE 완료나 원격 영속을 단정하지 않습니다. 이벤트의 `throughSeq`는 이전 이벤트를 식별해야 하고, `sessionId`는 접미사가 전송된 Session을 식별하며, `sessionFormatVersion`은 워터마크를 그 정확한 논리 세대에 결합합니다. 부재는 과거 형식 v0을 뜻합니다.

송신자는 현재 Session id와 형식 세대에 대해 일치하는 최대 `throughSeq`를 폴드하므로, 동시에 승인된 요청이 커서를 뒤로 옮길 수 없고 다른 세대의 워터마크가 현재 접미사를 승인할 수 없습니다. 재개된 프로세스는 영속 로그에서 커서를 다시 만듭니다. 포크는 다른 Session을 가리키는 상속 워터마크를 무시하므로, 자식 id로 진행하기 전에 자신의 상속 접두사를 시퀀스 0부터 `maxBytes`로 제한된 요청들로 업로드합니다. 워터마크 이벤트 자체는 다음 미전송 접미사에 속합니다.

전송 실패, 2xx가 아닌 응답, 직렬화 실패 후 확장 필드 없이 보낸 요청은 워터마크를 추가하지 않습니다. 엔드포인트 승인 후 로컬 영속 전에 크래시가 나면 이미 승인된 범위를 다시 보낼 수 있으며, 불확실성은 시퀀스 구멍이 아니라 중복을 만듭니다. 별도의 업로드 저장소나 절단 경로는 없으며, `maxBytes`가 각 요청의 필드 크기를 제한합니다.

## 노출과 수신자 요구 사항

요청 헤더는 Harness 애플리케이션 버전, Harness 홈 하나의 익명 아이덴티티, 선택적 Session 아이덴티티를 노출합니다. `dsh_plugin_packages`는 활성 npm 패키지 이름과 버전을 노출합니다. 구성이 비활성화하지 않는 한 `dsh_session_log`는 Session 작업 디렉터리, 시스템 프롬프트 스냅샷, 사용자와 어시스턴트 콘텐츠, 내장 어시스턴트 스트림, 실패한 시도 출력, 도구 인수와 결과, 압축 요약, 피드백, 플러그인 소유 이벤트를 노출할 수 있습니다. 어댑터 API 키는 Session 이벤트가 아니므로 이 필드에 들어가지 않습니다. `baseURL`로 선택한 게이트웨이는 공식 엔드포인트와 같은 값을 받습니다.

수신자는 확장 필드를 이름으로 다루고, 각 필드를 자체 `version`으로 디스패치하며, 서로 다른 패키지 버전을 보존하고, JSON 멤버 순서를 무시합니다. 세션 로그 수신자는 이벤트 타입을 해석하기 전에 연속 시퀀스 범위를 검증합니다. `ignorable: true`가 없는 인식되지 않는 정규 이벤트는 무손실 재구성을 막습니다. 기본 요청은 레지스트리나 특정 기여 없이도 사용 가능하게 남으며, 필드 부재는 그 기여가 해당 요청에 적용되지 않았음을 뜻합니다. 세션 로그 백로그가 배출되는 동안 `throughSeq`는 Session의 최신 이벤트보다 뒤처지므로, 2xx가 수신자가 현재 로그를 보유함을 보여 주지는 않습니다.
