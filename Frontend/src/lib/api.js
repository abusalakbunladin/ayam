export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const rp = (n) => "Rp" + Number(n || 0).toLocaleString("id-ID");
export const getToken = () => localStorage.getItem("rejonik_token");
export const setToken = (t) => (t ? localStorage.setItem("rejonik_token", t) : localStorage.removeItem("rejonik_token"));

export async function api(path, { method = "GET", body, form, auth } = {}) {
  const headers = {};
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    const err = new Error(Array.isArray(d) ? d.map((e) => e.msg.replace("Value error, ", "")).join(", ") : d || "Terjadi kesalahan");
    err.status = res.status;
    throw err;
  }
  return data;
}
