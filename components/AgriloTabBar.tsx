import { useTheme } from '@/contexts/ThemeContext';
import { registrarEvento } from '@/services/analytics';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabMeta = { icon: keyof typeof Ionicons.glyphMap };

const TABS: Record<string, TabMeta> = {
  comparacion: { icon: 'stats-chart' },
  listado:     { icon: 'cart'        },
  index:       { icon: 'calculator'  },
  gastos:      { icon: 'wallet'      },
  socios:      { icon: 'storefront'  },
};

export function AgriloTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const visibles = state.routes.filter(r => TABS[r.name]);

  // Color de texto sobre el acento (oscuro si lima, blanco si oscuro)
  const rr = parseInt(colors.accent.slice(1, 3), 16);
  const gg = parseInt(colors.accent.slice(3, 5), 16);
  const bb = parseInt(colors.accent.slice(5, 7), 16);
  const onAccent = (0.299 * rr + 0.587 * gg + 0.114 * bb) > 160 ? '#0D0D0D' : '#FFFFFF';

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10, backgroundColor: colors.background }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: colors.tabBar, shadowColor: '#000' }]}>

        {visibles.map(route => {
          const meta    = TABS[route.name];
          const idx     = state.routes.findIndex(r => r.key === route.key);
          const focused = state.index === idx;
          const isCenter = route.name === 'index';

          const onPress = () => {
            registrarEvento('tab_click', route.name);
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          /* ── Botón central destacado ── */
          if (isCenter) {
            return (
              <View key={route.key} style={styles.centerSlot}>
                <View onTouchEnd={onPress} style={[styles.center, { backgroundColor: colors.accent }]}>
                  <Ionicons name={meta.icon} size={26} color={onAccent} />
                </View>
              </View>
            );
          }

          return (
            <View key={route.key} style={styles.slot} onTouchEnd={onPress}>
              <Ionicons name={meta.icon} size={22} color={focused ? colors.accent : colors.textMuted} />
              {focused && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
            </View>
          );
        })}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    borderRadius: 32,
    paddingHorizontal: 10,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  slot: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    overflow: 'hidden',
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  highlight: {
    borderRadius: 32,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -14 }],
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
    overflow: 'hidden',
  },
});
