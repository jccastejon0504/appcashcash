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
    titulo: '1. Aceptación de los Términos',
    cuerpo: 'Al descargar, instalar o utilizar la aplicación CashCach, aceptas quedar vinculado por estos Términos y Condiciones. Si no estás de acuerdo con alguna parte de estos términos, no debes utilizar la aplicación.',
  },
  {
    titulo: '2. Descripción del Servicio',
    cuerpo: 'CashCach es una aplicación de utilidad financiera que ofrece:\n\n• Mi Tienda: directorio de comercios locales — compra en tiendas cercanas o abre la tuya propia para vender.\n• Mi Cartera: lleva el control de tus compras y, si vendes, de tus pedidos, reportes de ventas y clientes.\n• Calculadora de cambio con tasas BCV y USDT en tiempo real.',
  },
  {
    titulo: '3. Tasas de Cambio',
    cuerpo: 'Las tasas mostradas en la aplicación son obtenidas de fuentes públicas externas (BCV, DolarAPI, Binance P2P) y pueden tener un desfase de hasta 4 horas con respecto a la tasa oficial. CashCach no garantiza la exactitud, completitud ni vigencia de las tasas en tiempo real. No somos responsables de decisiones financieras tomadas con base en los datos mostrados.',
  },
  {
    titulo: '4. Módulo Mi Tienda — Socios Comerciales',
    cuerpo: 'Los comercios que aparecen en el Directorio son registros proporcionados voluntariamente por sus propietarios. CashCach actúa como plataforma de publicación y no es responsable de la calidad, disponibilidad, precios ni veracidad de la información publicada por cada negocio.\n\nLas membresías de socios (Plan Básico y Plan Pro) requieren pago previo. Los pagos son procesados directamente entre el usuario y CashCach mediante los métodos habilitados. Una vez confirmado el pago, la activación del perfil puede tomar hasta 24 horas hábiles.',
  },
  {
    titulo: '5. Pagos y Reembolsos',
    cuerpo: 'Los pagos de membresía son no reembolsables una vez que el perfil del negocio ha sido activado. En caso de error en el pago o duplicidad, el usuario debe contactarnos por WhatsApp dentro de las 24 horas siguientes a la transacción para gestionar la corrección.',
  },
  {
    titulo: '6. Conducta del Usuario',
    cuerpo: 'El usuario se compromete a:\n\n• No publicar información falsa, engañosa o ilegal en su perfil de negocio.\n• No utilizar la aplicación para fines fraudulentos o actividades ilícitas.\n• No intentar acceder a partes de la aplicación o base de datos que no le corresponden.\n• Mantener actualizados los datos de contacto de su negocio.',
  },
  {
    titulo: '7. Contenido y Usos Prohibidos',
    cuerpo: 'Está estrictamente prohibido usar CashCach para publicar, compartir, vender, comprar o promocionar:\n\n• Pornografía o contenido sexual explícito de cualquier tipo.\n• Explotación o abuso sexual infantil (CSAM) en cualquier forma — tolerancia cero. Cualquier cuenta o contenido detectado será eliminado de inmediato y reportado a las autoridades competentes y organismos especializados (como NCMEC).\n• Armas de fuego, armas blancas, municiones, explosivos, réplicas de armas o cualquier tipo de armamento — su venta, compra, intercambio o promoción está completamente prohibida, sin excepción.\n• Fraude, estafas, esquemas piramidales, suplantación de identidad o cualquier intento de engañar a otros usuarios.\n• Venta o promoción de otros productos o servicios ilegales, como drogas ilícitas, medicamentos sin regulación o artículos robados.\n• Contenido violento, discurso de odio, acoso, amenazas o discriminación por raza, género, religión, orientación sexual o cualquier otra condición.\n• Spam, phishing, malware o cualquier intento de comprometer la seguridad de otros usuarios o de la plataforma.\n• Suplantación de otra tienda, marca o persona sin autorización.\n\nEl incumplimiento de esta sección puede resultar en la suspensión o eliminación inmediata de la cuenta o tienda, sin previo aviso, y en la denuncia ante las autoridades correspondientes cuando la ley lo exija o lo amerite.',
  },
  {
    titulo: '8. Privacidad de Datos',
    cuerpo: 'La información proporcionada al registrar un negocio (nombre, teléfono, dirección, imágenes) es publicada de forma visible en el directorio de la aplicación. Al enviar esta información, el usuario autoriza expresamente su publicación.\n\nCashCach no vende ni comparte datos personales con terceros con fines comerciales. Los datos son almacenados en Supabase con medidas estándar de seguridad. Para más detalle, consulta nuestra Política de Privacidad.',
  },
  {
    titulo: '9. Propiedad Intelectual',
    cuerpo: 'El diseño, código, marca y contenido de CashCach son propiedad de sus desarrolladores. Queda prohibida la reproducción, distribución o modificación de cualquier parte de la aplicación sin autorización expresa por escrito.',
  },
  {
    titulo: '10. Limitación de Responsabilidad',
    cuerpo: 'CashCach se proporciona "tal como está". No garantizamos disponibilidad continua del servicio ni ausencia de errores. En ningún caso CashCach será responsable de pérdidas económicas derivadas del uso de la aplicación, incluyendo pérdidas por tasas incorrectas, decisiones de compra/venta o transacciones comerciales.',
  },
  {
    titulo: '11. Modificaciones',
    cuerpo: 'Nos reservamos el derecho de actualizar estos Términos en cualquier momento. Los cambios entran en vigor desde su publicación en la aplicación. El uso continuado de CashCach implica la aceptación de los términos vigentes.',
  },
  {
    titulo: '12. Contacto',
    cuerpo: 'Para consultas, reclamos o soporte relacionado con estos términos, puedes contactarnos a través del WhatsApp indicado en el directorio de CashCach o por los canales oficiales de la aplicación.',
  },
];

// ── Pantalla ──────────────────────────────────────────────────────────────────
export default function TerminosScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [textoDb, setTextoDb] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('config_app').select('valor').eq('clave', 'terminos_condiciones').single()
      .then(({ data }) => { if (data?.valor) setTextoDb(data.valor); });
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Términos y Condiciones</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Intro */}
        <View style={[styles.introBox, { backgroundColor: Colors.accent + '12', borderColor: Colors.accent + '33' }]}>
          <Ionicons name="document-text-outline" size={22} color={Colors.accent} />
          <Text style={[styles.introTexto, { color: Colors.accent }]}>
            Última actualización: abril 2025
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
            © 2025 CashCach · Todos los derechos reservados
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
