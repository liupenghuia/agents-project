const LOCAL_API_BASE_URL = 'http://localhost:3000';

function resolveApiBaseUrl(platform = typeof wx === 'undefined' ? null : wx) {
  try {
    const extConfig = platform && platform.getExtConfigSync ? platform.getExtConfigSync() : null;
    const configured = extConfig && String(extConfig.apiBaseUrl || '').trim();
    return (configured || LOCAL_API_BASE_URL).replace(/\/$/, '');
  } catch (error) {
    return LOCAL_API_BASE_URL;
  }
}

module.exports = { LOCAL_API_BASE_URL, resolveApiBaseUrl };
