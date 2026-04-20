import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl,
  Image, TextInput, Keyboard, Modal,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, Categoria, Subcategoria, SocioComercial } from '@/services/supabase';

type Nivel = 'categorias' | 'subcategorias' | 'comercios';

export default function DirectorioScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [nivel,           setNivel]           = useState<Nivel>('categorias');
  const [categorias,      setCategorias]      = useState<Categoria[]>([]);
  const [subcategorias,   setSubcategorias]   = useState<Subcategoria[]>([]);
  const [comercios,       setComercios]       = useState<SocioComercial[]>([]);
  const [todosComercios,  setTodosComercios]  = useState<SocioComercial[]>([]);
  const [catActiva,       setCatActiva]       = useState<Categoria | null>(null);
  const [subcatActiva,    setSubcatActiva]    = useState<Subcategoria | null>(null);
  const [cargando,        setCargando]        = useState(true);
  const [refrescando,     setRefrescando]     = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [busqueda,        setBusqueda]        = useState('');
  const [mostrarSug,      setMostrarSug]      = useState(false);
  const [comercioModal,   setComercioModal]   = useState<SocioComercial | null>(null);
  const [imagenAmpliada,  setImagenAmpliada]  = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const cargarCategorias = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('categorias')
      .select('*')
      .order('orden', { ascending: true });
    if (err) setError('No se pudo cargar el directorio');
    else setCategorias(data ?? []);
    if (esRefresh) setRefrescando(false); else setCargando(false);
  }, []);

  const cargarTodosComerciosParaBusqueda = useCallback(async () => {
    const { data } = await supabase.from('socios_comerciales').select('*');
    setTodosComercios(data ?? []);
  }, []);

  useEffect(() => {
    cargarCategorias();
    cargarTodosComerciosParaBusqueda();
  }, [cargarCategorias, cargarTodosComerciosParaBusqueda]);

  const seleccionarCategoria = async (cat: Categoria) => {
    setCatActiva(cat);
    setCargando(true);
    const { data } = await supabase
      .from('subcategorias')
      .select('*')
      .eq('categoria_id', cat.id)
      .order('orden', { ascending: true });
    setSubcategorias(data ?? []);
    setCargando(false);
    setNivel('subcategorias');
  };

  const seleccionarSubcategoria = async (sub: Subcategoria) => {
    setSubcatActiva(sub);
    setCargando(true);
    const { data } = await supabase
      .from('socios_comerciales')
      .select('*')
      .eq('subcategoria_id', sub.id)
      .order('orden', { ascending: true });
    setComercios(data ?? []);
    setCargando(false);
    setNivel('comercios');
  };

  const volverAtras = () => {
    setBusqueda('');
    setMostrarSug(false);
    if (nivel === 'comercios') setNivel('subcategorias');
    else if (nivel === 'subcategorias') setNivel('categorias');
    else router.push('/socios');
  };

  // Autocomplete sobre todos los comercios
  const sugerencias = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    const items = new Set<string>();
    todosComercios.forEach(c => {
      if (c.nombre?.toLowerCase().includes(q)) items.add(c.nombre);
      if (c.direccion?.toLowerCase().includes(q)) items.add(c.direccion);
    });
    return Array.from(items).slice(0, 6);
  }, [busqueda, todosComercios]);

  // Comercios filtrados por búsqueda global
  const comerciosBuscados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return todosComercios.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.direccion?.toLowerCase().includes(q)
    );
  }, [busqueda, todosComercios]);

  const enBusqueda = busqueda.trim().length > 0;

  const seleccionarSugerencia = (texto: string) => {
    setBusqueda(texto);
    setMostrarSug(false);
    Keyboard.dismiss();
  };

  const tituloHeader = () => {
    if (nivel === 'subcategorias' && catActiva) return catActiva.nombre;
    if (nivel === 'comercios' && subcatActiva) return subcatActiva.nombre;
    return 'Directorio';
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
      onPress={() => setComercioModal(c)} activeOpacity={0.85}>
      {c.imagen ? (
        <Image source={{ uri: c.imagen }} style={styles.miniCardImg} resizeMode="cover" />
      ) : (
        <View style={[styles.miniCardImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
        </View>
      )}
      {c.destacado && (
        <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
          <Ionicons name="star" size={10} color="#fff" />
        </View>
      )}
      <View style={styles.miniCardBody}>
        <Text style={[styles.miniCardNombre, { color: Colors.text }]} numberOfLines={1}>{c.nombre}</Text>
        {c.direccion ? <Text style={[styles.miniCardDir, { color: Colors.textMuted }]} numberOfLines={1}>{c.direccion}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  const renderModal = () => {
    if (!comercioModal) return null;
    const c = comercioModal;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setComercioModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
            <TouchableOpacity style={[styles.modalCerrar, { backgroundColor: Colors.border }]} onPress={() => setComercioModal(null)}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false}>
              {c.imagen ? (
                <Image source={{ uri: c.imagen }} style={styles.modalImagen} resizeMode="cover" />
              ) : (
                <View style={[styles.modalImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                  <Ionicons name="storefront-outline" size={40} color={Colors.accent + '88'} />
                </View>
              )}
              <View style={styles.modalBody}>
                <Text style={[styles.modalNombre, { color: Colors.text }]}>{c.nombre}</Text>
                {c.direccion ? (
                  <TouchableOpacity style={[styles.infoFila, { paddingHorizontal: 0, marginTop: 8 }]} onPress={() => abrirMapa(c.direccion)}>
                    <Ionicons name="location-outline" size={15} color={Colors.accent} />
                    <Text style={[styles.infoTexto, { color: Colors.accent, textDecorationLine: 'underline' }]}>{c.direccion}</Text>
                    <Ionicons name="navigate-outline" size={14} color={Colors.accent} />
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.botonesRow, { paddingHorizontal: 0, marginTop: 16 }]}>
                  {c.telefono ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: Colors.success + '1A', borderColor: Colors.success + '44' }]} onPress={() => abrirTelefono(c.telefono)}>
                      <Ionicons name="call-outline" size={16} color={Colors.success} />
                      <Text style={[styles.contactBtnText, { color: Colors.success }]}>Llamar</Text>
                    </TouchableOpacity>
                  ) : null}
                  {c.whatsapp ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: '#25D36622', borderColor: '#25D36644' }]} onPress={() => abrirWhatsApp(c.whatsapp)}>
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  ) : null}
                  {c.web ? (
                    <TouchableOpacity style={[styles.contactBtn, { backgroundColor: Colors.blue + '1A', borderColor: Colors.blue + '44' }]} onPress={() => abrirEnlace(c.web)}>
                      <Ionicons name="globe-outline" size={16} color={Colors.blue} />
                      <Text style={[styles.contactBtnText, { color: Colors.blue }]}>Web</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Galería de imágenes */}
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.galeriaTitulo, { color: Colors.textMuted }]}>Galería</Text>
                  <View style={styles.galeriaGrid}>
                    {[c.imagen, c.imagen2, c.imagen3, c.imagen4, c.imagen5, c.imagen6].map((img, i) => (
                      img ? (
                        <TouchableOpacity key={i} onPress={() => setImagenAmpliada(img)} activeOpacity={0.85}
                          style={[styles.galeriaImg, { borderColor: Colors.border }]}>
                          <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        </TouchableOpacity>
                      ) : (
                        <View key={i} style={[styles.galeriaImg, styles.galeriaImgVacia, { backgroundColor: Colors.border + '44', borderColor: Colors.border }]}>
                          <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
                        </View>
                      )
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
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
      </View>

      {/* Breadcrumb */}
      {nivel !== 'categorias' && (
        <View style={styles.breadcrumb}>
          <TouchableOpacity onPress={() => { setNivel('categorias'); setBusqueda(''); }}>
            <Text style={[styles.breadcrumbItem, { color: Colors.accent }]}>Directorio</Text>
          </TouchableOpacity>
          {catActiva && (
            <>
              <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
              <TouchableOpacity onPress={() => { setNivel('subcategorias'); setBusqueda(''); }}>
                <Text style={[styles.breadcrumbItem, nivel === 'subcategorias' ? { color: Colors.text } : { color: Colors.accent }]}>
                  {catActiva.nombre}
                </Text>
              </TouchableOpacity>
            </>
          )}
          {subcatActiva && nivel === 'comercios' && (
            <>
              <Ionicons name="chevron-forward" size={12} color={Colors.textMuted} />
              <Text style={[styles.breadcrumbItem, { color: Colors.text }]}>{subcatActiva.nombre}</Text>
            </>
          )}
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
            <TouchableOpacity onPress={() => { setBusqueda(''); setMostrarSug(false); }}>
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
          <TouchableOpacity style={[styles.reintentarBtn, { backgroundColor: Colors.accent }]} onPress={() => cargarCategorias()}>
            <Text style={styles.reintentarText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : enBusqueda ? (
        // Resultados de búsqueda global
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {comerciosBuscados.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin resultados</Text>
            </View>
          ) : (
            <View style={styles.grilla}>
              {comerciosBuscados.map(c => renderMiniCard(c))}
            </View>
          )}
        </ScrollView>
      ) : nivel === 'categorias' ? (
        // Lista de estados
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargarCategorias(true)} tintColor={Colors.accent} />}
        >
          {categorias.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="map-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin categorías aún</Text>
            </View>
          ) : (
            categorias.map(cat => (
              <TouchableOpacity key={cat.id} style={styles.itemRow} onPress={() => seleccionarCategoria(cat)}>
                {cat.imagen ? (
                  <Image source={{ uri: cat.imagen }} style={styles.itemImagen} resizeMode="cover" />
                ) : (
                  <View style={[styles.itemImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
                    <Ionicons name="map-outline" size={22} color={Colors.accent} />
                  </View>
                )}
                <Text style={styles.itemNombre}>{cat.nombre}</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : nivel === 'subcategorias' ? (
        // Lista de sub-categorías
        <ScrollView contentContainerStyle={styles.body}>
          {subcategorias.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="grid-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin sub-categorías en este estado</Text>
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
          {comercios.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="storefront-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.centeredText}>Sin comercios en esta categoría</Text>
            </View>
          ) : (
            <View style={styles.grilla}>
              {comercios.map(c => renderMiniCard(c))}
            </View>
          )}
        </ScrollView>
      )}

      {renderModal()}

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

  searchWrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, zIndex: 10 },
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
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  dropdownText: { fontSize: FontSize.sm },

  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.xl },
  centeredText:  { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  reintentarBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.md },
  reintentarText:{ fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },

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
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md,
  },
  miniCard: {
    width: '47%', borderRadius: Radius.lg,
    borderWidth: 1, overflow: 'hidden',
  },
  miniCardImg: { width: '100%', height: 100 },
  miniCardBody: { padding: Spacing.sm },
  miniCardNombre: { fontSize: FontSize.sm, fontWeight: '700' },
  miniCardDir:    { fontSize: 11, marginTop: 2 },
  badge: {
    position: 'absolute', top: 6, right: 6,
    borderRadius: 20, padding: 3,
  },

  modalOverlay: {
    flex: 1, backgroundColor: '#00000055',
    justifyContent: 'flex-end',
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
  galeriaImgVacia: { alignItems: 'center', justifyContent: 'center' },

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
}); }
