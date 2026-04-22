-- ============================================================
-- MIGRACIÓN: 3 planes (Gratis, Básico, Pro)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. planes_ofertas: quitar constraint viejo de plan, agregar columna periodo
ALTER TABLE planes_ofertas DROP CONSTRAINT IF EXISTS planes_ofertas_plan_check;
ALTER TABLE planes_ofertas
  ADD COLUMN IF NOT EXISTS periodo TEXT CHECK (periodo IN ('mensual', 'anual'));

-- Migrar registros existentes: plan='mensual' → basico+mensual, plan='anual' → basico+anual
UPDATE planes_ofertas SET plan = 'basico', periodo = 'mensual'
  WHERE plan = 'mensual' AND periodo IS NULL;
UPDATE planes_ofertas SET plan = 'basico', periodo = 'anual'
  WHERE plan = 'anual' AND periodo IS NULL;

-- Nuevo constraint para plan
ALTER TABLE planes_ofertas DROP CONSTRAINT IF EXISTS planes_ofertas_plan_check2;
ALTER TABLE planes_ofertas ADD CONSTRAINT planes_ofertas_plan_check2
  CHECK (plan IN ('gratis', 'basico', 'pro'));

-- 2. solicitudes_socios: columna periodo + galería extendida
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS periodo TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen7  TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen8  TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen9  TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen10 TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen11 TEXT;
ALTER TABLE solicitudes_socios ADD COLUMN IF NOT EXISTS imagen12 TEXT;

-- 3. socios_comerciales: columna plan + galería extendida
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS plan     TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen7  TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen8  TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen9  TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen10 TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen11 TEXT;
ALTER TABLE socios_comerciales ADD COLUMN IF NOT EXISTS imagen12 TEXT;

-- 4. config_app: precios base por plan y período
INSERT INTO config_app (clave, valor) VALUES
  ('precio_basico_mensual', '15'),
  ('precio_basico_anual',   '150'),
  ('precio_pro_mensual',    '25'),
  ('precio_pro_anual',      '250')
ON CONFLICT (clave) DO NOTHING;

-- (Opcional) migrar claves antiguas si existen
UPDATE config_app SET clave = 'precio_basico_mensual', valor = valor
  WHERE clave = 'precio_mensual'
  AND NOT EXISTS (SELECT 1 FROM config_app WHERE clave = 'precio_basico_mensual');
UPDATE config_app SET clave = 'precio_basico_anual', valor = valor
  WHERE clave = 'precio_anual'
  AND NOT EXISTS (SELECT 1 FROM config_app WHERE clave = 'precio_basico_anual');
