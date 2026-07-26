const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — Pago</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Roboto:wght@400;500&display=block" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<style>
.admin-shell{display:grid;place-items:center;min-height:100vh;padding:24px}
.admin-card{width:min(420px,100%);padding:32px;border:var(--border-thick);border-radius:var(--shape-lg);background:var(--surface);box-shadow:var(--shadow-idle)}
.admin-card h1{margin:0 0 4px;font-family:var(--font-heading);font-size:clamp(1.8rem,4vw,2.2rem);font-weight:800;letter-spacing:-0.03em;color:var(--text-main)}
.admin-card h2{margin:0 0 24px;font-family:var(--font-heading);font-size:1rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.12em}
.admin-card label{display:grid;gap:8px;margin-bottom:16px;font-family:var(--font-heading);font-size:0.75rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)}
.admin-card input{width:100%;min-height:48px;border:var(--border-thick);border-radius:var(--shape-sm);padding:0 14px;font-family:var(--font-body);font-weight:400;font-size:1rem;color:var(--text-main);background:var(--bg-base);box-shadow:2px 2px 0 var(--ink);outline:none}
.admin-card input:focus{background:var(--input-focus);box-shadow:4px 4px 0 var(--ink)}
.admin-card button[type=submit]{width:100%;min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;font-family:var(--font-heading);font-weight:600;border-radius:var(--shape-pill);border:var(--border-thick);box-shadow:var(--shadow-idle);background:var(--primary);color:var(--on-primary);cursor:pointer;transition:transform 0.1s ease,box-shadow 0.1s ease,background-color 0.3s ease}
.admin-card button[type=submit]:hover{transform:translateY(-2px) translateX(-2px);box-shadow:6px 6px 0 var(--ink)}
.admin-card button[type=submit]:active{transform:translateY(4px) translateX(4px);box-shadow:0 0 0 var(--ink)}
.error-message{margin:16px 0 0;font-family:var(--font-body);font-size:0.875rem;color:var(--error)}
.back-link{display:inline-block;margin-bottom:20px;font-family:var(--font-heading);font-size:0.875rem;font-weight:600;color:var(--text-muted);text-decoration:none}
.back-link:hover{color:var(--text-main)}
</style>
</head>
<body>
<div class="admin-shell">
<div class="admin-card">
<a href="/" class="back-link">&larr; Back to pages</a>
<h1>Pago</h1>
<h2>Admin</h2>
<form id="loginForm">
<label>
<span>Token</span>
<input type="password" id="tokenInput" placeholder="Enter admin token" required autocomplete="off">
</label>
<button type="submit">Login</button>
</form>
<p id="error" class="error-message" hidden></p>
</div>
</div>
<script>
document.getElementById('loginForm').addEventListener('submit', async function(e) {
e.preventDefault()
var token = document.getElementById('tokenInput').value.trim()
var errorEl = document.getElementById('error')
errorEl.hidden = true
if (!token) return
try {
var res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token }) })
var data = await res.json()
if (data.ok) {
localStorage.setItem('pago_admin_token', token)
window.location.href = '/'
} else if (data.error === 'token_not_configured') {
errorEl.textContent = 'Admin token not configured on server'
errorEl.hidden = false
} else {
errorEl.textContent = 'Invalid token'
errorEl.hidden = false
}
} catch(e) {
errorEl.textContent = 'Connection error'
errorEl.hidden = false
}
})
</script>
</body>
</html>`

export async function onRequest() {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
