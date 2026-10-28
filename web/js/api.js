// Thin API client. Carries the CSRF token, normalises errors, never inlines HTML.

let csrfToken = '';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || 'Something went wrong.');
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function setCsrf(token) {
  csrfToken = token || '';
}

async function request(method, path, body, options = {}) {
  const headers = {};
  let payload;

  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (csrfToken && !['GET', 'HEAD'].includes(method)) {
    headers['x-lifequest-csrf'] = csrfToken;
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');
  }

  if (response.status === 204) return {};

  let data = {};
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data.error || 'error', data.message, data);
  }
  if (data && data.csrfToken) setCsrf(data.csrfToken);
  return data;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),

  // -- auth
  me: () => request('GET', '/api/auth/me'),
  signup: (username, password) => request('POST', '/api/auth/signup', { username, password }),
  login: (username, password) => request('POST', '/api/auth/login', { username, password }),
  logout: () => request('POST', '/api/auth/logout'),
  recover: (username) => request('POST', '/api/auth/recover', { username }),
  resetPassword: (username, code, password) =>
    request('POST', '/api/auth/reset', { username, code, password }),
  onboarding: (payload) => request('POST', '/api/onboarding', payload),

  // -- player
  player: () => request('GET', '/api/player'),
  updateModel: (payload) => request('PATCH', '/api/player/model', payload),
  updatePreferences: (payload) => request('PATCH', '/api/player/preferences', payload),
  skills: () => request('GET', '/api/player/skills'),
  achievements: () => request('GET', '/api/player/achievements'),
  progress: () => request('GET', '/api/player/progress'),
  notifications: () => request('GET', '/api/player/notifications'),
  markNotificationsRead: () => request('POST', '/api/player/notifications/read'),

  // -- quests
  quests: (status = 'open') => request('GET', `/api/quests?status=${encodeURIComponent(status)}`),
  quest: (id) => request('GET', `/api/quests/${id}`),
  ensureDaily: () => request('POST', '/api/quests/daily', {}),
  generateQuest: (domain, kind) => request('POST', '/api/quests/generate', { domain, kind }),
  startQuest: (id) => request('POST', `/api/quests/${id}/start`, {}),
  abandonQuest: (id) => request('POST', `/api/quests/${id}/abandon`, {}),
  submitQuest: (id, proof) => request('POST', `/api/quests/${id}/submit`, proof),
  createCustomQuest: (spec) => request('POST', '/api/quests/custom', spec),
  reviewCustomQuest: (spec) => request('POST', '/api/quests/custom/review', spec),

  // -- chains, paths, guide
  chains: () => request('GET', '/api/chains'),
  startChain: (key) => request('POST', `/api/chains/${encodeURIComponent(key)}/start`, {}),
  paths: () => request('GET', '/api/paths'),
  createPath: (name, notes) => request('POST', '/api/paths', { name, notes }),
  guide: () => request('GET', '/api/guide'),
  askGuide: (message) => request('POST', '/api/guide/ask', { message }),

  // -- uploads + meta
  upload: (file) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request('POST', '/api/uploads', form);
  },
  meta: () => request('GET', '/api/meta'),
};
