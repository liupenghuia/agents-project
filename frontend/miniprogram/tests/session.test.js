const assert = require('assert');

let app;
let loginCalls = 0;
let requestStatus = 200;
let removed = 0;
global.App = (definition) => { app = definition; };
global.getApp = () => app;
global.wx = {
  getExtConfigSync: () => ({ apiBaseUrl: 'http://127.0.0.1:3000/' }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  removeStorageSync: () => { removed += 1; },
  login: ({ success }) => { loginCalls += 1; success({ code: 'session-code' }); },
  request: ({ success }) => success(requestStatus === 200
    ? { statusCode: 200, data: { data: { sessionToken: 'token', expiresAt: new Date(Date.now() + 60000).toISOString() } } }
    : { statusCode: 401, data: { error: { code: 'UNAUTHORIZED', message: '登录已失效' } } }),
};

require('../app');
app.onLaunch();
assert.strictEqual(app.globalData.apiBaseUrl, 'http://127.0.0.1:3000');

Promise.all([app.ensureSession(), app.ensureSession()]).then(([first, second]) => {
  assert.strictEqual(loginCalls, 1);
  assert.strictEqual(first.sessionToken, second.sessionToken);
  requestStatus = 401;
  return require('../services/api').listIdentities().then(
    () => assert.fail('expected unauthorized request to reject'),
    (error) => {
      assert.strictEqual(error.statusCode, 401);
      assert.strictEqual(app.globalData.session, null);
      assert.ok(removed >= 2);
    },
  );
}).then(() => console.log('session lifecycle tests passed'));
