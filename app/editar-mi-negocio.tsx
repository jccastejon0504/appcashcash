import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Image, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/services/supabase';

const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

type Socio = {
  id: string; nombre: string; telefono: string; whatsapp: string;
  web: string; direccion: string;
  imagen: string; imagen2: string; imagen3: string;
  imagen4: string; imagen5: string; imagen6: string;
  fecha_vencimiento: string | null;
};

const GALERIA_KEYS = ['imagen2','imagen3','imagen4','imagen5','imagen6'] as const;

export default function EditarMiNegocioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [socio,     setSocio]     = useState<Socio | null>(null);

  // Campos editables
  const [nombre,    setNombre]    = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [whatsapp,  setWhatsapp]  = useState('');
  const [web,       setWeb]       = useState('');
  const [direccion, setDireccion] = useState('');

  // Renovación
  const [modalRenovar,  setModalRenovar]  = useState(false);
  const [planRenov,     setPlanRenov]     = useState<'mensual'|'anual'>('mensual');
  const [metodoRenov,   setMetodoRenov]   = useState('pagomovil');
  const [referenciaRenov, setReferenciaRenov] = useState('');
  const [comprobanteRenov, setComprobanteRenov] = useState<string|null>(null);
  const [enviandoRenov, setEnviandoRenov] = useState(false);
  const [infoPago,      setInfoPago]      = useState<Record<string,string[]>>({});
  const [metodosPago,   setMetodosPago]   = useState<{id:string;label:string;activo:boolean}[]>([]);
  const [copiado,       setCopiado]       = useState<string|null>(null);

  type Oferta = { precio_original: number | null; precio_oferta: number; descuento_pct: number | null; meses_gratis: number; descripcion: string | null };
  const [ofertas, setOfertas] = useState<{ mensual?: Oferta; anual?: Oferta }>({});

  const PRECIOS = { mensual: 15, anual: 150 };

  // Imágenes (URI local o URL remota)
  const [portada,  setPortada]  = useState<string>('');
  const [galeria,  setGaleria]  = useState<string[]>(['','','','','']);

  useEffect(() => {
    const cargar = async () => {
      const { data } = await supabase
        .from('socios_comerciales').select('*').eq('id', id).single();
      if (data) {
        setSocio(data);
        setNombre(data.nombre ?? '');
        setTelefono(data.telefono ?? '');
        setWhatsapp(data.whatsapp ?? '');
        setWeb(data.web ?? '');
        setDireccion(data.direccion ?? '');
        setPortada(data.imagen ?? '');
        setGaleria([data.imagen2??'', data.imagen3??'', data.imagen4??'', data.imagen5??'', data.imagen6??'']);
      }
      setCargando(false);
    };
    if (id) cargar();
    supabase.from('metodos_pago').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      setMetodosPago(data);
      const mapa: Record<string,string[]> = {};
      data.forEach((m: any) => { mapa[m.id] = m.datos; });
      setInfoPago(mapa);
      if (data[0]) setMetodoRenov(data[0].id);
    });

    supabase.from('planes_ofertas').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const map: { mensual?: Oferta; anual?: Oferta } = {};
      data.forEach((o: any) => { map[o.plan as 'mensual' | 'anual'] = o; });
      setOfertas(map);
    });
  }, [id]);

  const pickImage = (onSelect: (uri: string) => void) => {
    Alert.alert('Agregar foto', '¿Desde dónde?', [
      {
        text: 'Cámara',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara.'); return; }
          const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true, exif: false });
          if (!r.canceled && r.assets[0]) onSelect(r.assets[0].uri);
        },
      },
      {
        text: 'Galería',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería.'); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true, exif: false });
          if (!r.canceled && r.assets[0]) onSelect(r.assets[0].uri);
        },
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const subirImagen = async (uri: string, nombre: string): Promise<string> => {
    if (!uri || uri.startsWith('http')) return uri; // ya es URL remota
    try {
      const path = `socios/${Date.now()}_${nombre}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri, name: `${nombre}.jpg`, type: 'image/jpeg' } as any);
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/socios%20comerciales/${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'x-upsert': 'true' },
        body: formData,
      });
      if (!res.ok) return uri;
      return `${SUPABASE_URL}/storage/v1/object/public/socios%20comerciales/${path}`;
    } catch { return uri; }
  };

  const enviarRenovacion = async () => {
    if (!referenciaRenov.trim()) { Alert.alert('Campo requerido', 'Ingresa el número de referencia.'); return; }
    setEnviandoRenov(true);
    let urlComprobante: string | null = null;
    if (comprobanteRenov) urlComprobante = await subirImagen(comprobanteRenov, 'comprobante_renov');
    const { error } = await supabase.from('solicitudes_socios').insert({
      nombre:      socio?.nombre ?? '',
      telefono:    telefono.trim(),
      whatsapp:    whatsapp.trim(),
      plan:        planRenov,
      metodo_pago: metodoRenov,
      referencia:  referenciaRenov.trim(),
      monto:       ofertas[planRenov]?.precio_oferta ?? PRECIOS[planRenov],
      comprobante: urlComprobante,
      tipo:        'renovacion',
      socio_id:    id,
    });
    setEnviandoRenov(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setModalRenovar(false);
    setReferenciaRenov('');
    setComprobanteRenov(null);
    Alert.alert('¡Solicitud enviada!', 'El equipo de CashCash revisará tu pago y renovará tu membresía.');
  };

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Campo requerido', 'El nombre del negocio no puede estar vacío.'); return; }
    setGuardando(true);

    const urlPortada  = await subirImagen(portada, 'portada');
    const urlsGaleria = await Promise.all(galeria.map((u, i) => subirImagen(u, `foto${i + 2}`)));

    const { error } = await supabase.from('socios_comerciales').update({
      nombre:   nombre.trim(),
      telefono: telefono.trim(),
      whatsapp: whatsapp.trim(),
      web:      web.trim(),
      direccion: direccion.trim(),
      imagen:   urlPortada,
      imagen2:  urlsGaleria[0],
      imagen3:  urlsGaleria[1],
      imagen4:  urlsGaleria[2],
      imagen5:  urlsGaleria[3],
      imagen6:  urlsGaleria[4],
    }).eq('id', id);

    setGuardando(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('¡Listo!', 'Tu perfil fue actualizado.', [{ text: 'OK', onPress: () => router.back() }]);
  };

  if (cargando) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Editar mi negocio</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Agregar otro negocio */}
        <TouchableOpacity
          style={[styles.btnAgregar, { borderColor: Colors.accent }]}
          onPress={() => router.push('/unirse-socio')}
          activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
          <Text style={[styles.btnAgregarText, { color: Colors.accent }]}>Agregar otro negocio</Text>
        </TouchableOpacity>

        {/* Contador membresía */}
        {socio?.fecha_vencimiento && (() => {
          const diasRestantes = Math.ceil((new Date(socio.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const vigente = diasRestantes > 0;
          return (
            <View style={[styles.contadorBox, { backgroundColor: vigente ? Colors.success + '12' : '#ef444412', borderColor: vigente ? Colors.success + '33' : '#ef444433' }]}>
              <View style={styles.contadorFila}>
                <View style={[styles.contadorDot, { backgroundColor: vigente ? Colors.success : '#ef4444' }]} />
                <Text style={[styles.contadorLabel, { color: Colors.textMuted }]}>Membresía:</Text>
                <Text style={[styles.contadorValor, { color: vigente ? Colors.success : '#ef4444' }]}>
                  {vigente ? `${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} restantes` : `Vencida hace ${Math.abs(diasRestantes)}d`}
                </Text>
              </View>
              <View style={styles.contadorFila}>
                <Text style={[styles.contadorLabel, { color: Colors.textMuted }]}>Vence:</Text>
                <Text style={[styles.contadorValor, { color: Colors.textMuted }]}>
                  {new Date(socio.fecha_vencimiento).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Renovar membresía */}
        <TouchableOpacity
          style={[styles.btnRenovar, { borderColor: Colors.accent }]}
          onPress={() => setModalRenovar(true)}>
          <Ionicons name="refresh-circle-outline" size={18} color={Colors.accent} />
          <Text style={[styles.btnRenovarText, { color: Colors.accent }]}>Renovar membresía</Text>
        </TouchableOpacity>

        {/* Portada */}
        <Text style={[styles.seccion, { color: Colors.textMuted }]}>Foto de portada</Text>
        <TouchableOpacity
          style={[styles.portadaSlot, { borderColor: Colors.border, backgroundColor: Colors.card }]}
          onPress={() => pickImage(setPortada)} activeOpacity={0.8}>
          {portada ? (
            <Image source={{ uri: portada }} style={styles.portadaImg} resizeMode="cover" />
          ) : (
            <View style={styles.portadaPlaceholder}>
              <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm }}>Toca para cambiar portada</Text>
            </View>
          )}
          <View style={[styles.editBadge, { backgroundColor: Colors.accent }]}>
            <Ionicons name="camera" size={13} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Galería */}
        <Text style={[styles.seccion, { color: Colors.textMuted }]}>Galería (5 fotos)</Text>
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
                    onPress={() => setGaleria(prev => { const n = [...prev]; n[i] = ''; return n; })}>
                    <Ionicons name="close" size={11} color={Colors.text} />
                  </TouchableOpacity>
                </>
              ) : (
                <Ionicons name="add" size={22} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Datos */}
        <Text style={[styles.seccion, { color: Colors.textMuted }]}>Información del negocio</Text>

        {([
          { label: 'Nombre del negocio *', value: nombre, set: setNombre, placeholder: 'Nombre' },
          { label: 'Teléfono', value: telefono, set: setTelefono, placeholder: '0414-0000000', keyboard: 'phone-pad' },
          { label: 'WhatsApp', value: whatsapp, set: setWhatsapp, placeholder: '0414-0000000', keyboard: 'phone-pad' },
          { label: 'Sitio web', value: web, set: setWeb, placeholder: 'www.ejemplo.com' },
          { label: 'Dirección', value: direccion, set: setDireccion, placeholder: 'Av. Principal, local 1…' },
        ] as any[]).map(({ label, value, set, placeholder, keyboard }) => (
          <View key={label} style={styles.campo}>
            <Text style={[styles.label, { color: Colors.textMuted }]}>{label}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
              value={value} onChangeText={set}
              placeholder={placeholder} placeholderTextColor={Colors.textMuted}
              keyboardType={keyboard ?? 'default'}
            />
          </View>
        ))}

        <TouchableOpacity
          style={[styles.btnGuardar, { backgroundColor: guardando ? Colors.border : Colors.accent }]}
          onPress={guardar} disabled={guardando}>
          {guardando
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnGuardarText}>Guardar cambios</Text>
          }
        </TouchableOpacity>

      </ScrollView>

      {/* Modal renovación */}
      <Modal visible={modalRenovar} animationType="slide" transparent onRequestClose={() => setModalRenovar(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: Colors.card }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <Text style={[styles.modalTitulo, { color: Colors.text }]}>Renovar membresía</Text>
              <TouchableOpacity onPress={() => setModalRenovar(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }} keyboardShouldPersistTaps="handled">

              {/* Selector de plan */}
              <Text style={[styles.label, { color: Colors.textMuted }]}>Selecciona tu plan</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {(['mensual','anual'] as const).map(p => {
                  const oferta = ofertas[p];
                  const activo = planRenov === p;
                  return (
                    <TouchableOpacity key={p} onPress={() => setPlanRenov(p)}
                      style={[styles.planBtn, {
                        borderColor: activo ? Colors.accent : Colors.border,
                        backgroundColor: activo ? Colors.accent + '12' : Colors.card,
                        flex: 1, position: 'relative',
                      }]}>
                      {/* Badge descuento */}
                      {oferta?.descuento_pct ? (
                        <View style={{ position: 'absolute', top: -10, right: -6, backgroundColor: Colors.accent, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>-{oferta.descuento_pct}%</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.planBtnLabel, { color: activo ? Colors.accent : Colors.text }]}>
                        {p === 'mensual' ? 'Mensual' : 'Anual'}
                      </Text>
                      {/* Precio original tachado */}
                      {oferta?.precio_original ? (
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, textDecorationLine: 'line-through' }}>
                          ${oferta.precio_original}
                        </Text>
                      ) : null}
                      {/* Precio principal */}
                      <Text style={[styles.planBtnPrecio, { color: activo ? Colors.accent : Colors.textMuted }]}>
                        ${oferta ? oferta.precio_oferta : PRECIOS[p]}
                      </Text>
                      {/* Meses gratis */}
                      {oferta?.meses_gratis ? (
                        <Text style={[styles.planBtnAhorro, { color: Colors.success }]}>+{oferta.meses_gratis} mes{oferta.meses_gratis !== 1 ? 'es' : ''} gratis</Text>
                      ) : p === 'anual' && !oferta ? (
                        <Text style={[styles.planBtnAhorro, { color: Colors.success }]}>Ahorra $30</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Métodos de pago */}
              <Text style={[styles.label, { color: Colors.textMuted }]}>Método de pago</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {metodosPago.map(m => (
                  <TouchableOpacity key={m.id} onPress={() => setMetodoRenov(m.id)}
                    style={[styles.metodoBtn, {
                      borderColor: metodoRenov === m.id ? Colors.accent : Colors.border,
                      backgroundColor: metodoRenov === m.id ? Colors.accent + '12' : Colors.card,
                      flex: 1,
                    }]}>
                    <Text style={[styles.metodoBtnText, { color: metodoRenov === m.id ? Colors.accent : Colors.textMuted }]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Datos de pago */}
              <View style={[styles.infoPagoBox, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                <Text style={[styles.label, { color: Colors.text, marginBottom: 6 }]}>Datos para el pago:</Text>
                {(infoPago[metodoRenov] ?? []).map((l, i) => {
                  const valor = l.includes(': ') ? l.split(': ').slice(1).join(': ') : l;
                  const key = `${metodoRenov}-${i}`;
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={[styles.infoPagoLinea, { color: Colors.textMuted, flex: 1 }]}>{l}</Text>
                      <TouchableOpacity
                        style={[styles.copiarBtn, { backgroundColor: copiado === key ? Colors.success + '22' : Colors.border }]}
                        onPress={async () => {
                          await Clipboard.setStringAsync(valor);
                          setCopiado(key);
                          setTimeout(() => setCopiado(null), 2000);
                        }}>
                        <Ionicons name={copiado === key ? 'checkmark' : 'copy-outline'} size={13} color={copiado === key ? Colors.success : Colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {/* Referencia */}
              <View style={{ gap: 5 }}>
                <Text style={[styles.label, { color: Colors.textMuted }]}>Número de referencia *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text }]}
                  value={referenciaRenov} onChangeText={setReferenciaRenov}
                  placeholder="Ej: 12345678" placeholderTextColor={Colors.textMuted}
                />
              </View>

              {/* Comprobante */}
              <View style={{ gap: 5 }}>
                <Text style={[styles.label, { color: Colors.textMuted }]}>Foto del comprobante</Text>
                <TouchableOpacity
                  style={[styles.portadaSlot, { borderColor: Colors.border, backgroundColor: Colors.background, height: 110 }]}
                  onPress={() => pickImage(setComprobanteRenov)} activeOpacity={0.8}>
                  {comprobanteRenov ? (
                    <Image source={{ uri: comprobanteRenov }} style={styles.portadaImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.portadaPlaceholder}>
                      <Ionicons name="receipt-outline" size={24} color={Colors.textMuted} />
                      <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>Toca para adjuntar</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.btnGuardar, { backgroundColor: enviandoRenov ? Colors.border : Colors.accent }]}
                onPress={enviarRenovacion} disabled={enviandoRenov}>
                {enviandoRenov
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.btnGuardarText}>Enviar renovación</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  seccion: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },

  portadaSlot: {
    height: 180, borderRadius: Radius.lg, borderWidth: 1.5,
    borderStyle: 'dashed', overflow: 'hidden',
  },
  portadaImg:         { width: '100%', height: '100%' },
  portadaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  editBadge: {
    position: 'absolute', bottom: 10, right: 10,
    padding: 7, borderRadius: 99,
  },

  galeriaRow:  { flexDirection: 'row', gap: Spacing.sm },
  galeriaSlot: {
    flex: 1, aspectRatio: 1, borderRadius: Radius.md, borderWidth: 1.5,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  galeriaImg:  { width: '100%', height: '100%' },
  quitarBtn: {
    position: 'absolute', top: 4, right: 4,
    borderRadius: 99, padding: 3,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
  },

  campo: { gap: 5 },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md,
  },

  btnGuardar: {
    marginTop: Spacing.md, borderRadius: Radius.lg,
    paddingVertical: 15, alignItems: 'center',
  },
  btnGuardarText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  btnRenovar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderRadius: Radius.lg, paddingVertical: 13,
  },
  btnRenovarText: { fontSize: FontSize.md, fontWeight: '700' },
  btnAgregar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, paddingVertical: 11,
  },
  btnAgregarText: { fontSize: FontSize.sm, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalBox:     { borderTopLeftRadius: Radius.lg * 2, borderTopRightRadius: Radius.lg * 2, maxHeight: '90%' },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg, borderBottomWidth: 1 },
  modalTitulo:  { fontSize: FontSize.lg, fontWeight: '800' },

  contadorBox:   { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8 },
  contadorFila:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contadorDot:   { width: 8, height: 8, borderRadius: 4 },
  contadorLabel: { fontSize: FontSize.sm, flex: 1 },
  contadorValor: { fontSize: FontSize.sm, fontWeight: '700' },
  separador:     { height: 1, marginVertical: 2 },

  planBtn: {
    borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md,
    alignItems: 'center', gap: 4,
  },
  planBtnLabel:  { fontSize: FontSize.sm, fontWeight: '700' },
  planBtnPrecio: { fontSize: FontSize.xl, fontWeight: '800' },
  planBtnAhorro: { fontSize: FontSize.xs, fontWeight: '600' },

  metodoBtn: {
    borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 10,
    alignItems: 'center',
  },
  metodoBtnText: { fontSize: 11, fontWeight: '700' },

  infoPagoBox:   { borderRadius: Radius.md, borderWidth: 1, padding: Spacing.md },
  infoPagoLinea: { fontSize: FontSize.sm, fontFamily: 'monospace' },
  copiarBtn:     { padding: 5, borderRadius: Radius.sm },
}); }
