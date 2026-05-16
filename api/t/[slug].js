const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

module.exports = async function handler(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).send('Slug requerido');

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/socios_comerciales?slug=eq.${encodeURIComponent(slug)}&select=id,nombre,descripcion,imagen&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await r.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).send(paginaError());
    }

    const { id, nombre, descripcion, imagen } = data[0];
    const titulo    = `${nombre} — CashCach`;
    const desc      = descripcion ? descripcion.slice(0, 120) : 'Descubre esta tienda en CashCach';
    const img       = imagen || 'https://appcashcash.com/og-default.png';
    const urlCorta  = `https://appcashcash.com/t/${slug}`;
    const urlDest   = `https://appcashcash.com/admin/tienda.html?id=${id}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(titulo)}</title>
  <meta property="og:type"         content="website">
  <meta property="og:url"          content="${e(urlCorta)}">
  <meta property="og:title"        content="${e(titulo)}">
  <meta property="og:description"  content="${e(desc)}">
  <meta property="og:image"        content="${e(img)}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name"    content="CashCach">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${e(titulo)}">
  <meta name="twitter:description" content="${e(desc)}">
  <meta name="twitter:image"       content="${e(img)}">
  <meta http-equiv="refresh" content="0;url=${e(urlDest)}">
  <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5}.logo{font-size:28px;font-weight:900;color:#1a8a7a;margin-bottom:12px}p{color:#555;font-size:15px}</style>
</head>
<body>
  <div class="logo">CashCach</div>
  <p>Cargando ${e(nombre)}…</p>
  <script>window.location.replace(${JSON.stringify(urlDest)});</script>
</body>
</html>`);

  } catch {
    return res.status(500).send(paginaError());
  }
};

function e(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function paginaError() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>CashCach</title>
  <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5}.logo{font-size:28px;font-weight:900;color:#1a8a7a}p{color:#555}</style>
  </head><body><div class="logo">CashCach</div><p>Esta tienda no está disponible.</p>
  <a href="https://appcashcash.com" style="color:#1a8a7a">Ir al inicio</a></body></html>`;
}
