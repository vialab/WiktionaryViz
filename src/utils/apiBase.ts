// Centralized API base URL for backend requests
// Configure via Vite env: VITE_API_BASE=https://your-backend.example.com
// Access Vite env safely without using `any`
type ViteEnv = { VITE_API_BASE?: string };
const viteEnv: ViteEnv = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: ViteEnv }).env) || {};
const rawBase = viteEnv.VITE_API_BASE;
export const API_BASE = (rawBase && rawBase.trim().length > 0) ? rawBase : "http://localhost:8000";

export const apiUrl = (path: string) => {
  const base = API_BASE.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
};
