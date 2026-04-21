import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/services/supabase';

type Plan = 'mensual' | 'anual';
type MetodoPago = 'pagomovil' | 'zelle' | 'usdt';

const PLANES = {
  mensual: { label: 'Mensual',  precio: 15,  descripcion: 'Renovación cada mes' },
  anual:   { label: 'Anual',    precio: 150, descripcion: 'Ahorra $30 al año' },
};

const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'pagomovil', label: 'Pago Móvil', icon: 'phone-portrait-outline' },
  { key: 'zelle',     label: 'Zelle',      icon: 'send-outline' },
  { key: 'usdt',      label: 'USDT TRC20', icon: 'wallet-outline' },
];


export default function UnirseSocioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [paso,        setPaso]        = useState<1 | 2 | 3 | 4>(1);
  const [guardando,   setGuardando]   = useState(false);
  const [infoPago,    setInfoPago]    = useState<Record<string, string[]>>({});
  const [copiado,     setCopiado]     = useState<string | null>(null);

  type Oferta = { precio_original: number | null; precio_oferta: number; descuento_pct: number | null; meses_gratis: number };
  const [ofertas,    setOfertas]    = useState<{ mensual?: Oferta; anual?: Oferta }>({});
  const [textoPlan,  setTextoPlan]  = useState('');

  // Paso 1
  const [nombre,      setNombre]      = useState('');
  const [ciudad,      setCiudad]      = useState('');
  const [telefono,    setTelefono]    = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');
  const [redes,       setRedes]       = useState('');
  const [direccion,   setDireccion]   = useState('');
  const [descripcion, setDescripcion] = useState('');

  // Imágenes (URIs locales)
  const [portada,   setPortada]   = useState<string | null>(null);
  const [galeria,   setGaleria]   = useState<(string | null)[]>([null, null, null, null, null]);

  // Paso 2
  const [plan, setPlan] = useState<Plan>('mensual');

  // Paso 3
  const [metodo,      setMetodo]      = useState<MetodoPago>('pagomovil');
  const [referencia,  setReferencia]  = useState('');
  const [comprobante, setComprobante] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('metodos_pago').select('id,datos').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const mapa: Record<string, string[]> = {};
      data.forEach(m => { mapa[m.id] = m.datos as string[]; });
      setInfoPago(mapa);
    });

    supabase.from('planes_ofertas').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const map: { mensual?: Oferta; anual?: Oferta } = {};
      data.forEach((o: any) => { map[o.plan as Plan] = o; });
      setOfertas(map);
    });

    supabase.from('config_app').select('valor').eq('clave', 'texto_planes').single()
      .then(({ data }) => { if (data?.valor) setTextoPlan(data.valor); });
  }, []);

  const pickImage = (onSelect: (uri: string) => void) => {
    Alert.alert('Agregar foto', '¿Desde dónde quieres tomar la foto?', [
      {
        text: 'Cámara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5,
            allowsEditing: true,
            exif: false,
          });
          if (!result.canceled && result.assets[0]) onSelect(result.assets[0].uri);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.5,
            allowsEditing: true,
            exif: false,
          });
          if (!result.canceled && result.assets[0]) onSelect(result.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const subirImagen = async (uri: string, nombre: string): Promise<string | null> => {
    try {
      const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';
      const path = `solicitudes/${Date.now()}_${nombre}.jpg`;
      const bucket = 'socios%20comerciales';

      const formData = new FormData();
      formData.append('file', { uri, name: `${nombre}.jpg`, type: 'image/jpeg' } as any);

      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'x-upsert': 'true',
        },
        body: formData,
      });

      if (!res.ok) { console.warn('Upload failed:', await res.text()); return null; }
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    } catch (e) { console.warn('Upload exception:', e); return null; }
  };

  const pasoValido = () => {
    if (paso === 1) return nombre.trim().length > 0 && ciudad.trim().length > 0 && (telefono.trim().length > 0 || whatsapp.trim().length > 0);
    if (paso === 2) return true;
    if (paso === 3) return referencia.trim().length > 0;
    return true;
  };

  const siguiente = () => {
    if (paso < 3) { setPaso(p => (p + 1) as 1|2|3|4); return; }
    enviar();
  };

  const enviar = async () => {
    setGuardando(true);

    // Subir imágenes
    const urlComprobante = comprobante ? await subirImagen(comprobante, 'comprobante') : null;
    const urlPortada = portada ? await subirImagen(portada, 'portada') : null;
    const urlsGaleria = await Promise.all(
      galeria.map((uri, i) => uri ? subirImagen(uri, `foto${i + 2}`) : Promise.resolve(null))
    );

    const { error } = await supabase.from('solicitudes_socios').insert({
      nombre:      nombre.trim(),
      ciudad:      ciudad.trim(),
      telefono:    telefono.trim() || null,
      whatsapp:    whatsapp.trim() || null,
      redes:       redes.trim() || null,
      direccion:   direccion.trim() || null,
      descripcion: descripcion.trim() || null,
      plan,
      metodo_pago: metodo,
      referencia:  referencia.trim(),
      monto:       ofertas[plan]?.precio_oferta ?? PLANES[plan].precio,
      imagen:      urlPortada,
      imagen2:     urlsGaleria[0],
      imagen3:     urlsGaleria[1],
      imagen4:     urlsGaleria[2],
      imagen5:     urlsGaleria[3],
      imagen6:      urlsGaleria[4],
      comprobante:  urlComprobante,
    });
    setGuardando(false);
    if (error) {
      Alert.alert('Error al enviar', error.message);
      return;
    }
    await AsyncStorage.setItem('solicitud_socio_enviada', 'true');
    await AsyncStorage.setItem('socio_telefono', telefono.trim() || whatsapp.trim());
    setPaso(4);
  };

  const renderPaso1 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Información del negocio</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>Cuéntanos sobre tu negocio</Text>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Nombre del negocio *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={nombre} onChangeText={setNombre}
          placeholder="Ej: Panadería La Esperanza"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Ciudad *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={ciudad} onChangeText={setCiudad}
          placeholder="Ej: Barquisimeto, Caracas, Valencia…"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Teléfono</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={telefono} onChangeText={setTelefono}
          placeholder="0414-0000000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>WhatsApp</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={whatsapp} onChangeText={setWhatsapp}
          placeholder="0414-0000000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Redes sociales</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={redes} onChangeText={setRedes}
          placeholder="Ej: @minegocio (Instagram, Facebook…)"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Dirección</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={direccion} onChangeText={setDireccion}
          placeholder="Ej: Av. Libertador, local 5, Barquisimeto"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Descripción breve</Text>
        <TextInput
          style={[styles.input, styles.inputMulti, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={descripcion} onChangeText={setDescripcion}
          placeholder="¿Qué ofreces? Ej: Venta de repuestos y accesorios para vehículos"
          placeholderTextColor={Colors.textMuted}
          multiline numberOfLines={3}
        />
      </View>

      {/* Foto de portada */}
      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Foto de portada</Text>
        <TouchableOpacity
          style={[styles.portadaSlot, { borderColor: Colors.border, backgroundColor: Colors.card }]}
          onPress={() => pickImage(setPortada)} activeOpacity={0.8}>
          {portada ? (
            <Image source={{ uri: portada }} style={styles.portadaImg} resizeMode="cover" />
          ) : (
            <View style={styles.portadaPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />
              <Text style={[styles.portadaTexto, { color: Colors.textMuted }]}>Toca para agregar portada</Text>
            </View>
          )}
          {portada && (
            <TouchableOpacity style={[styles.quitarBtn, { backgroundColor: Colors.card }]}
              onPress={() => setPortada(null)}>
              <Ionicons name="close" size={14} color={Colors.text} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {/* Galería */}
      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Galería (hasta 5 fotos)</Text>
        <View style={styles.galeriaRow}>
          {galeria.map((uri, i) => (
            <TouchableOpacity key={i}
              style={[styles.galeriaSlot, { borderColor: Colors.border, backgroundColor: Colors.card }]}
              onPress={() => pickImage(u => setGaleria(prev => { const n = [...prev]; n[i] = u; return n; }))}
              activeOpacity={0.8}>
              {uri ? (
                <>
                  <Image source={{ uri }} style={styles.galeriaImg} resizeMode="cover" />
                  <TouchableOpacity style={[styles.quitarBtn, { backgroundColor: Colors.card }]}
                    onPress={() => setGaleria(prev => { const n = [...prev]; n[i] = null; return n; })}>
                    <Ionicons name="close" size={12} color={Colors.text} />
                  </TouchableOpacity>
                </>
              ) : (
                <Ionicons name="add" size={22} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderPaso2 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Elige tu plan</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>Selecciona la membresía que más te conviene</Text>
      {textoPlan ? (
        <Text style={{ fontSize: FontSize.sm, color: Colors.accent, fontWeight: '600', marginTop: -8, paddingHorizontal: 2 }}>
          {textoPlan}
        </Text>
      ) : null}

      {(Object.entries(PLANES) as [Plan, typeof PLANES.mensual][]).map(([key, val]) => {
        const activo  = plan === key;
        const oferta  = ofertas[key];
        const precio  = oferta ? oferta.precio_oferta : val.precio;
        const descSub = oferta?.meses_gratis ? `+${oferta.meses_gratis} mes${oferta.meses_gratis !== 1 ? 'es' : ''} gratis` : val.descripcion;
        return (
          <TouchableOpacity key={key} onPress={() => setPlan(key)}
            style={[styles.planCard, { borderColor: activo ? Colors.accent : Colors.border, backgroundColor: activo ? Colors.accent + '12' : Colors.card }]}>
            <View style={styles.planLeft}>
              <View style={[styles.planRadio, { borderColor: activo ? Colors.accent : Colors.border }]}>
                {activo && <View style={[styles.planRadioInner, { backgroundColor: Colors.accent }]} />}
              </View>
              <View style={{ gap: 2 }}>
                <Text style={[styles.planNombre, { color: Colors.text }]}>{val.label}</Text>
                <Text style={[styles.planDesc, { color: oferta?.meses_gratis ? Colors.success : Colors.textMuted }]}>{descSub}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {oferta?.descuento_pct ? (
                <View style={{ backgroundColor: Colors.accent, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>-{oferta.descuento_pct}%</Text>
                </View>
              ) : null}
              {oferta?.precio_original ? (
                <Text style={{ fontSize: 11, color: Colors.textMuted, textDecorationLine: 'line-through' }}>${oferta.precio_original}</Text>
              ) : null}
              <Text style={[styles.planPrecio, { color: activo ? Colors.accent : Colors.text }]}>${precio}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={[styles.beneficios, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
        <Text style={[styles.beneficiosTitulo, { color: Colors.text }]}>Incluye:</Text>
        {[
          'Perfil visible en el Directorio',
          'Galería de hasta 6 fotos',
          'Botones de llamada, WhatsApp y Web',
          'Apareces en búsquedas',
          'Posición destacada (opcional)',
        ].map((b, i) => (
          <View key={i} style={styles.beneficioFila}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
            <Text style={[styles.beneficioTexto, { color: Colors.textMuted }]}>{b}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPaso3 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Realizar pago</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>
        Total a pagar: <Text style={{ color: Colors.accent, fontWeight: '800' }}>${ofertas[plan]?.precio_oferta ?? PLANES[plan].precio}</Text>
      </Text>

      <Text style={[styles.label, { color: Colors.textMuted, marginBottom: 8 }]}>Método de pago</Text>
      <View style={styles.metodosRow}>
        {METODOS.map(m => {
          const activo = metodo === m.key;
          return (
            <TouchableOpacity key={m.key} onPress={() => setMetodo(m.key)}
              style={[styles.metodoBtn, { borderColor: activo ? Colors.accent : Colors.border, backgroundColor: activo ? Colors.accent + '12' : Colors.card }]}>
              <Ionicons name={m.icon as any} size={20} color={activo ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.metodoBtnText, { color: activo ? Colors.accent : Colors.textMuted }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.infoPago, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
        <Text style={[styles.infoPagoTitulo, { color: Colors.text }]}>Datos para el pago:</Text>
        {(infoPago[metodo] ?? []).length === 0 ? (
          <Text style={[styles.infoPagoLinea, { color: Colors.textMuted }]}>Cargando datos…</Text>
        ) : (infoPago[metodo] ?? []).map((l, i) => {
          const valor = l.includes(': ') ? l.split(': ').slice(1).join(': ') : l;
          const yaCopiado = copiado === `${metodo}-${i}`;
          return (
            <View key={i} style={styles.infoPagoFila}>
              <Text style={[styles.infoPagoLinea, { color: Colors.textMuted, flex: 1 }]}>{l}</Text>
              <TouchableOpacity
                style={[styles.copiarBtn, { backgroundColor: yaCopiado ? Colors.success + '22' : Colors.border }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(valor);
                  setCopiado(`${metodo}-${i}`);
                  setTimeout(() => setCopiado(null), 2000);
                }}>
                <Ionicons name={yaCopiado ? 'checkmark' : 'copy-outline'} size={14} color={yaCopiado ? Colors.success : Colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Número de referencia / confirmación *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={referencia} onChangeText={setReferencia}
          placeholder="Ej: 12345678"
          placeholderTextColor={Colors.textMuted}
          keyboardType="default"
        />
      </View>

      {/* Comprobante de pago */}
      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Foto del comprobante</Text>
        <TouchableOpacity
          style={[styles.portadaSlot, { borderColor: Colors.border, backgroundColor: Colors.card }]}
          onPress={() => pickImage(setComprobante)} activeOpacity={0.8}>
          {comprobante ? (
            <Image source={{ uri: comprobante }} style={styles.portadaImg} resizeMode="cover" />
          ) : (
            <View style={styles.portadaPlaceholder}>
              <Ionicons name="receipt-outline" size={28} color={Colors.textMuted} />
              <Text style={[styles.portadaTexto, { color: Colors.textMuted }]}>Toca para adjuntar comprobante</Text>
            </View>
          )}
          {comprobante && (
            <TouchableOpacity style={[styles.quitarBtn, { backgroundColor: Colors.card }]}
              onPress={() => setComprobante(null)}>
              <Ionicons name="close" size={14} color={Colors.text} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.aviso, { backgroundColor: Colors.blue + '11', borderColor: Colors.blue + '33' }]}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.blue} />
        <Text style={[styles.avisoTexto, { color: Colors.blue }]}>
          Una vez revisado tu pago, el equipo de CashCash activará tu perfil y te notificará por WhatsApp.
        </Text>
      </View>
    </View>
  );

  const renderPaso4 = () => (
    <View style={[styles.pasoContainer, styles.exitoContainer]}>
      <View style={[styles.exitoIcono, { backgroundColor: Colors.success + '18' }]}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      </View>
      <Text style={[styles.exitoTitulo, { color: Colors.text }]}>¡Solicitud enviada!</Text>
      <Text style={[styles.exitoTexto, { color: Colors.textMuted }]}>
        Recibimos tu solicitud para <Text style={{ fontWeight: '800', color: Colors.text }}>{nombre}</Text>.{'\n\n'}
        El equipo de CashCash revisará tu pago y activará tu perfil en las próximas horas.{'\n\n'}
        Te contactaremos al WhatsApp que registraste.
      </Text>
      <TouchableOpacity style={[styles.exitoBtn, { backgroundColor: Colors.accent }]} onPress={() => router.back()}>
        <Text style={styles.exitoBtnText}>Volver al inicio</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => paso > 1 && paso < 4 ? setPaso(p => (p - 1) as 1|2|3|4) : router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Unirse como Socio</Text>
        {paso < 4 && <Text style={[styles.pasoIndicador, { color: Colors.textMuted }]}>{paso}/3</Text>}
      </View>

      {/* Barra de progreso */}
      {paso < 4 && (
        <View style={[styles.progresoBarra, { backgroundColor: Colors.border }]}>
          <View style={[styles.progresoFill, { backgroundColor: Colors.accent, width: `${(paso / 3) * 100}%` }]} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {paso === 1 && renderPaso1()}
        {paso === 2 && renderPaso2()}
        {paso === 3 && renderPaso3()}
        {paso === 4 && renderPaso4()}
      </ScrollView>

      {paso < 4 && (
        <View style={[styles.footer, { backgroundColor: Colors.card, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.btnSiguiente, { backgroundColor: pasoValido() ? Colors.accent : Colors.border }]}
            onPress={siguiente} disabled={!pasoValido() || guardando}>
            {guardando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnSiguienteText}>{paso === 3 ? 'Enviar solicitud' : 'Siguiente'}</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  safe:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn:        { padding: 4 },
  headerTitle:    { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  pasoIndicador:  { fontSize: FontSize.sm, fontWeight: '600' },

  progresoBarra:  { height: 3 },
  progresoFill:   { height: 3 },

  body:           { padding: Spacing.lg, paddingBottom: 120 },

  pasoContainer:  { gap: Spacing.lg },
  pasoTitulo:     { fontSize: FontSize.xl, fontWeight: '800' },
  pasoSub:        { fontSize: FontSize.sm, marginTop: -8 },

  campo:          { gap: 6 },
  label:          { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md,
  },
  inputMulti:     { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },

  planCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md, gap: 12,
  },
  planLeft:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  planRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  planRadioInner: { width: 10, height: 10, borderRadius: 5 },
  planNombre:     { fontSize: FontSize.md, fontWeight: '700' },
  planDesc:       { fontSize: FontSize.xs, marginTop: 1 },
  planPrecio:     { fontSize: FontSize.xl, fontWeight: '800' },

  beneficios: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8,
  },
  beneficiosTitulo: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  beneficioFila:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  beneficioTexto:   { fontSize: FontSize.sm },

  metodosRow:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  metodoBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 12,
  },
  metodoBtnText:  { fontSize: 11, fontWeight: '700' },

  infoPago: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 4,
  },
  infoPagoTitulo: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  infoPagoFila:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoPagoLinea:  { fontSize: FontSize.sm, fontFamily: 'monospace' },
  copiarBtn:      { padding: 6, borderRadius: Radius.sm },

  aviso: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md,
  },
  avisoTexto:     { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.lg, borderTopWidth: 1,
  },
  btnSiguiente: {
    borderRadius: Radius.lg, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  btnSiguienteText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  portadaSlot: {
    height: 160, borderRadius: Radius.lg, borderWidth: 1.5,
    borderStyle: 'dashed', overflow: 'hidden',
  },
  portadaImg:         { width: '100%', height: '100%' },
  portadaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  portadaTexto:       { fontSize: FontSize.sm },
  galeriaRow:         { flexDirection: 'row', gap: Spacing.sm },
  galeriaSlot: {
    flex: 1, aspectRatio: 1, borderRadius: Radius.md, borderWidth: 1.5,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  galeriaImg:  { width: '100%', height: '100%' },
  quitarBtn: {
    position: 'absolute', top: 5, right: 5,
    borderRadius: 99, padding: 3,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
  },

  exitoContainer: { alignItems: 'center', paddingTop: Spacing.xxl },
  exitoIcono:     { borderRadius: 60, padding: 20, marginBottom: 8 },
  exitoTitulo:    { fontSize: 24, fontWeight: '800' },
  exitoTexto:     { fontSize: FontSize.md, textAlign: 'center', lineHeight: 24 },
  exitoBtn: {
    marginTop: Spacing.xl, borderRadius: Radius.lg,
    paddingHorizontal: 40, paddingVertical: 15,
  },
  exitoBtnText:   { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },
}); }
