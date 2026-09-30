'use strict';

/* Daftar route GET yang benar-benar terdaftar di aplikasi. */
const { createApp } = require('../src/app');
const app = createApp();
const out = [];
function walk(stack, prefix) {
  for (const layer of stack) {
    if (layer.route) {
      for (const m of Object.keys(layer.route.methods)) {
        if (m === 'get') out.push(`${m.toUpperCase()} ${prefix}${layer.route.path}`);
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const src = layer.matchers?.[0]?.regexp?.source || '';
      const seg = src.replace('^\\/', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
      walk(layer.handle.stack, prefix + (seg && seg !== '^' ? '/' + seg.replace(/\$$/, '') : ''));
    }
  }
}
walk(app._router.stack, '');
console.log(out.sort().join('\n'));
console.log('\nTOTAL GET:', out.length);
