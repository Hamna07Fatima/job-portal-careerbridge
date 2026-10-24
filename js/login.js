/* login.js – US-03 login (talks to api/login.php) */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const q = new URLSearchParams(location.search);
  if (q.get('registered')) UI.alert(form, 'Account created. You can log in now.', 'success');
  if (q.get('pending')) UI.alert(form, 'Account created. A company account must be approved by an admin before you can log in.', 'info');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!UI.validate(form)) return;
    const btn = document.getElementById('submitBtn');
    UI.loading(btn, true, 'Logging in…');
    try {
      const res = await fetch('api/login.php', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, password: form.password.value, remember: form.remember.checked })
      });
      const result = await res.json();
      if (!result.ok) { UI.loading(btn, false); UI.alert(form, result.error); return; }
      location.href = 'dashboard.html';
    } catch {
      UI.loading(btn, false);
      UI.alert(form, 'Could not reach the server. Is Apache running?');
    }
  });
});
