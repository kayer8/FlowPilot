const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background.js', 'utf8');
const DEFAULT_REGISTRATION_EMAIL_STATE = {
  current: '',
  previous: '',
  source: '',
  updatedAt: 0,
};

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

function createApi(events, lastNodeId = 'platform-verify', initialState = {}) {
  return new Function('events', 'lastNodeId', 'initialState', `
let stopRequested = false;
let currentState = { nodeStatuses: {}, accountContributionEnabled: true, ...initialState };
const LOG_PREFIX = '[test]';
const STOP_ERROR_MESSAGE = '流程已被用户停止。';
const DEFAULT_REGISTRATION_EMAIL_STATE = {
  current: '',
  previous: '',
  source: '',
  updatedAt: 0,
};
function getErrorMessage(error) {
  return error?.message || String(error || '');
}
async function getState() {
  events.push({ type: 'getState' });
  return currentState;
}
function getLastNodeIdForState() {
  return lastNodeId;
}
async function setNodeStatus(nodeId, status) {
  events.push({ type: 'status', nodeId, status });
}
async function setState(updates) {
  events.push({ type: 'setState', updates });
  currentState = { ...currentState, ...updates };
}
function broadcastDataUpdate(updates) {
  events.push({ type: 'broadcast', updates });
}
async function addLog(message, level, options = {}) {
  events.push({ type: 'log', message, level, options });
}
async function appendManualAccountRunRecordIfNeeded() {
  events.push({ type: 'manual-record' });
}
function notifyNodeError(nodeId, error) {
  events.push({ type: 'error', nodeId, error });
}
function notifyNodeComplete(nodeId, payload) {
  events.push({ type: 'notify', nodeId, payload });
}
async function handleNodeData(nodeId, payload) {
  events.push({ type: 'handle-start', nodeId, payload });
  await new Promise((resolve) => setTimeout(resolve, 25));
  events.push({ type: 'handle-done', nodeId });
}
async function appendAndBroadcastAccountRunRecord(status, state) {
  events.push({ type: 'record', status, state });
}
function isReusableGeneratedAliasEmail(state = {}, email = state?.email) {
  const currentEmail = String(email || '').trim().toLowerCase();
  const provider = String(state?.mailProvider || '').trim().toLowerCase();
  const mode = String(state?.mail2925Mode || 'provide').trim().toLowerCase();
  if (!currentEmail || provider !== '2925' || mode === 'receive' || !currentEmail.endsWith('@2925.com')) {
    return false;
  }
  const baseEmail = String(state?.mail2925BaseEmail || state?.emailPrefix || '').trim().toLowerCase();
  if (!baseEmail) {
    return true;
  }
  const localPart = currentEmail.split('@')[0];
  const baseLocalPart = baseEmail.split('@')[0];
  return Boolean(baseLocalPart && (localPart === baseLocalPart || localPart.startsWith(baseLocalPart)));
}
${extractFunction('getSignupPhoneActivationForDestroy')}
${extractFunction('hasSignupPhoneStateForDestroy')}
${extractFunction('hasMail2925RegistrationEmailStateForDestroy')}
${extractFunction('clearDestroyedSignupPhoneState')}
${extractFunction('clearDestroyedMail2925RegistrationEmailState')}
${extractFunction('destroySignupRuntimeIdentityAfterSub2ApiCallbackSuccess')}
${extractFunction('runCompletedNodeSideEffects')}
${extractFunction('reportCompletedNodeSideEffectError')}
${extractFunction('completeNodeFromBackground')}
return {
  completeNodeFromBackground,
  getCurrentState: () => currentState,
};
`)(events, lastNodeId, initialState);
}

test('completeNodeFromBackground releases final node before slow post-completion side effects', async () => {
  const events = [];
  const api = createApi(events, 'platform-verify');

  await api.completeNodeFromBackground('platform-verify', { localhostUrl: 'http://localhost:1455/auth/callback?code=ok' });

  const types = events.map((event) => event.type);
  assert.equal(types.indexOf('notify') < types.indexOf('handle-start'), true);
  assert.equal(types.includes('handle-done'), false);
  assert.equal(types.includes('record'), false);

  await new Promise((resolve) => setTimeout(resolve, 40));

  const settledTypes = events.map((event) => event.type);
  assert.equal(settledTypes.includes('handle-done'), true);
  assert.equal(settledTypes.includes('record'), true);
});

test('completeNodeFromBackground keeps non-final node data handling before completion signal', async () => {
  const events = [];
  const api = createApi(events, 'platform-verify');

  await api.completeNodeFromBackground('confirm-oauth', { localhostUrl: 'http://localhost:1455/auth/callback?code=ok' });

  const types = events.map((event) => event.type);
  assert.equal(types.indexOf('handle-done') < types.indexOf('notify'), true);
  assert.equal(types.includes('record'), false);
});

test('completeNodeFromBackground clears local signup phone state after SUB2API callback success', async () => {
  const events = [];
  const api = createApi(events, 'platform-verify', {
    accountIdentifierType: 'phone',
    accountIdentifier: '+6612345',
    signupPhoneNumber: '+6612345',
    signupPhoneActivation: null,
    signupPhoneCompletedActivation: {
      activationId: 'signup-done',
      phoneNumber: '+6612345',
    },
    signupPhoneVerificationRequestedAt: 123,
    signupPhoneVerificationPurpose: 'login',
    currentPhoneVerificationCode: '654321',
    currentPhoneVerificationCountdownEndsAt: 456,
    currentPhoneVerificationCountdownWindowIndex: 1,
    currentPhoneVerificationCountdownWindowTotal: 3,
  });

  await api.completeNodeFromBackground('platform-verify', {
    localhostUrl: 'http://localhost:1455/auth/callback?code=ok',
    sub2apiCallbackVerified: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(events.some((event) => event.type === 'cancel-signup-phone'), false);

  const cleanupEvent = events.find((event) => event.type === 'setState');
  assert.equal(events.findIndex((event) => event.type === 'setState') < events.findIndex((event) => event.type === 'notify'), true);
  assert.deepStrictEqual(cleanupEvent.updates, {
    phoneNumber: '',
    signupPhoneNumber: '',
    signupPhoneActivation: null,
    signupPhoneCompletedActivation: null,
    signupPhoneVerificationRequestedAt: null,
    signupPhoneVerificationPurpose: '',
    currentPhoneVerificationCode: '',
    currentPhoneVerificationCountdownEndsAt: 0,
    currentPhoneVerificationCountdownWindowIndex: 0,
    currentPhoneVerificationCountdownWindowTotal: 0,
    accountIdentifierType: null,
    accountIdentifier: '',
  });

  const recordEvent = events.find((event) => event.type === 'record');
  assert.equal(recordEvent.state.accountIdentifierType, 'phone');
  assert.equal(recordEvent.state.accountIdentifier, '+6612345');
});

test('completeNodeFromBackground clears generated 2925 registration email after SUB2API callback success', async () => {
  const events = [];
  const api = createApi(events, 'platform-verify', {
    mailProvider: '2925',
    mail2925Mode: 'provide',
    mail2925BaseEmail: 'demo@2925.com',
    currentMail2925AccountId: 'acc-1',
    mail2925Accounts: [{ id: 'acc-1', email: 'demo@2925.com' }],
    email: 'demo123456@2925.com',
    registrationEmailState: {
      current: 'demo123456@2925.com',
      previous: 'demo123456@2925.com',
      source: 'generated:2925',
      updatedAt: 123,
    },
    accountIdentifierType: 'email',
    accountIdentifier: 'demo123456@2925.com',
  });

  await api.completeNodeFromBackground('platform-verify', {
    localhostUrl: 'http://localhost:1455/auth/callback?code=ok',
    sub2apiCallbackVerified: true,
  });
  await new Promise((resolve) => setTimeout(resolve, 40));

  const cleanupEvent = events.find((event) => event.type === 'setState');
  assert.equal(events.findIndex((event) => event.type === 'setState') < events.findIndex((event) => event.type === 'notify'), true);
  assert.deepStrictEqual(cleanupEvent.updates, {
    email: null,
    registrationEmailState: DEFAULT_REGISTRATION_EMAIL_STATE,
    accountIdentifierType: null,
    accountIdentifier: '',
  });

  const latestState = api.getCurrentState();
  assert.equal(latestState.mail2925BaseEmail, 'demo@2925.com');
  assert.equal(latestState.currentMail2925AccountId, 'acc-1');
  assert.deepStrictEqual(latestState.mail2925Accounts, [{ id: 'acc-1', email: 'demo@2925.com' }]);
  assert.equal(events.some((event) => event.type === 'log' && /2925 注册邮箱状态/.test(event.message)), true);
});

test('completeNodeFromBackground does not clear non-generated 2925 registration email cases', async () => {
  const cases = [
    {
      name: 'receive mode',
      state: {
        mailProvider: '2925',
        mail2925Mode: 'receive',
        mail2925BaseEmail: 'demo@2925.com',
        email: 'demo123456@2925.com',
      },
      payload: { sub2apiCallbackVerified: true },
    },
    {
      name: 'non-2925 provider',
      state: {
        mailProvider: 'gmail',
        email: 'demo+tag@gmail.com',
      },
      payload: { sub2apiCallbackVerified: true },
    },
    {
      name: 'callback not verified',
      state: {
        mailProvider: '2925',
        mail2925Mode: 'provide',
        mail2925BaseEmail: 'demo@2925.com',
        email: 'demo123456@2925.com',
      },
      payload: { sub2apiCallbackVerified: false },
    },
  ];

  for (const testCase of cases) {
    const events = [];
    const api = createApi(events, 'platform-verify', {
      registrationEmailState: {
        current: testCase.state.email,
        previous: testCase.state.email,
        source: 'generated:test',
        updatedAt: 123,
      },
      accountIdentifierType: 'email',
      accountIdentifier: testCase.state.email,
      ...testCase.state,
    });

    await api.completeNodeFromBackground('platform-verify', testCase.payload);
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(
      events.some((event) => event.type === 'setState' && Object.prototype.hasOwnProperty.call(event.updates, 'email')),
      false,
      `${testCase.name} should not clear email`
    );
  }
});
