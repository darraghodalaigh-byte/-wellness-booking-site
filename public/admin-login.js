const form = document.getElementById('adminLoginForm');
const status = document.getElementById('loginStatus');

function setStatus(message, kind = '') {
  status.textContent = message;
  status.classList.remove('ok', 'error');
  if (kind) status.classList.add(kind);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Signing in...');

  const formData = new FormData(form);
  const payload = {
    username: String(formData.get('username') || '').trim(),
    password: String(formData.get('password') || '').trim()
  };

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Login failed.', 'error');
      return;
    }

    setStatus('Login successful. Redirecting...', 'ok');
    window.location.href = '/admin';
  } catch (_error) {
    setStatus('Network error. Please retry.', 'error');
  }
});
