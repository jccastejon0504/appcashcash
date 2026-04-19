import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ScrollView, Alert, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getItem, setItem } from '@/services/storage';

type Periodo = 'semana' | 'mes' | 'año';
type TipoMovimiento = 'ingreso' | 'gasto';

type GastoFijo = {
  id: string;
  nombre: string;
  monto: number;
};

type Movimiento = {
  id: string;
  descripcion: string;
  monto: number;
  tipo: TipoMovimiento;
  fecha: string;
};

const STORAGE_KEY      = 'ingresos_gastos_data';
const BCV_CACHE_KEY    = 'bcv_cache';
const GASTOS_FIJOS_KEY = 'gastos_fijos_data';

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const getSemanaKey = (fecha: Date) => {
  const d = new Date(fecha);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
};

const getMesKey = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;

const getAñoKey = (fecha: Date) => `${fecha.getFullYear()}`;

const labelPeriodo = (periodo: Periodo, hoy: Date) => {
  if (periodo === 'semana') {
    const d = new Date(hoy);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const fin = new Date(d); fin.setDate(d.getDate() + 6);
    return `${d.getDate()} – ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
  }
  if (periodo === 'mes') {
    const m = MESES[hoy.getMonth()];
    return `${m.charAt(0).toUpperCase() + m.slice(1)} ${hoy.getFullYear()}`;
  }
  return `Año ${hoy.getFullYear()}`;
};

export default function GastosScreen() {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const router = useRouter();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [periodo,     setPeriodo]     = useState<Periodo>('mes');
  const [modalTipo,   setModalTipo]   = useState<TipoMovimiento | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [monto,       setMonto]       = useState('');
  const [moneda,      setMoneda]      = useState<'usd' | 'bs'>('usd');
  const [tasaBCV,     setTasaBCV]     = useState<number | null>(null);
  const [hoy]                         = useState(new Date());

  // Gastos Fijos
  const [gastosFijos,       setGastosFijos]       = useState<GastoFijo[]>([]);
  const [modalGastosFijos,  setModalGastosFijos]  = useState(false);
  const [editGastoFijo,     setEditGastoFijo]     = useState<{ id?: string; nombre: string; monto: string; moneda: 'usd' | 'bs' } | null>(null);

  useEffect(() => {
    (async () => {
      const data      = await getItem<Movimiento[]>(STORAGE_KEY);
      const bcvCache  = await getItem<{ usd: number }>(BCV_CACHE_KEY);
      const fijos     = await getItem<GastoFijo[]>(GASTOS_FIJOS_KEY);
      if (data)     setMovimientos(data);
      if (bcvCache) setTasaBCV(bcvCache.usd);
      if (fijos)    setGastosFijos(fijos);
    })();
  }, []);

  const usdABs = (usd: number) =>
    tasaBCV && tasaBCV > 0
      ? `Bs ${(usd * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  const guardar = async (data: Movimiento[]) => {
    setMovimientos(data);
    await setItem(STORAGE_KEY, data);
  };

  const abrirModal = (tipo: TipoMovimiento) => {
    setDescripcion('');
    setMonto('');
    setMoneda('usd');
    setModalTipo(tipo);
  };

  const agregar = async () => {
    const desc  = descripcion.trim();
    const valor = parseFloat(monto.replace(',', '.'));
    if (!desc)                      { Alert.alert('Falta descripción'); return; }
    if (isNaN(valor) || valor <= 0) { Alert.alert('Monto inválido');   return; }
    let montoUSD = valor;
    if (moneda === 'bs') {
      if (!tasaBCV || tasaBCV <= 0) { Alert.alert('Tasa BCV no disponible'); return; }
      montoUSD = valor / tasaBCV;
    }
    const nuevo: Movimiento = {
      id:          Date.now().toString(),
      descripcion: desc,
      monto:       montoUSD,
      tipo:        modalTipo!,
      fecha:       new Date().toISOString(),
    };
    await guardar([nuevo, ...movimientos]);
    setModalTipo(null);
  };

  const eliminar = (id: string) => {
    Alert.alert('Eliminar', '¿Quitar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => guardar(movimientos.filter(m => m.id !== id)) },
    ]);
  };

  // ── Gastos Fijos ──────────────────────────────────────────────────────────
  const guardarFijos = async (data: GastoFijo[]) => {
    setGastosFijos(data);
    await setItem(GASTOS_FIJOS_KEY, data);
  };

  const abrirNuevoFijo = () => setEditGastoFijo({ nombre: '', monto: '', moneda: 'usd' });

  const abrirEditFijo = (g: GastoFijo) =>
    setEditGastoFijo({ id: g.id, nombre: g.nombre, monto: g.monto.toFixed(2), moneda: 'usd' });

  const guardarFijo = async () => {
    if (!editGastoFijo) return;
    const nombre = editGastoFijo.nombre.trim();
    const valor  = parseFloat(editGastoFijo.monto.replace(',', '.'));
    if (!nombre)                       { Alert.alert('Falta nombre'); return; }
    if (isNaN(valor) || valor <= 0)    { Alert.alert('Monto inválido'); return; }
    let montoUSD = valor;
    if (editGastoFijo.moneda === 'bs') {
      if (!tasaBCV || tasaBCV <= 0)    { Alert.alert('Tasa BCV no disponible'); return; }
      montoUSD = valor / tasaBCV;
    }
    if (editGastoFijo.id) {
      await guardarFijos(gastosFijos.map(g =>
        g.id === editGastoFijo.id ? { ...g, nombre, monto: montoUSD } : g
      ));
    } else {
      await guardarFijos([...gastosFijos, { id: Date.now().toString(), nombre, monto: montoUSD }]);
    }
    setEditGastoFijo(null);
  };

  const agregarFijoACartera = (g: GastoFijo) => {
    Alert.alert(
      'Agregar a Mi Cartera',
      `¿Registrar "${g.nombre}" como gasto?\n$${g.monto.toFixed(2)}${tasaBCV && tasaBCV > 0 ? `\n${usdABs(g.monto)}` : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Agregar',
          onPress: async () => {
            const nuevo: Movimiento = {
              id:          Date.now().toString(),
              descripcion: g.nombre,
              monto:       g.monto,
              tipo:        'gasto',
              fecha:       new Date().toISOString(),
            };
            await guardar([nuevo, ...movimientos]);
            setModalGastosFijos(false);
          },
        },
      ]
    );
  };

  const eliminarFijo = (id: string) => {
    Alert.alert('Eliminar', '¿Quitar este gasto fijo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => guardarFijos(gastosFijos.filter(g => g.id !== id)) },
    ]);
  };

  const totalFijos = gastosFijos.reduce((a, g) => a + g.monto, 0);

  // ── Historial mensual ─────────────────────────────────────────────────────
  const [mesExpandido, setMesExpandido] = useState<string | null>(null);

  const historialMensual = () => {
    const mapa: Record<string, Movimiento[]> = {};
    movimientos.forEach(m => {
      const key = getMesKey(new Date(m.fecha));
      if (!mapa[key]) mapa[key] = [];
      mapa[key].push(m);
    });
    return Object.entries(mapa)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, lista]) => {
        const [año, mes] = key.split('-');
        const ing  = lista.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
        const gst  = lista.filter(m => m.tipo === 'gasto').reduce((a, m) => a + m.monto, 0);
        return {
          key,
          label: `${MESES[parseInt(mes) - 1].charAt(0).toUpperCase() + MESES[parseInt(mes) - 1].slice(1)} ${año}`,
          lista,
          totalIng: ing,
          totalGasto: gst,
          balance: ing - gst,
        };
      });
  };

  // ── Filtrar ───────────────────────────────────────────────────────────────
  const filtrar = (lista: Movimiento[]) => lista.filter(m => {
    const f = new Date(m.fecha);
    if (periodo === 'semana') return getSemanaKey(f) === getSemanaKey(hoy);
    if (periodo === 'mes')    return getMesKey(f)    === getMesKey(hoy);
    return getAñoKey(f) === getAñoKey(hoy);
  });

  const filtrados  = filtrar(movimientos);
  const ingresos   = filtrados.filter(m => m.tipo === 'ingreso');
  const gastos     = filtrados.filter(m => m.tipo === 'gasto');
  const totalIng   = ingresos.reduce((a, m) => a + m.monto, 0);
  const totalGasto = gastos.reduce((a, m) => a + m.monto, 0);
  const balance    = totalIng - totalGasto;
  const pctGasto   = totalIng > 0 ? Math.min(totalGasto / totalIng, 1) : 0;

  const formatFecha = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-VE', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  const FilaMovimiento = ({ m }: { m: Movimiento }) => {
    const color = m.tipo === 'ingreso' ? Colors.success : Colors.error;
    const bs    = usdABs(m.monto);
    return (
      <View style={styles.fila}>
        <View style={[styles.filaIcono, { backgroundColor: color + '22' }]}>
          <Ionicons
            name={m.tipo === 'ingreso' ? 'arrow-down-circle' : 'arrow-up-circle'}
            size={20} color={color}
          />
        </View>
        <View style={styles.filaInfo}>
          <Text style={styles.filaDesc} numberOfLines={1}>{m.descripcion}</Text>
          <Text style={styles.filaFecha}>{formatFecha(m.fecha)}</Text>
        </View>
        <View style={styles.filaMontoCol}>
          <Text style={[styles.filaMonto, { color }]}>
            {m.tipo === 'ingreso' ? '+' : '-'}${m.monto.toFixed(2)}
          </Text>
          {bs && <Text style={styles.filaBs}>{bs}</Text>}
        </View>
        <TouchableOpacity onPress={() => eliminar(m.id)} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.navigate('/')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cartera</Text>
        <TouchableOpacity style={styles.fijoHeaderBtn} onPress={() => setModalGastosFijos(true)}>
          <Ionicons name="repeat-outline" size={15} color="#fff" />
          <Text style={styles.fijoHeaderBtnText}>Gastos Fijos</Text>
        </TouchableOpacity>
      </View>


      {/* Selector de período */}
      <View style={styles.periodoRow}>
        {(['semana', 'mes', 'año'] as Periodo[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodoBtn, periodo === p && styles.periodoBtnActive]}
            onPress={() => setPeriodo(p)}
          >
            <Text style={[styles.periodoBtnText, periodo === p && styles.periodoBtnTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* ── Tarjeta balance ─────────────────────────────────────────────── */}
        <View style={styles.balanceCard}>
          <Text style={styles.balancePeriodo}>{labelPeriodo(periodo, hoy)}</Text>
          <Text style={[styles.balanceMonto, { color: balance >= 0 ? Colors.success : Colors.error }]}>
            {balance >= 0 ? '+' : ''}${balance.toFixed(2)}
          </Text>
          {tasaBCV && tasaBCV > 0 && (
            <Text style={[styles.balanceBs, { color: balance >= 0 ? Colors.success : Colors.error }]}>
              {balance >= 0 ? '' : '-'}{usdABs(Math.abs(balance))}
            </Text>
          )}
          <Text style={styles.balanceLabel}>Balance disponible</Text>

          {/* Barra de progreso gasto vs ingreso */}
          {totalIng > 0 && (
            <View style={styles.barraWrap}>
              <View style={styles.barraFondo}>
                <View style={[styles.barraRelleno, { width: `${pctGasto * 100}%` }]} />
              </View>
              <View style={styles.barraLabels}>
                <Text style={styles.barraLabelIng}>Ingresos ${totalIng.toFixed(2)}</Text>
                <Text style={styles.barraLabelGasto}>Gastos ${totalGasto.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Chips resumen */}
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { borderColor: Colors.success + '55' }]}>
              <Ionicons name="arrow-down-circle" size={14} color={Colors.success} />
              <View>
                <Text style={[styles.chipLabel, { color: Colors.success }]}>+${totalIng.toFixed(2)}</Text>
                {tasaBCV && tasaBCV > 0 && (
                  <Text style={[styles.chipBs, { color: Colors.success }]}>{usdABs(totalIng)}</Text>
                )}
              </View>
            </View>
            <View style={[styles.chip, { borderColor: Colors.error + '55' }]}>
              <Ionicons name="arrow-up-circle" size={14} color={Colors.error} />
              <View>
                <Text style={[styles.chipLabel, { color: Colors.error }]}>-${totalGasto.toFixed(2)}</Text>
                {tasaBCV && tasaBCV > 0 && (
                  <Text style={[styles.chipBs, { color: Colors.error }]}>-{usdABs(totalGasto)}</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── Bloque Ingresos ─────────────────────────────────────────────── */}
        <View style={styles.bloque}>
          <View style={[styles.bloqueHeader, { borderLeftColor: Colors.success }]}>
            <View style={styles.bloqueHeaderLeft}>
              <Ionicons name="arrow-down-circle" size={18} color={Colors.success} />
              <Text style={[styles.bloqueTitle, { color: Colors.success }]}>Ingresos</Text>
              <View style={[styles.countBadge, { backgroundColor: Colors.success + '22' }]}>
                <Text style={[styles.countBadgeText, { color: Colors.success }]}>{ingresos.length}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.bloqueAddBtn, { backgroundColor: Colors.success }]} onPress={() => abrirModal('ingreso')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.bloqueAddText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {ingresos.length === 0 ? (
            <View style={styles.bloqueEmpty}>
              <Text style={styles.bloqueEmptyText}>Sin ingresos en este período</Text>
            </View>
          ) : (
            <View style={styles.listaCard}>
              {ingresos.map((m, idx) => (
                <View key={m.id}>
                  <FilaMovimiento m={m} />
                  {idx < ingresos.length - 1 && <View style={styles.separador} />}
                </View>
              ))}
              <View style={styles.subtotalFila}>
                <Text style={styles.subtotalLabel}>Total ingresos</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.subtotalMonto, { color: Colors.success }]}>${totalIng.toFixed(2)}</Text>
                  {tasaBCV && tasaBCV > 0 && (
                    <Text style={[styles.balanceBs, { color: Colors.success }]}>{usdABs(totalIng)}</Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Bloque Gastos ───────────────────────────────────────────────── */}
        <View style={styles.bloque}>
          <View style={[styles.bloqueHeader, { borderLeftColor: Colors.error }]}>
            <View style={styles.bloqueHeaderLeft}>
              <Ionicons name="arrow-up-circle" size={18} color={Colors.error} />
              <Text style={[styles.bloqueTitle, { color: Colors.error }]}>Gastos</Text>
              <View style={[styles.countBadge, { backgroundColor: Colors.error + '22' }]}>
                <Text style={[styles.countBadgeText, { color: Colors.error }]}>{gastos.length}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.bloqueAddBtn, { backgroundColor: Colors.error }]} onPress={() => abrirModal('gasto')}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.bloqueAddText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {gastos.length === 0 ? (
            <View style={styles.bloqueEmpty}>
              <Text style={styles.bloqueEmptyText}>Sin gastos en este período</Text>
            </View>
          ) : (
            <View style={styles.listaCard}>
              {gastos.map((m, idx) => (
                <View key={m.id}>
                  <FilaMovimiento m={m} />
                  {idx < gastos.length - 1 && <View style={styles.separador} />}
                </View>
              ))}
              <View style={styles.subtotalFila}>
                <Text style={styles.subtotalLabel}>Total gastos</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.subtotalMonto, { color: Colors.error }]}>${totalGasto.toFixed(2)}</Text>
                  {tasaBCV && tasaBCV > 0 && (
                    <Text style={[styles.balanceBs, { color: Colors.error }]}>-{usdABs(totalGasto)}</Text>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Balance final ───────────────────────────────────────────────── */}
        {(ingresos.length > 0 || gastos.length > 0) && (
          <View style={[styles.balanceFinalCard, { borderColor: balance >= 0 ? Colors.success + '44' : Colors.error + '44' }]}>
            <View style={styles.balanceFinalRow}>
              <Text style={styles.balanceFinalLabel}>Ingresos</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.balanceFinalValor, { color: Colors.success }]}>+${totalIng.toFixed(2)}</Text>
                {tasaBCV && tasaBCV > 0 && (
                  <Text style={[styles.balanceBs, { color: Colors.success }]}>{usdABs(totalIng)}</Text>
                )}
              </View>
            </View>
            <View style={styles.balanceFinalRow}>
              <Text style={styles.balanceFinalLabel}>Gastos</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.balanceFinalValor, { color: Colors.error }]}>-${totalGasto.toFixed(2)}</Text>
                {tasaBCV && tasaBCV > 0 && (
                  <Text style={[styles.balanceBs, { color: Colors.error }]}>-{usdABs(totalGasto)}</Text>
                )}
              </View>
            </View>
            <View style={styles.balanceFinalDivider} />
            <View style={styles.balanceFinalRow}>
              <Text style={styles.balanceFinalTotalLabel}>Balance</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.balanceFinalTotal, { color: balance >= 0 ? Colors.success : Colors.error }]}>
                  {balance >= 0 ? '+' : ''}${balance.toFixed(2)}
                </Text>
                {tasaBCV && tasaBCV > 0 && (
                  <Text style={[styles.balanceBs, { color: balance >= 0 ? Colors.success : Colors.error }]}>
                    {balance >= 0 ? '' : '-'}{usdABs(Math.abs(balance))}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* ── Historial mes a mes ─────────────────────────────────────────── */}
        {(() => {
          const hist = historialMensual();
          if (hist.length === 0) return null;
          return (
            <View style={styles.histSection}>
              {/* Encabezado */}
              <View style={styles.histTituloRow}>
                <Ionicons name="time-outline" size={18} color={Colors.blue} />
                <Text style={styles.histTitulo}>Historial mes a mes</Text>
              </View>

              {hist.map(mes => {
                const expandido = mesExpandido === mes.key;
                const balColor  = mes.balance >= 0 ? Colors.success : Colors.error;
                const pct       = mes.totalIng > 0 ? Math.min(mes.totalGasto / mes.totalIng, 1) : 0;
                return (
                  <View key={mes.key} style={styles.histCard}>
                    {/* Cabecera del mes */}
                    <TouchableOpacity
                      style={styles.histCardHeader}
                      onPress={() => setMesExpandido(expandido ? null : mes.key)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.histCardLeft}>
                        <View style={[styles.histDot, { backgroundColor: balColor }]} />
                        <Text style={styles.histMesLabel}>{mes.label}</Text>
                        <Text style={styles.histCount}>{mes.lista.length} mov.</Text>
                      </View>
                      <View style={styles.histCardRight}>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.histBalance, { color: balColor }]}>
                            {mes.balance >= 0 ? '+' : ''}${mes.balance.toFixed(2)}
                          </Text>
                          {tasaBCV && tasaBCV > 0 && (
                            <Text style={[styles.balanceBs, { color: balColor }]}>
                              {mes.balance >= 0 ? '' : '-'}{usdABs(Math.abs(mes.balance))}
                            </Text>
                          )}
                        </View>
                        <Ionicons
                          name={expandido ? 'chevron-up' : 'chevron-down'}
                          size={16} color={Colors.textMuted}
                        />
                      </View>
                    </TouchableOpacity>

                    {/* Barra visual */}
                    {mes.totalIng > 0 && (
                      <View style={styles.histBarraWrap}>
                        <View style={styles.histBarraFondo}>
                          <View style={[styles.histBarraRelleno, { width: `${pct * 100}%` }]} />
                        </View>
                        <View style={styles.histBarraLabels}>
                          <View style={{ gap: 1 }}>
                            <View style={styles.histBarraChip}>
                              <Ionicons name="arrow-down-circle" size={11} color={Colors.success} />
                              <Text style={[styles.histBarraText, { color: Colors.success }]}>+${mes.totalIng.toFixed(2)}</Text>
                            </View>
                            {tasaBCV && tasaBCV > 0 && (
                              <Text style={[styles.histBarraText, { color: Colors.success, opacity: 0.7, paddingLeft: 14 }]}>
                                +{usdABs(mes.totalIng)}
                              </Text>
                            )}
                          </View>
                          <View style={{ gap: 1, alignItems: 'flex-end' }}>
                            <View style={styles.histBarraChip}>
                              <Ionicons name="arrow-up-circle" size={11} color={Colors.error} />
                              <Text style={[styles.histBarraText, { color: Colors.error }]}>-${mes.totalGasto.toFixed(2)}</Text>
                            </View>
                            {tasaBCV && tasaBCV > 0 && (
                              <Text style={[styles.histBarraText, { color: Colors.error, opacity: 0.7 }]}>
                                -{usdABs(mes.totalGasto)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Detalle expandido */}
                    {expandido && (
                      <View style={styles.histDetalle}>
                        {mes.lista.map((m, idx) => (
                          <View key={m.id}>
                            <FilaMovimiento m={m} />
                            {idx < mes.lista.length - 1 && <View style={styles.separador} />}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}

      </ScrollView>

      {/* Modal Gastos Fijos */}
      <Modal transparent visible={modalGastosFijos} animationType="slide" onRequestClose={() => { setEditGastoFijo(null); setModalGastosFijos(false); }}>
        <Pressable style={styles.modalOverlay} onPress={() => { setEditGastoFijo(null); setModalGastosFijos(false); }}>
          <Pressable style={[styles.modalCard, styles.fijoModal]} onPress={e => e.stopPropagation()}>

            {/* Cabecera */}
            <View style={styles.fijoModalHeader}>
              <View style={styles.fijoModalTitleRow}>
                <Ionicons name="repeat-outline" size={20} color={Colors.blue} />
                <Text style={styles.fijoModalTitle}>Gastos Fijos</Text>
              </View>
              {gastosFijos.length > 0 && !editGastoFijo && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.fijoModalTotal}>Total ${totalFijos.toFixed(2)}</Text>
                  {tasaBCV && tasaBCV > 0 && (
                    <Text style={styles.fijoModalTotalBs}>{usdABs(totalFijos)}</Text>
                  )}
                </View>
              )}
            </View>

            {editGastoFijo ? (
              /* ── Formulario edición ── */
              <View style={styles.fijoForm}>
                <Text style={styles.fijoFormTitle}>
                  {editGastoFijo.id ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={editGastoFijo.nombre}
                  onChangeText={t => setEditGastoFijo(e => e && ({ ...e, nombre: t }))}
                  placeholder="Nombre (ej: Alquiler, Luz…)"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                />
                <View style={styles.montoRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editGastoFijo.monto}
                    onChangeText={t => setEditGastoFijo(e => e && ({ ...e, monto: t }))}
                    placeholder={editGastoFijo.moneda === 'usd' ? 'Monto en $' : 'Monto en Bs'}
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity
                    style={[styles.monedaToggle, { backgroundColor: editGastoFijo.moneda === 'usd' ? Colors.success : Colors.blue }]}
                    onPress={() => setEditGastoFijo(e => e && ({ ...e, moneda: e.moneda === 'usd' ? 'bs' : 'usd', monto: '' }))}
                  >
                    <Text style={styles.monedaToggleText}>{editGastoFijo.moneda === 'usd' ? '$' : 'Bs'}</Text>
                  </TouchableOpacity>
                </View>
                {editGastoFijo.monto.length > 0 && tasaBCV && tasaBCV > 0 && (() => {
                  const val = parseFloat(editGastoFijo.monto.replace(',', '.'));
                  if (isNaN(val) || val <= 0) return null;
                  if (editGastoFijo.moneda === 'usd') {
                    return (
                      <Text style={styles.equivalente}>
                        ≈ Bs {(val * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    );
                  }
                  return <Text style={styles.equivalente}>≈ ${(val / tasaBCV).toFixed(2)}</Text>;
                })()}
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setEditGastoFijo(null)}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  {editGastoFijo.id && (
                    <TouchableOpacity
                      style={[styles.modalBtnCancel, { borderColor: Colors.error + '66' }]}
                      onPress={() => { eliminarFijo(editGastoFijo.id!); setEditGastoFijo(null); }}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.error} />
                      <Text style={[styles.modalBtnCancelText, { color: Colors.error }]}>Borrar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: Colors.blue }]} onPress={guardarFijo}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.modalBtnConfirmText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* ── Lista de tarjetas ── */
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {gastosFijos.length === 0 ? (
                  <View style={styles.fijoEmpty}>
                    <Ionicons name="repeat-outline" size={36} color={Colors.textMuted} />
                    <Text style={styles.fijoEmptyText}>Sin gastos fijos aún</Text>
                    <Text style={styles.fijoEmptyDesc}>Agrega tus gastos recurrentes para tenerlos a la vista</Text>
                  </View>
                ) : (
                  <View style={styles.fijoGrid}>
                    {gastosFijos.map(g => {
                      const bs = usdABs(g.monto);
                      return (
                        <TouchableOpacity key={g.id} style={styles.fijoCard} onPress={() => agregarFijoACartera(g)} activeOpacity={0.75}>
                          <View style={styles.fijoCardIconWrap}>
                            <Ionicons name="add-circle-outline" size={16} color={Colors.success} />
                          </View>
                          <Text style={styles.fijoCardNombre} numberOfLines={2}>{g.nombre}</Text>
                          <Text style={styles.fijoCardMonto}>${g.monto.toFixed(2)}</Text>
                          {bs && <Text style={styles.fijoCardBs}>{bs}</Text>}
                          <TouchableOpacity style={styles.fijoCardEdit} onPress={() => abrirEditFijo(g)} hitSlop={10}>
                            <Ionicons name="pencil-outline" size={12} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}

            {!editGastoFijo && (
              <TouchableOpacity style={[styles.fijoAgregarBtn, { backgroundColor: Colors.blue }]} onPress={abrirNuevoFijo}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.fijoAgregarText}>Agregar gasto fijo</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal agregar */}
      <Modal transparent visible={modalTipo !== null} animationType="fade" onRequestClose={() => setModalTipo(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalTipo(null)}>
          <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Ionicons
                name={modalTipo === 'ingreso' ? 'arrow-down-circle' : 'arrow-up-circle'}
                size={22}
                color={modalTipo === 'ingreso' ? Colors.success : Colors.error}
              />
              <Text style={styles.modalTitle}>
                {modalTipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
              </Text>
            </View>

            <TextInput
              style={styles.input}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Descripción…"
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />

            {/* Monto + toggle moneda */}
            <View style={styles.montoRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={monto}
                onChangeText={setMonto}
                placeholder={moneda === 'usd' ? 'Monto en $' : 'Monto en Bs'}
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
              />
              <TouchableOpacity
                style={styles.monedaToggle}
                onPress={() => setMoneda(m => m === 'usd' ? 'bs' : 'usd')}
              >
                <Text style={styles.monedaToggleText}>{moneda === 'usd' ? '$' : 'Bs'}</Text>
              </TouchableOpacity>
            </View>

            {/* Previsualización del equivalente */}
            {monto.length > 0 && tasaBCV && tasaBCV > 0 && (() => {
              const val = parseFloat(monto.replace(',', '.'));
              if (isNaN(val) || val <= 0) return null;
              if (moneda === 'usd') {
                return (
                  <Text style={styles.equivalente}>
                    ≈ Bs {(val * tasaBCV).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                );
              }
              return (
                <Text style={styles.equivalente}>
                  ≈ ${(val / tasaBCV).toFixed(2)}
                </Text>
              );
            })()}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setModalTipo(null)}>
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: modalTipo === 'ingreso' ? Colors.success : Colors.error }]}
                onPress={agregar}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                <Text style={styles.modalBtnConfirmText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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

  periodoRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  periodoBtn: {
    flex: 1, paddingVertical: 8, borderRadius: Radius.md,
    alignItems: 'center', backgroundColor: Colors.cardAlt,
    borderWidth: 1, borderColor: Colors.border,
  },
  periodoBtnActive:     { backgroundColor: Colors.blue, borderColor: Colors.blue },
  periodoBtnText:       { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  periodoBtnTextActive: { color: '#fff' },

  body: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 50 },

  // Balance principal
  balanceCard: {
    backgroundColor: Colors.card, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center', gap: 6,
  },
  balancePeriodo: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  balanceMonto:   { fontSize: 42, fontWeight: '900', letterSpacing: -1 },
  balanceBs:      { fontSize: FontSize.md, fontWeight: '700', opacity: 0.75 },
  balanceLabel:   { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },

  barraWrap:   { width: '100%', gap: 6 },
  barraFondo: {
    width: '100%', height: 8, backgroundColor: Colors.success + '33',
    borderRadius: Radius.full, overflow: 'hidden',
  },
  barraRelleno: { height: '100%', backgroundColor: Colors.error, borderRadius: Radius.full },
  barraLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  barraLabelIng:   { fontSize: FontSize.xs, color: Colors.success, fontWeight: '600' },
  barraLabelGasto: { fontSize: FontSize.xs, color: Colors.error,   fontWeight: '600' },

  chipsRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1,
    backgroundColor: Colors.cardAlt,
  },
  chipLabel: { fontSize: FontSize.sm, fontWeight: '700' },
  chipBs:    { fontSize: FontSize.xs, fontWeight: '600', opacity: 0.75 },

  // Bloques
  bloque: { gap: Spacing.sm },
  bloqueHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderLeftWidth: 3, paddingLeft: Spacing.sm,
  },
  bloqueHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bloqueTitle:      { fontSize: FontSize.md, fontWeight: '800' },
  countBadge: {
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  countBadgeText: { fontSize: FontSize.xs, fontWeight: '700' },
  bloqueAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.md,
  },
  bloqueAddText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  bloqueEmpty: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  bloqueEmptyText: { fontSize: FontSize.sm, color: Colors.textMuted },

  listaCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
  },
  filaIcono: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filaInfo:  { flex: 1 },
  filaDesc:  { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  filaFecha: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  filaMontoCol: { alignItems: 'flex-end' },
  filaMonto:    { fontSize: FontSize.sm, fontWeight: '800' },
  filaBs:       { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  separador: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.md },
  subtotalFila: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.cardAlt,
  },
  subtotalLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  subtotalMonto: { fontSize: FontSize.md, fontWeight: '900' },

  // Balance final
  balanceFinalCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, padding: Spacing.lg, gap: 10,
  },
  balanceFinalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceFinalLabel:   { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  balanceFinalValor:   { fontSize: FontSize.md, fontWeight: '700' },
  balanceFinalDivider: { height: 1, backgroundColor: Colors.border },
  balanceFinalTotalLabel: { fontSize: FontSize.md, color: Colors.text, fontWeight: '800' },
  balanceFinalTotal:   { fontSize: FontSize.xl, fontWeight: '900' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: '#00000088',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.lg, width: '100%', gap: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle:  { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  input: {
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: FontSize.md, color: Colors.text,
  },
  modalBtns:           { flexDirection: 'row', gap: Spacing.sm },
  modalBtnCancel: {
    flex: 1, paddingVertical: 12, borderRadius: Radius.md,
    alignItems: 'center', backgroundColor: Colors.cardAlt,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalBtnCancelText:  { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  modalBtnConfirm: {
    flex: 1, flexDirection: 'row', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnConfirmText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  montoRow:      { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  // Historial
  histSection:      { gap: Spacing.sm },
  histTituloRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 },
  histTitulo:       { fontSize: FontSize.md, fontWeight: '800', color: Colors.blue },

  histCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  histCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  histCardLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  histDot:       { width: 8, height: 8, borderRadius: 4 },
  histMesLabel:  { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  histCount:     { fontSize: FontSize.xs, color: Colors.textMuted, backgroundColor: Colors.cardAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  histBalance:   { fontSize: FontSize.md, fontWeight: '800' },

  histBarraWrap:    { paddingHorizontal: Spacing.md, paddingBottom: 10, gap: 5 },
  histBarraFondo: {
    width: '100%', height: 5, backgroundColor: Colors.success + '33',
    borderRadius: Radius.full, overflow: 'hidden',
  },
  histBarraRelleno: { height: '100%', backgroundColor: Colors.error, borderRadius: Radius.full },
  histBarraLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  histBarraChip:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  histBarraText:    { fontSize: FontSize.xs, fontWeight: '600' },

  histDetalle: { borderTopWidth: 1, borderTopColor: Colors.border },

  monedaToggle: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  monedaToggleText: { fontSize: FontSize.md, color: '#fff', fontWeight: '800' },
  equivalente:      { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'right', marginTop: -4 },

  // ── Gastos Fijos ──────────────────────────────────────────────────────────
  fijoHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  fijoHeaderBtnText: { fontSize: FontSize.xs, color: '#fff', fontWeight: '700' },

  fijoModal:      { gap: Spacing.md, maxHeight: '85%' },
  fijoModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fijoModalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fijoModalTitle:  { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  fijoModalTotal:   { fontSize: FontSize.sm, fontWeight: '700', color: Colors.blue },
  fijoModalTotalBs: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.blue, opacity: 0.75 },
  fijoCerrarBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  fijoForm:       { gap: Spacing.md },
  fijoFormTitle:  { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },

  fijoEmpty: {
    alignItems: 'center', gap: 8,
    paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
  },
  fijoEmptyText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textMuted },
  fijoEmptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', opacity: 0.7 },

  fijoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  fijoCard: {
    width: '47%', backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 4, position: 'relative',
  },
  fijoCardIconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.blue + '1A',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  fijoCardNombre: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  fijoCardMonto:  { fontSize: FontSize.md, fontWeight: '900', color: Colors.blue },
  fijoCardBs:     { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  fijoCardEdit: {
    position: 'absolute', top: 6, right: 8,
    padding: 4,
    backgroundColor: Colors.cardAlt,
    borderRadius: Radius.full,
  },

  fijoAgregarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: Radius.md,
  },
  fijoAgregarText: { fontSize: FontSize.md, color: '#fff', fontWeight: '700' },
}); }
