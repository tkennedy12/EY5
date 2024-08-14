/* eslint-disable max-classes-per-file */
/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env browser */
function sampleRUM(checkpoint, data) {
  // eslint-disable-next-line max-len
  const timeShift = () => (window.performance ? window.performance.now() : Date.now() - window.hlx.rum.firstReadTime);
  try {
    window.hlx = window.hlx || {};
    sampleRUM.enhance = () => {};
    if (!window.hlx.rum) {
      const weight = new URLSearchParams(window.location.search).get('rum') === 'on' ? 1 : 100;
      const id = Math.random().toString(36).slice(-4);
      const isSelected = Math.random() * weight < 1;
      // eslint-disable-next-line object-curly-newline, max-len
      window.hlx.rum = {
        weight,
        id,
        isSelected,
        firstReadTime: window.performance ? window.performance.timeOrigin : Date.now(),
        sampleRUM,
        queue: [],
        collector: (...args) => window.hlx.rum.queue.push(args),
      };
      if (isSelected) {
        const dataFromErrorObj = (error) => {
          const errData = { source: 'undefined error' };
          try {
            errData.target = error.toString();
            errData.source = error.stack
              .split('\n')
              .filter((line) => line.match(/https?:\/\//))
              .shift()
              .replace(/at ([^ ]+) \((.+)\)/, '$1@$2')
              .replace(/ at /, '@')
              .trim();
          } catch (err) {
            /* error structure was not as expected */
          }
          return errData;
        };

        window.addEventListener('error', ({ error }) => {
          const errData = dataFromErrorObj(error);
          sampleRUM('error', errData);
        });

        window.addEventListener('unhandledrejection', ({ reason }) => {
          let errData = {
            source: 'Unhandled Rejection',
            target: reason || 'Unknown',
          };
          if (reason instanceof Error) {
            errData = dataFromErrorObj(reason);
          }
          sampleRUM('error', errData);
        });

        sampleRUM.baseURL = sampleRUM.baseURL || new URL(window.RUM_BASE || '/', new URL('https://rum.hlx.page'));
        sampleRUM.collectBaseURL = sampleRUM.collectBaseURL || sampleRUM.baseURL;
        sampleRUM.sendPing = (ck, time, pingData = {}) => {
          // eslint-disable-next-line max-len, object-curly-newline
          const rumData = JSON.stringify({
            weight,
            id,
            referer: window.location.href,
            checkpoint: ck,
            t: time,
            ...pingData,
          });
          const { href: url, origin } = new URL(`.rum/${weight}`, sampleRUM.collectBaseURL);
          const body = origin === window.location.origin
            ? new Blob([rumData], { type: 'application/json' })
            : rumData;
          navigator.sendBeacon(url, body);
          // eslint-disable-next-line no-console
          console.debug(`ping:${ck}`, pingData);
        };
        sampleRUM.sendPing('top', timeShift());

        sampleRUM.enhance = () => {
          const script = document.createElement('script');
          script.src = new URL(
            '.rum/@adobe/helix-rum-enhancer@^2/src/index.js',
            sampleRUM.baseURL,
          ).href;
          document.head.appendChild(script);
        };
        if (!window.hlx.RUM_MANUAL_ENHANCE) {
          sampleRUM.enhance();
        }
      }
    }
    if (window.hlx.rum && window.hlx.rum.isSelected && checkpoint) {
      window.hlx.rum.collector(checkpoint, data, timeShift());
    }
    document.dispatchEvent(new CustomEvent('rum', { detail: { checkpoint, data } }));
  } catch (error) {
    // something went wrong
  }
}

/**
 * Sanitizes a string for use as class name.
 * @param {string} name The unsanitized string
 * @returns {string} The class name
 */
function toClassName(name) {
  return typeof name === 'string'
    ? name
      .toLowerCase()
      .replace(/[^0-9a-z]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    : '';
}

/**
 * Sanitizes a string for use as a js property name.
 * @param {string} name The unsanitized string
 * @returns {string} The camelCased name
 */
function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Extracts the config from a block.
 * @param {Element} block The block element
 * @returns {object} The block config
 */
// eslint-disable-next-line import/prefer-default-export
function readBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    if (row.children) {
      const cols = [...row.children];
      if (cols[1]) {
        const col = cols[1];
        const name = toClassName(cols[0].textContent);
        let value = '';
        if (col.querySelector('a')) {
          const as = [...col.querySelectorAll('a')];
          if (as.length === 1) {
            value = as[0].href;
          } else {
            value = as.map((a) => a.href);
          }
        } else if (col.querySelector('img')) {
          const imgs = [...col.querySelectorAll('img')];
          if (imgs.length === 1) {
            value = imgs[0].src;
          } else {
            value = imgs.map((img) => img.src);
          }
        } else if (col.querySelector('p')) {
          const ps = [...col.querySelectorAll('p')];
          if (ps.length === 1) {
            value = ps[0].textContent;
          } else {
            value = ps.map((p) => p.textContent);
          }
        } else value = row.children[1].textContent;
        config[name] = value;
      }
    }
  });
  return config;
}

/**
 * Loads a CSS file.
 * @param {string} href URL to the CSS file
 */
async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

/**
 * Loads a non module JS file.
 * @param {string} src URL to the JS file
 * @param {Object} attrs additional optional attributes
 */
async function loadScript(src, attrs) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > script[src="${src}"]`)) {
      const script = document.createElement('script');
      script.src = src;
      if (attrs) {
        // eslint-disable-next-line no-restricted-syntax, guard-for-in
        for (const attr in attrs) {
          script.setAttribute(attr, attrs[attr]);
        }
      }
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    } else {
      resolve();
    }
  });
}

/**
 * Retrieves the content of metadata tags.
 * @param {string} name The metadata name (or property)
 * @param {Document} doc Document object to query for metadata. Defaults to the window's document
 * @returns {string} The metadata value(s)
 */
function getMetadata(name, doc = document) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const meta = [...doc.head.querySelectorAll(`meta[${attr}="${name}"]`)]
    .map((m) => m.content)
    .join(', ');
  return meta || '';
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} [alt] The image alternative text
 * @param {boolean} [eager] Set loading attribute to eager
 * @param {Array} [breakpoints] Breakpoints and corresponding params (eg. width)
 * @returns {Element} The picture element
 */
function createOptimizedPicture(
  src,
  alt = '',
  eager = false,
  breakpoints = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }],
) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      picture.appendChild(img);
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
    }
  });

  return picture;
}

/**
 * Set template (page structure) and theme (page styles).
 */
function decorateTemplateAndTheme() {
  const addClasses = (element, classes) => {
    classes.split(',').forEach((c) => {
      element.classList.add(toClassName(c.trim()));
    });
  };
  const template = getMetadata('template');
  if (template) addClasses(document.body, template);
  const theme = getMetadata('theme');
  if (theme) addClasses(document.body, theme);
}

/**
 * Wrap inline text content of block cells within a <p> tag.
 * @param {Element} block the block element
 */
function wrapTextNodes(block) {
  const validWrappers = [
    'P',
    'PRE',
    'UL',
    'OL',
    'PICTURE',
    'TABLE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
  ];

  const wrap = (el) => {
    const wrapper = document.createElement('p');
    wrapper.append(...el.childNodes);
    el.append(wrapper);
  };

  block.querySelectorAll(':scope > div > div').forEach((blockColumn) => {
    if (blockColumn.hasChildNodes()) {
      const hasWrapper = !!blockColumn.firstElementChild
        && validWrappers.some((tagName) => blockColumn.firstElementChild.tagName === tagName);
      if (!hasWrapper) {
        wrap(blockColumn);
      } else if (
        blockColumn.firstElementChild.tagName === 'PICTURE'
        && (blockColumn.children.length > 1 || !!blockColumn.textContent.trim())
      ) {
        wrap(blockColumn);
      }
    }
  });
}

/**
 * Decorates paragraphs containing a single link as buttons.
 * @param {Element} element container element
 */
function decorateButtons(element) {
  element.querySelectorAll('a').forEach((a) => {
    a.title = a.title || a.textContent;
    if (a.href !== a.textContent) {
      const up = a.parentElement;
      const twoup = a.parentElement.parentElement;
      if (!a.querySelector('img')) {
        if (up.childNodes.length === 1 && (up.tagName === 'P' || up.tagName === 'DIV')) {
          a.className = 'button'; // default
          up.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'STRONG'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button primary';
          twoup.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'EM'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button secondary';
          twoup.classList.add('button-container');
        }
      }
    }
  });
}

/**
 * Add <img> for icon, prefixed with codeBasePath and optional prefix.
 * @param {Element} [span] span element with icon classes
 * @param {string} [prefix] prefix to be added to icon src
 * @param {string} [alt] alt text to be added to icon
 */
function decorateIcon(span, prefix = '', alt = '') {
  const iconName = Array.from(span.classList)
    .find((c) => c.startsWith('icon-'))
    .substring(5);
  const img = document.createElement('img');
  img.dataset.iconName = iconName;
  img.src = `${window.hlx.codeBasePath}${prefix}/icons/${iconName}.svg`;
  img.alt = alt;
  img.loading = 'lazy';
  span.append(img);
}

/**
 * Add <img> for icons, prefixed with codeBasePath and optional prefix.
 * @param {Element} [element] Element containing icons
 * @param {string} [prefix] prefix to be added to icon the src
 */
function decorateIcons(element, prefix = '') {
  const icons = [...element.querySelectorAll('span.icon')];
  icons.forEach((span) => {
    decorateIcon(span, prefix);
  });
}

/**
 * Decorates all sections in a container element.
 * @param {Element} main The container element
 */
function decorateSections(main) {
  main.querySelectorAll(':scope > div').forEach((section) => {
    const wrappers = [];
    let defaultContent = false;
    [...section.children].forEach((e) => {
      if (e.tagName === 'DIV' || !defaultContent) {
        const wrapper = document.createElement('div');
        wrappers.push(wrapper);
        defaultContent = e.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1].append(e);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.dataset.sectionStatus = 'initialized';
    section.style.display = 'none';

    // Process section metadata
    const sectionMeta = section.querySelector('div.section-metadata');
    if (sectionMeta) {
      const meta = readBlockConfig(sectionMeta);
      Object.keys(meta).forEach((key) => {
        if (key === 'style') {
          const styles = meta.style
            .split(',')
            .filter((style) => style)
            .map((style) => toClassName(style.trim()));
          styles.forEach((style) => section.classList.add(style));
        } else {
          section.dataset[toCamelCase(key)] = meta[key];
        }
      });
      sectionMeta.parentNode.remove();
    }
  });
}

/**
 * Gets placeholders object.
 * @param {string} [prefix] Location of placeholders
 * @returns {object} Window placeholders object
 */
// eslint-disable-next-line import/prefer-default-export
async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return {};
        })
        .then((json) => {
          const placeholders = {};
          json.data
            .filter((placeholder) => placeholder.Key)
            .forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[prefix] = placeholders;
          resolve(window.placeholders[prefix]);
        })
        .catch(() => {
          // error loading placeholders
          window.placeholders[prefix] = {};
          resolve(window.placeholders[prefix]);
        });
    });
  }
  return window.placeholders[`${prefix}`];
}

/**
 * Builds a block DOM Element from a two dimensional array, string, or object
 * @param {string} blockName name of the block
 * @param {*} content two dimensional array or string or object of content
 */
function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return blockEl;
}

/**
 * Dispatches a custom DOM event and awaits all listeners before returning.
 * @param {String} eventName The custom event to trigger
 * @param {Object} [detail] Optional detail object to pass to the event
 * @returns a promise that all async listeners have run
 */
async function dispatchAsyncEvent(eventName, detail = {}) {
  const promises = [];
  const event = new CustomEvent(eventName, { detail });
  event.await = (p) => promises.push(p);
  document.dispatchEvent(event);
  return Promise.all(promises);
}

/**
 * Loads the specified module with its JS and CSS files and returns the JS API if applicable.
 * @param {String} name The module name
 * @param {String} cssPath A path to the CSS file to load, or null
 * @param {String} jsPath A path to the JS file to load, or null
 * @param {...any} args Arguments to use to call the default export on the JS file
 * @returns a promsie that the module was loaded, and that returns the JS API is any
 */
async function loadModule({
  name, cssPath, jsPath, el,
}) {
  const cssLoaded = cssPath ? loadCSS(cssPath) : Promise.resolve();
  const decorationComplete = jsPath
    ? new Promise((resolve) => {
      (async () => {
        let mod;
        try {
          mod = await import(jsPath);
          if (mod.default) {
            await mod.default(el);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log(`failed to load module for ${name}`, error);
        }
        resolve(mod);
      })();
    })
    : Promise.resolve();
  return Promise.all([cssLoaded, decorationComplete])
    .then(([, api]) => api);
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
async function loadBlock(block) {
  const status = block.dataset.blockStatus;
  if (status !== 'loading' && status !== 'loaded') {
    block.dataset.blockStatus = 'loading';
    const { blockName } = block.dataset;
    try {
      const cssPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.css`;
      const jsPath = `${window.hlx.codeBasePath}/blocks/${blockName}/${blockName}.js`;
      const config = {
        block,
        blockName,
        cssPath,
        jsPath,
      };
      await dispatchAsyncEvent('aem:block:config', config);
      await loadModule({
        name: blockName, cssPath, jsPath, el: block,
      });
      await dispatchAsyncEvent('aem:blockdecorated', { name: blockName, block });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(`failed to load block ${blockName}`, error);
    }
    block.dataset.blockStatus = 'loaded';
    await dispatchAsyncEvent('aem:block:loaded', { name: blockName, block });
  }
  return block;
}

/**
 * Decorates a block.
 * @param {Element} block The block element
 */
function decorateBlock(block) {
  const shortBlockName = block.classList[0];
  if (shortBlockName) {
    block.classList.add('block');
    block.dataset.blockName = shortBlockName;
    block.dataset.blockStatus = 'initialized';
    wrapTextNodes(block);
    const blockWrapper = block.parentElement;
    blockWrapper.classList.add(`${shortBlockName}-wrapper`);
    const section = block.closest('.section');
    if (section) section.classList.add(`${shortBlockName}-container`);
  }
}

/**
 * Decorates all blocks in a container element.
 * @param {Element} main The container element
 */
function decorateBlocks(main) {
  main.querySelectorAll('div.section > div > div').forEach(decorateBlock);
}

/**
 * Loads a block named 'header' into header
 * @param {Element} header header element
 * @returns {Promise}
 */
async function loadHeader(header) {
  const headerBlock = buildBlock('header', '');
  header.append(headerBlock);
  decorateBlock(headerBlock);
  return loadBlock(headerBlock);
}

/**
 * Loads a block named 'footer' into footer
 * @param footer footer element
 * @returns {Promise}
 */
async function loadFooter(footer) {
  const footerBlock = buildBlock('footer', '');
  footer.append(footerBlock);
  decorateBlock(footerBlock);
  return loadBlock(footerBlock);
}

/**
 * Wait for Image.
 * @param {Element} section section element
 */
async function waitForFirstImage(section) {
  const lcpCandidate = section.querySelector('img');
  await new Promise((resolve) => {
    if (lcpCandidate && !lcpCandidate.complete) {
      lcpCandidate.setAttribute('loading', 'eager');
      lcpCandidate.addEventListener('load', resolve);
      lcpCandidate.addEventListener('error', resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Loads all blocks in a section.
 * @param {Element} section The section element
 */

async function loadSection(section, loadCallback) {
  const status = section.dataset.sectionStatus;
  if (!status || status === 'initialized') {
    section.dataset.sectionStatus = 'loading';
    const blocks = [...section.querySelectorAll('div.block')];
    for (let i = 0; i < blocks.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await loadBlock(blocks[i]);
    }
    if (loadCallback) await loadCallback(section);
    section.dataset.sectionStatus = 'loaded';
    section.style.display = null;
    dispatchAsyncEvent('aem:section:loaded', { section });
  }
}

/**
 * Loads all sections.
 * @param {Element} element The parent element of sections to load
 */

async function loadSections(element) {
  const sections = [...element.querySelectorAll('div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await loadSection(sections[i]);
  }
}

/**
 * Parses the plugin id and config paramters and returns a proper config
 *
 * @param {String} id A string that idenfies the plugin, or a path to it
 * @param {String|Object} [config] A string representing the path to the plugin, or a config object
 * @returns an object returning the the plugin id and its config
 */
function parsePluginParams(id, config) {
  const pluginId = !config
    ? id.split('/').splice(id.endsWith('/') ? -2 : -1, 1)[0].replace(/\.js/, '')
    : id;
  const pluginConfig = typeof config === 'string' || !config
    ? { load: 'lazy', url: (config || id).replace(/\/$/, '') }
    : { load: config.eager ? 'eager' : 'lazy', ...config };
  pluginConfig.options ||= {};
  return { id: toClassName(pluginId), config: pluginConfig };
}

class PluginsRegistry {
  #plugins;

  constructor() {
    this.#plugins = new Map();
  }

  // Register a new plugin
  add(id, config) {
    const { id: pluginId, config: plugin } = parsePluginParams(id, config);
    this.#plugins.set(pluginId, plugin);
    document.addEventListener(`aem:${plugin.load}`, (ev) => {
      if (plugin.condition && !plugin.condition(document, plugin.options)) {
        return;
      }
      if (plugin.url) {
        const isJsUrl = plugin.url.endsWith('.js');
        const loadPromise = loadModule({
          name: pluginId,
          cssPath: !isJsUrl ? `${plugin.url}/${pluginId}.css` : null,
          jsPath: !isJsUrl ? `${plugin.url}/${pluginId}.js` : plugin.url,
          el: document,
        }).then((api = {}) => {
          this.#plugins.set(pluginId, { ...plugin, ...api });
        });
        ev.await(loadPromise);
      } else if (plugin.run) {
        plugin.run(document, plugin.options);
      }
      ['eager', 'lazy', 'delayed'].forEach((phase) => {
        if (plugin[phase] && ev.type !== `aem:${phase}`) {
          document.addEventListener(`aem:${phase}`, () => plugin[phase](document, plugin.options), { once: true });
        } else if (plugin[phase] && ev.type === `aem:${phase}`) {
          plugin[phase](document, plugin.options);
        }
      });
    }, { once: true });
  }

  // Get the plugin
  get(id) { return this.#plugins.get(id); }

  // Check if the plugin exists
  has(id) { return !!this.#plugins.has(id); }
}

class TemplatesRegistry {
  // Register a new template
  // eslint-disable-next-line class-methods-use-this
  add(id, url) {
    const { id: templateId, config: templateConfig } = parsePluginParams(id, url);
    window.hlx.plugins.add(templateId, {
      ...templateConfig,
      condition: () => toClassName(getMetadata('template')) === templateId,
      load: 'eager',
    });
  }

  // Get the template
  // eslint-disable-next-line class-methods-use-this
  get(id) { return window.hlx.plugins.get(id); }

  // Check if the template exists
  // eslint-disable-next-line class-methods-use-this
  has(id) { return window.hlx.plugins.includes(id); }
}

/**
 * Setup block utils.
 */
function setup() {
  window.hlx = window.hlx || {};
  window.hlx.RUM_MASK_URL = 'full';
  window.hlx.RUM_MANUAL_ENHANCE = true;
  window.hlx.codeBasePath = '';
  window.hlx.lighthouse = new URLSearchParams(window.location.search).get('lighthouse') === 'on';
  window.hlx.plugins = new PluginsRegistry();
  window.hlx.templates = new TemplatesRegistry();

  const scriptEl = document.querySelector('script[src$="/scripts/scripts.js"]');
  if (scriptEl) {
    try {
      [window.hlx.codeBasePath] = new URL(scriptEl.src).pathname.split('/scripts/scripts.js');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
    }
  }
}

/**
 * Auto initializiation.
 */
async function init() {
  setup();
  sampleRUM();
}

init();

const withPlugin = window.hlx.plugins.add.bind(window.hlx.plugins);
const withTemplate = window.hlx.templates.add.bind(window.hlx.templates);

export {
  buildBlock,
  createOptimizedPicture,
  decorateBlock,
  decorateBlocks,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateTemplateAndTheme,
  fetchPlaceholders,
  getMetadata,
  loadBlock,
  loadCSS,
  loadFooter,
  loadHeader,
  loadScript,
  loadSection,
  loadSections,
  readBlockConfig,
  sampleRUM,
  setup,
  toCamelCase,
  toClassName,
  waitForFirstImage,
  wrapTextNodes,
  withPlugin,
  withTemplate,
  dispatchAsyncEvent,
};
