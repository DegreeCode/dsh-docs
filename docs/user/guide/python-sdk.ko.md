# Python SDK 시작하기

[English](python-sdk.md) | [中文](python-sdk.zh.md) | 한국어

이 자습서에서는 배포된 Python SDK를 설치하고, 함께 제공되는 독립형 최소 프로필을 실행하며, 같은 `dsh` 프로필을 직접 작성한 프로그램에서 사용자 지정하는 방법을 보여 줍니다.

## 사전 준비

- Python 3.10 이상
- Git
- Linux x64, Linux arm64, arm64의 macOS 14 이상, 또는 Windows x64
- DeepSeek 호환 API 엔드포인트와 자격 증명
- 격리된 워크스페이스와 격리된 Harness 홈

## SDK 설치

<div>
<a id="linux-and-macos"></a>
<a id="windows-powershell"></a>
</div>

::: code-group

```sh [Linux/macOS]
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
python -m venv .venv
. .venv/bin/activate
python -m pip install deepseek-harness-sdk
```

```powershell [Windows PowerShell]
git clone https://github.com/deepseek-ai/deepseek-harness.git
Set-Location deepseek-harness
py -3.10 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install deepseek-harness-sdk
```

:::

설치에는 일치하는 네이티브 런타임 휠과 `dsh` 명령이 포함됩니다. 일반적인 SDK 실행에는 시스템 Node.js가 필요하지 않습니다. 아티팩트를 빌드하는 저장소 기여자는 [Python 기여자 워크플로](../../../python/development.md)를 따르세요.

## 저장된 예제 실행

자격 증명과 필요할 경우 호환 프록시 엔드포인트를 내보냅니다:

<div>
<a id="linux-and-macos-1"></a>
<a id="windows-powershell-1"></a>
</div>

::: code-group

```sh [Linux/macOS]
export DEEPSEEK_API_KEY=sk-your-key-here
# export DEEPSEEK_BASE_URL=http://127.0.0.1:8000/v1
```

```powershell [Windows PowerShell]
$env:DEEPSEEK_API_KEY = "sk-your-key-here"
# $env:DEEPSEEK_BASE_URL = "http://127.0.0.1:8000/v1"
```

:::

명시적인 워크스페이스와 홈 경로로 작업 하나를 실행합니다:

<div>
<a id="linux-and-macos-2"></a>
<a id="windows-powershell-2"></a>
</div>

::: code-group

```sh [Linux/macOS]
python python/sdk/examples/minimal.py \
  --workspace /absolute/path/to/disposable-workspace \
  --dsh-home /absolute/path/to/example-dsh-home \
  --session-id example-001 \
  "Inspect the repository and fix the failing tests."
```

```powershell [Windows PowerShell]
python python/sdk/examples/minimal.py `
  --workspace C:\work\disposable-workspace `
  --dsh-home C:\work\example-dsh-home `
  --session-id example-001 `
  "Inspect the repository and fix the failing tests."
```

:::

스크립트는 최종 어시스턴트 응답을 출력합니다. 선택한 홈에는 생성된 `sdk-minimal` 프로필, 설치된 플러그인, 압축하지 않은 JSONL 세션 로그가 `sessions/` 아래에 저장됩니다. 예제와 SDK는 `~/.dsh`를 암묵적으로 읽지 않습니다.

## 프로그램에서 SDK 사용

```python
from pathlib import Path

from deepseek_harness import DeepSeekHarness

workspace = Path("/absolute/path/to/disposable-workspace").resolve()
dsh_home = Path("/absolute/path/to/example-dsh-home").resolve()
with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    dsh_home=str(dsh_home),
    profile="sdk-minimal",
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )

print(result.final_response)
```

SDK는 패키지에 포함된 `dsh --profile sdk-minimal` 프로세스를 지연 시작(lazy start)하며, 컨텍스트 매니저 블록이 종료될 때까지 이를 재사용합니다. 애플리케이션의 최종 구성은 프로필, 프로필의 영구 패치, 홈 패치, 그리고 순서가 지정된 `patches` 튜플의 조합으로 결정됩니다. 별도의 Python 전용 런타임 바이너리가 존재하는 것은 아닙니다.

## 플러그인 설치 또는 정의

이 홈에 유지해야 하는 의존성과 번들 계층에는 `dsh plugin`을 사용하세요:

<div>
<a id="linux-and-macos-3"></a>
<a id="windows-powershell-3"></a>
</div>

::: code-group

```sh [Linux/macOS]
export DSH_HOME=/absolute/path/to/example-dsh-home
dsh --profile sdk-minimal --dump-default-config >/dev/null
dsh plugin --profile sdk-minimal add file:/absolute/path/to/my-plugin-bundle
```

```powershell [Windows PowerShell]
$env:DSH_HOME = "C:\work\example-dsh-home"
dsh --profile sdk-minimal --dump-default-config | Out-Null
dsh plugin --profile sdk-minimal add file:C:/work/my-plugin-bundle
```

:::

첫 번째 명령은 기본 제공되는 독립형 프로필 구성을 초기화합니다. 두 번째 명령은 패키지 관리를 `pnpm`에 위임하고, `dsh.bundle` 확장을 내보내는 설치된 패키지를 등록합니다. `pnpm`은 이와 같은 관리 명령 실행 시에만 필요하며, 설치가 완료된 SDK를 일반 실행할 때는 필요하지 않습니다. 영구적인 설정 변경은 `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml` 파일을 편집하고, 실행 시마다 동적으로 변경하려면 Python 코드에서 패치 파일 경로를 전달하세요.

다른 `profile`은 `@deepseek-ai/dsh-sdk-app` 또는 다른 JSON-RPC 서버 행을 포함하면 유효합니다. 서버 행이 없거나, 플러그인을 해석할 수 없거나, 패치가 유효하지 않으면 다른 구성으로 대체하지 않고 시작 단계에서 실패합니다.

<a id="opt-in-to-str_replace_editor"></a>
### `str_replace_editor` 옵트인

번들 런타임에는 `str_replace_editor`가 포함되어 있지만 `sdk-minimal`은 기본 Cordis 트리에서 이를 제외합니다. 사용하려면 이 구성을 `editor.patch.yml`로 저장하세요. `insert`는 기존 파일시스템 제공자를 사용해 편집기를 추가합니다:

```yaml
- insert:
    - id: tool-str-replace-editor
      name: '@deepseek-ai/dsh-tool-str-replace-editor'
```

`DeepSeekHarness(profile="sdk-minimal", ...)`를 생성할 때 `patches=("/absolute/path/to/editor.patch.yml",)`를 전달하거나, 영구 구성이 필요하면 패치를 `$DSH_HOME/profiles/sdk-minimal/cordis.patch.yml`에 넣으세요. 다음 런타임 실행부터 모델 요청에 기본 도구와 함께 `str_replace_editor`가 포함됩니다. 로컬 파일시스템 제공자는 상대 경로에 런타임 작업 디렉터리를 사용하며, 최소 셸과 마찬가지로 해당 디렉터리로 접근을 제한하지 않습니다. 같은 패치가 표준 `sdk` 프로필에서도 동작합니다.

## 최소 프로필 이해하기

| 속성 | 값 |
|---|---|
| 시스템 프롬프트 | `DSH_SYSTEM_PROMPT`, 없으면 `You are a helpful software engineer assistant.` 사용 |
| `minimal.py`의 모델 | `--model`, 그다음 `DSH_MODEL`, 그다음 `deepseek-v4-flash` |
| 모델 노출 도구 | Linux/macOS의 지속 `bash` 또는 Windows의 `pwsh`, `read_image`, `working_directory` |
| 셸 제한 시간 | 300초 |
| 선택적 런타임 컨텍스트 | 없음 |
| 컨텍스트 압축 | 자동, 추가 모델 요청으로 오래된 기록을 요약 |
| 세션 영속성 | `<dsh_home>/sessions` 아래의 비압축 JSONL |

이 프로필의 유일한 번들은 빈 루트 위에 전체 트리를 직접 구성하며 `dsh-base`를 포함하지 않습니다. 따라서 기본 프로필의 도구들이 의도치 않게 노출되지 않습니다. 이 프로필은 SDK 프로토콜, 환경 변수로 구성되는 단일 DeepSeek 어댑터, 로컬 실행 환경, 세션 영속성만을 포함하며, 텍스트 파일 도구, 설정 UI, 관리형 자격 증명, OTel 텔레메트리, 웹 검색 도구, 서브에이전트, 로컬 프로젝트 지시문 검색 등은 포함하지 않습니다. [DeepSeek 세션 로그 업로더](../../../packages/session/session-log-deepseek/README.md)는 기본적으로 미승인 로그 이벤트를 DeepSeek API 요청에 포함하여 업로드하며(요청당 최대 `maxBytes` 8 MiB), 비활성화하려면 프로필 패치에서 `session-log-deepseek.enabled: false`를 지정하세요. 이 프로필은 `danger-full-access` 권한으로 고정되므로 지속형 셸이 런타임에 노출된 모든 경로를 수정할 수 있습니다. 안전을 위해 일회용 작업 디렉터리나 컨테이너 환경에서 실행하세요.

이미지 읽기에는 이미지를 지원하는 경로가 필요합니다. 자동 압축은 전체 세션 로그를 보존합니다. 모델과 저장소에 미치는 영향은 [번들 참조](../../../packages/bundle/sdk-minimal/README.md)를 참고하세요. SDK 프롬프트 텍스트는 `/compact`나 다른 슬래시 명령을 실행하지 않습니다.

설치된 휠에는 여전히 전체 `web` 프로필과 프런트엔드 자산이 포함됩니다. Python SDK 배포에서 브라우저 애플리케이션도 필요하면 명시적인 `DSH_HOME`을 지정해 `dsh web`을 실행하세요. `web`은 별도의 CLI 애플리케이션이며 Python SDK 클라이언트를 제공할 수 없습니다.

프로필, 플러그인, 자격 증명, 설정, 세션을 격리해야 할 때는 새 홈을 사용하세요. 독립적인 작업에는 새 세션 ID를 사용하고, 같은 지속 대화와 세션이 소유한 리소스를 이어갈 때만 하네스(harness), 홈, ID를 재사용하세요.

자세한 플러그인 트리는 [번들 참조](../../../packages/bundle/sdk-minimal/README.md)에서, 바로 실행 가능한 코드는 [예제 참조](../../../python/sdk/examples/README.md)에서 확인할 수 있습니다. [Python SDK 참조](../../../python/sdk/README.md)는 수명 주기, 결과 반환, 알림 및 저수준 동작을 다루며, [dsh CLI 참조](../../../apps/cli/reference/README.md)는 프로필 계층화 구조를 설명합니다.
