const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).send('Slug requerido');
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/socios_comerciales?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>Tienda no encontrada – CashCach</title>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f4f5}h1{color:#1a8a7a}p{color:#555}</style>
        </head>
        <body>
          <h1>CashCach</h1>
          <p>Esta tienda no está disponible o el link ha cambiado.</p>
          <a href="https://appcashcash.com" style="color:#1a8a7a">Ir al inicio</a>
        </body>
        </html>
      `);
    }

    const id = data[0].id;
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.redirect(301, `https://appcashcash.com/admin/tienda.html?id=${id}`);

  } catch (err) {
    return res.status(500).send('Error interno');
  }
}
