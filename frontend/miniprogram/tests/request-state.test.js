const assert = require('assert');
const {
  createRequestState, beginLoad, beginSubmit, endSuccess, endError, runRequest,
} = require('../utils/request-state');

const base = createRequestState({ items: [] });
assert.strictEqual(base.loading, false);
assert.strictEqual(base.submitting, false);

const loading = beginLoad(base);
assert.strictEqual(loading.loading, true);
assert.strictEqual(loading.error, '');

assert.strictEqual(beginSubmit({ submitting: true }), null);
const submitting = beginSubmit(base);
assert.strictEqual(submitting.submitting, true);

const ok = endSuccess(submitting, { items: [{ id: 1 }] });
assert.strictEqual(ok.loading, false);
assert.strictEqual(ok.submitting, false);
assert.strictEqual(ok.empty, false);
assert.strictEqual(ok.items.length, 1);

const empty = endSuccess(loading, { items: [] });
assert.strictEqual(empty.empty, true);

const failed = endError(loading, new Error('网络失败'));
assert.strictEqual(failed.loading, false);
assert.strictEqual(failed.error, '网络失败');

let state = createRequestState({ items: [] });
const setState = (patch) => { state = { ...state, ...patch }; };
let serial = 0;
return runRequest({
  getState: () => state,
  setState,
  mode: 'load',
  nextSerial: () => { serial += 1; return serial; },
  currentSerial: () => serial,
  request: () => Promise.resolve({ items: [{ id: 'a' }], nextCursor: null }),
  mapSuccess: (result) => ({ items: result.items, nextCursor: result.nextCursor }),
}).then(() => {
  assert.strictEqual(state.loading, false);
  assert.strictEqual(state.items[0].id, 'a');
  return runRequest({
    getState: () => state,
    setState,
    mode: 'submit',
    request: () => Promise.reject(new Error('提交失败')),
  }).then(() => {
    throw new Error('should reject');
  }).catch((error) => {
    assert.strictEqual(error.message, '提交失败');
    assert.strictEqual(state.submitting, false);
    assert.strictEqual(state.error, '提交失败');
    console.log('request-state tests passed');
  });
});
