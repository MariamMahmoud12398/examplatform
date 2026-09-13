// ===== API Helper =====
const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  const u = localStorage.getItem('user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  const data = await res.json();

  if (res.status === 403 && data.error && data.error.includes('جلسة')) {
    clearAuth();
    window.location.href = '/';
    return;
  }

  return { ok: res.ok, status: res.status, data };
}

function requireAuth(role) {
  const user = getUser();
  const token = getToken();
  if (!user || !token) {
    window.location.href = '/';
    return null;
  }
  if (role && user.role !== role) {
    window.location.href = user.role === 'teacher' ? '/teacher' : '/student';
    return null;
  }
  return user;
}

function showAlert(container, type, message) {
  const icons = { error: '❌', success: '✅', warning: '⚠️', info: 'ℹ️' };
  container.innerHTML = `
    <div class="alert alert-${type}">
      <span>${icons[type] || ''}</span>
      <span>${message}</span>
    </div>`;
  if (type === 'success') {
    setTimeout(() => { container.innerHTML = ''; }, 3000);
  }
}
