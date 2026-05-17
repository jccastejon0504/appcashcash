import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl,
  Image, TextInput, Keyboard, Modal, Dimensions, Alert, Share,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, Subcategoria, SocioComercial } from '@/services/supabase';
import { registrarEvento } from '@/services/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';

function urlTienda(s: { id: string; slug?: string | null }): string {
  return s.slug
    ? `https://appcashcash.com/t/${s.slug}`
    : `https://appcashcash.com/admin/tienda.html?id=${s.id}`;
}

type Nivel = 'subcategorias' | 'comercios';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default function DirectorioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { height: altPantalla } = useWindowDimensions();
  const router = useRouter();
  const { openConfig } = useLocalSearchParams<{ openConfig?: string }>();

  const [nivel,           setNivel]           = useState<Nivel>('subcategorias');
  const [subcategorias,   setSubcategorias]   = useState<Subcategoria[]>([]);
  const [comercios,           setComercios]           = useState<SocioComercial[]>([]);
  const [comerciosSinCoords,  setComerciossInCoords]  = useState<SocioComercial[]>([]);
  const [todosComercios,  setTodosComercios]  = useState<SocioComercial[]>([]);
  const [subcatActiva,    setSubcatActiva]    = useState<Subcategoria | null>(null);
  const [cargando,        setCargando]        = useState(true);
  const [refrescando,     setRefrescando]     = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [busqueda,        setBusqueda]        = useState('');
  const [mostrarSug,      setMostrarSug]      = useState(false);
  const [ciudadFiltro,    setCiudadFiltro]    = useState<string | null>(null);
  const [subcatsGlobal,   setSubcatsGlobal]   = useState<Subcategoria[]>([]);
  const [ciudades,        setCiudades]        = useState<{ id: string; nombre: string; imagen: string | null }[]>([]);
  const [modalCiudades,   setModalCiudades]   = useState(false);
  const [ciudadActiva,    setCiudadActiva]    = useState<string | null>(null);
  const [modalConfigVisible,  setModalConfigVisible]  = useState(false);
  const [ciudadGlobal,        setCiudadGlobal]        = useState('');
  const [radioGlobal,         setRadioGlobal]          = useState('3');
  const [ciudadInputTemp,     setCiudadInputTemp]     = useState('');
  const [radioInputTemp,      setRadioInputTemp]      = useState('3');
  const [ciudadesDisponibles, setCiudadesDisponibles] = useState<string[]>([]);
  const [mostrarSugCiudad,    setMostrarSugCiudad]    = useState(false);
  const [mostrarRadioList,    setMostrarRadioList]    = useState(false);
  const [mapCoords,           setMapCoords]           = useState<{ latitude: number; longitude: number } | null>(null);
  const [buscandoUbicacion,   setBuscandoUbicacion]   = useState(false);
  const [coordsGlobal,        setCoordsGlobal]        = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapaExpandido,       setMapaExpandido]       = useState(false);
  const [comercioModal,   setComercioModal]   = useState<SocioComercial | null>(null);
  const [imagenAmpliada,  setImagenAmpliada]  = useState<string | null>(null);
  type ItemGaleria = { id: string; imagen: string; imagen2: string | null; imagen3: string | null; titulo: string | null; precio: string | null; precio_bs: string | null };
  const [galeriaItems,    setGaleriaItems]    = useState<ItemGaleria[]>([]);
  const [productoModal,   setProductoModal]   = useState<{ item: ItemGaleria; whatsapp: string | null } | null>(null);
  const [paginaProducto,  setPaginaProducto]  = useState(0);
  const ANCHO = Dimensions.get('window').width;
  const inputRef = useRef<TextInput>(null);

  // Refresco manual (pull-to-refresh): sólo recarga sin cambiar nivel
  const cargarSubcategorias = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const [{ data: subs, error: err }, { data: coms }, { data: subsG }, { data: cats }] = await Promise.all([
      supabase.from('subcategorias').select('*').is('categoria_id', null).order('nombre'),
      supabase.from('socios_comerciales').select('*').or(`fecha_vencimiento.is.null,fecha_vencimiento.gt.${new Date().toISOString()}`),
      supabase.from('subcategorias').select('id,nombre').is('categoria_id', null),
      supabase.from('categorias').select('id,nombre,imagen').order('orden'),
    ]);
    if (err) setError('No se pudo cargar el directorio');
    else setSubcategorias(subs ?? []);
    setTodosComercios(coms ?? []);
    setSubcatsGlobal((subsG ?? []) as any);
    setCiudades(cats ?? []);
    if (esRefresh) setRefrescando(false); else setCargando(false);
  }, []);

  // Inicialización
  useEffect(() => {
    const init = async () => {
      const raw = await AsyncStorage.getItem('ubicacion_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        setCiudadGlobal(cfg.ciudad ?? '');
        setRadioGlobal(cfg.radio ?? '3');
        if (cfg.latitud && cfg.longitud) setCoordsGlobal({ latitude: cfg.latitud, longitude: cfg.longitud });
      }
      cargarSubcategorias();
    };
    init();
  }, []);

  useEffect(() => {
    if (openConfig === '1') {
      setCiudadInputTemp(ciudadGlobal);
      setRadioInputTemp(radioGlobal);
      setModalConfigVisible(true);
    }
  }, [openConfig]);

  // Cargar ciudades para autocomplete
  useEffect(() => {
    supabase.from('categorias').select('nombre').order('nombre').then(({ data }) => {
      if (data) setCiudadesDisponibles(data.map((c: { nombre: string }) => c.nombre));
    });
  }, []);

  // Geocodificar ciudad escrita
  useEffect(() => {
    const ciudad = ciudadInputTemp.trim();
    if (!ciudad) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(ciudad)}&format=json&limit=1`, { headers: { 'User-Agent': 'CashCashApp/1.0' } });
        const json = await res.json();
        if (json.length > 0) setMapCoords({ latitude: parseFloat(json[0].lat), longitude: parseFloat(json[0].lon) });
      } catch { /* sin internet */ }
    }, 600);
    return () => clearTimeout(timer);
  }, [ciudadInputTemp]);

  // GPS cuando se abre el modal sin ciudad
  useEffect(() => {
    if (!modalConfigVisible || ciudadInputTemp.trim()) return;
    (async () => {
      setBuscandoUbicacion(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMapCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      }
      setBuscandoUbicacion(false);
    })();
  }, [modalConfigVisible]);

  useEffect(() => {
    if (!comercioModal) { setGaleriaItems([]); return; }
    supabase.from('galeria_items').select('*').eq('socio_id', comercioModal.id).order('orden')
      .then(({ data }) => setGaleriaItems((data ?? []) as ItemGaleria[]));
  }, [comercioModal]);

  const seleccionarSubcategoria = async (sub: Subcategoria) => {
    setSubcatActiva(sub);
    setCargando(true);
    let q = supabase
      .from('socios_comerciales')
      .select('*')
      .eq('subcategoria_id', sub.id)
      .or(`fecha_vencimiento.is.null,fecha_vencimiento.gt.${new Date().toISOString()}`)
      .order('orden', { ascending: true });
    const filtCiudad = ciudadActiva || (coordsGlobal ? null : ciudadGlobal);
    if (filtCiudad) q = q.eq('ciudad', filtCiudad);
    const { data } = await q;
    let results = data ?? [];
    if (coordsGlobal) {
      const radio = parseFloat(radioGlobal);
      const conCoords    = results.filter(c => c.latitud && c.longitud);
      const sinCoords    = results.filter(c => !c.latitud || !c.longitud);
      const enRango      = conCoords.filter(c => haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, c.latitud!, c.longitud!) <= radio);
      enRango.sort((a, b) => haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, a.latitud!, a.longitud!) - haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, b.latitud!, b.longitud!));
      setComerciossInCoords(sinCoords);
      results = enRango;
    } else {
      setComerciossInCoords([]);
    }
    setComercios(results);
    setCargando(false);
    setNivel('comercios');
  };

  const volverAtras = () => {
    setBusqueda('');
    setMostrarSug(false);
    if (nivel === 'comercios') setNivel('subcategorias');
    else router.push('/socios');
  };

  // Autocomplete sobre todos los comercios
  const sugerencias = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    const items = new Set<string>();
    todosComercios.forEach(c => {
      const subcatNombre = subcatsGlobal.find(s => s.id === c.subcategoria_id)?.nombre;
      [c.nombre, c.ciudad, c.direccion, subcatNombre].forEach(v => {
        if (v?.toLowerCase().includes(q)) items.add(v!);
      });
      if (c.descripcion?.toLowerCase().includes(q)) {
        items.add(c.descripcion.length > 50 ? c.descripcion.slice(0, 50) + '…' : c.descripcion);
      }
    });
    return Array.from(items).slice(0, 6);
  }, [busqueda, todosComercios, subcatsGlobal]);

  // Todos los comercios que coinciden con la búsqueda (sin filtro ciudad)
  const comerciosBuscadosBase = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return todosComercios.filter(c => {
      const subcatNombre = subcatsGlobal.find(s => s.id === c.subcategoria_id)?.nombre ?? '';
      return (
        c.nombre?.toLowerCase().includes(q) ||
        c.ciudad?.toLowerCase().includes(q) ||
        c.direccion?.toLowerCase().includes(q) ||
        c.descripcion?.toLowerCase().includes(q) ||
        subcatNombre.toLowerCase().includes(q)
      );
    });
  }, [busqueda, todosComercios, subcatsGlobal]);

  // Ciudades disponibles en los resultados de búsqueda (para chips de filtro)
  const ciudadesEnResultados = useMemo(() => {
    const set = new Set<string>();
    comerciosBuscadosBase.forEach(c => { if (c.ciudad) set.add(c.ciudad); });
    return Array.from(set).sort();
  }, [comerciosBuscadosBase]);

  // Comercios filtrados — verificados (con coords en rango) y sin coords
  const { comerciosBuscados, comerciosBuscadosSinCoords } = useMemo(() => {
    let base = comerciosBuscadosBase;
    if (ciudadFiltro) base = base.filter(c => c.ciudad === ciudadFiltro);
    if (coordsGlobal) {
      const radio      = parseFloat(radioGlobal);
      const conCoords  = base.filter(c => c.latitud && c.longitud);
      const sinCoords  = base.filter(c => !c.latitud || !c.longitud);
      const enRango    = conCoords.filter(c => haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, c.latitud!, c.longitud!) <= radio);
      enRango.sort((a, b) => haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, a.latitud!, a.longitud!) - haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, b.latitud!, b.longitud!));
      return { comerciosBuscados: enRango, comerciosBuscadosSinCoords: sinCoords };
    }
    if (ciudadGlobal) base = base.filter(c => c.ciudad?.toLowerCase().includes(ciudadGlobal.toLowerCase()));
    return { comerciosBuscados: base, comerciosBuscadosSinCoords: [] };
  }, [comerciosBuscadosBase, ciudadFiltro, ciudadGlobal, coordsGlobal, radioGlobal]);

  const enBusqueda = busqueda.trim().length > 0;

  // Mapa id → distancia en km (solo cuando hay coordsGlobal)
  const distanciasMap = useMemo(() => {
    if (!coordsGlobal) return new Map<string, number>();
    const map = new Map<string, number>();
    todosComercios.forEach(c => {
      if (c.latitud && c.longitud) {
        map.set(c.id, haversineKm(coordsGlobal.latitude, coordsGlobal.longitude, c.latitud, c.longitud));
      }
    });
    return map;
  }, [coordsGlobal, todosComercios]);

  const seleccionarSugerencia = (texto: string) => {
    setBusqueda(texto);
    setMostrarSug(false);
    Keyboard.dismiss();
  };

  const tituloHeader = () => {
    if (nivel === 'comercios' && subcatActiva) return subcatActiva.nombre;
    return ciudadGlobal ? `Directorio · ${ciudadGlobal}` : 'Directorio';
  };

  const abrirMapa = (direccion: string) => {
    if (!direccion) return;
    const query = encodeURIComponent(direccion);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  };

  const abrirEnlace = (url: string) => {
    if (!url) return;
    Linking.openURL(url.startsWith('http') ? url : `https://${url}`).catch(() => {});
  };
  const abrirWhatsApp = (n: string) => {
    if (!n) return;
    Linking.openURL(`https://wa.me/${n.replace(/\D/g, '')}`).catch(() => {});
  };
  const abrirTelefono = (n: string) => {
    if (!n) return;
    Linking.openURL(`tel:${n}`).catch(() => {});
  };

  // Gestos para el visor de imagen
  const escala      = useSharedValue(1);
  const escalaBase  = useSharedValue(1);
  const transX      = useSharedValue(0);
  const transY      = useSharedValue(0);
  const transXBase  = useSharedValue(0);
  const transYBase  = useSharedValue(0);

  const resetVisor = () => {
    escala.value     = withTiming(1);
    escalaBase.value = 1;
    transX.value     = withTiming(0);
    transY.value     = withTiming(0);
    transXBase.value = 0;
    transYBase.value = 0;
  };

  useEffect(() => { if (!imagenAmpliada) resetVisor(); }, [imagenAmpliada]);

  const pinch = Gesture.Pinch()
    .onUpdate(e => { escala.value = Math.max(1, escalaBase.value * e.scale); })
    .onEnd(() => { escalaBase.value = escala.value; });

  const pan = Gesture.Pan()
    .onUpdate(e => {
      transX.value = transXBase.value + e.translationX;
      transY.value = transYBase.value + e.translationY;
    })
    .onEnd(() => {
      transXBase.value = transX.value;
      transYBase.value = transY.value;
    });

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    escala.value = withTiming(1); escalaBase.value = 1;
    transX.value = withTiming(0); transY.value = withTiming(0);
    transXBase.value = 0; transYBase.value = 0;
  });

  const gestos = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, pan), pinch);

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [
      { translateX: transX.value },
      { translateY: transY.value },
      { scale: escala.value },
    ],
  }));

  const renderMiniCard = (c: SocioComercial) => (
    <TouchableOpacity key={c.id}
      style={[styles.miniCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}
      onPress={() => { setComercioModal(c); registrarEvento('ficha_tienda', c.nombre, c.id); }} activeOpacity={0.85}>
      {c.imagen ? (
        <Image source={{ uri: c.imagen }} style={styles.miniCardImg} resizeMode="cover" />
      ) : (
        <View style={[styles.miniCardImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
        </View>
      )}
      {(c.destacado || (c.destacado_hasta && new Date(c.destacado_hasta) > new Date())) && (
        <View style={[styles.badge, { backgroundColor: '#f59e0b' }]}>
          <Ionicons name="star" size={10} color="#fff" />
        </View>
      )}
      <View style={styles.miniCardBody}>
        <Text style={[styles.miniCardNombre, { color: Colors.text }]} numberOfLines={1}>{c.nombre}</Text>
        {c.direccion ? <Text style={[styles.miniCardDir, { color: Colors.textMuted }]} numberOfLines={1}>{c.direccion}</Text> : null}
        {distanciasMap.has(c.id) ? (
          <View style={styles.miniCardDistRow}>
            <Ionicons name="navigate-circle-outline" size={11} color={Colors.accent} />
            <Text style={[styles.miniCardDist, { color: Colors.accent }]}>{formatDist(distanciasMap.get(c.id)!)}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const renderModal = () => {
    if (!comercioModal) return null;
    const c = comercioModal;
    const subcatNombre = subcatsGlobal.find(s => s.id === c.subcategoria_id)?.nombre;
    return (
      <Modal visible animationType="slide" transparent={false} onRequestClose={() => setComercioModal(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setComercioModal(null)} style={styles.modalHeaderBack}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: Colors.text }]} numberOfLines={1}>{c.nombre}</Text>
            {c.destacado ? (
              <View style={[styles.modalDestacadoBadge, { backgroundColor: Colors.accent }]}>
                <Ionicons name="star" size={11} color="#fff" />
                <Text style={styles.modalDestacadoText}>Destacado</Text>
              </View>
            ) : <View style={{ width: 80 }} />}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Imagen portada */}
            <View style={[styles.modalHero, { height: Math.round(altPantalla * 0.5) }]}>
              {c.imagen ? (
                <Image source={{ uri: c.imagen }} style={styles.modalHeroImg} resizeMode="cover" />
              ) : (
                <View style={[styles.modalHeroImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="storefront-outline" size={64} color={Colors.accent + '66'} />
                </View>
              )}
              {/* Info ℹ️ arriba izquierda */}
              {c.descripcion ? (
                <TouchableOpacity
                  onPress={() => Alert.alert(c.nombre, c.descripcion ?? '')}
                  style={{ position: 'absolute', top: 6, left: Spacing.md, backgroundColor: '#00000055', borderRadius: 20, padding: 5, zIndex: 10 }}>
                  <Ionicons name="information-circle-outline" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null}
              {/* Overlay gradiente */}
              <View style={styles.modalHeroGrad} />
              {/* Nombre sobre la imagen */}
              <View style={styles.modalHeroBottom}>
                <Text style={styles.modalHeroNombre}>{c.nombre}</Text>
                {(c.ciudad || subcatNombre) ? (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {c.ciudad ? (
                      <View style={styles.modalHeroTag}>
                        <Ionicons name="location-outline" size={11} color="#ffffffCC" />
                        <Text style={styles.modalHeroTagText}>{c.ciudad}</Text>
                      </View>
                    ) : null}
                    {subcatNombre ? (
                      <View style={styles.modalHeroTag}>
                        <Ionicons name="grid-outline" size={11} color="#ffffffCC" />
                        <Text style={styles.modalHeroTagText}>{subcatNombre}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {/* Cuerpo */}
            <View style={[styles.modalCuerpo, { backgroundColor: Colors.background }]}>

              {/* Descripción */}
              {c.descripcion ? (
                <View style={[styles.modalSeccion, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                  <Text style={[styles.modalSeccionLabel, { color: Colors.textMuted }]}>Sobre el negocio</Text>
                  <Text style={[styles.modalDescripcion, { color: Colors.text }]}>{c.descripcion}</Text>
                </View>
              ) : null}

              {/* Botones de contacto */}
              <View style={styles.modalContactRow}>
                {c.whatsapp ? (
                  <TouchableOpacity style={[styles.modalContactBtnGrande, { backgroundColor: '#25D366' }]} onPress={() => abrirWhatsApp(c.whatsapp)}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnGrandeText}>WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
                {c.telefono ? (
                  <TouchableOpacity style={[styles.modalContactBtnGrande, { backgroundColor: Colors.success }]} onPress={() => abrirTelefono(c.telefono)}>
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnGrandeText}>Llamar</Text>
                  </TouchableOpacity>
                ) : null}
                {c.web ? (
                  <TouchableOpacity style={[styles.modalContactBtnGrande, { backgroundColor: Colors.accent }]} onPress={() => abrirEnlace(c.web)}>
                    <Ionicons name="globe-outline" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnGrandeText}>Web</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.modalContactBtnGrande, { backgroundColor: Colors.border }]}
                  onPress={() => Share.share({ message: `Mira la tienda *${c.nombre}* en CashCach:\n${urlTienda(c)}`, url: urlTienda(c) })}>
                  <Ionicons name="share-outline" size={20} color={Colors.text} />
                  <Text style={[styles.modalContactBtnGrandeText, { color: Colors.text }]}>Compartir</Text>
                </TouchableOpacity>
              </View>

              {/* Dirección */}
              {c.direccion ? (
                <TouchableOpacity
                  style={[styles.modalSeccion, styles.modalDireccionRow, { backgroundColor: Colors.card, borderColor: Colors.border }]}
                  onPress={() => abrirMapa(c.direccion)} activeOpacity={0.7}>
                  <View style={[styles.modalDireccionIcon, { backgroundColor: Colors.accent + '18' }]}>
                    <Ionicons name="location" size={20} color={Colors.accent} />
                  </View>
                  <Text style={[styles.modalDireccionText, { color: Colors.text, flex: 1 }]}>{c.direccion}</Text>
                  <Ionicons name="navigate-outline" size={18} color={Colors.accent} />
                </TouchableOpacity>
              ) : null}

              {/* Galería / catálogo */}
              {galeriaItems.length > 0 && (
                <View style={[styles.modalSeccion, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                  <Text style={[styles.modalSeccionLabel, { color: Colors.textMuted }]}>Catálogo</Text>
                  <View style={styles.galeriaGrid}>
                    {galeriaItems.map((item, i) => (
                      <TouchableOpacity key={item.id ?? i} activeOpacity={0.85}
                        style={[styles.galeriaImgGrande, { borderColor: Colors.border }]}
                        onPress={() => { setProductoModal({ item, whatsapp: c.whatsapp ?? null }); registrarEvento('galeria_producto', item.titulo ?? undefined, c.id, c.nombre); }}>
                        <Image source={{ uri: item.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        {(item.precio || item.precio_bs || item.titulo) && (
                          <View style={styles.galeriaOverlay}>
                            {(item.precio || item.precio_bs) && (
                              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                {item.precio ? <Text style={styles.galeriaOverlayPrecio} numberOfLines={1}>${item.precio}</Text> : null}
                                {item.precio_bs ? <Text style={styles.galeriaOverlayBs} numberOfLines={1}>Bs.{item.precio_bs}</Text> : null}
                              </View>
                            )}
                            {item.titulo ? <Text style={styles.galeriaOverlayTitulo} numberOfLines={1}>{item.titulo}</Text> : null}
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ height: 32 }} />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderProductoModal = () => {
    if (!productoModal) return null;
    const { item, whatsapp } = productoModal;
    const imagenes = [item.imagen, item.imagen2, item.imagen3].filter(Boolean) as string[];
    const waMsg = encodeURIComponent(`Hola, vi "${item.titulo ?? 'un producto'}" en CashCach. ¿Sigue disponible?`);
    const waUrl = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${waMsg}` : null;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => { setProductoModal(null); setPaginaProducto(0); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.productoBox, { backgroundColor: Colors.card }]}>

            {/* Carousel */}
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={e => setPaginaProducto(Math.round(e.nativeEvent.contentOffset.x / ANCHO))}>
              {imagenes.map((img, i) => (
                <Image key={i} source={{ uri: img }} style={[styles.productoImg, { width: ANCHO }]} resizeMode="cover" />
              ))}
            </ScrollView>

            {/* Dots */}
            {imagenes.length > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                {imagenes.map((_, i) => (
                  <View key={i} style={{
                    width: i === paginaProducto ? 8 : 6,
                    height: i === paginaProducto ? 8 : 6,
                    borderRadius: 4,
                    backgroundColor: i === paginaProducto ? Colors.accent : Colors.border,
                  }} />
                ))}
              </View>
            )}

            <View style={{ padding: Spacing.lg, paddingTop: imagenes.length > 1 ? 4 : Spacing.lg, gap: 10 }}>
              {/* Nombre + X */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.productoTitulo, { color: Colors.text, flex: 1 }]}>{item.titulo ?? ''}</Text>
                <TouchableOpacity
                  style={[styles.productoCerrarX, { backgroundColor: Colors.border }]}
                  onPress={() => { setProductoModal(null); setPaginaProducto(0); }}>
                  <Ionicons name="close" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* Precios */}
              {(item.precio || item.precio_bs) ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  {item.precio ? <Text style={[styles.productoPrecio, { color: Colors.accent }]}>${item.precio}</Text> : null}
                  {item.precio_bs ? <Text style={[styles.productoPrecioBs, { color: Colors.textMuted }]}>Bs. {item.precio_bs}</Text> : null}
                </View>
              ) : null}

              {waUrl ? (
                <TouchableOpacity style={styles.productoWaBtn} onPress={() => Linking.openURL(waUrl).catch(() => {})}>
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  <Text style={styles.productoWaBtnText}>Consultar al vendedor</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
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

            {/* Botón GPS */}
            <TouchableOpacity
              style={[styles.gpsBtn, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '44' }]}
              onPress={async () => {
                setBuscandoUbicacion(true);
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  setMapCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
                  const geo = await Location.reverseGeocodeAsync(loc.coords);
                  if (geo[0]) {
                    const nombre = geo[0].city ?? geo[0].district ?? geo[0].subregion ?? '';
                    if (nombre) setCiudadInputTemp(nombre);
                  }
                }
                setBuscandoUbicacion(false);
              }}>
              <Ionicons name="navigate" size={16} color={Colors.accent} />
              <Text style={[styles.gpsBtnText, { color: Colors.accent }]}>
                {buscandoUbicacion ? 'Obteniendo GPS…' : 'Usar mi ubicación GPS'}
              </Text>
            </TouchableOpacity>

            {/* Input ciudad con autocomplete */}
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
                const sugs = ciudadesDisponibles.filter(c => c.toLowerCase().includes(ciudadInputTemp.toLowerCase()));
                return sugs.length > 0 ? (
                  <View style={[styles.configSugBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
                    {sugs.map((c, i) => (
                      <TouchableOpacity key={c}
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

            {/* Radio dropdown */}
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
                    <TouchableOpacity key={r}
                      style={[styles.configSugItem, i < radios.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }, radioInputTemp === r && { backgroundColor: Colors.accent + '18' }]}
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

            {/* Mapa */}
            <TouchableOpacity activeOpacity={mapCoords ? 0.9 : 1} onPress={() => { if (mapCoords) setMapaExpandido(true); }}
              style={[styles.configMapBox, { borderColor: Colors.border }]}>
              <Text style={styles.configMapLabel}>Mapa</Text>
              {buscandoUbicacion ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.accent} />
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 6 }}>Obteniendo ubicación…</Text>
                </View>
              ) : mapCoords ? (
                <>
                  <MapView style={{ flex: 1 }}
                    region={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude, latitudeDelta: (parseInt(radioInputTemp) * 2) / 111, longitudeDelta: (parseInt(radioInputTemp) * 2) / 111 }}
                    scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false} pointerEvents="none">
                    <Marker coordinate={mapCoords} pinColor={Colors.accent} />
                    <Circle center={mapCoords} radius={parseInt(radioInputTemp) * 1000} strokeColor={Colors.accent} fillColor={Colors.accent + '22'} strokeWidth={2} />
                  </MapView>
                  <View style={styles.configMapExpandHint}><Ionicons name="expand-outline" size={16} color="#fff" /></View>
                </>
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="map-outline" size={36} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 6 }}>Escribe una ciudad</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Mapa expandido */}
            <Modal visible={mapaExpandido} animationType="slide" onRequestClose={() => setMapaExpandido(false)}>
              <View style={{ flex: 1 }}>
                {mapCoords && (
                  <MapView style={{ flex: 1 }}
                    initialRegion={{ latitude: mapCoords.latitude, longitude: mapCoords.longitude, latitudeDelta: (parseInt(radioInputTemp) * 2) / 111, longitudeDelta: (parseInt(radioInputTemp) * 2) / 111 }}
                    scrollEnabled zoomEnabled pitchEnabled={false} rotateEnabled={false}>
                    <Marker coordinate={mapCoords} pinColor={Colors.accent} />
                    <Circle center={mapCoords} radius={parseInt(radioInputTemp) * 1000} strokeColor={Colors.accent} fillColor={Colors.accent + '22'} strokeWidth={2} />
                  </MapView>
                )}
                <TouchableOpacity style={[styles.mapaFullCerrar, { backgroundColor: Colors.card }]} onPress={() => setMapaExpandido(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </Modal>

            {/* Aplicar */}
            <TouchableOpacity style={[styles.configApply, { backgroundColor: Colors.accent }]}
              onPress={() => {
                const ciudad = ciudadInputTemp.trim();
                const radio  = radioInputTemp;
                setCiudadGlobal(ciudad);
                setRadioGlobal(radio);
                setCoordsGlobal(mapCoords);
                setCiudadFiltro(null);
                setModalConfigVisible(false);
                AsyncStorage.setItem('ubicacion_config', JSON.stringify({
                  ciudad, radio,
                  latitud: mapCoords?.latitude ?? null,
                  longitud: mapCoords?.longitude ?? null,
                }));
                setNivel('subcategorias');
              }}>
              <Text style={styles.configApplyText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={volverAtras} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tituloHeader()}</Text>
        <TouchableOpacity
          style={[styles.ciudadBtn, { backgroundColor: ciudadActiva ? Colors.accent : Colors.card, borderColor: Colors.border }]}
          onPress={() => setModalCiudades(true)}>
          <Ionicons name="location-outline" size={14} color={ciudadActiva ? '#fff' : Colors.text} />
          <Text style={[styles.ciudadBtnText, { color: ciudadActiva ? '#fff' : Colors.text }]}>
            {ciudadActiva ?? 'Ciudad'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Banner de ubicación activa */}
      {ciudadGlobal ? (
        <View style={[styles.locationBanner, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '44' }]}>
          <Ionicons name="location" size={14} color={Colors.accent} />
          <Text style={[styles.locationBannerText, { color: Colors.accent }]}>{ciudadGlobal} · {radioGlobal} km</Text>
          <TouchableOpacity onPress={() => { setCiudadGlobal(''); AsyncStorage.removeItem('ubicacion_config'); }} style={{ marginLeft: 'auto' }}>
            <Ionicons name="close-circle" size={16} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Breadcrumb */}
      {nivel === 'comercios' && (
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => { setNivel('subcategorias'); setBusqueda(''); }}>
            <Text style={[styles.breadcrumbItem, { color: Colors.accent }]}>Categorías</Text>
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
          <Text style={[styles.breadcrumbItem, { color: Colors.text }]}>{subcatActiva?.nombre}</Text>
        </View>
      )}

      {/* Buscador global */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={[styles.searchInput, { color: Colors.text }]}
            placeholder="Buscar comercio…"
            placeholderTextColor={Colors.textMuted}
            value={busqueda}
            onChangeText={t => { setBusqueda(t); setMostrarSug(true); }}
            onFocus={() => setMostrarSug(true)}
            onBlur={() => setTimeout(() => setMostrarSug(false), 150)}
            returnKeyType="search"
            onSubmitEditing={() => setMostrarSug(false)}
          />
          {busqueda ? (
            <TouchableOpacity onPress={() => { setBusqueda(''); setMostrarSug(false); setCiudadFiltro(null); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Autocomplete */}
        {mostrarSug && sugerencias.length > 0 && (
          <View style={[styles.dropdown, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            {sugerencias.map((sug, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.dropdownItem, i < sugerencias.length - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.border }]}
                onPress={() => seleccionarSugerencia(sug)}
              >
                <Ionicons name="search-outline" size={14} color={Colors.textMuted} style={{ marginRight: 8 }} />
                <Text style={[styles.dropdownText, { color: Colors.text }]}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Contenido */}
      {cargando ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.centeredText}>{error}</Text>
          <TouchableOpacity style={[styles.reintentarBtn, { backgroundColor: Colors.accent }]} onPress={() => cargarSubcategorias()}>
            <Text style={styles.reintentarText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : enBusqueda ? (
        // Resultados de búsqueda global
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Chips de ciudad */}
          {ciudadesEnResultados.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingBottom: 4 }}
              keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.chip, !ciudadFiltro && { backgroundColor: Colors.accent }]}
                onPress={() => setCiudadFiltro(null)}>
                <Text style={[styles.chipText, !ciudadFiltro && { color: '#fff' }]}>Todas</Text>
              </TouchableOpacity>
              {ciudadesEnResultados.map(ciudad => (
                <TouchableOpacity key={ciudad}
                  style={[styles.chip, ciudadFiltro === ciudad && { backgroundColor: Colors.accent }]}
                  onPress={() => setCiudadFiltro(c => c === ciudad ? null : ciudad)}>
                  <Text style={[styles.chipText, ciudadFiltro === ciudad && { color: '#fff' }]}>{ciudad}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {comerciosBuscados.length === 0 && comerciosBuscadosSinCoords.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin resultados{ciudadFiltro ? ` en ${ciudadFiltro}` : ''}</Text>
            </View>
          ) : (
            <>
              {comerciosBuscados.length > 0 && (
                <View style={styles.grilla}>
                  {comerciosBuscados.map(c => renderMiniCard(c))}
                </View>
              )}
              {comerciosBuscadosSinCoords.length > 0 && (
                <>
                  <View style={[styles.separadorSinCoords, { borderColor: Colors.border }]}>
                    <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                    <Text style={[styles.separadorSinCoordsText, { color: Colors.textMuted }]}>Sin ubicación verificada</Text>
                  </View>
                  <View style={styles.grilla}>
                    {comerciosBuscadosSinCoords.map(c => renderMiniCard(c))}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : nivel === 'subcategorias' ? (
        // Lista de categorías (sin ciudades)
        <ScrollView contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargarSubcategorias(true)} tintColor={Colors.accent} />}>
          {subcategorias.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="grid-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin categorías disponibles</Text>
            </View>
          ) : (
            subcategorias.map(sub => (
              <TouchableOpacity key={sub.id} style={styles.itemRow} onPress={() => seleccionarSubcategoria(sub)}>
                {sub.imagen ? (
                  <Image source={{ uri: sub.imagen }} style={styles.itemImagen} resizeMode="cover" />
                ) : (
                  <View style={[styles.itemImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                    <Ionicons name="grid-outline" size={22} color={Colors.accent} />
                  </View>
                )}
                <Text style={styles.itemNombre}>{sub.nombre}</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : (
        // Lista de comercios
        <ScrollView contentContainerStyle={styles.body}>
          {comercios.length === 0 && comerciosSinCoords.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="storefront-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin comercios en esta categoría</Text>
            </View>
          ) : (
            <>
              {comercios.length > 0 && (
                <View style={styles.grilla}>
                  {comercios.map(c => renderMiniCard(c))}
                </View>
              )}
              {comerciosSinCoords.length > 0 && (
                <>
                  <View style={[styles.separadorSinCoords, { borderColor: Colors.border }]}>
                    <Ionicons name="location-outline" size={13} color={Colors.textMuted} />
                    <Text style={[styles.separadorSinCoordsText, { color: Colors.textMuted }]}>Sin ubicación verificada</Text>
                  </View>
                  <View style={styles.grilla}>
                    {comerciosSinCoords.map(c => renderMiniCard(c))}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {renderModal()}
      {/* Modal selector de ciudad */}
      <Modal visible={modalCiudades} transparent animationType="slide" onRequestClose={() => setModalCiudades(false)}>
        <View style={styles.configOverlay}>
          <View style={[styles.configBox, { backgroundColor: Colors.card }]}>
            <View style={styles.configHeader}>
              <Text style={[styles.configTitle, { color: Colors.text }]}>Seleccionar ciudad</Text>
              <TouchableOpacity onPress={() => setModalCiudades(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity
                style={[styles.itemRow, !ciudadActiva && { borderColor: Colors.accent }]}
                onPress={() => { setCiudadActiva(null); setModalCiudades(false); }}>
                <View style={[styles.itemImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                  <Ionicons name="earth-outline" size={22} color={Colors.accent} />
                </View>
                <Text style={[styles.itemNombre, !ciudadActiva && { color: Colors.accent }]}>Todas las ciudades</Text>
                {!ciudadActiva && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
              </TouchableOpacity>
              {ciudades.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.itemRow, ciudadActiva === cat.nombre && { borderColor: Colors.accent }]}
                  onPress={() => { setCiudadActiva(cat.nombre); setModalCiudades(false); }}>
                  {cat.imagen ? (
                    <Image source={{ uri: cat.imagen }} style={styles.itemImagen} resizeMode="cover" />
                  ) : (
                    <View style={[styles.itemImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                      <Ionicons name="location-outline" size={22} color={Colors.accent} />
                    </View>
                  )}
                  <Text style={[styles.itemNombre, ciudadActiva === cat.nombre && { color: Colors.accent }]}>{cat.nombre}</Text>
                  {ciudadActiva === cat.nombre && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {renderModalConfig()}
      {renderProductoModal()}

      {/* Imagen ampliada */}
      <Modal visible={!!imagenAmpliada} transparent animationType="fade"
        onRequestClose={() => { resetVisor(); setImagenAmpliada(null); }}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000000EE', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableOpacity
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 }}
              onPress={() => { resetVisor(); setImagenAmpliada(null); }}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
            <GestureDetector gesture={gestos}>
              <Animated.View style={[{ width: '100%', height: '80%' }, estiloAnimado]}>
                {imagenAmpliada && (
                  <Image source={{ uri: imagenAmpliada }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                )}
              </Animated.View>
            </GestureDetector>
            <Text style={{ color: '#ffffff55', fontSize: 11, position: 'absolute', bottom: 30 }}>
              Pellizca para zoom · Doble toque para restablecer
            </Text>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },

  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.lg, paddingVertical: 8,
    backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  breadcrumbItem: { fontSize: FontSize.sm, fontWeight: '600' },

  searchWrap: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.md, zIndex: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderRadius: Radius.md, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, padding: 0 },

  dropdown: {
    position: 'absolute', top: '100%', left: Spacing.sm, right: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8, zIndex: 100,
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  dropdownText: { fontSize: FontSize.sm },

  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.xl },
  centeredText:  { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  reintentarBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.md },
  reintentarText:{ fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },

  body: { padding: Spacing.sm, gap: Spacing.sm, paddingBottom: 40 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md,
  },
  itemImagen:            { width: 48, height: 48, borderRadius: Radius.md },
  itemImagenPlaceholder: {
    width: 48, height: 48, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  itemNombre: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },

  grilla: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  miniCard: {
    width: '49%', borderRadius: 16,
    borderWidth: 1, overflow: 'hidden',
  },
  miniCardImg: { width: '100%', height: 160 },
  miniCardBody: { padding: 8 },
  miniCardNombre:  { fontSize: FontSize.sm, fontWeight: '700' },
  miniCardDir:     { fontSize: 11, marginTop: 2 },
  miniCardDistRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  miniCardDist:    { fontSize: 10, fontWeight: '700' },
  badge: {
    position: 'absolute', top: 6, left: 6,
    borderRadius: 20, padding: 3,
  },

  modalOverlay: {
    flex: 1, backgroundColor: '#00000055',
    justifyContent: 'flex-end',
  },
  // Modal nuevo (pantalla completa)
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalHeaderBack:  { padding: 4 },
  modalHeaderTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '700' },
  modalDestacadoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  modalDestacadoText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  modalHero:       { width: '100%', height: 240, position: 'relative' },
  modalHeroImg:    { width: '100%', height: '100%' },
  modalHeroGrad:   {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 130,
    backgroundColor: 'transparent',
  },
  modalHeroBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.md,
    backgroundColor: '#00000066',
  },
  modalHeroNombre: { fontSize: FontSize.xl, fontWeight: '900', color: '#fff' },
  modalHeroTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#ffffff22', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  modalHeroTagText: { fontSize: 11, color: '#ffffffDD', fontWeight: '600' },

  modalCuerpo: { gap: Spacing.sm, padding: Spacing.sm },
  modalSeccion: {
    borderRadius: Radius.lg, borderWidth: 1,
    padding: Spacing.md,
  },
  modalSeccionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  modalDescripcion:  { fontSize: FontSize.sm, lineHeight: 20 },

  modalContactRow: { flexDirection: 'row', gap: Spacing.sm },
  modalContactBtnGrande: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: Radius.lg,
  },
  modalContactBtnGrandeText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  modalDireccionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  modalDireccionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  modalDireccionText: { fontSize: FontSize.sm },

  galeriaImgGrande: {
    width: '48%', aspectRatio: 1, borderRadius: Radius.md,
    borderWidth: 1, overflow: 'hidden', marginBottom: 4,
  },

  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '75%', overflow: 'hidden',
  },
  modalCerrar: {
    position: 'absolute', top: 12, right: 14, zIndex: 10,
    borderRadius: 20, padding: 4,
  },
  modalImagen:            { width: '100%', height: 200 },
  modalImagenPlaceholder: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center' },
  modalBody:   { padding: Spacing.lg, paddingTop: Spacing.md },
  modalNombre: { fontSize: FontSize.xl, fontWeight: '800' },

  galeriaTitulo: { fontSize: FontSize.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  galeriaGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  galeriaImg: {
    width: '31%', aspectRatio: 1, borderRadius: Radius.md,
    borderWidth: 1, overflow: 'hidden',
  },

  galeriaOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#000000AA', paddingHorizontal: 4, paddingVertical: 3,
  },
  galeriaOverlayPrecio: { fontSize: 10, fontWeight: '800', color: '#FFD700' },
  galeriaOverlayBs:     { fontSize: 9, fontWeight: '600', color: '#ffffffBB' },
  galeriaOverlayTitulo: { fontSize: 9, color: '#fff' },

  productoBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden', maxHeight: '80%',
  },
  productoImg:       { width: '100%', height: 280 },
  productoPrecio:    { fontSize: FontSize.xl, fontWeight: '800' },
  productoPrecioBs:  { fontSize: FontSize.md, fontWeight: '600', marginBottom: 2 },
  productoTitulo:    { fontSize: FontSize.lg, fontWeight: '600', marginBottom: 16 },
  productoWaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#25D366', borderRadius: Radius.md, paddingVertical: 12,
  },
  productoWaBtnText:  { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  productoCerrarX: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  infoFila:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: Spacing.md },
  infoTexto: { flex: 1, fontSize: FontSize.sm, color: Colors.textMuted },

  botonesRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, marginTop: 4,
  },
  contactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: Radius.md, borderWidth: 1,
  },
  contactBtnText: { fontSize: FontSize.sm, fontWeight: '700' },

  locationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.lg, paddingVertical: 7,
    borderBottomWidth: 1,
  },
  locationBannerText: { fontSize: FontSize.sm, fontWeight: '600' },

  configOverlay: {
    flex: 1, backgroundColor: '#00000060',
    justifyContent: 'center', padding: 20,
  },
  configBox: {
    borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12,
    elevation: 8,
  },
  configHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  configTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800' },
  configSubtitle: { fontSize: FontSize.sm, marginBottom: 14 },
  configInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  configInputText: { flex: 1, fontSize: FontSize.md, padding: 0 },
  configRadioSection: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.md, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },
  configRadioLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '600' },
  configRadioChips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14,
  },
  configRadioChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  configRadioChipText: { fontSize: FontSize.sm, fontWeight: '600' },
  configMapBox: {
    height: 180, borderRadius: Radius.lg, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, overflow: 'hidden',
  },
  configMapCircle: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  configMapCity: {
    position: 'absolute', bottom: 10,
    fontSize: FontSize.sm, fontWeight: '600',
  },
  configApply: {
    borderRadius: Radius.md, paddingVertical: 13,
    alignItems: 'center',
  },
  configApplyText:    { color: '#fff', fontSize: FontSize.md, fontWeight: '700' },
  ciudadBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1 },
  ciudadBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  separadorSinCoords:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4, borderTopWidth: 1, marginTop: 4, width: '100%' },
  separadorSinCoordsText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  gpsBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  gpsBtnText: { fontSize: FontSize.sm, fontWeight: '700' },
  configSugBox:       { borderRadius: Radius.md, borderWidth: 1, marginTop: -8, marginBottom: 10, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 },
  configSugItem:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  configSugText:      { fontSize: FontSize.sm, fontWeight: '600' },
  configMapLabel:     { position: 'absolute', top: 8, left: 12, zIndex: 10, fontSize: FontSize.sm, fontWeight: '700', backgroundColor: '#00000066', color: '#fff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  configMapExpandHint:{ position: 'absolute', bottom: 8, right: 8, backgroundColor: '#00000066', borderRadius: 8, padding: 5 },
  mapaFullCerrar:     { position: 'absolute', top: 50, right: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6 },
}); }
