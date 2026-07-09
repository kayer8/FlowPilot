const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('manifest registers Xiaokapi mail content script', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const script = manifest.content_scripts.find((entry) => (
    Array.isArray(entry.js) && entry.js.includes('content/xiaokapi-mail.js')
  ));

  assert.ok(script, 'should register xiaokapi mail content script');
  assert.equal(script.matches.includes('https://mail.xiaokapi.cn/*'), true);
  assert.ok(script.js.includes('content/utils.js'));
  assert.ok(
    script.js.indexOf('content/utils.js') < script.js.indexOf('content/xiaokapi-mail.js'),
    'content utils should load before xiaokapi mail script'
  );
});
