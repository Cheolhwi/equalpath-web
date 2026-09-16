import { chromium } from '@playwright/test';
import config from '../playwright.config.mjs';

// Fail early with useful evidence instead of waiting for every scene test to time out.
const browser = await chromium.launch({
  channel: config.use.channel,
  headless: config.use.headless,
  ...config.use.launchOptions,
});
try {
  const page = await browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('The CI browser does not support WebGL 2.');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl.getParameter(gl.VERSION),
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
  console.log(JSON.stringify({ browser: browser.version(), ...renderer }));
} finally {
  await browser.close();
}
