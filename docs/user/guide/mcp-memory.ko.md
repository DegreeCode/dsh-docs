# 서드파티 메모리 MCP 서버 연결

[English](mcp-memory.md) | [中文](mcp-memory.zh.md) | 한국어

다음 세 가지 **기본 비활성 참조 구성**은 메모리 시스템 하나를 [`@deepseek-ai/dsh-mcp-client`](../../../packages/mcp/mcp-client/README.md)를 통해 DSH에 연결합니다. 하나를 고르거나, 다른 서버에 같은 범용 MCP 행을 복사해 사용하세요.

이 서드파티 구성은 상호 운용성 예시로만 제공됩니다. 이 구성이 포함되었다고 해서 DeepSeek의 보증, 추천, 파트너십 또는 지속적인 지원을 의미하지는 않습니다.

## DSH가 하는 일

DSH는 선택한 Cordis 오버레이를 해석하고, 구성된 stdio 명령을 시작하거나 구성된 Streamable HTTP URL에 연결하며, MCP 도구를 검색해 `mcp__<serverName>__<tool>` 형식으로 노출합니다. DSH는 서버를 내려받거나, 데이터베이스를 초기화하거나, 모델이나 임베딩 제공자를 선택하거나, 클라우드 계정을 만들거나, 벤더 데이터를 마이그레이션하거나, 별도의 HTTP 서비스를 감독하지 **않습니다**. stdio의 경우 범용 클라이언트가 DSH 플러그인 수명 주기에 맞춰 자식 프로세스를 시작하고 중지하며, HTTP의 경우 업스트림 서비스가 이미 실행 중이어야 합니다.

stdio 브리지는 자식 프로세스를 시작하기 전에 이름이 보통 자격 증명을 나타내는 주변 환경 변수와 모든 `DSH_*` 변수를 의도적으로 제거하며, 그 밖의 주변 변수는 그대로 상속됩니다. 각 예시는 자신에게 필요한 최소한의 기준 재정의만 추가합니다. 선택적 업스트림 기능에 또 다른 시크릿이 필요하면 시크릿을 YAML에 직접 넣지 말고 그 행의 `config.env`에 변수를 추가하세요.

## 하나 선택하기

| 시스템 | 테스트한 고정 버전 | 전송 방식 | 업스트림 사전 요구 사항 |
|---|---:|---|---|
| [Memorix](https://github.com/AVIDS2/memorix) | `memorix@1.3.0` (`500792cad3144142293bfbb20acb4841c9f7fcfa`) | stdio | Node 22.18+ 및 `npm install --global memorix@1.3.0` |
| [MCP Reference Memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | `@modelcontextprotocol/server-memory@2026.7.4` (`6dd0a683e198783e30feabf7abaf42f925bd18b1`) | stdio | `npm install --global @modelcontextprotocol/server-memory@2026.7.4` |
| [Engram](https://github.com/Gentleman-Programming/engram) | `v1.20.0` (`ba9e46ced152c37a7cb9e576153c41995873e2fc`) | stdio | Go 1.25.10+ 및 `go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0`, 또는 일치하는 릴리스 바이너리 |

## 하나 활성화하기

DSH에 오버레이 하나를 전달합니다:

```sh
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

파일 이름을 `mcp-reference-memory.cordis.yml` 또는 `engram.cordis.yml`로 바꾸세요. 경로는 디스크 어디에든 복사해 둔 파일을 가리켜도 됩니다. 기본 배포 구성에는 메모리 서버가 없으므로 `--patch`를 생략하면 세 구성 모두 비활성 상태로 유지됩니다.

선택을 여러 실행에 걸쳐 유지하려면 고른 파일의 단일 `insert` 패치를 사용자 패치 계층에 병합하세요. 프로필 하나에 적용하려면 `$DSH_HOME/profiles/<name>/cordis.patch.yml`, 이 머신의 모든 프로필에 적용하려면 `$DSH_HOME/cordis.patch.yml`을 사용합니다. 기존 파일을 덮어쓰지 마세요. 관련 없는 사용자 패치가 이미 들어 있을 수 있습니다.

## 제공자 설정

### Memorix

```sh
npm install --global memorix@1.3.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/memorix.cordis.yml"
```

Memorix는 LLM이나 임베딩 서비스 없이 로컬 휴리스틱 모드로 동작합니다. 선택적 제공자는 Memorix 자체의 `~/.memorix/config.toml` 또는 프로젝트의 `memorix.toml`에서 구성합니다. 예시는 DSH 작업 디렉터리에서 Memorix의 Git 프로젝트 식별자를 가져오고 Memorix 자체 기본값인 `~/.memorix/data`를 사용합니다. 이를 재정의하려면 DSH를 시작하기 전에 `MEMORIX_DATA_DIR`을 설정하세요.

### MCP Reference Memory

```sh
npm install --global @modelcontextprotocol/server-memory@2026.7.4
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/mcp-reference-memory.cordis.yml"
```

이 참조 서버는 로컬 지식 그래프를 저장하고 엔터티, 관계, 관찰, 읽기, 검색, 열기 도구를 노출합니다. 모델이나 임베딩 서비스가 필요하지 않습니다. 예시는 JSONL을 설치된 npm 패키지 디렉터리가 아니라 `$HOME/.dsh-mcp-reference-memory.jsonl`에 저장합니다. 이를 재정의하려면 DSH를 시작하기 전에 `MEMORY_FILE_PATH`를 설정하세요.

검색은 의미 기반 검색이 아니라 엔터티 이름, 타입, 관찰에 대한 대소문자 무시 부분 문자열 일치입니다. 이 서버는 임베딩, 자동 요약, 충돌 해결, 망각 정책을 추가하지 않습니다.

### Engram

```sh
go install github.com/Gentleman-Programming/engram/cmd/engram@v1.20.0
dsh web --patch "$PWD/apps/cli/config/examples/mcp-memory/engram.cordis.yml"
```

Engram은 저장소와 프로젝트 선택을 담당합니다. 기본적으로 `~/.engram`을 사용하고, DSH 작업 디렉터리에서 Git 프로젝트를 감지하며, `ENGRAM_DATA_DIR` 또는 `ENGRAM_PROJECT`를 주변 환경 변수 재정의로 받아들입니다.

## 선택적 공유 모델 지시문

서버의 도구 설명이 메모리 사용을 안정적으로 유도하지 못한다면 다음의 짧고 벤더 중립적인 지시문을 기존 모델 지시문에 추가하세요:

> 사용자가 무언가를 기억해 달라고 요청하면 메모리 쓰기 도구를 호출하세요. 과거 정보가 관련될 수 있으면 메모리를 검색하고 관련 결과를 사용하세요.

이는 추가 지침일 뿐입니다. 이 예시들은 DSH의 시스템 프롬프트 페르소나를 대체하지 않습니다.

## 쓰기, 새 세션 회상, 사용 검증

고유한 값을 하나 사용하고, 그동안 제공자의 저장 범위를 바꾸지 마세요:

1. DSH 세션 A에서 `Remember that my validation drink is lapsang-<unique suffix>.`라고 요청합니다. 모델이 제공자의 쓰기 도구를 호출했고 도구가 성공을 반환했는지 확인합니다.
2. 같은 호스트에서 실행 중인 DSH에 세션 B를 만듭니다. 세션 A의 대화를 복사하지 마세요. `What is my validation drink? Check memory.`라고 요청합니다. 모델이 제공자의 검색 또는 회상 도구를 호출하고 값을 반환했는지 확인합니다.
3. 세션 B에서 이어서 `Use that preference to suggest one drink for the meeting.`라고 요청합니다. 답변이 회상한 값을 사용하는지 확인합니다.

DSH 세션은 새로 만들어야 하지만 호스트를 다시 시작할 필요는 없습니다. MCP 자식 프로세스가 중단되면 백오프를 적용한 자동 재연결과 도구 재동기화가 트리거됩니다. 도구는 목록에 남아 있고 호출은 중단 중에만 실패하며, 재연결 예산을 모두 쓰면 도구가 등록 해제되고 다시 로드하거나 재시작할 때까지 재연결이 중지됩니다. 최초 검색은 비동기로 진행되므로 첫 검증 프롬프트를 보내기 전에 제공자의 `mcp__...` 도구가 나타날 때까지 기다리세요.

## 다른 MCP 서버 추가

같은 항목 필드를 복사하고 고유한 `id`와 `serverName`을 사용하세요:

```yaml
- insert:
    - id: memory-my-server
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: my-memory
        transport: stdio
        command: my-memory-mcp
        args: []
        env: {}
        cwd: !!js process.cwd()
```

원격 서버의 경우 대신 `transport: streamable-http`, `url`, `headers`를 사용하세요. 제공자별 설치, 식별자, 인증, 모델, 임베딩, 영속성, 라이선스는 여전히 제공자의 책임입니다.
