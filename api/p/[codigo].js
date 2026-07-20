const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

// Resuelve el link corto de producto (appcashcash.com/p/{codigo}, generado
// por asegurarCodigoProducto() en la app al compartir) a la ficha del
// producto dentro de su tienda, con el mismo preview de WhatsApp (foto y
// titulo del producto) que ya usa api/t/[slug].js cuando el link trae ?p=.
module.exports = async function handler(req, res) {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).send('Código requerido');

  try {
    const rp = await fetch(
      `${SUPABASE_URL}/rest/v1/galeria_items?codigo=eq.${encodeURIComponent(codigo)}&select=id,titulo,imagen,precio,precio_bs,socio_id&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const dp = await rp.json();
    if (!Array.isArray(dp) || dp.length === 0) return res.status(404).send(paginaError());
    const producto = dp[0];

    const rs = await fetch(
      `${SUPABASE_URL}/rest/v1/socios_comerciales?id=eq.${encodeURIComponent(producto.socio_id)}&select=id,nombre,slug&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const ds = await rs.json();
    if (!Array.isArray(ds) || ds.length === 0) return res.status(404).send(paginaError());
    const tienda = ds[0];

    const titulo   = `${producto.titulo} — ${tienda.nombre}`;
    const desc     = [producto.precio ? `$${producto.precio}` : null, producto.precio_bs ? `Bs. ${producto.precio_bs}` : null, `Disponible en ${tienda.nombre}`]
      .filter(Boolean).join(' · ');
    const img      = producto.imagen || 'https://appcashcash.com/admin/og-default.png';
    const urlCorta = `https://appcashcash.com/p/${codigo}`;
    const urlDest  = `https://appcashcash.com/admin/tienda.html?id=${tienda.id}&p=${producto.id}`;

    // Siempre servir HTML con OG tags.
    // Los crawlers (WhatsApp, Facebook, etc.) no ejecutan JS → leen los meta tags.
    // Los usuarios reales son redirigidos vía JavaScript instantáneamente.
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
  <meta property="og:site_name"    content="appcashcash">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${e(titulo)}">
  <meta name="twitter:description" content="${e(desc)}">
  <meta name="twitter:image"       content="${e(img)}">
</head>
<body>
  <p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#1a8a7a">
    Redirigiendo a <strong>${e(producto.titulo)}</strong>…<br>
    <a href="${e(urlDest)}" style="color:#1a8a7a">Haz clic aquí si no redirige</a>
  </p>
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
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>appcashcash</title>
  <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5}.logo{font-size:28px;font-weight:900;color:#1a8a7a}p{color:#555}</style>
  </head><body><div class="logo">appcashcash</div><p>Este producto no está disponible.</p>
  <a href="https://appcashcash.com" style="color:#1a8a7a">Ir al inicio</a></body></html>`;
}
