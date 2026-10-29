// Keep browser requests same-origin. Vite proxies /api locally, and Vercel
// routes it to the API deployment via client/vercel.json in production.
const BASE = '/api';

export const getToken = () => {
  return localStorage.getItem('token');
};

export const setToken = (token) => {
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }
};

async function request(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${BASE}${path}`, {
    ...options,

    headers: {
      'Content-Type': 'application/json',

      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),

      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed: ${res.status}`
    );
  }

  return data;
}

export const api = {
  get: (path) => {
    return request(path);
  },

  post: (path, body) => {
    return request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  put: (path, body) => {
    return request(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  del: (path) => {
    return request(path, {
      method: 'DELETE',
    });
  },
};
