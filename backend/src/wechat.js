const DEFAULT_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const DEFAULT_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const DEFAULT_PHONE_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';

export function createWeChatExchange({
  appId = process.env.WECHAT_APP_ID,
  appSecret = process.env.WECHAT_APP_SECRET,
  sessionUrl = process.env.WECHAT_SESSION_URL || DEFAULT_SESSION_URL,
  mock = process.env.WECHAT_MOCK === '1' && process.env.NODE_ENV !== 'production',
  fetchImpl = fetch,
} = {}) {
  return async function exchange(code) {
    if (mock) return { providerSubject: `mock:${code}`, unionId: null };
    if (!appId || !appSecret) {
      const error = new Error('微信登录服务尚未配置');
      error.code = 'WECHAT_NOT_CONFIGURED';
      error.status = 503;
      throw error;
    }
    const url = new URL(sessionUrl);
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const response = await fetchImpl(url);
    if (!response.ok) {
      const error = new Error('微信登录服务暂时不可用');
      error.code = 'WECHAT_UPSTREAM_ERROR';
      error.status = 502;
      throw error;
    }
    const payload = await response.json();
    if (!payload.openid || payload.errcode) {
      const error = new Error('微信登录授权失败');
      error.code = 'WECHAT_AUTH_FAILED';
      error.status = 401;
      throw error;
    }
    return { providerSubject: payload.openid, unionId: payload.unionid || null };
  };
}

export function createWeChatPhoneExchange({
  appId = process.env.WECHAT_APP_ID,
  appSecret = process.env.WECHAT_APP_SECRET,
  tokenUrl = process.env.WECHAT_TOKEN_URL || DEFAULT_TOKEN_URL,
  phoneUrl = process.env.WECHAT_PHONE_URL || DEFAULT_PHONE_URL,
  mock = process.env.WECHAT_MOCK === '1' && process.env.NODE_ENV !== 'production',
  fetchImpl = fetch,
} = {}) {
  let accessToken = null;
  let accessTokenExpiresAt = 0;

  async function getAccessToken() {
    if (accessToken && accessTokenExpiresAt > Date.now() + 60_000) return accessToken;
    const url = new URL(tokenUrl);
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);
    url.searchParams.set('grant_type', 'client_credential');
    const response = await fetchImpl(url);
    if (!response.ok) {
      const error = new Error('微信 access_token 服务暂时不可用');
      error.code = 'WECHAT_UPSTREAM_ERROR';
      error.status = 502;
      throw error;
    }
    const payload = await response.json();
    if (!payload.access_token || payload.errcode) {
      const error = new Error('微信 access_token 获取失败');
      error.code = 'WECHAT_AUTH_FAILED';
      error.status = 502;
      throw error;
    }
    accessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + Number(payload.expires_in || 7200) * 1000;
    return accessToken;
  }

  return async function exchangePhone(code) {
    if (mock) return { phoneNumber: '13800000000', purePhoneNumber: '13800000000', countryCode: '86' };
    if (!appId || !appSecret) {
      const error = new Error('微信手机号服务尚未配置');
      error.code = 'WECHAT_NOT_CONFIGURED';
      error.status = 503;
      throw error;
    }
    const response = await fetchImpl(phoneUrl + `?access_token=${encodeURIComponent(await getAccessToken())}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const error = new Error('微信手机号服务暂时不可用');
      error.code = 'WECHAT_UPSTREAM_ERROR';
      error.status = 502;
      throw error;
    }
    const payload = await response.json();
    const phoneInfo = payload.phone_info;
    if (payload.errcode || !phoneInfo || !phoneInfo.phoneNumber) {
      const error = new Error('微信手机号授权已失效，请重新授权');
      error.code = 'WECHAT_PHONE_AUTH_FAILED';
      error.status = 401;
      throw error;
    }
    return {
      phoneNumber: phoneInfo.phoneNumber,
      purePhoneNumber: phoneInfo.purePhoneNumber || phoneInfo.phoneNumber,
      countryCode: phoneInfo.countryCode || '',
    };
  };
}
