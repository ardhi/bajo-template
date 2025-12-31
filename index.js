import resolveResource, { filecheck } from './lib/resolve-resource.js'
import crypto from 'crypto'
import path from 'path'

/**
 * Plugin factory
 *
 * @param {string} pkgName - NPM package name
 * @returns {class}
 */
async function factory (pkgName) {
  const me = this

  /**
   * BajoTemplate class
   *
   * @class
   */
  class BajoTemplate extends this.app.baseClass.Base {
    static alias = 'tpl'

    constructor () {
      super(pkgName, me.app)
      this.config = {
        layout: {
          fallback: true
        },
        loopDetectorDur: '1m',
        cache: {
          maxAgeDur: '1s'
        }
      }
      this.loopDetector = {}
    }

    buildCompileImports = (lang) => {
      const _ = this.app.lib._
      return {
        _,
        _t: (text, ...args) => {
          const params = [...args, { lang }]
          return this.t(text, ...params)
        },
        _format: (val, type, opts = {}) => {
          opts.lang = opts.lang ?? lang
          return this.app.bajo.format(val, type, opts)
        },
        _findRoute: (input) => {
          if (!this.app.waibu) return false
          return this.app.waibu.findRoute(input)
        },
        _routePath: (input, opts) => {
          if (!this.app.waibu) return input
          return this.app.waibu.routePath(input, opts)
        },
        _titleize: this.app.lib.aneka.titleize,
        _hasPlugin: name => this.app.getAllNs().includes(name),
        _jsonStringify: this.app.waibuMpa.jsonStringify,
        _parseMarkdown: content => {
          if (!this.app.bajoMarkdown) return content
          return this.app.bajoMarkdown.parseContent(content)
        },
        _excerpt: (content, words) => {
          return this.getExcerpt(content, words)
        },
        _dump: (value, noPre) => {
          return (noPre ? '' : '<pre>') + JSON.stringify(value, null, 2) + (noPre ? '' : '</pre>')
        }
      }
    }

    _clearLoopDetector = () => {
      const { omit } = this.app.lib._
      const now = Date.now()
      const omitted = []
      for (const groupId in this.loopDetector) {
        const history = this.loopDetector[groupId]
        if ((history.ts + this.config.loopDetectorDur) < now) omitted.push(groupId)
      }
      this.loopDetector = omit(this.loopDetector, omitted)
    }

    _detectLoop = (tpl, file, opts) => {
      const { last } = this.app.lib._
      if (opts.groupId) {
        if (this.loopDetector[opts.groupId]) {
          if (last(this.loopDetector[opts.groupId].file) === file && path.basename(file)[0] !== '~') {
            throw this.error('loopDetected%s%s', tpl, file)
          }
          this.loopDetector[opts.groupId].file.push(file)
        } else {
          this.loopDetector[opts.groupId] = {
            ts: Date.now(),
            file: [file]
          }
        }
      }
    }

    _render = async (tpl, locals = {}, opts = {}) => {
      this._clearLoopDetector()
      const { trim, isEmpty, last } = this.app.lib._
      const { fs } = this.app.lib
      const { breakNsPath } = this.app.bajo

      let resp
      let subNs
      if (path.isAbsolute(tpl)) resp = { file: tpl }
      else {
        subNs = breakNsPath(tpl).subNs
        if (subNs === 'template') {
          resp = this.resolveTemplate(tpl, opts)
        } else if (subNs === 'partial') {
          resp = this.resolvePartial(tpl, opts)
        }
      }
      if (!resp) throw this.error('resourceNotFound%s', tpl)
      const { file } = resp
      this._detectLoop(tpl, file, opts)
      const fileContent = trim(fs.readFileSync(file, 'utf8'))
      let { content, frontMatter } = this.splitContent(fileContent)
      if (isEmpty(content)) {
        const sep = '/waibuMpa/route/'
        if (path.isAbsolute(tpl) && tpl.includes(sep)) { // for direct waibuMpa's route
          const parts = tpl.split(sep)
          const ns = last(parts[0].split('/'))
          content = `<!-- include ${ns}.partial:/${parts[1]} -->`
        } else content = '<!-- include ' + tpl.replace('.template', '.partial') + ' -->'
      }
      opts.ext = path.extname(file)
      opts.frontMatter = frontMatter
      opts.partial = opts.partial ?? subNs === 'partial'
      return await this._renderString(content, locals, opts)
    }

    _handleInclude = async (content, locals = {}, opts = {}) => {
      const { isEmpty, omit, template, merge } = this.app.lib._
      const { extractText } = this.app.lib.aneka
      const { breakNsPath } = this.app.bajo
      const start = '<!-- include '
      const end = ' -->'
      const imports = this.buildCompileImports(opts.lang)
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
            const nlocals = merge({}, locals, { attr })
            result = await this.render(resource, nlocals, nopts)
          }
          content = content.replace(pattern, result)
        }
      }
      return content
    }

    _renderString = async (content, locals = {}, opts = {}) => {
      const { merge, without, isString, omit, kebabCase } = this.app.lib._
      if (opts.ext === '.md' && this.app.bajoMarkdown) {
        content = await this.compile(content, locals, { lang: opts.lang, ttl: -1 }) // markdown can't process template tags, hence preprocess here
        content = this.app.bajoMarkdown.parse(content)
      }
      let layout
      if (!opts.partial) {
        const pageFm = await this.parseFrontMatter(opts.frontMatter, opts.lang)
        if (pageFm.layout) opts.layout = pageFm.layout
        if (pageFm.scriptBlock) opts.scriptBlock = pageFm.scriptBlock
        if (pageFm.styleBlock) opts.styleBlock = pageFm.styleBlock
        locals.page = merge({}, locals.page, omit(pageFm, ['layout']))
        layout = opts.layout ?? locals.page.layout ?? (locals.page.ns ? `${locals.page.ns}.layout:/default.html` : 'main.layout:/default.html')
        for (const b of ['scriptBlock', 'styleBlock']) {
          locals.page[b] = pageFm[b] ?? opts[b] ?? (locals.page.ns ? `${locals.page.ns}.partial:/${kebabCase(b)}.html` : `bajoTemplate.partial:/${kebabCase(b)}.html`)
        }
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
        const appTitle = this.t(locals.page.appTitle, { lang: opts.lang })
        const fullTitle = locals.page.title ? `${locals.page.title} - ${appTitle}` : appTitle
        locals.page.fullTitle = locals.fullTitle ?? fullTitle
      }
      content = await this.compile(content, locals, { lang: opts.lang, ttl: this.config.cache.maxAgeDur })
      return await this._handleInclude(content, locals, opts)
    }

    getResource = (name) => {
      const subNses = ['layout', 'template', 'partial']
      const { ns, path, subNs, subSubNs, qs } = this.app.bajo.breakNsPath(name)
      const plugin = this.app.bajo.getPlugin(ns)
      const dir = `${plugin.dir.pkg}/extend/bajoTemplate`
      if (!subNses.includes(subNs)) throw this.error('unknownResource%s', name)
      const fullPath = subSubNs ? `${dir}/${subSubNs}/${subNs}${path}` : `${dir}/${subNs}${path}`
      return { ns, subNs, subSubNs, path, qs, fullPath }
    }

    parseFrontMatter = async (input = '', lang) => {
      const { isEmpty, isPlainObject, isArray, filter, map } = this.app.lib._
      const { parseObject } = this.app.lib
      const handlers = map(filter(this.app.configHandlers, h => !['.js'].includes(h.ext)), h => h.readHandler)
      let success
      for (const handler of handlers) {
        if (success) break
        try {
          const result = await handler(input, true)
          if (isPlainObject(result) || isArray(result)) success = result
        } catch (err) {
        }
      }
      if (isEmpty(success)) return {}
      return parseObject(success, { parseValue: true, lang }) ?? {}
    }

    compile = async (content, locals, { lang, ttl = 0 } = {}) => {
      locals.attr = locals.attr ?? {}
      const { template } = this.app.lib._
      const cache = this.app.bajoCache
      let canCache = this.config.cache !== false && cache && this.app.bajo.config.env !== 'dev'
      if (ttl === -1) canCache = false
      const opts = {
        imports: this.buildCompileImports(lang)
      }

      let item
      if (canCache) {
        const key = 'fn:' + crypto.createHash('md5').update(content).digest('hex')
        const value = template(content, opts)
        item = await cache.sync({ key, value, ttl })
      } else {
        item = template(content, opts)
      }
      return item(locals)
    }

    renderString = async (content, locals = {}, opts = {}) => {
      let text = await this._renderString(content, locals, opts)
      if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
      return text
    }

    render = async (tpl, locals = {}, opts = {}) => {
      const { runHook, breakNsPath } = this.app.bajo
      const { upperFirst } = this.app.lib._
      const cache = this.app.bajoCache
      const key = crypto.createHash('md5').update(`${tpl}:${JSON.stringify(locals)}`).digest('hex')
      let subNs
      const isAbsolute = path.isAbsolute(tpl)
      if (!isAbsolute) subNs = breakNsPath(tpl).subNs
      const canCache = (isAbsolute || subNs === 'template') && this.config.cache !== false && cache && this.app.bajo.config.env !== 'dev'
      if (canCache) {
        const item = await cache.get({ key })
        if (item) return item
      }
      if (subNs) await runHook(`${this.ns}:beforeRender${upperFirst(subNs)}`, { tpl, locals, opts })
      let text = await this._render(tpl, locals, opts)
      if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
      if (subNs) await runHook(`${this.ns}:afterRender${upperFirst(subNs)}`, { tpl, locals, opts, text })
      if (canCache) await cache.set({ key, value: text, ttl: opts.cacheMaxAge ?? this.config.cache.maxAgeDur })
      return text
    }

    resolveLayout = (item = '', opts = {}) => {
      const { find } = this.app.lib._
      const fallbackHandler = ({ file, exts, ns, subSubNs, type, theme }) => {
        const dir = ''
        const base = 'default'
        if (!this.config.layout.fallback) return false
        // check main: theme specific
        if (theme && !file) {
          const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${type}/_${theme}`
          file = filecheck.call(this, { dir, base, exts, check })
        }
        // check main: common
        if (!file) {
          const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${type}`
          file = filecheck.call(this, { dir, base, exts, check })
        }
        if (theme && !file) {
          const otheme = find(this.app.waibuMpa.themes, { name: theme })
          const check = `${otheme.plugin.dir.pkg}/extend/${this.ns}/extend/${this.ns}/${type}`
          file = filecheck.call(this, { dir, base, exts, check })
        }
        // check fallback: common
        if (!file) {
          const check = `${this.app[ns].dir.pkg}/extend/${this.ns}/${subSubNs ? (subSubNs + '/') : ''}${type}`
          file = filecheck.call(this, { dir, base, exts, check })
        }
        // check general fallback
        if (!file) {
          const check = `${this.dir.pkg}/extend/${this.ns}/${subSubNs ? (subSubNs + '/') : ''}${type}`
          file = filecheck.call(this, { dir, base, exts, check })
        }
        return file
      }

      return resolveResource.call(this, 'layout', item, opts, fallbackHandler)
    }

    resolvePartial = (item = '', opts = {}) => {
      return resolveResource.call(this, 'partial', item, opts)
    }

    resolveTemplate = (item = '', opts = {}) => {
      return resolveResource.call(this, 'template', item, opts)
    }

    splitContent = (input, readFile) => {
      const { fs } = this.app.lib
      const start = '---\n'
      const end = '\n---'

      let content = readFile ? fs.readFileSync(input, 'utf8') : input
      let text = content.replaceAll('\r\n', '\n')
      const open = text.indexOf(start)
      let frontMatter
      if (open > -1) {
        text = text.slice(open + start.length)
        const close = text.indexOf(end)
        if (close > -1) {
          frontMatter = text.slice(0, close)
          content = text.slice(close + end.length)
        }
      }
      frontMatter = frontMatter ?? ''
      content = content ?? ''
      return { frontMatter, content }
    }

    // based on: https://medium.com/@paulohfev/problem-solving-how-to-create-an-excerpt-fdb048687928
    getExcerpt = (content, maxWords = 50, trailChars = '...') => {
      const listOfWords = content.trim().split(' ')
      const truncatedContent = listOfWords.slice(0, maxWords).join(' ')
      const excerpt = truncatedContent + trailChars
      const output = listOfWords.length > maxWords ? excerpt : content
      return output
    }
  }

  return BajoTemplate
}

export default factory
