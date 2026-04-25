import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl, Image,
  TextInput, Keyboard, Modal, Dimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SocioComercial } from '@/services/supabase';

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
  const [busqueda,      setBusqueda]      = useState('');
  const [modalBuscar,   setModalBuscar]   = useState(false);
  const [subcats,       setSubcats]       = useState<{ id: string; nombre: string }[]>([]);
  const [subcatAbierto, setSubcatAbierto] = useState(false);
  const [subcatFiltro,  setSubcatFiltro]  = useState<string | null>(null);
  const [socioModal,    setSocioModal]    = useState<SocioComercial | null>(null);
  const [imagenAmpliada, setImagenAmpliada] = useState<string | null>(null);
  type ItemGaleria = { id: string; imagen: string; imagen2: string | null; imagen3: string | null; titulo: string | null; precio: string | null; precio_bs: string | null };
  const [galeriaItems,   setGaleriaItems]   = useState<ItemGaleria[]>([]);
  const [productoModal,  setProductoModal]  = useState<{ item: ItemGaleria; whatsapp: string | null } | null>(null);
  const [paginaProducto, setPaginaProducto] = useState(0);
  const ANCHO = Dimensions.get('window').width;
  const inputRef = useRef<TextInput>(null);

  const cargar = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('socios_comerciales')
      .select('*')
      .or('activo.is.null,activo.eq.true')
      .or(`fecha_vencimiento.is.null,fecha_vencimiento.gt.${new Date().toISOString()}`)
      .order('orden', { ascending: true });
    if (err) setError('No se pudo cargar la información');
    else setSocios(data ?? []);
    if (esRefresh) setRefrescando(false); else setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!socioModal) { setGaleriaItems([]); return; }
    supabase.from('galeria_items').select('*').eq('socio_id', socioModal.id).order('orden')
      .then(({ data }) => setGaleriaItems((data ?? []) as ItemGaleria[]));
  }, [socioModal]);

  useEffect(() => {
    supabase.from('subcategorias').select('id,nombre').is('categoria_id', null).order('nombre').then(({ data }) => {
      if (data) setSubcats(data as { id: string; nombre: string }[]);
    });
  }, []);

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
    return lista;
  }, [socios, subcatFiltro]);

  const sugerencias = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    const items = new Set<string>();
    socios.forEach(s => {
      const subcatNombre = subcats.find(sc => sc.id === s.subcategoria_id)?.nombre;
      const campos: (string | null | undefined)[] = [s.nombre, s.ciudad, s.direccion, subcatNombre];
      campos.forEach(campo => {
        if (campo?.toLowerCase().includes(q)) items.add(campo);
      });
      // Palabras clave de la descripción
      if (s.descripcion?.toLowerCase().includes(q)) {
        const frase = s.descripcion.length > 50 ? s.descripcion.slice(0, 50) + '…' : s.descripcion;
        items.add(frase);
      }
    });
    return Array.from(items).slice(0, 8);
  }, [busqueda, socios, subcats]);

  const sociosFiltrados = useMemo(() => {
    let lista = socios;
    if (subcatFiltro) lista = lista.filter(s => s.subcategoria_id === subcatFiltro);
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(s => {
      const subcatNombre = subcats.find(sc => sc.id === s.subcategoria_id)?.nombre ?? '';
      return (
        s.nombre?.toLowerCase().includes(q) ||
        s.ciudad?.toLowerCase().includes(q) ||
        s.direccion?.toLowerCase().includes(q) ||
        s.descripcion?.toLowerCase().includes(q) ||
        subcatNombre.toLowerCase().includes(q)
      );
    });
  }, [socios, busqueda, subcatFiltro, subcats]);

  const seleccionarSugerencia = (texto: string) => {
    setBusqueda(texto);
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
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setSocioModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
            <TouchableOpacity style={[styles.modalCerrar, { backgroundColor: Colors.border }]} onPress={() => setSocioModal(null)}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false}>
              {s.imagen ? (
                <Image source={{ uri: s.imagen }} style={styles.modalImagen} resizeMode="cover" />
              ) : (
                <View style={[styles.modalImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                  <Ionicons name="storefront-outline" size={40} color={Colors.accent + '88'} />
                </View>
              )}
              <View style={styles.modalBody}>
                {s.destacado && (
                  <View style={[styles.badgeDestacado, { backgroundColor: Colors.accent, alignSelf: 'flex-start', position: 'relative', top: 0, right: 0, marginBottom: 8 }]}>
                    <Ionicons name="star" size={11} color="#fff" />
                    <Text style={styles.badgeDestacadoText}>Destacado</Text>
                  </View>
                )}
                <Text style={[styles.modalNombre, { color: Colors.text }]}>{s.nombre}</Text>
                {s.direccion ? (
                  <TouchableOpacity style={[styles.infoFila, { paddingHorizontal: 0, marginTop: 8 }]} onPress={() => abrirMapa(s.direccion)}>
                    <Ionicons name="location-outline" size={15} color={Colors.accent} />
                    <Text style={[styles.infoTexto, { color: Colors.accent, textDecorationLine: 'underline' }]}>{s.direccion}</Text>
                    <Ionicons name="navigate-outline" size={14} color={Colors.accent} />
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.botonesRow, { paddingHorizontal: 0, marginTop: 16 }]}>
                  {s.telefono ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: Colors.success + '1A', borderColor: Colors.success + '44' }]} onPress={() => abrirTelefono(s.telefono)}>
                      <Ionicons name="call-outline" size={16} color={Colors.success} />
                      <Text style={[styles.contactBtnText, { color: Colors.success }]}>Llamar</Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.whatsapp ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#25D36622', borderColor: '#25D36644' }]} onPress={() => abrirWhatsApp(s.whatsapp)}>
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  ) : null}
                  {s.web ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: Colors.blue + '1A', borderColor: Colors.blue + '44' }]} onPress={() => abrirEnlace(s.web)}>
                      <Ionicons name="globe-outline" size={16} color={Colors.blue} />
                      <Text style={[styles.contactBtnText, { color: Colors.blue }]}>Web</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Catálogo / Galería */}
                {galeriaItems.length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.galeriaTitulo, { color: Colors.textMuted }]}>Catálogo</Text>
                    <View style={styles.galeriaGrid}>
                      {galeriaItems.map(item => (
                        <TouchableOpacity key={item.id}
                          onPress={() => setProductoModal({ item, whatsapp: s.whatsapp ?? null })}
                          activeOpacity={0.85}
                          style={[styles.galeriaImg, { borderColor: Colors.border }]}>
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
              </View>
            </ScrollView>
          </View>
        </View>
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

  const renderProductoModal = () => {
    if (!productoModal) return null;
    const { item, whatsapp } = productoModal;
    const imagenes = [item.imagen, item.imagen2, item.imagen3].filter(Boolean) as string[];
    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => { setProductoModal(null); setPaginaProducto(0); }}>
        <View style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' }}>
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

  return (
    <SafeAreaView style={styles.safe}>
      {renderModal()}
      {renderProductoModal()}
      {renderImagenAmpliada()}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mi Tienda</Text>
        <TouchableOpacity
          style={[styles.directorioBtn, { backgroundColor: Colors.accent }]}
          onPress={() => router.push('/directorio')}
        >
          <Ionicons name="map-outline" size={15} color="#fff" />
          <Text style={styles.directorioBtnText}>Directorio</Text>
        </TouchableOpacity>
      </View>


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
      <Modal visible={modalBuscar} animationType="fade" transparent onRequestClose={() => { setModalBuscar(false); setBusqueda(''); }}>
        <View style={{ flex: 1, backgroundColor: '#00000066' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setModalBuscar(false); setBusqueda(''); }} />
          <View style={[styles.searchWrap, { position: 'absolute', top: 80, left: 0, right: 0, zIndex: 100 }]}>
            <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border, borderRadius: Radius.lg, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }]}>
              <Ionicons name="search-outline" size={18} color={Colors.accent} />
              <TextInput
                ref={inputRef}
                style={[styles.searchInput, { color: Colors.text }]}
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
              <View style={[styles.dropdown, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
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
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.centeredText}>Cargando socios…</Text>
        </View>
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

          {/* Resultados de búsqueda o filtro subcategoría */}
          {(busqueda.trim() !== '' || subcatFiltro) && (
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

      {/* FAB búsqueda */}
      {!busqueda && (
        <TouchableOpacity
          onPress={() => { setBusqueda(''); setModalBuscar(true); }}
          activeOpacity={0.85}
          style={{ position: 'absolute', bottom: 28, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
          <Ionicons name="search" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* FAB limpiar búsqueda (cuando hay texto activo) */}
      {busqueda ? (
        <TouchableOpacity
          onPress={() => { setBusqueda(''); setModalBuscar(false); }}
          activeOpacity={0.85}
          style={{ position: 'absolute', bottom: 28, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      ) : null}
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
  directorioBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
  directorioBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },

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
  cardDestacadoImg:      { width: '100%', height: 100 },
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
  miniCardImg:    { width: '100%', height: 100 },
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
  galeriaGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
    maxHeight: '85%',
  },
  productoImg:     { width: '100%', height: 280 },
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
