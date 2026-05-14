import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { registrarEvento } from '@/services/analytics';
import { supabase } from '@/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import '../global.css';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function solicitarPermisosNotificaciones() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('mantenimiento', {
      name: 'Mantenimiento vehículo',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function useRegistrarDescarga() {
  useEffect(() => {
    solicitarPermisosNotificaciones();
    const registrar = async () => {
      const ya = await AsyncStorage.getItem('app_instalada');
      if (ya) return;
      await supabase.from('descargas_app').insert({ platform: Platform.OS });
      await AsyncStorage.setItem('app_instalada', 'true');
    };
    registrar();
  }, []);
}

function AppTabs() {
  useRegistrarDescarga();
  useEffect(() => { registrarEvento('apertura_app'); }, []);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: -2 },
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor:   colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cash',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calculator-outline" size={size} color={color} />
          ),
        }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Cash') }}
      />
      <Tabs.Screen
        name="comparacion"
        options={{
          title: 'Mercado',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Mercado') }}
      />
      <Tabs.Screen
        name="listado"
        options={{
          title: 'Comprar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Comprar') }}
      />
      <Tabs.Screen
        name="gastos"
        options={{
          title: 'Mi Cartera',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Mi Cartera') }}
      />
      <Tabs.Screen
        name="socios"
        options={{
          title: 'Mi Tienda',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Mi Tienda') }}
      />
      {/* Ocultar rutas que no son tabs */}
      <Tabs.Screen name="(tabs)"             options={{ href: null }} />
      <Tabs.Screen name="directorio"         options={{ href: null }} />
      <Tabs.Screen name="unirse-socio"       options={{ href: null }} />
      <Tabs.Screen name="editar-mi-negocio"  options={{ href: null }} />
      <Tabs.Screen name="terminos"           options={{ href: null }} />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <AppTabs />
          </ThemeProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
