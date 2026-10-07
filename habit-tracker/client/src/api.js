const BASE =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5000/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('token');

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Request failed: ${res.status}`
    );
  }

  return data;
}

export const api = {
  get: (path) =>
    request(path),

  post: (path, body) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  put: (path, body) =>
    request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  del: (path) =>
    request(path, {
      method: 'DELETE',
    }),
};