/**
 * Small request state machine helper for Mini Program pages.
 * Keeps loading / empty / error / pending transitions consistent.
 */

function createRequestState(extra = {}) {
  return {
    loading: false,
    loadingMore: false,
    submitting: false,
    error: '',
    empty: false,
    ...extra,
  };
}

function beginLoad(state = {}) {
  return { ...state, loading: true, error: '', empty: false };
}

function beginLoadMore(state = {}) {
  return { ...state, loadingMore: true, error: '' };
}

function beginSubmit(state = {}) {
  if (state.submitting) return null;
  return { ...state, submitting: true, error: '' };
}

function endSuccess(state = {}, patch = {}) {
  const items = patch.items;
  const empty = Array.isArray(items) ? items.length === 0 : Boolean(patch.empty);
  return {
    ...state,
    loading: false,
    loadingMore: false,
    submitting: false,
    error: '',
    empty,
    ...patch,
  };
}

function endError(state = {}, error) {
  const message = error && error.message ? error.message : String(error || '请求失败，请稍后重试');
  return {
    ...state,
    loading: false,
    loadingMore: false,
    submitting: false,
    error: message,
  };
}

function clearError(state = {}) {
  return { ...state, error: '' };
}

/**
 * Run an async request with serial protection and state transitions.
 * @param {object} options
 * @param {() => object} options.getState
 * @param {(patch: object) => void} options.setState
 * @param {() => Promise<any>} options.request
 * @param {'load'|'loadMore'|'submit'} [options.mode]
 * @param {(result: any, state: object) => object} [options.mapSuccess]
 * @param {() => number} [options.nextSerial] optional serial bump
 * @param {() => number} [options.currentSerial]
 */
function runRequest({
  getState,
  setState,
  request,
  mode = 'load',
  mapSuccess,
  nextSerial,
  currentSerial,
}) {
  const before = getState() || {};
  let nextState = before;
  if (mode === 'load') nextState = beginLoad(before);
  else if (mode === 'loadMore') nextState = beginLoadMore(before);
  else if (mode === 'submit') {
    nextState = beginSubmit(before);
    if (!nextState) return Promise.resolve(null);
  }
  const serial = nextSerial ? nextSerial() : null;
  setState(nextState);

  return Promise.resolve()
    .then(() => request())
    .then((result) => {
      if (serial !== null && currentSerial && serial !== currentSerial()) return null;
      const mapped = mapSuccess ? mapSuccess(result, getState() || nextState) : { result };
      setState(endSuccess(getState() || nextState, mapped));
      return result;
    })
    .catch((error) => {
      if (serial !== null && currentSerial && serial !== currentSerial()) return null;
      setState(endError(getState() || nextState, error));
      throw error;
    });
}

module.exports = {
  createRequestState,
  beginLoad,
  beginLoadMore,
  beginSubmit,
  endSuccess,
  endError,
  clearError,
  runRequest,
};
