import crypto from 'crypto'

export function buildCompileImports (lang) {
  const _ = this.app.bajo.lib._
  return {
    _,
    _t: (text, ...args) => {
      const params = [...args, { lang }]
      return this.print.write(text, ...params)
    },
    _format: (val, type, opts = {}) => {
      opts.lang = opts.lang ?? lang
      return this.app.bajo.format(val, type, opts)
    },
    _routePath: (input) => {
      if (!this.app.waibu) return input
      return this.app.waibu.routePath(input)
    },
    _titleize: this.app.bajo.titleize,
    _hasPlugin: name => this.app.bajo.pluginNames.includes(name),
    _jsonStringify: this.app.waibuMpa.jsonStringify,
    _parseMarkdown: content => {
      if (!this.app.bajoMarkdown) return content
      return this.app.bajoMarkdown.parseContent(content)
    }
  }
}

async function compile (content, locals, { lang, ttl = 0 } = {}) {
  locals.attr = locals.attr ?? {}
  const _ = this.app.bajo.lib._
  const { template } = _
  const cache = this.app.bajoCache
  const canCache = this.config.cache !== false && cache && this.app.bajo.config.env !== 'dev'
  const opts = {
    imports: buildCompileImports.call(this, lang)
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

export default compile
