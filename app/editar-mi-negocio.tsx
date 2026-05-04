import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert, Image, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getItem } from '@/services/storage';

type Plan    = 'gratis' | 'basico' | 'pro';
type Periodo = 'mensual' | 'anual';
type PlanKey = 'basico_mensual' | 'basico_anual' | 'pro_mensual' | 'pro_anual';

const PLAN_GALERIA: Record<string, number> = { gratis: 3, basico: 6, pro: 12 };

type Ciudad     = { id: string; nombre: string };
type Subcategoria = { id: string; nombre: string; categoria_id: string };

type Socio = {
  id: string; nombre: string; telefono: string; whatsapp: string;
  web: string; direccion: string; descripcion: string;
  subcategoria_id: string | null;
  imagen: string;
  imagen2: string; imagen3: string; imagen4: string;
  imagen5: string; imagen6: string; imagen7: string;
  imagen8: string; imagen9: string; imagen10: string;
  imagen11: string; imagen12: string;
  fecha_vencimiento: string | null;
  plan: Plan | null;
  nombre_bloqueado?: boolean;
  telefono_bloqueado?: boolean;
};

export default function EditarMiNegocioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [resolvedId, setResolvedId] = useState<string | undefined>(id);
  const [cargando,      setCargando]      = useState(true);
  const [guardando,     setGuardando]     = useState(false);
  const [socio,         setSocio]         = useState<Socio | null>(null);
  const [limiteTiendas, setLimiteTiendas] = useState(100);
  const [totalTiendas,  setTotalTiendas]  = useState(0);

  // Campos editables
  const [nombre,    setNombre]    = useState('');
  const [ciudad,    setCiudad]    = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [whatsapp,  setWhatsapp]  = useState('');
  const [web,         setWeb]         = useState('');
  const [direccion,   setDireccion]   = useState('');
  const [descripcion, setDescripcion] = useState('');

  // Selector ciudad → categoría
  const [ciudades,       setCiudades]       = useState<Ciudad[]>([]);
  const [subcategorias,  setSubcategorias]  = useState<Subcategoria[]>([]);
  const [ciudadSelId,    setCiudadSelId]    = useState<string | null>(null);
  const [subcatSelId,    setSubcatSelId]    = useState<string | null>(null);
  const [dropCiudad,     setDropCiudad]     = useState(false);
  const [dropSubcat,     setDropSubcat]     = useState(false);
  const [subcatBusq,     setSubcatBusq]     = useState('');

  const subcatsFiltradas = subcategorias;

  // Renovación
  const [modalRenovar,     setModalRenovar]     = useState(false);
  const [planRenov,        setPlanRenov]        = useState<Exclude<Plan,'gratis'>>('basico');
  const [periodoRenov,     setPeriodoRenov]     = useState<Periodo>('mensual');
  const [metodoRenov,      setMetodoRenov]      = useState('pagomovil');
  const [referenciaRenov,  setReferenciaRenov]  = useState('');
  const [comprobanteRenov, setComprobanteRenov] = useState<string|null>(null);
  const [enviandoRenov,    setEnviandoRenov]    = useState(false);
  const [renovEnviada,     setRenovEnviada]     = useState(false);
  const [infoPago,         setInfoPago]         = useState<Record<string,string[]>>({});
  const [metodosPago,      setMetodosPago]      = useState<{id:string;label:string;activo:boolean}[]>([]);
  const [copiado,          setCopiado]          = useState<string|null>(null);

  type Oferta = { precio_original: number | null; precio_oferta: number; descuento_pct: number | null; meses_gratis: number; descripcion: string | null };
  const [ofertas,     setOfertas]     = useState<Partial<Record<PlanKey, Oferta>>>({});
  const [preciosBase, setPreciosBase] = useState<Record<PlanKey, number>>({
    basico_mensual: 15, basico_anual: 150,
    pro_mensual:    30, pro_anual:    300,
  });

  // Imágenes (URI local o URL remota)
  const [portada, setPortada] = useState<string>('');

  // Catálogo de galería con título y precio
  type ItemGaleria = { id?: string; imagen: string; imagen2: string; imagen3: string; titulo: string; precio: string; precio_bs: string; descripcion: string; orden: number };
  const [galeriaItems,    setGaleriaItems]    = useState<ItemGaleria[]>([]);
  const [guardandoCat,    setGuardandoCat]    = useState(false);
  const [tasaBCV,         setTasaBCV]         = useState<number | null>(null);
  const [galeriaLoadedAt, setGaleriaLoadedAt] = useState(0);

  // GPS
  const [coordenadas, setCoordenadas] = useState<{ lat: number; lng: number } | null>(null);
  const [obtenGPS,    setObtenGPS]    = useState(false);

  const toDMS = (deg: number, esLat: boolean) => {
    const dir = esLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'O');
    const abs = Math.abs(deg);
    const d   = Math.floor(abs);
    const mAll= (abs - d) * 60;
    const m   = Math.floor(mAll);
    const s   = ((mAll - m) * 60).toFixed(2);
    return `${d}° ${m}' ${s}" ${dir}`;
  };

  const capturarGPS = async () => {
    setObtenGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a tu ubicación para guardar las coordenadas.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setCoordenadas({ lat, lng });
      Alert.alert('Ubicación capturada', `${toDMS(lat, true)}\n${toDMS(lng, false)}\n\nPresiona Guardar para actualizar.`);
    } catch (e) {
      Alert.alert('Error GPS', 'No se pudo obtener la ubicación.');
    } finally {
      setObtenGPS(false);
    }
  };

  useEffect(() => {
    const cargar = async () => {
      let socioId: string | undefined = id;

      // Si no hay id (abierto desde Tab Bar), buscar por teléfono guardado
      if (!socioId) {
        const tel = await AsyncStorage.getItem('socio_telefono');
        if (!tel) {
          setCargando(false);
          router.replace('/unirse-socio');
          return;
        }
        const digits = tel.replace(/\D/g, '');
        const { data: found } = await supabase
          .from('socios_comerciales')
          .select('id')
          .or(`telefono.ilike.%${digits}%,whatsapp.ilike.%${digits}%`)
          .limit(1)
          .maybeSingle();
        if (!found) {
          setCargando(false);
          router.replace('/unirse-socio');
          return;
        }
        socioId = found.id;
        setResolvedId(socioId);
      }

      const [{ data }, { data: ciu }, { data: subcats }, { data: cfgLimite }, { data: cfgLock }] = await Promise.all([
        supabase.from('socios_comerciales').select('*').eq('id', socioId).single(),
        supabase.from('categorias').select('id,nombre').order('orden'),
        supabase.from('subcategorias').select('id,nombre').is('categoria_id', null).order('nombre'),
        supabase.from('config_app').select('valor').eq('clave', 'limite_tiendas_por_cliente').single(),
        supabase.from('config_app').select('clave,valor').in('clave', [`lock_nombre_${socioId}`, `lock_tel_${socioId}`]),
      ]);
      const limite = cfgLimite?.valor ? parseInt(cfgLimite.valor) : 100;
      setLimiteTiendas(limite);
      if (ciu)     setCiudades(ciu as Ciudad[]);
      if (subcats) setSubcategorias(subcats as Subcategoria[]);
      if (data) {
        const lockMap = Object.fromEntries((cfgLock ?? []).map((r: any) => [r.clave, r.valor]));
        setSocio({
          ...data,
          nombre_bloqueado:   lockMap[`lock_nombre_${socioId}`] === 'true',
          telefono_bloqueado: lockMap[`lock_tel_${socioId}`]    === 'true',
        });
        setNombre(data.nombre ?? '');
        setCiudad(data.ciudad ?? '');
        setTelefono(data.telefono ?? '');
        setWhatsapp(data.whatsapp ?? '');
        setWeb(data.redes ?? data.web ?? '');
        setDireccion(data.direccion ?? '');
        setDescripcion(data.descripcion ?? '');
        setPortada(data.imagen ?? '');
        // Preseleccionar ciudad guardada
        if (data.ciudad && ciu) {
          const ciudadMatch = (ciu as Ciudad[]).find(c => c.nombre.toLowerCase() === (data.ciudad ?? '').toLowerCase());
          if (ciudadMatch) setCiudadSelId(ciudadMatch.id);
        }
        // Preseleccionar categoría guardada (global, sin depender de ciudad)
        if (data.subcategoria_id) setSubcatSelId(data.subcategoria_id);
      }
      // Contar tiendas del usuario por teléfono
      if (data?.telefono || data?.whatsapp) {
        const tel = (data.telefono || data.whatsapp || '').replace(/\D/g, '');
        if (tel) {
          const { data: misTiendas } = await supabase
            .from('socios_comerciales')
            .select('id')
            .or(`telefono.ilike.%${tel}%,whatsapp.ilike.%${tel}%`);
          setTotalTiendas(misTiendas?.length ?? 0);
        }
      }
      setCargando(false);

      // Cargar galería con título y precio
      supabase.from('galeria_items').select('*').eq('socio_id', socioId).order('orden')
        .then(({ data }) => {
          if (data) {
            setGaleriaItems(data.map((d: any) => ({
              id:          d.id,
              imagen:      d.imagen      ?? '',
              imagen2:     d.imagen2     ?? '',
              imagen3:     d.imagen3     ?? '',
              titulo:      d.titulo      ?? '',
              precio:      d.precio      ?? '',
              precio_bs:   d.precio_bs   ?? '',
              descripcion: d.descripcion ?? '',
              orden:       d.orden       ?? 0,
            })));
            setGaleriaLoadedAt(Date.now()); // dispara auto-fill de Bs si la tasa ya está lista
          }
        });
    };
    cargar();
    // Cargar tasa BCV: caché primero (inmediato), luego API
    getItem<{ usd: number }>('bcv_cache').then(c => { if (c?.usd) setTasaBCV(c.usd); });
    fetch('https://ve.dolarapi.com/v1/dolares/oficiales')
      .then(r => r.json()).then(d => {
        const t = parseFloat(d.promedio ?? d.promedio_real);
        if (!isNaN(t) && t > 0) setTasaBCV(t);
      }).catch(() => {});

    supabase.from('metodos_pago').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const ORDEN = ['movil','móvil','pago m','transfer','zelle','usdt','crypto'];
      const prioridad = (label: string) => {
        const l = label.toLowerCase();
        const idx = ORDEN.findIndex(k => l.includes(k));
        return idx === -1 ? 99 : idx;
      };
      const ordenados = [...data].sort((a, b) => prioridad(a.label) - prioridad(b.label));
      setMetodosPago(ordenados);
      const mapa: Record<string,string[]> = {};
      data.forEach((m: any) => { mapa[m.id] = m.datos; });
      setInfoPago(mapa);
      if (ordenados[0]) setMetodoRenov(ordenados[0].id);
    });

    supabase.from('planes_ofertas').select('*').eq('activo', true).then(({ data }) => {
      if (!data) return;
      const map: Partial<Record<PlanKey, Oferta>> = {};
      data.forEach((o: any) => {
        if (o.plan) map[o.plan as PlanKey] = o;
      });
      setOfertas(map);
    });

    supabase.from('config_app').select('clave,valor')
      .in('clave', ['precio_base_basico_mensual', 'precio_base_basico_anual', 'precio_base_pro_mensual', 'precio_base_pro_anual'])
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((r: any) => { map[r.clave] = r.valor; });
        setPreciosBase({
          basico_mensual: map.precio_base_basico_mensual != null ? parseFloat(map.precio_base_basico_mensual) : 15,
          basico_anual:   map.precio_base_basico_anual   != null ? parseFloat(map.precio_base_basico_anual)   : 150,
          pro_mensual:    map.precio_base_pro_mensual    != null ? parseFloat(map.precio_base_pro_mensual)    : 30,
          pro_anual:      map.precio_base_pro_anual      != null ? parseFloat(map.precio_base_pro_anual)      : 300,
        });
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
    if (!comprobanteRenov) { Alert.alert('Campo requerido', 'Adjunta la foto del comprobante de pago.'); return; }
    setEnviandoRenov(true);
    let urlComprobante: string | null = null;
    if (comprobanteRenov) urlComprobante = await subirImagen(comprobanteRenov, 'comprobante_renov');
    const planKeyRenov = `${planRenov}_${periodoRenov}` as PlanKey;
    const montoRenov   = ofertas[planKeyRenov]?.precio_oferta ?? preciosBase[planKeyRenov];
    const { error } = await supabase.from('solicitudes').insert({
      nombre:         socio?.nombre ?? '',
      telefono:       telefono.trim(),
      whatsapp:       whatsapp.trim(),
      redes:          socio?.web        ?? null,
      direccion:      socio?.direccion  ?? null,
      descripcion:    socio?.descripcion ?? null,
      ciudad:         socio?.ciudad     ?? null,
      subcategoria_id: subcatSelId ?? socio?.subcategoria_id ?? null,
      plan:           planRenov,
      periodo:        periodoRenov,
      metodo_pago:    metodoRenov,
      referencia:     referenciaRenov.trim(),
      monto:          montoRenov,
      comprobante:    urlComprobante,
      tipo:           'renovacion',
      socio_id:       resolvedId,
    });
    setEnviandoRenov(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setModalRenovar(false);
    setReferenciaRenov('');
    setComprobanteRenov(null);
    setRenovEnviada(true);
  };

  // Refrescar fecha_vencimiento y plan cada vez que la pantalla recibe el foco
  useFocusEffect(useCallback(() => {
    if (!resolvedId) return;
    Promise.all([
      supabase.from('socios_comerciales').select('fecha_vencimiento, plan').eq('id', resolvedId).single(),
      supabase.from('config_app').select('clave,valor').in('clave', [`lock_nombre_${resolvedId}`, `lock_tel_${resolvedId}`]),
    ]).then(([{ data }, { data: cfg }]) => {
      const cfgMap = Object.fromEntries((cfg ?? []).map((r: any) => [r.clave, r.valor]));
      if (data) setSocio(prev => prev ? {
        ...prev,
        fecha_vencimiento:  data.fecha_vencimiento,
        plan:               data.plan,
        nombre_bloqueado:   cfgMap[`lock_nombre_${resolvedId}`] === 'true',
        telefono_bloqueado: cfgMap[`lock_tel_${resolvedId}`]    === 'true',
      } : prev);
    });
  }, [resolvedId]));

  // Recalcular Bs. desde precio USD con la tasa BCV del día.
  // Corre cuando llega la tasa O cuando carga/cambia la galería.
  useEffect(() => {
    if (!tasaBCV) return;
    setGaleriaItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        if (item.precio) {
          const n = parseFloat(item.precio);
          if (!isNaN(n) && n > 0) {
            const newBs = (n * tasaBCV).toFixed(2);
            if (newBs !== item.precio_bs) { changed = true; return { ...item, precio_bs: newBs }; }
          }
        }
        return item;
      });
      return changed ? next : prev;
    });
  }, [tasaBCV, galeriaLoadedAt]);

  const guardarCatalogo = async () => {
    setGuardandoCat(true);
    const itemsSubidos = await Promise.all(
      galeriaItems.map(async (item, i) => ({
        socio_id:    resolvedId,
        imagen:      await subirImagen(item.imagen,  `gal${i}_1`),
        imagen2:     item.imagen2 ? await subirImagen(item.imagen2, `gal${i}_2`) : null,
        imagen3:     item.imagen3 ? await subirImagen(item.imagen3, `gal${i}_3`) : null,
        titulo:      item.titulo.trim()      || null,
        precio:      item.precio.trim()      || null,
        precio_bs:   item.precio_bs.trim()   || null,
        descripcion: item.descripcion?.trim() || null,
        orden:       i,
      }))
    );
    if (itemsSubidos.length > 0) {
      const { data, error: insErr } = await supabase.from('galeria_items').insert(itemsSubidos).select();
      if (insErr) {
        setGuardandoCat(false);
        Alert.alert('Error al guardar', insErr.message);
        return;
      }
      // Insert exitoso: borrar los viejos (los que no son los recién insertados)
      const newIds = (data ?? []).map((d: any) => d.id);
      if (newIds.length > 0) {
        await supabase.from('galeria_items').delete()
          .eq('socio_id', resolvedId)
          .not('id', 'in', `(${newIds.join(',')})`);
      }
      if (data) setGaleriaItems(data.map((d: any) => ({
        id:          d.id,
        imagen:      d.imagen      ?? '',
        imagen2:     d.imagen2     ?? '',
        imagen3:     d.imagen3     ?? '',
        titulo:      d.titulo      ?? '',
        precio:      d.precio      ?? '',
        precio_bs:   d.precio_bs   ?? '',
        descripcion: d.descripcion ?? '',
        orden:       d.orden       ?? 0,
      })));
    } else {
      await supabase.from('galeria_items').delete().eq('socio_id', resolvedId);
      setGaleriaItems([]);
    }
    setGuardandoCat(false);
    Alert.alert('¡Listo!', 'Catálogo guardado correctamente.');
  };

  const agregarItemGaleria = () => {
    const galeriaSlots = PLAN_GALERIA[socio?.plan ?? 'basico'] ?? 6;
    if (galeriaItems.length >= galeriaSlots) return;
    pickImage(uri => {
      setGaleriaItems(prev => [...prev, { imagen: uri, imagen2: '', imagen3: '', titulo: '', precio: '', precio_bs: '', descripcion: '', orden: prev.length }]);
    });
  };

  const eliminarItemGaleria = async (i: number) => {
    const item = galeriaItems[i];
    if (item.id) await supabase.from('galeria_items').delete().eq('id', item.id);
    setGaleriaItems(prev => prev.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, orden: idx })));
  };

  const guardar = async () => {
    if (!nombre.trim()) { Alert.alert('Campo requerido', 'El nombre de mi tienda no puede estar vacío.'); return; }
    setGuardando(true);

    const urlPortada = await subirImagen(portada, 'portada');

    // Guardar datos principales del socio
    const { error } = await supabase.from('socios_comerciales').update({
      nombre:          nombre.trim(),
      ciudad:          ciudad.trim(),
      telefono:        telefono.trim(),
      whatsapp:        whatsapp.trim(),
      web:             web.trim(),
      direccion:       direccion.trim(),
      descripcion:     descripcion.trim() || null,
      subcategoria_id: subcatSelId ?? null,
      imagen:          urlPortada,
    }).eq('id', resolvedId);

    if (error) { setGuardando(false); Alert.alert('Error', error.message); return; }

    // Guardar coordenadas GPS via RPC (evita schema cache de Supabase)
    if (coordenadas && resolvedId) {
      await supabase.rpc('actualizar_ubicacion_socio', {
        p_id:  resolvedId,
        p_lat: coordenadas.lat,
        p_lng: coordenadas.lng,
      });
    }

    // Propagar cambios a solicitudes usando el teléfono ORIGINAL (antes de editar)
    const telOriginal = (socio?.telefono || socio?.whatsapp || '').replace(/\D/g, '');
    const nombreOriginal = socio?.nombre?.trim().toLowerCase() ?? '';
    if (telOriginal || nombreOriginal) {
      // Buscar la solicitud exacta: mismo teléfono original Y mismo nombre original
      let query = supabase.from('solicitudes').select('id,nombre');
      if (telOriginal) {
        query = query.or(`telefono.ilike.%${telOriginal}%,whatsapp.ilike.%${telOriginal}%`);
      }
      const { data: sols } = await query;
      // Filtrar por nombre original para no tocar otras tiendas del mismo teléfono
      const solsFiltradas = nombreOriginal
        ? (sols?.filter(s => s.nombre?.trim().toLowerCase() === nombreOriginal) ?? [])
        : (sols ?? []);
      if (solsFiltradas.length) {
        await Promise.all(solsFiltradas.map(s =>
          supabase.from('solicitudes').update({
            nombre:          nombre.trim(),
            ciudad:          ciudad.trim(),
            telefono:        telefono.trim()    || null,
            whatsapp:        whatsapp.trim()    || null,
            redes:           web.trim()         || null,
            direccion:       direccion.trim()   || null,
            descripcion:     descripcion.trim() || null,
            subcategoria_id: subcatSelId ?? null,
          }).eq('id', s.id)
        ));
      }
    }

    // Guardar galería de productos (con título, precio y descripción)
    const itemsSubidos = await Promise.all(
      galeriaItems.map(async (item, i) => ({
        socio_id:    resolvedId,
        imagen:      await subirImagen(item.imagen,  `gal${i}_1`),
        imagen2:     item.imagen2 ? await subirImagen(item.imagen2, `gal${i}_2`) : null,
        imagen3:     item.imagen3 ? await subirImagen(item.imagen3, `gal${i}_3`) : null,
        titulo:      item.titulo.trim()      || null,
        precio:      item.precio.trim()      || null,
        precio_bs:   item.precio_bs.trim()   || null,
        descripcion: item.descripcion?.trim() || null,
        orden:       i,
      }))
    );

    // Re-insertar galería: insertar primero, borrar viejos solo si el insert fue exitoso
    if (itemsSubidos.length > 0) {
      const { data: galData, error: galErr } = await supabase.from('galeria_items').insert(itemsSubidos).select('id');
      if (galErr) {
        setGuardando(false);
        Alert.alert('Error al guardar galería', galErr.message);
        return;
      }
      const newIds = (galData ?? []).map((d: any) => d.id);
      if (newIds.length > 0) {
        await supabase.from('galeria_items').delete()
          .eq('socio_id', resolvedId)
          .not('id', 'in', `(${newIds.join(',')})`);
      }
    } else {
      await supabase.from('galeria_items').delete().eq('socio_id', resolvedId);
    }

    // Actualizar teléfono en AsyncStorage para que la búsqueda siga funcionando
    const nuevoTel = telefono.trim() || whatsapp.trim();
    if (nuevoTel) await AsyncStorage.setItem('socio_telefono', nuevoTel);

    setGuardando(false);
    Alert.alert('¡Listo!', 'Tu perfil fue actualizado.', [{ text: 'OK', onPress: () => router.replace('/socios') }]);
  };

  if (renovEnviada) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.lg }}>
        <View style={{ borderRadius: 60, padding: 20, backgroundColor: Colors.success + '18' }}>
          <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
        </View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.text, textAlign: 'center' }}>
          ¡Solicitud enviada!
        </Text>
        <Text style={{ fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 24 }}>
          Recibimos tu solicitud de renovación para{'\n'}<Text style={{ fontWeight: '800', color: Colors.text }}>{socio?.nombre}</Text>.{'\n\n'}
          El equipo de CashCach revisará tu pago y activará tu membresía en las próximas horas.{'\n\n'}
          Te contactaremos al WhatsApp que registraste.
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingHorizontal: 40, paddingVertical: 15, marginTop: Spacing.md }}
          onPress={() => router.replace('/socios')}>
          <Text style={{ color: '#fff', fontSize: FontSize.md, fontWeight: '800' }}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  if (cargando) return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => router.replace('/socios')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.text }]}>Editar mi tienda</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

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

        {/* Catálogo de productos / galería */}
        {(() => {
          const slots = PLAN_GALERIA[socio?.plan ?? 'basico'] ?? 6;
          if (slots === 0) return null;
          return (
            <View style={{ gap: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.seccion, { color: Colors.textMuted }]}>
                  Catálogo de productos ({galeriaItems.length}/{slots})
                </Text>
              </View>

              {/* Cards de items */}
              {galeriaItems.map((item, i) => (
                <View key={i} style={[styles.catalogoCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                  {/* 3 slots de imagen */}
                  <View style={{ gap: 4 }}>
                    {(['imagen', 'imagen2', 'imagen3'] as const).map((campo, si) => (
                      <TouchableOpacity key={si}
                        style={[styles.catalogoImagen, { borderColor: si === 0 ? Colors.accent : Colors.border, backgroundColor: Colors.background }]}
                        onPress={() => pickImage(uri => setGaleriaItems(prev => {
                          const n = [...prev]; n[i] = { ...n[i], [campo]: uri }; return n;
                        }))}
                        activeOpacity={0.8}>
                        {item[campo] ? (
                          <Image source={{ uri: item[campo] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        ) : (
                          <Ionicons name={si === 0 ? 'camera' : 'add'} size={si === 0 ? 22 : 18} color={si === 0 ? Colors.accent : Colors.textMuted} />
                        )}
                        {item[campo] ? (
                          <View style={[styles.editBadge, { backgroundColor: Colors.accent }]}>
                            <Ionicons name="camera" size={10} color="#fff" />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Inputs título, precio y descripción */}
                  <View style={{ flex: 1, gap: 8 }}>
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 9 }]}
                      value={item.titulo}
                      onChangeText={t => setGaleriaItems(prev => { const n = [...prev]; n[i] = { ...n[i], titulo: t }; return n; })}
                      placeholder="Título del producto"
                      placeholderTextColor={Colors.textMuted}
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 9 }]}
                      value={item.precio}
                      onChangeText={t => setGaleriaItems(prev => {
                        const n = [...prev];
                        const bs = tasaBCV && t && !isNaN(parseFloat(t))
                          ? (parseFloat(t) * tasaBCV).toFixed(2) : n[i].precio_bs;
                        n[i] = { ...n[i], precio: t, precio_bs: bs };
                        return n;
                      })}
                      placeholder="Precio USD (ej: 1.50)"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 9 }]}
                      value={item.precio_bs}
                      onChangeText={t => setGaleriaItems(prev => {
                        const n = [...prev];
                        const usd = tasaBCV && t && !isNaN(parseFloat(t))
                          ? (parseFloat(t) / tasaBCV).toFixed(2) : n[i].precio;
                        n[i] = { ...n[i], precio_bs: t, precio: usd };
                        return n;
                      })}
                      placeholder={tasaBCV ? `Precio Bs. (tasa: ${tasaBCV.toFixed(2)})` : 'Precio Bs.'}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.input, { backgroundColor: Colors.background, borderColor: Colors.border, color: Colors.text, paddingVertical: 9 }]}
                      value={item.descripcion}
                      onChangeText={t => setGaleriaItems(prev => {
                        const n = [...prev]; n[i] = { ...n[i], descripcion: t }; return n;
                      })}
                      placeholder="Descripción del producto (opcional)"
                      placeholderTextColor={Colors.textMuted}
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  {/* Eliminar */}
                  <TouchableOpacity onPress={() => eliminarItemGaleria(i)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Botón agregar */}
              {galeriaItems.length < slots && (
                <TouchableOpacity
                  style={[styles.btnAgregar, { borderColor: Colors.accent }]}
                  onPress={agregarItemGaleria}
                  activeOpacity={0.85}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                  <Text style={[styles.btnAgregarText, { color: Colors.accent }]}>Agregar al catálogo</Text>
                </TouchableOpacity>
              )}

              {/* Botón guardar catálogo */}
              {galeriaItems.length > 0 && (
                <TouchableOpacity
                  style={[styles.btnGuardar, { backgroundColor: guardandoCat ? Colors.border : Colors.success }]}
                  onPress={guardarCatalogo}
                  disabled={guardandoCat}>
                  {guardandoCat
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                        <Text style={styles.btnGuardarText}>Guardar catálogo</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* Datos */}
        <Text style={[styles.seccion, { color: Colors.textMuted }]}>Información de mi tienda</Text>

        {([
          { label: 'Nombre de mi tienda *', value: nombre,    set: setNombre,    placeholder: 'Ej: Panadería La Esperanza', bloqueado: !!socio?.nombre_bloqueado },
          { label: 'Teléfono',             value: telefono,  set: setTelefono,  placeholder: '0414-0000000', keyboard: 'phone-pad', bloqueado: !!socio?.telefono_bloqueado },
          { label: 'WhatsApp',             value: whatsapp,  set: setWhatsapp,  placeholder: '0414-0000000', keyboard: 'phone-pad' },
          { label: 'Redes sociales / web', value: web,       set: setWeb,       placeholder: 'Ej: @minegocio' },
          { label: 'Dirección',            value: direccion, set: setDireccion, placeholder: 'Ej: Av. Libertador, local 5' },
          { label: 'Descripción',          value: descripcion, set: setDescripcion, placeholder: 'Breve descripción de tu negocio…', multiline: true },
        ] as any[]).map(({ label, value, set, placeholder, keyboard, multiline, bloqueado }) => (
          <View key={label} style={styles.campo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <Text style={[styles.label, { color: Colors.textMuted, marginBottom: 0 }]}>{label}</Text>
              {bloqueado && <Ionicons name="lock-closed" size={12} color="#ef4444" />}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: bloqueado ? Colors.background : Colors.card, borderColor: bloqueado ? '#fca5a5' : Colors.border, color: bloqueado ? Colors.textMuted : Colors.text }, multiline && { height: 80, textAlignVertical: 'top' }]}
              value={value} onChangeText={bloqueado ? undefined : set}
              editable={!bloqueado}
              placeholder={placeholder} placeholderTextColor={Colors.textMuted}
              keyboardType={keyboard ?? 'default'}
              multiline={multiline ?? false}
            />
            {bloqueado && (
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>Bloqueado por el administrador.</Text>
            )}
          </View>
        ))}

        {/* Botón GPS */}
        <View style={[styles.campo, { marginTop: -4 }]}>
          <Text style={[styles.label, { color: Colors.textMuted }]}>Ubicación exacta (GPS)</Text>
          <TouchableOpacity
            onPress={capturarGPS}
            disabled={obtenGPS}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: coordenadas ? '#dcfce7' : Colors.card, borderWidth: 1, borderColor: coordenadas ? '#16a34a' : Colors.border, borderRadius: Radius.md, padding: 12 }}
            activeOpacity={0.8}>
            {obtenGPS
              ? <ActivityIndicator size="small" color="#6c3fc5" />
              : <Ionicons name="location" size={18} color={coordenadas ? '#16a34a' : '#6c3fc5'} />}
            <Text style={{ flex: 1, fontSize: FontSize.md, color: coordenadas ? '#15803d' : Colors.text }}>
              {obtenGPS
                ? 'Obteniendo ubicación…'
                : coordenadas
                  ? `✓ ${toDMS(coordenadas.lat, true)}  ${toDMS(coordenadas.lng, false)}`
                  : 'Capturar mi ubicación actual'}
            </Text>
            {coordenadas && (
              <TouchableOpacity onPress={() => setCoordenadas(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
            Solo se actualiza si capturas GPS y guardas.
          </Text>
        </View>

        {/* Selector Ciudad → Categoría */}
        <View style={styles.campo}>
          <Text style={[styles.label, { color: Colors.textMuted }]}>Ciudad</Text>
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
                  onPress={() => {
                    setCiudadSelId(c.id);
                    setCiudad(c.nombre);
                    setDropCiudad(false);
                  }}>
                  <Text style={{ color: c.id === ciudadSelId ? Colors.accent : Colors.text, fontWeight: c.id === ciudadSelId ? '700' : '400' }}>{c.nombre}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.campo}>
            <Text style={[styles.label, { color: Colors.textMuted }]}>Categoría</Text>
            <TouchableOpacity
              style={[styles.input, { backgroundColor: Colors.card, borderColor: Colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => { setDropSubcat(v => !v); setDropCiudad(false); if (dropSubcat) setSubcatBusq(''); }}
              activeOpacity={0.8}>
              <Text style={{ color: subcatSelId ? Colors.text : Colors.textMuted, fontSize: FontSize.md }}>
                {subcatSelId ? (subcatsFiltradas.find(s => s.id === subcatSelId)?.nombre ?? 'Selecciona…') : 'Selecciona una categoría…'}
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
                {subcatsFiltradas.filter(s => s.nombre.toLowerCase().includes(subcatBusq.toLowerCase())).length === 0 ? (
                  <View style={styles.dropdownItem}>
                    <Text style={{ color: Colors.textMuted }}>Sin resultados</Text>
                  </View>
                ) : subcatsFiltradas.filter(s => s.nombre.toLowerCase().includes(subcatBusq.toLowerCase())).map(s => (
                  <TouchableOpacity key={s.id}
                    style={[styles.dropdownItem, { borderBottomColor: Colors.border }]}
                    onPress={() => { setSubcatSelId(s.id); setDropSubcat(false); setSubcatBusq(''); }}>
                    <Text style={{ color: s.id === subcatSelId ? Colors.accent : Colors.text, fontWeight: s.id === subcatSelId ? '700' : '400' }}>{s.nombre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

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

              {/* Selector de plan y período */}
              <Text style={[styles.label, { color: Colors.textMuted }]}>Selecciona tu plan</Text>

              {/* Toggle período */}
              <View style={[styles.toggleWrap, { backgroundColor: Colors.border }]}>
                {(['mensual', 'anual'] as Periodo[]).map(p => (
                  <TouchableOpacity key={p} onPress={() => setPeriodoRenov(p)}
                    style={[styles.toggleBtn, periodoRenov === p && [styles.toggleBtnActive, { backgroundColor: Colors.card }]]}>
                    <Text style={[styles.toggleBtnText, { color: periodoRenov === p ? Colors.accent : Colors.textMuted }]}>
                      {p === 'mensual' ? 'Mensual' : 'Anual'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Básico / Pro */}
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                {(['basico', 'pro'] as Exclude<Plan,'gratis'>[]).map(p => {
                  const key    = `${p}_${periodoRenov}` as PlanKey;
                  const oferta = ofertas[key];
                  const activo = planRenov === p;
                  const precioPlan = oferta?.precio_oferta ?? preciosBase[key];
                  return (
                    <TouchableOpacity key={p} onPress={() => setPlanRenov(p)}
                      style={[styles.planBtn, {
                        borderColor:     activo ? Colors.accent : Colors.border,
                        backgroundColor: activo ? Colors.accent + '12' : Colors.card,
                        flex: 1, position: 'relative',
                      }]}>
                      {oferta?.descuento_pct ? (
                        <View style={{ position: 'absolute', top: -10, right: -6, backgroundColor: Colors.accent, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>-{oferta.descuento_pct}%</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.planBtnLabel, { color: activo ? Colors.accent : Colors.text }]}>
                        {p === 'basico' ? '⭐ Básico' : '🚀 Pro'}
                      </Text>
                      {oferta?.precio_original ? (
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, textDecorationLine: 'line-through' }}>
                          ${oferta.precio_original}
                        </Text>
                      ) : null}
                      <Text style={[styles.planBtnPrecio, { color: activo ? Colors.accent : Colors.textMuted }]}>
                        ${precioPlan}
                      </Text>
                      {oferta?.meses_gratis ? (
                        <Text style={[styles.planBtnAhorro, { color: Colors.success }]}>
                          +{oferta.meses_gratis} mes{oferta.meses_gratis !== 1 ? 'es' : ''} gratis
                        </Text>
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
                <Text style={[styles.label, { color: Colors.textMuted }]}>Foto del comprobante *</Text>
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

  catalogoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Radius.lg, borderWidth: 1, padding: 10,
  },
  catalogoImagen: {
    width: 80, height: 80, borderRadius: Radius.md, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  campo: { gap: 5 },
  label: { fontSize: FontSize.sm, fontWeight: '600' },
  input: {
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md,
  },

  dropdownList: {
    borderWidth: 1, borderRadius: Radius.md, marginTop: 4,
    overflow: 'hidden', zIndex: 99,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },

  btnGuardar: {
    marginTop: Spacing.md, borderRadius: Radius.lg,
    paddingVertical: 15, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
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

  toggleWrap: {
    flexDirection: 'row', borderRadius: Radius.lg, padding: 3, gap: 3,
  },
  toggleBtn: {
    flex: 1, paddingVertical: 9, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  toggleBtnActive: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  toggleBtnText:   { fontSize: FontSize.sm, fontWeight: '700' },
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
