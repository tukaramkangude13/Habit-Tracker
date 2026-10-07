export const getToken = () => localStorage.getItem('token');
export const setToken = (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token'));

async function request(url, method = 'GET', body) {
  const token = getToken();
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && !url.startsWith('/auth/')) { setToken(null); window.dispatchEvent(new Event('auth:logout')); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
export const api = {
  get: (u) => request(u),
  post: (u, b) => request(u, 'POST', b),
  put: (u, b) => request(u, 'PUT', b),
  del: (u) => request(u, 'DELETE'),
};