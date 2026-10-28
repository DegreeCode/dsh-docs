# dsh-docs

Documentation for [DeepSeek Harness](https://github.com/DegreeCode/deepseek-harness), published as a VitePress site.

English | [한국어](README.ko.md)

## What this repository holds

- `docs/` — the canonical Markdown: English sources, Simplified Chinese counterparts, and the optional Korean renderings.
- `website/` — the VitePress site that projects those sources into three route trees (`/`, `/zh/`, `/ko/`).
- `scripts/project-doc-site.ts` — the projection adapter. It rewrites repository-relative links into site routes or GitHub URLs and emits a raw-Markdown twin of every page.
- `.github/workflows/docs-pages.yml` — builds and publishes the site to GitHub Pages.

## Why documentation lives here

The harness repository carries the source code, its gates, and its release machinery. Documentation-only changes do not need that tree, and keeping the documentation beside it made every translation pass touch a checkout that also builds the application, the desktop installers, and the test matrix. This repository publishes the same Markdown with a build that only needs Node and VitePress.

## Links to the source repository

Most documentation links point at files this repository does not carry (`packages/…`, `.agents/notes/…`). Three settings decide what those links become:

| Variable | Meaning |
|---|---|
| `DOCS_REPOSITORY_URL` | Repository the source, image, and edit links point at. |
| `DOCS_REPOSITORY_REF` | Branch those links pin. |
| `DOCS_ONLY_CHECKOUT` | `true` resolves a link target this checkout does not carry to `DOCS_REPOSITORY_URL` instead of failing the build. |

The workflow sets all three; a local run needs them too:

```sh
DOCS_ONLY_CHECKOUT=true \
DOCS_REPOSITORY_URL=https://github.com/DegreeCode/deepseek-harness \
DOCS_REPOSITORY_REF=next \
pnpm run docs:dev
```

## Commands

```sh
pnpm install
pnpm run docs:dev      # local site on http://127.0.0.1:5173
pnpm run docs:build    # production build into website/.dist
pnpm run docs:preview  # serve the built site
```

## Publishing

Push to `main`/`master`, or run **Deploy documentation** manually. Enable Pages first with **Settings → Pages → Build and deployment → Source: GitHub Actions**. The site lands at `https://<owner>.github.io/<repository>/`; Korean pages sit under `/ko/`.

A manual run takes two inputs: `base_path` overrides the site base path, and `deploy: false` builds the artifact without publishing it.

## Translation contract

The English and Simplified Chinese files form a pair with a `foo.i18n.yaml` consistency record. The Korean `foo.ko.md` is an optional third rendering outside that pair: it has no record, and English stays authoritative. Code fences in a Korean rendering are byte-identical to the English source, so the source-equivalence check treats them as derivatives rather than as separate declarations.

## Known limitations

**The harness's other documentation checks do not run here.** `verify-md-links` and `verify-md-wrap` are ported and run in CI. `verify-type-equiv` (code fences against declared source types), `verify-doc-budgets` (word ceilings), and `verify-translation-pairing` (the en/zh consistency records) still run only in the harness checkout, which no longer carries these files. Type equivalence in particular needs the harness source tree; it belongs in a job that checks out both repositories.

**Package metadata copy is not localized.** Plugin titles and descriptions come from each package's own `locale/<language>.json` in the harness repository. Localizing them needs a metadata API on the language-pack surface, not a documentation change.

**Two documentation trees carry no Korean.** `docs/persistence-changes/**` derives record ids and release artifacts from filenames, and `docs/upgrade-guide/**` admits only `guide.md`, `guide.zh.md`, and `guide.i18n.yaml`. Both gates reject a third suffix, so Korean renderings cover the reader-facing trees instead.

**Three harness root documents have no Korean here.** `CONTRIBUTING.ko.md`, `SAFETY.ko.md`, and `BRAND_GUIDELINES.ko.md` describe the code repository rather than this one. `README.ko.md` translates this repository's own README.

**The desktop installer localization has no home.** `apps/desktop/installer/locales/ko_KR.json` and the installer configuration are NSIS resources built into the Windows installer. They are not documentation and not client plugin code.

**No lockfile.** The repository carries no `pnpm-lock.yaml`, so the workflow installs without `--frozen-lockfile` and skips the pnpm cache. Committing one and restoring both settings is the fix.
