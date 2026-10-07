const BASE =
  import.meta.env.VITE_API_URL ||
  'http://localhost:5000/api';

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