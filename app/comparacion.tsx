import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, SafeAreaView, ScrollView, Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getItem, setItem } from '@/services/storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

type Producto = { id: string; nombre: string; codigo?: string; precio: string; imagen?: string };
type Comercio = { id: string; nombre: string; productos: Producto[] };
type Vista    = 'lista' | 'comercio' | 'comparar';
type EditState = { comercioId: string; productoId: string; nombre: string; codigo: string; precio: string; moneda: 'usd' | 'bs'; imagen?: string } | null;

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
  const [nuevoCodigo,    setNuevoCodigo]    = useState('');
  const [nuevoPrecio,    setNuevoPrecio]    = useState('');
  const [monedaInput,    setMonedaInput]    = useState<'usd' | 'bs'>('usd');
  const [editState,      setEditState]      = useState<EditState>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerTarget, setScannerTarget]   = useState<'codigo' | 'busqueda'>('codigo');
  const [scanned,        setScanned]        = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [busqueda,       setBusqueda]       = useState('');
  const [modalVisible,   setModalVisible]   = useState(false);
  const [productoModal,  setProductoModal]  = useState('');
  const [tasaBCV,        setTasaBCV]        = useState<number | null>(null);
  const [photoVisible,   setPhotoVisible]   = useState(false);
  const [photoTarget,    setPhotoTarget]    = useState<'nuevo' | 'edit'>('nuevo');
  const [nuevoImagen,    setNuevoImagen]    = useState<string | undefined>(undefined);
  const [fotoAmpliada,   setFotoAmpliada]   = useState<string | undefined>(undefined);
  const [sugerenciasNombre, setSugerenciasNombre] = useState<string[]>([]);
  const [modalInfoVisible,  setModalInfoVisible]  = useState(false);
  const cameraRef = useRef<CameraView>(null);

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

  const exportarDatos = async () => {
    if (comercios.length === 0) {
      Alert.alert('Sin datos', 'No hay comercios para exportar.');
      return;
    }
    try {
      const json = JSON.stringify(comercios, null, 2);
      const uri  = FileSystem.cacheDirectory + 'comparacion_export.json';
      await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' });
      const disponible = await Sharing.isAvailableAsync();
      if (!disponible) {
        Alert.alert('No disponible', 'Tu dispositivo no soporta compartir archivos.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Compartir datos de comercios' });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo exportar los datos.');
    }
  };

  const importarDatos = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri  = result.assets[0].uri;
      const texto = await FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
      const datos: Comercio[] = JSON.parse(texto);
      if (!Array.isArray(datos)) throw new Error();
      Alert.alert(
        'Confirmar importación',
        `Se encontraron ${datos.length} comercio(s). ¿Combinar con los existentes o reemplazar todo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Combinar',
            onPress: () => {
              const combinados = [...comercios];
              for (const c of datos) {
                const existe = combinados.find(e => e.nombre.toLowerCase() === c.nombre.toLowerCase());
                if (!existe) combinados.push(c);
              }
              guardar(combinados);
              Alert.alert('Listo', 'Datos importados y combinados.');
            },
          },
          {
            text: 'Reemplazar',
            style: 'destructive',
            onPress: () => {
              guardar(datos);
              Alert.alert('Listo', 'Datos reemplazados.');
            },
          },
        ]
      );
    } catch {
      Alert.alert('Error', 'No se pudo leer el archivo. Asegúrate de seleccionar el JSON exportado.');
    }
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
      productos: [...c.productos, { id: Date.now().toString(), nombre: nuevoNombre.trim(), codigo: nuevoCodigo.trim() || undefined, precio: precioUSD.toString(), imagen: nuevoImagen }],
    });
    guardar(updated);
    setNuevoNombre(''); setNuevoCodigo(''); setNuevoPrecio(''); setNuevoImagen(undefined);
  };

  const abrirCamara = async (target: 'nuevo' | 'edit') => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Necesitas permitir el acceso a la cámara.');
        return;
      }
    }
    setPhotoTarget(target);
    setPhotoVisible(true);
  };

  const tomarFoto = async () => {
    if (!cameraRef.current) return;
    const foto = await cameraRef.current.takePictureAsync({ quality: 0.5 });
    setPhotoVisible(false);
    if (photoTarget === 'nuevo') {
      setNuevoImagen(foto.uri);
    } else {
      setEditState(s => s ? { ...s, imagen: foto.uri } : s);
    }
  };

  const abrirScanner = async (target: 'codigo' | 'busqueda') => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Necesitas permitir el acceso a la cámara para escanear códigos.');
        return;
      }
    }
    setScannerTarget(target);
    setScanned(false);
    setScannerVisible(true);
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setScannerVisible(false);
    if (scannerTarget === 'codigo') {
      setNuevoCodigo(data);
      // Auto-completar nombre si el código ya existe en cualquier comercio
      const productoExistente = comercios.flatMap(c => c.productos).find(p => p.codigo === data);
      if (productoExistente) {
        if (!nuevoNombre.trim()) setNuevoNombre(productoExistente.nombre);
        if (!nuevoImagen && productoExistente.imagen) setNuevoImagen(productoExistente.imagen);
      }
    } else {
      setBusqueda(data);
      buscarProducto(data);
    }
  };

  const abrirEdicion = (comercioId: string, p: Producto) => {
    setEditState({ comercioId, productoId: p.id, nombre: p.nombre, codigo: p.codigo ?? '', precio: parseFloat(p.precio).toFixed(2), moneda: 'usd', imagen: p.imagen });
  };

  const guardarEdicion = () => {
    if (!editState || !editState.nombre.trim() || !editState.precio.trim()) return;
    const valorRaw = parseFloat(editState.precio.replace(',', '.'));
    if (isNaN(valorRaw) || valorRaw <= 0) return;
    const precioUSD = editState.moneda === 'bs' && tasaBCV && tasaBCV > 0
      ? valorRaw / tasaBCV
      : valorRaw;
    guardar(comercios.map(c => c.id !== editState.comercioId ? c : {
      ...c,
      productos: c.productos.map(p => p.id !== editState.productoId ? p : {
        ...p, nombre: editState.nombre.trim(), codigo: editState.codigo.trim() || undefined, precio: precioUSD.toString(), imagen: editState.imagen,
      }),
    }));
    setEditState(null);
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

  // Sugerencias: busca por nombre O por código de barras
  const sugerencias: { nombre: string; porCodigo: boolean }[] = busqueda.trim().length > 0
    ? Array.from(
        new Map(
          comercios.flatMap(c => c.productos).reduce<[string, { nombre: string; porCodigo: boolean }][]>((acc, p) => {
            const term = busqueda.toLowerCase().trim();
            const porNombre = p.nombre.toLowerCase().includes(term);
            const porCodigo = !!p.codigo && p.codigo.toLowerCase().includes(term);
            if ((porNombre || porCodigo) && !acc.some(([k]) => k === p.nombre)) {
              acc.push([p.nombre, { nombre: p.nombre, porCodigo: !porNombre && porCodigo }]);
            }
            return acc;
          }, [])
        ).values()
      )
    : [];

  // Precios del producto buscado en todos los comercios (por nombre o código)
  const resultadosBusqueda = () => {
    const term = productoModal.toLowerCase().trim();
    return comercios.map(c => {
      const prod = c.productos.find(p =>
        p.nombre.toLowerCase().includes(term) ||
        (!!p.codigo && p.codigo.toLowerCase().includes(term))
      );
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
          <TouchableOpacity onPress={() => setModalInfoVisible(true)} style={styles.backBtn}>
            <Ionicons name="information-circle-outline" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
          {comercios.length >= 2 && (
            <TouchableOpacity style={styles.compareBtn} onPress={() => setVista('comparar')}>
              <Ionicons name="bar-chart-outline" size={16} color="#fff" />
              <Text style={styles.compareBtnText}>Comparar</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.transferInfo}>
            <Ionicons name="people-outline" size={15} color={Colors.textMuted} />
            <Text style={styles.transferInfoText}>Comparte los datos con tu familia</Text>
          </View>

          <View style={styles.transferRow}>
            <TouchableOpacity style={styles.transferBtn} onPress={exportarDatos}>
              <Ionicons name="share-outline" size={17} color={Colors.accent} />
              <Text style={styles.transferBtnText}>Exportar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.transferBtn} onPress={importarDatos}>
              <Ionicons name="download-outline" size={17} color={Colors.accent} />
              <Text style={styles.transferBtnText}>Importar</Text>
            </TouchableOpacity>
          </View>

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
            <View style={styles.guiaCard}>
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Ionicons name="storefront-outline" size={52} color={Colors.textMuted} />
                <Text style={styles.guiaTituloMain}>Compara precios entre comercios</Text>
                <Text style={styles.guiaDescMain}>
                  Agrega los locales donde compras habitualmente, registra los productos con su precio en $ o Bs y la app te muestra al instante dónde sale más barato cada uno.{'\n\n'}
                  Con 2 o más comercios activa "Comparar" para ver de un vistazo cuál local te conviene más para toda tu lista.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm, opacity: 0.5 }}>
                  <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>Toca el ícono de información para más detalles</Text>
                </View>
              </View>
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

        {/* Modal información del módulo */}
        <Modal transparent visible={modalInfoVisible} animationType="slide" onRequestClose={() => setModalInfoVisible(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setModalInfoVisible(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="bar-chart-outline" size={22} color={Colors.blue} />
                <Text style={styles.modalTitulo}>¿Cómo funciona Mercado?</Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="storefront-outline" size={18} color={Colors.blue} />
                <Text style={styles.infoText}>
                  <Text style={styles.infoBold}>Agrega comercios</Text> — registra los supermercados o tiendas donde haces tus compras (ej: Rio, Mercafur, Bicentenario).
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="pricetag-outline" size={18} color={Colors.blue} />
                <Text style={styles.infoText}>
                  <Text style={styles.infoBold}>Registra productos</Text> — dentro de cada comercio anota los precios en $ o Bs. Puedes escanear el código de barras y tomar foto del producto.
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="trophy-outline" size={18} color={Colors.success} />
                <Text style={styles.infoText}>
                  <Text style={styles.infoBold}>Compara precios</Text> — busca un producto y ve al instante en qué local sale más barato y dónde te cobran más.
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="share-outline" size={18} color={Colors.accent} />
                <Text style={styles.infoText}>
                  <Text style={styles.infoBold}>Comparte con tu familia</Text> — exporta tus datos e importa los de otro familiar para tener una lista de precios compartida.
                </Text>
              </View>

              <TouchableOpacity style={styles.modalCerrar} onPress={() => setModalInfoVisible(false)}>
                <Text style={styles.modalCerrarText}>Entendido</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

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
            {/* Fila 1: Código de barras + escáner */}
            <View style={styles.addRow}>
              <View style={styles.inputWithClear}>
                <TextInput
                  style={styles.addInputFlex}
                  value={nuevoCodigo}
                  onChangeText={setNuevoCodigo}
                  placeholder="Código de barras (opcional)…"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  returnKeyType="next"
                />
                {nuevoCodigo.length > 0 && (
                  <TouchableOpacity onPress={() => setNuevoCodigo('')} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.scanBtn} onPress={() => abrirScanner('codigo')}>
                <Ionicons name="barcode-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Fila 2: Título producto + cámara */}
            <View style={styles.addRow}>
              <TextInput
                style={styles.addInput}
                value={nuevoNombre}
                onChangeText={t => {
                  setNuevoNombre(t);
                  if (t.trim().length > 0) {
                    const term = t.toLowerCase().trim();
                    const todos = Array.from(new Set(
                      comercios.flatMap(c => c.productos.map(p => p.nombre))
                    )).filter(n => n.toLowerCase().includes(term) && n.toLowerCase() !== term);
                    setSugerenciasNombre(todos.slice(0, 6));
                  } else {
                    setSugerenciasNombre([]);
                  }
                }}
                placeholder="Título del producto…"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
              />
              <TouchableOpacity
                style={[styles.scanBtn, nuevoImagen && styles.iconBtnSuccess]}
                onPress={() => nuevoImagen ? setFotoAmpliada(nuevoImagen) : abrirCamara('nuevo')}
              >
                {nuevoImagen
                  ? <Image source={{ uri: nuevoImagen }} style={styles.iconBtnThumb} />
                  : <Ionicons name="camera-outline" size={22} color="#fff" />
                }
              </TouchableOpacity>
            </View>
            {/* Sugerencias nombre */}
            {sugerenciasNombre.length > 0 && (
              <View style={styles.sugerenciasCard}>
                {sugerenciasNombre.map((s, i) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sugerenciaItem, i < sugerenciasNombre.length - 1 && styles.sugerenciaBorder]}
                    onPress={() => { setNuevoNombre(s); setSugerenciasNombre([]); }}
                  >
                    <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.sugerenciaText}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Fila 3: Valor + $/Bs + agregar */}
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
              <TouchableOpacity style={styles.addProductBtn} onPress={agregarProducto}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
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
                    {p.imagen && (
                      <TouchableOpacity onPress={() => setFotoAmpliada(p.imagen)}>
                        <Image source={{ uri: p.imagen }} style={styles.productoThumb} />
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productoNombre} numberOfLines={1}>{p.nombre}</Text>
                      {p.codigo ? <Text style={styles.productoCodigo} numberOfLines={1}>{p.codigo}</Text> : null}
                    </View>
                    <View style={styles.precioStack}>
                      <Text style={styles.productoPrecio}>
                        ${usdNum.toFixed(2)}
                      </Text>
                      {bs && <Text style={styles.precioUsd}>{bs}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => abrirEdicion(comercio.id, p)} style={styles.editInlineBtn}>
                      <Ionicons name="pencil-outline" size={15} color={Colors.blue} />
                      <Text style={styles.editInlineBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => eliminarProducto(comercio.id, p.id)} hitSlop={12}>
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>

        {/* Modal escáner — vista comercio */}
        <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
          <View style={styles.scannerContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerTopArea} />
              <View style={styles.scannerMiddle}>
                <View style={styles.scannerSide} />
                <View style={styles.scannerFrame}>
                  <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
                  <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
                </View>
                <View style={styles.scannerSide} />
              </View>
              <View style={styles.scannerBottomArea}>
                <Text style={styles.scannerHint}>Apunta al código de barras del producto</Text>
                <TouchableOpacity style={styles.scannerCancelBtn} onPress={() => setScannerVisible(false)}>
                  <Text style={styles.scannerCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal cámara para foto */}
        <Modal visible={photoVisible} animationType="slide" onRequestClose={() => setPhotoVisible(false)}>
          <View style={styles.scannerContainer}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="back" />
            <View style={styles.scannerOverlay}>
              <View style={{ flex: 1 }} />
              <View style={styles.photoBottomArea}>
                <TouchableOpacity style={styles.photoShutterBtn} onPress={tomarFoto}>
                  <View style={styles.photoShutterInner} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.scannerCancelBtn} onPress={() => setPhotoVisible(false)}>
                  <Text style={styles.scannerCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Modal editar producto */}
        <Modal transparent visible={editState !== null} animationType="slide" onRequestClose={() => setEditState(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setEditState(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitulo}>Editar producto</Text>

              <TextInput
                style={[styles.addInput, { flex: 0 }]}
                value={editState?.codigo ?? ''}
                onChangeText={v => setEditState(s => s ? { ...s, codigo: v } : s)}
                placeholder="Código de barras (opcional)…"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                returnKeyType="next"
              />
              <TextInput
                style={[styles.addInput, { flex: 0 }]}
                value={editState?.nombre ?? ''}
                onChangeText={v => setEditState(s => s ? { ...s, nombre: v } : s)}
                placeholder="Título del producto…"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
              />

              {/* Foto edición */}
              <View style={styles.addRow}>
                <TouchableOpacity style={styles.fotoBtn} onPress={() => abrirCamara('edit')}>
                  <Ionicons name="camera-outline" size={20} color={editState?.imagen ? Colors.success : Colors.blue} />
                  <Text style={[styles.fotoBtnText, editState?.imagen ? { color: Colors.success } : {}]}>
                    {editState?.imagen ? 'Cambiar foto' : 'Tomar foto'}
                  </Text>
                </TouchableOpacity>
                {editState?.imagen && (
                  <TouchableOpacity onPress={() => setFotoAmpliada(editState?.imagen)}>
                    <Image source={{ uri: editState.imagen }} style={styles.fotoThumb} />
                  </TouchableOpacity>
                )}
                {editState?.imagen && (
                  <TouchableOpacity onPress={() => setEditState(s => s ? { ...s, imagen: undefined } : s)} hitSlop={12}>
                    <Ionicons name="close-circle" size={20} color={Colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.addProductRow}>
                <TextInput
                  style={[styles.addInput, { flex: 1 }]}
                  value={editState?.precio ?? ''}
                  onChangeText={v => setEditState(s => s ? { ...s, precio: v } : s)}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  onSubmitEditing={guardarEdicion}
                />
                <TouchableOpacity
                  style={[styles.monedaToggle, (editState?.moneda ?? 'usd') === 'usd' ? styles.monedaToggleUSD : styles.monedaToggleBS]}
                  onPress={() => setEditState(s => s ? { ...s, moneda: s.moneda === 'usd' ? 'bs' : 'usd', precio: '' } : s)}
                >
                  <Text style={[styles.monedaToggleText, (editState?.moneda ?? 'usd') === 'usd' ? styles.monedaToggleTextUSD : styles.monedaToggleTextBS]}>
                    {(editState?.moneda ?? 'usd') === 'usd' ? '$' : 'Bs'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.editBtns}>
                <TouchableOpacity style={[styles.editBtn, styles.editBtnCancel]} onPress={() => setEditState(null)}>
                  <Text style={styles.editBtnCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editBtn, styles.editBtnSave]} onPress={guardarEdicion}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.editBtnSaveText}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Modal foto ampliada */}
        <Modal visible={!!fotoAmpliada} animationType="fade" transparent onRequestClose={() => setFotoAmpliada(undefined)}>
          <Pressable style={styles.fotoOverlay} onPress={() => setFotoAmpliada(undefined)}>
            <Image source={{ uri: fotoAmpliada }} style={styles.fotoAmpliada} resizeMode="contain" />
            <TouchableOpacity style={styles.fotoCerrarBtn} onPress={() => setFotoAmpliada(undefined)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>
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
            <View style={styles.inputWithClear}>
              <TextInput
                style={styles.addInputFlex}
                value={busqueda}
                onChangeText={setBusqueda}
                placeholder="Ej: mantequilla, arroz, leche…"
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={() => buscarProducto()}
                returnKeyType="search"
              />
              {busqueda.length > 0 && (
                <TouchableOpacity onPress={() => setBusqueda('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={() => buscarProducto()}>
              <Ionicons name="search" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.scanBtn} onPress={() => abrirScanner('busqueda')}>
              <Ionicons name="barcode-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {sugerencias.length > 0 && (
            <View style={styles.sugerenciasCard}>
              {sugerencias.map((s, i) => (
                <TouchableOpacity
                  key={s.nombre}
                  style={[styles.sugerenciaItem, i < sugerencias.length - 1 && styles.sugerenciaBorder]}
                  onPress={() => buscarProducto(s.nombre)}
                >
                  <Ionicons name={s.porCodigo ? 'barcode-outline' : 'search-outline'} size={14} color={Colors.textMuted} />
                  <Text style={styles.sugerenciaText}>{s.nombre}</Text>
                  {s.porCodigo && <Text style={styles.sugerenciaCodigo}>por código</Text>}
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

      {/* Modal escáner de código de barras */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
          />
          {/* Overlay con marco */}
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTopArea} />
            <View style={styles.scannerMiddle}>
              <View style={styles.scannerSide} />
              <View style={styles.scannerFrame}>
                <View style={[styles.scannerCorner, styles.scannerCornerTL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerTR]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBL]} />
                <View style={[styles.scannerCorner, styles.scannerCornerBR]} />
              </View>
              <View style={styles.scannerSide} />
            </View>
            <View style={styles.scannerBottomArea}>
              <Text style={styles.scannerHint}>Apunta al código de barras del producto</Text>
              <TouchableOpacity style={styles.scannerCancelBtn} onPress={() => setScannerVisible(false)}>
                <Text style={styles.scannerCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  backBtn: { padding: 4 },
  transferInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transferInfoText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  transferRow: { flexDirection: 'row', gap: Spacing.sm },
  transferBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent + '18', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent + '44',
    paddingVertical: 11,
  },
  transferBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.accent },
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
  addProductRow: { flexDirection: 'row', gap: Spacing.sm },
  addProductBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },
  addProductBtnText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  iconBtn: {
    borderRadius: Radius.md, width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  iconBtnBlue:    { backgroundColor: Colors.blue },
  iconBtnSuccess: { backgroundColor: Colors.success },
  iconBtnError:   { backgroundColor: Colors.error, borderRadius: Radius.md, width: 36, height: 44, justifyContent: 'center', alignItems: 'center' },
  iconBtnThumb:   { width: 44, height: 44, borderRadius: Radius.md },

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
  inputWithClear: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  addInputFlex: {
    flex: 1, paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text,
  },
  clearBtn: {
    paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center',
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
  sugerenciaText:   { flex: 1, fontSize: FontSize.md, color: Colors.text, fontWeight: '500' },
  sugerenciaCodigo: { fontSize: FontSize.xs, color: Colors.blue, fontWeight: '600' },

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
  productoNombre: { fontSize: FontSize.md, color: Colors.text, fontWeight: '600' },
  productoCodigo: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },
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

  editInlineBtn:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.blue + '55', backgroundColor: Colors.blue + '11' },
  editInlineBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.blue },

  scanBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },

  // Scanner
  scannerContainer:   { flex: 1, backgroundColor: '#000' },
  scannerOverlay:     { ...StyleSheet.absoluteFillObject as any, flexDirection: 'column' },
  scannerTopArea:     { flex: 1, backgroundColor: '#00000088' },
  scannerMiddle:      { flexDirection: 'row', height: 220 },
  scannerSide:        { flex: 1, backgroundColor: '#00000088' },
  scannerFrame: {
    width: 260, height: 220,
    borderWidth: 0, backgroundColor: 'transparent',
  },
  scannerCorner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: '#fff', borderWidth: 3,
  },
  scannerCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  scannerCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  scannerCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  scannerCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  scannerBottomArea: {
    flex: 1, backgroundColor: '#00000088',
    alignItems: 'center', justifyContent: 'center', gap: 20, paddingTop: 24,
  },
  scannerHint:       { fontSize: FontSize.md, color: '#fff', fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
  scannerCancelBtn:  {
    backgroundColor: '#ffffff22', borderRadius: Radius.md,
    paddingHorizontal: 32, paddingVertical: 13,
    borderWidth: 1, borderColor: '#ffffff44',
  },
  scannerCancelText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },

  fotoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.blue + '18', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.blue + '44',
    paddingHorizontal: Spacing.md, paddingVertical: 11,
  },
  fotoBtnText:       { fontSize: FontSize.sm, fontWeight: '700', color: Colors.blue },
  fotoThumb:         { width: 44, height: 44, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  productoThumb:     { width: 38, height: 38, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },

  fotoOverlay: {
    flex: 1, backgroundColor: '#000000DD',
    alignItems: 'center', justifyContent: 'center',
  },
  fotoAmpliada: { width: '100%', height: '80%' },
  fotoCerrarBtn: {
    position: 'absolute', top: 52, right: 20,
    backgroundColor: '#ffffff22', borderRadius: 20,
    padding: 8, borderWidth: 1, borderColor: '#ffffff44',
  },

  photoBottomArea: {
    paddingBottom: 48, paddingTop: 24,
    backgroundColor: '#00000088', alignItems: 'center', gap: 24,
  },
  photoShutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  photoShutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  guiaCard: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border + '55',
    padding: Spacing.lg, gap: Spacing.md,
    opacity: 0.95, marginTop: Spacing.xl,
  },
  guiaStep:    { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  guiaNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.blue + '22', borderWidth: 1, borderColor: Colors.blue + '55',
    alignItems: 'center', justifyContent: 'center',
  },
  guiaNumText: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.blue },
  guiaInfo:    { flex: 1, gap: 3 },
  guiaTituloMain: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  guiaDescMain:   { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  guiaTitulo:  { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  guiaDesc:    { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  guiaDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 42 },

  infoRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  infoBold: { fontWeight: '800', color: Colors.text },

  editBtns:         { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  editBtn:          { flex: 1, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  editBtnCancel:    { backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border },
  editBtnCancelText:{ fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
  editBtnSave:      { backgroundColor: Colors.blue },
  editBtnSaveText:  { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },
}); }
