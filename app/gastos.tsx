import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ScrollView, Alert, Modal, Pressable, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { getItem, setItem } from '@/services/storage';

type Periodo = 'semana' | 'mes' | 'año';
type TipoMovimiento = 'ingreso' | 'gasto';
type CarTab = 'aceite' | 'llantas';
type TipoLlanta = 'alineacion' | 'rotacion' | 'balanceo';

type CambioAceite = {
  id: string;
  fecha: string;
  kmActual: number;
  producto: string;
  kmProximo: number;
  fechaProximo?: string;
  filtroAire: boolean;
  filtroGasolina: boolean;
};

type ServicioLlanta = {
  id: string;
  tipo: TipoLlanta;
  fecha: string;
  km: number;
};

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
const ACEITE_KEY       = 'cambios_aceite_data';
const LLANTAS_KEY      = 'servicios_llantas_data';

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

  // Módulos de botones superiores
  const [modalReporte, setModalReporte] = useState(false);
  const [modalCar,     setModalCar]     = useState(false);
  const [modalInfo,    setModalInfo]    = useState(false);
  const [carTab,       setCarTab]       = useState<CarTab>('aceite');

  // Car — Aceite
  const [cambiosAceite,    setCambiosAceite]    = useState<CambioAceite[]>([]);
  const [formAceite,       setFormAceite]       = useState<{
    kmActual: string; producto: string; kmProximo: string;
    fechaProximo: Date | null; filtroAire: boolean; filtroGasolina: boolean;
  } | null>(null);
  const [showDatePickerAceite,  setShowDatePickerAceite]  = useState(false);
  const [ultimoCambioExpanded, setUltimoCambioExpanded] = useState(false);

  // Car — Llantas
  const [serviciosLlantas, setServiciosLlantas] = useState<ServicioLlanta[]>([]);
  const [formLlanta, setFormLlanta] = useState<{ tipo: TipoLlanta; km: string } | null>(null);

  useEffect(() => {
    (async () => {
      const data      = await getItem<Movimiento[]>(STORAGE_KEY);
      const bcvCache  = await getItem<{ usd: number }>(BCV_CACHE_KEY);
      const fijos     = await getItem<GastoFijo[]>(GASTOS_FIJOS_KEY);
      const aceite    = await getItem<CambioAceite[]>(ACEITE_KEY);
      const llantas   = await getItem<ServicioLlanta[]>(LLANTAS_KEY);
      if (data)     setMovimientos(data);
      if (bcvCache) setTasaBCV(bcvCache.usd);
      if (fijos)    setGastosFijos(fijos);
      if (aceite)   setCambiosAceite(aceite);
      if (llantas)  setServiciosLlantas(llantas);
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

  // ── Car: Aceite ───────────────────────────────────────────────────────────
  const guardarAceite = async (data: CambioAceite[]) => {
    setCambiosAceite(data);
    await setItem(ACEITE_KEY, data);
    console.log('[Aceite] guardado:', JSON.stringify(data[0]));
  };

  const programarNotificacionAceite = async (fechaProximo: Date, producto: string) => {
    // Cancelar notificación anterior si existe
    const idAnterior = await getItem<string>('aceite_notif_id');
    if (idAnterior) await Notifications.cancelScheduledNotificationAsync(idAnterior).catch(() => {});

    // Programar para las 9:00 AM del día indicado
    const trigger = new Date(fechaProximo);
    trigger.setHours(9, 0, 0, 0);

    // Si la fecha ya pasó, no programar
    if (trigger.getTime() <= Date.now()) return;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔧 Cambio de aceite',
        body: `Hoy es el día de cambiar el aceite (${producto}). ¡No lo dejes pasar!`,
        sound: 'default',
        data: { tipo: 'aceite' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'mantenimiento',
      },
    });
    await setItem('aceite_notif_id', id);
    console.log('[Notif] programada para:', trigger.toISOString(), 'id:', id);
  };

  const registrarCambioAceite = async () => {
    if (!formAceite) return;
    console.log('[Aceite] intentando guardar:', JSON.stringify(formAceite));
    const kmA = parseFloat(formAceite.kmActual.replace(',', '.'));
    const kmP = parseFloat(formAceite.kmProximo.replace(',', '.'));
    console.log('[Aceite] kmA:', kmA, 'kmP:', kmP);
    if (!formAceite.producto.trim())      { Alert.alert('Falta producto'); return; }
    if (isNaN(kmA) || kmA <= 0)          { Alert.alert('Km actual inválido'); return; }
    if (isNaN(kmP) || kmP <= kmA)        { Alert.alert('El próximo km debe ser mayor al actual'); return; }
    const nuevo: CambioAceite = {
      id: Date.now().toString(),
      fecha: new Date().toISOString(),
      kmActual: kmA,
      producto: formAceite.producto.trim(),
      kmProximo: kmP,
      fechaProximo: formAceite.fechaProximo ? formAceite.fechaProximo.toISOString() : undefined,
      filtroAire: formAceite.filtroAire,
      filtroGasolina: formAceite.filtroGasolina,
    };
    await guardarAceite([nuevo, ...cambiosAceite]);
    if (nuevo.fechaProximo) {
      await programarNotificacionAceite(new Date(nuevo.fechaProximo), nuevo.producto);
    }
    setFormAceite(null);
  };

  const eliminarAceite = (id: string) => {
    Alert.alert('Eliminar', '¿Quitar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => guardarAceite(cambiosAceite.filter(c => c.id !== id)) },
    ]);
  };

  // ── Car: Llantas ──────────────────────────────────────────────────────────
  const guardarLlantas = async (data: ServicioLlanta[]) => {
    setServiciosLlantas(data);
    await setItem(LLANTAS_KEY, data);
  };

  const registrarServicioLlanta = async () => {
    if (!formLlanta) return;
    const km = parseFloat(formLlanta.km.replace(',', '.'));
    if (isNaN(km) || km <= 0) { Alert.alert('Km inválido'); return; }
    const nuevo: ServicioLlanta = {
      id: Date.now().toString(),
      tipo: formLlanta.tipo,
      fecha: new Date().toISOString(),
      km,
    };
    await guardarLlantas([nuevo, ...serviciosLlantas]);
    setFormLlanta(null);
  };

  const eliminarLlanta = (id: string) => {
    Alert.alert('Eliminar', '¿Quitar este registro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => guardarLlantas(serviciosLlantas.filter(s => s.id !== id)) },
    ]);
  };

  const ultimoServicio = (tipo: TipoLlanta) =>
    serviciosLlantas.filter(s => s.tipo === tipo)[0] ?? null;

  const formatFechaCar = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

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
        <TouchableOpacity style={styles.infoHeaderBtn} onPress={() => setModalInfo(true)}>
          <Ionicons name="information-circle-outline" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fijoHeaderBtn} onPress={() => setModalGastosFijos(true)}>
          <Ionicons name="repeat-outline" size={15} color="#fff" />
          <Text style={styles.fijoHeaderBtnText}>Gastos Fijos</Text>
        </TouchableOpacity>
      </View>


      {/* Botones de módulos */}
      <View style={styles.periodoRow}>
        <TouchableOpacity style={styles.modBtn} onPress={() => setModalReporte(true)}>
          <Ionicons name="bar-chart-outline" size={15} color={Colors.blue} />
          <Text style={styles.modBtnText}>Reporte</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modBtn} onPress={() => { setCarTab('aceite'); setModalCar(true); }}>
          <Ionicons name="car-outline" size={15} color={Colors.blue} />
          <Text style={styles.modBtnText}>Car</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modBtn, styles.modBtnDisabled]}>
          <Ionicons name="ellipsis-horizontal" size={15} color={Colors.textMuted} />
          <Text style={[styles.modBtnText, { color: Colors.textMuted }]}>Pronto</Text>
        </TouchableOpacity>
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

      {/* Modal Info */}
      <Modal transparent visible={modalInfo} animationType="fade" onRequestClose={() => setModalInfo(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalInfo(false)}>
          <Pressable style={[styles.modalCard, { gap: 16 }]} onPress={e => e.stopPropagation()}>
            {/* Título */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="wallet-outline" size={22} color={Colors.accent} />
              <Text style={{ fontSize: FontSize.lg, fontWeight: '900', color: Colors.text, flex: 1 }}>Mi Cartera</Text>
              <TouchableOpacity onPress={() => setModalInfo(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Descripción */}
            <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 }}>
              Lleva el control de tus finanzas personales de forma sencilla y organizada.
            </Text>

            {/* Funciones */}
            {[
              { icon: 'add-circle-outline',   color: Colors.success, titulo: 'Ingresos y Gastos',    desc: 'Registra cada movimiento con descripción, monto y fecha. Visualiza el balance de la semana, mes o año.' },
              { icon: 'repeat-outline',        color: Colors.accent,  titulo: 'Gastos Fijos',         desc: 'Define gastos recurrentes (alquiler, servicios, suscripciones) que se suman automáticamente a tu balance mensual.' },
              { icon: 'bar-chart-outline',     color: Colors.blue,    titulo: 'Reporte Anual',        desc: 'Consulta un resumen mes a mes de todos tus ingresos y gastos a lo largo del año, con equivalente en Bs BCV.' },
              { icon: 'car-outline',           color: '#f59e0b',      titulo: 'Módulo Car',           desc: 'Registra cambios de aceite, filtros y servicios de llantas (alineación, rotación, balanceo). Recibe notificación cuando se acerque la fecha del próximo mantenimiento.' },
            ].map(item => (
              <View key={item.titulo} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: item.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={item.icon as any} size={17} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginBottom: 2 }}>{item.titulo}</Text>
                  <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 17 }}>{item.desc}</Text>
                </View>
              </View>
            ))}

            <TouchableOpacity
              style={{ backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 11, alignItems: 'center' }}
              onPress={() => setModalInfo(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: FontSize.sm }}>Entendido</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* ── Modal Reporte anual ──────────────────────────────────────────── */}
      <Modal visible={modalReporte} animationType="slide" onRequestClose={() => setModalReporte(false)}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setModalReporte(false)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Reporte anual</Text>
          </View>
          <ScrollView contentContainerStyle={[styles.body, { paddingTop: Spacing.md }]}>
            {(() => {
              const hist = historialMensual();
              if (hist.length === 0) return (
                <View style={{ alignItems: 'center', padding: Spacing.xl, gap: 8 }}>
                  <Ionicons name="bar-chart-outline" size={40} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontWeight: '600' }}>Sin movimientos registrados</Text>
                </View>
              );
              return hist.map(mes => {
                const expandido = mesExpandido === mes.key;
                const balColor  = mes.balance >= 0 ? Colors.success : Colors.error;
                const pct       = mes.totalIng > 0 ? Math.min(mes.totalGasto / mes.totalIng, 1) : 0;
                return (
                  <View key={mes.key} style={[styles.histCard, { marginBottom: Spacing.sm }]}>
                    <TouchableOpacity style={styles.histCardHeader} onPress={() => setMesExpandido(expandido ? null : mes.key)} activeOpacity={0.7}>
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
                        <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMuted} />
                      </View>
                    </TouchableOpacity>
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
                              <Text style={[styles.histBarraText, { color: Colors.success, opacity: 0.7, paddingLeft: 14 }]}>+{usdABs(mes.totalIng)}</Text>
                            )}
                          </View>
                          <View style={{ gap: 1, alignItems: 'flex-end' }}>
                            <View style={styles.histBarraChip}>
                              <Ionicons name="arrow-up-circle" size={11} color={Colors.error} />
                              <Text style={[styles.histBarraText, { color: Colors.error }]}>-${mes.totalGasto.toFixed(2)}</Text>
                            </View>
                            {tasaBCV && tasaBCV > 0 && (
                              <Text style={[styles.histBarraText, { color: Colors.error, opacity: 0.7 }]}>-{usdABs(mes.totalGasto)}</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    )}
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
              });
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal Car ───────────────────────────────────────────────────────── */}
      <Modal visible={modalCar} animationType="slide" onRequestClose={() => { setModalCar(false); setFormAceite(null); setFormLlanta(null); }}>
        <SafeAreaView style={styles.safe}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { setModalCar(false); setFormAceite(null); setFormLlanta(null); }} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Mantenimiento</Text>
          </View>

          {/* Tabs aceite / llantas */}
          <View style={styles.periodoRow}>
            <TouchableOpacity style={[styles.modBtn, carTab === 'aceite' && styles.modBtnActive]} onPress={() => { setCarTab('aceite'); setFormAceite(null); setFormLlanta(null); }}>
              <Ionicons name="water-outline" size={14} color={carTab === 'aceite' ? '#fff' : Colors.blue} />
              <Text style={[styles.modBtnText, carTab === 'aceite' && { color: '#fff' }]}>Aceite & Filtros</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modBtn, carTab === 'llantas' && styles.modBtnActive]} onPress={() => { setCarTab('llantas'); setFormAceite(null); setFormLlanta(null); }}>
              <Ionicons name="refresh-circle-outline" size={14} color={carTab === 'llantas' ? '#fff' : Colors.blue} />
              <Text style={[styles.modBtnText, carTab === 'llantas' && { color: '#fff' }]}>Llantas</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={[styles.body, { paddingTop: Spacing.md }]} keyboardShouldPersistTaps="handled">

            {/* ── TAB ACEITE ── */}
            {carTab === 'aceite' && (
              <>
                {/* Último cambio */}
                {cambiosAceite.length > 0 && (
                  <>
                    {/* Header con flecha y X */}
                    <View style={styles.carInfoHeaderRow}>
                      <View style={styles.carInfoHeader}>
                        <Ionicons name="water" size={16} color={Colors.blue} />
                        <Text style={styles.carInfoTitle}>Último cambio</Text>
                      </View>
                      <View style={styles.carInfoHeaderBtns}>
                        <TouchableOpacity onPress={() => setUltimoCambioExpanded(v => !v)} style={styles.carHeaderIconBtn}>
                          <Ionicons name={ultimoCambioExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => eliminarAceite(cambiosAceite[0].id)} style={styles.carHeaderIconBtn}>
                          <Ionicons name="close" size={18} color={Colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {ultimoCambioExpanded && (
                      <View style={styles.carInfoCard}>
                        <View style={styles.carInfoRow}>
                          <Text style={styles.carInfoLabel}>Fecha</Text>
                          <Text style={styles.carInfoVal}>{formatFechaCar(cambiosAceite[0].fecha)}</Text>
                        </View>
                        <View style={styles.carInfoRow}>
                          <Text style={styles.carInfoLabel}>Km actual</Text>
                          <Text style={styles.carInfoVal}>{cambiosAceite[0].kmActual.toLocaleString()} km</Text>
                        </View>
                        <View style={styles.carInfoRow}>
                          <Text style={styles.carInfoLabel}>Producto</Text>
                          <Text style={styles.carInfoVal}>{cambiosAceite[0].producto}</Text>
                        </View>
                        <View style={[styles.carInfoRow, styles.carInfoRowHighlight]}>
                          <Text style={styles.carInfoLabel}>Próximo cambio</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.carInfoVal, { color: Colors.blue, fontWeight: '800' }]}>{cambiosAceite[0].kmProximo.toLocaleString()} km</Text>
                            {cambiosAceite[0].fechaProximo && (
                              <Text style={{ fontSize: FontSize.xs, color: Colors.blue, opacity: 0.75 }}>{formatFechaCar(cambiosAceite[0].fechaProximo)}</Text>
                            )}
                          </View>
                        </View>
                        <View style={styles.carFiltrosRow}>
                          <Text style={styles.carInfoLabel}>Filtro aire</Text>
                          <View style={[styles.carFiltroChip, { backgroundColor: cambiosAceite[0].filtroAire ? Colors.success + '22' : Colors.error + '22' }]}>
                            <Ionicons name={cambiosAceite[0].filtroAire ? 'checkmark-circle' : 'close-circle'} size={14} color={cambiosAceite[0].filtroAire ? Colors.success : Colors.error} />
                            <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: cambiosAceite[0].filtroAire ? Colors.success : Colors.error }}>{cambiosAceite[0].filtroAire ? 'Cambiado' : 'No cambiado'}</Text>
                          </View>
                        </View>
                        <View style={styles.carFiltrosRow}>
                          <Text style={styles.carInfoLabel}>Filtro de aceite</Text>
                          <View style={[styles.carFiltroChip, { backgroundColor: cambiosAceite[0].filtroGasolina ? Colors.success + '22' : Colors.error + '22' }]}>
                            <Ionicons name={cambiosAceite[0].filtroGasolina ? 'checkmark-circle' : 'close-circle'} size={14} color={cambiosAceite[0].filtroGasolina ? Colors.success : Colors.error} />
                            <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: cambiosAceite[0].filtroGasolina ? Colors.success : Colors.error }}>{cambiosAceite[0].filtroGasolina ? 'Cambiado' : 'No cambiado'}</Text>
                          </View>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {/* Formulario nuevo cambio */}
                {formAceite ? (
                  <>
                    <View style={styles.carInfoHeader}>
                      <Ionicons name="water-outline" size={16} color={Colors.blue} />
                      <Text style={styles.carInfoTitle}>Registrar cambio de aceite</Text>
                    </View>
                  <View style={styles.carForm}>
                    <View style={styles.carFieldWrap}>
                      <Text style={styles.carFieldLabel}>Km actual</Text>
                      <TextInput style={styles.input} value={formAceite.kmActual} onChangeText={t => setFormAceite(f => f && ({ ...f, kmActual: t }))} placeholder="ej: 125143" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                    </View>
                    <View style={styles.carFieldWrap}>
                      <Text style={styles.carFieldLabel}>Producto</Text>
                      <TextInput style={styles.input} value={formAceite.producto} onChangeText={t => setFormAceite(f => f && ({ ...f, producto: t }))} placeholder="ej: Valvoline 15W-40" placeholderTextColor={Colors.textMuted} autoCapitalize="words" />
                    </View>
                    <View style={styles.carFieldWrap}>
                      <Text style={styles.carFieldLabel}>Próximo cambio km</Text>
                      <TextInput style={styles.input} value={formAceite.kmProximo} onChangeText={t => setFormAceite(f => f && ({ ...f, kmProximo: t }))} placeholder="ej: 130143" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
                    </View>
                    <View style={styles.carFieldWrap}>
                      <Text style={styles.carFieldLabel}>Fecha próximo cambio</Text>
                      <TouchableOpacity style={styles.carDateBtn} onPress={() => setShowDatePickerAceite(true)}>
                        <Ionicons name="calendar-outline" size={16} color={formAceite.fechaProximo ? Colors.blue : Colors.textMuted} />
                        <Text style={[styles.carDateBtnText, formAceite.fechaProximo && { color: Colors.blue }]}>
                          {formAceite.fechaProximo ? formatFechaCar(formAceite.fechaProximo.toISOString()) : 'Seleccionar fecha…'}
                        </Text>
                        {formAceite.fechaProximo && (
                          <TouchableOpacity onPress={() => setFormAceite(f => f && ({ ...f, fechaProximo: null }))} hitSlop={10}>
                            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      {showDatePickerAceite && (
                        <DateTimePicker
                          value={formAceite.fechaProximo ?? new Date()}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={(_, date) => {
                            setShowDatePickerAceite(false);
                            if (date) setFormAceite(f => f && ({ ...f, fechaProximo: date }));
                          }}
                        />
                      )}
                    </View>
                    {/* Filtros opcionales */}
                    <View style={styles.carFieldWrap}>
                      <Text style={styles.carFieldLabel}>Filtros <Text style={{ fontWeight: '400', opacity: 0.6 }}>(opcional)</Text></Text>
                      <View style={styles.carFiltrosToggleRow}>
                        <TouchableOpacity style={[styles.carFiltroToggle, formAceite.filtroAire && styles.carFiltroToggleOn]} onPress={() => setFormAceite(f => f && ({ ...f, filtroAire: !f.filtroAire }))}>
                          <Ionicons name={formAceite.filtroAire ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={formAceite.filtroAire ? Colors.success : Colors.textMuted} />
                          <Text style={[styles.carFiltroToggleText, formAceite.filtroAire && { color: Colors.success }]}>Filtro aire</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.carFiltroToggle, formAceite.filtroGasolina && styles.carFiltroToggleOn]} onPress={() => setFormAceite(f => f && ({ ...f, filtroGasolina: !f.filtroGasolina }))}>
                          <Ionicons name={formAceite.filtroGasolina ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={formAceite.filtroGasolina ? Colors.success : Colors.textMuted} />
                          <Text style={[styles.carFiltroToggleText, formAceite.filtroGasolina && { color: Colors.success }]}>Filtro de aceite</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.modalBtns}>
                      <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setFormAceite(null)}>
                        <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: Colors.blue }]} onPress={registrarCambioAceite}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                        <Text style={styles.modalBtnConfirmText}>Guardar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  </>
                ) : (
                  <TouchableOpacity style={[styles.carAgregarBtn, { backgroundColor: Colors.blue }]} onPress={() => setFormAceite({ kmActual: '', producto: '', kmProximo: '', fechaProximo: null, filtroAire: false, filtroGasolina: false })}>
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={styles.carAgregarText}>Registrar cambio de aceite</Text>
                  </TouchableOpacity>
                )}

                {/* Historial de cambios */}
                {cambiosAceite.length > 1 && (
                  <View style={styles.histSection}>
                    <View style={styles.histTituloRow}>
                      <Ionicons name="time-outline" size={16} color={Colors.blue} />
                      <Text style={styles.histTitulo}>Historial</Text>
                    </View>
                    {cambiosAceite.slice(1).map(c => (
                      <View key={c.id} style={styles.carHistRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.carHistFecha}>{formatFechaCar(c.fecha)}</Text>
                          <Text style={styles.carHistProducto}>{c.producto} · {c.kmActual.toLocaleString()} km</Text>
                        </View>
                        <TouchableOpacity onPress={() => eliminarAceite(c.id)} hitSlop={10}>
                          <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* ── TAB LLANTAS ── */}
            {carTab === 'llantas' && (
              <>
                {(['alineacion', 'rotacion', 'balanceo'] as TipoLlanta[]).map(tipo => {
                  const ultimo = ultimoServicio(tipo);
                  const labels: Record<TipoLlanta, string> = { alineacion: 'Alineación', rotacion: 'Rotación', balanceo: 'Balanceo' };
                  const icons:  Record<TipoLlanta, any>    = { alineacion: 'git-branch-outline', rotacion: 'sync-outline', balanceo: 'radio-button-on-outline' };
                  return (
                    <View key={tipo}>
                      <View style={styles.carInfoHeader}>
                        <Ionicons name={icons[tipo]} size={16} color={Colors.blue} />
                        <Text style={styles.carInfoTitle}>{labels[tipo]}</Text>
                      </View>
                    <View style={styles.carInfoCard}>
                      {ultimo ? (
                        <>
                          <View style={styles.carInfoRow}>
                            <Text style={styles.carInfoLabel}>Último servicio</Text>
                            <Text style={styles.carInfoVal}>{formatFechaCar(ultimo.fecha)}</Text>
                          </View>
                          <View style={styles.carInfoRow}>
                            <Text style={styles.carInfoLabel}>Km</Text>
                            <Text style={styles.carInfoVal}>{ultimo.km.toLocaleString()} km</Text>
                          </View>
                        </>
                      ) : (
                        <Text style={{ fontSize: FontSize.sm, color: Colors.textMuted, paddingVertical: 4 }}>Sin registros aún</Text>
                      )}
                      <TouchableOpacity style={[styles.carAgregarBtn, { backgroundColor: Colors.blue, marginTop: 8 }]} onPress={() => setFormLlanta({ tipo, km: '' })}>
                        <Ionicons name="add-circle-outline" size={16} color="#fff" />
                        <Text style={styles.carAgregarText}>Registrar {labels[tipo].toLowerCase()}</Text>
                      </TouchableOpacity>
                    </View>
                    </View>
                  );
                })}

                {/* Historial llantas */}
                {serviciosLlantas.length > 0 && (
                  <View style={styles.histSection}>
                    <View style={styles.histTituloRow}>
                      <Ionicons name="time-outline" size={16} color={Colors.blue} />
                      <Text style={styles.histTitulo}>Historial</Text>
                    </View>
                    {serviciosLlantas.map(s => {
                      const labels: Record<TipoLlanta, string> = { alineacion: 'Alineación', rotacion: 'Rotación', balanceo: 'Balanceo' };
                      return (
                        <View key={s.id} style={styles.carHistRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.carHistFecha}>{labels[s.tipo]} · {formatFechaCar(s.fecha)}</Text>
                            <Text style={styles.carHistProducto}>{s.km.toLocaleString()} km</Text>
                          </View>
                          <TouchableOpacity onPress={() => eliminarLlanta(s.id)} hitSlop={10}>
                            <Ionicons name="trash-outline" size={15} color={Colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

          </ScrollView>
        </SafeAreaView>

        {/* Modal formulario llantas */}
        {formLlanta && (
          <Modal transparent visible animationType="fade" onRequestClose={() => setFormLlanta(null)}>
            <Pressable style={styles.modalOverlay} onPress={() => setFormLlanta(null)}>
              <Pressable style={styles.modalCard} onPress={e => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Ionicons name="refresh-circle-outline" size={22} color={Colors.blue} />
                  <Text style={styles.modalTitle}>
                    {{ alineacion: 'Alineación', rotacion: 'Rotación', balanceo: 'Balanceo' }[formLlanta.tipo]}
                  </Text>
                </View>
                <TextInput style={styles.input} value={formLlanta.km} onChangeText={t => setFormLlanta(f => f && ({ ...f, km: t }))} placeholder="Km actual (ej: 125143)" placeholderTextColor={Colors.textMuted} keyboardType="numeric" autoFocus />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setFormLlanta(null)}>
                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtnConfirm, { backgroundColor: Colors.blue }]} onPress={registrarServicioLlanta}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                    <Text style={styles.modalBtnConfirmText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}
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
  infoHeaderBtn: { padding: 4 },

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

  // ── Botones módulos superiores ────────────────────────────────────────────
  modBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: Radius.md,
    backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border,
  },
  modBtnActive:   { backgroundColor: Colors.blue, borderColor: Colors.blue },
  modBtnDisabled: { opacity: 0.5 },
  modBtnText:     { fontSize: FontSize.sm, fontWeight: '700', color: Colors.blue },

  // ── Car module ────────────────────────────────────────────────────────────
  carInfoCard: {
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 8,
  },
  carInfoHeaderRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carInfoHeaderBtns: { flexDirection: 'row', gap: 4 },
  carHeaderIconBtn:  { padding: 6 },
  carInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 2 },
  carInfoTitle:  { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  carInfoRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  carInfoRowHighlight: {
    backgroundColor: Colors.blue + '11', borderRadius: Radius.sm,
    paddingHorizontal: 6, paddingVertical: 4, marginTop: 2,
  },
  carInfoLabel:  { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  carInfoVal:    { fontSize: FontSize.sm, color: Colors.text, fontWeight: '700' },

  carFiltrosRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carFiltroChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },

  carFiltrosToggleRow: { flexDirection: 'row', gap: Spacing.sm },
  carFiltroToggle: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  carFiltroToggleOn:   { borderColor: Colors.success + '88', backgroundColor: Colors.success + '11' },
  carFiltroToggleText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },

  carForm:       { backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md },
  carFormTitle:  { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  carFieldWrap:  { gap: 4 },
  carFieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, paddingLeft: 2 },
  carDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.cardAlt, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  carDateBtnText: { flex: 1, fontSize: FontSize.md, color: Colors.textMuted },

  carAgregarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: Radius.md,
  },
  carAgregarText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  carHistRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
  },
  carHistFecha:    { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  carHistProducto: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
}); }
