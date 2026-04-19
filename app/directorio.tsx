import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl,
  Image, TextInput, Keyboard,
} from 'react-native';
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

  const renderComercio = (c: SocioComercial) => (
    <View key={c.id} style={styles.card}>
      {c.imagen ? (
        <Image source={{ uri: c.imagen }} style={styles.cardImagen} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
          <Ionicons name="storefront-outline" size={32} color={Colors.accent + '88'} />
        </View>
      )}
      <View style={styles.cardHeader}>
        <Text style={styles.cardNombre}>{c.nombre}</Text>
      </View>
      {c.direccion ? (
        <TouchableOpacity style={styles.infoFila} onPress={() => abrirMapa(c.direccion)}>
          <Ionicons name="location-outline" size={15} color={Colors.accent} />
          <Text style={[styles.infoTexto, { color: Colors.accent, textDecorationLine: 'underline' }]}>{c.direccion}</Text>
          <Ionicons name="navigate-outline" size={14} color={Colors.accent} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.botonesRow}>
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
    </View>
  );

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
            comerciosBuscados.map(c => renderComercio(c))
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
            comercios.map(c => renderComercio(c))
          )}
        </ScrollView>
      )}
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

  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', gap: Spacing.sm,
  },
  cardImagen:            { width: '100%', height: 160 },
  cardImagenPlaceholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  cardHeader:    { paddingHorizontal: Spacing.md, paddingTop: 4 },
  cardNombre:    { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },

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
