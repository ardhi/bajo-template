const start = '---\n'
const end = '\n---'

function splitContent (input, readFile) {
  const { fs } = this.app.bajo.lib
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
  frontMatter = frontMatter ?? {}
  content = content ?? ''
  return { frontMatter, content }
}

export default splitContent
