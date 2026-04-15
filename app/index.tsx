import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView,
  ActivityIndicator, Share, Modal, Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '@/constants/theme';
import { getItem, setItem } from '@/services/storage';

const CACHE_KEY    = 'bcv_cache';
const CUATRO_HORAS = 4 * 60 * 60 * 1000;

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
  const [copiado,     setCopiado]     = useState<'divisa' | 'bs' | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
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
      if (tasaUsdVal && eurPorUsd > 0) {
        tasaEurVal = tasaUsdVal / eurPorUsd;
      }
    } catch { }

    if (tasaUsdVal) {
      setTasaUSD(tasaUsdVal);
      setFecha(fechaStr);
      if (tasaEurVal) setTasaEUR(tasaEurVal);
      await setItem(CACHE_KEY, { usd: tasaUsdVal, eur: tasaEurVal ?? 0, fecha: fechaStr, ts: Date.now() });
    } else {
      if (cache) {
        setTasaUSD(cache.usd); setTasaEUR(cache.eur || null); setFecha(cache.fecha);
        setError('Sin conexión. Tasa guardada.');
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

    // 1. pydolarve.org — agrega múltiples fuentes P2P venezolanas
    try {
      const r = await fetchConTimeout('https://pydolarve.org/api/v1/dollar?page=binance');
      const d = await r.json();
      const precio = parseFloat(d?.monitors?.usdt?.price ?? d?.monitors?.usd?.price);
      if (!isNaN(precio) && precio > 0) {
        tasaVal  = precio;
        fechaStr = d?.monitors?.usdt?.last_update ?? d?.monitors?.usd?.last_update ?? fechaStr;
      }
    } catch { }

    // 2. ve.dolarapi.com — API venezolana oficial de tasas
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

    // 3. Binance P2P directo — último recurso
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

  const recargarTodo = (forzar = true) => {
    fetchTasa(forzar);
    fetchUSDT(forzar);
  };

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

  const colorFuente  = fuente === 'bcv' ? Colors.success : '#F59E0B';
  const colorDivisa  = fuente === 'usdt' ? '#F59E0B' : (moneda === 'usd' ? Colors.success : '#6366F1');
  const colorBadge   = fuente === 'bcv' ? (moneda === 'usd' ? '#F59E0B' : '#6366F1') : '#F59E0B';
  const simbolo      = moneda === 'usd' ? '$' : '€';
  const codigoIso    = moneda === 'usd' ? 'USD' : 'EUR';
  const quickMontos  = moneda === 'usd' ? [5, 10, 15, 20, 25, 30] : [5, 10, 20, 50, 100, 200];
  const isLoadingAny = loading || loadingBin;

  const labelTasa = fuente === 'bcv'
    ? (moneda === 'usd' ? 'Dólar BCV' : 'Euro ref. BCV')
    : 'USDT P2P';
  const fechaMostrar = fuente === 'bcv' ? fecha : fechaBinance;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calculadora BCV</Text>
        <TouchableOpacity onPress={() => recargarTodo(true)} style={styles.iconBtn} disabled={isLoadingAny}>
          {isLoadingAny
            ? <ActivityIndicator size="small" color="#F59E0B" />
            : <Ionicons name="refresh-outline" size={20} color="#F59E0B" />}
        </TouchableOpacity>
        <TouchableOpacity onPress={compartir} style={styles.iconBtn}>
          <Ionicons name="share-social-outline" size={20} color={Colors.blue} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Menú desplegable */}
      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/listado'); }}>
              <Ionicons name="cart-outline" size={18} color={Colors.success} />
              <Text style={[styles.menuItemText, { color: Colors.success }]}>Compras / Presupuesto</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/comparacion'); }}>
              <Ionicons name="bar-chart-outline" size={18} color="#F59E0B" />
              <Text style={[styles.menuItemText, { color: '#F59E0B' }]}>Comercio / Productos</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push({ pathname: '/comparacion', params: { vista: 'comparar' } }); }}>
              <Ionicons name="podium-outline" size={18} color={Colors.blue} />
              <Text style={[styles.menuItemText, { color: Colors.blue }]}>Comparar precios</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); router.push('/gastos'); }}>
              <Ionicons name="wallet-outline" size={18} color="#A78BFA" />
              <Text style={[styles.menuItemText, { color: '#A78BFA' }]}>Ingresos y Gastos</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

        {/* Toggle Fuente: BCV / Binance */}
        <View style={styles.fuenteRow}>
          {(['bcv', 'usdt'] as Fuente[]).map((f) => {
            const activo = fuente === f;
            const color  = f === 'bcv' ? Colors.success : '#F59E0B';
            return (
              <TouchableOpacity
                key={f}
                style={[styles.fuenteBtn, { borderColor: activo ? color : Colors.border, backgroundColor: activo ? color + '22' : Colors.cardAlt }]}
                onPress={() => { setFuente(f); if (f === 'usdt') setMoneda('usd'); reiniciar(); }}
              >
                <Ionicons
                  name={f === 'bcv' ? 'business-outline' : 'logo-bitcoin'}
                  size={16}
                  color={activo ? color : Colors.textSecondary}
                />
                <Text style={[styles.fuenteLabel, { color: activo ? color : Colors.textSecondary }]}>
                  {f === 'bcv' ? 'BCV' : 'USDT'}
                </Text>
                {activo && <View style={[styles.fuenteDot, { backgroundColor: color }]} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Toggle USD / EUR (solo para BCV) */}
        {fuente === 'bcv' && (
          <View style={styles.monedaRow}>
            {(['usd', 'eur'] as Moneda[]).map((m) => {
              const activo = moneda === m;
              const color  = m === 'usd' ? Colors.success : '#6366F1';
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.monedaBtn, { borderColor: activo ? color : Colors.border, backgroundColor: activo ? color + '22' : Colors.cardAlt }]}
                  onPress={() => { setMoneda(m); reiniciar(); }}
                >
                  <Text style={[styles.monedaSym, { color: activo ? color : Colors.textSecondary }]}>
                    {m === 'usd' ? '$' : '€'}
                  </Text>
                  <Text style={[styles.monedaLabel, { color: activo ? color : Colors.textSecondary }]}>
                    {m === 'usd' ? 'Dólar' : 'Euro'}
                  </Text>
                  {activo && <View style={[styles.monedaDot, { backgroundColor: color }]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Badge tasa */}
        <View style={[styles.tasaBadge, { backgroundColor: colorBadge + '22', borderColor: colorBadge + '55' }]}>
          <Ionicons name="swap-horizontal-outline" size={16} color={colorBadge} />
          {tasa ? (
            <Text style={[styles.tasaText, { color: colorBadge }]}>
              {labelTasa}  ·  Bs {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          ) : (
            <Text style={[styles.tasaText, { color: colorBadge }]}>
              {isLoadingAny ? 'Consultando tasa...' : `Tasa ${fuente === 'usdt' ? 'USDT' : codigoIso} no disponible`}
            </Text>
          )}
        </View>
        {fechaMostrar ? (
          <Text style={styles.tasaFecha}>
            {(() => {
              try { return new Date(fechaMostrar).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
              catch { return fechaMostrar; }
            })()}
          </Text>
        ) : null}
        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="warning-outline" size={13} color={Colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Campos conversión */}
        <View style={styles.convCard}>
          <View style={styles.fieldRow}>
            <View style={styles.fieldLabel}>
              <Text style={[styles.fieldSymbol, { color: colorDivisa }]}>{fuente === 'usdt' ? '₮' : simbolo}</Text>
              <Text style={styles.fieldCurrency}>{fuente === 'usdt' ? 'USDT' : codigoIso}</Text>
            </View>
            <TextInput
              style={[styles.fieldInput, { color: colorDivisa }]}
              value={valor} onChangeText={onChangeDivisa}
              keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity style={[styles.copyBtn, copiado === 'divisa' && styles.copyBtnDone]} onPress={() => copiar(valor, 'divisa')} disabled={!valor}>
              <Ionicons name={copiado === 'divisa' ? 'checkmark-outline' : 'copy-outline'} size={18} color={copiado === 'divisa' ? Colors.success : valor ? Colors.textSecondary : Colors.border} />
            </TouchableOpacity>
          </View>

          <View style={styles.fieldDivider}>
            <View style={styles.fieldDividerLine} />
            <View style={[styles.swapIcon, { backgroundColor: colorBadge + '22', borderColor: colorBadge + '44' }]}>
              <Ionicons name="swap-vertical" size={16} color={colorBadge} />
            </View>
            <View style={styles.fieldDividerLine} />
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldLabel}>
              <Text style={[styles.fieldSymbol, { color: Colors.blue }]}>Bs</Text>
              <Text style={styles.fieldCurrency}>VES</Text>
            </View>
            <TextInput
              style={[styles.fieldInput, { color: Colors.blue }]}
              value={bs} onChangeText={onChangeBs}
              keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity style={[styles.copyBtn, copiado === 'bs' && styles.copyBtnDone]} onPress={() => copiar(bs, 'bs')} disabled={!bs}>
              <Ionicons name={copiado === 'bs' ? 'checkmark-outline' : 'copy-outline'} size={18} color={copiado === 'bs' ? Colors.success : bs ? Colors.textSecondary : Colors.border} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Botones */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.btnReiniciar} onPress={reiniciar}>
            <Ionicons name="refresh-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.btnReiniciarText}>Reiniciar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnCompartir} onPress={compartir}>
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={styles.btnCompartirText}>Compartir</Text>
          </TouchableOpacity>
        </View>

        {/* Rápidos divisa */}
        <View style={[styles.quickCard, { borderColor: colorBadge + '44' }]}>
          <Text style={[styles.quickTitle, { color: colorBadge }]}>
            Rápidos en {fuente === 'usdt' ? '₮ USDT' : simbolo}
          </Text>
          <View style={styles.quickGrid}>
            {quickMontos.map((v) => (
              <TouchableOpacity key={v} style={[styles.quickBtn, { borderColor: colorBadge + '33' }]} onPress={() => onChangeDivisa(v.toString())}>
                <Text style={styles.quickBtnMain}>{fuente === 'usdt' ? '₮' : simbolo}{v}</Text>
                {tasa ? <Text style={[styles.quickBtnSub, { color: colorBadge }]}>Bs {(v * tasa).toLocaleString('es-VE', { maximumFractionDigits: 0 })}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Rápidos Bs */}
        <View style={[styles.quickCard, { borderColor: Colors.blue + '44' }]}>
          <Text style={[styles.quickTitle, { color: Colors.blue }]}>Rápidos en Bs</Text>
          <View style={styles.quickGrid}>
            {[500, 1000, 2000, 5000, 10000, 20000].map((v) => (
              <TouchableOpacity key={v} style={[styles.quickBtn, { borderColor: Colors.blue + '44' }]} onPress={() => onChangeBs(v.toString())}>
                <Text style={styles.quickBtnMain}>{v.toLocaleString('es-VE')} Bs</Text>
                {tasa ? <Text style={[styles.quickBtnSub, { color: Colors.blue }]}>{fuente === 'usdt' ? '₮' : simbolo}{(v / tasa).toFixed(2)}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  headerTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  iconBtn: {
    backgroundColor: Colors.cardAlt, borderRadius: Radius.sm,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  body: { padding: Spacing.lg, gap: Spacing.md },
  fuenteRow: { flexDirection: 'row', gap: Spacing.sm },
  fuenteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1.5, gap: 6,
  },
  fuenteLabel: { fontSize: FontSize.sm, fontWeight: '800' },
  fuenteDot:   { width: 6, height: 6, borderRadius: 3, marginLeft: 2 },
  monedaRow: { flexDirection: 'row', gap: Spacing.sm },
  monedaBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1.5, gap: 2,
  },
  monedaSym:   { fontSize: 18, fontWeight: '800' },
  monedaLabel: { fontSize: FontSize.xs, fontWeight: '700' },
  monedaDot:   { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  tasaBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderWidth: 1, alignSelf: 'stretch',
  },
  tasaText:  { fontSize: FontSize.md, fontWeight: '800' },
  tasaFecha: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: -6, textAlign: 'center' },
  errorRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { fontSize: FontSize.xs, color: Colors.warning },
  convCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md,
  },
  fieldLabel:    { alignItems: 'center', width: 44 },
  fieldSymbol:   { fontSize: FontSize.xxl, fontWeight: '800' },
  fieldCurrency: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  fieldInput:    { flex: 1, fontSize: 28, fontWeight: '800', textAlign: 'right' },
  copyBtn:       { padding: 8, borderRadius: Radius.sm, backgroundColor: Colors.cardAlt, borderWidth: 1, borderColor: Colors.border },
  copyBtnDone:   { backgroundColor: Colors.success + '22', borderColor: Colors.success + '55' },
  fieldDivider:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg },
  fieldDividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  swapIcon: { borderRadius: Radius.full, padding: 6, marginHorizontal: Spacing.sm, borderWidth: 1 },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm },
  btnReiniciar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    paddingVertical: 13, borderWidth: 1, borderColor: Colors.border,
  },
  btnReiniciarText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textSecondary },
  btnCompartir: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.blue, borderRadius: Radius.md, paddingVertical: 13,
  },
  btnCompartirText: { fontSize: FontSize.md, fontWeight: '700', color: '#fff' },
  quickCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, gap: Spacing.sm,
  },
  quickTitle: { fontSize: FontSize.sm, fontWeight: '800' },
  quickGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickBtn: {
    flex: 1, minWidth: '28%', backgroundColor: Colors.cardAlt,
    borderRadius: Radius.md, borderWidth: 1,
    paddingVertical: Spacing.sm, alignItems: 'center', gap: 2,
  },
  quickBtnMain: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  quickBtnSub:  { fontSize: FontSize.xs, fontWeight: '600' },
  menuOverlay:  { flex: 1 },
  menuCard: {
    position: 'absolute', top: 90, right: Spacing.lg,
    backgroundColor: Colors.card, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    minWidth: 200, elevation: 8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
  },
  menuItemText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  menuDivider:  { height: 1, backgroundColor: Colors.border },
});
