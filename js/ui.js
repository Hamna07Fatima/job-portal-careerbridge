/* ==========================================================
   ui.js – Reusable interface helpers (toasts, validation,
   password toggle, strength meter, button loading state).
   ========================================================== */
const UI = {
  toast(message, type = 'success', delay = 7000) {
    let box = document.getElementById('toastBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toastBox';
      box.className = 'toast-container position-fixed top-0 end-0 p-3';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'alert');
    el.innerHTML = '<div class="d-flex"><div class="toast-body"></div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>';
    el.querySelector('.toast-body').textContent = message;
    box.appendChild(el);
    el.addEventListener('hidden.bs.toast', () => el.remove());
    new bootstrap.Toast(el, { delay }).show();
  },

  /** Shows (or clears) an inline alert at the top of a form. */
  alert(form, message, type = 'danger') {
    let a = form.querySelector('.form-alert');
    if (!a) { a = document.createElement('div'); a.setAttribute('role', 'alert'); form.prepend(a); }
    a.className = `form-alert alert alert-${type}${message ? '' : ' d-none'}`;
    a.textContent = message;
  },

  validate(form) {
    form.classList.add('was-validated');
    if (!form.checkValidity()) { form.querySelector(':invalid')?.focus(); return false; }
    return true;
  },

  loading(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${label}`; }
    else { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
  },

  /** Wires every .btn-toggle to show/hide its password field. */
  initPasswordToggles() {
    document.querySelectorAll('.btn-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
        btn.setAttribute('aria-pressed', show);
      });
    });
  },

  /** Strength score 0–4 based on length and character variety. */
  strength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) s++;
    return s;
  },

  initStrengthMeter(input) {
    const meter = document.getElementById(input.dataset.meter);
    const bar = meter.querySelector('.strength-bar');
    const text = meter.nextElementSibling;
    const levels = [['0%', '#C9D5DC', 'Use at least 8 characters with a letter and a number.'], ['25%', '#D64545', 'Weak'], ['50%', '#F4B942', 'Fair'], ['75%', '#5BAA6A', 'Good'], ['100%', '#0E7C7B', 'Strong']];
    input.addEventListener('input', () => {
      const [w, c, t] = levels[input.value ? this.strength(input.value) : 0];
      bar.style.width = w; bar.style.background = c; text.textContent = t;
    });
  },

  /** Keeps a "confirm password" field in sync with the password field. */
  initConfirm(pw, confirm) {
    const check = () => confirm.setCustomValidity(confirm.value && confirm.value !== pw.value ? 'Passwords do not match' : '');
    pw.addEventListener('input', check); confirm.addEventListener('input', check);
  },

  /** Navbar buttons change depending on whether a user is signed in. */
  renderNav() {
    const box = document.getElementById('navActions');
    if (!box) return;
    box.innerHTML = Auth.session()
      ? '<a class="btn btn-outline-ink btn-sm" href="dashboard.html">Dashboard</a>'
      : '<a class="btn btn-outline-ink btn-sm me-2" href="login.html">Log in</a><a class="btn btn-brand btn-sm" href="register.html">Create account</a>';
  }
};
document.addEventListener('DOMContentLoaded', () => { UI.initPasswordToggles(); UI.renderNav(); });

/* ---------- M8: small chart and stat-card helpers shared by the admin and statistics pages ---------- */
UI.esc = (t = '') => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };
UI.stat = (value, label, extraClass = '') => `<div class="stat ${extraClass}"><div class="stat-num">${UI.esc(String(value))}</div><div class="stat-label">${UI.esc(label)}</div></div>`;
/** Horizontal bar chart from [[label, number], ...]. Pure HTML and CSS, so it works offline. */
UI.bars = (entries, { cls = '', max } = {}) => {
  if (!entries.length) return '<p class="text-muted-cb small mb-0">No data yet.</p>';
  const top = max || Math.max(1, ...entries.map((e) => e[1]));
  return entries.map(([label, value]) => `<div class="bar-row"><span class="bar-label" title="${UI.esc(label)}">${UI.esc(label)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill ${cls}" style="width:${Math.round((value / top) * 100)}%"></div></div><span class="bar-val">${value}</span></div>`).join('');
};
