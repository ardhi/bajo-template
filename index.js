import crypto from 'crypto'
import _path from 'path'

const cache = {}

/**
 * Plugin factory.
 *
 * **Never** call this function directly!!! It's only-meant to be called by the {@link https://ardhi.github.io/bajo|Bajo framework} during plugin initialization.
 *
 * @async
 * @param {string} pkgName - NPM package name
 * @returns {Promise<class>} Promise that resolves to the BajoTemplate class
 */
async function factory (pkgName) {
  const me = this

  /**
   * BajoTemplate class definition.
   *
   * @class BajoTemplate
   */
  class BajoTemplate extends this.app.baseClass.Base {
    /**
     * Constructor
     */
    constructor () {
      super(pkgName, me.app)
      /**
       * @property {object} config - Configuration object
       * @property {object} [config.layout={}] - Layout configuration
       * @property {boolean} [config.layout.fallback=true] - Whether to fallback to default layout if not found
       * @property {Number|string} [config.loopDetectorDur='1m'] - Duration for loop detection
       * @property {object} [config.log={}] - Logging configuration
       * @property {boolean} [config.log.resolver=false] - Whether to log resolver actions
       * @property {object} [config.cache={}] - Cache configuration
       * @property {Number|string} [config.cache.ttlDur='1s'] - Time-to-live duration for cache
       */
      this.config = {
        layout: {
          fallback: true
        },
        loopDetectorDur: '1m',
        log: {
          resolver: false
        },
        cache: {
          ttlDur: '1s'
        }
      }
      /**
       * @property {object} loopDetector - Loop detection object
       */
      this.loopDetector = {}
    }

    /**
     * Build compile imports. Used to provide utility functions to templates.
     *
     * @method
     * @param {object} locals - Locals object
     * @param {object} req - Request object
     * @returns {TImportsResult} Imports object
     */
    buildCompileImports = (locals = {}, req = {}) => {
      const _ = this.app.lib._
      return {
        _,
        _t: (text, ...args) => {
          const params = [...args, { lang: req.lang }]
          return this.t(text, ...params)
        },
        _format: (val, type, opts = {}) => {
          opts.lang = opts.lang ?? req.lang
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
        },
        _getSetting: (key, defValue) => {
          if (!this.app.waibu) return _.get(locals, `schema.view.${key}`, defValue)
          const cfg = this.app.waibu.getSetting(key, { defValue, req })
          const { path } = this.app.bajo.breakNsPath(key)
          const paths = path.replaceAll('/', '.').split('.')
          if (paths[0] === '') paths.shift()
          return _.get(locals, `schema.view.${paths.join('.')}`, cfg)
        }
      }
    }

    /**
     * Clear loop detector by removing entries that have expired based on the configured duration.
     *
     * @method
     * @private
     */
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

    /**
     * Detect loop in template rendering.
     *
     * @method
     * @private
     * @param {string} tpl - Template name
     * @param {string} file - File path
     * @param {object} opts - Options object
     */
    _detectLoop = (tpl, file, opts) => {
      const { last } = this.app.lib._
      if (opts.groupId) {
        if (this.loopDetector[opts.groupId]) {
          if (last(this.loopDetector[opts.groupId].file) === file && _path.basename(file)[0] !== '~') {
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

    /**
     * Render a template.
     *
     * @async
     * @method
     * @private
     * @param {string} tpl - Template name
     * @param {object} locals - Locals object
     * @param {object} opts - Options object
     * @returns {Promise<string>} Rendered content
     */
    _render = async (tpl, locals = {}, opts = {}) => {
      this._clearLoopDetector()
      const { trim, isEmpty, last } = this.app.lib._
      const { fs } = this.app.lib
      const { breakNsPath } = this.app.bajo

      let resp
      let subNs
      if (_path.isAbsolute(tpl)) resp = { file: tpl }
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
        if (_path.isAbsolute(tpl) && tpl.includes(sep)) { // for direct waibuMpa's route
          const parts = tpl.split(sep)
          const ns = last(parts[0].split('/'))
          content = `<!-- include ${ns}.partial:/${parts[1]} -->`
        } else content = '<!-- include ' + tpl.replace('.template', '.partial') + ' -->'
      }
      opts.ext = _path.extname(file)
      opts.frontMatter = frontMatter
      opts.partial = opts.partial ?? subNs === 'partial'
      return await this._renderString(content, locals, opts)
    }

    /**
     * Handle include directives in the content.
     *
     * @async
     * @method
     * @private
     * @param {string} content - Content string
     * @param {object} locals - Locals object
     * @param {object} opts - Options object
     * @returns {Promise<string>} Processed content
     */
    _handleInclude = async (content, locals = {}, opts = {}) => {
      const { isEmpty, omit, template, merge } = this.app.lib._
      const { extractText } = this.app.lib.aneka
      const { breakNsPath } = this.app.bajo
      const start = '<!-- include '
      const end = ' -->'
      const imports = this.buildCompileImports(locals, opts.req)
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

    /**
     * Render a string with the given locals and options.
     *
     * @async
     * @method
     * @private
     * @param {string} content - Content string
     * @param {object} locals - Locals object
     * @param {object} opts - Options object
     * @returns {Promise<string>} Rendered content
     */
    _renderString = async (content, locals = {}, opts = {}) => {
      const { merge, without, isString, omit, kebabCase, get } = this.app.lib._
      if (opts.ext === '.md' && this.app.bajoMarkdown) {
        content = await this.compile(content, locals, { ttl: -1, req: opts.req }) // markdown can't process template tags, hence preprocess here
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
        const ext = _path.extname(layout)
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
        const usePluginTitle = get(this, 'app.waibuMpa.config.page.usePluginTitle')
        const fullTitle = usePluginTitle ? `${locals.page.title} - ${this.app.waibuMpa.getPluginTitle(locals.page.ns, opts.lang)}` : locals.page.title
        locals.page.fullTitle = locals.page.fullTitle ?? fullTitle
      }
      content = await this.compile(content, locals, { ttl: this.config.cache.maxAgeDu, req: opts.req })
      return await this._handleInclude(content, locals, opts)
    }

    /**
     * Find a file based on the given options.
     *
     * @method
     * @private
     * @param {object} options - Options object
     * @param {string} options.type - Type of the file
     * @param {string} options.ns - Namespace
     * @param {string} options.subSubNs - Sub-sub namespace
     * @param {string} options.dir - Directory
     * @param {string} options.base - Base name
     * @param {string[]} options.exts - Array of extensions
     * @param {object} options.theme - Theme object
     * @param {object} options.req - Request object
     * @returns {string|null} - Found file path or null
     */
    _findFile = (options = {}) => {
      const { type, ns, subSubNs, dir, base, exts, theme, req, item } = options
      const checking = ({ check, info }) => {
        const { fs } = this.app.lib
        let file
        for (const ext of exts) {
          let path = `${check}/${dir}/${base}${ext}`
          if (['', '.'].includes(dir)) path = `${check}/${base}${ext}`
          if (fs.existsSync(path)) {
            file = path
            break
          }
        }
        if (this.config.log.resolver === type) {
          this.log.trace('%s => Checking %s for "%s" -> %s', item, info, base, check)
          if (file) this.log.trace('OK: %s', file)
          else this.log.trace('Failed')
        }
        return file
      }

      const extension = subSubNs ? `${subSubNs}/` : ''
      let file
      if (this.app.waibu && req) {
        const hostname = this.app.waibu.getHostname(req)
        const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${hostname}/${ns}/${extension}${type}`
        file = checking({ check, info: '1. main override: domain specific' })
      }
      if (theme && !file) {
        const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${theme.name}/${ns}/${extension}${type}`
        file = checking({ check, info: '2. main override: theme specific' })
      }
      if (!file) {
        const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${ns}/${extension}${type}`
        file = checking({ check, info: '3. main override: common' })
      }
      if (theme && !file) {
        const check = `${theme.plugin.dir.pkg}/extend/${this.ns}/${theme.name}/${ns}/${extension}${type}`
        file = checking({ check, info: '4. override: theme specific' })
      }
      if (theme && !file) {
        const check = `${theme.plugin.dir.pkg}/extend/${this.ns}/_common/${ns}/${extension}${type}`
        file = checking({ check, info: '5. override: theme specific (common)' })
      }
      if (theme && !file) {
        const check = `${this.app[ns].dir.pkg}/extend/${this.ns}/${theme.name}/${extension}${type}`
        file = checking({ check, info: '6. real: theme specific' })
      }
      if (!file) {
        const check = `${this.app[ns].dir.pkg}/extend/${this.ns}/${extension}${type}`
        file = checking({ check, info: '7. real: common' })
      }
      return file
    }

    /**
     * Get a resource by name.
     *
     * @method
     * @param {string} name - Resource name
     * @returns {object} Resource object
     */
    getResource = (name) => {
      const subNses = ['layout', 'template', 'partial']
      const { ns, path, subNs, subSubNs, qs } = this.app.bajo.breakNsPath(name)
      const plugin = this.app.getPlugin(ns)
      const dir = `${plugin.dir.pkg}/extend/bajoTemplate`
      if (!subNses.includes(subNs)) throw this.error('unknownResource%s', name)
      const fullPath = subSubNs ? `${dir}/${subSubNs}/${subNs}${path}` : `${dir}/${subNs}${path}`
      return { ns, subNs, subSubNs, path, qs, fullPath }
    }

    /**
     * Parse front matter from the input string.
     *
     * @async
     * @method
     * @param {string} input - Input string
     * @param {string} lang - Language
     * @returns {Promise<object>} Parsed front matter
     */
    parseFrontMatter = async (input = '', lang) => {
      const { isEmpty } = this.app.lib._
      const { parseWithConfig } = this.app.bajo
      const { parseObject } = this.app.lib
      const result = await parseWithConfig(input, null, { defValue: {} })
      if (isEmpty(result)) return {}
      return parseObject(result, { parseValue: false, lang }) ?? {}
    }

    /**
     * Compile a template with the given content and locals.
     *
     * @async
     * @method
     * @param {string} content - Template content
     * @param {object} locals - Locals object
     * @param {object} options - Options object
     * @param {number} options.ttl - Time to live for cache
     * @param {object} options.req - Request object
     * @returns {Promise<Function>} Compiled template function
     */
    compile = async (content, locals, { ttl = 0, req = {} } = {}) => {
      const { get: getCache, set: setCache } = this.app.bajoCache ?? {}
      const { template } = this.app.lib._
      locals.attr = locals.attr ?? {}
      const opts = {
        imports: this.buildCompileImports(locals, req)
      }
      const key = 'fn:' + crypto.createHash('md5').update(content).digest('hex')
      let item
      if (getCache) {
        item = await getCache({ key })
        if (item) return item(locals)
      }
      item = template(content, opts)
      if (setCache) await setCache({ key, value: item, ttl })
      return item(locals)
    }

    /**
     * Render a string with the given locals and options.
     *
     * @async
     * @method
     * @param {string} content - Content string
     * @param {object} locals - Locals object
     * @param {object} opts - Options object
     * @returns {Promise<string>} Rendered content
     */
    renderString = async (content, locals = {}, opts = {}) => {
      let text = await this._renderString(content, locals, opts)
      if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
      return text
    }

    /**
     * Render a template with the given locals and options.
     *
     * @async
     * @method
     * @param {string} tpl - Template name
     * @param {object} locals - Locals object
     * @param {object} opts - Options object
     * @returns {Promise<string>} Rendered template
     */
    render = async (tpl, locals = {}, opts = {}) => {
      const { runHook, breakNsPath } = this.app.bajo
      const { upperFirst } = this.app.lib._
      const { get, set } = this.app.bajoCache ?? {}
      const key = crypto.createHash('md5').update(`${tpl}:${JSON.stringify(locals)}`).digest('hex')
      let subNs
      const isAbsolute = _path.isAbsolute(tpl)
      if (!isAbsolute) subNs = breakNsPath(tpl).subNs
      const canCache = (isAbsolute || subNs === 'template') && this.config.cache !== false && get && set
      if (canCache) {
        const item = await get({ key })
        if (item) return item
      }
      if (subNs) await runHook(`${this.ns}:beforeRender${upperFirst(subNs)}`, { tpl, locals, opts })
      let text = await this._render(tpl, locals, opts)
      if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
      if (subNs) await runHook(`${this.ns}:afterRender${upperFirst(subNs)}`, { tpl, locals, opts, text })
      if (canCache) await set({ key, value: text, ttl: opts.ttlDur ?? this.config.cache.ttlDur })
      return text
    }

    /**
     * Resolve a resource by type and name.
     *
     * @method
     * @param {string} type - Resource type
     * @param {string} item - Resource name
     * @param {object} opts - Options object
     * @param {Function} fallbackHandler - Fallback handler function
     * @returns {object} Resolved resource
     */
    resolveResource = (type, item = '', opts = {}, fallbackHandler) => {
      const { trim, find, uniq } = this.app.lib._
      const { fs } = this.app.lib
      const env = this.app.bajo.config.env
      if (env !== 'dev' && cache[item]) return cache[item]

      let { ns, subSubNs, path } = this.getResource(item)
      const ext = _path.extname(path)
      path = trim(path, '/')
      const dir = _path.dirname(path)
      const base = _path.basename(path, ext)
      const fallbackLang = this.app.bajo.config.intl.fallback
      const exts = uniq([`.${fallbackLang}${ext}`, ext])
      if (opts.lang) exts.unshift(`.${opts.lang}${ext}`)
      let theme
      if (opts.theme && this.app.waibuMpa && opts.req) theme = find(this.app.waibuMpa.themes, { name: opts.theme })
      let file = this._findFile({ type, ns, subSubNs, dir, base, exts, theme, req: opts.req, item })
      if (!file) {
        if (fallbackHandler) file = fallbackHandler.call(this, { dir, base, exts, ns, subSubNs, type, theme, req: opts.req })
        if (opts.default) {
          const fname = this.getResource(opts.default).fullPath
          if (fs.existsSync(fname)) file = fname
        }
        if (!file) throw this.error('cantFind%s%s', type, item)
      }
      const result = { file, ns, layout: opts.layout }
      if (env !== 'dev') cache[item] = result
      return result
    }

    /**
     * Resolve a layout by name.
     *
     * @method
     * @param {string} item - Layout name
     * @param {object} opts - Options object
     * @returns {object} Resolved layout
     */
    resolveLayout = (item = '', opts = {}) => {
      const fallbackHandler = ({ type, ns, subSubNs, dir, exts, theme, req }) => {
        if (!this.config.layout.fallback) return false
        const base = 'default'
        return this._findFile({ type, ns, subSubNs, dir, base, exts, theme, req, item })
      }

      return this.resolveResource('layout', item, opts, fallbackHandler)
    }

    /**
     * Resolve a partial by name.
     *
     * @method
     * @param {string} item - Partial name
     * @param {object} opts - Options object
     * @returns {object} Resolved partial
     */
    resolvePartial = (item = '', opts = {}) => {
      return this.resolveResource('partial', item, opts)
    }

    /**
     * Resolve a template by name.
     *
     * @method
     * @param {string} item - Template name
     * @param {object} opts - Options object
     * @returns {object} Resolved template
     */
    resolveTemplate = (item = '', opts = {}) => {
      return this.resolveResource('template', item, opts)
    }

    /**
     * Split content into front matter and body.
     *
     * @method
     * @param {string} input - Input string or file path
     * @param {boolean} readFile - Whether to read the file
     * @returns {object} Object containing frontMatter and content
     */
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

    /**
     * Get an excerpt from the content.
     *
     * @method
     * @param {string} content - Content string
     * @param {number} maxWords - Maximum number of words
     * @param {string} trailChars - Trailing characters
     * @returns {string} Excerpt
     * @see {@link https://medium.com/@paulohfev/problem-solving-how-to-create-an-excerpt-fdb048687928|Problem Solving: How to Create an Excerpt}
     */
    getExcerpt = (content = '', maxWords = 50, trailChars = '...') => {
      const listOfWords = content.trim().split(' ')
      const truncatedContent = listOfWords.slice(0, maxWords).join(' ')
      const excerpt = truncatedContent + trailChars
      return listOfWords.length > maxWords ? excerpt : content
    }

    /**
     * Get a truncated version of the content.
     *
     * @method
     * @param {string} content - Content string
     * @param {number} maxChars - Maximum number of characters
     * @param {string} trailChars - Trailing characters
     * @returns {string} Truncated content
     */
    getTruncated = (content = '', maxChars = 50, trailChars = '...') => {
      const truncated = content.slice(0, maxChars)
      return truncated.length !== content.length ? (truncated + trailChars) : content
    }
  }

  return BajoTemplate
}

export default factory
