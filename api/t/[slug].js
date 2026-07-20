const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  const { slug, p } = req.query;
  if (!slug) return res.status(400).send('Slug requerido');

  try {
    // Tiendas sin slug asignado comparten este mismo link con su id (uuid)
    // en vez del slug, para que el preview de WhatsApp siempre pase por aqui
    // en vez de caer directo en admin/tienda.html (cuyas meta tags OG se
    // llenan por JS y un crawler que no ejecuta JS nunca las ve).
    const filtro = RE_UUID.test(slug) ? `id=eq.${encodeURIComponent(slug)}` : `slug=eq.${encodeURIComponent(slug)}`;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/socios_comerciales?${filtro}&select=id,nombre,descripcion,imagen&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await r.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).send(paginaError());
    }

    const { id, nombre, descripcion, imagen } = data[0];

    // Si el link apunta a un producto puntual (?p=), el preview debe mostrar
    // la foto y el titulo de ESE producto, no los genericos de la tienda.
    let producto = null;
    if (p) {
      const rp = await fetch(
        `${SUPABASE_URL}/rest/v1/galeria_items?id=eq.${encodeURIComponent(p)}&socio_id=eq.${encodeURIComponent(id)}&select=titulo,imagen,precio,precio_bs&limit=1`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
      );
      const dp = await rp.json();
      if (Array.isArray(dp) && dp.length > 0) producto = dp[0];
    }

    const titulo = producto
      ? `${producto.titulo} — ${nombre}`
      : `${nombre} — appcashcash`;
    const desc = producto
      ? [producto.precio ? `$${producto.precio}` : null, producto.precio_bs ? `Bs. ${producto.precio_bs}` : null, `Disponible en ${nombre}`]
          .filter(Boolean).join(' · ')
      : (descripcion ? descripcion.slice(0, 120) : 'Descubre esta tienda en appcashcash');
    const img      = (producto && producto.imagen) || imagen || 'https://appcashcash.com/admin/og-default.png';
    const urlCorta = p ? `https://appcashcash.com/t/${slug}?p=${encodeURIComponent(p)}` : `https://appcashcash.com/t/${slug}`;
    const urlDest  = p
      ? `https://appcashcash.com/admin/tienda.html?id=${id}&p=${encodeURIComponent(p)}`
      : `https://appcashcash.com/admin/tienda.html?id=${id}`;

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
    Redirigiendo a <strong>${e(producto ? producto.titulo : nombre)}</strong>…<br>
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
  </head><body><div class="logo">appcashcash</div><p>Esta tienda no está disponible.</p>
  <a href="https://appcashcash.com" style="color:#1a8a7a">Ir al inicio</a></body></html>`;
}
