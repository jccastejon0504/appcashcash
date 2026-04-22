-- ============================================================
-- Tabla: galeria_items
-- Galería tipo catálogo con título y precio por imagen
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS galeria_items (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  socio_id   UUID        NOT NULL,
  imagen     TEXT        NOT NULL,
  titulo     TEXT,
  precio     TEXT,
  orden      INT         DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE galeria_items ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer y escribir (mismo patrón que el resto de tablas)
CREATE POLICY "galeria_items_all" ON galeria_items
  FOR ALL USING (true) WITH CHECK (true);
