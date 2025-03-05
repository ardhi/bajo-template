import resolveResource from '../../lib/resolve-resource.js'

function resolveTemplate (item = '', opts = {}) {
  return resolveResource.call(this, 'partial', item, opts)
}

export default resolveTemplate
