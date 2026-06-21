const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = body?.details?.join(' ') || body?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const api = {
  createUser: (profile) => request('/users', { method: 'POST', body: JSON.stringify(profile) }),
  getUser: (id) => request(`/users/${id}`),
  updateUser: (id, patch) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

  logActivity: (userId, activity) =>
    request(`/users/${userId}/activities`, { method: 'POST', body: JSON.stringify(activity) }),
  getActivities: (userId) => request(`/users/${userId}/activities`),

  getSummary: (userId) => request(`/users/${userId}/summary`),
  getInsights: (userId) => request(`/users/${userId}/insights`),
  simulate: (userId, change) =>
    request(`/users/${userId}/simulate`, { method: 'POST', body: JSON.stringify(change) }),

  getEmissionFactors: () => request('/meta/emission-factors'),
};
