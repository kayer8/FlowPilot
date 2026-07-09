const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.existsSync('content/xiaokapi-mail.js')
  ? fs.readFileSync('content/xiaokapi-mail.js', 'utf8')
  : '';

function extractFunction(name) {
  const markers = [`async function ${name}(`, `function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .find((index) => index >= 0);
  if (start < 0) {
    throw new Error(`missing function ${name}`);
  }

  let parenDepth = 0;
  let signatureEnded = false;
  let braceStart = -1;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (ch === '(') {
      parenDepth += 1;
    } else if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnded = true;
      }
    } else if (ch === '{' && signatureEnded) {
      braceStart = index;
      break;
    }
  }

  if (braceStart < 0) {
    throw new Error(`missing body for function ${name}`);
  }

  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  return source.slice(start, end);
}

test('chooseLatestMailItem sorts newest readable mail ahead of older entries', () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('parseXiaokapiTimestamp'),
    extractFunction('readNodeText'),
    extractFunction('getMailItemTimestamp'),
    extractFunction('chooseLatestMailItem'),
  ].join('\n');

  const api = new Function(`
${bundle}
return { chooseLatestMailItem };
`)();

  const older = {
    textContent: 'OpenAI old code 111111 2026-07-08 10:00',
    getAttribute() { return ''; },
    querySelectorAll() { return []; },
  };
  const newer = {
    textContent: 'OpenAI latest code 222222 2026-07-08 10:05',
    getAttribute() { return ''; },
    querySelectorAll() { return []; },
  };

  assert.equal(api.chooseLatestMailItem([older, newer]), newer);
});

test('handlePollEmail opens the mail tab, reads the latest mail body and extracts code', async () => {
  const bundle = [
    extractFunction('normalizeText'),
    extractFunction('normalizeRulePatternList'),
    extractFunction('extractCodeByRulePatterns'),
    extractFunction('extractVerificationCode'),
    extractFunction('matchesAnyKeyword'),
    extractFunction('readNodeText'),
    extractFunction('parseXiaokapiTimestamp'),
    extractFunction('getMailItemTimestamp'),
    extractFunction('isVisibleNode'),
    extractFunction('isLikelyMailTab'),
    extractFunction('findMailTab'),
    extractFunction('fillPasswordIfPresent'),
    extractFunction('ensureMailView'),
    extractFunction('isLikelyMailListItem'),
    extractFunction('findMailItems'),
    extractFunction('chooseLatestMailItem'),
    extractFunction('openMailItem'),
    extractFunction('collectOpenedMailTextCandidates'),
    extractFunction('readOpenedMailText'),
    extractFunction('getMailItemId'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
const MAIL_TAB_SELECTORS = 'button, a, [role="tab"], [role="menuitem"], [role="link"], .ant-menu-item, .el-menu-item';
const MAIL_ITEM_SELECTORS = '[role="row"], [role="listitem"], tr, li, .ant-table-row, .el-table__row, [class*="mail"], [class*="email"], [class*="message"]';
const BODY_TEXT_SELECTORS = [
  '[class*="content"]',
  '[class*="body"]',
  '[class*="detail"]',
  '[class*="message"]',
  '[class*="mail"]',
  '[role="main"]',
  'main',
  'article',
  '.ant-modal',
  '.el-dialog',
].join(', ');
let currentView = 'home';
const mailTab = {
  hidden: false,
  textContent: '邮件',
  getAttribute(name) {
    if (name === 'role') return 'tab';
    return '';
  },
  matches(selector) {
    return selector === 'button, a, [role="tab"], [role="menuitem"], [role="link"], .ant-menu-item, .el-menu-item';
  },
  closest() { return null; },
  getBoundingClientRect() { return { width: 40, height: 24 }; },
  click() { currentView = 'list'; },
};
const latestMail = {
  hidden: false,
  textContent: 'OpenAI Your temporary ChatGPT login code 2026-07-08 10:05',
  getAttribute(name) {
    if (name === 'data-testid') return 'mail-row-latest';
    return '';
  },
  matches(selector) {
    return selector === '[role="row"], [role="listitem"], tr, li, .ant-table-row, .el-table__row, [class*="mail"], [class*="email"], [class*="message"]';
  },
  querySelectorAll() { return []; },
  closest() { return null; },
  getBoundingClientRect() { return { width: 600, height: 48 }; },
  click() { currentView = 'detail'; },
};
const oldMail = {
  hidden: false,
  textContent: 'OpenAI old login code 111111 2026-07-08 09:00',
  getAttribute() { return ''; },
  matches(selector) { return latestMail.matches(selector); },
  querySelectorAll() { return []; },
  closest() { return null; },
  getBoundingClientRect() { return { width: 600, height: 48 }; },
  click() {},
};
const bodyNode = {
  innerText: 'Enter this temporary verification code to continue: 654321',
  textContent: 'Enter this temporary verification code to continue: 654321',
  getAttribute() { return ''; },
};
const document = {
  querySelectorAll(selector) {
    if (selector === 'button, a, [role="tab"], [role="menuitem"], [role="link"], .ant-menu-item, .el-menu-item') {
      return [mailTab];
    }
    if (selector === '[role="row"], [role="listitem"], tr, li, .ant-table-row, .el-table__row, [class*="mail"], [class*="email"], [class*="message"]') {
      return currentView === 'list' ? [oldMail, latestMail] : [];
    }
    if (selector === 'iframe') {
      return [];
    }
    if (currentView === 'detail') {
      return [bodyNode];
    }
    return [];
  },
  body: {
    innerText: '',
    textContent: '',
  },
};
const window = {
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
};
function simulateClick(element) { element.click(); }
async function sleep() {}
function log() {}

${bundle}

return { handlePollEmail, getView: () => currentView };
`)();

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['login code'],
    maxAttempts: 1,
    intervalMs: 1,
  });

  assert.equal(result.code, '654321');
  assert.equal(result.mailId, 'mail-row-latest');
  assert.equal(api.getView(), 'detail');
});
