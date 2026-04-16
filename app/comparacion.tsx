import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getItem, setItem } from '@/services/storage';

type Producto = { id: string; nombre: string; precio: string };
type Comercio = { id: string; nombre: string; productos: Producto[] };
type Vista    = 'lista' | 'comercio' | 'comparar';

const CACHE_KEY     = 'comparacion_data';
const BCV_CACHE_KEY = 'bcv_cache';

export default function ComparacionScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const { vista: vistaParam } = useLocalSearchParams<{ vista?: Vista }>();
  const [comercios,      setComercios]      = useState<Comercio[]>([]);
  const [vista,          setVista]          = useState<Vista>(vistaParam ?? 'lista');
  const [comercioActivo, setComercioActivo] = useState<string | null>(null);
  const [nuevoComercio,  setNuevoComercio]  = useState('');
  const [nuevoNombre,    setNuevoNombre]    = useState('');
  const [nuevoPrecio,    setNuevoPrecio]    = useState('');
  const [monedaInput,    setMonedaInput]    = useState<'usd' | 'bs'>('usd');
  const [busqueda,       setBusqueda]       = useState('');
  const [modalVisible,   setModalVisible]   = useState(false);
  const [productoModal,  setProductoModal]  = useState('');
  const [tasaBCV,        setTasaBCV]        = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const data  = await getItem<Comercio[]>(CACHE_KEY);
      const cache = await getItem<{ usd: number }>(BCV_CACHE_KEY);
      if (data)  setComercios(data);
      if (cache) setTasaBCV(cache.usd);
    })();
  }, []);

  const usdABs = (usd: number) =>
    tasaBCV && tasaBCV > 0
      ? `Bs ${(usd * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  const guardar = async (data: Comercio[]) => {
    setComercios(data);
    await setItem(CACHE_KEY, data);
  };

  const agregarComercio = () => {
    if (!nuevoComercio.trim()) return;
    guardar([...comercios, { id: Date.now().toString(), nombre: nuevoComercio.trim(), productos: [] }]);
    setNuevoComercio('');
  };

  const eliminarComercio = (id: string) => {
    Alert.alert('Eliminar comercio', '¿Seguro que deseas eliminarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => guardar(comercios.filter(c => c.id !== id)) },
    ]);
  };

  const comercio = comercios.find(c => c.id === comercioActivo);

  const agregarProducto = () => {
    if (!nuevoNombre.trim() || !nuevoPrecio.trim()) return;
    const valorRaw = parseFloat(nuevoPrecio.replace(',', '.'));
    if (isNaN(valorRaw) || valorRaw <= 0) return;
    // Siempre guardar en USD
    const precioUSD = monedaInput === 'bs' && tasaBCV && tasaBCV > 0
      ? valorRaw / tasaBCV
      : valorRaw;
    const updated = comercios.map(c => c.id !== comercioActivo ? c : {
      ...c,
      productos: [...c.productos, { id: Date.now().toString(), nombre: nuevoNombre.trim(), precio: precioUSD.toString() }],
    });
    guardar(updated);
    setNuevoNombre(''); setNuevoPrecio('');
  };

  const eliminarProducto = (comercioId: string, productoId: string) => {
    guardar(comercios.map(c => c.id !== comercioId ? c : {
      ...c, productos: c.productos.filter(p => p.id !== productoId),
    }));
  };

  const buscarProducto = (termino?: string) => {
    const term = (termino ?? busqueda).trim();
    if (!term) return;
    setBusqueda(term);
    setProductoModal(term);
    setModalVisible(true);
  };

  // Sugerencias: productos únicos de todos los comercios que coincidan con la búsqueda
  const sugerencias = busqueda.trim().length > 0
    ? Array.from(new Set(
        comercios.flatMap(c => c.productos.map(p => p.nombre))
      )).filter(nombre => nombre.toLowerCase().includes(busqueda.toLowerCase().trim()))
    : [];

  // Precios del producto buscado en todos los comercios
  const resultadosBusqueda = () => {
    const term = productoModal.toLowerCase().trim();
    return comercios.map(c => {
      const prod = c.productos.find(p => p.nombre.toLowerCase().includes(term));
      return { id: c.id, nombre: c.nombre, precio: prod ? parseFloat(prod.precio) : null, nombreProducto: prod?.nombre };
    }).filter(r => r.precio !== null);
  };

  // ── VISTA: LISTA DE COMERCIOS ──────────────────────────────────────────────
  if (vista === 'lista') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.navigate('/')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Comparación de Precios</Text>
          {comercios.length >= 2 && (
            <TouchableOpacity style={styles.compareBtn} onPress={() => setVista('comparar')}>
              <Ionicons name="bar-chart-outline" size={16} color="#fff" />
              <Text style={styles.compareBtnText}>Comparar</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={nuevoComercio}
              onChangeText={setNuevoComercio}
              placeholder="Nombre del comercio (ej: Rio, Mercafur…)"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={agregarComercio}
            />
            <TouchableOpacity style={styles.addBtn} onPress={agregarComercio}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {comercios.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="storefront-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin comercios</Text>
              <Text style={styles.emptyText}>Agrega los locales que quieres comparar</Text>
            </View>
          ) : (
            comercios.map(c => (
              <TouchableOpacity
                key={c.id}
                style={styles.comercioCard}
                onPress={() => { setComercioActivo(c.id); setVista('comercio'); }}
              >
                <View style={styles.comercioLeft}>
                  <View style={styles.comercioIcon}>
                    <Ionicons name="storefront-outline" size={20} color={Colors.blue} />
                  </View>
                  <View>
                    <Text style={styles.comercioNombre}>{c.nombre}</Text>
                    <Text style={styles.comercioSub}>
                      {c.productos.length === 0 ? 'Sin productos aún' : `${c.productos.length} producto${c.productos.length !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>
                <View style={styles.comercioRight}>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  <TouchableOpacity onPress={() => eliminarComercio(c.id)} hitSlop={12}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── VISTA: PRODUCTOS DE UN COMERCIO ───────────────────────────────────────
  if (vista === 'comercio' && comercio) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setVista('lista')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{comercio.nombre}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.addProductCol}>
            {/* Fila 1: Nombre */}
            <TextInput
              style={styles.addInput}
              value={nuevoNombre}
              onChangeText={setNuevoNombre}
              placeholder="Nombre del producto…"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
            />
            {/* Fila 2: Precio + toggle */}
            <View style={styles.addProductRow}>
              <TextInput
                style={[styles.addInput, { flex: 1 }]}
                value={nuevoPrecio}
                onChangeText={setNuevoPrecio}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                onSubmitEditing={agregarProducto}
              />
              <TouchableOpacity
                style={[styles.monedaToggle, monedaInput === 'usd' ? styles.monedaToggleUSD : styles.monedaToggleBS]}
                onPress={() => { setMonedaInput(m => m === 'usd' ? 'bs' : 'usd'); setNuevoPrecio(''); }}
              >
                <Text style={[styles.monedaToggleText, monedaInput === 'usd' ? styles.monedaToggleTextUSD : styles.monedaToggleTextBS]}>
                  {monedaInput === 'usd' ? '$' : 'Bs'}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Fila 3: Botón agregar */}
            <TouchableOpacity style={styles.addProductBtn} onPress={agregarProducto}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.addProductBtnText}>Agregar producto</Text>
            </TouchableOpacity>
          </View>

          {comercio.productos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cart-outline" size={52} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>Sin productos</Text>
              <Text style={styles.emptyText}>Agrega los productos con su precio en este local</Text>
            </View>
          ) : (
            <>
              {comercio.productos.map(p => {
                const usdNum = parseFloat(p.precio);
                const bs = usdABs(usdNum);
                return (
                  <View key={p.id} style={styles.productoRow}>
                    <Text style={styles.productoNombre} numberOfLines={1}>{p.nombre}</Text>
                    <View style={styles.precioStack}>
                      <Text style={styles.productoPrecio}>
                        ${usdNum.toFixed(2)}
                      </Text>
                      {bs && <Text style={styles.precioUsd}>{bs}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => eliminarProducto(comercio.id, p.id)} hitSlop={12}>
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── VISTA: COMPARACIÓN ────────────────────────────────────────────────────
  const resultados = resultadosBusqueda();
  const precios    = resultados.map(r => r.precio!);
  const minPrecio  = precios.length > 0 ? Math.min(...precios) : null;
  const maxPrecio  = precios.length > 0 ? Math.max(...precios) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setVista('lista')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comparar precios</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Campo de búsqueda */}
        <Text style={styles.instruccion}>Escribe un producto para ver los precios en cada local</Text>
        <View>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={busqueda}
              onChangeText={setBusqueda}
              placeholder="Ej: mantequilla, arroz, leche…"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={() => buscarProducto()}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.addBtn} onPress={() => buscarProducto()}>
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {sugerencias.length > 0 && (
            <View style={styles.sugerenciasCard}>
              {sugerencias.map((s, i) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sugerenciaItem, i < sugerencias.length - 1 && styles.sugerenciaBorder]}
                  onPress={() => buscarProducto(s)}
                >
                  <Ionicons name="search-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.sugerenciaText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Lista de comercios disponibles */}
        <View style={styles.comerciosChips}>
          {comercios.map(c => (
            <View key={c.id} style={styles.chip}>
              <Ionicons name="storefront-outline" size={13} color={Colors.blue} />
              <Text style={styles.chipText}>{c.nombre}</Text>
              <Text style={styles.chipCount}>{c.productos.length} prod.</Text>
            </View>
          ))}
        </View>

        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Busca un producto para ver la comparación de precios</Text>
        </View>
      </ScrollView>

      {/* Modal de resultado */}
      <Modal transparent visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitulo}>"{productoModal}"</Text>
            <Text style={styles.modalSubtitulo}>Precios encontrados en los locales</Text>

            {resultados.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No se encontró este producto en ningún local</Text>
              </View>
            ) : (
              resultados
                .sort((a, b) => a.precio! - b.precio!)
                .map(r => {
                  const esMenor  = r.precio === minPrecio;
                  const esMayor  = r.precio === maxPrecio && minPrecio !== maxPrecio;
                  const bgColor  = esMenor ? Colors.success + '18' : esMayor ? Colors.error + '18' : Colors.cardAlt;
                  const bdColor  = esMenor ? Colors.success + '55' : esMayor ? Colors.error + '55' : Colors.border;
                  const txtColor = esMenor ? Colors.success : esMayor ? Colors.error : Colors.text;
                  return (
                    <View key={r.id} style={[styles.resultRow, { backgroundColor: bgColor, borderColor: bdColor }]}>
                      <View style={styles.resultLeft}>
                        {esMenor && <Ionicons name="trophy" size={16} color={Colors.success} />}
                        {esMayor && <Ionicons name="arrow-up-circle-outline" size={16} color={Colors.error} />}
                        {!esMenor && !esMayor && <Ionicons name="storefront-outline" size={16} color={Colors.textMuted} />}
                        <View>
                          <Text style={[styles.resultComercio, { color: txtColor }]}>{r.nombre}</Text>
                          {r.nombreProducto && r.nombreProducto.toLowerCase() !== productoModal.toLowerCase() && (
                            <Text style={styles.resultNombreReal}>"{r.nombreProducto}"</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.resultRight}>
                        <Text style={[styles.resultPrecio, { color: txtColor }]}>
                          ${r.precio!.toFixed(2)}
                        </Text>
                        {usdABs(r.precio!) && (
                          <Text style={styles.resultUsd}>{usdABs(r.precio!)}</Text>
                        )}
                        {esMenor && <Text style={styles.resultTag}>Más económico</Text>}
                        {esMayor && <Text style={[styles.resultTag, { color: Colors.error }]}>Más caro</Text>}
                      </View>
                    </View>
                  );
                })
            )}

            <TouchableOpacity style={styles.modalCerrar} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCerrarText}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
  compareBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.blue, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  compareBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },
  body: { padding: Spacing.lg, gap: Spacing.md },

  instruccion: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },

  addRow:        { flexDirection: 'row', gap: Spacing.sm },
  addProductCol: { gap: Spacing.sm },
  addProductRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  addProductBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 13,
  },
  addProductBtnText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  monedaToggle: {
    borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 10,
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', minWidth: 38,
  },
  monedaToggleUSD:     { backgroundColor: Colors.success + '22', borderColor: Colors.success },
  monedaToggleBS:      { backgroundColor: Colors.blue + '22', borderColor: Colors.blue },
  monedaToggleText:    { fontSize: FontSize.sm, fontWeight: '800' },
  monedaToggleTextUSD: { color: Colors.success },
  monedaToggleTextBS:  { color: Colors.blue },
  addInput: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text,
  },
  addBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },

  sugerenciasCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.blue + '55',
    marginTop: 4, overflow: 'hidden',
  },
  sugerenciaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  sugerenciaBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  sugerenciaText:   { fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },

  comerciosChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.card, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipText:  { fontSize: FontSize.xs, fontWeight: '700', color: Colors.blue },
  chipCount: { fontSize: FontSize.xs, color: Colors.textMuted },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  comercioCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  comercioLeft:   { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  comercioIcon:   {
    backgroundColor: Colors.blue + '22', borderRadius: Radius.sm,
    padding: 8, borderWidth: 1, borderColor: Colors.blue + '44',
  },
  comercioNombre: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  comercioSub:    { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  comercioRight:  { flexDirection: 'row', alignItems: 'center', gap: 14 },

  btnComparar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 14,
    marginTop: Spacing.sm,
  },
  btnCompararText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  productoRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  productoNombre: { flex: 1, fontSize: FontSize.md, color: Colors.text, fontWeight: '600' },
  productoPrecio: { fontSize: FontSize.md, fontWeight: '800', color: Colors.blue },
  precioStack:    { alignItems: 'flex-end' },
  precioUsd:      { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginTop: 1 },


  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 36, gap: Spacing.md,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 4 },
  modalTitulo:   { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, textTransform: 'capitalize' },
  modalSubtitulo:{ fontSize: FontSize.sm, color: Colors.textMuted, marginTop: -8 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, gap: 10,
  },
  resultLeft:      { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  resultComercio:  { fontSize: FontSize.md, fontWeight: '800' },
  resultNombreReal:{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  resultRight:     { alignItems: 'flex-end', gap: 2 },
  resultPrecio:    { fontSize: FontSize.lg, fontWeight: '800' },
  resultUsd:       { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  resultTag:       { fontSize: FontSize.xs, fontWeight: '700', color: Colors.success },

  modalCerrar: {
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, marginTop: Spacing.sm,
  },
  modalCerrarText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
}); }
