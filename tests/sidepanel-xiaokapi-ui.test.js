const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('sidepanel/sidepanel.js', 'utf8');

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

function createRow(initialDisplay = 'none') {
  return {
    style: { display: initialDisplay },
  };
}

function normalizeIcloudTargetMailboxType(value = '') {
  return String(value || '').trim().toLowerCase() === 'forward-mailbox'
    ? 'forward-mailbox'
    : 'icloud-inbox';
}

function normalizeIcloudForwardMailProvider(value = '') {
  return String(value || '').trim().toLowerCase() || 'gmail';
}

test('updateMailProviderUI only shows necessary controls for Xiaokapi mail', () => {
  const bundle = extractFunction('updateMailProviderUI');

  const api = new Function('normalizeIcloudTargetMailboxType', 'normalizeIcloudForwardMailProvider', `
let latestState = {};
let cloudflareDomainEditMode = false;
let cloudflareTempEmailDomainEditMode = false;
const ICLOUD_PROVIDER = 'icloud';
const GMAIL_PROVIDER = 'gmail';
const LUCKMAIL_PROVIDER = 'luckmail-api';
const rowMail2925Mode = ${JSON.stringify(createRow('none'))};
const rowMail2925PoolSettings = ${JSON.stringify(createRow('none'))};
const rowCustomMailProviderPool = ${JSON.stringify(createRow('none'))};
const rowXiaokapiPassword = ${JSON.stringify(createRow('none'))};
const rowEmailPrefix = ${JSON.stringify(createRow('none'))};
const rowInbucketHost = ${JSON.stringify(createRow('none'))};
const rowInbucketMailbox = ${JSON.stringify(createRow('none'))};
const rowEmailGenerator = ${JSON.stringify(createRow(''))};
const rowCfDomain = ${JSON.stringify(createRow('none'))};
const rowTempEmailBaseUrl = ${JSON.stringify(createRow('none'))};
const rowTempEmailAdminAuth = ${JSON.stringify(createRow('none'))};
const rowTempEmailCustomAuth = ${JSON.stringify(createRow('none'))};
const rowTempEmailLookupMode = ${JSON.stringify(createRow('none'))};
const rowTempEmailReceiveMailbox = ${JSON.stringify(createRow('none'))};
const rowTempEmailRandomSubdomainToggle = ${JSON.stringify(createRow('none'))};
const rowTempEmailDomain = ${JSON.stringify(createRow('none'))};
const cloudflareTempEmailSection = ${JSON.stringify(createRow('none'))};
const cloudMailSection = ${JSON.stringify(createRow('none'))};
const yydsMailSection = ${JSON.stringify(createRow('none'))};
const rowCloudMailBaseUrl = ${JSON.stringify(createRow('none'))};
const rowCloudMailAdminEmail = ${JSON.stringify(createRow('none'))};
const rowCloudMailAdminPassword = ${JSON.stringify(createRow('none'))};
const rowCloudMailReceiveMailbox = ${JSON.stringify(createRow('none'))};
const rowCloudMailDomain = ${JSON.stringify(createRow('none'))};
const icloudSection = ${JSON.stringify(createRow('none'))};
const rowIcloudTargetMailboxType = ${JSON.stringify(createRow('none'))};
const rowIcloudForwardMailProvider = ${JSON.stringify(createRow('none'))};
const hotmailSection = ${JSON.stringify(createRow('none'))};
const mail2925Section = ${JSON.stringify(createRow('none'))};
const luckmailSection = ${JSON.stringify(createRow('none'))};
const rowHotmailServiceMode = ${JSON.stringify(createRow('none'))};
const rowHotmailRemoteBaseUrl = ${JSON.stringify(createRow('none'))};
const rowHotmailLocalBaseUrl = ${JSON.stringify(createRow('none'))};
const labelEmailPrefix = { textContent: '' };
const inputEmailPrefix = { placeholder: '', style: { display: '' }, readOnly: false };
const labelMail2925UseAccountPool = ${JSON.stringify(createRow('none'))};
const selectMail2925PoolAccount = { style: { display: 'none' }, disabled: false };
const btnFetchEmail = { hidden: false, disabled: false, textContent: '' };
const btnMailLogin = { disabled: false, textContent: '', title: '' };
const inputEmail = { readOnly: false, placeholder: '', value: '' };
const autoHintText = { textContent: '' };
const inputMail2925UseAccountPool = { checked: false };
const inputTempEmailUseRandomSubdomain = { checked: false };
const selectMailProvider = { value: 'xiaokapi', options: [] };
const selectEmailGenerator = { value: 'cloudflare-temp-email', disabled: false, options: [] };
function resolveCurrentSidepanelCapabilities() { return { canShowLuckmail: true }; }
function getSelectedTargetId() { return 'openai'; }
function getSelectedFlowId() { return 'openai'; }
function isLuckmailProvider() { return false; }
function isYydsMailProvider() { return false; }
function isCustomMailProvider() { return false; }
function isIcloudMailProvider() { return false; }
function usesCustomMailProviderPool() { return false; }
function usesGeneratedAliasMailProvider() { return false; }
function getSelectedMail2925Mode() { return 'provide'; }
function getManagedAliasProviderUiCopy() { return null; }
function getCurrentRegistrationEmailUiCopy() {
  return {
    buttonLabel: '获取',
    placeholder: '填写注册邮箱',
    label: '注册邮箱',
  };
}
function updateMailLoginButtonState() {}
function getSelectedHotmailServiceMode() { return 'local'; }
function getCloudflareDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareDomainEditMode() {}
function getCloudflareTempEmailDomainsFromState() { return { domains: [], activeDomain: '' }; }
function setCloudflareTempEmailDomainEditMode() {}
function queueIcloudAliasRefresh() {}
function hideIcloudLoginHelp() {}
function syncMail2925PoolAccountOptions() {}
function getMail2925Accounts() { return []; }
function renderHotmailAccounts() {}
function renderMail2925Accounts() {}
function renderLuckmailPurchases() {}
function getSelectedEmailGenerator() { return String(selectEmailGenerator.value || '').trim().toLowerCase(); }
function isAutoRunLockedPhase() { return false; }
${bundle}
return {
  updateMailProviderUI,
  rowXiaokapiPassword,
  rowEmailGenerator,
  cloudflareTempEmailSection,
  cloudMailSection,
  icloudSection,
  btnFetchEmail,
  inputEmail,
};
  `)(normalizeIcloudTargetMailboxType, normalizeIcloudForwardMailProvider);

  api.updateMailProviderUI();

  assert.equal(api.rowXiaokapiPassword.style.display, '');
  assert.equal(api.rowEmailGenerator.style.display, 'none');
  assert.equal(api.cloudflareTempEmailSection.style.display, 'none');
  assert.equal(api.cloudMailSection.style.display, 'none');
  assert.equal(api.icloudSection.style.display, 'none');
  assert.equal(api.btnFetchEmail.hidden, false);
  assert.equal(api.btnFetchEmail.disabled, false);
  assert.equal(api.inputEmail.readOnly, false);
});
