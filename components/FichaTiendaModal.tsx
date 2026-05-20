import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, Linking, Image,
  Modal, Dimensions, Share, useWindowDimensions,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, FontSize } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, SocioComercial } from '@/services/supabase';
import { registrarEvento } from '@/services/analytics';

function detectarRed(url: string): { label: string; icon: string } {
  const u = url.toLowerCase();
  if (/instagram\.com|instagr\.am/.test(u))  return { label: 'Instagram', icon: 'logo-instagram' };
  if (/t\.me|telegram\.me|telegram\.org/.test(u)) return { label: 'Telegram',  icon: 'paper-plane-outline' };
  if (/facebook\.com|fb\.com|fb\.me/.test(u)) return { label: 'Facebook',  icon: 'logo-facebook' };
  if (/twitter\.com|x\.com/.test(u))          return { label: 'X / Twitter', icon: 'logo-twitter' };
  if (/tiktok\.com/.test(u))                  return { label: 'TikTok',    icon: 'musical-notes-outline' };
  if (/youtube\.com|youtu\.be/.test(u))       return { label: 'YouTube',   icon: 'logo-youtube' };
  if (/wa\.me|whatsapp\.com/.test(u))         return { label: 'WhatsApp',  icon: 'logo-whatsapp' };
  if (/linkedin\.com/.test(u))                return { label: 'LinkedIn',  icon: 'logo-linkedin' };
  if (/^@/.test(url.trim()))                  return { label: 'Perfil',    icon: 'person-outline' };
  return { label: 'Web', icon: 'globe-outline' };
}

type ItemGaleria = {
  id: string;
  imagen: string;
  imagen2: string | null;
  imagen3: string | null;
  titulo: string | null;
  precio: string | null;
  precio_bs: string | null;
  descripcion: string | null;
};

function urlTienda(s: { id: string; slug?: string | null }): string {
  return s.slug
    ? `https://appcashcash.com/t/${s.slug}`
    : `https://appcashcash.com/admin/tienda.html?id=${s.id}`;
}

type Props = {
  socio: SocioComercial;
  subcatNombre?: string;
  onClose: () => void;
  favoritas: string[];
  onToggleFavorita: (id: string) => void;
};

export default function FichaTiendaModal({ socio: s, subcatNombre, onClose, favoritas, onToggleFavorita }: Props) {
  const { colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { height: altPantalla } = useWindowDimensions();
  const ANCHO = Dimensions.get('window').width;

  const [imagenAmpliada,      setImagenAmpliada]      = useState<string | null>(null);
  const [modalInfoTienda,     setModalInfoTienda]     = useState(false);
  const [galeriaItems,        setGaleriaItems]        = useState<ItemGaleria[]>([]);
  const [productoModal,       setProductoModal]       = useState<{ item: ItemGaleria; whatsapp: string | null } | null>(null);
  const [paginaProducto,      setPaginaProducto]      = useState(0);
  const [infoProductoVisible, setInfoProductoVisible] = useState(false);
  const [prodZoomed,          setProdZoomed]          = useState(false);

  const esFavorita = (id: string) => favoritas.includes(id);

  const abrirEnlace = (url: string) => { Linking.openURL(url.startsWith('http') ? url : `https://${url}`).catch(() => {}); };
  const abrirWA     = (n: string)   => { Linking.openURL(`https://wa.me/${n.replace(/\D/g, '')}`).catch(() => {}); };
  const abrirTel    = (n: string)   => { Linking.openURL(`tel:${n}`).catch(() => {}); };

  useEffect(() => {
    supabase.from('galeria_items').select('*').eq('socio_id', s.id).order('orden')
      .then(({ data }) => setGaleriaItems((data ?? []) as ItemGaleria[]));
  }, [s.id]);

  // Gestos: visor imagen ampliada
  const escala     = useSharedValue(1);
  const escalaBase = useSharedValue(1);
  const transX     = useSharedValue(0);
  const transY     = useSharedValue(0);
  const transXBase = useSharedValue(0);
  const transYBase = useSharedValue(0);

  const resetVisor = () => {
    escala.value = withTiming(1); escalaBase.value = 1;
    transX.value = withTiming(0); transY.value = withTiming(0);
    transXBase.value = 0; transYBase.value = 0;
  };

  // Gestos: zoom en modal de producto
  const escalaP     = useSharedValue(1);
  const escalaBaseP = useSharedValue(1);
  const transXP     = useSharedValue(0);
  const transYP     = useSharedValue(0);
  const transXBaseP = useSharedValue(0);
  const transYBaseP = useSharedValue(0);

  const resetVisorP = () => {
    escalaP.value = withTiming(1); escalaBaseP.value = 1;
    transXP.value = withTiming(0); transYP.value = withTiming(0);
    transXBaseP.value = 0; transYBaseP.value = 0;
    setProdZoomed(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!imagenAmpliada) resetVisor(); }, [imagenAmpliada]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!productoModal) { resetVisorP(); setInfoProductoVisible(false); } }, [productoModal]);

  const pinch = Gesture.Pinch()
    .onUpdate(e => { escala.value = Math.max(1, escalaBase.value * e.scale); })
    .onEnd(() => { escalaBase.value = escala.value; });
  const pan = Gesture.Pan()
    .onUpdate(e => { transX.value = transXBase.value + e.translationX; transY.value = transYBase.value + e.translationY; })
    .onEnd(() => { transXBase.value = transX.value; transYBase.value = transY.value; });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    escala.value = withTiming(1); escalaBase.value = 1;
    transX.value = withTiming(0); transY.value = withTiming(0);
    transXBase.value = 0; transYBase.value = 0;
  });
  const gestos = Gesture.Simultaneous(Gesture.Exclusive(doubleTap, pan), pinch);
  const estiloAnimado = useAnimatedStyle(() => ({
    transform: [{ translateX: transX.value }, { translateY: transY.value }, { scale: escala.value }],
  }));

  const pinchP = Gesture.Pinch()
    .onUpdate(e => { escalaP.value = Math.max(1, escalaBaseP.value * e.scale); })
    .onEnd(() => {
      escalaBaseP.value = escalaP.value;
      if (escalaP.value > 1) runOnJS(setProdZoomed)(true);
      else runOnJS(setProdZoomed)(false);
    });
  const panP = Gesture.Pan()
    .onUpdate(e => { transXP.value = transXBaseP.value + e.translationX; transYP.value = transYBaseP.value + e.translationY; })
    .onEnd(() => { transXBaseP.value = transXP.value; transYBaseP.value = transYP.value; });
  const doubleTapP = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    escalaP.value = withTiming(1); escalaBaseP.value = 1;
    transXP.value = withTiming(0); transYP.value = withTiming(0);
    transXBaseP.value = 0; transYBaseP.value = 0;
    runOnJS(setProdZoomed)(false);
  });
  const gestosP = Gesture.Simultaneous(Gesture.Exclusive(doubleTapP, panP), pinchP);
  const estiloAnimadoP = useAnimatedStyle(() => ({
    transform: [{ translateX: transXP.value }, { translateY: transYP.value }, { scale: escalaP.value }],
  }));

  return (
    <>
      <Modal visible animationType="slide" transparent={false} onRequestClose={onClose}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>

          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: Colors.card, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={[styles.modalHeaderTitle, { color: Colors.text }]} numberOfLines={1}>{s.nombre}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => Share.share({ message: `Mira la tienda *${s.nombre}* en CashCach:\n${urlTienda(s)}`, url: urlTienda(s) })}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, backgroundColor: Colors.border + '44' }}>
                <Ionicons name="share-outline" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onToggleFavorita(s.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, backgroundColor: esFavorita(s.id) ? '#ef444418' : Colors.border + '44' }}>
                <Ionicons name={esFavorita(s.id) ? 'heart' : 'heart-outline'} size={16} color={esFavorita(s.id) ? '#ef4444' : Colors.textMuted} />
                <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: esFavorita(s.id) ? '#ef4444' : Colors.textMuted }}>
                  {esFavorita(s.id) ? 'Guardada' : 'Guardar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Hero */}
            <View style={[styles.modalHero, { height: Math.round(altPantalla * 0.5) }]}>
              {s.imagen ? (
                <TouchableOpacity activeOpacity={0.92} style={{ flex: 1 }} onPress={() => setImagenAmpliada(s.imagen)}>
                  <Image source={{ uri: s.imagen }} style={styles.modalHeroImg} resizeMode="cover" />
                </TouchableOpacity>
              ) : (
                <View style={[styles.modalHeroImg, { backgroundColor: Colors.accent + '18', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="storefront-outline" size={64} color={Colors.accent + '55'} />
                </View>
              )}
              {/* Info ℹ arriba izquierda — verde si tiene ubicación GPS */}
              {(s.descripcion || s.direccion || (s.latitud != null && s.longitud != null)) ? (
                <TouchableOpacity
                  onPress={() => setModalInfoTienda(true)}
                  style={{
                    position: 'absolute', top: 6, left: Spacing.md,
                    backgroundColor: (s.latitud != null && s.longitud != null) ? Colors.accent : '#00000055',
                    borderRadius: 20, padding: 5,
                  }}>
                  <Ionicons name="information-circle-outline" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null}
              {/* Ciudad badge arriba derecha */}
              {s.ciudad ? (
                <View style={styles.modalHeroCiudad}>
                  <Ionicons name="location-outline" size={11} color="#ffffffCC" />
                  <Text style={styles.modalHeroTagText}>{s.ciudad}</Text>
                </View>
              ) : null}
              {/* Botones de contacto sobremonados en borde inferior */}
              <View style={styles.modalBotonesOverlay}>
                {s.whatsapp ? (
                  <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: '#25D366' }]} onPress={() => abrirWA(s.whatsapp)}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                ) : null}
                {s.telefono ? (
                  <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: Colors.accent }]} onPress={() => abrirTel(s.telefono)}>
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.modalContactBtnText}>Llamar</Text>
                  </TouchableOpacity>
                ) : null}
                {s.web ? (() => {
                  const red = detectarRed(s.web);
                  return (
                    <TouchableOpacity style={[styles.modalContactBtn, { backgroundColor: Colors.accent }]} onPress={() => abrirEnlace(s.web)}>
                      <Ionicons name={red.icon as any} size={20} color="#fff" />
                      <Text style={styles.modalContactBtnText}>{red.label}</Text>
                    </TouchableOpacity>
                  );
                })() : null}
              </View>
            </View>

            {/* Cuerpo */}
            <View style={[styles.modalCuerpo, { backgroundColor: Colors.background }]}>
              {/* Chip de subcategoría */}
              {subcatNombre ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
                  <View style={[styles.modalHeroTag, { backgroundColor: Colors.accent + '22' }]}>
                    <Ionicons name="grid-outline" size={13} color={Colors.accent} />
                    <Text style={[styles.modalHeroTagText, { color: Colors.accent }]}>{subcatNombre}</Text>
                  </View>
                </View>
              ) : null}

              {/* Catálogo */}
              {galeriaItems.length > 0 && (
                <View>
                  <Text style={[styles.modalSeccionLabel, { color: Colors.textMuted, paddingHorizontal: 4, marginBottom: 8 }]}>Catálogo</Text>
                  <View style={styles.galeriaGrid}>
                    {galeriaItems.map(item => (
                      <TouchableOpacity key={item.id}
                        onPress={() => { setProductoModal({ item, whatsapp: s.whatsapp ?? null }); registrarEvento('galeria_producto', item.titulo ?? undefined, s.id, s.nombre); }}
                        activeOpacity={0.85}
                        style={[styles.galeriaImgGrande, { borderColor: Colors.border }]}>
                        <Image source={{ uri: item.imagen }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        {(item.titulo || item.precio || item.precio_bs) && (
                          <View style={styles.galeriaOverlay}>
                            {(item.precio || item.precio_bs) && (
                              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                {item.precio && <Text style={styles.galeriaOverlayPrecio}>${item.precio}</Text>}
                                {item.precio_bs && <Text style={styles.galeriaOverlayBs}>Bs.{item.precio_bs}</Text>}
                              </View>
                            )}
                            {item.titulo && <Text style={styles.galeriaOverlayTitulo} numberOfLines={1}>{item.titulo}</Text>}
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ height: 32 }} />
            </View>
          </ScrollView>

          {/* Modal info tienda: descripción + dirección + Google Maps */}
          <Modal visible={modalInfoTienda} transparent animationType="fade" onRequestClose={() => setModalInfoTienda(false)}>
            <View style={{ flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 24 }}>
              <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setModalInfoTienda(false)} />
              <View style={{ backgroundColor: Colors.card, borderRadius: 20, overflow: 'hidden', elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16 }}>
                <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="information-circle" size={20} color={Colors.accent} />
                  <Text style={{ flex: 1, fontSize: FontSize.md, fontWeight: '800', color: Colors.text }} numberOfLines={1}>{s.nombre}</Text>
                  <TouchableOpacity onPress={() => setModalInfoTienda(false)} style={{ padding: 2 }}>
                    <Ionicons name="close" size={20} color={Colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {s.descripcion ? (
                  <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: s.direccion ? 0 : 20 }}>
                    <Text style={{ fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 }}>{s.descripcion}</Text>
                  </View>
                ) : null}
                {s.descripcion && s.direccion ? (
                  <View style={{ marginHorizontal: 20, marginVertical: 16, height: 1, backgroundColor: Colors.border }} />
                ) : null}
                {s.direccion ? (
                  <View style={{ paddingHorizontal: 20, paddingBottom: (s.latitud != null && s.longitud != null) ? 0 : 20, paddingTop: s.descripcion ? 0 : 16 }}>
                    <Text style={{ fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Dirección</Text>
                    <Text style={{ fontSize: FontSize.sm, color: Colors.text, marginBottom: 14 }}>{s.direccion}</Text>
                  </View>
                ) : null}
                {/* Mini-mapa con ubicación exacta */}
                {s.latitud != null && s.longitud != null ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      const url = `https://www.google.com/maps/search/?api=1&query=${s.latitud},${s.longitud}`;
                      Linking.openURL(url).catch(() => {});
                    }}
                    style={{ marginHorizontal: 20, marginTop: s.direccion ? 4 : 16, marginBottom: 20, borderRadius: 14, overflow: 'hidden', height: 180 }}>
                    <MapView
                      style={{ flex: 1 }}
                      pointerEvents="none"
                      initialRegion={{
                        latitude:      s.latitud,
                        longitude:     s.longitud,
                        latitudeDelta:  0.003,
                        longitudeDelta: 0.003,
                      }}>
                      <Marker coordinate={{ latitude: s.latitud, longitude: s.longitud }} pinColor={Colors.accent} />
                    </MapView>
                    {/* Overlay con instrucción */}
                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.accent, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Ionicons name="navigate" size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: FontSize.xs }}>Toca para abrir en Google Maps</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Modal>

        </SafeAreaView>
      </Modal>

      {/* Modal producto con zoom/pinch */}
      {productoModal && (() => {
        const { item, whatsapp } = productoModal;
        const imagenes = [item.imagen, item.imagen2, item.imagen3].filter(Boolean) as string[];
        return (
          <Modal visible transparent animationType="slide" onRequestClose={() => { setProductoModal(null); setPaginaProducto(0); }}>
            <View style={{ flex: 1, backgroundColor: '#000000BB', justifyContent: 'flex-end' }}>
              <View style={[styles.productoBox, { backgroundColor: Colors.card }]}>

                <View style={{ width: ANCHO, height: 380 }}>
                  <GestureHandlerRootView style={{ width: ANCHO, height: 380, overflow: 'hidden' }}>
                    <GestureDetector gesture={gestosP}>
                      <Animated.View style={[{ width: ANCHO, height: 380 }, estiloAnimadoP]}>
                        <ScrollView
                          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                          scrollEnabled={!prodZoomed}
                          scrollEventThrottle={16}
                          onScroll={e => setPaginaProducto(Math.round(e.nativeEvent.contentOffset.x / ANCHO))}>
                          {imagenes.map((img, i) => (
                            <Image key={i} source={{ uri: img }} style={[styles.productoImg, { width: ANCHO }]} resizeMode="cover" />
                          ))}
                        </ScrollView>
                      </Animated.View>
                    </GestureDetector>
                  </GestureHandlerRootView>
                  <TouchableOpacity
                    onPress={() => setImagenAmpliada(imagenes[paginaProducto] ?? imagenes[0])}
                    style={{ position: 'absolute', bottom: 10, right: 10, backgroundColor: '#00000077', borderRadius: 20, padding: 7 }}>
                    <Ionicons name="expand-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                {imagenes.length > 1 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                    {imagenes.map((_, i) => (
                      <View key={i} style={{
                        width: i === paginaProducto ? 8 : 6,
                        height: i === paginaProducto ? 8 : 6,
                        borderRadius: 4,
                        backgroundColor: i === paginaProducto ? Colors.accent : Colors.border,
                      }} />
                    ))}
                  </View>
                )}

                <View style={{ padding: Spacing.lg, paddingTop: imagenes.length > 1 ? 4 : Spacing.lg, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[styles.productoTitulo, { color: Colors.text, flex: 1 }]}>{item.titulo ?? ''}</Text>
                    {item.descripcion ? (
                      <TouchableOpacity
                        style={[styles.productoCerrarX, { backgroundColor: infoProductoVisible ? Colors.accent + '22' : Colors.border }]}
                        onPress={() => setInfoProductoVisible(v => !v)}>
                        <Ionicons name="information-circle-outline" size={18} color={infoProductoVisible ? Colors.accent : Colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.productoCerrarX, { backgroundColor: Colors.border }]}
                      onPress={() => Share.share({ message: `Mira la tienda *${s.nombre}* en CashCach:\n${urlTienda(s)}`, url: urlTienda(s) })}>
                      <Ionicons name="share-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.productoCerrarX, { backgroundColor: Colors.border }]}
                      onPress={() => { setProductoModal(null); setPaginaProducto(0); }}>
                      <Ionicons name="close" size={18} color={Colors.text} />
                    </TouchableOpacity>
                  </View>

                  {infoProductoVisible && item.descripcion ? (
                    <View style={{ backgroundColor: Colors.accent + '12', borderRadius: Radius.md, padding: 12, borderLeftWidth: 3, borderLeftColor: Colors.accent }}>
                      <Text style={{ fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 }}>{item.descripcion}</Text>
                    </View>
                  ) : null}

                  {(item.precio || item.precio_bs) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      {item.precio ? <Text style={[styles.productoPrecio, { color: Colors.accent }]}>${item.precio}</Text> : null}
                      {item.precio_bs ? <Text style={[styles.productoPrecioBs, { color: Colors.textMuted }]}>Bs. {item.precio_bs}</Text> : null}
                    </View>
                  ) : null}

                  {whatsapp ? (
                    <TouchableOpacity
                      style={styles.productoWaBtn}
                      onPress={() => {
                        const msg = `Hola, vi${item.titulo ? ` "${item.titulo}"` : ' tu publicación'} en CashCach. ¿Sigue disponible?`;
                        Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`).catch(() => {});
                      }}>
                      <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                      <Text style={styles.productoWaBtnText}>Consultar al vendedor</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Imagen ampliada a pantalla completa */}
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
    </>
  );
}

function makeStyles(Colors: ReturnType<typeof useTheme>['colors']) { return StyleSheet.create({
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: { flex: 1, fontSize: FontSize.md, fontWeight: '700' },

  modalHero:    { width: '100%', height: 260, position: 'relative', marginBottom: 24 },
  modalHeroImg: { width: '100%', height: '100%' },

  modalHeroCiudad: {
    position: 'absolute', top: 6, right: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#00000055', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  modalHeroTagText: { fontSize: 11, color: '#ffffffDD', fontWeight: '600' },
  modalHeroTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },

  modalBotonesOverlay: {
    position: 'absolute', bottom: -24, left: 10, right: 10,
    flexDirection: 'row', gap: 8, zIndex: 10,
  },
  modalContactBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: Radius.lg,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  modalContactBtnText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  modalCuerpo:       { gap: 10, padding: 10 },
  modalSeccionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },

  galeriaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  galeriaImgGrande: {
    width: '48.5%', height: 200, borderRadius: Radius.md,
    borderWidth: 1, overflow: 'hidden',
  },
  galeriaOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#000000AA', paddingHorizontal: 6, paddingVertical: 5,
  },
  galeriaOverlayPrecio: { color: '#FFD700', fontSize: 11, fontWeight: '800' },
  galeriaOverlayBs:     { color: '#ffffffBB', fontSize: 10, fontWeight: '600' },
  galeriaOverlayTitulo: { color: '#ffffffCC', fontSize: 10, fontWeight: '500', marginTop: 1 },

  productoBox: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', maxHeight: '95%',
  },
  productoImg:      { width: '100%', height: 380 },
  productoPrecio:   { fontSize: FontSize.xl, fontWeight: '800' },
  productoPrecioBs: { fontSize: FontSize.md, fontWeight: '600', marginBottom: 2 },
  productoTitulo:   { fontSize: FontSize.lg, fontWeight: '700' },
  productoWaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', borderRadius: Radius.lg, paddingVertical: 15, marginTop: 4,
  },
  productoWaBtnText: { color: '#fff', fontSize: FontSize.md, fontWeight: '800' },
  productoCerrarX: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
}); }
