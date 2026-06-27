/**
 * Functions and types for {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 *
 * With these functions now your templates can use all listed functions below.
 * The imports are automatically injected into the template's scope during compilation.
 *
 * @module Imports
 * @example
 * // In your template file (e.g., template.html)
 * <p><%= _t('Hello, %s!', user.name) %></p>
 * <p><%= _format(user.birthDate, 'date') %></p>
 * <p><%= _routePath('home:/user/{id}/profile', { id: user.id }) %></p>
 */

/**
 * Translate text with optional parameters.
 *
 * @callback FnTranslate
 * @function
 * @param {string} text - Text to be translated.
 * @param {...*} args - Optional parameters for translation.
 * @returns {string} Translated text.
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Format text with optional parameters.
 *
 * See {@link https://ardhi.github.io/bajo/Bajo.html#format|Bajo.format} for more details.
 *
 * @callback FnFormat
 * @function
 * @param {*} val - Value to be formatted.
 * @param {string} type - Value type (e.g., 'string', 'number', 'date').
 * @param {object} [opts] - Optional formatting options.
 * @returns {string} Formatted text.
 * @see {@link https://ardhi.github.io/bajo/Bajo.html#format|Bajo.format}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Find route by name. Only available when Waibu plugin is installed & loaded.
 *
 * See {@link https://ardhi.github.io/waibu/Waibu.html#findRoute|Waibu.findRoute} for more details.
 *
 * @callback FnFindRoute
 * @function
 * @param {string} name - Route name.
 * @param {string} [method='GET'] - HTTP method (e.g., 'GET', 'POST').
 * @returns {object|null} Route object or null if not found.
 * @see {@link https://ardhi.github.io/waibu/Waibu.html#findRoute|Waibu.findRoute}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Get route path by name. Only available when Waibu plugin is installed & loaded.
 *
 * See {@link https://ardhi.github.io/waibu/Waibu.html#routePath|Waibu.routePath} for more details.
 *
 * @callback FnRoutePath
 * @function
 * @param {string} name - Route name.
 * @param {object} [options={}] - Options object.
 * @returns {string|null} Route path or null if not found.
 * @see {@link https://ardhi.github.io/waibu/Waibu.html#routePath|Waibu.routePath}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Get titleized version of a string.
 *
 * @callback FnTitleize
 * @function
 * @param {string} str - String to be titleized.
 * @returns {string} Titleized string.
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Check if a plugin is loaded by its name or alias.
 *
 * @callback FnHasPlugin
 * @function
 * @param {string} nameOrAlias - Plugin name or alias.
 * @returns {boolean} True if the plugin is loaded, false otherwise.
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * JSON stringify a value. Only available when WaibuMpa plugin is installed & loaded.
 *
 * See {@link https://ardhi.github.io/waibu/WaibuMpa.html#jsonStringify|WaibuMpa.jsonStringify} for more details.
 *
 * @callback FnJsonStringify
 * @function
 * @param {*} value - Value to be stringified.
 * @param {object} [replacer] - Optional replacer function or array.
 * @param {string|number} [space] - Optional space for indentation.
 * @returns {string} JSON stringified value.
 * @see {@link https://ardhi.github.io/waibu/WaibuMpa.html#jsonStringify|WaibuMpa.jsonStringify}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Parse markdown text. Only available when BajoMarkdown plugin is installed & loaded.
 * See {@link https://ardhi.github.io/bajo/BajoMarkdown.html#parse|BajoMarkdown.parse} for more details.
 *
 * @callback FnParseMarkdown
 * @function
 * @param {string} value - Markdown text to be parsed.
 * @returns {string} Parsed HTML string.
 * @see {@link https://ardhi.github.io/bajo/BajoMarkdown.html#parse|BajoMarkdown.parse}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Get excerpt of a string.
 *
 * @callback FnExcerpt
 * @function
 * @param {string} text - String to be excerpted.
 * @param {number} [maxWords=50] - Max number of words.
 * @param {string} [trailChars='...'] - Characters to append if truncated.
 * @returns {string} Excerpted string.
 * @see {@link BajoTemplate#getExcerpt|BajoTemplate.getExcerpt}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Dump a value to console.
 *
 * @callback FnDump
 * @function
 * @param {*} value - Value to be dumped.
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Get a setting value by key. Only available when Waibu plugin is installed & loaded.
 *
 * See {@link https://ardhi.github.io/waibu/Waibu.html#getSetting|Waibu.getSetting} for more details.
 *
 * @callback FnGetSetting
 * @function
 * @param {string} key - Setting key.
 * @returns {*} Setting value.
 * @see {@link https://ardhi.github.io/waibu/Waibu.html#getSetting|Waibu.getSetting}
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */

/**
 * Result of {@link BajoTemplate#buildCompileImports} method.
 *
 * @typedef {object} TImportsResult
 * @type {object}
 * @global
 * @property {object} _ - Utility library (lodash)
 * @property {module:Imports~FnTranslate} _t - Translation function
 * @property {module:Imports~FnFormat} _format - Format function
 * @property {module:Imports~FnFindRoute} _findRoute - Find route function
 * @property {module:Imports~FnRoutePath} _routePath - Route path function
 * @property {module:Imports~FnTitleize} _titleize - Titleize function
 * @property {module:Imports~FnHasPlugin} _hasPlugin - Check if plugin exists function
 * @property {module:Imports~FnJsonStringify} _jsonStringify - JSON stringify function
 * @property {module:Imports~FnParseMarkdown} _parseMarkdown - Parse markdown function
 * @property {module:Imports~FnExcerpt} _excerpt - Excerpt function
 * @property {module:Imports~FnDump} _dump - Dump function
 * @property {module:Imports~FnGetSetting} _getSetting - Get setting function
 * @see {@link BajoTemplate#buildCompileImports|BajoTemplate.buildCompileImports}
 */
