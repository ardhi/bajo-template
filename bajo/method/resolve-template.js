import resolveResource from '../../lib/resolve-resource.js'

function resolveTemplate (item = '', opts = {}) {
  return resolveResource.call(this, 'template', item, opts)
}

export default resolveTemplate
