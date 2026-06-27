/* global describe, it, beforeEach */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect } from 'chai'

import factory from '../index.js'

const createTempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bajo-template-test-'))

describe('BajoTemplate', () => {
  let app
  let BajoTemplate

  beforeEach(async () => {
    const lodashLike = {
      get: (obj, p, defValue) => {
        const parts = p.split('.')
        let cur = obj
        for (const part of parts) {
          if (cur == null || !(part in cur)) return defValue
          cur = cur[part]
        }
        return cur
      },
      omit: (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k))),
      last: (arr) => arr[arr.length - 1],
      isEmpty: (val) => {
        if (val == null) return true
        if (Array.isArray(val) || typeof val === 'string') return val.length === 0
        if (typeof val === 'object') return Object.keys(val).length === 0
        return false
      },
      isPlainObject: (val) => Object.prototype.toString.call(val) === '[object Object]',
      isArray: Array.isArray,
      filter: (arr, fn) => arr.filter(fn),
      map: (arr, fn) => arr.map(fn),
      template: (content) => {
        return (locals) => `compiled:${content}:${locals.name ?? ''}`
      }
    }

    app = {
      lib: {
        fs,
        _: lodashLike,
        aneka: {
          titleize: (text) => text.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
        },
        parseObject: (obj, opts) => ({ obj, opts })
      },
      baseClass: {
        Base: class Base {
          constructor (pkgName, appRef) {
            this.pkgName = pkgName
            this.app = appRef
            this.ns = 'bajoTemplate'
          }

          t (text, ...params) {
            return `${text}:${params.length}`
          }

          error (msg, ...params) {
            return new Error([msg, ...params].join('|'))
          }
        }
      },
      bajo: {
        format: (val, type, opts) => `${type}:${val}:${opts.lang}`,
        breakNsPath: (key) => ({ path: key.split(':')[1] ?? '' }),
        config: {
          intl: { fallback: 'en' },
          env: 'dev'
        }
      },
      getAllNs: () => ['bajoTemplate', 'waibuMpa'],
      waibu: {
        getSetting: (key, { defValue }) => `setting:${key}:${defValue}`
      },
      waibuMpa: {
        jsonStringify: (v) => JSON.stringify(v)
      },
      configHandlers: []
    }

    BajoTemplate = await factory.call({ app }, 'bajo-template')
  })

  it('initializes default configuration', () => {
    const tpl = new BajoTemplate()

    expect(tpl.config.layout.fallback).to.equal(true)
    expect(tpl.config.loopDetectorDur).to.equal('1m')
    expect(tpl.config.cache.ttlDur).to.equal('1s')
    expect(tpl.loopDetector).to.deep.equal({})
  })

  it('buildCompileImports exposes utility functions', () => {
    const tpl = new BajoTemplate()
    const locals = { schema: { view: { site: { title: 'Local title' } } } }
    const req = { lang: 'id' }

    const imports = tpl.buildCompileImports(locals, req)

    expect(imports._titleize('hello world')).to.equal('Hello World')
    expect(imports._hasPlugin('waibuMpa')).to.equal(true)
    expect(imports._jsonStringify({ a: 1 })).to.equal('{"a":1}')
    expect(imports._format(7, 'number')).to.equal('number:7:id')
    expect(imports._getSetting('main:/site/title', 'Default')).to.equal('Local title')
  })

  it('buildCompileImports _excerpt delegates to getExcerpt', () => {
    const tpl = new BajoTemplate()
    const imports = tpl.buildCompileImports({}, { lang: 'en' })

    expect(imports._excerpt('one two three four', 2)).to.equal('one two...')
  })

  it('clearLoopDetector removes expired entries only', () => {
    const tpl = new BajoTemplate()
    tpl.config.loopDetectorDur = 100
    tpl.loopDetector = {
      old: { ts: Date.now() - 1000, file: ['a'] },
      fresh: { ts: Date.now(), file: ['b'] }
    }

    tpl._clearLoopDetector()

    expect(Object.keys(tpl.loopDetector)).to.deep.equal(['fresh'])
  })

  it('detectLoop records history and throws on repeated same file', () => {
    const tpl = new BajoTemplate()
    const opts = { groupId: 'g1' }
    const file = '/tmp/view.html'

    tpl._detectLoop('x.template:/view.html', file, opts)
    expect(tpl.loopDetector.g1.file).to.deep.equal([file])

    expect(() => tpl._detectLoop('x.template:/view.html', file, opts)).to.throw('loopDetected')
  })

  it('detectLoop allows repeated file when basename starts with tilde', () => {
    const tpl = new BajoTemplate()
    const opts = { groupId: 'g2' }
    const file = '/tmp/~view.html'

    tpl._detectLoop('x.template:/~view.html', file, opts)
    expect(() => tpl._detectLoop('x.template:/~view.html', file, opts)).to.not.throw()
  })

  it('splitContent parses front matter and body from text', () => {
    const tpl = new BajoTemplate()
    const input = '---\ntitle: Test\n---\nBody content'
    const result = tpl.splitContent(input, false)

    expect(result.frontMatter.trim()).to.equal('title: Test')
    expect(result.content.trim()).to.equal('Body content')
  })

  it('splitContent reads file input when readFile is true', () => {
    const tpl = new BajoTemplate()
    const root = createTempRoot()
    const file = path.join(root, 'sample.txt')
    fs.writeFileSync(file, '---\nname: A\n---\nHello', 'utf8')

    const result = tpl.splitContent(file, true)

    expect(result.frontMatter.trim()).to.equal('name: A')
    expect(result.content.trim()).to.equal('Hello')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('getExcerpt and getTruncated return expected text', () => {
    const tpl = new BajoTemplate()

    expect(tpl.getExcerpt('one two three four', 2)).to.equal('one two...')
    expect(tpl.getExcerpt('one two', 5)).to.equal('one two')
    expect(tpl.getTruncated('abcdef', 3)).to.equal('abc...')
    expect(tpl.getTruncated('abc', 10)).to.equal('abc')
    expect(tpl.getExcerpt('one two three', 2, ' (more)')).to.equal('one two (more)')
  })

  it('parseFrontMatter tries handlers and parses first valid object/array', async () => {
    const tpl = new BajoTemplate()
    const calls = []
    app.configHandlers = [
      {
        ext: '.js',
        readHandler: async () => {
          calls.push('.js')
          return { ignored: true }
        }
      },
      {
        ext: '.yaml',
        readHandler: async () => {
          calls.push('.yaml')
          throw new Error('bad')
        }
      },
      {
        ext: '.toml',
        readHandler: async (input, parseValue) => {
          calls.push([input, parseValue])
          return { title: 'ok' }
        }
      }
    ]

    const out = await tpl.parseFrontMatter('title = "ok"', 'id')

    expect(calls).to.deep.equal(['.yaml', ['title = "ok"', true]])
    expect(out).to.deep.equal({ obj: { title: 'ok' }, opts: { parseValue: false, lang: 'id' } })
  })

  it('parseFrontMatter returns empty object when no handler succeeds', async () => {
    const tpl = new BajoTemplate()
    app.configHandlers = [
      { ext: '.yaml', readHandler: async () => '' },
      { ext: '.toml', readHandler: async () => null }
    ]

    const out = await tpl.parseFrontMatter('x', 'en')
    expect(out).to.deep.equal({})
  })

  it('compile reads from cache when available', async () => {
    const tpl = new BajoTemplate()
    const cached = (locals) => `cached:${locals.name}`
    let templateCalled = false

    app.lib._.template = () => {
      templateCalled = true
      return () => 'should-not-run'
    }
    app.bajoCache = {
      get: async () => cached,
      set: async () => {}
    }

    const out = await tpl.compile('hello', { name: 'A' }, { ttl: 5 })
    expect(out).to.equal('cached:A')
    expect(templateCalled).to.equal(false)
  })

  it('compile writes cache when not available', async () => {
    const tpl = new BajoTemplate()
    const setCalls = []
    app.bajoCache = {
      get: async () => undefined,
      set: async (payload) => setCalls.push(payload)
    }

    const out = await tpl.compile('hello', { name: 'B' }, { ttl: 123 })

    expect(out).to.equal('compiled:hello:B')
    expect(setCalls).to.have.lengthOf(1)
    expect(setCalls[0].ttl).to.equal(123)
    expect(setCalls[0].key.startsWith('fn:')).to.equal(true)
  })

  it('renderString applies optional postProcessor', async () => {
    const tpl = new BajoTemplate()
    tpl._renderString = async () => 'rendered'

    const out = await tpl.renderString('x', {}, {
      postProcessor: async ({ text }) => text + ':post'
    })

    expect(out).to.equal('rendered:post')
  })
})
