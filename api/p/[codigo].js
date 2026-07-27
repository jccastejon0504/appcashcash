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
      `${SUPABASE_URL}/rest/v1/galeria_items?codigo=eq.${encodeURIComponent(codigo)}&select=id,titulo,imagen,precio,precio_bs,categoria_id,socio_id&limit=1`,
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

    const rpr = await fetch(
      `${SUPABASE_URL}/rest/v1/promociones_tienda?tienda_id=eq.${encodeURIComponent(producto.socio_id)}&select=*`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const dpr = await rpr.json();
    const promo = Array.isArray(dpr) && dpr.length > 0 ? dpr[0] : null;

    const descPct = descuentoProductoPct(producto, promo);
    const precioDesc = descPct > 0 ? precioConDescuento(producto.precio, descPct) : null;

    const titulo   = `${producto.titulo} — ${tienda.nombre}`;
    const precioTxt = producto.precio
      ? (precioDesc != null ? `$${precioDesc} (antes $${producto.precio}, -${descPct}%)` : `$${producto.precio}`)
      : null;
    const bsTxt = producto.precio_bs
      ? `Bs. ${producto.precio_bs}${precioDesc != null ? ' (no aplica oferta)' : ''}`
      : null;
    const desc     = [precioTxt, bsTxt, `Disponible en ${tienda.nombre}`]
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
  <p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#FB8C50">
    Redirigiendo a <strong>${e(producto.titulo)}</strong>…<br>
    <a href="${e(urlDest)}" style="color:#FB8C50">Haz clic aquí si no redirige</a>
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

// Misma logica que descuentoProductoPct/precioConDescuento en admin/tienda.html
// y src/features/tienda/models/promociones.ts de la app nativa — mantener
// sincronizadas si cambia la regla de promociones.
function descuentoProductoPct(item, promo, metodo) {
  if (!promo) return 0;
  const esBs = metodo === 'pago_movil' || metodo === 'transferencia';
  if (promo.tipo_activo === 'todos') {
    if (esBs) return 0;
    return promo.descuento_todos_pct || 0;
  }
  if (promo.tipo_activo === 'categoria' && item.categoria_id) {
    const d = (promo.descuentos_categoria || []).find(d => d.categoria_id === item.categoria_id && d.activo);
    if (!d) return 0;
    const metodosActivos = d.metodos ?? ['zelle', 'usdt'];
    if (metodo) {
      const clave = esBs ? 'bs' : metodo;
      return metodosActivos.includes(clave) ? (d.pct || 0) : 0;
    }
    return metodosActivos.length > 0 ? (d.pct || 0) : 0;
  }
  return 0;
}

function precioConDescuento(precio, pct) {
  const p = parseFloat(precio);
  if (isNaN(p)) return null;
  if (pct <= 0) return p;
  return +(p * (1 - pct / 100)).toFixed(2);
}

function paginaError() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>appcashcash</title>
  <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5}.logo{font-size:28px;font-weight:900;color:#FB8C50}p{color:#555}</style>
  </head><body><div class="logo">appcashcash</div><p>Este producto no está disponible.</p>
  <a href="https://appcashcash.com" style="color:#FB8C50">Ir al inicio</a></body></html>`;
}
