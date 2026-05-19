import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItem } from '@/services/storage';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '@/services/supabase';

type Plan      = 'gratis' | 'basico' | 'pro';
type Periodo   = 'mensual' | 'anual';
type PlanKey   = 'basico_mensual' | 'basico_anual' | 'pro_mensual' | 'pro_anual';
type MetodoPago = 'pagomovil' | 'zelle' | 'usdt';
type GaleriaItemLocal = { imagen: string | null; imagen2: string | null; imagen3: string | null; titulo: string; precio: string; precio_bs: string; descripcion: string; };

const PLAN_GALERIA: Record<Plan, number> = { gratis: 3, basico: 6, pro: 12 };

const PLANES_DEF = [
  { key: 'gratis' as Plan, label: 'Gratis', icono: '🆓', galSlots: 3,  free: true  },
  { key: 'basico' as Plan, label: 'Básico', icono: '⭐', galSlots: 6,  free: false },
  { key: 'pro'    as Plan, label: 'Pro',    icono: '🚀', galSlots: 12, free: false },
];

const METODOS: { key: MetodoPago; label: string; icon: string }[] = [
  { key: 'pagomovil', label: 'Pago Móvil', icon: 'phone-portrait-outline' },
  { key: 'zelle',     label: 'Zelle',      icon: 'send-outline' },
  { key: 'usdt',      label: 'USDT TRC20', icon: 'wallet-outline' },
];



export default function UnirseSocioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const { reintentoId, adicional } = useLocalSearchParams<{ reintentoId?: string; adicional?: string }>();
  const esAdicional = adicional === '1';
  const [comprobanteExistente, setComprobanteExistente] = useState<string | null>(null);

  const [paso,      setPaso]      = useState<1|2|3|4|5>(1);
  const [guardando,         setGuardando]         = useState(false);
  const [infoPago,          setInfoPago]          = useState<Record<string, string[]>>({});
  const [copiado,           setCopiado]           = useState<string | null>(null);
  const [planGratisVisible, setPlanGratisVisible] = useState(false);
  const [planBasicoVisible, setPlanBasicoVisible] = useState(true);
  const [planProVisible,    setPlanProVisible]    = useState(false);
  const [tasaBCV,           setTasaBCV]           = useState<number | null>(null);

  type Oferta = { precio_original: number | null; precio_oferta: number; descuento_pct: number | null; meses_gratis: number };
  const [ofertas,          setOfertas]          = useState<Partial<Record<PlanKey, Oferta>>>({});
  const [textoPlan,        setTextoPlan]        = useState('');
  const [gratisMeses,      setGratisMeses]      = useState<number | null>(null);
  const [preciosBase, setPreciosBase] = useState<Record<PlanKey, number>>({
    basico_mensual: 15, basico_anual: 150,
    pro_mensual:    30, pro_anual:    300,
  });

  // Paso 1 – Información
  const [nombre,      setNombre]      = useState('');
  const [ciudad,      setCiudad]      = useState('');
  const [telefono,    setTelefono]    = useState('');
  const [whatsapp,    setWhatsapp]    = useState('');
  const [redes,       setRedes]       = useState('');
  const [direccion,   setDireccion]   = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [coordenadas, setCoordenadas] = useState<{ lat: number; lng: number } | null>(null);
  const [obtenGPS,    setObtenGPS]    = useState(false);
  const [geocodificando, setGeocodificando] = useState(false);

  // Selector ciudad → categoría
  type CiudadItem     = { id: string; nombre: string };
  type SubcatItem     = { id: string; nombre: string };
  const [ciudades,      setCiudades]      = useState<CiudadItem[]>([]);
  const [subcategorias, setSubcategorias] = useState<SubcatItem[]>([]);
  const [ciudadSelId,   setCiudadSelId]   = useState<string | null>(null);
  const [subcatSelId,   setSubcatSelId]   = useState<string | null>(null);
  const [dropCiudad,    setDropCiudad]    = useState(false);
  const [dropSubcat,    setDropSubcat]    = useState(false);
  const [subcatBusq,    setSubcatBusq]    = useState('');

  // Paso 2 – Plan
  const [plan,    setPlan]    = useState<Plan>('basico');
  const [periodo, setPeriodo] = useState<Periodo>('mensual');

  // Paso 3 – Fotos
  const [portada,     setPortada]     = useState<string | null>(null);
  const emptyGalItem = (): GaleriaItemLocal => ({ imagen: null, imagen2: null, imagen3: null, titulo: '', precio: '', precio_bs: '', descripcion: '' });
  const [galeriaData, setGaleriaData] = useState<GaleriaItemLocal[]>(Array(12).fill(null).map(emptyGalItem));

  // Paso 4 – Pago (solo planes pagos)
  const [metodo,      setMetodo]      = useState<MetodoPago>('pagomovil');
  const [referencia,  setReferencia]  = useState('');
  const [comprobante, setComprobante] = useState<string | null>(null);

  // Derived
  const planKey: PlanKey | null = plan !== 'gratis' ? `${plan}_${periodo}` as PlanKey : null;
  const ofertaActual = planKey ? ofertas[planKey] : null;
  const precio       = planKey ? (ofertaActual?.precio_oferta ?? preciosBase[planKey]) : 0;
  const totalPasos   = precio === 0 ? 3 : 4;
  const esPasoFinal  = (precio === 0 && paso === 3) || (precio > 0 && paso === 4);

  useEffect(() => {
    supabase.from('categorias').select('id,nombre').order('orden')
      .then(({ data }) => { if (data) setCiudades(data as CiudadItem[]); });
    supabase.from('subcategorias').select('id,nombre').is('categoria_id', null).order('nombre')
      .then(({ data }) => { if (data) setSubcategorias(data as SubcatItem[]); });

    // Tasa BCV: cache primero, luego API
    getItem<{ usd: number }>('bcv_cache').then(c => { if (c?.usd) setTasaBCV(c.usd); });
    fetch('https://ve.dolarapi.com/v1/dolares/oficiales')
      .then(r => r.json()).then(d => {
        const t = parseFloat(d.promedio ?? d.promedio_real);
        if (!isNaN(t) && t > 0) setTasaBCV(t);
      }).catch(() => {});

    supabase.from('metodos_pago').select('id,datos').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const mapa: Record<string, string[]> = {};
      data.forEach((m: any) => { mapa[m.id] = m.datos as string[]; });
      setInfoPago(mapa);
    });

    supabase.from('planes_ofertas').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const map: Partial<Record<PlanKey, Oferta>> = {};
      data.forEach((o: any) => {
        // El DB guarda plan='basico' + periodo='mensual' por separado
        const key = o.periodo ? `${o.plan}_${o.periodo}` : o.plan;
        if (key) map[key as PlanKey] = o;
      });
      setOfertas(map);
    });

    supabase.from('config_app').select('clave,valor')
      .in('clave', [
        'texto_planes',
        'precio_base_basico_mensual', 'precio_base_basico_anual',
        'precio_base_pro_mensual',    'precio_base_pro_anual',
        'plan_gratis_visible',        'plan_basico_visible',   'plan_pro_visible',
        'gratis_fecha_inicio',        'gratis_fecha_fin',
      ])
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((r: any) => { map[r.clave] = r.valor; });
        if (map.texto_planes) setTextoPlan(map.texto_planes);
        const gratisVis = map.plan_gratis_visible === 'true';
        const basicoVis = map.plan_basico_visible !== 'false';
        const proVis    = map.plan_pro_visible === 'true';
        setPlanGratisVisible(gratisVis);
        setPlanBasicoVisible(basicoVis);
        setPlanProVisible(proVis);
        // Ajustar plan seleccionado al primer plan visible
        if (basicoVis) setPlan('basico');
        else if (proVis) setPlan('pro');
        else if (gratisVis) setPlan('gratis');
        if (map.gratis_fecha_inicio && map.gratis_fecha_fin) {
          const inicio = new Date(map.gratis_fecha_inicio);
          const fin    = new Date(map.gratis_fecha_fin);
          const meses  = (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth());
          setGratisMeses(meses > 0 ? meses : null);
        }
        setPreciosBase({
          basico_mensual: map.precio_base_basico_mensual != null ? parseFloat(map.precio_base_basico_mensual) : 15,
          basico_anual:   map.precio_base_basico_anual   != null ? parseFloat(map.precio_base_basico_anual)   : 150,
          pro_mensual:    map.precio_base_pro_mensual    != null ? parseFloat(map.precio_base_pro_mensual)    : 30,
          pro_anual:      map.precio_base_pro_anual      != null ? parseFloat(map.precio_base_pro_anual)      : 300,
        });
      });
  }, []);

  // Pre-llenar campos si viene de un reintento tras rechazo
  useEffect(() => {
    if (!reintentoId) return;
    supabase
      .from('solicitudes')
      .select('nombre,ciudad,telefono,whatsapp,redes,direccion,descripcion,subcategoria_id,plan,periodo,metodo_pago,referencia,comprobante')
      .eq('id', reintentoId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        if (data.nombre)      setNombre(data.nombre);
        if (data.ciudad)      setCiudad(data.ciudad);
        if (data.telefono)    setTelefono(data.telefono);
        if (data.whatsapp)    setWhatsapp(data.whatsapp);
        if (data.redes)       setRedes(data.redes);
        if (data.direccion)   setDireccion(data.direccion);
        if (data.descripcion) setDescripcion(data.descripcion);
        if (data.subcategoria_id) setSubcatSelId(data.subcategoria_id);
        if (data.plan && ['gratis','basico','pro'].includes(data.plan)) setPlan(data.plan as Plan);
        if (data.periodo && ['mensual','anual'].includes(data.periodo)) setPeriodo(data.periodo as Periodo);
        if (data.metodo_pago) setMetodo(data.metodo_pago as MetodoPago);
        if (data.referencia)  setReferencia(data.referencia);
        if (data.comprobante) setComprobanteExistente(data.comprobante);
      });
  }, [reintentoId]);

  // Geocodificar dirección automáticamente cuando cambia dirección o ciudad
  useEffect(() => {
    if (!direccion.trim() || !ciudad.trim()) return;
    const timer = setTimeout(async () => {
      setGeocodificando(true);
      try {
        const q = encodeURIComponent(`${direccion.trim()}, ${ciudad.trim()}, Venezuela`);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=ve`,
          { headers: { 'User-Agent': 'CashCachApp/1.0' } }
        );
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCoordenadas({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
        }
      } catch { /* sin internet, ignorar */ }
      setGeocodificando(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [direccion, ciudad]);

  const pickImage = (onSelect: (uri: string) => void) => {
    Alert.alert('Agregar foto', '¿Desde dónde quieres tomar la foto?', [
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

  const subirImagen = async (uri: string, nombre: string): Promise<string | null> => {
    try {
      const path   = `solicitudes/${Date.now()}_${nombre}.jpg`;
      const bucket = 'socios%20comerciales';
      const formData = new FormData();
      formData.append('file', { uri, name: `${nombre}.jpg`, type: 'image/jpeg' } as any);
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_KEY}`, 'x-upsert': 'true' },
        body: formData,
      });
      if (!res.ok) return null;
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    } catch { return null; }
  };

  const pasoValido = () => {
    if (paso === 1) return nombre.trim().length > 0 && ciudad.trim().length > 0 &&
      (telefono.trim().length > 0 || whatsapp.trim().length > 0);
    if (paso === 4) return referencia.trim().length > 0 && (comprobante !== null || comprobanteExistente !== null);
    return true;
  };

  const siguiente = () => {
    if (esPasoFinal) { enviar(); return; }
    setPaso(p => (p + 1) as 1|2|3|4|5);
  };

  const enviar = async () => {
    setGuardando(true);

    // Verificar duplicado y límite de tiendas por cliente
    const tel = (telefono.trim() || whatsapp.trim()).replace(/\D/g, '');
    if (tel) {
      const [{ data: solExist }, { data: socioExist }, { data: cfgLimite }] = await Promise.all([
        supabase.from('solicitudes')
          .select('id,nombre').or(`telefono.ilike.%${tel}%,whatsapp.ilike.%${tel}%`)
          .in('estado', ['pendiente', 'aprobado']),
        supabase.from('socios_comerciales')
          .select('id,nombre').or(`telefono.ilike.%${tel}%,whatsapp.ilike.%${tel}%`)
          .eq('activo', true),
        supabase.from('config_app').select('valor').eq('clave', 'limite_tiendas_por_cliente').single(),
      ]);

      const nombreLower = nombre.trim().toLowerCase();
      const dupSol   = solExist?.find(s => s.nombre?.trim().toLowerCase() === nombreLower);
      const dupSocio = socioExist?.find(s => s.nombre?.trim().toLowerCase() === nombreLower);
      if (dupSol || dupSocio) {
        setGuardando(false);
        Alert.alert('Tienda ya registrada', 'Ya existe una tienda con este nombre y teléfono.');
        return;
      }

      // Verificar límite de tiendas por teléfono
      const limite = cfgLimite?.valor ? parseInt(cfgLimite.valor) : 100;
      // Contar únicas (pueden solaparse entre tablas por el mismo registro)
      const idsUnicos = new Set([
        ...(solExist ?? []).map(s => s.nombre?.trim().toLowerCase()),
        ...(socioExist ?? []).map(s => s.nombre?.trim().toLowerCase()),
      ]);
      if (idsUnicos.size >= limite) {
        setGuardando(false);
        Alert.alert(
          'Límite alcanzado',
          `Este número ya tiene ${idsUnicos.size} tienda${idsUnicos.size > 1 ? 's' : ''} registrada${idsUnicos.size > 1 ? 's' : ''}. El límite permitido es ${limite}.`
        );
        return;
      }
    }

    const urlComprobante = comprobante
      ? await subirImagen(comprobante, 'comprobante')
      : (comprobanteExistente ?? null);
    const urlPortada     = portada     ? await subirImagen(portada, 'portada')         : null;

    // Subir catálogo de productos (galería con título/precio)
    const galeriaSlots = PLAN_GALERIA[plan];
    const catalogoSubido = await Promise.all(
      galeriaData.slice(0, galeriaSlots).map(async (item, i) => ({
        imagen:      item.imagen  ? await subirImagen(item.imagen,  `catalogo${i + 1}_1`) : null,
        imagen2:     item.imagen2 ? await subirImagen(item.imagen2, `catalogo${i + 1}_2`) : null,
        imagen3:     item.imagen3 ? await subirImagen(item.imagen3, `catalogo${i + 1}_3`) : null,
        titulo:      item.titulo.trim()      || null,
        precio:      item.precio             || null,
        precio_bs:   item.precio_bs          || null,
        descripcion: item.descripcion.trim() || null,
      }))
    );
    const galeriaDataJson = catalogoSubido.some(it => it.imagen || it.titulo)
      ? JSON.stringify(catalogoSubido) : null;

    const { data: insertData, error } = await supabase.from('solicitudes').insert({
      nombre:          nombre.trim(),
      ciudad:          ciudad.trim(),
      telefono:        telefono.trim() || null,
      whatsapp:        whatsapp.trim() || null,
      redes:           redes.trim() || null,
      direccion:       direccion.trim() || null,
      descripcion:     descripcion.trim() || null,
      subcategoria_id: subcatSelId ?? null,
      plan,
      periodo:      precio > 0 ? periodo : null,
      metodo_pago:  precio > 0 ? metodo  : null,
      referencia:   precio > 0 ? referencia.trim() : '',
      monto:        precio,
      imagen:       urlPortada,
      galeria_data: galeriaDataJson,
      comprobante:  precio > 0 ? urlComprobante : null,
      ...(coordenadas ? { latitud: coordenadas.lat, longitud: coordenadas.lng } : {}),
    }).select('id').single();

    setGuardando(false);
    if (error) { Alert.alert('Error al enviar', error.message); return; }
    if (esAdicional) {
      await AsyncStorage.setItem('solicitud_adicional_enviada', 'true');
    } else {
      await AsyncStorage.setItem('solicitud_socio_enviada', 'true');
      if (insertData?.id) await AsyncStorage.setItem('solicitud_id', insertData.id);
    }
    await AsyncStorage.setItem('socio_telefono', telefono.trim() || whatsapp.trim());
    setPaso(5);
  };

  // ── Renders ──────────────────────────────────────────────────────────────

  const renderPaso1 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Información de mi tienda</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>Cuéntanos sobre tu tienda</Text>

      {([
        { label: 'Nombre de mi tienda *', value: nombre,    set: setNombre,    placeholder: 'Ej: Panadería La Esperanza', hint: 'Una vez aprobada la tienda, el nombre no podrá modificarse.' },
        { label: 'Teléfono',             value: telefono,  set: setTelefono,  placeholder: '0414-0000000', keyboard: 'phone-pad', hint: 'Una vez aprobada la tienda, el teléfono no podrá modificarse.' },
        { label: 'WhatsApp',             value: whatsapp,  set: setWhatsapp,  placeholder: '0414-0000000', keyboard: 'phone-pad' },
        { label: 'Redes sociales / web', value: redes,     set: setRedes,     placeholder: 'Ej: @minegocio' },
        { label: 'Dirección',            value: direccion, set: setDireccion, placeholder: 'Ej: Av. Libertador, local 5' },
      ] as any[]).map(({ label, value, set, placeholder, keyboard, hint }) => (
        <View key={label} style={styles.campo}>
          <Text style={[styles.label, { color: Colors.textMuted }]}>{label}</Text>
          <TextInput
            style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
            value={value} onChangeText={set}
            placeholder={placeholder} placeholderTextColor={Colors.textMuted}
            keyboardType={keyboard ?? 'default'}
          />
          {hint && (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5 }}>
              <Ionicons name="information-circle-outline" size={13} color="#f59e0b" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 11, color: '#f59e0b', flex: 1, lineHeight: 15 }}>{hint}</Text>
            </View>
          )}
        </View>
      ))}

      {/* Botón ubicación GPS */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1.5,
          borderColor: coordenadas ? Colors.accent : Colors.border,
          backgroundColor: coordenadas ? Colors.accent + '12' : Colors.card, marginBottom: 4 }}
        activeOpacity={0.8}
        onPress={async () => {
          setObtenGPS(true);
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permiso denegado', 'Activa la ubicación para marcar tu tienda en el mapa.'); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setCoordenadas({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          } catch { Alert.alert('Error', 'No se pudo obtener la ubicación.'); }
          finally { setObtenGPS(false); }
        }}>
        <Ionicons name={coordenadas ? 'location' : 'location-outline'} size={18} color={coordenadas ? Colors.accent : Colors.textMuted} />
        <Text style={{ flex: 1, fontSize: FontSize.sm, fontWeight: '600', color: coordenadas ? Colors.accent : Colors.textMuted }}>
          {obtenGPS ? 'Obteniendo ubicación GPS…'
            : geocodificando ? 'Buscando dirección en el mapa…'
            : coordenadas ? `✓ Ubicación encontrada · ${coordenadas.lat.toFixed(5)}, ${coordenadas.lng.toFixed(5)}`
            : 'Usar GPS para marcar ubicación exacta'}
        </Text>
        {coordenadas && (
          <TouchableOpacity onPress={() => setCoordenadas(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Selector Ciudad */}
      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Ciudad *</Text>
        <TouchableOpacity
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          onPress={() => { setDropCiudad(v => !v); setDropSubcat(false); }}
          activeOpacity={0.8}>
          <Text style={{ color: ciudadSelId ? Colors.text : Colors.textMuted, fontSize: FontSize.md }}>
            {ciudadSelId ? (ciudades.find(c => c.id === ciudadSelId)?.nombre ?? 'Selecciona…') : 'Selecciona una ciudad…'}
          </Text>
          <Ionicons name={dropCiudad ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        {dropCiudad && (
          <View style={[styles.dropdownList, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            {ciudades.map(c => (
              <TouchableOpacity key={c.id}
                style={[styles.dropdownItem, { borderBottomColor: Colors.border }]}
                onPress={() => { setCiudadSelId(c.id); setCiudad(c.nombre); setDropCiudad(false); }}>
                <Text style={{ color: c.id === ciudadSelId ? Colors.accent : Colors.text, fontWeight: c.id === ciudadSelId ? '700' : '400' }}>{c.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Selector Categoría (global, independiente de ciudad) */}
      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Categoría</Text>
        <TouchableOpacity
          style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          onPress={() => { setDropSubcat(v => !v); setDropCiudad(false); if (dropSubcat) setSubcatBusq(''); }}
          activeOpacity={0.8}>
          <Text style={{ color: subcatSelId ? Colors.text : Colors.textMuted, fontSize: FontSize.md }}>
            {subcatSelId ? (subcategorias.find(s => s.id === subcatSelId)?.nombre ?? 'Selecciona…') : 'Selecciona una categoría…'}
          </Text>
          <Ionicons name={dropSubcat ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        {dropSubcat && (
          <View style={[styles.dropdownList, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
              <TextInput
                style={{ flex: 1, color: Colors.text, fontSize: FontSize.md, padding: 0 }}
                value={subcatBusq} onChangeText={setSubcatBusq}
                placeholder="Buscar categoría…" placeholderTextColor={Colors.textMuted}
                autoFocus
              />
              {subcatBusq.length > 0 && (
                <TouchableOpacity onPress={() => setSubcatBusq('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            {subcategorias.filter(s => s.nombre.toLowerCase().includes(subcatBusq.toLowerCase())).length === 0 ? (
              <View style={styles.dropdownItem}>
                <Text style={{ color: Colors.textMuted }}>Sin resultados</Text>
              </View>
            ) : subcategorias.filter(s => s.nombre.toLowerCase().includes(subcatBusq.toLowerCase())).map(s => (
              <TouchableOpacity key={s.id}
                style={[styles.dropdownItem, { borderBottomColor: Colors.border }]}
                onPress={() => { setSubcatSelId(s.id); setDropSubcat(false); setSubcatBusq(''); }}>
                <Text style={{ color: s.id === subcatSelId ? Colors.accent : Colors.text, fontWeight: s.id === subcatSelId ? '700' : '400' }}>{s.nombre}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Descripción breve</Text>
        <TextInput
          style={[styles.input, styles.inputMulti, { backgroundColor: Colors.card, borderColor: Colors.border, color: Colors.text }]}
          value={descripcion} onChangeText={setDescripcion}
          placeholder="¿Qué ofreces? Ej: Venta de repuestos para vehículos"
          placeholderTextColor={Colors.textMuted}
          multiline numberOfLines={3}
        />
      </View>
    </View>
  );

  const renderPaso2 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Elige tu plan</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>Selecciona la membresía que más te conviene</Text>
      {textoPlan ? (
        <Text style={{ fontSize: FontSize.lg, color: Colors.accent, fontWeight: '700', marginTop: -4, textAlign: 'center' }}>
          {textoPlan}
        </Text>
      ) : null}

      {/* Toggle período (aplica a Básico y Pro) */}
      <View style={[styles.toggleWrap, { backgroundColor: Colors.border }]}>
        {(['mensual', 'anual'] as Periodo[]).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriodo(p)}
            style={[styles.toggleBtn, periodo === p && [styles.toggleBtnActive, { backgroundColor: Colors.card }]]}>
            <Text style={[styles.toggleBtnText, { color: periodo === p ? Colors.accent : Colors.textMuted }]}>
              {p === 'mensual' ? 'Mensual' : 'Anual'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cards de los 3 planes */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
      {PLANES_DEF.filter(p =>
        (p.key === 'gratis' && planGratisVisible) ||
        (p.key === 'basico' && planBasicoVisible) ||
        (p.key === 'pro'    && planProVisible)
      ).map(p => {
        const activo  = plan === p.key;
        const planK   = !p.free ? `${p.key}_${periodo}` as PlanKey : null;
        const oferta  = planK ? ofertas[planK] : null;
        const precioPlan = planK ? (oferta?.precio_oferta ?? preciosBase[planK]) : 0;
        const original   = oferta?.precio_original;
        const descuento  = oferta?.descuento_pct;
        const meses      = oferta?.meses_gratis ?? 0;
        const periodoLabel = periodo === 'anual' ? '/año' : '/mes';

        return (
          <TouchableOpacity key={p.key} onPress={() => setPlan(p.key)}
            activeOpacity={0.85}
            style={[styles.planCard3, {
              borderColor:     activo ? Colors.accent : Colors.border,
              backgroundColor: Colors.card,
              shadowColor: activo ? Colors.accent : '#000',
              shadowOpacity: activo ? 0.18 : 0.06,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: activo ? 6 : 2,
            }]}>

            {/* Badge descuento — esquina superior izquierda */}
            {descuento ? (
              <View style={{ position: 'absolute', top: 10, left: 10, backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{descuento}% off</Text>
              </View>
            ) : null}

            {/* Icono + nombre */}
            <View style={{ alignItems: 'center', marginTop: descuento ? 22 : 4, gap: 4 }}>
              <Text style={{ fontSize: 26 }}>{p.icono}</Text>
              <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: Colors.text }}>Plan {p.label}</Text>
            </View>

            {/* Descripción */}
            <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 4 }}>
              {`Perfil + portada + galería de ${p.galSlots} fotos`}
            </Text>
            {p.free && gratisMeses != null && gratisMeses > 0 && (
              <Text style={{ fontSize: FontSize.xs, color: Colors.success, fontWeight: '700', textAlign: 'center' }}>
                {gratisMeses} {gratisMeses === 1 ? 'mes' : 'meses'} gratis
              </Text>
            )}
            {!p.free && meses > 0 && (
              <Text style={{ fontSize: FontSize.xs, color: Colors.success, fontWeight: '700', textAlign: 'center' }}>
                +{meses} mes{meses !== 1 ? 'es' : ''} gratis
              </Text>
            )}

            {/* Precio */}
            <View style={{ alignItems: 'center', marginTop: 'auto', paddingTop: 10 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: activo ? Colors.accent : Colors.text }}>
                {p.free ? 'Gratis' : `$${precioPlan}`}
              </Text>
              {!p.free && (
                <Text style={{ fontSize: 11, color: Colors.textMuted }}>{periodoLabel}</Text>
              )}
              {original ? (
                <Text style={{ fontSize: 11, color: Colors.textMuted, textDecorationLine: 'line-through', marginTop: 2 }}>
                  Antes ${original}{periodoLabel}
                </Text>
              ) : null}
              {!p.free && tasaBCV && precioPlan > 0 && (
                <Text style={{ fontSize: 10, color: Colors.textMuted, marginTop: 1 }}>
                  Bs {(precioPlan * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              )}
            </View>

            {/* Botón seleccionar */}
            <View style={{ marginTop: 12, borderRadius: Radius.md, overflow: 'hidden' }}>
              <View style={{
                backgroundColor: activo ? Colors.accent : Colors.accent + '18',
                paddingVertical: 9,
                paddingHorizontal: 16,
                alignItems: 'center',
                borderRadius: Radius.md,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: activo ? '#fff' : Colors.accent }} numberOfLines={1}>
                  {activo ? '✓ Elegido' : 'Seleccionar'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
      </View>

      {/* Beneficios del plan seleccionado */}
      <View style={[styles.beneficios, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
        <Text style={[styles.beneficiosTitulo, { color: Colors.text }]}>
          {plan === 'gratis' ? 'Plan Gratis incluye:' : plan === 'basico' ? 'Plan Básico incluye:' : 'Plan Pro incluye:'}
        </Text>
        {([
          'Perfil visible en el Directorio',
          'Foto de portada de tu negocio',
          plan === 'gratis'  && 'Galería de 3 fotos para mostrar tus productos',
          plan === 'basico'  && 'Galería de 6 fotos para mostrar tus productos',
          plan === 'pro'     && 'Galería de 12 fotos para mostrar tus productos',
          plan !== 'gratis'  && 'Botones de llamada, WhatsApp y Web',
          plan !== 'gratis'  && 'Apareces en búsquedas por categoría',
          plan === 'pro'     && 'Posición destacada en búsquedas',
        ] as (string|boolean)[]).filter(Boolean).map((b, i) => (
          <View key={i} style={styles.beneficioFila}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.success} />
            <Text style={[styles.beneficioTexto, { color: Colors.textMuted }]}>{b as string}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderPaso3 = () => {
    const galeriaSlots = PLAN_GALERIA[plan];
    return (
      <View style={styles.pasoContainer}>
        <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Fotos de tu negocio</Text>
        <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>
          {`Portada + ${galeriaSlots} artículo${galeriaSlots !== 1 ? 's' : ''} en catálogo`}
        </Text>

        {/* Portada */}
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

        {/* Catálogo de productos */}
        {galeriaSlots > 0 && (
          <View style={styles.campo}>
            <Text style={[styles.label, { color: Colors.textMuted }]}>
              Catálogo de productos ({galeriaSlots} artículos)
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: -2, marginBottom: 4, lineHeight: 15 }}>
              Opcional — puedes completar o editar esto después desde tu panel
            </Text>
            {Array.from({ length: galeriaSlots }, (_, i) => {
              const item = galeriaData[i];
              return (
                <View key={i} style={[styles.catalogoCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                  {/* 3 slots de imagen */}
                  <View style={{ gap: 4 }}>
                    {(['imagen', 'imagen2', 'imagen3'] as const).map((campo, si) => (
                      <TouchableOpacity key={si}
                        style={[styles.catalogoImagen, { borderColor: si === 0 ? (item[campo] ? Colors.accent : Colors.border) : Colors.border, backgroundColor: Colors.background }]}
                        onPress={() => pickImage(uri => setGaleriaData(prev => { const n = [...prev]; n[i] = { ...n[i], [campo]: uri }; return n; }))}
                        activeOpacity={0.8}>
                        {item[campo] ? (
                          <Image source={{ uri: item[campo]! }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Ionicons name={si === 0 ? 'camera' : 'add'} size={si === 0 ? 22 : 18} color={si === 0 ? Colors.textMuted : Colors.border} />
                        )}
                        {item[campo] && (
                          <TouchableOpacity
                            style={{ position: 'absolute', top: 3, right: 3, backgroundColor: Colors.card, borderRadius: 99, padding: 2 }}
                            onPress={() => setGaleriaData(prev => { const n = [...prev]; n[i] = { ...n[i], [campo]: null }; return n; })}>
                            <Ionicons name="close" size={11} color={Colors.text} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Campos */}
                  <View style={{ flex: 1, gap: 6 }}>
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 8, fontSize: FontSize.sm }]}
                      value={item.titulo}
                      onChangeText={t => setGaleriaData(prev => { const n = [...prev]; n[i] = { ...n[i], titulo: t }; return n; })}
                      placeholder="Nombre / Referencia"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 8, fontSize: FontSize.sm }]}
                        value={item.precio}
                        onChangeText={v => setGaleriaData(prev => {
                          const n = [...prev];
                          const bs = tasaBCV && v && !isNaN(parseFloat(v)) && parseFloat(v) > 0
                            ? (parseFloat(v) * tasaBCV).toFixed(2) : n[i].precio_bs;
                          n[i] = { ...n[i], precio: v, precio_bs: bs };
                          return n;
                        })}
                        placeholder="Precio $"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                      />
                      <TextInput
                        style={[styles.input, { flex: 1, backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 8, fontSize: FontSize.sm }]}
                        value={item.precio_bs}
                        onChangeText={v => setGaleriaData(prev => { const n = [...prev]; n[i] = { ...n[i], precio_bs: v }; return n; })}
                        placeholder={tasaBCV ? `Bs (${tasaBCV.toFixed(0)})` : 'Precio Bs'}
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 8, fontSize: FontSize.sm, minHeight: 56, textAlignVertical: 'top' }]}
                      value={item.descripcion}
                      onChangeText={t => setGaleriaData(prev => { const n = [...prev]; n[i] = { ...n[i], descripcion: t }; return n; })}
                      placeholder="Descripción del producto"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const renderPaso4 = () => (
    <View style={styles.pasoContainer}>
      <Text style={[styles.pasoTitulo, { color: Colors.text }]}>Realizar pago</Text>
      <Text style={[styles.pasoSub, { color: Colors.textMuted }]}>
        Total:{' '}
        <Text style={{ color: Colors.accent, fontWeight: '800' }}>${precio}</Text>
        {' · Plan '}{plan === 'basico' ? 'Básico' : 'Pro'} {periodo}
      </Text>

      <Text style={[styles.label, { color: Colors.textMuted, marginBottom: 8 }]}>Método de pago</Text>
      <View style={styles.metodosRow}>
        {METODOS.map(m => {
          const activo = metodo === m.key;
          return (
            <TouchableOpacity key={m.key} onPress={() => setMetodo(m.key)}
              style={[styles.metodoBtn, {
                borderColor:     activo ? Colors.accent : Colors.border,
                backgroundColor: activo ? Colors.accent + '12' : Colors.card,
              }]}>
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
          const valor     = l.includes(': ') ? l.split(': ').slice(1).join(': ') : l;
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
                <Ionicons name={yaCopiado ? 'checkmark' : 'copy-outline'} size={14}
                  color={yaCopiado ? Colors.success : Colors.textMuted} />
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
          placeholder="Ej: 12345678" placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.campo}>
        <Text style={[styles.label, { color: Colors.textMuted }]}>Foto del comprobante *</Text>
        {/* Preview comprobante anterior (reintento) */}
        {!comprobante && comprobanteExistente && (
          <View style={{ marginBottom: 8, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.accent + '55' }}>
            <Image source={{ uri: comprobanteExistente }} style={{ width: '100%', height: 140 }} resizeMode="cover" />
            <View style={{ backgroundColor: Colors.accent + '18', paddingVertical: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.accent} />
              <Text style={{ fontSize: FontSize.xs, color: Colors.accent, fontWeight: '700', flex: 1 }}>Comprobante anterior · toca abajo para reemplazarlo</Text>
              <TouchableOpacity onPress={() => setComprobanteExistente(null)}>
                <Ionicons name="close-circle-outline" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[styles.portadaSlot, { borderColor: Colors.border, backgroundColor: Colors.card }]}
          onPress={() => pickImage(setComprobante)} activeOpacity={0.8}>
          {comprobante ? (
            <Image source={{ uri: comprobante }} style={styles.portadaImg} resizeMode="cover" />
          ) : (
            <View style={styles.portadaPlaceholder}>
              <Ionicons name="receipt-outline" size={28} color={Colors.textMuted} />
              <Text style={[styles.portadaTexto, { color: Colors.textMuted }]}>
                {comprobanteExistente ? 'Toca para reemplazar el comprobante' : 'Toca para adjuntar comprobante'}
              </Text>
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
          Una vez revisado tu pago, el equipo de CashCach activará tu perfil y te notificará por WhatsApp.
        </Text>
      </View>
    </View>
  );

  const renderPaso5 = () => (
    <View style={[styles.pasoContainer, styles.exitoContainer]}>
      <View style={[styles.exitoIcono, { backgroundColor: Colors.success + '18' }]}>
        <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
      </View>
      <Text style={[styles.exitoTitulo, { color: Colors.text }]}>
        {plan === 'gratis' ? '¡Perfil registrado!' : '¡Solicitud enviada!'}
      </Text>
      <Text style={[styles.exitoTexto, { color: Colors.textMuted }]}>
        {plan === 'gratis'
          ? `Recibimos el perfil de ${nombre}. El equipo revisará y activará tu negocio en el directorio.`
          : `Recibimos tu solicitud para ${nombre}.\n\nEl equipo revisará tu pago y activará tu perfil en las próximas horas.\n\nTe contactaremos al WhatsApp que registraste.`}
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
        <TouchableOpacity
          onPress={() => {
            if (paso === 1 || paso === 5) router.back();
            else setPaso(p => (p - 1) as 1|2|3|4|5);
          }}
          style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Unirse como Socio</Text>
        {paso < 5 && (
          <Text style={[styles.pasoIndicador, { color: Colors.textMuted }]}>{paso}/{totalPasos}</Text>
        )}
      </View>

      {/* Barra de progreso */}
      {paso < 5 && (
        <View style={[styles.progresoBarra, { backgroundColor: Colors.border }]}>
          <View style={[styles.progresoFill, { backgroundColor: Colors.accent, width: `${(paso / totalPasos) * 100}%` }]} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {paso === 1 && renderPaso1()}
        {paso === 2 && renderPaso2()}
        {paso === 3 && renderPaso3()}
        {paso === 4 && renderPaso4()}
        {paso === 5 && renderPaso5()}

        {paso < 5 && (
          <TouchableOpacity
            style={[styles.btnSiguiente, { backgroundColor: pasoValido() ? Colors.accent : Colors.border, marginTop: Spacing.lg }]}
            onPress={siguiente} disabled={!pasoValido() || guardando}>
            {guardando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnSiguienteText}>{esPasoFinal ? 'Enviar solicitud' : 'Siguiente'}</Text>
            }
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  safe:          { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn:       { padding: 4 },
  headerTitle:   { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  pasoIndicador: { fontSize: FontSize.sm, fontWeight: '600' },

  progresoBarra: { height: 3 },
  progresoFill:  { height: 3 },

  body:          { padding: Spacing.lg, paddingBottom: 120 },
  pasoContainer: { gap: Spacing.lg },
  pasoTitulo:    { fontSize: FontSize.xl, fontWeight: '800' },
  pasoSub:       { fontSize: FontSize.sm, marginTop: -8 },

  campo:         { gap: 6 },
  label:         { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md,
  },
  inputMulti:    { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  dropdownList: {
    borderWidth: 1, borderRadius: Radius.md, marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md, paddingVertical: 13, borderBottomWidth: 1,
  },

  /* Toggle período */
  toggleWrap: {
    flexDirection: 'row', borderRadius: Radius.lg, padding: 3, gap: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  toggleBtnText:   { fontSize: FontSize.sm, fontWeight: '700' },

  /* Plan cards (3 planes) */
  planCard3: {
    flex: 1,
    flexDirection: 'column',
    borderRadius: Radius.lg, borderWidth: 1.5, padding: Spacing.md,
  },

  beneficios: {
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 8,
  },
  beneficiosTitulo: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 4 },
  beneficioFila:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  beneficioTexto:   { fontSize: FontSize.sm },

  /* Fotos */
  portadaSlot: {
    height: 160, borderRadius: Radius.lg, borderWidth: 1.5,
    borderStyle: 'dashed', overflow: 'hidden',
  },
  portadaImg:         { width: '100%', height: '100%' },
  portadaPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  portadaTexto:       { fontSize: FontSize.sm },
  galeriaGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  galeriaSlotGrid: {
    width: '31%', aspectRatio: 1, borderRadius: Radius.md, borderWidth: 1.5,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  galeriaImg: { width: '100%', height: '100%' },
  catalogoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Radius.lg, borderWidth: 1, padding: 10,
  },
  catalogoImagen: {
    width: 80, height: 80, borderRadius: Radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  quitarBtn: {
    position: 'absolute', top: 5, right: 5,
    borderRadius: 99, padding: 3,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3,
  },

  /* Pago */
  metodosRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
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
  avisoTexto:    { flex: 1, fontSize: FontSize.xs, lineHeight: 18 },

  btnSiguiente: {
    borderRadius: Radius.lg, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  btnSiguienteText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  /* Éxito */
  exitoContainer: { alignItems: 'center', paddingTop: Spacing.xxl },
  exitoIcono:     { borderRadius: 60, padding: 20, marginBottom: 8 },
  exitoTitulo:    { fontSize: 24, fontWeight: '800' },
  exitoTexto:     { fontSize: FontSize.md, textAlign: 'center', lineHeight: 24 },
  exitoBtn: {
    marginTop: Spacing.xl, borderRadius: Radius.lg,
    paddingHorizontal: 40, paddingVertical: 15,
  },
  exitoBtnText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },
}); }
