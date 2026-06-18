(function mail2925ImapProviderModule(root, factory) {
  root.MultiPageBackgroundMail2925ImapProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createMail2925ImapProviderModule() {
  function createMail2925ImapProvider(deps = {}) {
    const {
      addLog = async () => {},
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getState = async () => ({}),
      MAIL_2925_IMAP_DEFAULT_HOST = 'imap.2925.com',
      MAIL_2925_IMAP_DEFAULT_PORT = 993,
      MAIL_2925_IMAP_DEFAULT_SECURE = true,
      MAIL_2925_IMAP_HELPER_BASE_URL = 'http://127.0.0.1:17374',
      MAIL_2925_IMAP_PROVIDER = '2925-imap',
      normalizeMail2925Accounts = (accounts) => Array.isArray(accounts) ? accounts : [],
      pickVerificationMessageWithTimeFallback,
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
    } = deps;

    function cleanString(value = '') {
      return String(value ?? '').trim();
    }

    function normalizeEmail(value = '') {
      return cleanString(value).toLowerCase();
    }

    function normalizeBoolean(value, fallback = false) {
      if (value === undefined || value === null || value === '') {
        return Boolean(fallback);
      }
      if (typeof value === 'boolean') {
        return value;
      }
      const normalized = cleanString(value).toLowerCase();
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false;
      }
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true;
      }
      return Boolean(value);
    }

    function normalizeBaseUrl(value = '') {
      const fallback = MAIL_2925_IMAP_HELPER_BASE_URL;
      const rawValue = cleanString(value || fallback);
      try {
        const parsed = new URL(rawValue);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return fallback;
        }
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
      } catch {
        return fallback;
      }
    }

    function buildEndpoint(baseUrl, path) {
      return new URL(path, `${normalizeBaseUrl(baseUrl)}/`).toString();
    }

    function normalizeTargetEmailHints(hints = [], targetEmail = '') {
      const collected = (Array.isArray(hints) ? hints : [])
        .map((item) => cleanString(item).toLowerCase())
        .filter(Boolean);
      const normalizedTarget = normalizeEmail(targetEmail);
      if (normalizedTarget) {
        collected.push(normalizedTarget);
        const atIndex = normalizedTarget.indexOf('@');
        if (atIndex > 0) {
          collected.push(`${normalizedTarget.slice(0, atIndex)}=${normalizedTarget.slice(atIndex + 1)}`);
        }
      }
      return [...new Set(collected)];
    }

    function extractEmails(text = '') {
      const matches = String(text || '').match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
      return [...new Set(matches.map((item) => item.toLowerCase()))];
    }

    function extractForwardedTargetEmails(text = '', targetEmailHints = []) {
      const normalizedText = String(text || '').toLowerCase();
      const matches = normalizedText.match(/bounce\+[a-z0-9._%+-]*-([a-z0-9._%+-]+)=([a-z0-9.-]+\.[a-z]{2,})@[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
      const decoded = matches
        .map((candidate) => {
          const match = String(candidate || '').match(/bounce\+[a-z0-9._%+-]*-([a-z0-9._%+-]+)=([a-z0-9.-]+\.[a-z]{2,})@/i);
          return match ? `${match[1].toLowerCase()}@${match[2].toLowerCase()}` : '';
        })
        .filter(Boolean);
      const hinted = normalizeTargetEmailHints(targetEmailHints)
        .filter((hint) => hint.includes('@') || hint.includes('='))
        .flatMap((hint) => {
          if (hint.includes('@')) {
            return normalizedText.includes(hint) ? [hint] : [];
          }
          const match = hint.match(/^([^=]+)=([^=]+)$/);
          return match && normalizedText.includes(hint) ? [`${match[1]}@${match[2]}`] : [];
        });
      return [...new Set([...decoded, ...hinted])];
    }

    function getTargetEmailMatchState(text, targetEmail, options = {}) {
      const normalizedTarget = normalizeEmail(targetEmail);
      if (!normalizedTarget) {
        return { matches: true, hasExplicitEmail: false };
      }

      const normalizedText = String(text || '').toLowerCase();
      const targetEmailHints = normalizeTargetEmailHints(options?.targetEmailHints, normalizedTarget);
      if (targetEmailHints.some((hint) => normalizedText.includes(hint))) {
        return { matches: true, hasExplicitEmail: true };
      }

      const extractedEmails = extractEmails(normalizedText);
      const forwardedTargetEmails = extractForwardedTargetEmails(normalizedText, targetEmailHints);
      if (!extractedEmails.length) {
        return forwardedTargetEmails.length
          ? {
            matches: forwardedTargetEmails.some((candidate) => candidate === normalizedTarget),
            hasExplicitEmail: true,
          }
          : { matches: true, hasExplicitEmail: false };
      }

      const targetDomain = normalizedTarget.includes('@')
        ? normalizedTarget.split('@').pop()
        : '';
      const comparableEmails = [...new Set(
        (targetDomain
          ? [...extractedEmails, ...forwardedTargetEmails].filter((candidate) => String(candidate || '').trim().toLowerCase().endsWith(`@${targetDomain}`))
          : [...extractedEmails, ...forwardedTargetEmails])
      )];
      if (!comparableEmails.length) {
        return { matches: true, hasExplicitEmail: false };
      }

      return {
        matches: comparableEmails.some((candidate) => candidate === normalizedTarget),
        hasExplicitEmail: true,
      };
    }

    function normalizeRecipientList(value) {
      const list = Array.isArray(value) ? value : (value ? [value] : []);
      return list
        .map((item) => {
          const address = typeof item === 'object'
            ? cleanString(item.emailAddress?.address || item.address || item.email || item.name)
            : cleanString(item);
          return address ? { emailAddress: { address } } : null;
        })
        .filter(Boolean);
    }

    function getMail2925ImapSettings(state = {}) {
      const port = Math.floor(Number(state.mail2925ImapPort ?? MAIL_2925_IMAP_DEFAULT_PORT));
      return {
        baseUrl: normalizeBaseUrl(state.mail2925ImapHelperBaseUrl),
        host: cleanString(state.mail2925ImapHost) || MAIL_2925_IMAP_DEFAULT_HOST,
        port: Number.isInteger(port) && port > 0 ? port : MAIL_2925_IMAP_DEFAULT_PORT,
        secure: normalizeBoolean(state.mail2925ImapSecure, MAIL_2925_IMAP_DEFAULT_SECURE),
      };
    }

    function getMail2925AccountCandidates(state = {}) {
      const accounts = normalizeMail2925Accounts(state.mail2925Accounts);
      const currentAccountId = cleanString(state.currentMail2925AccountId);
      const currentAccount = currentAccountId
        ? accounts.find((account) => cleanString(account?.id) === currentAccountId) || null
        : null;
      const baseEmail = normalizeEmail(state.mail2925BaseEmail);
      const baseAccount = baseEmail
        ? accounts.find((account) => normalizeEmail(account?.email) === baseEmail) || null
        : null;
      return [currentAccount, baseAccount, ...accounts].filter(Boolean);
    }

    function resolveMail2925ImapAccount(state = {}) {
      const seenIds = new Set();
      for (const candidate of getMail2925AccountCandidates(state)) {
        const id = cleanString(candidate?.id) || normalizeEmail(candidate?.email);
        if (id && seenIds.has(id)) {
          continue;
        }
        if (id) {
          seenIds.add(id);
        }
        const email = normalizeEmail(candidate?.email);
        const password = String(candidate?.password || '');
        if (email && password) {
          return {
            id: cleanString(candidate?.id),
            email,
            password,
          };
        }
      }
      throw new Error('2925 IMAP 缺少可用账号。请先在侧边栏 2925 账号池添加邮箱和密码，并选择该账号。');
    }

    function normalizeHelperMessages(payload = {}) {
      const rawMessages = Array.isArray(payload?.messages)
        ? payload.messages
        : (payload?.message ? [payload.message] : []);
      return rawMessages.map((message = {}, index) => {
        const fromValue = message.from || message.sender || message.from_email || message.sender_email || '';
        const fromAddress = typeof fromValue === 'object'
          ? cleanString(fromValue.emailAddress?.address || fromValue.address || fromValue.email)
          : cleanString(fromValue);
        const bodyText = [
          message.bodyPreview,
          message.preview,
          message.snippet,
          message.text,
          message.body,
          message.content,
        ].map((item) => cleanString(item)).filter(Boolean).join('\n');
        return {
          id: cleanString(message.id || message.uid || message.messageId || message.message_id || `2925-imap-${index}`),
          subject: cleanString(message.subject || message.title),
          from: {
            emailAddress: {
              address: fromAddress,
            },
          },
          toRecipients: normalizeRecipientList(message.to || message.toRecipients || message.recipients),
          ccRecipients: normalizeRecipientList(message.cc || message.ccRecipients),
          bodyPreview: bodyText,
          receivedDateTime: cleanString(message.receivedDateTime || message.received_at || message.receivedAt || message.date || message.time),
          receivedTimestamp: Number(message.receivedTimestamp || message.timestamp || 0) || 0,
        };
      });
    }

    function getMessageTargetText(message = {}) {
      const toText = normalizeRecipientList(message.toRecipients)
        .map((item) => item.emailAddress.address)
        .join(' ');
      const ccText = normalizeRecipientList(message.ccRecipients)
        .map((item) => item.emailAddress.address)
        .join(' ');
      const fromText = message.from?.emailAddress?.address || '';
      return [
        message.subject,
        fromText,
        toText,
        ccText,
        message.bodyPreview,
      ].map((item) => cleanString(item)).filter(Boolean).join('\n');
    }

    function filterMessagesByTargetEmail(messages = [], pollPayload = {}) {
      if (!Boolean(pollPayload.mail2925MatchTargetEmail)) {
        return messages;
      }
      const targetEmail = pollPayload.targetEmail || '';
      if (!normalizeEmail(targetEmail)) {
        return messages;
      }
      const filtered = [];
      for (const message of messages) {
        const targetState = getTargetEmailMatchState(getMessageTargetText(message), targetEmail, {
          targetEmailHints: pollPayload.targetEmailHints || [],
        });
        if (!targetState.hasExplicitEmail || targetState.matches) {
          filtered.push(message);
        }
      }
      return filtered;
    }

    async function requestMail2925ImapJson(state = {}, path, payload = {}, options = {}) {
      if (!fetchImpl) {
        throw new Error('当前环境不支持 fetch，无法请求 2925 IMAP 本地助手。');
      }

      const settings = getMail2925ImapSettings(state);
      const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 45000);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      let response;
      try {
        response = await fetchImpl(buildEndpoint(settings.baseUrl, path), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          throw new Error(`2925 IMAP 本地助手请求超时（${Math.round(timeoutMs / 1000)} 秒），请确认助手已启动。`);
        }
        throw new Error(`2925 IMAP 本地助手请求失败：${err?.message || err}`);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }

      if (!response.ok || parsed?.ok === false) {
        const errorText = parsed?.error || parsed?.message || text || `HTTP ${response.status}`;
        throw new Error(`2925 IMAP 本地助手返回失败：${errorText}`);
      }
      return parsed || {};
    }

    function buildPollRequestPayload(state = {}, account = {}, pollPayload = {}) {
      const settings = getMail2925ImapSettings(state);
      return {
        provider: MAIL_2925_IMAP_PROVIDER,
        email: account.email,
        password: account.password,
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        mailbox: pollPayload.mailbox || 'INBOX',
        limit: Math.max(1, Math.min(50, Math.floor(Number(pollPayload.limit) || 15))),
        targetEmail: pollPayload.targetEmail || state.email || '',
        targetEmailHints: pollPayload.targetEmailHints || [],
        mail2925MatchTargetEmail: Boolean(pollPayload.mail2925MatchTargetEmail),
        filterAfterTimestamp: Number(pollPayload.filterAfterTimestamp || 0) || 0,
        refreshOnRetry: false,
        senderFilters: pollPayload.senderFilters || [],
        subjectFilters: pollPayload.subjectFilters || [],
        requiredKeywords: pollPayload.requiredKeywords || [],
        codePatterns: pollPayload.codePatterns || [],
        excludeCodes: pollPayload.excludeCodes || [],
      };
    }

    function summarizeMessagesForLog(messages = []) {
      return messages
        .slice()
        .sort((left, right) => {
          const leftTime = Number(left.receivedTimestamp || 0) || Date.parse(left.receivedDateTime || '') || 0;
          const rightTime = Number(right.receivedTimestamp || 0) || Date.parse(right.receivedDateTime || '') || 0;
          return rightTime - leftTime;
        })
        .slice(0, 3)
        .map((message) => {
          const receivedAt = message.receivedDateTime || (message.receivedTimestamp ? new Date(message.receivedTimestamp).toISOString() : 'unknown time');
          const sender = message.from?.emailAddress?.address || 'unknown sender';
          const subject = message.subject || '(no subject)';
          const preview = cleanString(message.bodyPreview).replace(/\s+/g, ' ').slice(0, 80);
          return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
        })
        .join(' || ');
    }

    async function pollMail2925ImapVerificationCode(step, state, pollPayload = {}) {
      const latestState = state || await getState();
      const account = resolveMail2925ImapAccount(latestState);
      const maxAttempts = Math.max(1, Math.floor(Number(pollPayload.maxAttempts) || 5));
      const intervalMs = Math.max(1, Number(pollPayload.intervalMs) || 3000);
      const requestTimeoutMs = Math.max(45000, Number(pollPayload.requestTimeoutMs) || 45000);
      let lastError = null;

      await addLog(`步骤 ${step}：2925 IMAP 将使用账号 ${account.email} 读取收件箱。`, 'info');

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        throwIfStopped();
        try {
          const payload = await requestMail2925ImapJson(
            latestState,
            '/2925/poll-code',
            buildPollRequestPayload(latestState, account, pollPayload),
            { timeoutMs: requestTimeoutMs }
          );
          const messages = normalizeHelperMessages(payload);
          const filteredMessages = filterMessagesByTargetEmail(messages, pollPayload);
          const matchResult = payload?.code
            ? {
              match: {
                code: String(payload.code || '').trim(),
                receivedAt: Number(payload.emailTimestamp || payload.receivedTimestamp || 0) || Date.now(),
                message: payload.message || messages[0] || null,
              },
              usedRelaxedFilters: false,
              usedTimeFallback: false,
            }
            : pickVerificationMessageWithTimeFallback(filteredMessages, {
              afterTimestamp: pollPayload.filterAfterTimestamp || 0,
              senderFilters: pollPayload.senderFilters || [],
              subjectFilters: pollPayload.subjectFilters || [],
              requiredKeywords: pollPayload.requiredKeywords || [],
              codePatterns: pollPayload.codePatterns || [],
              excludeCodes: pollPayload.excludeCodes || [],
            });
          const match = matchResult.match;
          if (match?.code) {
            if (matchResult.usedRelaxedFilters || matchResult.usedTimeFallback) {
              await addLog(`步骤 ${step}：2925 IMAP 已用宽松时间窗口匹配到验证码。`, 'warn');
            }
            await addLog(`步骤 ${step}：2925 IMAP 已读取到验证码 ${match.code}。`, 'ok');
            return {
              ok: true,
              code: match.code,
              emailTimestamp: match.receivedAt || Number(payload.emailTimestamp || 0) || Date.now(),
              mailId: match.message?.id || payload.mailId || '',
            };
          }

          lastError = new Error(`步骤 ${step}：2925 IMAP 暂未找到匹配验证码（${attempt}/${maxAttempts}）。`);
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
          const sample = summarizeMessagesForLog(messages);
          if (sample) {
            await addLog(`步骤 ${step}：2925 IMAP 最近邮件样本：${sample}`, 'info');
          }
        } catch (err) {
          lastError = err;
          await addLog(`步骤 ${step}：2925 IMAP 轮询失败：${err?.message || err}`, 'warn');
        }

        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }

      throw lastError || new Error(`步骤 ${step}：2925 IMAP 未找到新的匹配验证码。`);
    }

    return {
      buildPollRequestPayload,
      getMail2925ImapSettings,
      normalizeBaseUrl,
      normalizeHelperMessages,
      pollMail2925ImapVerificationCode,
      requestMail2925ImapJson,
      resolveMail2925ImapAccount,
    };
  }

  return {
    createMail2925ImapProvider,
  };
});
