const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML_PATH = path.join(ROOT, 'kat-plani-tasarim.html');
const WORKSPACE_APP_JS = path.join(ROOT, '.test-tmp', 'app.js');

function scriptSources() {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const chunks = [];
  const scriptRe = /<script(?:\s+src=["']([^"']+)["'])?\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html))) {
    if (match[1]) {
      const filename = path.join(ROOT, match[1]);
      chunks.push({ filename, source: fs.readFileSync(filename, 'utf8') });
    } else {
      chunks.push({ filename: HTML_PATH, source: match[2] });
    }
  }
  if (chunks.length) return chunks;

  throw new Error('kat-plani-tasarim.html icinde uygulama scripti bulunamadi');
}

function extractAppScript() {
  return scriptSources().map(s=>s.source).join('\n');
}

function checkSyntax(source) {
  // Parse only. The app script touches document at runtime, so executing it here is wrong.
  new Function(source);
}

function readAppScript() {
  if (process.env.APP_JS) return fs.readFileSync(process.env.APP_JS, 'utf8');
  return extractAppScript();
}

function prepareAppScript() {
  const source = extractAppScript();
  checkSyntax(source);

  fs.mkdirSync(path.dirname(WORKSPACE_APP_JS), { recursive: true });
  fs.writeFileSync(WORKSPACE_APP_JS, source);

  return { source, workspacePath: WORKSPACE_APP_JS };
}

if (require.main === module) {
  const result = prepareAppScript();
  if (process.argv.includes('--check')) {
    console.log('script syntax ok');
  } else {
    console.log(`app script hazir: ${result.workspacePath}`);
  }
}

module.exports = {
  ROOT,
  HTML_PATH,
  WORKSPACE_APP_JS,
  scriptSources,
  extractAppScript,
  readAppScript,
  checkSyntax,
  prepareAppScript
};
