import crypto from 'crypto'
import { _renderString } from './render-string.js'
import path from 'path'

let loopDetector = {}

function _clearLoopDetector () {
  const { omit } = this.app.bajo.lib._
  const now = Date.now()
  const omitted = []
  for (const groupId in loopDetector) {
    const history = loopDetector[groupId]
    if ((history.ts + this.config.loopDetectorDur) < now) omitted.push(groupId)
  }
  loopDetector = omit(loopDetector, omitted)
}

function _detectLoop (tpl, file, opts) {
  const { last } = this.app.bajo.lib._
  if (opts.groupId) {
    if (loopDetector[opts.groupId]) {
      if (last(loopDetector[opts.groupId].file) === file) throw this.plugin.error('loopDetected%s%s', tpl, file)
      loopDetector[opts.groupId].file.push(file)
    } else {
      loopDetector[opts.groupId] = {
        ts: Date.now(),
        file: [file]
      }
    }
  }
}

async function _render (tpl, locals = {}, opts = {}) {
  _clearLoopDetector.call(this)
  const { trim, isEmpty } = this.app.bajo.lib._
  const { fs } = this.app.bajo.lib
  const { breakNsPath } = this.app.bajo

  const { subNs } = breakNsPath(tpl)
  let resp
  if (subNs === 'template') {
    resp = this.resolveTemplate(tpl, opts)
  } else if (subNs === 'partial') {
    resp = this.resolvePartial(tpl, opts)
  }
  const { file } = resp
  _detectLoop.call(this, tpl, file, opts)
  const fileContent = trim(fs.readFileSync(file, 'utf8'))
  let { content, frontMatter } = this.splitContent(fileContent)
  if (isEmpty(content) && (subNs === 'template')) content = '<!-- include ' + tpl.replace('.template', '.partial') + ' -->'
  opts.ext = path.extname(file)
  opts.frontMatter = frontMatter
  opts.partial = opts.partial ?? subNs === 'partial'
  return await _renderString.call(this, content, locals, opts)
}

async function render (tpl, locals = {}, opts = {}) {
  const { runHook, breakNsPath } = this.app.bajo
  const { upperFirst } = this.app.bajo.lib._
  const cache = this.app.bajoCache
  const key = crypto.createHash('md5').update(`${tpl}:${JSON.stringify(locals)}`).digest('hex')
  const { subNs } = breakNsPath(tpl)
  const canCache = subNs === 'template' && this.config.cache !== false && cache && this.app.bajo.config.env !== 'dev'
  if (canCache) {
    const item = await cache.get({ key })
    if (item) return item
  }
  await runHook(`${this.name}:beforeRender${upperFirst(subNs)}`, { tpl, locals, opts })
  let text = await _render.call(this, tpl, locals, opts)
  if (opts.postProcessor) text = await opts.postProcessor({ text, locals, opts })
  await runHook(`${this.name}:afterRender${upperFirst(subNs)}`, { tpl, locals, opts, text })
  if (canCache) await cache.set({ key, value: text, ttl: opts.cacheMaxAge ?? this.config.cache.maxAgeDur })
  return text
}

export default render
