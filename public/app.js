// Healthcare DevSecOps demo frontend.
// CSP-safe (no inline handlers, no eval). Token kept in memory only — never localStorage.
(() => {
  'use strict';

  const API = ''; // same-origin
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  const state = {
    token: null,
    user: null, // { id, role, name, email }
  };

  // ---------- helpers ----------
  function toast(msg, kind = '') {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + kind;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 3500);
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = (data && (data.error || (data.errors && data.errors[0]?.msg))) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function decodeJwt(t) {
    try {
      const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (p.length % 4)) % 4);
      return JSON.parse(atob(p + pad));
    } catch { return {}; }
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // ---------- views ----------
  function showApp() {
    $('#authPanel').classList.add('hidden');
    $('#appPanel').classList.remove('hidden');
    $('#userBar').classList.remove('hidden');
    $('#whoami').textContent = `${state.user.name} (${state.user.role})`;
    $('#roleKpi').textContent = state.user.role;

    // Patients can only view their own records — hide create form
    if (state.user.role === 'patient') {
      $('#newRecordCard').classList.add('hidden');
    } else {
      $('#newRecordCard').classList.remove('hidden');
      // pre-fill ownerId with self for convenience when role is doctor (they can change)
      $('#recordForm input[name=ownerId]').value = state.user.id;
    }
  }

  function showAuth() {
    $('#authPanel').classList.remove('hidden');
    $('#appPanel').classList.add('hidden');
    $('#userBar').classList.add('hidden');
  }

  // ---------- tab switching ----------
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      const target = btn.dataset.tab;
      $$('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === target + 'Form'));
    });
  });

  // ---------- login ----------
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      state.token = res.token;
      const claims = decodeJwt(res.token);
      state.user = {
        id: claims.sub,
        role: res.role,
        name: res.name,
        email: fd.get('email'),
      };
      toast(`Welcome, ${res.name}`, 'ok');
      showApp();
      await refreshAll();
    } catch (err) {
      toast(err.message || 'Login failed', 'err');
    }
  });

  // ---------- register ----------
  $('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/api/auth/register', {
        method: 'POST',
        auth: false,
        body: {
          email: fd.get('email'),
          password: fd.get('password'),
          name: fd.get('name'),
          role: fd.get('role'),
        },
      });
      toast('Account created — please sign in', 'ok');
      // switch to login tab and prefill
      $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'login'));
      $$('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === 'loginForm'));
      $('#loginForm input[name=email]').value = fd.get('email');
      e.target.reset();
    } catch (err) {
      toast(err.message || 'Registration failed', 'err');
    }
  });

  // ---------- logout ----------
  $('#logoutBtn').addEventListener('click', () => {
    state.token = null;
    state.user = null;
    showAuth();
    toast('Signed out', 'ok');
  });

  // ---------- create record ----------
  $('#recordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    Object.keys(body).forEach((k) => { if (body[k] === '') delete body[k]; });
    try {
      await api('/api/patients', { method: 'POST', body });
      toast('Record created (PHI encrypted at rest)', 'ok');
      e.target.reset();
      $('#recordForm input[name=ownerId]').value = state.user.id;
      await loadRecords();
    } catch (err) {
      toast(err.message || 'Create failed', 'err');
    }
  });

  // ---------- list records ----------
  async function loadRecords() {
    try {
      const records = await api('/api/patients');
      const list = $('#recordsList');
      if (!records.length) {
        list.innerHTML = '<p class="muted">No records yet.</p>';
        return;
      }
      list.innerHTML = records.map((r) => `
        <div class="record">
          <h3>${escapeHtml(r.fullName || '(unnamed)')}</h3>
          <div class="meta">
            ID: ${escapeHtml(r._id)} ·
            Owner: ${escapeHtml(r.ownerId)} ·
            ${r.doctorId ? 'Doctor: ' + escapeHtml(r.doctorId) : 'No doctor'} ·
            Updated: ${escapeHtml(new Date(r.updatedAt).toLocaleString())}
          </div>
          ${r.dateOfBirth ? `<div class="field"><b>DOB:</b> ${escapeHtml(r.dateOfBirth)}</div>` : ''}
          ${r.ssn         ? `<div class="field"><b>SSN:</b> ${escapeHtml(r.ssn)}</div>` : ''}
          ${r.diagnosis   ? `<div class="field"><b>Diagnosis:</b> ${escapeHtml(r.diagnosis)}</div>` : ''}
          ${r.notes       ? `<div class="field"><b>Notes:</b> ${escapeHtml(r.notes)}</div>` : ''}
        </div>
      `).join('');
    } catch (err) {
      toast(err.message || 'Failed to load records', 'err');
    }
  }

  $('#refreshBtn').addEventListener('click', refreshAll);

  // ---------- system stats ----------
  async function loadHealth() {
    try {
      const h = await api('/health', { auth: false });
      $('#healthKpi').textContent = h.status;
      $('#uptimeKpi').textContent = Math.round(h.uptime);
    } catch {
      $('#healthKpi').textContent = 'down';
    }
  }

  async function refreshAll() {
    await Promise.all([loadHealth(), loadRecords()]);
  }

  // ---------- init ----------
  loadHealth();
})();
