import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, Linking, ActivityIndicator, RefreshControl, Image,
  TextInput, Keyboard, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, SocioComercial } from '@/services/supabase';

export default function SociosScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();

  const [socios,      setSocios]      = useState<SocioComercial[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [busqueda,      setBusqueda]      = useState('');
  const [mostrarSug,    setMostrarSug]    = useState(false);
  const [socioModal,    setSocioModal]    = useState<SocioComercial | null>(null);
  const inputRef = useRef<TextInput>(null);

  const cargar = useCallback(async (esRefresh = false) => {
    if (esRefresh) setRefrescando(true); else setCargando(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('socios_comerciales')
      .select('*')
      .order('orden', { ascending: true });
    if (err) setError('No se pudo cargar la información');
    else setSocios(data ?? []);
    if (esRefresh) setRefrescando(false); else setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const destacados = useMemo(() => socios.filter(s => s.destacado), [socios]);

  const sugerencias = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    const items = new Set<string>();
    socios.forEach(s => {
      if (s.nombre?.toLowerCase().includes(q))    items.add(s.nombre);
      if (s.direccion?.toLowerCase().includes(q)) items.add(s.direccion);
    });
    return Array.from(items).slice(0, 6);
  }, [busqueda, socios]);

  const sociosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return socios;
    return socios.filter(s =>
      s.nombre?.toLowerCase().includes(q) ||
      s.direccion?.toLowerCase().includes(q)
    );
  }, [socios, busqueda]);

  const seleccionarSugerencia = (texto: string) => {
    setBusqueda(texto);
    setMostrarSug(false);
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

  const renderCard = (s: SocioComercial) => (
    <View key={s.id} style={styles.card}>
      {s.imagen ? (
        <Image source={{ uri: s.imagen }} style={styles.cardImagen} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImagenPlaceholder, { backgroundColor: Colors.accent + '18' }]}>
          <Ionicons name="storefront-outline" size={32} color={Colors.accent + '88'} />
        </View>
      )}
      {s.destacado && (
        <View style={[styles.badgeDestacado, { backgroundColor: Colors.accent }]}>
          <Ionicons name="star" size={11} color="#fff" />
          <Text style={styles.badgeDestacadoText}>Destacado</Text>
        </View>
      )}
      <View style={styles.cardHeader}>
        <Text style={styles.cardNombre}>{s.nombre}</Text>
      </View>
      {s.direccion ? (
        <TouchableOpacity style={styles.infoFila} onPress={() => abrirMapa(s.direccion)}>
          <Ionicons name="location-outline" size={15} color={Colors.accent} />
          <Text style={[styles.infoTexto, { color: Colors.accent, textDecorationLine: 'underline' }]}>{s.direccion}</Text>
          <Ionicons name="navigate-outline" size={14} color={Colors.accent} />
        </TouchableOpacity>
      ) : null}
      <View style={styles.botonesRow}>
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
    </View>
  );

  const renderModal = () => {
    if (!socioModal) return null;
    const s = socioModal;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => setSocioModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.card }]}>
            <TouchableOpacity style={styles.modalCerrar} onPress={() => setSocioModal(null)}>
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
                <View style={[styles.badgeDestacado, { backgroundColor: Colors.accent, alignSelf: 'flex-start', position: 'relative', top: 0, right: 0, marginBottom: 8 }]}>
                  <Ionicons name="star" size={11} color="#fff" />
                  <Text style={styles.badgeDestacadoText}>Destacado</Text>
                </View>
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
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {renderModal()}
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Socios Comerciales</Text>
        <TouchableOpacity
          style={[styles.directorioBtn, { backgroundColor: Colors.accent }]}
          onPress={() => router.push('/directorio')}
        >
          <Ionicons name="map-outline" size={15} color="#fff" />
          <Text style={styles.directorioBtnText}>Directorio</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador */}
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
          {!busqueda && destacados.length > 0 && (
            <View>
              <View style={styles.seccionHeader}>
                <Ionicons name="star" size={14} color={Colors.accent} />
                <Text style={[styles.seccionTitulo, { color: Colors.accent }]}>Destacados</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destacadosRow}>
                {destacados.map(s => (
                  <TouchableOpacity key={s.id} style={[styles.cardDestacado, { backgroundColor: Colors.card, borderColor: Colors.border }]} onPress={() => setSocioModal(s)} activeOpacity={0.85}>
                    {s.imagen ? (
                      <Image source={{ uri: s.imagen }} style={styles.cardDestacadoImg} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cardDestacadoImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="storefront-outline" size={24} color={Colors.accent} />
                      </View>
                    )}
                    <Text style={[styles.cardDestacadoNombre, { color: Colors.text }]} numberOfLines={1}>{s.nombre}</Text>
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
              </ScrollView>
            </View>
          )}

          {/* Resultados de búsqueda */}
          {busqueda.trim() !== '' && (
            sociosFiltrados.length === 0 ? (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.centeredText}>Sin resultados</Text>
              </View>
            ) : (
              sociosFiltrados.map(s => renderCard(s))
            )
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
  backBtn:           { padding: 4 },
  headerTitle:       { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  directorioBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md },
  directorioBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },

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
  dropdownItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 12 },
  dropdownText: { fontSize: FontSize.sm },

  centered:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: Spacing.xl },
  centeredText:   { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center' },
  reintentarBtn:  { paddingHorizontal: 24, paddingVertical: 10, borderRadius: Radius.md },
  reintentarText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },

  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  seccionTitulo: { fontSize: FontSize.sm, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Destacados horizontal
  destacadosRow: { gap: Spacing.md, paddingBottom: Spacing.sm },
  cardDestacado: {
    width: 150, borderRadius: Radius.lg, borderWidth: 1,
    overflow: 'hidden', gap: 6, paddingBottom: Spacing.sm,
  },
  cardDestacadoImg:      { width: '100%', height: 100 },
  cardDestacadoNombre:   { fontSize: FontSize.sm, fontWeight: '700', paddingHorizontal: 8 },
  cardDestacadoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginHorizontal: 8, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1,
  },
  cardDestacadoBtnText:  { fontSize: 11, fontWeight: '700' },

  // Badge destacado en card normal
  badgeDestacado: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99,
  },
  badgeDestacadoText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', gap: Spacing.sm,
  },
  cardImagen:            { width: '100%', height: 160 },
  cardImagenPlaceholder: { width: '100%', height: 120, alignItems: 'center', justifyContent: 'center' },
  cardHeader:            { paddingHorizontal: Spacing.md, paddingTop: 4 },
  cardNombre:            { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },

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
    maxHeight: '85%', overflow: 'hidden',
  },
  modalCerrar: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    padding: 6, borderRadius: 99,
  },
  modalImagen:            { width: '100%', height: 200 },
  modalImagenPlaceholder: { width: '100%', height: 160, alignItems: 'center', justifyContent: 'center' },
  modalBody:              { padding: Spacing.lg, paddingBottom: 40 },
  modalNombre:            { fontSize: FontSize.xl, fontWeight: '800' },
}); }
