import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/services/supabase';

// ── Contenido estático ────────────────────────────────────────────────────────
const SECCIONES = [
  {
    titulo: '1. Responsable de los datos',
    cuerpo: 'CashCach es la aplicación y el sitio responsables del tratamiento de los datos descritos en esta Política de Privacidad. Para cualquier consulta sobre tus datos, puedes contactarnos por el WhatsApp indicado en el directorio de la aplicación o por los canales oficiales.',
  },
  {
    titulo: '2. Datos que recopilamos',
    cuerpo: 'Dependiendo de cómo uses CashCach, podemos recopilar:\n\n• Datos de contacto: nombre, teléfono, correo electrónico y WhatsApp, al registrar una cuenta o una tienda.\n• Ubicación: usamos tu ubicación aproximada o precisa (con tu permiso) para mostrarte comercios y ofertas cercanas.\n• Cámara y fotos: al registrar productos o el perfil de tu tienda, accedemos a la cámara o galería solo cuando tú decides subir una imagen.\n• Datos de pedidos: nombre, dirección de entrega, punto de referencia y método de pago seleccionado, al hacer una compra en una tienda del directorio.\n• Comprobantes de pago: capturas o fotos que subes voluntariamente al reportar un pago.\n• Identificador de notificaciones (push token): para poder enviarte avisos de tus pedidos o solicitudes.\n• Datos de uso: interacciones básicas dentro de la app (por ejemplo, qué secciones visitas) para fines estadísticos internos.',
  },
  {
    titulo: '3. Cómo usamos tus datos',
    cuerpo: 'Usamos tus datos únicamente para:\n\n• Operar las funciones de la app: calculadora de tasas, directorio de tiendas, carrito de compras y Mi Cartera.\n• Mostrar tu tienda o producto en el directorio, si te registras como socio comercial.\n• Procesar y dar seguimiento a tus pedidos entre tú y la tienda correspondiente.\n• Enviarte notificaciones relacionadas con tu actividad (pedidos, solicitudes, aprobaciones).\n• Mejorar la app a partir de estadísticas de uso agregadas.',
  },
  {
    titulo: '4. Con quién compartimos tus datos',
    cuerpo: 'No vendemos tus datos personales a terceros.\n\nCompartimos datos únicamente con los proveedores que necesitamos para operar la app:\n\n• Supabase: nuestra base de datos e infraestructura de almacenamiento (fotos, comprobantes).\n• Firebase Cloud Messaging (Android) y Apple Push Notification service (iOS): para enviarte notificaciones push.\n• La tienda con la que haces un pedido: recibe los datos necesarios para completar esa compra (nombre, dirección, teléfono, referencia de pago).\n\nEstos proveedores solo acceden a los datos necesarios para prestar su servicio y no están autorizados a usarlos con otro fin.',
  },
  {
    titulo: '5. Almacenamiento y seguridad',
    cuerpo: 'Tus datos se almacenan en servidores de Supabase con medidas estándar de seguridad (cifrado en tránsito y control de acceso). Ningún sistema es 100% infalible, pero tomamos precauciones razonables para proteger tu información contra accesos no autorizados.',
  },
  {
    titulo: '6. Menores de edad',
    cuerpo: 'CashCach no está dirigida a menores de 13 años y no recopilamos intencionalmente datos de menores. Si detectamos una cuenta de un menor sin el consentimiento correspondiente, procederemos a eliminarla.',
  },
  {
    titulo: '7. Tus derechos',
    cuerpo: 'Puedes solicitar en cualquier momento:\n\n• Acceder a los datos que tenemos sobre ti.\n• Corregir datos incorrectos o desactualizados.\n• Eliminar tu cuenta, tienda o datos asociados.\n\nPara ejercer estos derechos, contáctanos por WhatsApp o por los canales oficiales de la aplicación. Atendemos estas solicitudes en un plazo razonable.',
  },
  {
    titulo: '8. Permisos del dispositivo',
    cuerpo: 'La app puede solicitarte permisos de Ubicación y Cámara. Estos permisos son opcionales para el funcionamiento general de la app, pero necesarios para funciones específicas (mostrar comercios cercanos, subir fotos de productos). Puedes revocarlos en cualquier momento desde los ajustes de tu dispositivo; algunas funciones dejarán de estar disponibles si lo haces.',
  },
  {
    titulo: '9. Cambios a esta política',
    cuerpo: 'Podemos actualizar esta Política de Privacidad ocasionalmente. Los cambios entran en vigor desde su publicación en esta página. Te recomendamos revisarla periódicamente.',
  },
  {
    titulo: '10. Contacto',
    cuerpo: 'Para consultas o solicitudes relacionadas con tus datos personales, contáctanos por el WhatsApp indicado en el directorio de CashCach o por los canales oficiales de la aplicación.',
  },
];

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function PrivacidadScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [textoDb, setTextoDb] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('config_app').select('valor').eq('clave', 'politica_privacidad').single()
      .then(({ data }) => { if (data?.valor) setTextoDb(data.valor); });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Política de Privacidad</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Intro */}
        <View style={[styles.introBox, { backgroundColor: Colors.accent + '12', borderColor: Colors.accent + '33' }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color={Colors.accent} />
          <Text style={[styles.introTexto, { color: Colors.accent }]}>
            Última actualización: agosto 2026
          </Text>
        </View>

        {/* Si hay contenido en la BD, mostrarlo; si no, secciones estáticas */}
        {textoDb ? (
          <Text style={[styles.textoPlano, { color: Colors.text }]}>{textoDb}</Text>
        ) : (
          SECCIONES.map((sec, i) => (
            <View key={i} style={[styles.seccion, { borderColor: Colors.border }]}>
              <Text style={[styles.seccionTitulo, { color: Colors.text }]}>{sec.titulo}</Text>
              <Text style={[styles.seccionCuerpo, { color: Colors.textMuted }]}>{sec.cuerpo}</Text>
            </View>
          ))
        )}

        <View style={[styles.pie, { borderTopColor: Colors.border }]}>
          <Text style={[styles.pieTexto, { color: Colors.textMuted }]}>
            © 2026 CashCach · Todos los derechos reservados
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(Colors: any) { return StyleSheet.create({
  safe:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },

  body: { padding: Spacing.lg, paddingBottom: 60, gap: Spacing.md },

  introBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  introTexto: { fontSize: FontSize.sm, fontWeight: '600', flex: 1 },

  seccion: {
    borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.md, gap: 8,
  },
  seccionTitulo: { fontSize: FontSize.md, fontWeight: '800', lineHeight: 22 },
  seccionCuerpo: { fontSize: FontSize.sm, lineHeight: 24 },

  textoPlano: { fontSize: FontSize.md, lineHeight: 26 },

  pie: {
    borderTopWidth: 1, paddingTop: Spacing.lg, marginTop: Spacing.sm,
    alignItems: 'center',
  },
  pieTexto: { fontSize: FontSize.xs, textAlign: 'center' },
}); }
