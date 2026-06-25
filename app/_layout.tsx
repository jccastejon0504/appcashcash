import { AgriloTabBar } from '@/components/AgriloTabBar';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { registrarEvento } from '@/services/analytics';
import { supabase } from '@/services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

const NAV_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, card: 'transparent', border: 'transparent' },
};

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
  return (
    <Tabs
      initialRouteName="index"
      tabBar={(props) => <AgriloTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="comparacion"
        options={{ title: 'Mercado' }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Mercado') }}
      />
      <Tabs.Screen
        name="listado"
        options={{ title: 'Comprar' }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Comprar') }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'Cash' }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Cash') }}
      />
      <Tabs.Screen
        name="gastos"
        options={{ title: 'Mi Cartera' }}
        listeners={{ tabPress: () => registrarEvento('tab_click', 'Mi Cartera') }}
      />
      <Tabs.Screen
        name="socios"
        options={{ title: 'Mi Tienda' }}
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
            <NavThemeProvider value={NAV_THEME}>
              <StatusBar style="auto" />
              <AppTabs />
            </NavThemeProvider>
          </ThemeProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
