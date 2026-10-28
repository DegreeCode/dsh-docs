# 프롬프트로 영속 플러그인 구성하기

[English](dynamic-cordis.md) | [中文](dynamic-cordis.zh.md) | 한국어

표준 모드와 크리에이터 모드는 [Plugin Manager](../../../../packages/boot/plugin-manager/README.md)를 제공하고, 크리에이터 모드는 읽기 전용 [런타임 검사](../../../../packages/extensions/tool-cordis/README.md)를 추가로 제공합니다. 플러그인 구성은 현재 프로필에 속하며 해당 프로필의 세션에 적용되고, 프로세스를 다시 시작해도 유지됩니다.

## MCP 서버 연결

웹 프로필을 시작하고 크리에이터 모드를 선택합니다. `ping`을 제공하는 접근 가능한 Streamable HTTP MCP 서버를 준비한 뒤 실제 엔드포인트를 사용해 다음 프롬프트를 보냅니다:

> 이 프로필에서 `<endpoint>`에 있는 MCP 서버를 `demo`로 구성해 주세요. 도구를 지금 사용할 수 있게 한 다음, ping 도구를 호출하고 결과를 알려 주세요.

에이전트는 patch에 `@deepseek-ai/dsh-mcp-client`를 삽입하는 구성 전용 번들을 작성한 뒤 `plugin_manager install_bundle`로 설치합니다. HMR이 활성화되어 있으면 도구가 실행 중인 같은 세션에 나타납니다. 관리 결과(`application: applied`)와 `mcp__demo__ping` 호출의 성공을 모두 확인하세요. 저장된 항목이 `restart-required`면 아직 활성화되지 않은 것이고, 실패한 항목은 구성을 고쳐야 합니다.

구성을 편집하기 전에 번들 patch를 읽으세요. Plugin Manager로 항목을 비활성화하거나 번들을 제거하세요. 허용되는 구성과 연결 실패 동작은 [MCP 클라이언트 참조](../../../../packages/mcp/mcp-client/README.md)를 보세요.
