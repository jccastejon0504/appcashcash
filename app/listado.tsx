import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, Alert, Modal, Pressable, TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getItem, setItem } from '@/services/storage';

type ItemMercado = {
  id: string;
  nombre: string;
  cantidad: number;
  checked: boolean;
};

type ListaAgendada = {
  id: string;
  nombre: string;
  fecha: string;
  items: ItemMercado[];
};

type Producto = { id: string; nombre: string; precio: string };
type Comercio = { id: string; nombre: string; productos: Producto[] };

const CACHE_KEY       = 'listado_mercado';
const AGENDADAS_KEY   = 'listas_agendadas';
const COMPARACION_KEY = 'comparacion_data';
const BCV_CACHE_KEY   = 'bcv_cache';

export default function ListadoMercadoScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const [items,          setItems]          = useState<ItemMercado[]>([]);
  const [comercios,      setComercios]      = useState<Comercio[]>([]);
  const [nuevo,          setNuevo]          = useState('');
  const [cantidad,       setCantidad]       = useState('');
  const [guardado,       setGuardado]       = useState(false);
  const [agendadas,      setAgendadas]      = useState<ListaAgendada[]>([]);
  const [tasaBCV,        setTasaBCV]        = useState<number | null>(null);
  const [modalVisible,   setModalVisible]   = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date());
  const [showPicker,     setShowPicker]     = useState(false);
  const [seccionVisible,    setSeccionVisible]    = useState(true);
  const [expandidaId,       setExpandidaId]       = useState<string | null>(null);
  const [modalComercios,    setModalComercios]    = useState(false);

  useEffect(() => {
    (async () => {
      const saved      = await getItem<ItemMercado[]>(CACHE_KEY);
      const compData   = await getItem<Comercio[]>(COMPARACION_KEY);
      const agendaData = await getItem<ListaAgendada[]>(AGENDADAS_KEY);
      const bcvCache   = await getItem<{ usd: number }>(BCV_CACHE_KEY);
      if (saved)      setItems(saved);
      if (compData)   setComercios(compData);
      if (agendaData) setAgendadas(agendaData);
      if (bcvCache)   setTasaBCV(bcvCache.usd);
    })();
  }, []);

  const guardar = async (data: ItemMercado[]) => {
    setItems(data);
    await setItem(CACHE_KEY, data);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 1500);
  };

  const agregar = () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const term = nombre.toLowerCase();
    const existe = comercios.some(c =>
      c.productos.some(p => p.nombre.toLowerCase().includes(term))
    );
    if (!existe) {
      Alert.alert('Producto no existente', `"${nombre}" no está registrado en ningún comercio.`);
      return;
    }
    const cant = Math.max(1, parseInt(cantidad, 10) || 1);
    const nuevaLista = [...items, { id: Date.now().toString(), nombre, cantidad: cant, checked: false }];
    setItems(nuevaLista);
    setNuevo('');
    setCantidad('');
  };

  const toggleCheck = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const todosChecked = items.length > 0 && items.every(i => i.checked);

  const toggleTodos = () => {
    setItems(prev => prev.map(i => ({ ...i, checked: !todosChecked })));
  };

  const eliminarTodos = () => {
    Alert.alert('Eliminar todo', '¿Quitar todos los productos de la lista?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar todo', style: 'destructive', onPress: () => setItems([]) },
    ]);
  };

  const eliminar = (id: string) => {
    Alert.alert('Eliminar', '¿Quitar este producto de la lista?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => setItems(prev => prev.filter(i => i.id !== id)) },
    ]);
  };

  // ── Agendar lista ─────────────────────────────────────────────────────────
  const abrirModalAgendar = () => {
    setFechaSeleccionada(new Date());
    setShowPicker(false);
    setModalVisible(true);
  };

  const nombreDeFecha = (fecha: Date) =>
    `Lista del ${fecha.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const confirmarAgendar = async () => {
    const nombre = nombreDeFecha(fechaSeleccionada);
    const nueva: ListaAgendada = {
      id:    Date.now().toString(),
      nombre,
      fecha: fechaSeleccionada.toISOString(),
      items: items.map(i => ({ ...i, checked: false })),
    };
    const actualizadas = [nueva, ...agendadas];
    setAgendadas(actualizadas);
    await setItem(AGENDADAS_KEY, actualizadas);
    setItems([]);
    await setItem(CACHE_KEY, []);
    setModalVisible(false);
    setSeccionVisible(true);
    setExpandidaId(nueva.id);
  };

  const toggleExpandida = (id: string) => {
    setExpandidaId(prev => prev === id ? null : id);
  };

  const eliminarAgendada = (id: string) => {
    Alert.alert('Eliminar lista', '¿Borrar esta lista agendada?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive',
        onPress: async () => {
          const filtradas = agendadas.filter(l => l.id !== id);
          setAgendadas(filtradas);
          await setItem(AGENDADAS_KEY, filtradas);
        },
      },
    ]);
  };

  // ── Compra realizada ──────────────────────────────────────────────────────
  const compraRealizada = () => {
    Alert.alert(
      'Compra realizada',
      '¿Borrar la lista? Esto indica que ya compraste todos los productos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, borrar lista', style: 'destructive',
          onPress: async () => {
            setItems([]);
            await setItem(CACHE_KEY, []);
          },
        },
      ]
    );
  };

  // Resumen de toda la lista agrupado por comercio
  const resumenPorComercio = () => {
    return comercios.map(c => {
      const detalle = items.map(item => {
        const term = item.nombre.toLowerCase().trim();
        const prod = c.productos.find(p => p.nombre.toLowerCase().includes(term));
        const precioUnit = prod ? parseFloat(prod.precio) : null;
        const cant = item.cantidad ?? 1;
        const precio = precioUnit !== null ? precioUnit * cant : null;
        return { nombre: item.nombre, cantidad: cant, precioUnit, precio };
      });
      const totalUSD = detalle.reduce((acc, d) => acc + (d.precio ?? 0), 0);
      const disponibles = detalle.filter(d => d.precio !== null).length;
      return { comercio: c.nombre, detalle, totalUSD, disponibles };
    }).filter(r => r.disponibles > 0)
      .sort((a, b) => b.disponibles - a.disponibles || a.totalUSD - b.totalUSD);
  };

  const usdABs = (usd: number) =>
    tasaBCV && tasaBCV > 0
      ? `Bs ${(usd * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  // ── Precio más bajo ───────────────────────────────────────────────────────
  const getMejorPrecio = (nombre: string) => {
    const resultados: { comercio: string; precio: number }[] = [];
    const term = nombre.toLowerCase().trim();
    for (const c of comercios) {
      const prod = c.productos.find(p => p.nombre.toLowerCase().includes(term));
      if (prod) {
        const precio = parseFloat(prod.precio);
        if (!isNaN(precio) && precio > 0) resultados.push({ comercio: c.nombre, precio });
      }
    }
    if (resultados.length === 0) return null;
    return resultados.reduce((min, r) => r.precio < min.precio ? r : min);
  };

  const pendientes = items.filter(i => !i.checked).length;

  const sugerencias = nuevo.trim().length > 0
    ? Array.from(new Set(
        comercios.flatMap(c => c.productos.map(p => p.nombre))
      )).filter(nombre => nombre.toLowerCase().includes(nuevo.toLowerCase().trim()))
    : [];

  const formatFecha = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-VE', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    } catch { return iso; }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.navigate('/')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compras / Presupuesto</Text>
        {pendientes > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendientes}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Agregar item */}
        <View>
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={nuevo}
              onChangeText={setNuevo}
              placeholder="Agregar producto…"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={agregar}
              returnKeyType="done"
            />
            <TextInput
              style={styles.addCantidad}
              value={cantidad}
              onChangeText={text => setCantidad(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Can"
              placeholderTextColor={Colors.textMuted}
              maxLength={3}
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addBtn} onPress={agregar}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {sugerencias.length > 0 && (
            <View style={styles.sugerenciasCard}>
              {sugerencias.map((s, i) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sugerenciaItem, i < sugerencias.length - 1 && styles.sugerenciaBorder]}
                  onPress={() => { setNuevo(s); }}
                >
                  <Ionicons name="search-outline" size={14} color={Colors.textMuted} />
                  <Text style={styles.sugerenciaText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Listas agendadas */}
        {agendadas.length > 0 && (
          <View style={styles.agendaSection}>
            <TouchableOpacity style={styles.agendaHeader} onPress={() => setSeccionVisible(v => !v)}>
              <Ionicons name="calendar-outline" size={16} color={Colors.blue} />
              <Text style={styles.agendaHeaderText}>Listas agendadas ({agendadas.length})</Text>
              <Ionicons name={seccionVisible ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {seccionVisible && agendadas.map(lista => {
              const expandida = expandidaId === lista.id;
              return (
                <View key={lista.id}>
                  {/* Fila de la lista */}
                  <TouchableOpacity style={styles.agendaItem} onPress={() => toggleExpandida(lista.id)} activeOpacity={0.7}>
                    <Ionicons
                      name={expandida ? 'chevron-down' : 'chevron-forward'}
                      size={14} color={Colors.textMuted}
                    />
                    <View style={styles.agendaInfo}>
                      <Text style={styles.agendaNombre} numberOfLines={1}>{lista.nombre}</Text>
                      <Text style={styles.agendaFecha}>
                        {formatFecha(lista.fecha)} · {lista.items.length} productos
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.agendaEliminar} onPress={() => eliminarAgendada(lista.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={Colors.error} />
                    </TouchableOpacity>
                  </TouchableOpacity>

                  {/* Productos desplegados */}
                  {expandida && (
                    <View style={styles.productosExpandidos}>
                      {lista.items.length === 0 ? (
                        <Text style={styles.sinProductosText}>Sin productos</Text>
                      ) : (
                        lista.items.map((item, idx) => (
                          <View
                            key={item.id}
                            style={[styles.productoFila, idx < lista.items.length - 1 && styles.productoFilaBorder]}
                          >
                            <Ionicons name="ellipse" size={7} color={Colors.blue} />
                            <Text style={styles.productoNombre}>{item.nombre}</Text>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Tabla encabezado */}
        {items.length > 0 && (
          <View style={styles.tablaHeader}>
            <TouchableOpacity style={styles.colCheck} onPress={toggleTodos}>
              <View style={[styles.checkbox, todosChecked && styles.checkboxChecked]}>
                {todosChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
            <Text style={[styles.colHeaderText, styles.colProducto]}>Producto</Text>
            <Text style={[styles.colHeaderText, styles.colPrecio]}>Más económico</Text>
            <TouchableOpacity style={styles.colAccion} onPress={eliminarTodos} hitSlop={10}>
              <Ionicons name="trash-outline" size={17} color={Colors.error} />
            </TouchableOpacity>
          </View>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={52} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>Lista vacía</Text>
            <Text style={styles.emptyText}>Agrega los productos que necesitas comprar</Text>
          </View>
        ) : (
          items.map(item => {
            const mejor = getMejorPrecio(item.nombre);
            return (
              <View key={item.id} style={[styles.itemRow, item.checked && styles.itemRowChecked]}>
                <TouchableOpacity style={styles.colCheck} onPress={() => toggleCheck(item.id)}>
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                    {item.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>
                <View style={[styles.colProducto, { justifyContent: 'center' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.itemNombre, item.checked && styles.itemNombreChecked]} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                    <Text style={styles.itemCantidad}>x{item.cantidad ?? 1}</Text>
                  </View>
                </View>
                <View style={styles.colPrecio}>
                  {mejor ? (
                    <>
                      <Text style={styles.precioMonto}>
                        ${(mejor.precio * (item.cantidad ?? 1)).toFixed(2)}
                      </Text>
                      {usdABs(mejor.precio * (item.cantidad ?? 1)) && (
                        <Text style={styles.precioUsd}>{usdABs(mejor.precio * (item.cantidad ?? 1))}</Text>
                      )}
                      <View style={styles.localChip}>
                        <Ionicons name="storefront-outline" size={10} color={Colors.success} />
                        <Text style={styles.localText} numberOfLines={1}>{mejor.comercio}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.sinPrecio}>—</Text>
                  )}
                </View>
                <TouchableOpacity style={styles.colAccion} onPress={() => eliminar(item.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={17} color={Colors.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Resumen + Total */}
        {items.length > 0 && (() => {
          const totalUSD = items.reduce((acc, item) => {
            const mejor = getMejorPrecio(item.nombre);
            return acc + (mejor ? mejor.precio * (item.cantidad ?? 1) : 0);
          }, 0);
          const totalBs = usdABs(totalUSD);
          const porComercio = resumenPorComercio();
          const minTotal = porComercio.length > 0 ? Math.min(...porComercio.map(r => r.totalUSD)) : null;
          return (
            <>
              {/* Bloque mejor precio posible */}
              {totalUSD > 0 && (
                <View style={styles.totalCard}>
                  <View style={styles.resumen}>
                    <Text style={styles.resumenText}>
                      {items.filter(i => i.checked).length} de {items.length} marcados
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="trophy" size={14} color={Colors.success} />
                      <Text style={styles.totalLabel}>Mejor precio posible</Text>
                    </View>
                    <View style={styles.totalPrecios}>
                      <Text style={styles.totalUSD}>${totalUSD.toFixed(2)}</Text>
                      {totalBs && <Text style={styles.totalBs}>{totalBs}</Text>}
                    </View>
                  </View>
                </View>
              )}

              {/* Botón comparar por comercio */}
              {comercios.length > 0 && (
                <TouchableOpacity style={styles.btnPorComercio} onPress={() => setModalComercios(true)}>
                  <Ionicons name="storefront-outline" size={18} color={Colors.blue} />
                  <Text style={styles.btnPorComercioText}>Ver precio total por comercio</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.blue} />
                </TouchableOpacity>
              )}

            </>
          );
        })()}
      </ScrollView>

      {/* Footer con botones */}
      {items.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            {/* Guardar */}
            <TouchableOpacity style={[styles.btnGuardar, guardado && styles.btnGuardado]} onPress={() => guardar(items)}>
              <Ionicons name={guardado ? 'checkmark-circle-outline' : 'save-outline'} size={18} color="#fff" />
              <Text style={styles.btnGuardarText}>{guardado ? 'Guardado' : 'Guardar'}</Text>
            </TouchableOpacity>

            {/* Agendar */}
            <TouchableOpacity style={styles.btnAgendar} onPress={abrirModalAgendar}>
              <Ionicons name="calendar-outline" size={18} color={Colors.blue} />
              <Text style={styles.btnAgendarText}>Agendar</Text>
            </TouchableOpacity>

            {/* Compra realizada */}
            <TouchableOpacity style={styles.btnComprado} onPress={compraRealizada}>
              <Ionicons name="bag-check-outline" size={18} color="#fff" />
              <Text style={styles.btnCompradoText}>Comprado</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal: seleccionar fecha para agendar */}
      <Modal transparent visible={modalVisible} animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons name="calendar-outline" size={20} color={Colors.blue} />
              <Text style={styles.modalTitle}>Agendar lista</Text>
            </View>
            <Text style={styles.modalSubtitle}>Selecciona el día de la compra</Text>

            {/* Fecha seleccionada */}
            <TouchableOpacity style={styles.fechaBtn} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar" size={18} color={Colors.blue} />
              <Text style={styles.fechaBtnText}>{nombreDeFecha(fechaSeleccionada)}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Calendario nativo */}
            {showPicker && (
              <DateTimePicker
                value={fechaSeleccionada}
                mode="date"
                display="calendar"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowPicker(false);
                  if (date) setFechaSeleccionada(date);
                }}
              />
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnConfirm} onPress={confirmarAgendar}>
                <Ionicons name="calendar-outline" size={16} color="#fff" />
                <Text style={styles.modalBtnConfirmText}>Agendar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal: precio total por comercio */}
      <Modal transparent visible={modalComercios} animationType="slide" onRequestClose={() => setModalComercios(false)}>
        <View style={styles.mcOverlay}>
          <Pressable style={styles.mcDismiss} onPress={() => setModalComercios(false)} />
          <View style={styles.modalComerciosCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalComerciosTitulo}>Precio total por comercio</Text>
            <Text style={styles.modalComerciosSubtitulo}>
              Cuánto costaría comprar tu lista completa en cada local
            </Text>

            {/* Mejor precio posible */}
            {(() => {
              const totalUSD = items.reduce((acc, item) => {
                const mejor = getMejorPrecio(item.nombre);
                return acc + (mejor ? mejor.precio * (item.cantidad ?? 1) : 0);
              }, 0);
              if (totalUSD === 0) return null;
              return (
                <View style={styles.mcMejorBloque}>
                  <View style={styles.mcMejorLeft}>
                    <Ionicons name="trophy" size={18} color={Colors.success} />
                    <Text style={styles.mcMejorLabel}>Mejor precio posible</Text>
                  </View>
                  <View style={styles.totalPrecios}>
                    <Text style={styles.mcMejorUSD}>${totalUSD.toFixed(2)}</Text>
                    {usdABs(totalUSD) && <Text style={styles.mcMejorBs}>{usdABs(totalUSD)}</Text>}
                  </View>
                </View>
              );
            })()}

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Spacing.md }}>
              {(() => {
                const resultados = resumenPorComercio();
                if (resultados.length === 0) {
                  return (
                    <View style={styles.mcEmpty}>
                      <Ionicons name="alert-circle-outline" size={36} color={Colors.textMuted} />
                      <Text style={styles.mcEmptyText}>
                        Ningún comercio tiene productos de tu lista
                      </Text>
                    </View>
                  );
                }
                const minTotal = Math.min(...resultados.map(r => r.totalUSD));
                return resultados.map((r, idx) => {
                  const esMasBarato = r.totalUSD === minTotal && resultados.length > 1;
                  return (
                    <View key={r.comercio} style={[styles.mcComercioCard, esMasBarato && styles.mcComercioCardWin]}>
                      {/* Cabecera del comercio */}
                      <View style={styles.mcComercioHeader}>
                        <View style={styles.mcComercioLeft}>
                          {esMasBarato && <Ionicons name="trophy" size={16} color={Colors.success} />}
                          <Ionicons name="storefront-outline" size={16} color={esMasBarato ? Colors.success : Colors.blue} />
                          <Text style={[styles.mcComercioNombre, esMasBarato && { color: Colors.success }]}>
                            {r.comercio}
                          </Text>
                        </View>
                        <Text style={styles.mcDisponibles}>
                          {r.disponibles}/{items.length} productos
                        </Text>
                      </View>

                      {/* Detalle productos */}
                      {r.detalle.map(d => (
                        <View key={d.nombre} style={styles.mcProductoFila}>
                          <Ionicons
                            name={d.precio !== null ? 'checkmark-circle' : 'close-circle-outline'}
                            size={14}
                            color={d.precio !== null ? Colors.success : Colors.textMuted}
                          />
                          <Text style={[styles.mcProductoNombre, d.precio === null && styles.mcProductoNoDisp]} numberOfLines={1}>
                            {d.nombre}{d.cantidad > 1 ? ` x${d.cantidad}` : ''}
                          </Text>
                          {d.precio !== null ? (
                            <View style={styles.mcProductoPrecioCol}>
                              <Text style={styles.mcProductoPrecio}>${d.precio.toFixed(2)}</Text>
                              {usdABs(d.precio) && <Text style={styles.mcProductoBs}>{usdABs(d.precio)}</Text>}
                            </View>
                          ) : (
                            <Text style={styles.mcNoDisp}>No disponible</Text>
                          )}
                        </View>
                      ))}

                      {/* Total del comercio */}
                      <View style={styles.mcTotalFila}>
                        <Text style={styles.mcTotalLabel}>Total</Text>
                        <View style={styles.mcTotalPrecios}>
                          <Text style={[styles.mcTotalUSD, esMasBarato && { color: Colors.success }]}>
                            ${r.totalUSD.toFixed(2)}
                          </Text>
                          {usdABs(r.totalUSD) && (
                            <Text style={styles.mcTotalBs}>{usdABs(r.totalUSD)}</Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                });
              })()}
            </ScrollView>

            <TouchableOpacity style={styles.mcBtnCerrar} onPress={() => setModalComercios(false)}>
              <Text style={styles.mcBtnCerrarText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  safe:        { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  backBtn:     { padding: 4 },
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  badge: {
    backgroundColor: Colors.blue, borderRadius: Radius.full,
    minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { fontSize: FontSize.xs, fontWeight: '800', color: '#fff' },

  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 80 },

  addRow: { flexDirection: 'row', gap: Spacing.sm },
  addInput: {
    flex: 1, backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text,
  },
  addCantidad: {
    width: 48, backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 8, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text, textAlign: 'center',
  },
  addBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center',
  },
  itemCantidad: {
    fontSize: FontSize.xs, color: Colors.blue, fontWeight: '700', marginTop: 2,
  },

  // Listas agendadas
  agendaSection: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.blue + '44', overflow: 'hidden',
  },
  agendaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  agendaHeaderText: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: Colors.blue },
  agendaItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 8,
  },
  agendaInfo:    { flex: 1 },
  agendaNombre:  { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  agendaFecha:   { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  agendaEliminar:{ padding: 6, borderRadius: Radius.sm, backgroundColor: Colors.error + '22' },

  productosExpandidos: {
    backgroundColor: Colors.cardAlt,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    gap: 2,
  },
  productoFila: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 7,
  },
  productoFilaBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  productoNombre:     { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1 },
  sinProductosText:   { fontSize: FontSize.sm, color: Colors.textMuted, paddingVertical: 6 },

  tablaHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  colHeaderText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted },
  colCheck:    { width: 36, alignItems: 'center' },
  colProducto: { flex: 1 },
  colPrecio:   { width: 110, alignItems: 'flex-end' },
  colAccion:   { width: 32, alignItems: 'center' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 10, paddingHorizontal: Spacing.sm,
  },
  itemRowChecked: {},
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.blue,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked:   { backgroundColor: Colors.success, borderColor: Colors.success },
  itemNombre:        { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  itemNombreChecked: {},

  precioMonto: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.success, textAlign: 'right' },
  precioUsd:   { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, textAlign: 'right' },
  localChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: 2, justifyContent: 'flex-end',
  },
  localText:  { fontSize: FontSize.xs, color: Colors.success, fontWeight: '600', flexShrink: 1 },
  sinPrecio:  { fontSize: FontSize.md, color: Colors.textMuted, fontWeight: '600', textAlign: 'right' },

  btnPorComercio: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.blue + '18', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.blue + '44',
    paddingHorizontal: Spacing.md, paddingVertical: 13,
  },
  btnPorComercioText: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.blue },

  mcOverlay: {
    flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end',
  },
  mcDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  // Modal por comercio
  modalComerciosCard: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 36,
    borderTopWidth: 1, borderColor: Colors.border,
    height: '85%',
    flexDirection: 'column',
  },
  mcMejorBloque: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.success + '18', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '44',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  mcMejorLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mcMejorLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.success },
  mcMejorUSD:   { fontSize: FontSize.xl, fontWeight: '800', color: Colors.success, textAlign: 'right' },
  mcMejorBs:    { fontSize: FontSize.xs, fontWeight: '600', color: Colors.success, opacity: 0.8, textAlign: 'right' },

  modalHandle:            { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  modalComerciosTitulo:   { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalComerciosSubtitulo:{ fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },

  mcComercioCard: {
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm, overflow: 'hidden',
  },
  mcComercioCardWin: { borderColor: Colors.success + '66', backgroundColor: Colors.success + '0A' },
  mcComercioHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mcComercioLeft:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mcComercioNombre: { fontSize: FontSize.md, fontWeight: '800', color: Colors.blue },
  mcDisponibles:    { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },

  mcProductoFila: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  mcProductoNombre:   { flex: 1, fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  mcProductoNoDisp:   { color: Colors.textMuted },
  mcProductoPrecioCol:{ alignItems: 'flex-end' },
  mcProductoPrecio:   { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  mcProductoBs:       { fontSize: FontSize.xs, color: Colors.textMuted },
  mcNoDisp:           { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },

  mcTotalFila: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.background,
  },
  mcTotalLabel:   { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
  mcTotalPrecios: { alignItems: 'flex-end' },
  mcTotalUSD:     { fontSize: FontSize.lg, fontWeight: '800', color: Colors.blue },
  mcTotalBs:      { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },

  mcEmpty:        { alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  mcEmptyText:    { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  mcBtnCerrar: {
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  mcBtnCerrarText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },

  totalCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  resumen: { alignItems: 'center', paddingVertical: Spacing.sm },
  resumenText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.success + '18', borderTopWidth: 1, borderTopColor: Colors.success + '44',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  totalLabel:  { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
  totalPrecios:{ alignItems: 'flex-end' },
  totalUSD:    { fontSize: FontSize.xl, fontWeight: '800', color: Colors.success },
  totalBs:     { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },

  totalDivider: {
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.cardAlt,
  },
  totalDividerText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },

  totalComercioRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  totalComercioRowWin:   { backgroundColor: Colors.success + '0D' },
  totalComercioNombre:   { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  totalComercioSub:      { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  totalComercioUSD:      { fontSize: FontSize.md, fontWeight: '800', color: Colors.blue },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.md, paddingBottom: Spacing.md, backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  footerRow: { flexDirection: 'row', gap: Spacing.sm },

  btnGuardar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  btnGuardado:     { backgroundColor: Colors.success, borderColor: Colors.success },
  btnGuardarText:  { fontSize: FontSize.sm, fontWeight: '800', color: '#fff' },

  btnAgendar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.blue + '22', borderRadius: Radius.md, paddingVertical: 12,
    borderWidth: 1, borderColor: Colors.blue + '55',
  },
  btnAgendarText: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.blue },

  btnComprado: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: Colors.success, borderRadius: Radius.md, paddingVertical: 12,
  },
  btnCompradoText: { fontSize: FontSize.sm, fontWeight: '800', color: '#fff' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, width: '100%', gap: Spacing.md,
  },
  modalHeader:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle:   { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  modalSubtitle:{ fontSize: FontSize.sm, color: Colors.textMuted },
  fechaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.blue + '55',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  fechaBtnText: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  modalBtns:         { flexDirection: 'row', gap: Spacing.sm },
  modalBtnCancel: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: Radius.md,
    backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
  },
  modalBtnCancelText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
  modalBtnConfirm: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md, backgroundColor: Colors.blue,
  },
  modalBtnConfirmText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textSecondary },
  emptyText:  { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

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
}); }
