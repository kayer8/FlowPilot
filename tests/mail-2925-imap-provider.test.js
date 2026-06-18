const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('background/mail-2925-imap-provider.js', 'utf8');
const scope = {};
const api = new Function('self', `${source}; return self.MultiPageBackgroundMail2925ImapProvider;`)(scope);

function createProvider(overrides = {}) {
  return api.createMail2925ImapProvider({
    addLog: async () => {},
    normalizeMail2925Accounts: (accounts) => Array.isArray(accounts) ? accounts : [],
    pickVerificationMessageWithTimeFallback(messages, options = {}) {
      const excluded = new Set((options.excludeCodes || []).map(String));
      for (const message of messages) {
        const text = `${message.subject || ''}\n${message.bodyPreview || ''}`;
        const match = text.match(/\b(\d{6})\b/);
        if (match && !excluded.has(match[1])) {
          return {
            match: {
              code: match[1],
              receivedAt: message.receivedTimestamp || 0,
              message,
            },
            usedRelaxedFilters: false,
            usedTimeFallback: false,
          };
        }
      }
      return { match: null, usedRelaxedFilters: false, usedTimeFallback: false };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    ...overrides,
  });
}

test('mail2925 imap provider posts selected account and IMAP settings to local helper', async () => {
  const requests = [];
  const provider = createProvider({
    fetchImpl: async (url, options) => {
      requests.push({
        url,
        body: JSON.parse(options.body),
      });
      return {
        ok: true,
        text: async () => JSON.stringify({
          ok: true,
          messages: [{
            uid: '41',
            subject: 'Your ChatGPT code',
            from: 'noreply@openai.com',
            bodyPreview: 'Use 654321 to continue',
            receivedTimestamp: 123456,
          }],
        }),
      };
    },
  });

  const result = await provider.pollMail2925ImapVerificationCode(4, {
    currentMail2925AccountId: 'acc-2',
    mail2925Accounts: [
      { id: 'acc-1', email: 'old@2925.com', password: 'old-pass' },
      { id: 'acc-2', email: 'Demo@2925.com', password: 'secret' },
    ],
    mail2925ImapHelperBaseUrl: 'http://127.0.0.1:17374/2925/poll-code',
    mail2925ImapHost: 'imap.alt.example',
    mail2925ImapPort: 1143,
    mail2925ImapSecure: false,
    email: 'demo123456@2925.com',
  }, {
    filterAfterTimestamp: 111,
    targetEmail: 'demo123456@2925.com',
    maxAttempts: 1,
    intervalMs: 1,
  });

  assert.equal(result.code, '654321');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'http://127.0.0.1:17374/2925/poll-code');
  assert.equal(requests[0].body.email, 'demo@2925.com');
  assert.equal(requests[0].body.password, 'secret');
  assert.equal(requests[0].body.host, 'imap.alt.example');
  assert.equal(requests[0].body.port, 1143);
  assert.equal(requests[0].body.secure, false);
  assert.equal(requests[0].body.targetEmail, 'demo123456@2925.com');
  assert.equal(requests[0].body.filterAfterTimestamp, 111);
  assert.equal(requests[0].body.refreshOnRetry, false);
});

test('mail2925 imap provider falls back to base email account', () => {
  const provider = createProvider();
  assert.deepEqual(
    provider.resolveMail2925ImapAccount({
      mail2925BaseEmail: 'base@2925.com',
      mail2925Accounts: [
        { id: 'acc-1', email: 'other@2925.com', password: 'other-pass' },
        { id: 'acc-2', email: 'base@2925.com', password: 'base-pass' },
      ],
    }),
    {
      id: 'acc-2',
      email: 'base@2925.com',
      password: 'base-pass',
    }
  );
});

test('mail2925 imap provider requires an account with password', async () => {
  const provider = createProvider({
    fetchImpl: async () => {
      throw new Error('should not call helper without credentials');
    },
  });

  await assert.rejects(
    () => provider.pollMail2925ImapVerificationCode(4, {
      mail2925Accounts: [{ id: 'acc-1', email: 'demo@2925.com', password: '' }],
    }, { maxAttempts: 1 }),
    /缺少可用账号/
  );
});

test('mail2925 imap provider filters explicit mismatched target emails in receive mode', async () => {
  const provider = createProvider({
    fetchImpl: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        messages: [
          {
            uid: 'wrong',
            subject: 'Your ChatGPT code',
            from: 'noreply@openai.com',
            to: 'other@example.com',
            text: 'OpenAI verification code 111111 for other@example.com',
            receivedTimestamp: 2000,
          },
          {
            uid: 'right',
            subject: 'Your ChatGPT code',
            from: 'noreply@openai.com',
            to: 'expected@example.com',
            text: 'OpenAI verification code 222222 for expected@example.com',
            receivedTimestamp: 1000,
          },
        ],
      }),
    }),
  });

  const result = await provider.pollMail2925ImapVerificationCode(4, {
    currentMail2925AccountId: 'acc-1',
    mail2925Accounts: [
      { id: 'acc-1', email: 'demo@2925.com', password: 'secret' },
    ],
  }, {
    targetEmail: 'expected@example.com',
    targetEmailHints: ['expected@example.com', 'expected=example.com'],
    mail2925MatchTargetEmail: true,
    maxAttempts: 1,
    intervalMs: 1,
  });

  assert.equal(result.code, '222222');
  assert.equal(result.mailId, 'right');
});
