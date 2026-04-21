-- ============================================================
-- Tabla: planes_ofertas
-- Gestiona las promociones/descuentos para planes mensual/anual
-- ============================================================

CREATE TABLE IF NOT EXISTS planes_ofertas (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  plan             TEXT        NOT NULL CHECK (plan IN ('mensual', 'anual')),
  precio_original  NUMERIC(10,2) NOT NULL,
  precio_oferta    NUMERIC(10,2) NOT NULL,
  descuento_pct    INTEGER,                    -- ej: 79  → muestra "-79%"
  meses_gratis     INTEGER     DEFAULT 0,      -- ej: 3   → muestra "+3 mes(es) gratis"
  descripcion      TEXT,                       -- tagline del plan
  activo           BOOLEAN     DEFAULT false,
  fecha_inicio     DATE,
  fecha_fin        DATE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Permitir lectura y escritura desde la clave anon (panel admin local)
ALTER TABLE planes_ofertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon puede leer"   ON planes_ofertas FOR SELECT USING (true);
CREATE POLICY "anon puede crear"  ON planes_ofertas FOR INSERT WITH CHECK (true);
CREATE POLICY "anon puede editar" ON planes_ofertas FOR UPDATE USING (true);
CREATE POLICY "anon puede borrar" ON planes_ofertas FOR DELETE USING (true);
