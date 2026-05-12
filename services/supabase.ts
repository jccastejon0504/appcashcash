import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://mvbkyducdlajoexawbqk.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12Ymt5ZHVjZGxham9leGF3YnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NjAyNTgsImV4cCI6MjA5MjEzNjI1OH0.-kSTyl1KhfAa9N13PjOObwWz1Gi83KT3_6TeyTY7LlY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

export type Categoria = {
  id: string;
  nombre: string;
  imagen: string;
  orden: number;
};

export type Subcategoria = {
  id: string;
  nombre: string;
  categoria_id: string;
  imagen: string;
  orden: number;
};

export type SocioComercial = {
  id: string;
  nombre: string;
  subcategoria_id: string;
  telefono: string;
  whatsapp: string;
  web: string;
  direccion: string;
  imagen: string;
  imagen2: string;
  imagen3: string;
  imagen4: string;
  imagen5: string;
  imagen6: string;
  orden: number;
  created_at: string;
  destacado: boolean;
  activo: boolean | null;
  fecha_vencimiento: string | null;
  ciudad: string | null;
  descripcion: string | null;
  latitud: number | null;
  longitud: number | null;
};
