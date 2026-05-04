import { supabase } from './supabase';
import { Platform } from 'react-native';

/**
 * Registra un evento de uso en Supabase.
 * Fire-and-forget: nunca bloquea ni lanza errores al componente.
 *
 * tipos:  'apertura_app' | 'tab_click' | 'ficha_tienda'
 * detalle: nombre del tab o nombre de la tienda
 * socioId: id de la tienda (solo para ficha_tienda)
 */
export function registrarEvento(
  tipo: string,
  detalle?: string,
  socioId?: string,
  tiendaNombre?: string,
) {
  supabase.from('eventos_analytics').insert({
    tipo,
    detalle:       detalle       ?? null,
    socio_id:      socioId       ?? null,
    tienda_nombre: tiendaNombre  ?? null,
    plataforma:    Platform.OS,
  }).then(({ error }) => {
    if (error) console.warn('[analytics] error insertando evento:', tipo, error.message);
  });
}
