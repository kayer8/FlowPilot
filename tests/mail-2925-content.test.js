const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('content/mail-2925.js', 'utf8');

test('ensureMail2925Session waits at most 40 seconds for mailbox after clicking login', () => {
  assert.match(source, /waitForMail2925View\('mailbox',\s*40000\)/);
});

test('ensureMail2925Session waits 1 second after filling credentials before clicking login', () => {
  assert.match(source, /fillInput\(passwordInput,\s*password\);[\s\S]*?await sleep\(200\);[\s\S]*?await sleep\(1000\);[\s\S]*?simulateClick\(loginButton\);/);
});

test('detectMail2925ViewState treats top mailbox email as mailbox view', () => {
  const bundle = [
    extractFunction('normalizeNodeText'),
    extractFunction('isVisibleNode'),
    extractFunction('isMailItemNode'),
    extractFunction('resolveActionTarget'),
    extractFunction('findMailItems'),
    extractFunction('extractEmails'),
    extractFunction('getMail2925DisplayedMailboxEmail'),
    extractFunction('detectMail2925ViewState'),
  ].join('\n');

  const api = new Function(`
const MAIL_ITEM_SELECTORS = ['.mail-item'];
const MAIL_ITEM_SELECTOR_GROUP = '.mail-item';
const MAIL2925_REMEMBER_LOGIN_PATTERNS = [];
const MAIL2925_AGREEMENT_PATTERNS = [];
const document = {
  querySelectorAll(selector) {
    if (selector === '.mail-item') return [];
    if (selector === 'body *') return [headerEmail, wrongHeader];
    if (selector === '.right-header' || selector.includes('right-header')) return [headerEmail];
    if (selector.includes('[class*="user"]')) return [];
    return [];
  },
  body: {
    innerText: 'QLHazycoder qlhazycoder@2925.com tm1.openai.com@foo.example',
    textContent: 'QLHazycoder qlhazycoder@2925.com tm1.openai.com@foo.example',
  },
};
const window = {
  innerHeight: 900,
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
};
const headerEmail = {
  hidden: false,
  textContent: 'qlhazycoder@2925.com',
  innerText: 'qlhazycoder@2925.com',
  getBoundingClientRect() { return { top: 40, left: 400, width: 120, height: 20 }; },
  closest() { return null; },
};
const wrongHeader = {
  hidden: false,
  textContent: 'tm1.openai.com@foo.example',
  innerText: 'tm1.openai.com@foo.example',
  getBoundingClientRect() { return { top: 48, left: 430, width: 150, height: 20 }; },
  closest() { return null; },
};
function detectMail2925LimitMessage() { return ''; }
function findMail2925LoginPasswordInput() { return null; }
function findMail2925LoginEmailInput() { return null; }
function getPageTextSample() { return 'qlhazycoder@2925.com'; }
${bundle}
return { detectMail2925ViewState };
`)();

  const state = api.detectMail2925ViewState();
  assert.equal(state.view, 'mailbox');
  assert.equal(state.mailboxEmail, 'qlhazycoder@2925.com');
});

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
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
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

function buildExtractVerificationCodeBundle() {
  return [
    extractFunction('normalizeRulePatternList'),
    extractFunction('normalizeRegexFlags'),
    extractFunction('buildGlobalSearchRegex'),
    extractFunction('getCodeCandidateFromMatch'),
    extractFunction('findSafeCodeByPattern'),
    extractFunction('extractCodeByRulePatterns'),
    extractFunction('extractLegacyStrictVerificationCode'),
    extractFunction('isLikelyCompactTimeValue'),
    extractFunction('isLikelyHeaderTimestampCode'),
    extractFunction('hasVerificationContextNear'),
    extractFunction('isLikelyPageNoiseCode'),
    extractFunction('isCandidateInsideLongDigitSequence'),
    extractFunction('isEmailTokenChar'),
    extractFunction('isCandidateInsideEmailAddress'),
    extractFunction('isSafeVerificationCodeCandidate'),
    extractFunction('findSafeStandaloneSixDigitCode'),
    extractFunction('extractContextualVerificationCode'),
    extractFunction('extractVerificationCode'),
  ].join('\n');
}

test('handlePollEmail establishes a baseline after opening from detail view and only picks mail from a later refresh', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'detail';
let refreshCalls = 0;
const clickOrder = [];
const readAndDeleteCalls = [];
const seenCodes = new Set();
const deletedMailIds = new Set();
const baselineMail = { id: 'baseline', text: 'OpenAI newsletter without code' };
const newMail = { id: 'new', text: 'OpenAI verification code 654321' };

function findMailItems() {
  const items = [];
  if (state === 'detail') return items;
  if (state === 'baseline' || state === 'with-new') {
    if (!deletedMailIds.has('baseline')) {
      items.push(baselineMail);
    }
  }
  if (state === 'with-new' && !deletedMailIds.has('new')) {
    items.push(newMail);
  }
  return items;
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /openai|verification/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}

async function returnToInbox() {
  clickOrder.push('inbox');
  if (state === 'detail') {
    state = 'baseline';
  }
  return true;
}

async function refreshInbox() {
  clickOrder.push('refresh');
  refreshCalls += 1;
  if (refreshCalls >= 2) {
    state = 'with-new';
  }
}

async function openMailAndDeleteAfterRead(item) {
  readAndDeleteCalls.push(item.id);
  deletedMailIds.add(item.id);
  return item.id === 'new' ? 'Your ChatGPT code is 654321' : 'No code here';
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getClickOrder() {
    return clickOrder.slice();
  },
  getReadAndDeleteCalls() {
    return readAndDeleteCalls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 2,
    intervalMs: 1,
  });

  assert.equal(result.code, '654321');
  assert.deepEqual(api.getClickOrder(), ['inbox', 'refresh', 'inbox', 'refresh']);
  assert.deepEqual(api.getReadAndDeleteCalls(), ['baseline', 'new']);
});

test('handlePollEmail refreshes immediately after a matching 2925 mail has no code', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'empty';
let refreshCalls = 0;
let longSleepCalls = 0;
let discardWaitCalls = 0;
const readAndDeleteCalls = [];
const seenCodes = new Set();
const firstMail = { id: 'first', text: 'OpenAI security notice without code' };
const secondMail = { id: 'second', text: 'OpenAI verification code' };

function findMailItems() {
  if (state === 'empty') {
    return [];
  }
  return state === 'second' ? [secondMail] : [firstMail];
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /openai|verification|notice/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep(ms = 0) {
  if (ms === 5000) {
    discardWaitCalls += 1;
  }
}
async function sleepRandom(minMs) {
  if (minMs >= 10000) {
    longSleepCalls += 1;
  }
}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  return true;
}
async function refreshInbox() {
  refreshCalls += 1;
  if (refreshCalls >= 2) {
    state = 'second';
  } else {
    state = 'first';
  }
}
async function openMailAndDeleteAfterRead(item) {
  readAndDeleteCalls.push(item.id);
  return item.id === 'second' ? 'Enter this code 778899' : 'No code in this OpenAI notice';
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getRefreshCalls() {
    return refreshCalls;
  },
  getLongSleepCalls() {
    return longSleepCalls;
  },
  getDiscardWaitCalls() {
    return discardWaitCalls;
  },
  getReadAndDeleteCalls() {
    return readAndDeleteCalls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification', 'notice'],
    maxAttempts: 2,
    intervalMs: 15000,
  });

  assert.equal(result.code, '778899');
  assert.equal(api.getRefreshCalls(), 2);
  assert.equal(api.getLongSleepCalls(), 0);
  assert.equal(api.getDiscardWaitCalls(), 1);
  assert.deepEqual(api.getReadAndDeleteCalls(), ['first', 'second']);
});

test('handlePollEmail deletes the first step 10 2925 mail when it has no code', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'empty';
let refreshCalls = 0;
const calls = [];
const seenCodes = new Set();
const deletedMailIds = new Set();
const firstMail = { id: 'first', text: 'OpenAI security notice without code' };
const secondMail = { id: 'second', text: 'OpenAI verification code' };

function findMailItems() {
  if (state === 'empty') {
    return [];
  }
  const items = [];
  if (!deletedMailIds.has('first') && state !== 'second-only') {
    items.push(firstMail);
  }
  if (state === 'second' || state === 'second-only') {
    items.push(secondMail);
  }
  return items;
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /openai|verification|notice/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  calls.push('inbox');
  return true;
}
async function refreshInbox() {
  calls.push('refresh');
  refreshCalls += 1;
  if (refreshCalls === 1) {
    state = 'second';
  } else {
    state = 'second-only';
  }
}
async function openMailAndGetMessageText(item) {
  calls.push(\`open:\${item.id}\`);
  return item.id === 'second' ? 'Enter this code 778899' : 'No code in this OpenAI notice';
}
async function openMailAndDeleteAfterRead(item) {
  calls.push(\`delete-after-read:\${item.id}\`);
  return item.text;
}
async function deleteDiscardedFirstMailWithoutCode(mailId) {
  calls.push(\`delete:\${mailId}\`);
  deletedMailIds.add(mailId);
  return { deleted: true };
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(8, {
    visibleStep: 10,
    senderFilters: ['openai'],
    subjectFilters: ['verification', 'notice'],
    maxAttempts: 2,
    intervalMs: 15000,
  });

  assert.equal(result.code, '778899');
  assert.deepEqual(api.getCalls(), [
    'inbox',
    'refresh',
    'open:first',
    'delete:first',
    'inbox',
    'refresh',
    'open:second',
  ]);
});

test('handlePollEmail keeps the first step 10 mail when the code is recognized', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
const calls = [];
const seenCodes = new Set();
const firstMail = { id: 'first', text: 'OpenAI verification code' };

function findMailItems() {
  return [firstMail];
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /openai|verification/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  calls.push('inbox');
  return true;
}
async function refreshInbox() {
  calls.push('refresh');
}
async function openMailAndGetMessageText(item) {
  calls.push(\`open:\${item.id}\`);
  return 'OpenAI\\nEnter this code to continue\\n778899';
}
async function openMailAndDeleteAfterRead(item) {
  calls.push(\`delete-after-read:\${item.id}\`);
  return item.text;
}
async function deleteDiscardedFirstMailWithoutCode(mailId) {
  calls.push(\`delete:\${mailId}\`);
  return { deleted: true };
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(8, {
    visibleStep: 10,
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 1,
    intervalMs: 15000,
  });

  assert.equal(result.code, '778899');
  assert.deepEqual(api.getCalls(), ['inbox', 'refresh', 'open:first']);
});

test('handlePollEmail keeps ignoring targetEmail when receive-mode matching is disabled', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'empty';
const seenCodes = new Set();
const readAndDeleteCalls = [];
const matchingMail = {
  id: 'mail-1',
  text: 'ChatGPT verification code 112233 for another.user@example.com',
};

function findMailItems() {
  return state === 'ready' ? [matchingMail] : [];
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /chatgpt|openai|verification/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  return true;
}
async function refreshInbox() {
  state = 'ready';
}

async function openMailAndDeleteAfterRead(item) {
  readAndDeleteCalls.push(item.id);
  return item.text;
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getReadAndDeleteCalls() {
    return readAndDeleteCalls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(8, {
    senderFilters: ['chatgpt'],
    subjectFilters: ['verification'],
    maxAttempts: 4,
    intervalMs: 1,
    targetEmail: 'expected@example.com',
    mail2925MatchTargetEmail: false,
  });

  assert.equal(result.code, '112233');
  assert.deepEqual(api.getReadAndDeleteCalls(), ['mail-1']);
});

test('handlePollEmail skips explicit mismatched target emails when receive-mode matching is enabled', async () => {
  const bundle = [
    extractFunction('extractEmails'),
    extractFunction('normalizeTargetEmailHints'),
    extractFunction('extractForwardedTargetEmails'),
    extractFunction('emailMatchesTarget'),
    extractFunction('getTargetEmailMatchState'),
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'ready';
const seenCodes = new Set();
const readAndDeleteCalls = [];
const deletedMailIds = new Set();
const mismatchMail = {
  id: 'mail-1',
  text: 'ChatGPT verification code 112233 for another.user@example.com',
};
const targetMail = {
  id: 'mail-2',
  text: 'ChatGPT verification code 445566 for expected@example.com',
};

function findMailItems() {
  if (state !== 'ready') {
    return [];
  }
  return [mismatchMail, targetMail].filter((item) => !deletedMailIds.has(item.id));
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp() {
  return Date.now();
}

function matchesMailFilters(text) {
  return /chatgpt|openai|verification/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  return true;
}
async function refreshInbox() {}

async function openMailAndDeleteAfterRead(item) {
  readAndDeleteCalls.push(item.id);
  deletedMailIds.add(item.id);
  return item.text;
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getReadAndDeleteCalls() {
    return readAndDeleteCalls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(8, {
    senderFilters: ['chatgpt'],
    subjectFilters: ['verification'],
    maxAttempts: 2,
    intervalMs: 1,
    targetEmail: 'expected@example.com',
    mail2925MatchTargetEmail: true,
  });

  assert.equal(result.code, '445566');
  assert.deepEqual(api.getReadAndDeleteCalls(), ['mail-1', 'mail-2']);
});

test('getTargetEmailMatchState decodes generic forwarded bounce aliases without OpenAI-specific domains', () => {
  const bundle = [
    extractFunction('extractEmails'),
    extractFunction('normalizeTargetEmailHints'),
    extractFunction('extractForwardedTargetEmails'),
    extractFunction('emailMatchesTarget'),
    extractFunction('getTargetEmailMatchState'),
  ].join('\n');

  const api = new Function(`
${bundle}
return { getTargetEmailMatchState };
`)();

  const state = api.getTargetEmailMatchState(
    'Return-Path: <bounce+notice-expected.user=example.com@mailer.forwarder.net>',
    'expected.user@example.com',
    {
      targetEmailHints: ['expected.user@example.com', 'expected.user=example.com'],
    }
  );

  assert.deepEqual(state, {
    matches: true,
    hasExplicitEmail: true,
  });
});

test('handlePollEmail only accepts 2925 mails inside the fixed lookback window', async () => {
  const bundle = [
    extractFunction('normalizeMinuteTimestamp'),
    extractFunction('refreshInboxAfterDiscardedFirstMail'),
    extractFunction('handlePollEmail'),
  ].join('\n');

  const api = new Function(`
let state = 'ready';
const seenCodes = new Set();
const readAndDeleteCalls = [];
const deletedMailIds = new Set();
const oldMail = {
  id: 'mail-old',
  text: 'OpenAI verification code 111111',
  timestamp: 1000,
};
const windowMail = {
  id: 'mail-window',
  text: 'OpenAI verification code 222222',
  timestamp: 301000,
};

function findMailItems() {
  if (state !== 'ready') {
    return [];
  }
  return [oldMail, windowMail].filter((item) => !deletedMailIds.has(item.id));
}

function getMailItemId(item) {
  return item.id;
}

function getCurrentMailIds(items = []) {
  return new Set(items.map((item) => item.id));
}

function parseMailItemTimestamp(item) {
  return item.timestamp;
}

function matchesMailFilters(text) {
  return /openai|verification/i.test(String(text || ''));
}

function getMailItemText(item) {
  return item.text;
}

function extractVerificationCode(text) {
  const match = String(text || '').match(/(\\d{6})/);
  return match ? match[1] : null;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}
async function returnToInbox() {
  return true;
}
async function refreshInbox() {}

async function openMailAndDeleteAfterRead(item) {
  readAndDeleteCalls.push(item.id);
  deletedMailIds.add(item.id);
  return item.text;
}

async function ensureSeenCodesSession() {}
function persistSeenCodes() {}
function log() {}

${bundle}

return {
  handlePollEmail,
  getReadAndDeleteCalls() {
    return readAndDeleteCalls.slice();
  },
};
`)();

  const result = await api.handlePollEmail(4, {
    senderFilters: ['openai'],
    subjectFilters: ['verification'],
    maxAttempts: 2,
    intervalMs: 1,
    filterAfterTimestamp: 120000,
  });

  assert.equal(result.code, '222222');
  assert.deepEqual(api.getReadAndDeleteCalls(), ['mail-old', 'mail-window']);
});

test('ensureSeenCodesSession resets tried codes only when a new verification step session starts', async () => {
  const bundle = [
    extractFunction('buildSeenCodeSessionKey'),
    extractFunction('ensureSeenCodesSession'),
  ].join('\n');

  const api = new Function(`
let seenCodes = new Set(['111111']);
let seenCodeSessionKey = '';
let seenCodesReadyPromise = Promise.resolve();
const persisted = [];

async function persistSeenCodes() {
  persisted.push({
    sessionKey: seenCodeSessionKey,
    codes: [...seenCodes],
  });
}

${bundle}

return {
  ensureSeenCodesSession,
  getSeenCodes() {
    return [...seenCodes];
  },
  getSessionKey() {
    return seenCodeSessionKey;
  },
  getPersisted() {
    return persisted.slice();
  },
};
`)();

  await api.ensureSeenCodesSession(4, { filterAfterTimestamp: 1000 });
  assert.equal(api.getSessionKey(), '4:1000');
  assert.deepEqual(api.getSeenCodes(), []);

  await api.ensureSeenCodesSession(4, { filterAfterTimestamp: 1000 });
  assert.deepEqual(api.getPersisted(), [
    { sessionKey: '4:1000', codes: [] },
  ]);

  await api.ensureSeenCodesSession(8, { filterAfterTimestamp: 2000 });
  assert.equal(api.getSessionKey(), '8:2000');
  assert.deepEqual(api.getPersisted(), [
    { sessionKey: '4:1000', codes: [] },
    { sessionKey: '8:2000', codes: [] },
  ]);
});

test('extractVerificationCode strict mode matches the new suspicious log-in mail body', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = 'ChatGPT Log-in Code\nWe noticed a suspicious log-in on your account. If that was you, enter this code:\n\n982219';
  assert.equal(api.extractVerificationCode(bodyText, true), '982219');
  assert.equal(api.extractVerificationCode(bodyText, false), '982219');
});

test('extractVerificationCode supports runtime mail rule patterns', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = 'System alert\nUse verification pin A-556677 to continue.';
  assert.equal(
    api.extractVerificationCode(bodyText, {
      codePatterns: [{ source: 'pin\\s+A-(\\d{6})', flags: 'i' }],
    }),
    '556677'
  );
});

test('extractVerificationCode ignores compact header time before fallback code', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = [
    'Your temporary ChatGPT login code',
    'From: otp <otp@tm1.openai.com>',
    'To: test@example.com',
    'Time: 2026-4-22 101755',
    'OpenAI',
    '371138',
  ].join('\n');

  assert.equal(api.extractVerificationCode(bodyText, false), '371138');
});

test('extractVerificationCode ignores 2925 page noise numbers without verification context', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = [
    '2925 mail page',
    'mail list inbox delete refresh',
    'time 202167',
    'return next message',
  ].join('\n');

  assert.equal(api.extractVerificationCode(bodyText, { requireContext: true }), null);
});

test('extractVerificationCode still accepts standalone OpenAI codes near verification context', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = [
    'OpenAI',
    'Use this verification code to continue.',
    '371138',
  ].join('\n');

  assert.equal(api.extractVerificationCode(bodyText, { requireContext: true }), '371138');
});

test('extractVerificationCode accepts OpenAI code after a long strong prompt block', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = [
    '2925 mail page',
    'OpenAI',
    '输入此临时验证码以继续',
    '这段内容模拟 2925 邮箱正文 DOM 中夹杂的按钮、空白、说明文字和布局文本，不包含任何数字。'.repeat(6),
    '137625',
    '如果你未尝试关联电子邮件地址，请忽略此邮件。',
  ].join('\n');

  assert.equal(api.extractVerificationCode(bodyText, { requireContext: true }), '137625');
});

test('extractVerificationCode ignores OpenAI bounce header code and returns the mail body code', () => {
  const bundle = buildExtractVerificationCodeBundle();

  const api = new Function(`
${bundle}
return { extractVerificationCode };
`)();

  const bodyText = [
    '你的 OpenAI 临时验证码',
    '发件人: noreply <noreply@tm.openai.com> (由 bounces+20216706-7f1f-zhzhantao58dt47=2925.com@em7877.tm.openai.com 代发)',
    '收件人: zhzhantao58dt47 <zhzhantao58dt47@2925.com>',
    '时间: 2026-06-18 13:37:36',
    'OpenAI',
    '输入此临时验证码以继续:',
    '137625',
    '如果你未尝试将电子邮件地址关联到你的帐户，请忽略此电子邮件。',
  ].join('\n');

  assert.equal(
    api.extractVerificationCode(bodyText, {
      requireContext: true,
      codePatterns: [
        {
          source: 'OpenAI[\\s\\S]{0,160}?(\\d{6})',
          flags: 'i',
        },
        {
          source: '(?:verification\\s+code|temporary\\s+verification\\s+code|your\\s+chatgpt\\s+code|code(?:\\s+is)?)[^0-9]{0,16}(\\d{6})',
          flags: 'i',
        },
      ],
    }),
    '137625'
  );
});

test('openMailAndGetMessageText always returns to inbox after opening a 2925 message', async () => {
  const bundle = [
    extractFunction('normalizeNodeText'),
    extractFunction('getCurrentPageText'),
    extractFunction('buildOpenMailReadContext'),
    extractFunction('isOpenedMailTextReady'),
    extractFunction('waitForOpenedMailText'),
    extractFunction('returnToInbox'),
    extractFunction('openMailAndGetMessageText'),
  ].join('\n');

  const api = new Function(`
const clickOrder = [];
const mailItem = { kind: 'mail' };
let listVisible = true;
let bodyText = '';

const document = {
  body: {
    get textContent() {
      return bodyText;
    },
  },
};

function findMailItems() {
  return listVisible ? [mailItem] : [];
}

function getMailItemText() {
  return 'ChatGPT code preview';
}

function isMailboxLoading() {
  return false;
}

function findInboxLink() {
  return { kind: 'inbox' };
}

function simulateClick(node) {
  if (node === mailItem) {
    clickOrder.push('mail');
    listVisible = false;
    bodyText = 'Your ChatGPT code is 731091';
    return;
  }
  clickOrder.push('inbox');
  listVisible = true;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: items.length > 0, items, empty: items.length === 0 };
}

${bundle}

return {
  mailItem,
  openMailAndGetMessageText,
  getClickOrder() {
    return clickOrder.slice();
  },
  isListVisible() {
    return listVisible;
  },
};
`)();

  const text = await api.openMailAndGetMessageText(api.mailItem);

  assert.match(text, /731091/);
  assert.deepEqual(api.getClickOrder(), ['mail', 'inbox']);
  assert.equal(api.isListVisible(), true);
});

test('openMailAndDeleteAfterRead deletes the opened message before returning to inbox', async () => {
  const bundle = [
    extractFunction('normalizeNodeText'),
    extractFunction('getCurrentPageText'),
    extractFunction('buildOpenMailReadContext'),
    extractFunction('isOpenedMailTextReady'),
    extractFunction('waitForOpenedMailText'),
    extractFunction('deleteCurrentMailboxEmail'),
    extractFunction('returnToInbox'),
    extractFunction('openMailAndDeleteAfterRead'),
  ].join('\n');

  const api = new Function(`
const calls = [];
const mailItem = { kind: 'mail' };
const deleteButton = { kind: 'delete' };
let listVisible = true;
let bodyText = '';

const document = {
  body: {
    get textContent() {
      return bodyText;
    },
  },
};

function findMailItems() {
  return listVisible ? [mailItem] : [];
}

function getMailItemText() {
  return 'ChatGPT code preview';
}

function isMailboxLoading() {
  return false;
}

function findDeleteButton() {
  return deleteButton;
}

function findInboxLink() {
  return { kind: 'inbox' };
}

function simulateClick(node) {
  if (node === mailItem) {
    calls.push('mail');
    listVisible = false;
    bodyText = 'Your ChatGPT code is 778899';
    return;
  }
  if (node === deleteButton) {
    calls.push('delete');
    return;
  }
  calls.push('inbox');
  listVisible = true;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: items.length > 0, items, empty: items.length === 0 };
}
const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  mailItem,
  openMailAndDeleteAfterRead,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const text = await api.openMailAndDeleteAfterRead(api.mailItem, 8);

  assert.match(text, /778899/);
  assert.deepEqual(api.getCalls(), ['mail', 'delete', 'inbox']);
});

test('openMailAndDeleteAfterRead skips deleting when opened message never finishes loading', async () => {
  const bundle = [
    extractFunction('normalizeNodeText'),
    extractFunction('getCurrentPageText'),
    extractFunction('buildOpenMailReadContext'),
    extractFunction('isOpenedMailTextReady'),
    extractFunction('waitForOpenedMailText'),
    extractFunction('deleteCurrentMailboxEmail'),
    extractFunction('returnToInbox'),
    extractFunction('openMailAndDeleteAfterRead'),
  ].join('\n');

  const api = new Function(`
const calls = [];
const mailItem = { kind: 'mail' };
const deleteButton = { kind: 'delete' };
let listVisible = true;
let bodyText = 'Inbox shell';

const document = {
  body: {
    get textContent() {
      return bodyText;
    },
  },
};

function findMailItems() {
  return listVisible ? [mailItem] : [];
}

function getMailItemText() {
  return 'ChatGPT code preview';
}

function isMailboxLoading() {
  return true;
}

function findDeleteButton() {
  return deleteButton;
}

function findInboxLink() {
  return { kind: 'inbox' };
}

function simulateClick(node) {
  if (node === mailItem) {
    calls.push('mail');
    listVisible = false;
    bodyText = 'Loading message... 202167';
    return;
  }
  if (node === deleteButton) {
    calls.push('delete');
    return;
  }
  calls.push('inbox');
  listVisible = true;
}

async function sleep() {}
async function sleepRandom() {}
async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: items.length > 0, items, empty: items.length === 0 };
}
const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  mailItem,
  openMailAndDeleteAfterRead,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const text = await api.openMailAndDeleteAfterRead(api.mailItem, 8);

  assert.match(text, /202167/);
  assert.deepEqual(api.getCalls(), ['mail', 'inbox']);
});

test('deleteDiscardedFirstMailWithoutCode deletes the first visible row when the original id changed', async () => {
  const bundle = [
    extractFunction('waitForMailItemMissing'),
    extractFunction('deleteDiscardedFirstMailWithoutCode'),
  ].join('\n');

  const api = new Function(`
const calls = [];
let mailboxCleared = false;
const firstMail = { id: 'first-after-read' };

async function returnToInbox() {
  calls.push('inbox');
  return true;
}

async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}

function findMailItems() {
  return mailboxCleared ? [] : [firstMail];
}

function getMailItemId(item) {
  return item.id;
}

function findMailItemSelectionControl() {
  return null;
}

function findDeleteButton() {
  return null;
}

async function openMailAndDeleteAfterRead(item) {
  calls.push(\`open-delete:\${item.id}\`);
  mailboxCleared = true;
  return 'OpenAI notice without code';
}

async function sleep() {}
async function sleepRandom() {}

const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  deleteDiscardedFirstMailWithoutCode,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.deleteDiscardedFirstMailWithoutCode('first-before-read', 8);

  assert.equal(result.deleted, true);
  assert.equal(result.missing, false);
  assert.deepEqual(api.getCalls(), ['inbox', 'open-delete:first-after-read']);
});

test('deleteAllMailboxEmails selects all messages and clicks delete', async () => {
  const bundle = extractFunction('deleteAllMailboxEmails');

  const api = new Function(`
const calls = [];
const selectAllControl = { kind: 'select-all' };
const deleteButton = { kind: 'delete' };
let mailboxCleared = false;

async function returnToInbox() {
  calls.push('inbox');
  return true;
}

function findMailItems() {
  return mailboxCleared ? [] : [{ id: 'mail-1' }];
}

async function waitForMailboxReady() {
  const items = findMailItems();
  return { ready: true, items, empty: items.length === 0 };
}

function findSelectAllControl() {
  return selectAllControl;
}

function isCheckboxChecked() {
  return false;
}

function findDeleteButton() {
  return deleteButton;
}

function simulateClick(node) {
  if (node === selectAllControl) {
    calls.push('select-all');
    return;
  }
  if (node === deleteButton) {
    calls.push('delete');
    mailboxCleared = true;
    return;
  }
  throw new Error('unexpected node');
}

async function sleep() {}
async function sleepRandom() {}

const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  deleteAllMailboxEmails,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.deleteAllMailboxEmails(4);

  assert.deepEqual(result, { deleted: true, empty: true });
  assert.deepEqual(api.getCalls(), ['inbox', 'select-all', 'delete']);
});

test('deleteAllMailboxEmails treats an already empty inbox as cleared', async () => {
  const bundle = extractFunction('deleteAllMailboxEmails');

  const api = new Function(`
const calls = [];

async function returnToInbox() {
  calls.push('inbox');
  return true;
}

async function waitForMailboxReady() {
  return { ready: false, items: [], empty: true };
}

function findMailItems() {
  return [];
}

function isMailListDomReady() {
  return true;
}

function isLikelyMail2925MailboxPage() {
  return true;
}

function isMailboxLoading() {
  return false;
}

function isMailboxEmptyStateVisible() {
  return true;
}

function findSelectAllControl() {
  calls.push('unexpected-select-all');
  return null;
}

function findDeleteButton() {
  calls.push('unexpected-delete');
  return null;
}

async function sleep() {}
async function sleepRandom() {}

const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  deleteAllMailboxEmails,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.deleteAllMailboxEmails(9);

  assert.deepEqual(result, { deleted: false, empty: true, alreadyEmpty: true, noMessages: true });
  assert.deepEqual(api.getCalls(), ['inbox']);
});

test('deleteAllMailboxEmails treats missing delete controls on visible empty inbox as cleared', async () => {
  const bundle = extractFunction('deleteAllMailboxEmails');

  const api = new Function(`
const calls = [];

async function returnToInbox() {
  calls.push('inbox');
  return true;
}

async function waitForMailboxReady() {
  return { ready: true, items: [{ id: 'stale-row' }], empty: false };
}

function findMailItems() {
  return [];
}

function findSelectAllControl() {
  calls.push('select-all-check');
  return null;
}

function isMailboxEmptyStateVisible() {
  return true;
}

async function sleep() {}
async function sleepRandom() {}

const console = { warn() {} };
const MAIL2925_PREFIX = '[MultiPage:mail-2925]';

${bundle}

return {
  deleteAllMailboxEmails,
  getCalls() {
    return calls.slice();
  },
};
`)();

  const result = await api.deleteAllMailboxEmails(9);

  assert.deepEqual(result, { deleted: false, empty: true, alreadyEmpty: true, noMessages: true });
  assert.deepEqual(api.getCalls(), ['inbox', 'select-all-check']);
});

test('findAgreementCheckbox skips 30-day login checkbox and picks agreement checkbox', async () => {
  const bundle = [
    extractFunction('normalizeNodeText'),
    extractFunction('isVisibleNode'),
    extractFunction('resolveActionTarget'),
    extractFunction('findAgreementContainer'),
    extractFunction('isAgreementText'),
    extractFunction('getCheckboxContextText'),
    extractFunction('findAgreementCheckbox'),
  ].join('\n');

  const api = new Function(`
const MAIL2925_REMEMBER_LOGIN_PATTERNS = [
  /30天内免登录/,
  /免登录/,
  /记住登录/,
  /保持登录/,
];
const MAIL2925_AGREEMENT_PATTERNS = [
  /我已阅读并同意/,
  /服务协议/,
  /隐私政策/,
];

const rememberCheckbox = {
  kind: 'remember-checkbox',
  disabled: false,
  readOnly: false,
  hidden: false,
  classList: { contains() { return false; } },
  getBoundingClientRect() { return { width: 14, height: 14 }; },
  closest(selector) {
    if (selector === 'button, [role="button"], a, label, .el-checkbox, .el-checkbox__input') return this;
    if (selector === 'label') return rememberLabel;
    if (selector === 'label, div, span, p, li, form') return rememberLabel;
    return null;
  },
};
const agreementCheckbox = {
  kind: 'agreement-checkbox',
  disabled: false,
  readOnly: false,
  hidden: false,
  classList: { contains() { return false; } },
  getBoundingClientRect() { return { width: 14, height: 14 }; },
  closest(selector) {
    if (selector === 'button, [role="button"], a, label, .el-checkbox, .el-checkbox__input') return this;
    if (selector === 'label') return agreementLabel;
    if (selector === 'label, div, span, p, li, form') return agreementLabel;
    return null;
  },
};
const rememberLabel = {
  innerText: '30天内免登录',
  textContent: '30天内免登录',
  hidden: false,
  getBoundingClientRect() { return { width: 100, height: 20 }; },
  parentElement: null,
};
const agreementLabel = {
  innerText: '我已阅读并同意 《服务协议》 和 《隐私政策》',
  textContent: '我已阅读并同意 《服务协议》 和 《隐私政策》',
  hidden: false,
  getBoundingClientRect() { return { width: 220, height: 24 }; },
  parentElement: null,
  querySelector(selector) {
    return selector.includes('checkbox') ? agreementCheckbox : null;
  },
};
rememberCheckbox.parentElement = rememberLabel;
agreementCheckbox.parentElement = agreementLabel;

const document = {
  querySelectorAll(selector) {
    if (selector === 'label, div, span, p, form') {
      return [rememberLabel, agreementLabel];
    }
    if (selector === 'input[type="checkbox"], [role="checkbox"], .ivu-checkbox, .el-checkbox') {
      return [rememberCheckbox, agreementCheckbox];
    }
    return [];
  },
};

const window = {
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
};

${bundle}

return {
  findAgreementCheckbox,
  rememberCheckbox,
  agreementCheckbox,
};
`)();

  assert.equal(api.findAgreementCheckbox(), api.agreementCheckbox);
});

test('ensureAgreementChecked clicks all visible login checkboxes', async () => {
  const bundle = [
    extractFunction('isVisibleNode'),
    extractFunction('resolveActionTarget'),
    extractFunction('isCheckboxChecked'),
    extractFunction('ensureAgreementChecked'),
  ].join('\n');

  const api = new Function(`
const rememberCheckbox = {
  disabled: false,
  readOnly: false,
  hidden: false,
  checked: false,
  classList: { contains() { return false; } },
  getBoundingClientRect() { return { width: 14, height: 14 }; },
  click() { this.checked = true; },
  closest(selector) {
    if (selector === 'button, [role="button"], a, label, .el-checkbox, .el-checkbox__input') return this;
    return null;
  },
  querySelector() { return null; },
  getAttribute(name) {
    if (name === 'aria-checked') return this.checked ? 'true' : 'false';
    return '';
  },
};
const agreementCheckbox = {
  disabled: false,
  readOnly: false,
  hidden: false,
  checked: false,
  classList: { contains() { return false; } },
  getBoundingClientRect() { return { width: 14, height: 14 }; },
  click() { this.checked = true; },
  closest(selector) {
    if (selector === 'button, [role="button"], a, label, .el-checkbox, .el-checkbox__input') return this;
    return null;
  },
  querySelector() { return null; },
  getAttribute(name) {
    if (name === 'aria-checked') return this.checked ? 'true' : 'false';
    return '';
  },
};

const document = {
  querySelectorAll(selector) {
    if (selector === 'input[type="checkbox"], [role="checkbox"], .ivu-checkbox, .el-checkbox') {
      return [rememberCheckbox, agreementCheckbox];
    }
    return [];
  },
};

const window = {
  getComputedStyle() {
    return { display: 'block', visibility: 'visible' };
  },
};

const operationDelayCalls = [];

async function sleep() {}
function simulateClick(node) {
  node.click();
}
async function performOperationWithDelay(metadata, operation) {
  operationDelayCalls.push({ label: metadata.label, kind: metadata.kind });
  return await operation();
}

${bundle}

return {
  rememberCheckbox,
  agreementCheckbox,
  operationDelayCalls,
  ensureAgreementChecked,
};
`)();

  const result = await api.ensureAgreementChecked();

  assert.equal(result, true);
  assert.equal(api.rememberCheckbox.checked, true);
  assert.equal(api.agreementCheckbox.checked, true);
  assert.deepStrictEqual(api.operationDelayCalls, [
    { label: 'mail2925-agreement-checkbox', kind: 'click' },
    { label: 'mail2925-agreement-checkbox', kind: 'click' },
  ]);
});
