/* ==========================================================
   auth.js – Business logic for M1 (US-01 to US-04).
   Replace the Store calls with API requests when a backend exists.
   ========================================================== */
const Auth = {
  /** New company accounts must be approved by an admin before they can log in (US-21). Set to false to approve automatically. */
  EMPLOYER_NEEDS_APPROVAL: true,
  MAX_ATTEMPTS: 5,
  LOCK_MS: 30000,

  // Demo-only encoding so plain-text passwords are never stored.
  hash: (s) => btoa(unescape(encodeURIComponent('cb$' + s))),
  users: () => Store.get('users', []),

  /** Creates two demo accounts the first time the app runs. */
  seed() {
    if (Store.get('seeded')) return;
    const now = new Date().toISOString();
    Store.set('users', [
      { id: 1, role: 'seeker', name: 'Ayesha Khan', email: 'seeker@demo.com', password: this.hash('Demo@1234'), createdAt: now },
      { id: 2, role: 'employer', name: 'Bilal Ahmed', company: 'Nexa Technologies', industry: 'Information Technology', email: 'employer@demo.com', password: this.hash('Demo@1234'), createdAt: now }
    ]);
    Store.set('seeded', true);
  },

  /** US-01 / US-02: register a job seeker or an employer. */
  register(data) {
    if (!['seeker', 'employer'].includes(data.role)) return { ok: false, error: 'Choose a valid account type.' }; // admin accounts can never be self-registered
    const users = this.users();
    const email = data.email.trim().toLowerCase();
    if (users.some((u) => u.email === email)) {
      return { ok: false, error: 'An account with this email already exists. Try logging in instead.' };
    }
    const status = data.role === 'employer' && this.EMPLOYER_NEEDS_APPROVAL ? 'pending' : 'active'; // 'active' | 'pending' | 'suspended'
    const user = { ...data, email, id: Date.now(), status, password: this.hash(data.password), createdAt: new Date().toISOString() };
    users.push(user);
    Store.set('users', users);
    return { ok: true, user };
  },

  /** US-03: log in (with a short lock-out after repeated failures). */
  login(email, password, remember) {
    const lock = Store.get('lock');
    if (lock && Date.now() < lock.until) {
      return { ok: false, error: `Too many failed attempts. Try again in ${Math.ceil((lock.until - Date.now()) / 1000)} seconds.` };
    }
    const user = this.users().find((u) => u.email === email.trim().toLowerCase());
    if (!user || user.password !== this.hash(password)) {
      const attempts = Store.get('attempts', 0) + 1;
      Store.set('attempts', attempts);
      if (attempts >= this.MAX_ATTEMPTS) {
        Store.set('lock', { until: Date.now() + this.LOCK_MS });
        Store.set('attempts', 0);
      }
      return { ok: false, error: 'Incorrect email or password.' };
    }
    Store.set('attempts', 0);
    // Status is only revealed after the password is correct, so it cannot be used to probe other people's accounts.
    if (user.status === 'pending') return { ok: false, error: 'Your company account is waiting for admin approval. You will be able to log in once it has been approved.' };
    if (user.status === 'suspended') return { ok: false, error: 'This account has been suspended. Please contact the CareerBridge support team.' };
    this.logout();
    const session = JSON.stringify({ id: user.id, role: user.role, name: user.name, email: user.email, company: user.company || null });
    (remember ? localStorage : sessionStorage).setItem('cb_session', session);
    return { ok: true, user };
  },

  /** The signed-in user. A session ends automatically if the account was deleted, suspended or is not approved. */
  session() {
    const raw = sessionStorage.getItem('cb_session') || localStorage.getItem('cb_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const account = this.users().find((u) => u.id === s.id);
    if (!account || ['suspended', 'pending'].includes(account.status)) { this.logout(); return null; }
    return s;
  },

  logout() {
    sessionStorage.removeItem('cb_session');
    localStorage.removeItem('cb_session');
  },

  /** Page guard: send visitors without a session to the login page. */
  guard() {
    if (!this.session()) location.replace('login.html');
  },

  /** US-04, step 1: generate a 6-digit reset code (stands in for the email). */
  requestReset(email) {
    const user = this.users().find((u) => u.email === email.trim().toLowerCase());
    if (!user) return { ok: true, code: null }; // same response either way: no account enumeration
    const code = String(Math.floor(100000 + Math.random() * 900000));
    Store.set('reset', { email: user.email, code, expires: Date.now() + 10 * 60 * 1000 });
    return { ok: true, code };
  },

  /** US-04, step 2: verify the code. */
  verifyReset(email, code) {
    const r = Store.get('reset');
    if (!r || r.email !== email.trim().toLowerCase()) return { ok: false, error: 'No reset request found for this email.' };
    if (Date.now() > r.expires) return { ok: false, error: 'This code has expired. Request a new one.' };
    if (r.code !== code.trim()) return { ok: false, error: 'That code is incorrect.' };
    return { ok: true };
  },

  /** US-04, step 3: save the new password. */
  resetPassword(email, code, newPassword) {
    if (!this.verifyReset(email, code).ok) return { ok: false, error: 'Reset session is no longer valid.' };
    const users = this.users();
    users.find((u) => u.email === email.trim().toLowerCase()).password = this.hash(newPassword);
    Store.set('users', users);
    Store.remove('reset');
    return { ok: true };
  }
};
/** The administrator account for the demo (created once, also for browsers that already have data). */
Auth.seedAdmin = function () {
  if (this.users().some((u) => u.role === 'admin')) return;
  Store.set('users', [...this.users(), { id: 1000, role: 'admin', name: 'Platform Admin', email: 'admin@careerbridge.com', password: this.hash('Admin@1234'), status: 'active', createdAt: new Date().toISOString() }]);
};
Auth.seed();
Auth.seedAdmin();
