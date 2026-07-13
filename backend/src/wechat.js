const DEFAULT_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

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
