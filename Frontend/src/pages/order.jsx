import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/navbar.jsx";
import Footer from "./components/footer.jsx";
import { api, rp } from "../lib/api.js";

const KEY = "rejonik_pesanan";
const F0 = { nama: "", telp: "", provinsi: "", kota: "", kecamatan: "", kode_pos: "", nama_jalan: "", detail: "" };
const box = "rounded-2xl border border-primary/15 bg-white p-5 shadow-sm";
const inp = "w-full rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm outline-none focus:border-side focus:ring-2 focus:ring-side/30";
const btn = "block w-full rounded-full bg-primary px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40";
const ghost = "w-full rounded-full border border-primary/30 px-5 py-2 text-sm font-semibold text-primary";
const L = ({ t, children }) => (
  <label className="block space-y-1 text-sm font-medium text-quaternary">
    <span>{t}</span>
    {children}
  </label>
);
const lacak = ({ id, telp }) => api(`/order/lacak/${id}?no_telepon=${encodeURIComponent(telp)}`);

export default function Pesan() {
  const [produk, setProduk] = useState([]);
  const [step, setStep] = useState(1);
  const [metode, setMetode] = useState("kirim");
  const [cart, setCart] = useState({});
  const [f, setF] = useState(F0);
  const [order, setOrder] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const varian = useMemo(
    () => Object.fromEntries(produk.flatMap((p) => p.varian.map((v) => [v.id, { ...v, nama: p.nama }]))),
    [produk],
  );
  const baris = order
    ? order.items.map((i) => [i.produk_varian_id, i.jumlah, i.harga_saat_itu])
    : Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => [+id, q, varian[id]?.harga || 0]);
  const subtotal = baris.reduce((s, [, q, h]) => s + q * h, 0);
  const ongkir = order?.status_konfirmasi === "dikonfirmasi" ? order.ongkir : 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ubah = (v, d) => setCart((c) => ({ ...c, [v.id]: Math.min(v.stok, Math.max(0, (c[v.id] || 0) + d)) }));
  const refresh = () => lacak({ id: order.id, telp: order.no_telepon }).then(setOrder).catch((e) => setErr(e.message));

  useEffect(() => {
    api("/produk").then(setProduk).catch((e) => setErr(e.message));
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s) lacak(s).then((o) => { setOrder(o); setMetode(o.metode); setStep(s.akhir ? 4 : 3); }).catch(() => localStorage.removeItem(KEY));
  }, []);

  useEffect(() => {
    if (step !== 3 || order?.status_konfirmasi !== "menunggu") return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [step, order]);

  const kirimPesanan = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ produk_varian_id: +id, jumlah: q }));
    const body = { nama_pembeli: f.nama, no_telepon: f.telp, metode, items };
    if (metode === "kirim") Object.assign(body, { provinsi: f.provinsi, kota: f.kota, kecamatan: f.kecamatan, kode_pos: f.kode_pos, nama_jalan: f.nama_jalan, detail_lainnya: f.detail || null });
    try {
      const o = await api("/order", { method: "POST", body });
      localStorage.setItem(KEY, JSON.stringify({ id: o.id, telp: o.no_telepon }));
      setOrder(o); setStep(3);
      if (o.wa_link) window.open(o.wa_link, "_blank");
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const selesai = () => { localStorage.setItem(KEY, JSON.stringify({ id: order.id, telp: order.no_telepon, akhir: true })); setStep(4); };
  const ulang = () => { localStorage.removeItem(KEY); setOrder(null); setCart({}); setF(F0); setOk(false); setErr(""); setStep(1); };

  const ringkasan = (children) => (
    <aside className={`${box} h-fit space-y-3`}>
      <h3 className="font-bold text-primary">{step === 1 ? "Keranjang" : "Ringkasan"}</h3>
      {baris.length === 0 && <p className="text-sm text-quaternary/70">Belum ada produk dipilih.</p>}
      {baris.map(([id, q, h]) => (
        <div key={id} className="flex justify-between gap-2 text-sm">
          <span>{varian[id]?.nama ?? "Produk"} · {varian[id]?.berat} kg × {q}</span>
          <span>{rp(q * h)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-primary/15 pt-2 text-sm">
        <span>Ongkir</span>
        <span>{metode === "ambil" ? "Rp0" : order?.status_konfirmasi === "dikonfirmasi" ? rp(order.ongkir) : "Dihitung admin"}</span>
      </div>
      <div className="flex justify-between font-bold text-primary"><span>Total</span><span>{rp(subtotal + ongkir)}</span></div>
      {children}
    </aside>
  );
  const grid = "grid gap-6 lg:grid-cols-[1fr_320px]";
  const s = order?.status_konfirmasi;

  return (
    <div className="app">
      <Navbar />
      <section className="min-h-screen bg-[#F3F7E9] pb-16">
        <div className="bg-primary px-4 pt-28 pb-10 text-center text-white">
          <h1 className="text-3xl font-extrabold">Pemesanan Beras Organik</h1>
          <p className="mt-1 text-sm text-white/80">Pilih produk, kirim pesanan, lalu konfirmasi lewat WhatsApp.</p>
        </div>
        <div className="container mx-auto px-4 pt-8">
          <ol className="mx-auto mb-8 flex max-w-2xl items-center justify-between text-xs sm:text-sm">
            {["Produk", metode === "kirim" ? "Alamat" : "Identitas", "Konfirmasi", "Selesai"].map((t, i) => (
              <li key={t} className={`flex items-center gap-2 ${step > i ? "font-bold text-primary" : "text-quaternary/50"}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-full border-2 ${step === i + 1 ? "border-primary bg-primary text-white" : step > i + 1 ? "border-primary" : "border-current"}`}>{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>

          {step === 1 && (
            <div className={grid}>
              <div className="space-y-4">
                {produk.map((p) => (
                  <div key={p.id} className={`${box} flex gap-4`}>
                    <img src={`/product/${p.nama}.png`} alt={p.nama} onError={(e) => e.currentTarget.remove()} className="h-28 w-28 rounded-xl object-cover" />
                    <div className="flex-1">
                      <h3 className="font-bold text-primary">Beras Organik {p.nama}</h3>
                      {p.varian.map((v) => (
                        <div key={v.id} className="flex items-center justify-between border-t border-primary/10 py-2 text-sm">
                          <span>{v.berat} kg · {rp(v.harga)} <small className="text-quaternary/70">{v.stok > 0 ? `(stok ${v.stok})` : "(habis)"}</small></span>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => ubah(v, -1)} className="h-7 w-7 rounded-full border border-primary/30">−</button>
                            <span className="w-5 text-center">{cart[v.id] || 0}</span>
                            <button type="button" onClick={() => ubah(v, 1)} disabled={(cart[v.id] || 0) >= v.stok} className="h-7 w-7 rounded-full border border-primary/30 disabled:opacity-30">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {err && <p className="text-sm text-red-700">{err}</p>}
                <div className={box}>
                  <h3 className="mb-3 font-bold text-primary">Opsi pengiriman</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[["kirim", "Kirim ke alamat", "Ongkir dihitung admin setelah alamat dicek."], ["ambil", "Ambil sendiri", "Tanpa ongkir, ambil di tempat kami."]].map(([k, t, d]) => (
                      <button key={k} type="button" onClick={() => setMetode(k)} className={`rounded-xl border-2 p-3 text-left text-sm ${metode === k ? "border-side bg-side/10" : "border-primary/15"}`}>
                        <b className="block text-primary">{t}</b>{d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {ringkasan(<button className={btn} disabled={!subtotal} onClick={() => setStep(2)}>Lanjut ke {metode === "kirim" ? "alamat" : "identitas"}</button>)}
            </div>
          )}

          {step === 2 && (
            <form onSubmit={kirimPesanan} className={grid}>
              <div className={`${box} space-y-4`}>
                <h2 className="text-lg font-bold text-primary">{metode === "kirim" ? "Konfirmasi alamat pengiriman" : "Konfirmasi pengambilan"}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <L t="Nama lengkap"><input required className={inp} value={f.nama} onChange={set("nama")} /></L>
                  <L t="Nomor WhatsApp"><input required inputMode="tel" placeholder="0812xxxxxxxx" className={inp} value={f.telp} onChange={set("telp")} /></L>
                  {metode === "kirim" && [["provinsi", "Provinsi"], ["kota", "Kota / Kabupaten"], ["kecamatan", "Kecamatan"], ["kode_pos", "Kode pos"]].map(([k, t]) => (
                    <L key={k} t={t}><input required className={inp} value={f[k]} onChange={set(k)} /></L>
                  ))}
                </div>
                {metode === "kirim" && (
                  <>
                    <L t="Nama jalan"><input required className={inp} value={f.nama_jalan} onChange={set("nama_jalan")} /></L>
                    <L t="Petunjuk lokasi (opsional)"><textarea rows={3} className={inp} value={f.detail} onChange={set("detail")} placeholder="Patokan, warna rumah, arah hadap…" /></L>
                  </>
                )}
                {err && <p className="text-sm text-red-700">{err}</p>}
              </div>
              {ringkasan(
                <>
                  <button className={btn} disabled={busy}>{busy ? "Mengirim…" : "Kirim pesanan & buka WhatsApp"}</button>
                  <button type="button" onClick={() => setStep(1)} className={ghost}>Kembali</button>
                </>,
              )}
            </form>
          )}

          {step === 3 && order && (
            <div className={grid}>
              <div className={`${box} space-y-4`}>
                <h2 className="text-lg font-bold text-primary">Konfirmasi akhir · Pesanan #{order.id}</h2>
                <div className="rounded-xl bg-primary/5 p-3 text-sm">
                  {order.nama_pembeli} · {order.no_telepon}
                  {metode === "kirim" && <><br />{[order.nama_jalan, order.kecamatan, order.kota, order.provinsi, order.kode_pos].filter(Boolean).join(", ")}</>}
                </div>
                {s === "menunggu" && (
                  <>
                    <p className="text-sm">Kirim pesan WhatsApp agar admin memeriksa {metode === "kirim" ? "alamat dan menghitung ongkir" : "pesananmu"}. Halaman ini diperbarui otomatis setelah admin mengonfirmasi.</p>
                    {order.wa_link && <a href={order.wa_link} target="_blank" rel="noreferrer" className={btn}>Buka WhatsApp</a>}
                    <button type="button" onClick={refresh} className="text-sm font-semibold text-secondary underline">Cek status sekarang</button>
                  </>
                )}
                {s === "dikonfirmasi" && (
                  <>
                    <p className="text-sm">Admin sudah mengonfirmasi pesananmu. Periksa total di samping, lalu kirim konfirmasi akhir.</p>
                    <label className="flex gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />Saya sudah memeriksa pesanan{metode === "kirim" && ", alamat,"} dan total pembayaran.</label>
                    {ok
                      ? <a href={order.wa_link} target="_blank" rel="noreferrer" onClick={selesai} className={btn}>Kirim konfirmasi akhir via WhatsApp</a>
                      : <button disabled className={btn}>Kirim konfirmasi akhir via WhatsApp</button>}
                  </>
                )}
                {s === "ditolak" && (
                  <>
                    <p className="text-sm text-red-700">Pesanan ditolak admin dan stok sudah dikembalikan. Hubungi admin atau buat pesanan baru.</p>
                    <button onClick={ulang} className={btn}>Buat pesanan baru</button>
                  </>
                )}
                {err && <p className="text-sm text-red-700">{err}</p>}
              </div>
              {ringkasan()}
            </div>
          )}

          {step === 4 && order && (
            <div className={`${box} mx-auto max-w-lg space-y-3 text-center`}>
              <h2 className="text-2xl font-extrabold text-primary">Pesanan #{order.id} berhasil dikonfirmasi</h2>
              <p className="text-sm">Total <b>{rp(order.total + order.ongkir)}</b>. Admin akan mengirim metode pembayaran ke WhatsApp {order.no_telepon}.</p>
              <button onClick={ulang} className={btn}>Pesan lagi</button>
            </div>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
