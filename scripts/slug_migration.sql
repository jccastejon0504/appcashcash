-- ============================================================
-- Migración: columna slug en socios_comerciales
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Agregar columna slug (única, nullable al inicio)
ALTER TABLE socios_comerciales
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Función auxiliar: convierte nombre → slug limpio
CREATE OR REPLACE FUNCTION slugify(v TEXT) RETURNS TEXT AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        translate(trim(v),
          'áàäâãåéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaaeeeeiiiioooooouuuunncaaaaaaeeeeiiiioooooouuuunnc'
        ),
        '[^a-z0-9\s-]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  );
$$ LANGUAGE SQL IMMUTABLE;

-- 3. Auto-generar slugs únicos para tiendas existentes sin slug
DO $$
DECLARE
  rec RECORD;
  base_slug TEXT;
  candidate TEXT;
  counter   INT;
BEGIN
  FOR rec IN
    SELECT id, nombre FROM socios_comerciales WHERE slug IS NULL
  LOOP
    base_slug := slugify(rec.nombre);
    candidate := base_slug;
    counter   := 2;
    WHILE EXISTS (
      SELECT 1 FROM socios_comerciales WHERE slug = candidate AND id <> rec.id
    ) LOOP
      candidate := base_slug || '-' || counter;
      counter   := counter + 1;
    END LOOP;
    UPDATE socios_comerciales SET slug = candidate WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 4. Agregar restricción UNIQUE ahora que todos tienen slug
ALTER TABLE socios_comerciales
  ADD CONSTRAINT socios_comerciales_slug_unique UNIQUE (slug);

-- 5. Índice para búsquedas rápidas por slug
CREATE INDEX IF NOT EXISTS idx_socios_slug ON socios_comerciales(slug);
