import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl, Image,
  TextInput, Keyboard, Modal, Dimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SocioComercial } from '@/services/supabase';
import * as Location from 'expo-location';

export default function SociosScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [socios,           setSocios]           = useState<SocioComercial[]>([]);
  const [cargando,         setCargando]         = useState(true);
  const [refrescando,      setRefrescando]      = useState(false);
  const [yaEnvioSolicitud, setYaEnvioSolicitud] = useState(false);
  const [misSocios,        setMisSocios]        = useState<{ id: string; nombre: string; imagen: string | null; fecha_vencimiento: string | null }[]>([]);
  const [limiteTiendas,    setLimiteTiendas]    = useState<number>(100);
  const [submenu,          setSubmenu]          = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [busqueda,        setBusqueda]        = useState('');
  const [filtroAplicado,  setFiltroAplicado]  = useState('');
  const [modalBuscar,     setModalBuscar]     = useState(false);
  const [subcats,       setSubcats]       = useState<{ id: string; nombre: string }[]>([]);
  const [todasSubcats,  setTodasSubcats]  = useState<string[]>([]);
  const [subcatAbierto, setSubcatAbierto] = useState(false);
  const [subcatFiltro,  setSubcatFiltro]  = useState<string | null>(null);
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
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  const [modalInfo,     setModalInfo]     = useState(false);
  type ItemGaleria = { id: string; imagen: string; imagen2: string | null; imagen3: string | null; titulo: string | null; precio: string | null; precio_bs: string | null; descripcion: string | null };
  const [galeriaItems,        setGaleriaItems]        = useState<ItemGaleria[]>([]);
  const [productoModal,       setProductoModal]       = useState<{ item: ItemGaleria; whatsapp: string | null } | null>(null);
  const [paginaProducto,      setPaginaProducto]      = useState(0);
  const [infoProductoVisible, setInfoProductoVisible] = useState(false);
  const ANCHO = Dimensions.get('window').width;
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
  }, []);

  const cargar = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('socios_comerciales')
      .select('id,nombre,ciudad,direccion,descripcion,telefono,whatsapp,web,imagen,imagen2,imagen3,imagen4,imagen5,imagen6,destacado,subcategoria_id,activo,fecha_vencimiento,orden,created_at')
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
    if (!socioModal) { setGaleriaItems([]); return; }
    supabase.from('galeria_items').select('*').eq('socio_id', socioModal.id).order('orden')
      .then(({ data }) => setGaleriaItems((data ?? []) as ItemGaleria[]));
  }, [socioModal]);

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
  }, [modalConfigVisible]);

  // Auto-refresh cada 60 segundos mientras la pantalla está visible
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => cargar(true), 60000);
    return () => clearInterval(timer);
  }, [cargar]));

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
      const enviada = await AsyncStorage.getItem('solicitud_socio_enviada');
      if (enviada === 'true') setYaEnvioSolicitud(true);
      const telefono = await AsyncStorage.getItem('socio_telefono');
      if (!telefono) return;
      const tel = telefono.replace(/\D/g, '');

      type MiSocio = { id: string; nombre: string; imagen: string | null; fecha_vencimiento: string | null; telefono?: string | null; whatsapp?: string | null };

      // Cargar IDs guardados previamente y el límite en paralelo
      const idsRaw = await AsyncStorage.getItem('mis_socios_ids');
      const idsGuardados: string[] = idsRaw ? JSON.parse(idsRaw) : [];

      // Buscar por teléfono actual + por IDs guardados + límite, todo en paralelo
      const promesas: Promise<any>[] = [
        supabase
          .from('socios_comerciales')
          .select('id, nombre, imagen, fecha_vencimiento, telefono, whatsapp')
          .or(`telefono.ilike.%${tel}%,whatsapp.ilike.%${tel}%`),
        supabase.from('config_app').select('valor').eq('clave', 'limite_tiendas_por_cliente').single(),
      ];
      if (idsGuardados.length > 0) {
        promesas.push(
          supabase
            .from('socios_comerciales')
            .select('id, nombre, imagen, fecha_vencimiento, telefono, whatsapp')
            .in('id', idsGuardados)
        );
      }

      const [{ data: porTel }, { data: cfgLimite }, porIdRes] = await Promise.all(promesas);
      setLimiteTiendas(cfgLimite?.valor ? parseInt(cfgLimite.valor) : 100);

      // Unir resultados por teléfono e IDs, sin duplicados
      const mapaResultados = new Map<string, MiSocio>();
      for (const s of [...(porTel ?? []), ...(porIdRes?.data ?? [])]) {
        mapaResultados.set(s.id, s as MiSocio);
      }
      const resultado = Array.from(mapaResultados.values())
        .sort((a, b) => a.nombre?.localeCompare(b.nombre ?? '') ?? 0);

      // Guardar todos los IDs encontrados (acumulativo, nunca borra)
      const todosIds = Array.from(new Set([...idsGuardados, ...resultado.map(s => s.id)]));
      await AsyncStorage.setItem('mis_socios_ids', JSON.stringify(todosIds));

      setMisSocios(resultado);
    };
    cargarMisSocios();
  }, []));

  const destacados = useMemo(() => {
    let lista = socios.filter(s => s.destacado);
    if (subcatFiltro) lista = lista.filter(s => s.subcategoria_id === subcatFiltro);
    if (ubicacionCiudad) lista = lista.filter(s => s.ciudad?.toLowerCase().includes(ubicacionCiudad.toLowerCase()));
    return lista;
  }, [socios, subcatFiltro, ubicacionCiudad]);

  const [sociosCiudad, setSociosCiudad] = useState<SocioComercial[]>([]);

  // Función reutilizable para mezclar y guardar
  const mezclarSociosCiudad = useCallback((listaSocios: SocioComercial[], ciudad: string) => {
    const destacadosIds = new Set(listaSocios.filter(s => s.destacado).map(s => s.id));
    const lista = listaSocios.filter(s => {
      if (destacadosIds.has(s.id)) return false;
      // Con ciudad: solo esa ciudad. Sin ciudad: todas las tiendas
      if (ciudad) return s.ciudad?.toLowerCase().includes(ciudad.toLowerCase());
      return true;
    });
    // Fisher-Yates con Math.random() — diferente cada llamada
    const arr = [...lista];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setSociosCiudad(arr);
  }, []);

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
    let lista = socios;
    if (ubicacionCiudad) lista = lista.filter(s => s.ciudad?.toLowerCase().includes(ubicacionCiudad.toLowerCase()));
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
  }, [socios, busqueda, filtroAplicado, subcatFiltro, subcats, ubicacionCiudad]);

  const seleccionarSugerencia = (texto: string) => {
    setFiltroAplicado(texto);
    setBusqueda('');
    Keyboard.dismiss();
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

  const renderMiniCard = (s: SocioComercial) => (
    <TouchableOpacity
      key={s.id}
      style={[styles.miniCard, { backgroundColor: Colors.card, borderColor: Colors.border }]}
      onPress={() => setSocioModal(s)}
      activeOpacity={0.85}
    >
      {s.imagen ? (
        <Image source={{ uri: s.imagen }} style={styles.miniCardImg} resizeMode="cover" />
      ) : (
        <View style={[styles.miniCardImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
        </View>
      )}
      {s.destacado && (
        <View style={[styles.badgeDestacado, { backgroundColor: Colors.accent }]}>
          <Ionicons name="star" size={10} color="#fff" />
        </View>
      )}
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
    const s = socioModal;
    const subcatNombre = subcats.find(sc => sc.id === s.subcategoria_id)?.nombre;
    return (
      <Modal visible animationType="slide" transparent={false} onRequestClose={() => setSocioModal(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setSocioModal(null)} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: Colors.text }]} numberOfLines={1}>{s.nombre}</Text>
            {s.destacado ? (
              <View style={[styles.modalDestacadoBadge, { backgroundColor: Colors.accent }]}>
                <Ionicons name="star" size={11} color="#fff" />
                <Text style={styles.modalDestacadoText}>Destacado</Text>
              </View>
            ) : <View style={{ width: 80 }} />}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Hero imagen */}
            <View style={styles.modalHero}>
              {s.imagen ? (
                <Image source={{ uri: s.imagen }} style={styles.modalHeroImg} resizeMode="cover" />
              ) : (
                <View style={[styles.modalHeroImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="storefront-outline" size={64} color={Colors.accent + '55'} />
                </View>
              )}
              {/* Ciudad arriba derecha */}
              {s.ciudad ? (
                <View style={styles.modalHeroCiudad}>
                  <Ionicons name="location-outline" size={11} color="#ffffffCC" />
                  <Text style={styles.modalHeroTagText}>{s.ciudad}</Text>
                </View>
              ) : null}
              {/* Botones sobremonados en el borde inferior de la imagen */}
              <View style={styles.modalBotonesOverlay}>
                {s.whatsapp ? (
                  <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: '#25D366' }]} onPress={() => abrirWhatsApp(s.whatsapp)}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
                {s.telefono ? (
                  <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: Colors.success }]} onPress={() => abrirTelefono(s.telefono)}>
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnText}>Llamar</Text>
                  </TouchableOpacity>
                ) : null}
                {s.web ? (
                  <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: Colors.accent }]} onPress={() => abrirEnlace(s.web)}>
                    <Ionicons name="globe-outline" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnText}>Web</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            <View style={[styles.modalCuerpo, { backgroundColor: Colors.background }]}>
              {/* Categoría + Dirección debajo de los botones */}
              {(subcatNombre || s.direccion) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
                  {subcatNombre ? (
                    <View style={[styles.modalHeroTag, { backgroundColor: Colors.accent + '22' }]}>
                      <Ionicons name="grid-outline" size={13} color={Colors.accent} />
                      <Text style={[styles.modalHeroTagText, { color: Colors.accent }]}>{subcatNombre}</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {s.direccion ? (
                    <TouchableOpacity style={[styles.modalHeroTag, { backgroundColor: Colors.accent + '22' }]} onPress={() => abrirMapa(s.direccion)} activeOpacity={0.8}>
                      <Ionicons name="navigate-outline" size={13} color={Colors.accent} />
                      <Text style={[styles.modalHeroTagText, { color: Colors.accent }]} numberOfLines={1}>{s.direccion}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}


              {/* Catálogo / Galería */}
              {galeriaItems.length > 0 && (
                <View>
                  <Text style={[styles.modalSeccionLabel, { color: Colors.textMuted, paddingHorizontal: 4, marginBottom: 8 }]}>Catálogo</Text>
                <View style={styles.galeriaGrid}>
                  {galeriaItems.map(item => (
                    <TouchableOpacity key={item.id}
                      onPress={() => setProductoModal({ item, whatsapp: s.whatsapp ?? null })}
                      activeOpacity={0.85}
                      style={[styles.galeriaImgGrande, { borderColor: Colors.border }]}>
                      <Image source={{ uri: item.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      {(item.titulo || item.precio || item.precio_bs) && (
                        <View style={styles.galeriaOverlay}>
                          {(item.precio || item.precio_bs) && (
                            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                              {item.precio && <Text style={styles.galeriaOverlayPrecio}>${item.precio}</Text>}
                              {item.precio_bs && <Text style={styles.galeriaOverlayBs}>Bs.{item.precio_bs}</Text>}
                            </View>
                          )}
                          {item.titulo && <Text style={styles.galeriaOverlayTitulo} numberOfLines={1}>{item.titulo}</Text>}
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

  // Gestos para el visor de imagen
  const escala      = useSharedValue(1);
  const escalaBase  = useSharedValue(1);
  const transX      = useSharedValue(0);
  const transY      = useSharedValue(0);
  const transXBase  = useSharedValue(0);
  const transYBase  = useSharedValue(0);

  // Zoom para producto modal
  const escalaP     = useSharedValue(1);
  const escalaBaseP = useSharedValue(1);
  const transXP     = useSharedValue(0);
  const transYP     = useSharedValue(0);
  const transXBaseP = useSharedValue(0);
  const transYBaseP = useSharedValue(0);
  const [prodZoomed, setProdZoomed] = useState(false);

  const resetVisorP = () => {
    escalaP.value     = withTiming(1);
    escalaBaseP.value = 1;
    transXP.value     = withTiming(0);
    transYP.value     = withTiming(0);
    transXBaseP.value = 0;
    transYBaseP.value = 0;
    setProdZoomed(false);
  };

  const resetVisor = () => {
    escala.value     = withTiming(1);
    escalaBase.value = 1;
    transX.value     = withTiming(0);
    transY.value     = withTiming(0);
    transXBase.value = 0;
    transYBase.value = 0;
  };

  useEffect(() => { if (!imagenAmpliada) resetVisor(); }, [imagenAmpliada]);
  useEffect(() => { if (!productoModal) { resetVisorP(); setInfoProductoVisible(false); } }, [productoModal]);

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
    escala.value     = withTiming(1);
    escalaBase.value = 1;
    transX.value     = withTiming(0);
    transY.value     = withTiming(0);
    transXBase.value = 0;
    transYBase.value = 0;
  });

  const gestos = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, pan), pinch);

  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [
      { translateX: transX.value },
      { translateY: transY.value },
      { scale: escala.value },
    ],
  }));

  const pinchP = Gesture.Pinch()
    .onUpdate(e => { escalaP.value = Math.max(1, escalaBaseP.value * e.scale); })
    .onEnd(() => {
      escalaBaseP.value = escalaP.value;
      if (escalaP.value > 1) runOnJS(setProdZoomed)(true);
      else runOnJS(setProdZoomed)(false);
    });

  const panP = Gesture.Pan()
    .onUpdate(e => {
      transXP.value = transXBaseP.value + e.translationX;
      transYP.value = transYBaseP.value + e.translationY;
    })
    .onEnd(() => {
      transXBaseP.value = transXP.value;
      transYBaseP.value = transYP.value;
    });

  const doubleTapP = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    escalaP.value     = withTiming(1);
    escalaBaseP.value = 1;
    transXP.value     = withTiming(0);
    transYP.value     = withTiming(0);
    transXBaseP.value = 0;
    transYBaseP.value = 0;
    runOnJS(setProdZoomed)(false);
  });

  const gestosP = Gesture.Simultaneous(Gesture.Exclusive(doubleTapP, panP), pinchP);

  const estiloAnimadoP = useAnimatedStyle(() => ({
    transform: [
      { translateX: transXP.value },
      { translateY: transYP.value },
      { scale: escalaP.value },
    ],
  }));

  const renderProductoModal = () => {
    if (!productoModal) return null;
    const { item, whatsapp } = productoModal;
    const imagenes = [item.imagen, item.imagen2, item.imagen3].filter(Boolean) as string[];
    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => { setProductoModal(null); setPaginaProducto(0); }}>
        <View style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' }}>
          <View style={[styles.productoBox, { backgroundColor: Colors.card }]}>

            {/* Imagen con zoom/pan */}
            <GestureHandlerRootView style={{ width: ANCHO, height: 380, overflow: 'hidden' }}>
              <GestureDetector gesture={gestosP}>
                <Animated.View style={[{ width: ANCHO, height: 380 }, estiloAnimadoP]}>
                  <ScrollView
                    horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                    scrollEnabled={!prodZoomed}
                    scrollEventThrottle={16}
                    onScroll={e => setPaginaProducto(Math.round(e.nativeEvent.contentOffset.x / ANCHO))}>
                    {imagenes.map((img, i) => (
                      <Image key={i} source={{ uri: img }} style={[styles.productoImg, { width: ANCHO }]} resizeMode="cover" />
                    ))}
                  </ScrollView>
                </Animated.View>
              </GestureDetector>
            </GestureHandlerRootView>

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
              {/* Nombre + ⓘ + X */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[styles.productoTitulo, { color: Colors.text, flex: 1 }]}>{item.titulo ?? ''}</Text>
                {item.descripcion ? (
                  <TouchableOpacity
                    style={[styles.productoCerrarX, { backgroundColor: infoProductoVisible ? Colors.accent + '22' : Colors.border }]}
                    onPress={() => setInfoProductoVisible(v => !v)}>
                    <Ionicons name="information-circle-outline" size={18} color={infoProductoVisible ? Colors.accent : Colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.productoCerrarX, { backgroundColor: Colors.border }]}
                  onPress={() => { setProductoModal(null); setPaginaProducto(0); }}>
                  <Ionicons name="close" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* Descripción del producto (desplegable con ⓘ) */}
              {infoProductoVisible && item.descripcion ? (
                <View style={{ backgroundColor: Colors.accent + '12', borderRadius: Radius.md, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.accent }}>
                  <Text style={{ fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 }}>{item.descripcion}</Text>
                </View>
              ) : null}

              {/* Precios */}
              {(item.precio || item.precio_bs) ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  {item.precio ? <Text style={[styles.productoPrecio, { color: Colors.accent }]}>${item.precio}</Text> : null}
                  {item.precio_bs ? <Text style={[styles.productoPrecioBs, { color: Colors.textMuted }]}>Bs. {item.precio_bs}</Text> : null}
                </View>
              ) : null}

              {whatsapp ? (
                <TouchableOpacity
                  style={styles.productoWaBtn}
                  onPress={() => {
                    const msg = `Hola, vi${item.titulo ? ` "${item.titulo}"` : ' tu publicación'} en CashCach. ¿Sigue disponible?`;
                    Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`).catch(() => {});
                  }}>
                  <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                  <Text style={styles.productoWaBtnText}>Consultar al vendedor</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderImagenAmpliada = () => (
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
  );

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
      {renderProductoModal()}
      {renderImagenAmpliada()}
      {renderModalConfig()}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Tienda</Text>
        <TouchableOpacity
          style={[styles.configBtn, { borderColor: Colors.border }]}
          onPress={() => { setCiudadInputTemp(ubicacionCiudad); setRadioInputTemp(ubicacionRadio); setModalConfigVisible(true); }}
        >
          <Ionicons name="settings-outline" size={20} color={ubicacionCiudad ? Colors.accent : Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.directorioBtn, { backgroundColor: Colors.accent }]}
          onPress={() => router.push('/directorio')}
        >
          <Ionicons name="map-outline" size={15} color="#fff" />
          <Text style={styles.directorioBtnText}>Directorio</Text>
        </TouchableOpacity>
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

      {/* Mi espacio de negocio */}
      <View style={[styles.bannerSocio, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '55', flexDirection: 'column', alignItems: 'stretch' }]}>
        {/* Cabecera — siempre visible */}
        <TouchableOpacity
          onPress={() => setSubmenu(v => !v)}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={[styles.bannerSocioIcono, { backgroundColor: Colors.accent }]}>
            <Ionicons name="create" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerSocioTitulo, { color: Colors.text }]}>Mis tiendas</Text>
            <Text style={[styles.bannerSocioSub, { color: Colors.textMuted }]}>
              {misSocios.length === 0 ? 'Toca para gestionar tu negocio' : `${misSocios.length} negocio${misSocios.length > 1 ? 's' : ''} · toca para ver`}
            </Text>
          </View>
          <Ionicons name={submenu ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.accent} />
        </TouchableOpacity>

        {/* Submenú desplegable */}
        {submenu && (
          <View style={{ marginTop: Spacing.sm, gap: 8 }}>

            {/* Negocios aprobados detectados automáticamente */}
            {misSocios.map(s => {
              const vencida = s.fecha_vencimiento
                ? new Date(s.fecha_vencimiento).getTime() < Date.now()
                : false;
              const mesVenc = s.fecha_vencimiento
                ? new Date(s.fecha_vencimiento).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
                : null;
              return (
                <TouchableOpacity key={s.id}
                  onPress={() => { setSubmenu(false); router.push({ pathname: '/editar-mi-negocio', params: { id: s.id } }); }}
                  activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: vencida ? '#ef4444' : Colors.border, overflow: 'hidden' }}>
                  {/* Miniatura */}
                  {s.imagen ? (
                    <Image source={{ uri: s.imagen }} style={{ width: 54, height: 54 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 54, height: 54, backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="storefront-outline" size={22} color={Colors.accent} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontSize: FontSize.sm, fontWeight: '800' }}>{s.nombre}</Text>
                    {vencida && mesVenc ? (
                      <Text style={{ color: '#ef4444', fontSize: FontSize.xs, fontWeight: '700', marginTop: 2 }}>
                        ⚠ Vencida · {mesVenc}
                      </Text>
                    ) : (
                      <Text style={{ color: Colors.accent, fontSize: FontSize.xs, fontWeight: '600', marginTop: 2 }}>Editar mi tienda · subir imágenes</Text>
                    )}
                  </View>
                  <View style={{ backgroundColor: vencida ? '#ef4444' : Colors.accent, paddingHorizontal: 12, paddingVertical: 8, marginRight: 10, borderRadius: Radius.md }}>
                    <Text style={{ color: '#fff', fontSize: FontSize.xs, fontWeight: '800' }}>Abrir</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Si no hay negocios aún */}
            {misSocios.length === 0 && (
              <View style={{ paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' }}>
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' }}>
                  {yaEnvioSolicitud
                    ? 'Tu solicitud está en revisión. Cuando sea aprobada, tu negocio aparecerá aquí.'
                    : 'Aún no tienes un negocio registrado.'}
                </Text>
              </View>
            )}

            {/* Registrar nuevo negocio — solo si no se alcanzó el límite */}
            {misSocios.length < limiteTiendas && (
              <TouchableOpacity
                onPress={() => { setSubmenu(false); router.push('/unirse-socio'); }}
                activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: Colors.accent + '55', borderStyle: 'dashed' }}>
                <Ionicons name="add-circle-outline" size={16} color={Colors.accent} />
                <Text style={{ flex: 1, color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' }}>Registrar nueva tienda</Text>
              </TouchableOpacity>
            )}

          </View>
        )}
      </View>


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
              <TouchableOpacity
                style={styles.seccionHeader}
                onPress={() => setSubcatAbierto(v => !v)}
                activeOpacity={0.7}>
                <Ionicons name="star" size={14} color={Colors.accent} />
                <Text style={[styles.seccionTitulo, { color: Colors.accent, flex: 1 }]}>Destacados</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[styles.seccionTitulo, { color: Colors.accent }]}>Categoría</Text>
                  <Ionicons name={subcatAbierto ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.accent} />
                </View>
              </TouchableOpacity>

              {/* Subcategorías desplegables */}
              {subcatAbierto && subcats.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
                  <TouchableOpacity
                    onPress={() => setSubcatFiltro(null)}
                    style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1.5,
                      backgroundColor: !subcatFiltro ? Colors.accent : Colors.card,
                      borderColor: !subcatFiltro ? Colors.accent : Colors.border }}>
                    <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: !subcatFiltro ? '#fff' : Colors.textMuted }}>Todos</Text>
                  </TouchableOpacity>
                  {subcats.map(sc => (
                    <TouchableOpacity key={sc.id}
                      onPress={() => setSubcatFiltro(subcatFiltro === sc.id ? null : sc.id)}
                      style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1.5,
                        backgroundColor: subcatFiltro === sc.id ? Colors.accent : Colors.card,
                        borderColor: subcatFiltro === sc.id ? Colors.accent : Colors.border }}>
                      <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: subcatFiltro === sc.id ? '#fff' : Colors.textMuted }}>{sc.nombre}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Cards horizontales: solo cuando NO hay filtro activo */}
              {!subcatFiltro && destacados.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {destacados.map(s => (
                      <TouchableOpacity key={s.id} style={[styles.cardDestacado, { width: '49%', backgroundColor: Colors.card, borderColor: Colors.border }]} onPress={() => setSocioModal(s)} activeOpacity={0.85}>
                        {s.imagen ? (
                          <Image source={{ uri: s.imagen }} style={styles.cardDestacadoImg} resizeMode="cover" />
                        ) : (
                          <View style={[styles.cardDestacadoImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                            <Ionicons name="storefront-outline" size={24} color={Colors.accent} />
                          </View>
                        )}
                        <Text style={[styles.cardDestacadoNombre, { color: Colors.text }]} numberOfLines={1}>{s.nombre}</Text>
                        {s.ciudad ? <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1, paddingHorizontal: 8 }} numberOfLines={1}>{s.ciudad}</Text> : null}
                        {s.whatsapp ? (
                          <TouchableOpacity style={[styles.cardDestacadoBtn, { backgroundColor: '#25D36622', borderColor: '#25D36644' }]} onPress={() => abrirWhatsApp(s.whatsapp)}>
                            <Ionicons name="logo-whatsapp" size={13} color="#25D366" />
                            <Text style={[styles.cardDestacadoBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                          </TouchableOpacity>
                        ) : s.telefono ? (
                          <TouchableOpacity style={[styles.cardDestacadoBtn, { backgroundColor: Colors.success + '1A', borderColor: Colors.success + '44' }]} onPress={() => abrirTelefono(s.telefono)}>
                            <Ionicons name="call-outline" size={13} color={Colors.success} />
                            <Text style={[styles.cardDestacadoBtnText, { color: Colors.success }]}>Llamar</Text>
                          </TouchableOpacity>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
              )}
            </View>
          )}

          {/* Tiendas aleatorias (ciudad configurada o todas) */}
          {!busqueda && !filtroAplicado && !subcatFiltro && sociosCiudad.length > 0 && (
            <View style={{ marginTop: 8 }}>
              <View style={styles.seccionHeader}>
                <Ionicons name="storefront-outline" size={14} color={Colors.accent} />
                <Text style={[styles.seccionTitulo, { color: Colors.accent, flex: 1 }]}>
                  {ubicacionCiudad ? `Tiendas en ${ubicacionCiudad}` : 'Tiendas registradas'}
                </Text>
                <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>{sociosCiudad.length} registradas</Text>
              </View>
              <View style={styles.grilla}>
                {sociosCiudad.map(s => renderMiniCard(s))}
              </View>
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
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  backBtn:           { padding: 4 },
  headerTitle:       { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  configBtn:         { width: 34, height: 34, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  directorioBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
  directorioBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
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
    position: 'absolute', top: 8, right: 8,
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
