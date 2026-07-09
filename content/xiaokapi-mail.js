// content/xiaokapi-mail.js - Browser polling for https://mail.xiaokapi.cn/admin

const XIAOKAPI_PREFIX = '[MultiPage:xiaokapi-mail]';
const isTopFrame = window === window.top;

console.log(XIAOKAPI_PREFIX, 'Content script loaded on', location.href, 'frame:', isTopFrame ? 'top' : 'child');

if (!isTopFrame) {
  console.log(XIAOKAPI_PREFIX, 'Skipping child frame');
} else {

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLL_EMAIL') {
    resetStopState();
    handlePollEmail(message.step, message.payload).then((result) => {
      sendResponse(result);
    }).catch((err) => {
      if (isStopError(err)) {
        log(`步骤 ${message.step}：已被用户停止。`, 'warn');
        sendResponse({ stopped: true, error: err.message });
        return;
      }
      log(`步骤 ${message.step}：Xiaokapi 邮箱轮询失败：${err.message}`, 'warn');
      sendResponse({ error: err.message });
    });
    return true;
  }
});

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeRulePatternList(patterns = []) {
  return Array.isArray(patterns) ? patterns : [];
}

function extractCodeByRulePatterns(text, patterns = []) {
  const normalizedText = String(text || '');
  for (const pattern of normalizeRulePatternList(patterns)) {
    try {
      const source = String(pattern?.source || '').trim();
      if (!source) {
        continue;
      }
      const flags = String(pattern?.flags || '').replace(/[^dgimsuvy]/g, '');
      const match = normalizedText.match(new RegExp(source, flags));
      if (!match) {
        continue;
      }
      for (let index = 1; index < match.length; index += 1) {
        const candidate = String(match[index] || '').trim();
        if (candidate) {
          return candidate;
        }
      }
      if (String(match[0] || '').trim()) {
        return String(match[0] || '').trim();
      }
    } catch (_) {
      // Ignore invalid runtime rule patterns and continue with other candidates.
    }
  }
  return null;
}

function extractVerificationCode(text, options = {}) {
  const matchedByRule = extractCodeByRulePatterns(text, options?.codePatterns);
  if (matchedByRule) {
    return matchedByRule;
  }

  const normalizedText = String(text || '');
  const loginCode = normalizedText.match(/(?:log-?in\s+code|enter\s+this\s+code|verification\s+code|验证码|代码)[^0-9]{0,40}(\d{6})/i);
  if (loginCode) return loginCode[1];

  const codeIs = normalizedText.match(/code[:\s]+(?:is[:\s]+)?(\d{6})/i);
  if (codeIs) return codeIs[1];

  const sixDigits = normalizedText.match(/\b(\d{6})\b/);
  return sixDigits ? sixDigits[1] : null;
}

function matchesAnyKeyword(text, keywords = []) {
  const normalized = normalizeText(text).toLowerCase();
  return (Array.isArray(keywords) ? keywords : [])
    .map((keyword) => normalizeText(keyword).toLowerCase())
    .filter(Boolean)
    .some((keyword) => normalized.includes(keyword));
}

function readNodeText(node) {
  if (!node) return '';
  return normalizeText([
    node.getAttribute?.('aria-label'),
    node.getAttribute?.('title'),
    node.getAttribute?.('data-testid'),
    node.innerText,
    node.textContent,
  ].filter(Boolean).join(' '));
}

function parseXiaokapiTimestamp(rawText) {
  const text = normalizeText(rawText);
  if (!text) return 0;

  let match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (match) {
    const [, year, month, day, hour, minute, second = '0'] = match;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), 0).getTime();
  }

  match = text.match(/\b(\d{1,2})[-/.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (match) {
    const [, month, day, hour, minute, second = '0'] = match;
    const now = new Date();
    return new Date(now.getFullYear(), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), 0).getTime();
  }

  match = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (match) {
    const [, hour, minute, second = '0'] = match;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hour), Number(minute), Number(second), 0).getTime();
  }

  return 0;
}

function getMailItemTimestamp(item) {
  const direct = parseXiaokapiTimestamp(readNodeText(item));
  if (direct) return direct;

  const children = item?.querySelectorAll?.('[title], time, span, div, td') || [];
  for (const child of children) {
    const parsed = parseXiaokapiTimestamp(readNodeText(child));
    if (parsed) return parsed;
  }
  return 0;
}

function isVisibleNode(node) {
  if (!node || node.hidden) return false;
  const style = typeof window.getComputedStyle === 'function' ? window.getComputedStyle(node) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
  if (rect && rect.width <= 0 && rect.height <= 0) return false;
  return true;
}

function isLikelyMailTab(node) {
  if (!isVisibleNode(node)) return false;
  const text = readNodeText(node).toLowerCase();
  return /^(邮件|邮箱|mail|email|messages?|inbox)$/.test(text)
    || /邮件|邮箱|mail|email|inbox/.test(text);
}

function findMailTab() {
  return Array.from(document.querySelectorAll(MAIL_TAB_SELECTORS)).find(isLikelyMailTab) || null;
}

async function fillPasswordIfPresent(password = '') {
  const normalizedPassword = String(password || '');
  if (!normalizedPassword) {
    return false;
  }

  const passwordInput = document.querySelector('input[type="password"], input[autocomplete="current-password"]');
  if (!passwordInput || !isVisibleNode(passwordInput)) {
    return false;
  }

  fillInput(passwordInput, normalizedPassword);
  await sleep(200);
  const submitButton = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
    .find((button) => isVisibleNode(button) && /登录|登陆|sign\s*in|login|进入|submit/i.test(readNodeText(button)));
  if (submitButton) {
    simulateClick(submitButton);
    await sleep(1500);
  }
  return true;
}

async function ensureMailView(options = {}) {
  await fillPasswordIfPresent(options?.password);

  const tab = findMailTab();
  if (!tab) {
    return;
  }

  simulateClick(tab);
  await sleep(800);
}

function isLikelyMailListItem(node) {
  if (!isVisibleNode(node)) return false;
  const text = readNodeText(node);
  if (text.length < 10) return false;
  if (/登录|密码|管理|设置|域名|用户|刷新|删除|新增|搜索/.test(text) && !/\d{6}|openai|chatgpt|verification|code|验证码|登录码/i.test(text)) {
    return false;
  }
  return /\d{6}|openai|chatgpt|verification|code|验证码|登录码|邮件|email|mail/i.test(text);
}

function findMailItems() {
  const seen = new Set();
  return Array.from(document.querySelectorAll(MAIL_ITEM_SELECTORS))
    .filter((item) => {
      if (!isLikelyMailListItem(item)) return false;
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function chooseLatestMailItem(items = []) {
  const candidates = Array.from(items || []).filter(Boolean);
  if (!candidates.length) return null;
  return candidates
    .map((item, index) => ({ item, index, timestamp: getMailItemTimestamp(item) }))
    .sort((a, b) => (b.timestamp - a.timestamp) || (b.index - a.index))[0].item;
}

async function openMailItem(item) {
  if (!item) return;
  simulateClick(item);
  await sleep(1000);
}

function collectOpenedMailTextCandidates() {
  const texts = [];
  const seen = new Set();
  const push = (value) => {
    const text = normalizeText(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    texts.push(text);
  };

  document.querySelectorAll(BODY_TEXT_SELECTORS).forEach((node) => {
    push(node.innerText || node.textContent);
  });
  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      push(frame.contentDocument?.body?.innerText || frame.contentDocument?.body?.textContent);
    } catch {
      // Ignore cross-frame access errors.
    }
  });
  push(document.body?.innerText || document.body?.textContent);
  return texts.sort((a, b) => b.length - a.length);
}

function readOpenedMailText(options = {}) {
  const candidates = collectOpenedMailTextCandidates();
  return candidates.find((candidate) => extractVerificationCode(candidate, { codePatterns: options.codePatterns }))
    || candidates[0]
    || '';
}

function getMailItemId(item, index = 0) {
  return String(
    item?.getAttribute?.('data-id')
    || item?.getAttribute?.('data-testid')
    || item?.id
    || `${index}:${readNodeText(item).slice(0, 160)}`
  );
}

async function handlePollEmail(step, payload = {}) {
  const {
    codePatterns = [],
    senderFilters = [],
    subjectFilters = [],
    requiredKeywords = [],
    maxAttempts = 20,
    intervalMs = 3000,
    excludeCodes = [],
    xiaokapiPassword = '',
  } = payload || {};
  const excludedCodeSet = new Set(excludeCodes.filter(Boolean));

  log(`步骤 ${step}：开始轮询 Xiaokapi 邮箱（最多 ${maxAttempts} 次）`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`步骤 ${step}：正在检查 Xiaokapi 邮箱，第 ${attempt}/${maxAttempts} 次`);
    await ensureMailView({ password: xiaokapiPassword });

    const items = findMailItems();
    const filteredItems = items.filter((item) => {
      const text = readNodeText(item);
      return !senderFilters.length && !subjectFilters.length && !requiredKeywords.length
        ? true
        : matchesAnyKeyword(text, senderFilters)
          || matchesAnyKeyword(text, subjectFilters)
          || matchesAnyKeyword(text, requiredKeywords);
    });
    const latestMail = chooseLatestMailItem(filteredItems.length ? filteredItems : items);

    if (latestMail) {
      const previewText = readNodeText(latestMail);
      let code = extractVerificationCode(previewText, { codePatterns });
      if (!code) {
        await openMailItem(latestMail);
        code = extractVerificationCode(readOpenedMailText({ codePatterns }), { codePatterns });
      }

      if (code && !excludedCodeSet.has(code)) {
        const mailId = getMailItemId(latestMail, items.indexOf(latestMail));
        log(`步骤 ${step}：已从 Xiaokapi 邮箱读取验证码：${code}`, 'ok');
        return {
          ok: true,
          code,
          emailTimestamp: Date.now(),
          mailId,
        };
      }
    }

    if (attempt < maxAttempts) {
      await sleep(intervalMs);
    }
  }

  throw new Error(`${Math.round((maxAttempts * intervalMs) / 1000)} 秒后仍未在 Xiaokapi 邮箱中找到匹配邮件。`);
}

} // end top-frame guard
