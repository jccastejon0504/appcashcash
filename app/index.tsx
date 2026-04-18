import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, Share, Modal, Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { getItem, setItem } from '@/services/storage';
import { useTheme } from '@/contexts/ThemeContext';

const CACHE_KEY    = 'bcv_cache';
const CUATRO_HORAS = 4 * 60 * 60 * 1000;

// Paleta oscura estilo Rial con acento amarillo
const C = {
  bg:           '#F5F7FA',
  card:         '#FFFFFF',
  cardAlt:      '#EEF1F6',
  border:       '#DDE4EF',
  accent:       '#4AADE8',
  accentDark:   '#2E8BC0',
  accentMuted:  '#4AADE822',
  text:         '#0D1B35',
  textSec:      '#4A6180',
  textMuted:    '#9AAFC4',
  blue:         '#4AADE8',
  success:      '#4CAF50',
};

// Oscurece un color hex por un factor (0–1)
const shadeHex = (hex: string, factor: number) => {
  const r = Math.min(255, Math.round(parseInt(hex.slice(1, 3), 16) * factor));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3, 5), 16) * factor));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5, 7), 16) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Color complementario (opuesto en el círculo cromático)
const complementHex = (hex: string) => {
  const r = 255 - parseInt(hex.slice(1, 3), 16);
  const g = 255 - parseInt(hex.slice(3, 5), 16);
  const b = 255 - parseInt(hex.slice(5, 7), 16);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

type Moneda = 'usd' | 'eur';
type Fuente = 'bcv' | 'usdt';

export default function CalculadoraBCVScreen() {
  const [moneda,   setMoneda]   = useState<Moneda>('usd');
  const [fuente,   setFuente]   = useState<Fuente>('bcv');
  const [valor,    setValor]    = useState('');
  const [bs,       setBs]       = useState('');
  const editando = useRef<'divisa' | 'bs' | null>(null);

  const [tasaUSD,     setTasaUSD]     = useState<number | null>(null);
  const [tasaEUR,     setTasaEUR]     = useState<number | null>(null);
  const [tasaBinance, setTasaBinance] = useState<number | null>(null);
  const [fecha,       setFecha]       = useState('');
  const [fechaBinance,setFechaBinance]= useState('');
  const [loading,     setLoading]     = useState(false);
  const [loadingBin,  setLoadingBin]  = useState(false);
  const [error,       setError]       = useState('');
  const [copiado,       setCopiado]       = useState<'divisa' | 'bs' | null>(null);
  const [menuVisible,   setMenuVisible]   = useState(false);
  const [configVisible, setConfigVisible] = useState(false);
  const { colors: T, temaOscuro, colorAccent, colorTexto, colorBs, guardarTema, guardarColor, guardarTexto, guardarBs } = useTheme();
  const router = useRouter();

  const tasaBCV = moneda === 'usd' ? tasaUSD : tasaEUR;
  const tasa    = fuente === 'bcv' ? tasaBCV : (moneda === 'usd' ? tasaBinance : null);

  useEffect(() => { fetchTasa(); fetchUSDT(); }, []);

  useEffect(() => {
    if (!valor || !tasa) { setBs(''); return; }
    const n = parseFloat(valor.replace(',', '.'));
    if (!isNaN(n)) setBs((n * tasa).toFixed(2));
  }, [moneda, fuente, tasaUSD, tasaEUR, tasaBinance]);

  const fetchConTimeout = async (url: string, ms = 8000) => {
    const ctrl = new AbortController();
    const id   = setTimeout(() => ctrl.abort(), ms);
    try   { const r = await fetch(url, { signal: ctrl.signal }); clearTimeout(id); return r; }
    catch (e) { clearTimeout(id); throw e; }
  };

  const fetchTasa = async (forzar = false) => {
    setError('');
    const cache = await getItem<{ usd: number; eur: number; fecha: string; ts: number }>(CACHE_KEY);
    if (!forzar && cache && Date.now() - cache.ts < CUATRO_HORAS) {
      setTasaUSD(cache.usd); setTasaEUR(cache.eur); setFecha(cache.fecha); return;
    }
    setLoading(true);

    let tasaUsdVal: number | null = null;
    let tasaEurVal: number | null = null;
    let fechaStr = '';

    try {
      const r = await fetchConTimeout('https://ve.dolarapi.com/v1/dolares/oficiales');
      const d = await r.json();
      tasaUsdVal = parseFloat(d.promedio ?? d.promedio_real) || null;
      fechaStr   = d.fechaActualizacion ?? d.fecha ?? '';
    } catch { }

    if (!tasaUsdVal) {
      try {
        const r = await fetchConTimeout('https://pydolarve.org/api/v1/dollar?page=bcv');
        const d = await r.json();
        tasaUsdVal = parseFloat(d?.monitors?.usd?.price) || null;
        fechaStr   = d?.monitors?.usd?.last_update ?? '';
      } catch { }
    }

    try {
      const r = await fetchConTimeout('https://open.er-api.com/v6/latest/USD');
      const d = await r.json();
      if (!tasaUsdVal) {
        tasaUsdVal = parseFloat(d?.rates?.VES) || null;
        fechaStr   = d?.time_last_update_utc ?? '';
      }
      const eurPorUsd = parseFloat(d?.rates?.EUR) || 0;
      if (tasaUsdVal && eurPorUsd > 0) tasaEurVal = tasaUsdVal / eurPorUsd;
    } catch { }

    if (tasaUsdVal) {
      setTasaUSD(tasaUsdVal);
      setFecha(fechaStr);
      if (tasaEurVal) setTasaEUR(tasaEurVal);
      await setItem(CACHE_KEY, { usd: tasaUsdVal, eur: tasaEurVal ?? 0, fecha: fechaStr, ts: Date.now() });
    } else {
      if (cache) {
        setTasaUSD(cache.usd); setTasaEUR(cache.eur || null); setFecha(cache.fecha);
        setError('Sin conexión. Usando tasa guardada.');
      } else {
        setError('No se pudo obtener la tasa BCV.');
      }
    }
    setLoading(false);
  };

  const fetchUSDT = async (forzar = false) => {
    const CACHE_BIN = 'binance_cache';
    const cache = await getItem<{ usdt: number; fecha: string; ts: number }>(CACHE_BIN);
    if (!forzar && cache && Date.now() - cache.ts < CUATRO_HORAS) {
      setTasaBinance(cache.usdt); setFechaBinance(cache.fecha); return;
    }
    setLoadingBin(true);
    let tasaVal: number | null = null;
    let fechaStr = new Date().toISOString();

    try {
      const r = await fetchConTimeout('https://pydolarve.org/api/v1/dollar?page=binance');
      const d = await r.json();
      const precio = parseFloat(d?.monitors?.usdt?.price ?? d?.monitors?.usd?.price);
      if (!isNaN(precio) && precio > 0) {
        tasaVal  = precio;
        fechaStr = d?.monitors?.usdt?.last_update ?? d?.monitors?.usd?.last_update ?? fechaStr;
      }
    } catch { }

    if (!tasaVal) {
      try {
        const r = await fetchConTimeout('https://ve.dolarapi.com/v1/dolares');
        const d = await r.json();
        const item = Array.isArray(d)
          ? d.find((x: any) => /paralelo|paralela|cripto|usdt/i.test(x.nombre ?? x.fuente ?? ''))
          : null;
        const precio = parseFloat(item?.promedio ?? item?.promedio_real);
        if (!isNaN(precio) && precio > 0) {
          tasaVal  = precio;
          fechaStr = item?.fechaActualizacion ?? item?.fecha ?? fechaStr;
        }
      } catch { }
    }

    if (!tasaVal) {
      try {
        const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fiat: 'VES', asset: 'USDT', tradeType: 'BUY',
            page: 1, rows: 5, payTypes: [],
            publisherType: null, classifies: ['mass', 'profession', 'fiat_trade'],
          }),
        });
        const d = await res.json();
        const precios: number[] = (d?.data ?? [])
          .map((x: any) => parseFloat(x?.adv?.price))
          .filter((p: number) => !isNaN(p) && p > 0);
        if (precios.length > 0)
          tasaVal = precios.reduce((a, b) => a + b, 0) / precios.length;
      } catch { }
    }

    if (tasaVal) {
      setTasaBinance(tasaVal);
      setFechaBinance(fechaStr);
      await setItem(CACHE_BIN, { usdt: tasaVal, fecha: fechaStr, ts: Date.now() });
    }
    setLoadingBin(false);
  };

  const recargarTodo = (forzar = true) => { fetchTasa(forzar); fetchUSDT(forzar); };

  const onChangeDivisa = (val: string) => {
    editando.current = 'divisa';
    setValor(val);
    if (tasa && val) {
      const n = parseFloat(val.replace(',', '.'));
      setBs(isNaN(n) ? '' : (n * tasa).toFixed(2));
    } else { setBs(''); }
  };

  const onChangeBs = (val: string) => {
    editando.current = 'bs';
    setBs(val);
    if (tasa && val) {
      const n = parseFloat(val.replace(',', '.'));
      setValor(isNaN(n) ? '' : (n / tasa).toFixed(2));
    } else { setValor(''); }
  };

  const reiniciar = () => { setValor(''); setBs(''); };

  const copiar = async (v: string, campo: 'divisa' | 'bs') => {
    if (!v) return;
    await Clipboard.setStringAsync(v);
    setCopiado(campo);
    setTimeout(() => setCopiado(null), 1500);
  };

  const compartir = async () => {
    if (!valor && !bs) return;
    const sym   = moneda === 'usd' ? '$' : '€';
    const label = fuente === 'bcv'
      ? (moneda === 'usd' ? 'Dólar BCV' : 'Euro (ref. BCV)')
      : 'USDT P2P';
    const msg = `💵 Calculadora BCV\n${label}  ·  Bs ${tasa?.toFixed(2)}\n` +
      (valor ? `${sym} ${valor}  →  Bs ${bs}\n` : '') +
      (fecha  ? `Actualizado: ${fecha}` : '');
    await Share.share({ message: msg });
  };

  const isLoadingAny = loading || loadingBin;
  const simbolo      = moneda === 'usd' ? '$' : '€';
  const codigoIso    = moneda === 'usd' ? 'USD' : 'EUR';
  const quickMontos  = moneda === 'usd' ? [5, 10, 15, 20, 25, 30] : [5, 10, 20, 50, 100, 200];
  const fechaMostrar = fuente === 'bcv' ? fecha : fechaBinance;

  // Paleta de colores disponibles
  const PALETA = [
    { nombre: 'Azul',    color: '#4AADE8' },
    { nombre: 'Índigo',  color: '#6366F1' },
    { nombre: 'Violeta', color: '#A78BFA' },
    { nombre: 'Morado',  color: '#9333EA' },
    { nombre: 'Rosa',    color: '#EC4899' },
    { nombre: 'Rojo',    color: '#EF5350' },
    { nombre: 'Naranja', color: '#F97316' },
    { nombre: 'Ámbar',   color: '#F59E0B' },
    { nombre: 'Lima',    color: '#84CC16' },
    { nombre: 'Verde',   color: '#22C55E' },
    { nombre: 'Esme',    color: '#10B981' },
    { nombre: 'Teal',    color: '#14B8A6' },
    { nombre: 'Cian',    color: '#06B6D4' },
    { nombre: 'Celeste', color: '#38BDF8' },
  ];

  // Paleta de colores de texto
  const PALETA_TEXTO = temaOscuro ? [
    { nombre: 'Auto',    color: '' },
    { nombre: 'Blanco',  color: '#FFFFFF' },
    { nombre: 'Crema',   color: '#F5F0E8' },
    { nombre: 'Gris cla',color: '#D1D9E6' },
    { nombre: 'Plata',   color: '#B0BEC5' },
    { nombre: 'Azul cla',color: '#A8C8E8' },
    { nombre: 'Cian',    color: '#80DEEA' },
    { nombre: 'Verde cla',color: '#A5D6A7' },
    { nombre: 'Lima',    color: '#CDDC39' },
    { nombre: 'Dorado',  color: '#F5C842' },
    { nombre: 'Naranja', color: '#FFAB76' },
    { nombre: 'Rosa',    color: '#F48FB1' },
    { nombre: 'Violeta', color: '#CE93D8' },
    { nombre: 'Salmón',  color: '#EF9A9A' },
  ] : [
    { nombre: 'Auto',    color: '' },
    { nombre: 'Negro',   color: '#0D1B35' },
    { nombre: 'Gris osc',color: '#2D3748' },
    { nombre: 'Slate',   color: '#4A5568' },
    { nombre: 'Grafito', color: '#37474F' },
    { nombre: 'Índigo',  color: '#3730A3' },
    { nombre: 'Azul',    color: '#1565C0' },
    { nombre: 'Verde',   color: '#2E7D32' },
    { nombre: 'Teal',    color: '#00695C' },
    { nombre: 'Marrón',  color: '#78350F' },
    { nombre: 'Rojo',    color: '#B71C1C' },
    { nombre: 'Morado',  color: '#6A1B9A' },
    { nombre: 'Rosa osc',color: '#880E4F' },
    { nombre: 'Naranja', color: '#E65100' },
  ];

  const eurColor  = shadeHex(T.accent, 0.72);
  const usdtColor = shadeHex(T.accent, 0.50);
  const bsColor   = colorBs || complementHex(T.accent);
  const fuenteColor  = fuente === 'usdt' ? usdtColor : (moneda === 'eur' ? eurColor : T.accent);
  const monedaColor  = fuente === 'usdt' ? usdtColor : (moneda === 'eur' ? eurColor : T.accent);

  const formatFecha = (f: string) => {
    try { return new Date(f).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return f; }
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: T.background }]}>

      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: T.background }]}>
        <Text style={[s.headerTitle, { color: T.text }]}>Cash Cash</Text>
        <TouchableOpacity onPress={() => recargarTodo(true)} style={[s.iconBtn, { backgroundColor: T.card, borderColor: T.border }]} disabled={isLoadingAny}>
          {isLoadingAny
            ? <ActivityIndicator size="small" color={T.accent} />
            : <Ionicons name="refresh-outline" size={20} color={T.accent} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={compartir} style={[s.iconBtn, { backgroundColor: T.card, borderColor: T.border }]}>
          <Ionicons name="share-social-outline" size={20} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setConfigVisible(true)} style={[s.iconBtn, { backgroundColor: T.card, borderColor: T.border }]}>
          <Ionicons name="settings-outline" size={20} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={[s.iconBtn, { backgroundColor: T.card, borderColor: T.border }]}>
          <Ionicons name="ellipsis-vertical" size={20} color={T.text} />
        </TouchableOpacity>
      </View>

      {/* ── Modal Configuración UI ── */}
      <Modal transparent visible={configVisible} animationType="slide" onRequestClose={() => setConfigVisible(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setConfigVisible(false)}>
          <Pressable style={[s.configSheet, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => {}}>
            <View style={[s.configHandle, { backgroundColor: T.border }]} />
            <Text style={[s.configTitle, { color: T.text }]}>Apariencia</Text>

            {/* Toggle claro / oscuro */}
            <Text style={[s.configSectionLabel, { color: T.textMuted }]}>TEMA</Text>
            <View style={[s.temaRow, { backgroundColor: T.cardAlt, borderColor: T.border }]}>
              <TouchableOpacity
                style={[s.temaPill, !temaOscuro && { backgroundColor: T.accent }]}
                onPress={() => guardarTema(false)}
              >
                <Ionicons name="sunny-outline" size={16} color={!temaOscuro ? '#fff' : T.textMuted} />
                <Text style={[s.temaPillText, { color: !temaOscuro ? '#fff' : T.textMuted }]}>Claro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.temaPill, temaOscuro && { backgroundColor: T.accent }]}
                onPress={() => guardarTema(true)}
              >
                <Ionicons name="moon-outline" size={16} color={temaOscuro ? '#fff' : T.textMuted} />
                <Text style={[s.temaPillText, { color: temaOscuro ? '#fff' : T.textMuted }]}>Oscuro</Text>
              </TouchableOpacity>
            </View>

            {/* Selector de color acento */}
            <Text style={[s.configSectionLabel, { color: T.textMuted }]}>COLOR DE ACENTO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paletaRow}>
              {PALETA.map((p) => {
                const seleccionado = colorAccent === p.color;
                return (
                  <TouchableOpacity
                    key={p.color}
                    style={s.swatchWrap}
                    onPress={() => guardarColor(p.color)}
                    activeOpacity={0.8}
                  >
                    <View style={[s.swatch, { backgroundColor: p.color }, seleccionado && s.swatchSelected]}>
                      {seleccionado && <Ionicons name="checkmark" size={18} color="#fff" />}
                    </View>
                    <Text style={[s.swatchLabel, { color: seleccionado ? p.color : T.textMuted }]}>
                      {p.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Selector de color de texto */}
            <Text style={[s.configSectionLabel, { color: T.textMuted }]}>COLOR DE TEXTO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paletaRow}>
              {PALETA_TEXTO.map((p) => {
                const activo = colorTexto === p.color;
                const bgColor = p.color || (temaOscuro ? '#FFFFFF' : '#0D1B35');
                return (
                  <TouchableOpacity
                    key={p.nombre}
                    style={s.swatchWrap}
                    onPress={() => guardarTexto(p.color)}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      s.swatch,
                      { backgroundColor: bgColor, borderWidth: 1, borderColor: T.border },
                      activo && s.swatchSelected,
                    ]}>
                      {p.color === '' && (
                        <Ionicons name="sync-outline" size={20} color={temaOscuro ? '#0A1628' : '#F5F7FA'} />
                      )}
                      {activo && p.color !== '' && <Ionicons name="checkmark" size={18} color={temaOscuro ? '#0A1628' : '#fff'} />}
                    </View>
                    <Text style={[s.swatchLabel, { color: activo ? T.accent : T.textMuted }]}>
                      {p.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Selector de color Bs */}
            <Text style={[s.configSectionLabel, { color: T.textMuted }]}>COLOR DE Bs / BOLÍVARES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paletaRow}>
              {[
                { nombre: 'Auto',    color: '' },
                { nombre: 'Azul',    color: '#4AADE8' },
                { nombre: 'Índigo',  color: '#6366F1' },
                { nombre: 'Violeta', color: '#A78BFA' },
                { nombre: 'Morado',  color: '#9333EA' },
                { nombre: 'Rosa',    color: '#EC4899' },
                { nombre: 'Rojo',    color: '#EF5350' },
                { nombre: 'Naranja', color: '#F97316' },
                { nombre: 'Ámbar',   color: '#F59E0B' },
                { nombre: 'Lima',    color: '#84CC16' },
                { nombre: 'Verde',   color: '#22C55E' },
                { nombre: 'Esme',    color: '#10B981' },
                { nombre: 'Teal',    color: '#14B8A6' },
                { nombre: 'Cian',    color: '#06B6D4' },
                { nombre: 'Celeste', color: '#38BDF8' },
              ].map((p) => {
                const activo = colorBs === p.color;
                const bgColor = p.color || bsColor;
                return (
                  <TouchableOpacity
                    key={p.nombre}
                    style={s.swatchWrap}
                    onPress={() => guardarBs(p.color)}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      s.swatch,
                      { backgroundColor: bgColor },
                      activo && s.swatchSelected,
                    ]}>
                      {p.color === '' && <Ionicons name="sync-outline" size={20} color="#fff" />}
                      {activo && p.color !== '' && <Ionicons name="checkmark" size={18} color="#fff" />}
                    </View>
                    <Text style={[s.swatchLabel, { color: activo ? T.accent : T.textMuted }]}>
                      {p.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[s.configCerrar, { backgroundColor: T.cardAlt, borderColor: T.border }]}
              onPress={() => setConfigVisible(false)}
            >
              <Text style={[s.configCerrarText, { color: T.textSecondary }]}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Menú ── */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[s.menuCard, { backgroundColor: T.card, borderColor: T.border }]}>
            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); router.navigate('/listado'); }}>
              <Ionicons name="cart-outline" size={18} color={T.success} />
              <Text style={[s.menuItemText, { color: T.success }]}>Compras / Presupuesto</Text>
            </TouchableOpacity>
            <View style={[s.menuDivider, { backgroundColor: T.border }]} />
            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); router.navigate('/comparacion'); }}>
              <Ionicons name="bar-chart-outline" size={18} color={T.accent} />
              <Text style={[s.menuItemText, { color: T.accent }]}>Comercio / Productos</Text>
            </TouchableOpacity>
            <View style={[s.menuDivider, { backgroundColor: T.border }]} />
            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); router.navigate({ pathname: '/comparacion', params: { vista: 'comparar' } }); }}>
              <Ionicons name="podium-outline" size={18} color={T.blue} />
              <Text style={[s.menuItemText, { color: T.blue }]}>Comparar precios</Text>
            </TouchableOpacity>
            <View style={[s.menuDivider, { backgroundColor: T.border }]} />
            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuVisible(false); router.navigate('/gastos'); }}>
              <Ionicons name="wallet-outline" size={18} color="#A78BFA" />
              <Text style={[s.menuItemText, { color: '#A78BFA' }]}>Cartera</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Tarjeta de tasa principal ── */}
        <View style={[s.rateCard, { backgroundColor: fuenteColor }]}>
          <View style={s.rateCardTop}>
            <Text style={s.rateCardLabel}>Tasa actual</Text>
            {fechaMostrar ? <Text style={s.rateCardDate}>{formatFecha(fechaMostrar)}</Text> : null}
          </View>

          {tasa ? (
            <Text style={s.rateCardValue}>
              Bs {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          ) : (
            <Text style={s.rateCardValue}>
              {isLoadingAny ? 'Cargando...' : '---'}
            </Text>
          )}

          {/* Toggle fuente + moneda */}
          <View style={s.rateToggles}>
            <TouchableOpacity
              style={[s.togglePill, fuente === 'bcv' && moneda === 'usd' && s.togglePillActive]}
              onPress={() => { setFuente('bcv'); setMoneda('usd'); reiniciar(); }}
            >
              <Text style={[s.togglePillText, fuente === 'bcv' && moneda === 'usd' && s.togglePillTextActive]}>$ USD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.togglePill, fuente === 'bcv' && moneda === 'eur' && s.togglePillActive]}
              onPress={() => { setFuente('bcv'); setMoneda('eur'); reiniciar(); }}
            >
              <Text style={[s.togglePillText, fuente === 'bcv' && moneda === 'eur' && s.togglePillTextActive]}>€ EUR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.togglePill, fuente === 'usdt' && s.togglePillActive]}
              onPress={() => { setFuente('usdt'); setMoneda('usd'); reiniciar(); }}
            >
              <Text style={[s.togglePillText, fuente === 'usdt' && s.togglePillTextActive]}>₮ USDT</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={s.errorRow}>
              <Ionicons name="warning-outline" size={12} color="#000" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Tarjeta de conversión ── */}
        <View style={[s.convCard, { backgroundColor: T.card, borderColor: T.border }]}>

          {/* Campo divisa */}
          <View style={s.fieldRow}>
            <View style={s.fieldLabelWrap}>
              <Text style={[s.fieldSym, { color: monedaColor }]}>{fuente === 'usdt' ? '₮' : simbolo}</Text>
              <Text style={[s.fieldCode, { color: T.textMuted }]}>{fuente === 'usdt' ? 'USDT' : codigoIso}</Text>
            </View>
            <TextInput
              style={[s.fieldInput, { color: monedaColor }]}
              value={valor} onChangeText={onChangeDivisa}
              keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={T.textMuted}
            />
            <TouchableOpacity
              style={[s.copyBtn, { backgroundColor: T.cardAlt, borderColor: T.border }, copiado === 'divisa' && s.copyBtnDone]}
              onPress={() => copiar(valor, 'divisa')} disabled={!valor}
            >
              <Ionicons
                name={copiado === 'divisa' ? 'checkmark-outline' : 'copy-outline'}
                size={16}
                color={copiado === 'divisa' ? T.success : valor ? T.textSecondary : T.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Divisor swap */}
          <View style={s.swapRow}>
            <View style={[s.swapLine, { backgroundColor: T.border }]} />
            <View style={[s.swapCircle, { borderColor: fuenteColor + '55', backgroundColor: T.cardAlt }]}>
              <Ionicons name="swap-vertical" size={15} color={fuenteColor} />
            </View>
            <View style={[s.swapLine, { backgroundColor: T.border }]} />
          </View>

          {/* Campo Bs */}
          <View style={s.fieldRow}>
            <View style={s.fieldLabelWrap}>
              <Text style={[s.fieldSym, { color: bsColor }]}>Bs</Text>
              <Text style={[s.fieldCode, { color: T.textMuted }]}>VES</Text>
            </View>
            <TextInput
              style={[s.fieldInput, { color: bsColor }]}
              value={bs} onChangeText={onChangeBs}
              keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={T.textMuted}
            />
            <TouchableOpacity
              style={[s.copyBtn, { backgroundColor: T.cardAlt, borderColor: T.border }, copiado === 'bs' && s.copyBtnDone]}
              onPress={() => copiar(bs, 'bs')} disabled={!bs}
            >
              <Ionicons
                name={copiado === 'bs' ? 'checkmark-outline' : 'copy-outline'}
                size={16}
                color={copiado === 'bs' ? T.success : bs ? T.textSecondary : T.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Botones acción ── */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={[s.btnSecondary, { backgroundColor: T.card, borderColor: T.border }]} onPress={reiniciar}>
            <Ionicons name="refresh-outline" size={17} color={T.textSecondary} />
            <Text style={[s.btnSecondaryText, { color: T.textSecondary }]}>Reiniciar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnPrimary, { backgroundColor: fuenteColor }]} onPress={compartir}>
            <Ionicons name="share-social-outline" size={17} color="#fff" />
            <Text style={s.btnPrimaryText}>Compartir</Text>
          </TouchableOpacity>
        </View>

        {/* ── Rápidos divisa ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: fuenteColor }]}>
            Rápidos en {fuente === 'usdt' ? '₮ USDT' : simbolo}
          </Text>
          <View style={s.quickGrid}>
            {quickMontos.map((v) => (
              <TouchableOpacity key={v} style={[s.quickBtn, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => onChangeDivisa(v.toString())}>
                <Text style={[s.quickMain, { color: T.text }]}>{fuente === 'usdt' ? '₮' : simbolo}{v}</Text>
                {tasa ? (
                  <Text style={[s.quickSub, { color: fuenteColor }]}>
                    {(v * tasa).toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Rápidos Bs ── */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: bsColor }]}>Rápidos en Bs</Text>
          <View style={s.quickGrid}>
            {[500, 1000, 2000, 5000, 10000, 20000].map((v) => (
              <TouchableOpacity key={v} style={[s.quickBtn, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => onChangeBs(v.toString())}>
                <Text style={[s.quickMain, { color: T.text }]}>{v.toLocaleString('es-VE')} Bs</Text>
                {tasa ? (
                  <Text style={[s.quickSub, { color: bsColor }]}>
                    {fuente === 'usdt' ? '₮' : simbolo}{(v / tasa).toFixed(2)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    backgroundColor: C.bg,
  },
  headerTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '800', color: C.text },
  iconBtn: {
    padding: 8, borderRadius: Radius.md,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },

  // Menú
  menuOverlay: { flex: 1 },
  menuCard: {
    position: 'absolute', top: 90, right: Spacing.lg,
    borderRadius: Radius.md, borderWidth: 1,
    minWidth: 210, elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },

  // Config sheet
  configSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, padding: Spacing.lg, paddingBottom: 40, gap: Spacing.md,
  },
  configHandle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  configTitle:       { fontSize: FontSize.xl, fontWeight: '800' },
  configSectionLabel:{ fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1, marginTop: 4 },

  // Toggle tema
  temaRow: {
    flexDirection: 'row', borderRadius: Radius.lg,
    borderWidth: 1, padding: 4, gap: 4,
  },
  temaPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md,
  },
  temaPillText: { fontSize: FontSize.sm, fontWeight: '700' },

  // Swatches
  paletaRow:   { paddingVertical: 4, gap: 12, paddingHorizontal: 2 },
  swatchWrap:  { alignItems: 'center', gap: 6 },
  swatch: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  swatchLabel: { fontSize: FontSize.xs, fontWeight: '700' },

  // Preview
  previewBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 12,
  },
  previewText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },

  configCerrar: {
    borderRadius: Radius.lg, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1,
  },
  configCerrarText: { fontSize: FontSize.md, fontWeight: '700' },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  menuItemText: { fontSize: FontSize.md, fontWeight: '600' },
  menuDivider:  { height: 1, backgroundColor: C.border },

  // Body
  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md },

  // Tarjeta tasa
  rateCard: {
    borderRadius: Radius.xl, padding: Spacing.lg, gap: 6,
  },
  rateCardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateCardLabel:{ fontSize: FontSize.sm, fontWeight: '700', color: '#ffffff99' },
  rateCardDate: { fontSize: FontSize.xs, fontWeight: '600', color: '#ffffff77' },
  rateCardValue:{ fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  rateToggles:  { flexDirection: 'row', gap: 8, marginTop: 8 },
  togglePill: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#ffffff18',
  },
  togglePillActive: { backgroundColor: '#ffffffDD' },
  togglePillText:   { fontSize: FontSize.sm, fontWeight: '700', color: '#ffffff99' },
  togglePillTextActive: { color: '#000' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  errorText: { fontSize: FontSize.xs, color: '#fff', fontWeight: '600' },

  // Conversión
  convCard: {
    backgroundColor: C.card, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: C.border, overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  fieldLabelWrap: { alignItems: 'center', width: 46 },
  fieldSym:  { fontSize: FontSize.xxl, fontWeight: '900' },
  fieldCode: { fontSize: FontSize.xs, color: C.textMuted, fontWeight: '600' },
  fieldInput:{ flex: 1, fontSize: 30, fontWeight: '800', textAlign: 'right', color: C.text },
  copyBtn: {
    padding: 8, borderRadius: Radius.sm,
    backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border,
  },
  copyBtnDone: { backgroundColor: C.success + '22', borderColor: C.success + '55' },
  swapRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg },
  swapLine:  { flex: 1, height: 1, backgroundColor: C.border },
  swapCircle:{
    borderRadius: Radius.full, padding: 6,
    marginHorizontal: 8, borderWidth: 1,
    backgroundColor: C.cardAlt,
  },

  // Acciones
  actionsRow: { flexDirection: 'row', gap: Spacing.sm },
  btnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: C.card, borderRadius: Radius.lg,
    paddingVertical: 14, borderWidth: 1, borderColor: C.border,
  },
  btnSecondaryText: { fontSize: FontSize.md, fontWeight: '700', color: C.textSec },
  btnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: Radius.lg, paddingVertical: 14,
  },
  btnPrimaryText: { fontSize: FontSize.md, fontWeight: '800', color: '#fff' },

  // Rápidos
  section: { gap: 10 },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '800' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    flex: 1, minWidth: '28%',
    backgroundColor: C.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    paddingVertical: 10, alignItems: 'center', gap: 3,
  },
  quickMain: { fontSize: FontSize.md, fontWeight: '800', color: C.text },
  quickSub:  { fontSize: FontSize.xs, fontWeight: '600' },
});
