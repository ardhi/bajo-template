import _path from 'path'
const cache = {}

export function filecheck ({ check, dir, base, exts }) {
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
  return file
}

function resolveResource (type, item = '', opts = {}, fallbackHandler) {
  const { trim, uniq, find } = this.app.lib._
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

  const extension = subSubNs ? `${subSubNs}/` : ''
  let file
  // check main override: theme specific
  if (opts.theme) {
    const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${opts.theme}/${ns}/${type}/`
    file = filecheck.call(this, { dir, base, exts, check })
  }
  // check main override: common
  if (!file) {
    const check = `${this.app.main.dir.pkg}/extend/${this.ns}/${ns}/${type}`
    file = filecheck.call(this, { dir, base, exts, check })
  }
  // check override: theme specific
  if (opts.theme && !file) {
    const theme = find(this.app.waibuMpa.themes, { name: opts.theme })
    if (theme) {
      const check = `${theme.plugin.dir.pkg}/extend/${this.ns}/${opts.theme}/${ns}/${extension}${type}`
      file = filecheck.call(this, { dir, base, exts, check })
    }
  }
  // check override: theme specific (common)
  if (opts.theme && !file) {
    const theme = find(this.app.waibuMpa.themes, { name: opts.theme })
    if (theme) {
      const check = `${theme.plugin.dir.pkg}/extend/${this.ns}/_common/${ns}/${extension}${type}`
      file = filecheck.call(this, { dir, base, exts, check })
    }
  }
  // check real: theme specific
  if (opts.theme && !file) {
    const check = `${this.app[ns].dir.pkg}/extend/${this.ns}/${opts.theme}/${extension}${type}`
    file = filecheck.call(this, { dir, base, exts, check })
  }
  // check real: common
  if (!file) {
    const check = `${this.app[ns].dir.pkg}/extend/${this.ns}/${extension}${type}`
    file = filecheck.call(this, { dir, base, exts, check })
  }
  if (fallbackHandler) file = fallbackHandler.call(this, { file, dir, base, exts, ns, subSubNs, type, theme: opts.theme })
  if (opts.default) {
    const fname = this.getResource(opts.default).fullPath
    if (fs.existsSync(fname)) file = fname
  }
  if (!file) throw this.error('cantFind%s%s', type, item)
  const result = { file, ns, layout: opts.layout }
  if (env !== 'dev') cache[item] = result
  return result
}

export default resolveResource
