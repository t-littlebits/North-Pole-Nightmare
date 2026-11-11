import { demo } from './demo.js';
import { online, hasSupabase } from './online.js';

// No Supabase credentials => fully playable demo mode (data stays in this browser).
export const backend = hasSupabase ? online : demo;
export const isDemo = !hasSupabase;
