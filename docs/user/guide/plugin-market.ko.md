# 플러그인 인덱스

[English](plugin-market.md) | [中文](plugin-market.zh.md) | 한국어

## 요약

플러그인 인덱스는 설치 가능한 DSH 번들과 그 제목, 아이콘, 작성자, 버전을 나열하는 JSON 파일 하나입니다. 실험적 **사용자 지정 플러그인 인덱스** 번들을 켜면 플러그인 페이지의 **탐색** 탭에서 인덱스를 둘러보고, 확인을 거쳐 나열된 버전을 설치할 수 있습니다. 인덱스를 게시하려면 인덱스 파일을 작성하거나 생성해, 아이콘 파일과 함께 정적 호스트 어디에서든 제공하면 됩니다.

## 목차

- [탐색 켜기](#turn-on)
- [둘러보기와 설치](#browse-and-install)
- [인덱스 게시](#publish-an-index)
- [참조 생성기로 인덱스 만들기](#generate-an-index)
- [인덱스 형식 참조](#index-format)
- [더 살펴보기](#further-exploration)

<a id="turn-on"></a>
## 탐색 켜기

**플러그인**을 열고 **실험적 플러그인**에서 **사용자 지정 플러그인 인덱스**를 찾아 스위치를 켭니다. **설치됨** 옆에 **탐색** 탭이 나타나고, 크리에이터 모드에서 읽기 전용 `plugin_market` 도구를 사용할 수 있게 됩니다. 번들을 끄면 둘 다 다시 사라집니다.

DSH는 인덱스 소스를 기본 제공하지 않습니다. **탐색**을 선택하고 **인덱스 소스 추가**를 골라 인덱스 파일의 URL을 입력합니다. URL은 `http:` 또는 `https:`를 사용해야 하며, 사용자 이름, 비밀번호, `#` 프래그먼트를 포함해서는 안 됩니다. 네트워크 경로에 있는 누구든 `http:` 인덱스와 그 인덱스가 나열하는 설치 spec을 바꿀 수 있으므로, 신뢰할 수 없는 네트워크를 거치는 인덱스에는 `https:`를 사용하세요. 각 소스는 현재 프로필에 속합니다.

<a id="browse-and-install"></a>
## 둘러보기와 설치

툴바 왼쪽의 인덱스 메뉴에서 소스를 전환하고 **인덱스 소스 관리…**를 열 수 있으며, 각 소스는 마지막 오류를 표시합니다. 검색은 이름, 작성자, 키워드와 모든 언어의 제목, 설명, 분류, 레이블을 대상으로 하며 오타를 허용합니다. 다른 정렬을 선택하기 전까지는 가장 잘 맞는 순서로 결과가 나옵니다. **레이블** 메뉴, 분류 칩, **정렬** 메뉴는 인덱스가 선언한 분류, 레이블, 정렬 키를 사용하며, **게시 날짜**는 각 플러그인의 최신 버전을 기준으로 정렬합니다.

각 카드는 플러그인의 권장 버전을 보여 줍니다. 실행 중인 DSH와 호환되면서 프리릴리스가 아닌 가장 높은 버전이며, 프리릴리스 태그가 없는 버전을 하나도 나열하지 않은 플러그인이라면 호환되는 가장 높은 프리릴리스입니다. **설치**는 그 버전의 출처(npm 패키지와 레지스트리, 또는 Git 저장소, 커밋, 디렉터리)를 담은 확인 창을 엽니다. 확인하면 호환성 검사와 레지스트리 검사를 포함한 일반 플러그인 설치가 시작되며, 확인 없이는 아무것도 설치되지 않습니다.

카드를 선택하면 해당 플러그인의 페이지가 열립니다. **버전** 목록은 나열된 모든 버전과 그 호환성을 보여 주고, 이전 릴리스와 프리릴리스를 포함해 DSH가 받아들이는 모든 버전에 **설치**를 제공합니다. **설치됨**, **업데이트 가능**, **DSH 제공**이 표시된 카드는 대신 설치된 번들을 엽니다.

인덱스는 제3자 콘텐츠입니다. 각 플러그인의 제목, 설명, 아이콘, 작성자, 출처는 인덱스가 정하며, DSH는 파일 형식만 검사하고 그 주장은 검증하지 않습니다. 신뢰하는 소스만 추가하고, 설치 전에 확인 창에서 출처를 확인하세요.

<a id="publish-an-index"></a>
## 인덱스 게시

인덱스는 UTF-8 JSON 파일이며 기본적으로 최대 128 MiB이고, 리디렉션 없이 2xx 상태로 제공됩니다. GitLab Pages, GitHub Pages, 또는 https 뒤의 객체 저장소처럼 정적 호스트 어디에든 두면 됩니다.

아이콘은 인라인이거나 별도 파일일 수 있습니다. 인라인 아이콘은 인덱스 안의 base64 `data:` URL이며, 추가 요청이 필요 없지만 인덱스가 커집니다. 별도 아이콘은 URL입니다. 상대 아이콘은 웹 페이지의 이미지가 페이지를 기준으로 해석되는 것과 같은 방식으로 인덱스 URL을 기준으로 해석됩니다. 예를 들어 `https://market.example/dsh/index.json`에 있는 인덱스에서 `"icon": "icons/foo.svg"`는 `https://market.example/dsh/icons/foo.svg`을 불러옵니다. 따라서 인덱스와 `icons/` 디렉터리를 나란히 게시하면 파일을 수정하지 않고도 어떤 호스트에서든 동작합니다. 다른 오리진(스킴, 호스트, 포트)의 절대 아이콘 URL은 `https:`를 사용해야 합니다.

다음은 npm 플러그인 하나와 Git 모노레포의 플러그인 하나를 담은 최소 인덱스입니다:

```json
{
  "format": 1,
  "title": { "en": "Team plugins", "zh": "团队插件" },
  "plugins": [
    {
      "name": "dsh-plugin-foo",
      "title": "Foo",
      "description": "Adds the foo tool",
      "icon": "icons/foo.svg",
      "author": "Jane Doe",
      "homepage": "https://github.com/jane/dsh-plugin-foo#readme",
      "repository": { "url": "https://github.com/jane/dsh-plugin-foo" },
      "versions": [
        { "version": "1.1.0", "publishTimestamp": 1790476800, "source": { "type": "npm" }, "engines": { "dsh": ">=0.2.0-rc.2" } },
        { "version": "1.0.0", "publishTimestamp": 1788000000, "source": { "type": "npm" } }
      ]
    },
    {
      "name": "@team/dsh-bar",
      "versions": [
        {
          "version": "0.3.0",
          "publishTimestamp": 1789000000,
          "source": {
            "type": "git",
            "url": "https://gitlab.example.com/team/dsh-plugins",
            "commit": "3f9c2e1d8a4b6c0e7f1a2b3c4d5e6f708192a3b4",
            "path": "packages/bar"
          }
        }
      ]
    }
  ]
}
```

DSH는 아래 규칙을 하나라도 어기면 인덱스 전체를 거부하고, **인덱스 소스 관리…**의 해당 소스 아래에 문제가 된 값의 JSON 경로와 함께 이유를 표시합니다.

<a id="generate-an-index"></a>
## 참조 생성기로 인덱스 만들기

저장소에는 일반 목록에서 인덱스를 만드는 [참조 생성기](../../../apps/plugin-market-generator/README.md)가 있습니다. 한 줄에 npm 패키지 이름 하나 또는 https Git 저장소 URL 하나를 적으며, 빈 줄과 `#`으로 시작하는 줄은 무시됩니다:

```text
@team/dsh-foo
https://gitlab.example.com/team/dsh-plugins
```

DSH 체크아웃에서 실행합니다:

```sh
pnpm --filter @deepseek-ai/dsh-plugin-market-generator start --input plugins.txt --output site/index.json --title "Team plugins"
```

npm 패키지의 경우 인덱스는 폐기되지 않았고 비공개가 아니며 `dsh.bundle`을 선언한 모든 버전을 나열합니다. Git 저장소의 경우 기본 브랜치에서 `package.json`에 `"private": true`를 설정하지 않은 번들 패키지를 찾아, `vX.Y.Z`, `X.Y.Z`, `<name>@X.Y.Z` 태그의 버전과 기본 브랜치의 각 패키지 버전을 나열합니다. 제목, 설명, 아이콘, 작성자, 홈페이지는 각 플러그인의 가장 높은 버전에서 가져옵니다. 경로는 pnpm을 실행한 디렉터리를 기준으로 합니다.

생성기는 파일을 내려받아 읽기만 하며, 패키지를 설치하거나 그 코드를 실행하지 않습니다. 목록 옆의 `.plugin-market-cache`에 캐시를 두므로 다시 실행하면 새 버전과 커밋만 내려받습니다. 위에서 설명한 대로 출력 디렉터리, 즉 `index.json`과 그 `icons/` 디렉터리를 게시하세요.

<a id="index-format"></a>
## 인덱스 형식 참조

`LocalizedText`로 표시된 텍스트 필드는 문자열이거나 소문자 언어 id를 키로 하는 문자열 객체입니다. 예: `{ "en": "Foo", "zh": "甲" }`. 객체에는 `en`이 반드시 있어야 합니다. DSH가 알지 못하는 멤버는 무시됩니다.

| 인덱스 필드 | 필수 | 의미 |
|---|---|---|
| `format` | 예 | `1`. |
| `title`, `description` | `title`만 | 인덱스 이름과 설명, `LocalizedText`. |
| `metadata.categories`, `metadata.labels` | 아니요 | id를 `{ "title": LocalizedText }`로 매핑하는 객체. |
| `metadata.sortKeys` | 아니요 | id를 `{ "title": LocalizedText, "order": "asc" \| "desc" }`로 매핑하는 객체. `order`는 초기 방향입니다. |
| `plugins` | 예 | 인덱스의 기본 순서대로 나열한 플러그인. |

| 플러그인 필드 | 필수 | 의미 |
|---|---|---|
| `name` | 예 | npm 패키지 이름이며 인덱스 안에서 고유합니다. |
| `title`, `description` | 아니요 | `LocalizedText`. 제목이 없으면 카드에 `name`이 표시됩니다. |
| `icon` | 아니요 | 위에서 설명한 대로 인라인 `data:` URL(SVG, PNG, JPEG, WebP, 최대 32 KiB) 또는 URL. |
| `author` | 아니요 | 표시 텍스트. |
| `homepage` | 아니요 | 플러그인 소개 페이지의 절대 `https:` 또는 `http:` URL. 플러그인 페이지에서 이 URL을 링크합니다. |
| `repository` | 아니요 | `{ "url": string, "directory"?: string }`: 소스 저장소의 웹 페이지와 그 안의 패키지 디렉터리. 플러그인 페이지에서 **소스 코드**로 링크합니다. |
| `metadata.category` | 아니요 | 선언된 분류 id 하나. |
| `metadata.labels` | 아니요 | 선언된 레이블 id. |
| `metadata.sortKeys` | 아니요 | 선언된 정렬 키 id를 다운로드 수나 평점 같은 숫자로 매핑하는 객체. |
| `versions` | 예 | 버전이 하나 이상, 순서는 무관합니다. |

| 버전 필드 | 필수 | 의미 |
|---|---|---|
| `version` | 예 | 정확한 SemVer 버전이며 플러그인 안에서 고유합니다. |
| `publishTimestamp` | 예 | 게시 시각(Unix 초). |
| `source` | 예 | `{ "type": "npm", "registry"?: url }` 또는 `{ "type": "git", "url": https-url, "commit": 40-hex-sha, "path"?: directory }`. |
| `engines.dsh` | 아니요 | 이 버전이 실행되는 DSH 버전의 SemVer 범위. 없으면 모든 버전을 뜻합니다. |

DSH는 npm 버전을 `name@version`으로 설치하며 `registry`가 있으면 먼저 그 레지스트리에 묻고, Git 버전은 `git+<url>.git#<commit>`으로 설치하며 하위 디렉터리의 패키지에는 `&path:/<path>`를 덧붙입니다. `engines.dsh`는 패키지 자체의 `engines.dsh`와 일치해야 하며, DSH가 설치 시 다시 검사합니다. 해당 필드가 없는 패키지는 대신 `@deepseek-ai/dsh*` 피어 의존성과 비교해 검사합니다. [형식 설명](../../../.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md)이 모든 규칙을 정의합니다.

<a id="further-exploration"></a>
## 더 살펴보기

- [탐색 탭 참조](../../../packages/client/ui-plugin-market/README.md)에서 탭의 컨트롤과 상태를 설명합니다.
- [플러그인 인덱스 서비스](../../../packages/boot/plugin-market/README.md)에서 가져오기 제한, 캐싱, `plugin_market` 도구를 다룹니다.
- [인덱스 검사기](../../../packages/util/plugin-market-index/README.md)는 생성기가 게시 전에 인덱스를 검사할 때 사용할 수 있는 라이브러리입니다.

## 개발 노트

없음.
