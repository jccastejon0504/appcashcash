import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, RefreshControl, Image,
  TextInput, Keyboard, Modal, Share,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SocioComercial } from '@/services/supabase';
import { registrarEvento } from '@/services/analytics';
import * as Location from 'expo-location';
import FichaTiendaModal from '@/components/FichaTiendaModal';

function urlTienda(s: { id: string; slug?: string | null }): string {
  return s.slug
    ? `https://appcashcash.com/t/${s.slug}`
    : `https://appcashcash.com/admin/tienda.html?id=${s.id}`;
}

export default function SociosScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [socios,           setSocios]           = useState<SocioComercial[]>([]);
  const [cargando,         setCargando]         = useState(true);
  const [refrescando,      setRefrescando]      = useState(false);
  const [yaEnvioSolicitud, setYaEnvioSolicitud] = useState(false);
  const [solicitudRechazada, setSolicitudRechazada] = useState<{ motivo: string | null } | null>(null);
  const [misSocios,        setMisSocios]        = useState<{ id: string; nombre: string; imagen: string | null; fecha_vencimiento: string | null; slug?: string | null }[]>([]);
  const [limiteTiendas,    setLimiteTiendas]    = useState<number>(100);
  const [modalMisTiendas,   setModalMisTiendas]   = useState(false);
  const [modalFavoritas,    setModalFavoritas]    = useState(false);
  const [favoritas,         setFavoritas]         = useState<string[]>([]);
  const [error,       setError]       = useState<string | null>(null);
  const [busqueda,        setBusqueda]        = useState('');
  const [filtroAplicado,  setFiltroAplicado]  = useState('');
  const [modalBuscar,     setModalBuscar]     = useState(false);
  const [subcats,       setSubcats]       = useState<{ id: string; nombre: string }[]>([]);
  const [todasSubcats,  setTodasSubcats]  = useState<string[]>([]);
  const [subcatFiltro]                     = useState<string | null>(null);
  const [ubicacionCiudad,    setUbicacionCiudad]    = useState('');
  const [ubicacionRadio,     setUbicacionRadio]     = useState('3');
  const [modalConfigVisible, setModalConfigVisible] = useState(false);
  const [ciudadInputTemp,    setCiudadInputTemp]    = useState('');
  const [radioInputTemp,     setRadioInputTemp]     = useState('3');
  const [ciudadesDisponibles, setCiudadesDisponibles] = useState<string[]>([]);
  const [mostrarSugCiudad,    setMostrarSugCiudad]    = useState(false);
  const [mostrarRadioList,    setMostrarRadioList]    = useState(false);
  const [mapCoords,           setMapCoords]           = useState<{ latitude: number; longitude: number } | null>(null);
  const [buscandoUbicacion,   setBuscandoUbicacion]   = useState(false);
  const [socioModal,    setSocioModal]    = useState<SocioComercial | null>(null);
  const [modalInfo,     setModalInfo]     = useState(false);
  const [modalMotivoRechazo, setModalMotivoRechazo] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const pulsoOpacity = useSharedValue(0.4);
  const pulsoStyle   = useAnimatedStyle(() => ({ opacity: pulsoOpacity.value }));

  useEffect(() => {
    pulsoOpacity.value = withTiming(1, { duration: 700 }, () => {
      const loop = () => {
        pulsoOpacity.value = withTiming(0.4, { duration: 700 }, () => {
          pulsoOpacity.value = withTiming(1, { duration: 700 }, loop);
        });
      };
      loop();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sociosCiudad, setSociosCiudad] = useState<SocioComercial[]>([]);
  type OfertaPromo = { plan: string; periodo: string | null; precio_oferta: number; precio_original: number | null; descuento_pct: number | null; tagline: string | null };
  const [ofertasPromo, setOfertasPromo] = useState<OfertaPromo[]>([]);

  // Haversine: distancia en km entre dos coordenadas
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Filtro de tienda por ubicación
  // - Ciudad escrita → solo coincidencia por nombre (el mapCoords es el centro geocodificado, no la ubicación real)
  // - GPS real (sin ciudad escrita) → Haversine con radio
  const cumpleFiltroUbicacion = useCallback((s: SocioComercial) => {
    // Caso 1: usuario escribió ciudad → filtrar por nombre de ciudad sin importar radio
    if (ubicacionCiudad) {
      return s.ciudad?.toLowerCase().includes(ubicacionCiudad.toLowerCase()) ?? false;
    }
    // Caso 2: solo GPS del dispositivo → Haversine estricto con radio
    if (mapCoords) {
      if (s.latitud != null && s.longitud != null) {
        return haversine(mapCoords.latitude, mapCoords.longitude, s.latitud, s.longitud) <= parseFloat(ubicacionRadio);
      }
      return false; // GPS activo pero tienda sin coordenadas
    }
    return true;
  }, [mapCoords, ubicacionRadio, ubicacionCiudad]);

  const esDestVigente = (s: SocioComercial) =>
    s.destacado === true || (!!s.destacado_hasta && new Date(s.destacado_hasta) > new Date());

  // Función reutilizable para mezclar y guardar
  const mezclarSociosCiudad = useCallback((listaSocios: SocioComercial[], ciudad: string) => {
    const destacadosIds = new Set(listaSocios.filter(esDestVigente).map(s => s.id));
    const lista = listaSocios.filter(s => {
      if (destacadosIds.has(s.id)) return false;
      if (ciudad) return s.ciudad?.toLowerCase().includes(ciudad.toLowerCase());
      return true;
    });
    const arr = [...lista];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setSociosCiudad(arr);
  }, []);

  const cargar = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('socios_comerciales')
      .select('id,nombre,ciudad,direccion,descripcion,telefono,whatsapp,web,imagen,imagen2,imagen3,imagen4,imagen5,imagen6,destacado,destacado_hasta,subcategoria_id,activo,fecha_vencimiento,orden,created_at,latitud,longitud,slug')
      .or('activo.is.null,activo.eq.true')
      .or(`fecha_vencimiento.is.null,fecha_vencimiento.gt.${new Date().toISOString()}`)
      .order('orden', { ascending: true });
    if (err) {
      setError('No se pudo cargar la información');
    } else {
      const lista = data ?? [];
      setSocios(lista);
      // Mezclar al terminar la carga (usa la ciudad del estado actual vía ref)
      setUbicacionCiudad(prev => { mezclarSociosCiudad(lista, prev); return prev; });
    }
    if (esRefresh) setRefrescando(false); else setCargando(false);
  }, [mezclarSociosCiudad]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    supabase.from('planes_ofertas').select('plan,periodo,precio_oferta,precio_original,descuento_pct,tagline')
      .eq('activo', true)
      .then(({ data }) => { if (data) setOfertasPromo(data as OfertaPromo[]); });
  }, []);

  useEffect(() => {
    // Subcats para chips de filtro (sin categoria_id = nivel superior)
    supabase.from('subcategorias').select('id,nombre').is('categoria_id', null).order('nombre').then(({ data }) => {
      if (data) setSubcats(data as { id: string; nombre: string }[]);
    });
    // Todas las subcategorías como pool de palabras clave para la búsqueda
    supabase.from('subcategorias').select('nombre').order('nombre').then(({ data }) => {
      if (data) setTodasSubcats(data.map((s: { nombre: string }) => s.nombre));
    });
    supabase.from('categorias').select('nombre').order('nombre').then(({ data }) => {
      if (data) setCiudadesDisponibles(data.map((c: { nombre: string }) => c.nombre));
    });
  }, []);

  // Geocodifica la ciudad escrita usando Nominatim (OpenStreetMap)
  useEffect(() => {
    const ciudad = ciudadInputTemp.trim();
    if (!ciudad) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ciudad)}&format=json&limit=1`, {
          headers: { 'User-Agent': 'CashCashApp/1.0' },
        });
        const json = await res.json();
        if (json.length > 0) {
          setMapCoords({ latitude: parseFloat(json[0].lat), longitude: parseFloat(json[0].lon) });
        }
      } catch { /* sin internet */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [ciudadInputTemp]);

  // Obtiene la ubicación del dispositivo cuando se abre el modal sin ciudad escrita
  useEffect(() => {
    if (!modalConfigVisible) return;
    if (ciudadInputTemp.trim()) return;
    (async () => {
      setBuscandoUbicacion(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMapCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
      setBuscandoUbicacion(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalConfigVisible]);

  // Auto-refresh cada 60 segundos mientras la pantalla está visible
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => cargar(true), 60000);
    return () => clearInterval(timer);
  }, [cargar]));

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('favoritas').then(raw => {
      setFavoritas(raw ? JSON.parse(raw) : []);
    });
  }, []));

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem('ubicacion_config').then(raw => {
      const ciudad = raw ? (JSON.parse(raw).ciudad ?? '') : '';
      const radio  = raw ? (JSON.parse(raw).radio  ?? '3') : '5';
      setUbicacionCiudad(ciudad);
      setUbicacionRadio(radio);
      // Mezclar con los socios ya cargados cada vez que se entra a la pantalla
      setSocios(prev => { mezclarSociosCiudad(prev, ciudad); return prev; });
    });
  }, [mezclarSociosCiudad]));

  useFocusEffect(useCallback(() => {
    const cargarMisSocios = async () => {
      // ── Leer estado local persistido ────────────────────────────────────
      const [enviada, telefonoRaw, solicitudId, rechazadaRaw, idsRaw] = await Promise.all([
        AsyncStorage.getItem('solicitud_socio_enviada'),
        AsyncStorage.getItem('socio_telefono'),
        AsyncStorage.getItem('solicitud_id'),
        AsyncStorage.getItem('solicitud_rechazada'),
        AsyncStorage.getItem('mis_socios_ids'),
      ]);

      // Mostrar estado local mientras carga DB (evita parpadeo)
      if (rechazadaRaw) {
        try {
          const cached = JSON.parse(rechazadaRaw);
          setSolicitudRechazada(cached);
          setYaEnvioSolicitud(false);
        } catch { /* ignorar parse error */ }
      } else if (enviada === 'true') {
        setYaEnvioSolicitud(true);
      }

      const telefono = telefonoRaw ?? '';
      const tel = telefono.replace(/\D/g, '');
      const idsGuardados: string[] = idsRaw ? JSON.parse(idsRaw) : [];

      // Si no hay teléfono ni IDs guardados, no hay nada que buscar
      if (!telefono && idsGuardados.length === 0) return;

      type MiSocio = { id: string; nombre: string; imagen: string | null; fecha_vencimiento: string | null; telefono?: string | null; whatsapp?: string | null; slug?: string | null };

      // Construir consultas en paralelo
      const promesas: Promise<any>[] = [
        // Consulta por teléfono (solo si tenemos teléfono)
        tel
          ? supabase.from('socios_comerciales')
              .select('id, nombre, imagen, fecha_vencimiento, telefono, whatsapp, slug')
              .or(`telefono.ilike.%${tel}%,whatsapp.ilike.%${tel}%`) as unknown as Promise<any>
          : Promise.resolve({ data: [], error: null }),
        supabase.from('config_app').select('valor').eq('clave', 'limite_tiendas_por_cliente').single() as unknown as Promise<any>,
      ];
      if (idsGuardados.length > 0) {
        promesas.push(
          supabase.from('socios_comerciales')
            .select('id, nombre, imagen, fecha_vencimiento, telefono, whatsapp, slug')
            .in('id', idsGuardados) as unknown as Promise<any>
        );
      }

      const [porTelRes, { data: cfgLimite }, porIdRes] = await Promise.all(promesas);
      setLimiteTiendas(cfgLimite?.valor ? parseInt(cfgLimite.valor) : 100);

      // Detectar si las consultas fallaron por red (error real, no "sin resultados")
      const porTelOk = !porTelRes.error;
      const porIdOk  = idsGuardados.length === 0 || !porIdRes?.error;
      const consultasOk = porTelOk && porIdOk;

      // Unir resultados sin duplicados
      const mapaResultados = new Map<string, MiSocio>();
      for (const s of [...(porTelRes.data ?? []), ...(porIdRes?.data ?? [])]) {
        mapaResultados.set(s.id, s as MiSocio);
      }
      const resultado = Array.from(mapaResultados.values())
        .sort((a, b) => a.nombre?.localeCompare(b.nombre ?? '') ?? 0);

      // Si no había teléfono pero encontramos tienda por ID, recuperar teléfono
      if (resultado.length > 0 && !telefonoRaw) {
        const telRecuperado = resultado[0].telefono || resultado[0].whatsapp;
        if (telRecuperado) await AsyncStorage.setItem('socio_telefono', telRecuperado);
      }

      // Guardar IDs encontrados (acumulativo, nunca borra IDs que ya teníamos)
      const todosIds = Array.from(new Set([...idsGuardados, ...resultado.map(s => s.id)]));
      await AsyncStorage.setItem('mis_socios_ids', JSON.stringify(todosIds));

      setMisSocios(resultado);

      if (resultado.length === 0) {
        // Si las consultas fallaron por red → mantener estado actual, no resetear
        if (!consultasOk) return;

        // Consultas OK pero sin tiendas → verificar estado de solicitud
        if (!telefono) return;

        let solData: any[] | null = null;
        let errSol: any = null;

        // 1) Buscar por ID directo
        if (solicitudId) {
          const res = await (supabase
            .from('solicitudes')
            .select('id, estado, notas')
            .eq('id', solicitudId)
            .limit(1) as unknown as Promise<any>);
          solData = res.data;
          errSol  = res.error;
        }

        // 2) Fallback por teléfono
        if ((!solData || solData.length === 0) && telefono) {
          const filtrosTel: string[] = [];
          if (tel) filtrosTel.push(`telefono.ilike.%${tel}%`, `whatsapp.ilike.%${tel}%`);
          if (telefono !== tel) filtrosTel.push(`telefono.ilike.%${telefono}%`, `whatsapp.ilike.%${telefono}%`);
          const res = await (supabase
            .from('solicitudes')
            .select('id, estado, notas')
            .or(filtrosTel.join(','))
            .order('created_at', { ascending: false })
            .limit(1) as unknown as Promise<any>);
          if (!res.error) { solData = res.data; errSol = null; }
          else if (!solData) { errSol = res.error; }
        }

        if (!errSol && solData && solData.length > 0) {
          const sol = solData[0];
          if (sol.estado === 'rechazado') {
            const motivo: string | null = sol.notas ?? null;
            const info = { motivo };
            setSolicitudRechazada(info);
            setYaEnvioSolicitud(false);
            await AsyncStorage.setItem('solicitud_rechazada', JSON.stringify(info));
            await AsyncStorage.removeItem('solicitud_socio_enviada');
          } else if (sol.estado === 'pendiente') {
            setSolicitudRechazada(null);
            setYaEnvioSolicitud(true);
            await AsyncStorage.removeItem('solicitud_rechazada');
            await AsyncStorage.setItem('solicitud_socio_enviada', 'true');
          } else {
            // 'aprobado' pero sin tienda encontrada.
            // Solo resetear si NO hay IDs guardados (consulta de IDs confirmó que no existe).
            // Si hay IDs guardados, podría ser un fallo de red — no resetear.
            if (idsGuardados.length === 0) {
              setSolicitudRechazada(null);
              setYaEnvioSolicitud(false);
              await AsyncStorage.removeItem('solicitud_rechazada');
              await AsyncStorage.removeItem('solicitud_socio_enviada');
              await AsyncStorage.removeItem('solicitud_id');
            }
          }
        } else if (!errSol) {
          // Solicitud no existe en DB
          if (rechazadaRaw) {
            // Mantener aviso de rechazo local hasta que el usuario pulse "Intentar de nuevo"
          } else if (idsGuardados.length === 0) {
            // Sin tienda y sin solicitud → mostrar formulario de registro
            setSolicitudRechazada(null);
            setYaEnvioSolicitud(false);
            await AsyncStorage.removeItem('solicitud_socio_enviada');
            await AsyncStorage.removeItem('solicitud_id');
          }
          // Si hay IDs guardados pero no se encontró la tienda → fallo de red, mantener estado
        }
        // errSol != null: fallo de red — mantener estado local sin cambios
      } else {
        setSolicitudRechazada(null);
        await AsyncStorage.removeItem('solicitud_rechazada');
      }
    };
    cargarMisSocios();
  }, []));

  const destacados = useMemo(() => {
    let lista = socios.filter(esDestVigente);
    if (subcatFiltro) lista = lista.filter(s => s.subcategoria_id === subcatFiltro);
    lista = lista.filter(cumpleFiltroUbicacion);
    // Aleatorizar destacados entre sí
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  }, [socios, subcatFiltro, cumpleFiltroUbicacion]);


  const sugerencias = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    const items = new Set<string>();

    // 1. Palabras clave de categorías (subcategorías del catálogo completo)
    todasSubcats.forEach(nombre => {
      if (nombre?.toLowerCase().includes(q)) items.add(nombre);
    });

    // 2. Nombres de tiendas, ciudades, direcciones y palabras de descripción
    socios.forEach(s => {
      const subcatNombre = subcats.find(sc => sc.id === s.subcategoria_id)?.nombre;
      const campos: (string | null | undefined)[] = [s.nombre, s.ciudad, s.direccion, subcatNombre];
      campos.forEach(campo => {
        if (campo?.toLowerCase().includes(q)) items.add(campo!);
      });
      // Extraer palabras individuales de la descripción breve
      if (s.descripcion) {
        const palabras = s.descripcion.split(/[\s,;.()\-/]+/).filter(p => p.length >= 4);
        palabras.forEach(p => {
          if (p.toLowerCase().includes(q)) items.add(p);
        });
      }
    });

    return Array.from(items).slice(0, 10);
  }, [busqueda, socios, subcats, todasSubcats]);

  const sociosFiltrados = useMemo(() => {
    let lista = socios.filter(cumpleFiltroUbicacion);
    if (subcatFiltro) lista = lista.filter(s => s.subcategoria_id === subcatFiltro);
    const q = (filtroAplicado || busqueda).trim().toLowerCase();
    if (q) {
      lista = lista.filter(s => {
        const subcatNombre = subcats.find(sc => sc.id === s.subcategoria_id)?.nombre ?? '';
        return (
          s.nombre?.toLowerCase().includes(q) ||
          s.ciudad?.toLowerCase().includes(q) ||
          s.direccion?.toLowerCase().includes(q) ||
          s.descripcion?.toLowerCase().includes(q) ||
          subcatNombre.toLowerCase().includes(q)
        );
      });
    }
    return lista;
  }, [socios, busqueda, filtroAplicado, subcatFiltro, subcats, cumpleFiltroUbicacion]);

  const seleccionarSugerencia = (texto: string) => {
    setFiltroAplicado(texto);
    setBusqueda('');
    Keyboard.dismiss();
  };

  const esFavorita = (id: string) => favoritas.includes(id);

  // Solo cuenta favoritas que aún existen en la lista de socios
  const favoritasActivas = useMemo(
    () => socios.filter(s => favoritas.includes(s.id)),
    [socios, favoritas]
  );

  const toggleFavorita = async (id: string) => {
    const nuevas = favoritas.includes(id)
      ? favoritas.filter(f => f !== id)
      : [...favoritas, id];
    setFavoritas(nuevas);
    await AsyncStorage.setItem('favoritas', JSON.stringify(nuevas));
  };

  const renderMiniCard = (s: SocioComercial) => (
    <TouchableOpacity
      key={s.id}
      style={[styles.miniCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}
      onPress={() => { setSocioModal(s); registrarEvento('ficha_tienda', s.nombre, s.id); }}
      activeOpacity={0.85}
    >
      {s.imagen ? (
        <Image source={{ uri: s.imagen }} style={styles.miniCardImg} resizeMode="cover" />
      ) : (
        <View style={[styles.miniCardImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
        </View>
      )}
      {esDestVigente(s) && (
        <View style={[styles.badgeDestacado, { backgroundColor: '#FFD700' }]}>
          <Ionicons name="star" size={10} color="#fff" />
        </View>
      )}
      <TouchableOpacity
        onPress={() => toggleFavorita(s.id)}
        style={{ position: 'absolute', top: 6, right: 6, backgroundColor: '#00000055', borderRadius: 20, padding: 5, zIndex: 10 }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name={esFavorita(s.id) ? 'heart' : 'heart-outline'} size={14} color={esFavorita(s.id) ? '#ef4444' : '#fff'} />
      </TouchableOpacity>
      <View style={styles.miniCardBody}>
        <Text style={[styles.miniCardNombre, { color: Colors.text }]} numberOfLines={1}>{s.nombre}</Text>
        {(s.ciudad || s.direccion) ? (
          <Text style={[styles.miniCardDir, { color: Colors.textMuted }]} numberOfLines={1}>{s.ciudad || s.direccion}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderModal = () => {
    if (!socioModal) return null;
    const subcatNombre = subcats.find(sc => sc.id === socioModal.subcategoria_id)?.nombre;
    return (
      <FichaTiendaModal
        socio={socioModal}
        subcatNombre={subcatNombre}
        onClose={() => setSocioModal(null)}
        favoritas={favoritas}
        onToggleFavorita={toggleFavorita}
      />
    );
  };

  const renderModalConfig = () => {
    const radios = ['1', '3', '5', '7', '10', '15'];
    return (
      <Modal visible={modalConfigVisible} transparent animationType="slide" onRequestClose={() => setModalConfigVisible(false)}>
        <View style={styles.configOverlay}>
          <View style={[styles.configBox, { backgroundColor: Colors.card }]}>
            <View style={styles.configHeader}>
              <Text style={[styles.configTitle, { color: Colors.text }]}>Cambiar ubicación</Text>
              <TouchableOpacity onPress={() => setModalConfigVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.configSubtitle, { color: Colors.textMuted }]}>
              Buscar por ciudad, localidad o código postal
            </Text>
            <View style={{ zIndex: 10 }}>
              <View style={[styles.configInput, { backgroundColor: Colors.background, borderColor: Colors.border }]}>
                <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
                <TextInput
                  style={[styles.configInputText, { color: Colors.text }]}
                  placeholder="Ciudad"
                  placeholderTextColor={Colors.textMuted}
                  value={ciudadInputTemp}
                  onChangeText={t => { setCiudadInputTemp(t); setMostrarSugCiudad(true); }}
                  onFocus={() => setMostrarSugCiudad(true)}
                  onBlur={() => setTimeout(() => setMostrarSugCiudad(false), 150)}
                />
                {ciudadInputTemp ? (
                  <TouchableOpacity onPress={() => { setCiudadInputTemp(''); setMostrarSugCiudad(false); }}>
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {mostrarSugCiudad && ciudadInputTemp.trim().length > 0 && (() => {
                const sugs = ciudadesDisponibles.filter(c =>
                  c.toLowerCase().includes(ciudadInputTemp.toLowerCase())
                );
                return sugs.length > 0 ? (
                  <View style={[styles.configSugBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                    {sugs.map((c, i) => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.configSugItem, i < sugs.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                        onPress={() => { setCiudadInputTemp(c); setMostrarSugCiudad(false); }}>
                        <Ionicons name="location-outline" size={14} color={Colors.accent} />
                        <Text style={[styles.configSugText, { color: Colors.text }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null;
              })()}
            </View>
            <View style={{ zIndex: 9, marginBottom: 14 }}>
              <TouchableOpacity
                style={[styles.configRadioSection, { borderColor: Colors.border, backgroundColor: Colors.background }]}
                onPress={() => setMostrarRadioList(v => !v)}>
                <Text style={[styles.configRadioLabel, { color: Colors.text }]}>{radioInputTemp} kilómetros</Text>
                <Ionicons name={mostrarRadioList ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              {mostrarRadioList && (
                <View style={[styles.configSugBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                  {radios.map((r, i) => (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.configSugItem,
                        i < radios.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border },
                        radioInputTemp === r && { backgroundColor: Colors.accent + '18' },
                      ]}
                      onPress={() => { setRadioInputTemp(r); setMostrarRadioList(false); }}>
                      <Ionicons name="radio-button-on" size={14} color={radioInputTemp === r ? Colors.accent : Colors.textMuted} />
                      <Text style={[styles.configSugText, { color: radioInputTemp === r ? Colors.accent : Colors.text, fontWeight: radioInputTemp === r ? '700' : '400' }]}>
                        {r} kilómetros
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            {/* Indicador de ubicación (sin mapa) */}
            {buscandoUbicacion && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={{ color: Colors.textMuted, fontSize: 12 }}>Obteniendo ubicación…</Text>
              </View>
            )}
            {!buscandoUbicacion && mapCoords && !ciudadInputTemp.trim() && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                <Ionicons name="location" size={14} color={Colors.accent} />
                <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
                  Ubicación detectada · {mapCoords.latitude.toFixed(4)}, {mapCoords.longitude.toFixed(4)}
                </Text>
              </View>
            )}
            <TouchableOpacity
              style={[styles.configApply, { backgroundColor: Colors.accent }]}
              onPress={() => {
                const ciudad = ciudadInputTemp.trim();
                const radio  = radioInputTemp;
                setUbicacionCiudad(ciudad);
                setUbicacionRadio(radio);
                setModalConfigVisible(false);
                AsyncStorage.setItem('ubicacion_config', JSON.stringify({ ciudad, radio }));
              }}>
              <Text style={styles.configApplyText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderModalInfo = () => {
    const secciones = [
      {
        icono: 'storefront-outline',
        titulo: '🏪 Directorio de Comercios',
        texto: 'Explora tiendas y negocios locales de tu ciudad. Contáctales por WhatsApp, llama directamente, consulta la dirección en Google Maps y navega su catálogo de productos con precios en $ y Bs.',
        subsecciones: [
          { sub: '🔍 Buscar', desc: 'Toca la lupa (abajo a la derecha) para buscar por nombre de tienda, categoría, ciudad o descripción. Aparecen sugerencias automáticas mientras escribes.' },
          { sub: '⭐ Destacados', desc: 'Los negocios con plan Pro aparecen primero. Toca "Destacados → Categoría" para filtrar por rubro (panadería, ropa, repuestos, etc.).' },
          { sub: '📍 Filtro de ubicación', desc: 'Toca el ícono ⚙️ (arriba a la derecha) para filtrar por ciudad y radio en kilómetros. Puedes previsualizar el área en el mapa integrado.' },
          { sub: '🏬 Perfil de negocio', desc: 'Toca cualquier tarjeta para ver el perfil completo: foto de portada, descripción, catálogo de artículos y botones de contacto.' },
          { sub: '🗂️ Catálogo', desc: 'Los negocios publican artículos con foto, nombre y precio. Toca un artículo para verlo ampliado y consultar al vendedor directo por WhatsApp.' },
        ],
      },
      {
        icono: 'people-outline',
        titulo: '🏪 Mis Tiendas',
        texto: 'Si tienes un negocio aprobado, aparece aquí automáticamente al detectar tu número de teléfono. Toca "Abrir" para editar tu perfil en cualquier momento.',
        subsecciones: [
          { sub: '📱 Detección automática', desc: 'Al abrir la app con el número que registraste, tus tiendas aprobadas aparecen de inmediato sin necesidad de iniciar sesión.' },
          { sub: '🏪 Múltiples tiendas', desc: 'Puedes tener más de una tienda registrada con el mismo número, hasta el límite permitido por el administrador.' },
          { sub: '📤 Compartir mi tienda', desc: 'Cada tienda tiene un botón de compartir (📤). Al tocarlo, genera un link web (appcashcash.com) que puedes enviar por WhatsApp, Instagram, Telegram o cualquier red. El cliente lo abre desde el navegador y ve tu perfil, productos y contacto.' },
          { sub: '⚠️ Membresía vencida', desc: 'Si tu membresía venció, la tarjeta se muestra en rojo. Entra a editar y renueva desde el panel para que tu negocio vuelva a aparecer en el directorio.' },
        ],
      },
      {
        icono: 'person-add-outline',
        titulo: '➕ Registrar una Tienda',
        texto: 'Toca "Registrar nueva tienda" dentro del menú "Mis tiendas". Completa el formulario en 3 o 4 pasos según el plan que elijas y envía tu solicitud. El equipo de CashCach la revisará y te avisará por WhatsApp.',
        subsecciones: [
          { sub: '🆓 Plan Gratis', desc: 'Perfil visible en el directorio con foto de portada y galería de hasta 3 productos. Sin costo.' },
          { sub: '⭐ Plan Básico', desc: 'Galería de hasta 6 productos, botones de WhatsApp / llamada / web, y apareces en búsquedas por categoría.' },
          { sub: '🚀 Plan Pro', desc: 'Todo lo del Básico más galería de 12 productos y posición destacada al inicio del directorio.' },
          { sub: '📋 Proceso de aprobación', desc: 'Una vez enviada la solicitud, el equipo verifica los datos (y el pago si aplica) y activa tu perfil. Normalmente en pocas horas.' },
        ],
      },
      {
        icono: 'create-outline',
        titulo: '✏️ Editar mi Tienda',
        texto: 'Desde el panel de edición puedes mantener tu perfil siempre actualizado.',
        subsecciones: [
          { sub: '🖼️ Portada', desc: 'Sube o cambia la foto principal de tu negocio. Es lo primero que ven los clientes.' },
          { sub: '🗂️ Catálogo', desc: 'Agrega artículos con foto (hasta 3 fotos por artículo), nombre y precio en $ y Bs. El precio en Bs se calcula automáticamente con la tasa del día.' },
          { sub: '📝 Datos', desc: 'Actualiza nombre, teléfono, WhatsApp, redes sociales, dirección, ciudad y categoría cuando lo necesites.' },
          { sub: '🔒 Campos bloqueados', desc: 'El nombre y teléfono pueden estar bloqueados por el administrador para evitar cambios no autorizados. Si necesitas modificarlos, contáctanos.' },
          { sub: '🔄 Renovar membresía', desc: 'Antes de que venza tu plan, toca "Renovar membresía", elige el plan y período, realiza el pago y envía el comprobante. El equipo activa la renovación manualmente.' },
        ],
      },
    ];

    return (
      <Modal visible={modalInfo} animationType="slide" transparent={false} onRequestClose={() => setModalInfo(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card }}>
            <TouchableOpacity onPress={() => setModalInfo(false)} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>¿Cómo funciona Mi Tienda?</Text>
              <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>Guía del directorio de comercios</Text>
            </View>
            <View style={{ backgroundColor: Colors.accent + '22', borderRadius: 99, padding: 8 }}>
              <Ionicons name="storefront" size={22} color={Colors.accent} />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {secciones.map((sec, si) => (
              <View key={si} style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card, overflow: 'hidden' }}>
                {/* Cabecera de sección */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: Colors.accent + '10', borderBottomWidth: sec.subsecciones ? 1 : 0, borderBottomColor: Colors.border }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={sec.icono as any} size={18} color={Colors.accent} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text }}>{sec.titulo}</Text>
                </View>

                {/* Descripción principal */}
                <View style={{ padding: 14, paddingTop: 12 }}>
                  <Text style={{ fontSize: 13, color: Colors.textMuted, lineHeight: 20 }}>{sec.texto}</Text>
                </View>

                {/* Subsecciones */}
                {sec.subsecciones && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                    {sec.subsecciones.map((s, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.background, borderRadius: 10, padding: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, minWidth: 130 }}>{s.sub}</Text>
                        <Text style={{ flex: 1, fontSize: 12, color: Colors.textMuted, lineHeight: 18 }}>{s.desc}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {/* Footer */}
            <View style={{ alignItems: 'center', paddingTop: 8, gap: 4 }}>
              <Text style={{ fontSize: 11, color: Colors.textMuted }}>CashCach · Directorio de Comercios Venezuela</Text>
              <Text style={{ fontSize: 10, color: Colors.textMuted + '88' }}>¿Tienes un negocio? ¡Regístralo gratis hoy!</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {renderModal()}
      {renderModalConfig()}
      {/* Header */}
      <View style={[styles.header, { paddingRight: Spacing.lg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
          {/* Btn 1: Tiendas */}
          <TouchableOpacity
            style={[styles.hBtn, { backgroundColor: Colors.accent }]}
            onPress={() => setModalMisTiendas(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="storefront-outline" size={14} color="#fff" />
            <Text style={styles.hBtnText}>
              {misSocios.length > 0 ? `${misSocios.length} Tienda${misSocios.length > 1 ? 's' : ''}` : 'Tiendas'}
            </Text>
          </TouchableOpacity>
          {/* Btn 2: Directorio */}
          <TouchableOpacity
            style={[styles.hBtn, { backgroundColor: Colors.accent + 'DD' }]}
            onPress={() => router.push('/directorio')}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={14} color="#fff" />
            <Text style={styles.hBtnText}>Directorio</Text>
          </TouchableOpacity>
          {/* Btn 3: Mi Ubicación */}
          <TouchableOpacity
            style={[styles.hBtnIcon, { backgroundColor: ubicacionCiudad ? Colors.accent + '22' : Colors.border + '66', borderColor: ubicacionCiudad ? Colors.accent : Colors.border }]}
            onPress={() => { setCiudadInputTemp(ubicacionCiudad); setRadioInputTemp(ubicacionRadio); setModalConfigVisible(true); }}
            activeOpacity={0.8}
          >
            <Ionicons name="settings-outline" size={16} color={ubicacionCiudad ? Colors.accent : Colors.text} />
          </TouchableOpacity>
          {/* Btn 4: Favoritas */}
          <TouchableOpacity
            style={[styles.hBtnIcon, { backgroundColor: favoritasActivas.length > 0 ? '#ef444418' : Colors.border + '66', borderColor: favoritasActivas.length > 0 ? '#ef4444' : Colors.border }]}
            onPress={() => setModalFavoritas(true)}
            activeOpacity={0.8}
          >
            <Ionicons name={favoritasActivas.length > 0 ? 'heart' : 'heart-outline'} size={16} color={favoritasActivas.length > 0 ? '#ef4444' : Colors.text} />
            {favoritasActivas.length > 0 && (
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#ef4444', marginLeft: 2 }}>{favoritasActivas.length}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner ubicación activa */}
      {ubicacionCiudad ? (
        <View style={[styles.locationBanner, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '44' }]}>
          <Ionicons name="location" size={14} color={Colors.accent} />
          <Text style={[styles.locationBannerText, { color: Colors.accent }]}>
            {ubicacionCiudad} · {ubicacionRadio} km
          </Text>
          <TouchableOpacity
            style={{ marginLeft: 'auto' }}
            onPress={() => { setUbicacionCiudad(''); setUbicacionRadio('5'); AsyncStorage.removeItem('ubicacion_config'); }}>
            <Ionicons name="close-circle" size={16} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Modal Mis Tiendas */}
      <Modal visible={modalMisTiendas} animationType="slide" transparent onRequestClose={() => setModalMisTiendas(false)}>
        <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setModalMisTiendas(false)} />
          <View style={{ backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
            </View>
            {/* Header modal */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="storefront" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: Colors.text }}>Mis tiendas</Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 }}>
                  {misSocios.length === 0 ? 'Gestiona tu negocio' : `${misSocios.length} negocio${misSocios.length > 1 ? 's' : ''} registrado${misSocios.length > 1 ? 's' : ''}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalMisTiendas(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
              {/* Negocios detectados */}
              {misSocios.map(s => {
                const diasRestantes = s.fecha_vencimiento
                  ? Math.ceil((new Date(s.fecha_vencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const vencida   = diasRestantes !== null ? diasRestantes <= 0 : false;
                const porVencer = diasRestantes !== null && diasRestantes > 0 && diasRestantes <= 7;
                return (
                  <TouchableOpacity key={s.id}
                    onPress={() => { setModalMisTiendas(false); router.push({ pathname: '/editar-mi-negocio', params: { id: s.id } }); }}
                    activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.background, borderRadius: Radius.lg, borderWidth: 1, borderColor: vencida ? '#ef4444' : porVencer ? '#f97316' : Colors.border, overflow: 'hidden' }}>
                    {s.imagen ? (
                      <Image source={{ uri: s.imagen }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 64, height: 64, backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="storefront-outline" size={24} color={Colors.accent} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.text, fontSize: FontSize.sm, fontWeight: '800' }}>{s.nombre}</Text>
                      {vencida ? (
                        <Text style={{ color: '#ef4444', fontSize: FontSize.xs, fontWeight: '700', marginTop: 2 }}>⚠ Membresía vencida</Text>
                      ) : porVencer ? (
                        <Text style={{ color: '#f97316', fontSize: FontSize.xs, fontWeight: '700', marginTop: 2 }}>⚠ Vence en {diasRestantes} día{diasRestantes !== 1 ? 's' : ''}</Text>
                      ) : diasRestantes !== null ? (
                        <Text style={{ color: Colors.success, fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 }}>✓ {diasRestantes} día{diasRestantes !== 1 ? 's' : ''} restantes</Text>
                      ) : (
                        <Text style={{ color: Colors.accent, fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 }}>Editar · subir imágenes</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6, marginRight: 12 }}>
                      <TouchableOpacity
                        onPress={() => Share.share({
                          message: `Mira la tienda *${s.nombre}* en CashCach:\n${urlTienda(s)}`,
                          url: urlTienda(s),
                        })}
                        style={{ backgroundColor: Colors.accent + '18', paddingHorizontal: 12, paddingVertical: 10, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="share-outline" size={16} color={Colors.accent} />
                      </TouchableOpacity>
                      <View style={{ backgroundColor: vencida ? '#ef4444' : Colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md }}>
                        <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: '800' }}>Abrir</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {/* Sin negocios — en revisión */}
              {misSocios.length === 0 && yaEnvioSolicitud && !solicitudRechazada && (
                <View style={{ backgroundColor: '#fefce8', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#fde68a', padding: Spacing.md, gap: 8, alignItems: 'center' }}>
                  <Ionicons name="time-outline" size={32} color="#d97706" />
                  <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: '#92400e', textAlign: 'center' }}>Solicitud en revisión</Text>
                  <Text style={{ fontSize: FontSize.sm, color: '#78350f', textAlign: 'center', lineHeight: 20 }}>
                    El equipo de CashCach está verificando tu información. Cuando sea aprobada, tu negocio aparecerá aquí.
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      setYaEnvioSolicitud(false);
                      await AsyncStorage.removeItem('solicitud_socio_enviada');
                      await AsyncStorage.removeItem('solicitud_id');
                      await AsyncStorage.removeItem('solicitud_rechazada');
                    }}
                    activeOpacity={0.7}
                    style={{ marginTop: 2, paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: '#d97706' }}>
                    <Text style={{ fontSize: FontSize.xs, color: '#92400e', fontWeight: '700' }}>¿No enviaste solicitud? Limpiar estado</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Sin negocios — solicitud rechazada */}
              {misSocios.length === 0 && !yaEnvioSolicitud && solicitudRechazada && (
                <View style={{ backgroundColor: '#fef2f2', borderRadius: Radius.lg, borderWidth: 1, borderColor: '#fecaca', padding: Spacing.md, gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close-circle-outline" size={28} color="#ef4444" />
                  </View>
                  <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: '#b91c1c', textAlign: 'center' }}>
                    Solicitud rechazada
                  </Text>
                  <Text style={{ fontSize: FontSize.sm, color: '#7f1d1d', textAlign: 'center', lineHeight: 20 }}>
                    Tu solicitud no pudo ser aprobada. Podés corregir tu información e intentarlo nuevamente.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {solicitudRechazada.motivo ? (
                      <TouchableOpacity
                        onPress={() => setModalMotivoRechazo(true)}
                        activeOpacity={0.85}
                        style={{ flex: 1, borderRadius: Radius.md, paddingVertical: 10, borderWidth: 1.5, borderColor: '#ef4444', alignItems: 'center' }}>
                        <Text style={{ color: '#ef4444', fontSize: FontSize.sm, fontWeight: '800' }}>Ver motivo</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={async () => {
                        const prevId = await AsyncStorage.getItem('solicitud_id');
                        setSolicitudRechazada(null);
                        await AsyncStorage.removeItem('solicitud_socio_enviada');
                        await AsyncStorage.removeItem('solicitud_id');
                        await AsyncStorage.removeItem('solicitud_rechazada');
                        setModalMisTiendas(false);
                        router.push({ pathname: '/unirse-socio', params: prevId ? { reintentoId: prevId } : {} });
                      }}
                      activeOpacity={0.85}
                      style={{ flex: 1, backgroundColor: '#ef4444', borderRadius: Radius.md, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: '800' }}>Intentar de nuevo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Sin negocios — sin solicitud */}
              {misSocios.length === 0 && !yaEnvioSolicitud && !solicitudRechazada && (
                <View style={{ backgroundColor: Colors.accent + '0D', borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.accent + '33', padding: Spacing.md, gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.accent + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
                  </View>
                  <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: Colors.accent, textAlign: 'center' }}>
                    ¡Registra tu negocio gratis!
                  </Text>
                  <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                    Llega a más clientes en tu ciudad. Muestra tu catálogo, recibe contactos por WhatsApp y destaca entre los mejores negocios de CashCach.
                  </Text>
                </View>
              )}

              {/* Banner ofertas activas */}
              {misSocios.length < limiteTiendas && !yaEnvioSolicitud && !solicitudRechazada && ofertasPromo.length > 0 && (
                <View style={{ borderRadius: Radius.md, overflow: 'hidden' }}>
                  {ofertasPromo.map((o, i) => {
                    const planLabel = o.plan === 'pro' ? 'Pro' : 'Básico';
                    const periodoLabel = o.periodo === 'anual' ? '/año' : '/mes';
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f59e0b22', borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#f59e0b55', marginBottom: i < ofertasPromo.length - 1 ? 6 : 0 }}>
                        <Text style={{ fontSize: 18 }}>🏷️</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: FontSize.xs, fontWeight: '800', color: '#b45309' }}>
                            {o.tagline ? o.tagline : `¡Oferta! Plan ${planLabel}`}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                            {o.precio_original ? (
                              <Text style={{ fontSize: 11, color: '#92400e', textDecorationLine: 'line-through' }}>${o.precio_original}{periodoLabel}</Text>
                            ) : null}
                            <Text style={{ fontSize: FontSize.sm, fontWeight: '800', color: '#b45309' }}>${o.precio_oferta}{periodoLabel}</Text>
                            {o.descuento_pct ? (
                              <View style={{ backgroundColor: '#f59e0b', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>-{o.descuento_pct}%</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Registrar nueva tienda — ocultar si hay solicitud pendiente o rechazada */}
              {misSocios.length < limiteTiendas && !yaEnvioSolicitud && !solicitudRechazada && (
                <TouchableOpacity
                  onPress={() => { setModalMisTiendas(false); router.push('/unirse-socio'); }}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.accent + '55', borderStyle: 'dashed' }}>
                  <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                  <Text style={{ flex: 1, color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' }}>Registrar nueva tienda</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.accent} />
                </TouchableOpacity>
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>


      {/* Modal Motivo Rechazo */}
      <Modal visible={modalMotivoRechazo} animationType="fade" transparent onRequestClose={() => setModalMotivoRechazo(false)}>
        <View style={{ flex: 1, backgroundColor: '#00000080', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: Colors.card, borderRadius: 20, width: '100%', maxWidth: 360, overflow: 'hidden' }}>
            {/* Header rojo */}
            <View style={{ backgroundColor: '#ef4444', paddingVertical: 20, paddingHorizontal: 24, alignItems: 'center', gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: FontSize.md, fontWeight: '800', textAlign: 'center' }}>Solicitud rechazada</Text>
              <Text style={{ color: '#ffffff99', fontSize: FontSize.xs, textAlign: 'center' }}>Mensaje del equipo CashCach</Text>
            </View>
            {/* Cuerpo del mensaje */}
            <View style={{ padding: 24, gap: 16 }}>
              <View style={{ backgroundColor: '#fef2f2', borderRadius: Radius.md, padding: 16, borderLeftWidth: 3, borderLeftColor: '#ef4444' }}>
                <Text style={{ fontSize: FontSize.sm, color: '#7f1d1d', lineHeight: 22 }}>
                  {solicitudRechazada?.motivo ?? ''}
                </Text>
              </View>
              <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 }}>
                Podés corregir tu información e intentar nuevamente.
              </Text>
              <TouchableOpacity
                onPress={() => setModalMotivoRechazo(false)}
                activeOpacity={0.85}
                style={{ backgroundColor: '#ef4444', borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: FontSize.sm, fontWeight: '800' }}>Entendido</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Favoritas */}
      <Modal visible={modalFavoritas} animationType="slide" transparent onRequestClose={() => setModalFavoritas(false)}>
        <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setModalFavoritas(false)} />
          <View style={{ backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%' }}>
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#ef444422', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Ionicons name="heart" size={18} color="#ef4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FontSize.md, fontWeight: '800', color: Colors.text }}>Tiendas favoritas</Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 }}>
                  {favoritasActivas.length === 0 ? 'Guarda las tiendas que te interesan' : `${favoritasActivas.length} tienda${favoritasActivas.length > 1 ? 's' : ''} guardada${favoritasActivas.length > 1 ? 's' : ''}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalFavoritas(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
              {favoritasActivas.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
                  <Ionicons name="heart-outline" size={48} color={Colors.textMuted + '66'} />
                  <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' }}>
                    {'Toca el ❤️ en cualquier tienda\npara guardarla aquí.'}
                  </Text>
                </View>
              ) : (
                favoritasActivas.map(s => (
                  <TouchableOpacity key={s.id}
                    onPress={() => { setModalFavoritas(false); setSocioModal(s); }}
                    activeOpacity={0.85}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.background, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                    {s.imagen ? (
                      <Image source={{ uri: s.imagen }} style={{ width: 64, height: 64 }} resizeMode="cover" />
                    ) : (
                      <View style={{ width: 64, height: 64, backgroundColor: '#ef444410', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="storefront-outline" size={24} color="#ef4444" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: Colors.text, fontSize: FontSize.sm, fontWeight: '800' }}>{s.nombre}</Text>
                      {s.ciudad ? <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }}>{s.ciudad}</Text> : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => toggleFavorita(s.id)}
                      style={{ padding: 12, marginRight: 4 }}>
                      <Ionicons name="close-circle" size={22} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
              <View style={{ height: 16 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal buscador */}
      <Modal visible={modalBuscar} animationType="fade" transparent onRequestClose={() => {
        if (busqueda.trim()) { setFiltroAplicado(busqueda.trim()); setBusqueda(''); }
        setModalBuscar(false);
      }}>
        <View style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'center', padding: Spacing.lg }}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => {
            if (busqueda.trim()) { setFiltroAplicado(busqueda.trim()); setBusqueda(''); }
            setModalBuscar(false);
          }} />
          <View style={{ zIndex: 10 }}>
            <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.accent, borderWidth: 1.5, borderRadius: Radius.lg, elevation: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } }]}>
              <Ionicons name="search-outline" size={20} color={Colors.accent} />
              <TextInput
                ref={inputRef}
                style={[styles.searchInput, { color: Colors.text, fontSize: FontSize.md }]}
                placeholder="Buscar comercio…"
                placeholderTextColor={Colors.textMuted}
                value={busqueda}
                onChangeText={setBusqueda}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
              />
              {busqueda ? (
                <TouchableOpacity onPress={() => setBusqueda('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
            {sugerencias.length > 0 && (
              <View style={[styles.dropdown, { backgroundColor: Colors.card, borderColor: Colors.border, marginTop: 6 }]}>
                {sugerencias.map((sug, i) => (
                  <TouchableOpacity key={i}
                    style={[styles.dropdownItem, i < sugerencias.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                    onPress={() => { seleccionarSugerencia(sug); setModalBuscar(false); }}>
                    <Ionicons name="search-outline" size={14} color={Colors.textMuted} style={{ marginRight: 8 }} />
                    <Text style={[styles.dropdownText, { color: Colors.text }]}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {cargando ? (
        <Animated.View style={[{ flex: 1 }, pulsoStyle]}>
        <ScrollView contentContainerStyle={styles.body} scrollEnabled={false}>
          {/* Skeleton destacados */}
          <View style={styles.seccionHeader}>
            <View style={[styles.skeletonLine, { width: 80, height: 12 }]} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
            {[1,2].map(i => (
              <View key={i} style={[styles.cardDestacado, { width: '49%', backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <View style={[styles.cardDestacadoImg, { backgroundColor: Colors.border }]} />
                <View style={{ padding: 8, gap: 6 }}>
                  <View style={[styles.skeletonLine, { width: '70%', height: 11 }]} />
                  <View style={[styles.skeletonLine, { width: '45%', height: 9 }]} />
                </View>
              </View>
            ))}
          </View>
          {/* Skeleton grilla */}
          <View style={styles.grilla}>
            {[1,2,3,4,5,6].map(i => (
              <View key={i} style={[styles.miniCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                <View style={[styles.miniCardImg, { backgroundColor: Colors.border }]} />
                <View style={styles.miniCardBody}>
                  <View style={[styles.skeletonLine, { width: '65%', height: 11, marginBottom: 5 }]} />
                  <View style={[styles.skeletonLine, { width: '40%', height: 9 }]} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        </Animated.View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.centeredText}>{error}</Text>
          <TouchableOpacity style={[styles.reintentarBtn, { backgroundColor: Colors.accent }]} onPress={() => cargar()}>
            <Text style={styles.reintentarText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor={Colors.accent} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* Sección Destacados */}
          {!busqueda && (destacados.length > 0 || subcats.length > 0) && (
            <View>

            </View>
          )}

          {/* Grid unificado: destacados primero (con estrella) + tiendas aleatorias */}
          {!busqueda && !filtroAplicado && !subcatFiltro && (destacados.length > 0 || sociosCiudad.length > 0) && (
            <View style={[styles.grilla, { marginTop: 8 }]}>
              {[...destacados, ...sociosCiudad].map(s => renderMiniCard(s))}
            </View>
          )}

          {/* Chip de filtro aplicado */}
          {filtroAplicado ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, paddingTop: 8, paddingBottom: 2 }}>
              <Ionicons name="search" size={14} color={Colors.accent} />
              <Text style={{ flex: 1, fontSize: FontSize.sm, color: Colors.accent, fontWeight: '600' }} numberOfLines={1}>{filtroAplicado}</Text>
              <TouchableOpacity onPress={() => setFiltroAplicado('')}>
                <Ionicons name="close-circle" size={18} color={Colors.accent} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Resultados de búsqueda o filtro subcategoría */}
          {(busqueda.trim() !== '' || filtroAplicado || subcatFiltro) && (
            sociosFiltrados.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.centeredText}>Sin resultados</Text>
              </View>
            ) : (
              <View style={styles.grilla}>
                {sociosFiltrados.map(s => renderMiniCard(s))}
              </View>
            )
          )}
        </ScrollView>
      )}

      {/* FAB info — arriba del de búsqueda */}
      <TouchableOpacity
        onPress={() => setModalInfo(true)}
        activeOpacity={0.85}
        style={{ position: 'absolute', bottom: 92, right: 30, width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.accent + '66', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <Ionicons name="information-circle-outline" size={20} color={Colors.accent} />
      </TouchableOpacity>

      {/* FAB búsqueda / cerrar modal */}
      <TouchableOpacity
        onPress={() => {
          if (busqueda) { setBusqueda(''); setModalBuscar(false); }
          else { setModalBuscar(true); }
        }}
        activeOpacity={0.85}
        style={{ position: 'absolute', bottom: 28, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
        <Ionicons name={busqueda ? 'close' : 'search'} size={24} color="#fff" />
      </TouchableOpacity>

      {renderModalInfo()}
    </SafeAreaView>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingLeft: Spacing.lg, paddingRight: 8, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  backBtn:           { padding: 4 },
  headerTitle:       { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  configBtn:         { width: 34, height: 34, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  miTiendaBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
  directorioBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
  directorioBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  hBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.md },
  hBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  hBtnIcon: { flexDirection: 'row', width: 32, height: 32, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  locationBanner:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.lg, paddingVertical: 7, borderBottomWidth: 1 },
  locationBannerText:{ fontSize: FontSize.sm, fontWeight: '600' },

  configOverlay:     { flex: 1, backgroundColor: '#00000060', justifyContent: 'center', padding: 20 },
  configBox:         { borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  configHeader:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  configTitle:       { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  configSubtitle:    { fontSize: FontSize.sm, marginBottom: 14 },
  configInput:       { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  configInputText:   { flex: 1, fontSize: FontSize.md, padding: 0 },
  configRadioSection:{ flexDirection: 'row', alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  configRadioLabel:  { flex: 1, fontSize: FontSize.md, fontWeight: '600' },
  configMapBox:        { height: 180, borderRadius: Radius.lg, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  configMapLabel:      { position: 'absolute', top: 8, left: 12, zIndex: 10, fontSize: FontSize.sm, fontWeight: '700', backgroundColor: '#00000066', color: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  configMapExpandHint: { position: 'absolute', bottom: 8, right: 8, backgroundColor: '#00000066', borderRadius: 8, padding: 5 },
  mapaFullCerrar:      { position: 'absolute', top: 50, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6 },
  configApply:       { borderRadius: Radius.md, paddingVertical: 13, alignItems: 'center' },
  configApplyText:   { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  configSugBox:      { borderRadius: Radius.md, borderWidth: 1, marginTop: -8, marginBottom: 10, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 },
  configSugItem:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  configSugText:     { fontSize: FontSize.sm, fontWeight: '600' },

  searchWrap: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.md, zIndex: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, padding: 0 },
  dropdown: {
    position: 'absolute', top: '100%', left: Spacing.lg, right: Spacing.lg,
    borderRadius: Radius.md, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8, zIndex: 100,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12 },
  dropdownText: { fontSize: FontSize.sm },

  skeletonLine:   { borderRadius: 6, backgroundColor: Colors.border, opacity: 0.7 },

  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.xl },
  centeredText:   { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  reintentarBtn:  { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.md },
  reintentarText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  body: { padding: Spacing.sm, gap: Spacing.sm, paddingBottom: 40 },

  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  seccionTitulo: { fontSize: FontSize.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Destacados horizontal
  destacadosRow: { gap: 10, paddingBottom: 4, paddingHorizontal: 2 },
  cardDestacado: {
    width: 155, borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', gap: 5, paddingBottom: 10,
  },
  cardDestacadoImg:      { width: '100%', height: 160 },
  cardDestacadoNombre:   { fontSize: FontSize.sm, fontWeight: '700', paddingHorizontal: 8 },
  cardDestacadoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginHorizontal: 8, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  cardDestacadoBtnText:  { fontSize: 11, fontWeight: '700' },

  // Badge destacado
  badgeDestacado: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99,
  },
  badgeDestacadoText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Grilla 2 columnas
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  miniCard: {
    width: '49%', borderRadius: 16, borderWidth: 1,
    overflow: 'hidden',
  },
  miniCardImg:    { width: '100%', height: 220 },
  miniCardBody:   { padding: 8, gap: 2 },
  miniCardNombre: { fontSize: FontSize.sm, fontWeight: '700' },
  miniCardDir:    { fontSize: 11 },

  infoFila:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: Spacing.md },
  infoTexto: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted },

  botonesRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, marginTop: 4 },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1,
  },
  contactBtnText: { fontSize: FontSize.sm, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Radius.lg * 2, borderTopRightRadius: Radius.lg * 2,
    overflow: 'hidden',
  },
  modalCerrar: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    padding: 6, borderRadius: 99,
  },
  modalImagen:            { width: '100%', height: 300 },
  modalImagenPlaceholder: { width: '100%', height: 260, alignItems: 'center', justifyContent: 'center' },
  modalBody:              { padding: Spacing.lg, paddingBottom: 40 },
  modalNombre:            { fontSize: FontSize.xl, fontWeight: '800' },

  // Modal rediseñado
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '700' },
  modalDestacadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  modalDestacadoText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  modalHero:       { width: '100%', height: 260, position: 'relative', marginBottom: 24 },
  modalHeroImg:    { width: '100%', height: '100%' },
  modalHeroBottom: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.md, paddingTop: 0, paddingBottom: 6,
    backgroundColor: '#00000066',
  },
  modalHeroNombre:  { fontSize: FontSize.xl, fontWeight: '900', color: '#fff' },
  modalHeroTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ffffff22', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  modalHeroDireccion: {
    position: 'absolute', bottom: Spacing.md, right: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000055', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: '50%',
  },
  modalHeroSubcat: {
    position: 'absolute', bottom: Spacing.md, left: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000055', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  modalHeroCiudad: {
    position: 'absolute', top: 6, right: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000055', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  modalHeroTagText: { fontSize: 11, color: '#ffffffDD', fontWeight: '600' },
  modalCuerpo:  { gap: 10, padding: 10 },
  modalSeccion: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  modalSeccionLabel: {
    fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 6,
  },
  modalBotonesOverlay: {
    position: 'absolute', bottom: -24, left: 10, right: 10,
    flexDirection: 'row', gap: 8, zIndex: 10,
  },
  modalContactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: Radius.lg,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  modalContactBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },
  galeriaImgGrande: {
    width: '48.5%', height: 200, borderRadius: Radius.md,
    borderWidth: 1, overflow: 'hidden',
  },

  bannerSocio: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md,
  },
  bannerSocioIcono: {
    width: 40, height: 40, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerSocioTitulo: { fontSize: FontSize.sm, fontWeight: '800' },
  bannerSocioSub:    { fontSize: FontSize.xs, marginTop: 1 },

  galeriaTitulo: { fontSize: FontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  galeriaGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galeriaImg: {
    width: '31%', aspectRatio: 1, borderRadius: Radius.md,
    borderWidth: 1, overflow: 'hidden',
  },
  galeriaOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#000000AA', paddingHorizontal: 6, paddingVertical: 5,
  },
  galeriaOverlayPrecio: { color: '#FFD700', fontSize: 11, fontWeight: '800' },
  galeriaOverlayBs:     { color: '#ffffffBB', fontSize: 10, fontWeight: '600' },
  galeriaOverlayTitulo: { color: '#ffffffCC', fontSize: 10, fontWeight: '500', marginTop: 1 },

  /* Modal producto */
  productoBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
    maxHeight: '95%',
  },
  productoImg:     { width: '100%', height: 380 },
  productoPrecio:   { fontSize: FontSize.xl, fontWeight: '800' },
  productoPrecioBs: { fontSize: FontSize.md, fontWeight: '600', marginBottom: 2 },
  productoTitulo:   { fontSize: FontSize.lg, fontWeight: '700' },
  productoWaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: Radius.lg, paddingVertical: 15, marginTop: 4,
  },
  productoWaBtnText:  { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  productoCerrarX: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
}); }
