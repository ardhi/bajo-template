async function parseFrontMatter (input = '', lang) {
  const { isEmpty, isPlainObject, isArray, filter, map } = this.app.bajo.lib._
  const { parseObject } = this.app.bajo
  const handlers = map(filter(this.app.bajo.configHandlers, h => !['.js'].includes(h.ext)), h => h.readHandler)
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

export default parseFrontMatter
