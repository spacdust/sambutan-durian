export const renderLoginPage = (error = '', nonce = '') => `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sambutan Durian - Login Admin</title>
  <style>
    :root{color-scheme:light;font-family:"Inter","Segoe UI",system-ui,sans-serif;--bg:#f8fafc;--panel:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--primary:#10b981;--primary-hover:#059669;--danger:#ef4444;--radius:12px;--shadow:0 10px 25px -5px rgba(0,0,0,.1)}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);padding:20px}
    .card{width:min(420px,100%);background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
    .head{padding:24px;border-bottom:1px solid var(--line);text-align:center}
    .icon{font-size:36px;margin-bottom:8px}
    h1{margin:0;font-size:20px;font-weight:700}
    p{margin:6px 0 0;color:var(--muted);font-size:13px}
    .body{padding:24px}
    .error{margin:0 0 16px;padding:10px 14px;background:#fef2f2;border:1px solid #fee2e2;color:var(--danger);border-radius:8px;font-size:13px}
    label{display:block;margin-bottom:6px;font-size:13px;font-weight:600}
    input{width:100%;height:44px;padding:0 14px;border:1px solid var(--line);border-radius:8px;font-size:15px;outline:none;transition:border-color .2s}
    input:focus{border-color:var(--primary)}
    button{width:100%;height:44px;margin-top:16px;border:0;border-radius:8px;background:var(--primary);color:#fff;font-weight:600;font-size:14px;cursor:pointer;transition:background-color .2s}
    button:hover{background:var(--primary-hover)}
  </style>
</head>
<body>
  <div class="card">
    <div class="head">
      <div class="icon">🍈</div>
      <h1>Sambutan Durian</h1>
      <p>Masuk ke portal web admin WhatsApp</p>
    </div>
    <div class="body">
      ${error ? `<div class="error">${error}</div>` : ''}
      <form method="post" action="/admin/api/auth/login">
        <label for="password">Password Admin</label>
        <input id="password" name="password" type="password" required autofocus placeholder="Masukkan password admin">
        <button type="submit">Masuk ke Portal</button>
      </form>
    </div>
  </div>
</body>
</html>`;
