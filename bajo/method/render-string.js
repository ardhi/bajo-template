import path from 'path'
import { buildCompileImports } from './compile.js'

async function handleInclude (content, locals = {}, opts = {}) {
  const { isEmpty, omit, template, merge } = this.app.bajo.lib._
  const { extractText, breakNsPath } = this.app.bajo
  const start = '<!-- include '
  const end = ' -->'
  const imports = buildCompileImports.call(this, opts.lang)
  while (content.includes(start) && content.includes(end)) {
    const { pattern, result: rsc } = extractText(content, start, end)
    if (!isEmpty(rsc)) {
      let attr = {}
      let [resource, sattr] = rsc.split('|')
      if (!isEmpty(sattr)) {
        try {
          attr = JSON.parse(sattr)
        } catch (err) {}
      }
      const fn = template(resource, { imports })
      resource = fn(locals)
      const { subNs } = breakNsPath(resource)
      let result = ''
      if (subNs === 'partial') {
        const { req, reply } = opts
        const nopts = omit(opts, ['req', 'reply', 'postProcessor'])
        nopts.partial = true
        nopts.req = req
        nopts.reply = reply
        const nlocals = merge({}, locals, attr)
        result = await this.render(resource, nlocals, nopts)
      }
      content = content.replace(pattern, result)
    }
  }
  return content
}

export async function _renderString (content, locals = {}, opts = {}) {
  const { merge, without, isString, omit } = this.app.bajo.lib._
  if (opts.ext === '.md' && this.app.bajoMarkdown) {
    content = await this.compile(content, locals, { lang: opts.lang, ttl: -1 }) // markdown can't process template tags, hence preprocess here
    content = this.app.bajoMarkdown.parse(content)
  }
  let layout
  if (!opts.partial) {
    const pageFm = await this.parseFrontMatter(opts.frontMatter, opts.lang)
    if (pageFm.layout) opts.layout = pageFm.layout
    locals.page = merge(locals.page, omit(pageFm, ['layout']))
    layout = opts.layout ?? (locals.page.ns ? `${locals.page.ns}.layout:/default.html` : 'main.layout:/default.html')
    const ext = path.extname(layout)
    const { file } = this.resolveLayout(layout, opts)
    let { content: layoutContent, frontMatter: layoutFm } = this.splitContent(file, true)
    layoutFm = await this.parseFrontMatter(layoutFm, opts.lang)
    const keys = without(Object.keys(layoutFm), 'css', 'scripts')
    if (['.html'].includes(ext)) {
      for (const item of ['css', 'scripts']) {
        locals.page[item] = locals.page[item] ?? []
        if (isString(locals.page[item])) locals.page[item] = [locals.page[item]]
        layoutFm[item] = layoutFm[item] ?? []
        if (isString(layoutFm[item])) layoutFm[item] = [layoutFm[item]]
        locals.page[item].unshift(...layoutFm[item])
      }
    }
    for (const key of keys) {
      locals.page[key] = locals.page[key] ?? layoutFm[key]
    }
    if (layoutFm.title && !locals.page.title) locals.page.title = layoutFm.title
    content = layoutContent.replace('<!-- body -->', content)
    const appTitle = this.print.write(locals.page.appTitle, { lang: opts.lang })
    const fullTitle = locals.page.title ? `${locals.page.title} - ${appTitle}` : appTitle
    locals.page.fullTitle = locals.fullTitle ?? fullTitle
  }
  content = await handleInclude.call(this, content, locals, opts)
  return await this.compile(content, locals, { lang: opts.lang, ttl: this.config.cache.maxAgeDur })
}

async function renderString (content, locals = {}, opts = {}) {
  let text = await _renderString.call(this, content, locals, opts)
  if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
  return text
}

export default renderString
