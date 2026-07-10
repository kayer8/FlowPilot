const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sidepanelSource = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => sidepanelSource.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let i = start; i < sidepanelSource.length; i += 1) {
    const ch = sidepanelSource[i];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = i;
      break;
    }
  }

  let depth = 0;
  let end = braceStart;
  for (; end < sidepanelSource.length; end += 1) {
    const ch = sidepanelSource[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return sidepanelSource.slice(start, end);
}

test('sidepanel html keeps repo link and hides release update entry points', () => {
  const html = fs.readFileSync('sidepanel/sidepanel.html', 'utf8');

  assert.match(html, /id="btn-repo-home"/);
  assert.doesNotMatch(html, /id="extension-update-status"/);
  assert.doesNotMatch(html, /id="btn-release-log"/);
  assert.doesNotMatch(html, /id="update-section"/);
  assert.doesNotMatch(html, /<script src="update-service\.js"><\/script>/);
});

test('header link helper opens repository url without update service', () => {
  const bundle = [
    extractFunction('getRepositoryHomeUrl'),
    extractFunction('openRepositoryHomePage'),
  ].join('\n');

  const api = new Function(`
const opened = [];
function openExternalUrl(url) {
  opened.push(url);
}
${bundle}
return {
  getRepositoryHomeUrl,
  openRepositoryHomePage,
  getOpened() {
    return opened;
  },
};
`)();

  assert.equal(
    api.getRepositoryHomeUrl(),
    'https://github.com/QLHazyCoder/FlowPilot'
  );

  api.openRepositoryHomePage();

  assert.deepEqual(api.getOpened(), [
    'https://github.com/QLHazyCoder/FlowPilot',
  ]);
});
