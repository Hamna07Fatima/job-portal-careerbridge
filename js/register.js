/* register.js – US-01 (job seeker) and US-02 (employer) registration (talks to api/register.php) */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const employerFields = document.getElementById('employerFields');
  const password = document.getElementById('password');

  function setRole(role) {
    const isEmployer = role === 'employer';
    employerFields.classList.toggle('d-none', !isEmployer);
    employerFields.querySelectorAll('input, select').forEach((el) => { el.disabled = !isEmployer; });
    document.getElementById('nameLabel').textContent = isEmployer ? 'Your name (account owner)' : 'Full name';
    document.getElementById('emailLabel').textContent = isEmployer ? 'Work email' : 'Email address';
  }

  form.querySelectorAll('[name="role"]').forEach((r) => r.addEventListener('change', () => setRole(r.value)));
  if (new URLSearchParams(location.search).get('role') === 'employer') {
    document.getElementById('roleEmployer').checked = true;
    setRole('employer');
  }

  UI.initStrengthMeter(password);
  UI.initConfirm(password, document.getElementById('confirm'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    UI.alert(form, '');
    if (!UI.validate(form)) return;

    const role = form.role.value;
    const data = { role, name: form.name.value.trim(), email: form.email.value, password: password.value };
    if (role === 'employer') { data.company = form.company.value.trim(); data.industry = form.industry.value; }

    const btn = document.getElementById('submitBtn');
    UI.loading(btn, true, 'Creating account…');
    try {
      const res = await fetch('api/register.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      if (!result.ok) { UI.loading(btn, false); UI.alert(form, result.error); return; }
      location.href = result.status === 'pending' ? 'login.html?pending=1' : 'login.html?registered=1';
    } catch {
      UI.loading(btn, false);
      UI.alert(form, 'Could not reach the server. Is Apache running?');
    }
  });
});
