import { docsPages, sectionSpec } from './website/docs.ts'
import { writeFileSync } from 'node:fs'

const enPages = docsPages.filter(p => p.locale === 'en')
const koPages = docsPages.filter(p => p.locale === 'ko')
const koBySource = new Map(koPages.map(p => [p.source, p]))

function koSectionOf(enSection: string): string {
  // find any ko page whose en counterpart had this section? We approximate by
  // mapping through the known English->Korean section names from the ko sections list.
  return SECTION_MAP[enSection] ?? enSection
}

// Build English->Korean section map by pairing en pages and ko pages by source stem.
const SECTION_MAP: Record<string, string> = {}
for (const en of enPages) {
  const ko = koBySource.get(en.source.replace(/\.md$/, '.ko.md'))
  if (ko && ko.section) SECTION_MAP[en.section] = ko.section
}

const rootPages: any[] = []
const enPagesOut: any[] = []
const missingKo: string[] = []
for (const en of enPages) {
  const ko = koBySource.get(en.source.replace(/\.md$/, '.ko.md'))
  if (!ko) missingKo.push(en.source)
  const rootSidebar = ko ? ko.sidebar : (en.sidebar ? en.sidebar.replace(/^en-/, 'ko-') : null)
  rootPages.push({
    locale: 'root',
    contentLocale: ko ? 'ko-KR' : 'en-US',
    source: ko ? en.source.replace(/\.md$/, '.ko.md') : en.source,
    route: en.route.replace(/^en\//, ''),
    label: ko ? ko.label : en.label,
    sidebar: rootSidebar,
    section: ko ? ko.section : koSectionOf(en.section),
    order: en.order,
    ...(en.outline === undefined ? {} : { outline: en.outline }),
    ...(ko?.sourceAliases ? { sourceAliases: ko.sourceAliases } : en.sourceAliases ? { sourceAliases: en.sourceAliases } : {}),
  })
  enPagesOut.push({ ...en })
}

function sectionsFor(pages: any[], locale: 'root' | 'en') {
  const labels = [...new Set(pages.map(p => p.section))]
  const withMeta = labels.flatMap(label => {
    let spec
    try {
      spec = locale === 'root' ? sectionSpec('ko', label) : sectionSpec('en', label)
    } catch {
      // A page outside any sidebar collection (e.g. the home page) has no placement.
      return []
    }
    return [{ label, index: spec.index, ...(spec.collapsed === undefined ? {} : { collapsed: spec.collapsed }) }]
  })
  withMeta.sort((a, b) => a.index - b.index)
  return withMeta.map(({ label, collapsed }) => ({ label, ...(collapsed === undefined ? {} : { collapsed }) }))
}

const manifest = {
  pages: [...rootPages, ...enPagesOut],
  sections: {
    root: sectionsFor(rootPages, 'root'),
    en: sectionsFor(enPagesOut, 'en'),
  },
}
writeFileSync('docs-manifest.json', JSON.stringify(manifest, null, 2) + '\n')
console.log('en pages:', enPages.length, 'ko pages:', koPages.length, 'root pages:', rootPages.length)
console.log('missing ko for:', missingKo.length, missingKo.slice(0, 20))
console.log('root sections:', manifest.sections.root.map(s => s.label))
console.log('wrote docs-manifest.json')
