import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getItem, setItem } from '@/services/storage';

const UI_CONFIG_KEY = 'ui_config';

const lightBase = {
  background: '#F5F7FA',
  card:        '#FFFFFF',
  cardAlt:     '#EEF1F6',
  text:        '#0D1B35',
  textSecondary:'#4A6180',
  textMuted:   '#9AAFC4',
  border:      '#DDE4EF',
  tabBar:      '#FFFFFF',
  tabBarBorder:'#DDE4EF',
};

const darkBase = {
  background: '#0A1628',
  card:        '#112240',
  cardAlt:     '#0D1B35',
  text:        '#FFFFFF',
  textSecondary:'#8BAABF',
  textMuted:   '#4A6180',
  border:      '#1E3A5F',
  tabBar:      '#0D1B35',
  tabBarBorder:'#1E3A5F',
};

const shared = {
  success:   '#4CAF50',
  warning:   '#FFA726',
  error:     '#EF5350',
  blueLight: '#7EC8F0',
  blueDark:  '#2E8BC0',
};

export type AppColors = typeof lightBase & typeof shared & {
  blue: string;
  accent: string;
};

type ThemeCtx = {
  colors:       AppColors;
  temaOscuro:   boolean;
  colorAccent:  string;
  colorTexto:   string;
  colorBs:      string;
  colorFondo:   string;
  guardarTema:  (oscuro: boolean) => Promise<void>;
  guardarColor: (color: string)   => Promise<void>;
  guardarTexto: (color: string)   => Promise<void>;
  guardarBs:    (color: string)   => Promise<void>;
  guardarFondo: (color: string)   => Promise<void>;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [temaOscuro,  setTemaOscuro]  = useState(true);
  const [colorAccent, setColorAccent] = useState('#EC4899');
  const [colorTexto,  setColorTexto]  = useState('');
  const [colorBs,     setColorBs]     = useState('#F59E0B');
  const [colorFondo,  setColorFondo]  = useState('');

  useEffect(() => {
    getItem<{ oscuro: boolean; color: string; texto: string; bs: string; fondo: string }>(UI_CONFIG_KEY).then(cfg => {
      if (cfg?.oscuro !== undefined) setTemaOscuro(cfg.oscuro);
      if (cfg?.color)                setColorAccent(cfg.color);
      if (cfg?.texto !== undefined)  setColorTexto(cfg.texto);
      if (cfg?.bs    !== undefined)  setColorBs(cfg.bs);
      if (cfg?.fondo !== undefined)  setColorFondo(cfg.fondo);
    });
  }, []);

  const save = (patch: object) =>
    setItem(UI_CONFIG_KEY, { oscuro: temaOscuro, color: colorAccent, texto: colorTexto, bs: colorBs, fondo: colorFondo, ...patch });

  const guardarTema  = async (oscuro: boolean) => { setTemaOscuro(oscuro);  await save({ oscuro }); };
  const guardarColor = async (color: string)   => { setColorAccent(color);  await save({ color }); };
  const guardarTexto = async (color: string)   => { setColorTexto(color);   await save({ texto: color }); };
  const guardarBs    = async (color: string)   => { setColorBs(color);      await save({ bs: color }); };
  const guardarFondo = async (color: string)   => { setColorFondo(color);   await save({ fondo: color }); };

  const defaultText = temaOscuro ? '#FFFFFF' : '#0D1B35';

  const colors = useMemo<AppColors>(() => {
    const base = temaOscuro ? darkBase : lightBase;
    const background = (!temaOscuro && colorFondo) ? colorFondo : base.background;
    return {
      ...base,
      background,
      ...shared,
      blue:   colorAccent,
      accent: colorAccent,
      text:   colorTexto || defaultText,
    };
  }, [temaOscuro, colorAccent, colorTexto, colorFondo]);

  return (
    <ThemeContext.Provider value={{ colors, temaOscuro, colorAccent, colorTexto, colorBs, colorFondo, guardarTema, guardarColor, guardarTexto, guardarBs, guardarFondo }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
