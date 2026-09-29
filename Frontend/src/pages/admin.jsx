import { useEffect, useState } from "react";
import { api, rp, getToken, setToken } from "../lib/api.js";

const inp = "rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm outline-none focus:border-side";
const btn = "rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-40";
const wa = (n) => (n || "").replace(/\D/g, "").replace(/^0/, "62");

export default function Admin() {
  const [token, setTok] = useState(getToken());
  const [orders, setOrders] = useState([]);
  const [nama, setNama] = useState({});
  const [filter, setFilter] = useState("menunggu");
  const [ongkir, setOngkir] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const keluar = (m = "") => { setToken(null); setTok(null); setMsg(m); };
  const gagal = (x) => (x.status === 401 ? keluar("Sesi berakhir, silakan masuk lagi.") : setMsg(x.message));
  const muat = () => api("/order", { auth: true }).then(setOrders).catch(gagal);

  useEffect(() => {
    if (!token) return;
    api("/produk").then((ps) => setNama(Object.fromEntries(ps.flatMap((p) => p.varian.map((v) => [v.id, `${p.nama} · ${v.berat} kg`])))));
    muat();
    const t = setInterval(muat, 15000);
    return () => clearInterval(t);
  }, [token]);

  const masuk = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    const d = new FormData(e.target);
    try {
      const r = await api("/login", { method: "POST", form: new URLSearchParams({ username: d.get("u"), password: d.get("p") }) });
      setToken(r.access_token); setTok(r.access_token);
    } catch (x) { setMsg(x.message); } finally { setBusy(false); }
  };

  const putus = async (o, status) => {
    setBusy(true); setMsg("");
    try {
      const biaya = status === "dikonfirmasi" && o.metode === "kirim" ? Number(ongkir[o.id]) : 0;
      await api(`/order/${o.id}/konfirmasi`, { method: "PATCH", auth: true, body: { status_konfirmasi: status, ongkir: biaya } });
      await muat();
    } catch (x) { gagal(x); } finally { setBusy(false); }
  };

  if (!token)
    return (
      <section className="grid min-h-screen place-items-center bg-[#F3F7E9] p-4">
        <form onSubmit={masuk} className="w-full max-w-sm space-y-4 rounded-2xl border border-primary/15 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-extrabold text-primary">Masuk admin</h1>
          <input name="u" required autoComplete="username" placeholder="Username" className={`${inp} w-full`} />
          <input name="p" type="password" required autoComplete="current-password" placeholder="Password" className={`${inp} w-full`} />
          {msg && <p className="text-sm text-red-700">{msg}</p>}
          <button disabled={busy} className={`${btn} w-full bg-primary`}>{busy ? "Memeriksa…" : "Masuk"}</button>
        </form>
      </section>
    );

  const hitung = (s) => orders.filter((o) => o.status_konfirmasi === s).length;
  return (
    <section className="min-h-screen bg-[#F3F7E9] p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-primary">Pesanan masuk</h1>
          <button onClick={() => keluar()} className={`${btn} bg-quaternary`}>Keluar</button>
        </header>
        <nav className="flex flex-wrap gap-2">
          {["menunggu", "dikonfirmasi", "ditolak"].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold capitalize ${filter === s ? "border-primary bg-primary text-white" : "border-primary/25 bg-white text-primary"}`}>{s} ({hitung(s)})</button>
          ))}
        </nav>
        {msg && <p className="text-sm text-red-700">{msg}</p>}
        {hitung(filter) === 0 && <p className="text-sm text-quaternary/70">Belum ada pesanan di tab ini.</p>}
        {orders.filter((o) => o.status_konfirmasi === filter).map((o) => {
          const kirim = o.metode === "kirim";
          const total = o.total + o.ongkir;
          const chat = `https://wa.me/${wa(o.no_telepon)}?text=${encodeURIComponent(`Halo ${o.nama_pembeli}, terkait pesanan #${o.id} di Rejonik.${o.status_konfirmasi === "dikonfirmasi" ? ` Total pembayaran ${rp(total)}.` : ""}`)}`;
          return (
            <article key={o.id} className="space-y-3 rounded-2xl border border-primary/15 bg-white p-5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <b className="text-primary">#{o.id} · {o.nama_pembeli} · {kirim ? "Kirim" : "Ambil sendiri"}</b>
                <span>{new Date(o.tanggal).toLocaleString("id-ID")}</span>
              </div>
              <p>{o.no_telepon}</p>
              {kirim && <p>{[o.nama_jalan, o.kecamatan, o.kota, o.provinsi, o.kode_pos].filter(Boolean).join(", ")}{o.detail_lainnya && <><br />Petunjuk: {o.detail_lainnya}</>}</p>}
              <ul>{o.items.map((i) => <li key={i.id}>{nama[i.produk_varian_id] || `Varian #${i.produk_varian_id}`} × {i.jumlah} = {rp(i.jumlah * i.harga_saat_itu)}</li>)}</ul>
              <p className="font-semibold">Subtotal {rp(o.total)}{o.status_konfirmasi === "dikonfirmasi" && ` + ongkir ${rp(o.ongkir)} = ${rp(total)}`}</p>
              <div className="flex flex-wrap items-center gap-2">
                {o.status_konfirmasi === "menunggu" && (
                  <>
                    {kirim && <input type="number" min="0" placeholder="Ongkir (Rp)" value={ongkir[o.id] ?? ""} onChange={(e) => setOngkir({ ...ongkir, [o.id]: e.target.value })} className={`${inp} w-40`} />}
                    <button disabled={busy || (kirim && (ongkir[o.id] ?? "") === "")} onClick={() => putus(o, "dikonfirmasi")} className={`${btn} bg-secondary`}>Konfirmasi</button>
                    <button disabled={busy} onClick={() => confirm(`Tolak pesanan #${o.id}? Stok akan dikembalikan.`) && putus(o, "ditolak")} className={`${btn} bg-red-700`}>Tolak</button>
                  </>
                )}
                <a href={chat} target="_blank" rel="noreferrer" className={`${btn} bg-side`}>Chat pembeli</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
