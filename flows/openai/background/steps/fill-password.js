(function attachBackgroundStep3(root, factory) {
  root.MultiPageBackgroundStep3 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep3Module() {
  function createStep3Executor(deps = {}) {
    const {
      addLog,
      chrome,
      ensureContentScriptReadyOnTab,
      generatePassword,
      getTabId,
      isTabAlive,
      resolveSignupMethod,
      sendToContentScript,
      sendToContentScriptResilient,
      setPasswordState,
      setState,
      OPENAI_AUTH_INJECT_FILES,
    } = deps;

    const LOGIN_PASSWORD_PAGE_ERROR_PREFIX = 'SIGNUP_PASSWORD_PAGE_LOGIN_MODE::';

    function normalizeSignupMethod(value = '') {
      return String(value || '').trim().toLowerCase() === 'phone'
        ? 'phone'
        : 'email';
    }

    function getResolvedSignupMethodForStep3(state = {}) {
      if (typeof resolveSignupMethod === 'function') {
        return normalizeSignupMethod(resolveSignupMethod(state));
      }
      const frozenMethod = String(state?.resolvedSignupMethod || '').trim().toLowerCase();
      if (frozenMethod === 'phone' || frozenMethod === 'email') {
        return normalizeSignupMethod(frozenMethod);
      }
      return normalizeSignupMethod(state?.signupMethod);
    }

    function resolveStep3AccountIdentity(state = {}) {
      const resolvedEmail = String(state?.email || '').trim();
      const rawAccountIdentifierType = String(state?.accountIdentifierType || '').trim().toLowerCase();
      const signupPhoneNumber = String(
        state?.signupPhoneNumber
        || (rawAccountIdentifierType === 'phone' ? state?.accountIdentifier : '')
        || ''
      ).trim();
      const explicitEmailIdentity = rawAccountIdentifierType === 'email' && resolvedEmail;
      const shouldUsePhoneIdentity = !explicitEmailIdentity && (
        rawAccountIdentifierType === 'phone'
        || Boolean(signupPhoneNumber)
        || getResolvedSignupMethodForStep3(state) === 'phone'
      );
      const accountIdentifierType = shouldUsePhoneIdentity
        ? 'phone'
        : (resolvedEmail ? 'email' : 'email');
      const accountIdentifier = accountIdentifierType === 'phone'
        ? signupPhoneNumber
        : resolvedEmail;

      return {
        accountIdentifierType,
        accountIdentifier,
        email: resolvedEmail,
        phoneNumber: signupPhoneNumber,
      };
    }

    function normalizePasswordPageTitle(value = '') {
      return String(value || '').replace(/\s+/g, '').trim();
    }

    function isLoginPasswordPageState(pageState = {}) {
      const title = normalizePasswordPageTitle(pageState?.passwordPageTitle);
      const url = String(pageState?.url || '').trim();
      return title.includes('输入密码')
        || /\/log-in\/password(?:[/?#]|$)/i.test(url);
    }

    function isCreatePasswordPageState(pageState = {}) {
      const title = normalizePasswordPageTitle(pageState?.passwordPageTitle);
      const url = String(pageState?.url || '').trim();
      return title.includes('创建密码')
        || /\/create-account\/password(?:[/?#]|$)/i.test(url);
    }

    async function getSignupPasswordPageState() {
      const sender = typeof sendToContentScriptResilient === 'function'
        ? sendToContentScriptResilient
        : sendToContentScript;
      if (typeof sender !== 'function') {
        return null;
      }
      const result = await sender('openai-auth', {
        type: 'GET_SIGNUP_PASSWORD_PAGE_STATE',
        step: 3,
        source: 'background',
        payload: {},
      }, {
        responseTimeoutMs: 15000,
        timeoutMs: 15000,
        logStep: 3,
        logStepKey: 'fill-password',
      });
      if (result?.error) {
        throw new Error(result.error);
      }
      return result || null;
    }

    async function ensureCreatePasswordPageBeforeFill() {
      const pageState = await getSignupPasswordPageState();
      if (!pageState) {
        return;
      }
      if (isLoginPasswordPageState(pageState)) {
        throw new Error(`${LOGIN_PASSWORD_PAGE_ERROR_PREFIX}步骤 3：检测到当前页面显示“输入密码”，这是登录密码页，不是“创建密码”注册页，需要回到开头重新开始。`);
      }
      if (isCreatePasswordPageState(pageState)) {
        await addLog('步骤 3：已确认当前页面为“创建密码”，继续填写密码。', 'info');
        return;
      }
      if (pageState.state === 'password_page') {
        await addLog(`步骤 3：当前是密码页，但未识别到“创建密码”标题（标题：${pageState.passwordPageTitle || '未知'}），继续按原流程填写。`, 'warn');
      }
    }

    async function executeStep3(state) {
      const identity = resolveStep3AccountIdentity(state);
      if (!identity.accountIdentifier) {
        if (identity.accountIdentifierType === 'phone') {
          throw new Error('缺少注册手机号，请先完成步骤 2 或在侧栏填写注册手机号后再执行步骤 3。');
        }
        throw new Error('缺少注册账号，请先完成步骤 2。');
      }

      const signupTabId = await getTabId('openai-auth');
      if (!signupTabId || !(await isTabAlive('openai-auth'))) {
        throw new Error('认证页面标签页已关闭，请先重新完成步骤 2。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      await ensureContentScriptReadyOnTab('openai-auth', signupTabId, {
        inject: OPENAI_AUTH_INJECT_FILES,
        injectSource: 'openai-auth',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: '步骤 3：密码页内容脚本未就绪，正在等待页面恢复...',
      });
      await ensureCreatePasswordPageBeforeFill();

      const password = state.customPassword || state.password || generatePassword();
      await setPasswordState(password);

      const accounts = state.accounts || [];
      accounts.push({
        email: identity.email,
        phoneNumber: identity.phoneNumber,
        accountIdentifierType: identity.accountIdentifierType,
        accountIdentifier: identity.accountIdentifier,
        createdAt: new Date().toISOString(),
      });
      await setState({ accounts });

      const identityLabel = identity.accountIdentifierType === 'phone'
        ? `注册手机号为 ${identity.accountIdentifier}`
        : `邮箱为 ${identity.accountIdentifier}`;
      await addLog(
        `步骤 3：正在填写密码，${identityLabel}，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
      );
      await sendToContentScript('openai-auth', {
        type: 'EXECUTE_NODE',
        nodeId: 'fill-password',
        step: 3,
        source: 'background',
        payload: {
          email: identity.email,
          phoneNumber: identity.phoneNumber,
          accountIdentifierType: identity.accountIdentifierType,
          accountIdentifier: identity.accountIdentifier,
          password,
        },
      });
    }

    return { executeStep3 };
  }

  return { createStep3Executor };
});
