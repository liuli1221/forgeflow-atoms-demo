/**
 * Code generator entry point: AppSpec -> source files.
 */
import { generateHtml } from './html.js';
import { generateCss } from './css.js';
import { generateJs } from './js.js';

export const FILE_ORDER = ['index.html', 'styles.css', 'app.js'];

const LINK_TAG = '<link rel="stylesheet" href="./styles.css" />';
const SCRIPT_TAG = '<script type="module" src="./app.js"></script>';

/**
 * @param {object} spec validated AppSpec
 * @returns {{'index.html':string,'styles.css':string,'app.js':string}}
 */
export function generateFiles(spec) {
  return {
    'index.html': generateHtml(spec),
    'styles.css': generateCss(spec),
    'app.js': generateJs(spec),
  };
}

/**
 * Inline the three files into one self-contained document for iframe srcdoc.
 *
 * The preview uses a *classic* script (not type="module") because the sandbox
 * gives the frame an opaque origin, where module resolution is unreliable. The
 * generated code uses no import/export, so both forms are valid.
 *
 * Safe because the generator escapes `<` inside the injected JSON, so the
 * embedded script can never terminate early.
 */
export function buildPreviewDocument(files) {
  const html = files['index.html'];
  return html
    .replace(LINK_TAG, '<style>\n' + files['styles.css'] + '\n</style>')
    .replace(SCRIPT_TAG, '<script>\n' + files['app.js'] + '\n</script>');
}

export function totalSize(files) {
  return Object.values(files).reduce((acc, content) => acc + content.length, 0);
}

export { generateHtml, generateCss, generateJs };
