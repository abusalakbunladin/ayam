import logging
import os
import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.deps import get_db, get_current_user
from app.models import ProdukVarian, Order, OrderItem
from app.schemas import OrderCreate, OrderCreateResponse, OrderKonfirmasiUpdate, OrderResponse

router = APIRouter(prefix="/order", tags=["Order"])

logger = logging.getLogger(__name__)

def _nomor_wa_admin() -> str | None:
    angka = re.sub(r"\D", "", os.getenv("ADMIN_WA_NUMBER", ""))
    if angka.startswith("0"):
        angka = "62" + angka[1:]
    elif angka.startswith("8"):
        angka = "62" + angka
    if not re.fullmatch(r"62\d{8,13}", angka):
        return None
    return angka


def _format_rupiah(angka: int) -> str:
    return f"Rp{angka:,.0f}".replace(",", ".")


def _buat_pesan_wa(order: Order) -> str:
    kirim, akhir = order.metode == "kirim", order.status_konfirmasi == "dikonfirmasi"
    judul = "KONFIRMASI AKHIR" if akhir else "KONFIRMASI ALAMAT" if kirim else "KONFIRMASI PENGAMBILAN"
    barang = "\n\n".join(
        f"{n}. {i.varian.produk.nama} · {i.varian.berat:g} kg\n   {i.jumlah} kemasan × {_format_rupiah(i.harga_saat_itu)}\n   Harga: {_format_rupiah(i.harga_saat_itu * i.jumlah)}"
        for n, i in enumerate(order.items, 1)
    )
    if akhir:
        ongkir, total = _format_rupiah(order.ongkir), _format_rupiah(order.total + order.ongkir)
    else:
        ongkir = "Berbayar" if kirim else "Ambil sendiri"
        total = _format_rupiah(order.total) + (" + biaya pengiriman" if kirim else "")
    alamat = ""
    if kirim and not akhir:
        jalan = ", ".join(b for b in [order.nama_jalan, order.kecamatan, order.kota, order.provinsi, order.kode_pos] if b)
        petunjuk = f"\nPetunjuk lokasi:\n{order.detail_lainnya}\n" if order.detail_lainnya else ""
        alamat = f"📍 ALAMAT PENGIRIMAN\n{jalan}\n{petunjuk}\n"
    if akhir:
        penutup = f"Mohon informasi mengenai metode pembayaran untuk total {total}."
    elif kirim:
        penutup = "Mohon konfirmasi apakah alamat tersebut sudah benar sebelum pesanan saya diproses."
    else:
        penutup = "Mohon konfirmasi bahwa pesanan saya bisa diambil."
    sudah = "✅ Alamat pengiriman sudah dikonfirmasi.\n\n" if akhir and kirim else ""
    return (
        f"Halo Admin,\n\nSaya ingin melakukan {judul} untuk pesanan #{order.id}.\n\n{sudah}"
        f"📦 DATA PEMESAN\nNama: {order.nama_pembeli}\nNomor: {order.no_telepon}\n\n"
        f"🛒 DETAIL PESANAN\n{barang}\n\n"
        f"💰 RINCIAN PEMBAYARAN\nSubtotal produk: {_format_rupiah(order.total)}\nPengiriman: {ongkir}\nTotal: {total}\n\n"
        f"{alamat}{penutup}\n\nTerima kasih."
    )


def _wa_link(order: Order) -> str | None:
    nomor = _nomor_wa_admin()
    if not nomor:
        logger.warning("ADMIN_WA_NUMBER kosong/tidak valid di .env, link WhatsApp tidak dibuat")
        return None
    return f"https://wa.me/{nomor}?text={quote(_buat_pesan_wa(order))}"


def _digit(nomor: str) -> str:
    return re.sub(r"\D", "", nomor or "").removeprefix("62").lstrip("0")


@router.get("", response_model=list[OrderResponse])
def list_orders(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    return db.query(Order).options(joinedload(Order.items)).order_by(Order.tanggal.desc()).all()


@router.post("", response_model=OrderCreateResponse)
def create_order(data: OrderCreate, db: Session = Depends(get_db)):
    ids_varian = sorted({item.produk_varian_id for item in data.items})
    db.query(ProdukVarian).filter(ProdukVarian.id.in_(ids_varian)).order_by(ProdukVarian.id).with_for_update().all()

    order = Order(
        nama_pembeli=data.nama_pembeli,
        metode=data.metode,
        no_telepon=data.no_telepon,
        provinsi=data.provinsi,
        kota=data.kota,
        kecamatan=data.kecamatan,
        kode_pos=data.kode_pos,
        nama_jalan=data.nama_jalan,
        detail_lainnya=data.detail_lainnya,
        total=0,
    )
    db.add(order)
    db.flush()

    total = 0
    for item in data.items:
        varian = db.query(ProdukVarian).filter(ProdukVarian.id == item.produk_varian_id).first()
        if not varian:
            raise HTTPException(status_code=404, detail=f"Varian produk id {item.produk_varian_id} tidak ditemukan")
        if varian.stok < item.jumlah:
            raise HTTPException(status_code=400, detail=f"Stok {varian.produk.nama} ({varian.berat}kg) tidak cukup (sisa {varian.stok})")
        varian.stok -= item.jumlah
        subtotal = varian.harga * item.jumlah
        total += subtotal
        db.add(OrderItem(order_id=order.id, produk_varian_id=varian.id, jumlah=item.jumlah, harga_saat_itu=varian.harga))

    order.total = total
    db.commit()
    db.refresh(order)

    order.wa_link = _wa_link(order)
    return order


@router.patch("/{order_id}/konfirmasi", response_model=OrderResponse)
def konfirmasi_order(
    order_id: int,
    data: OrderKonfirmasiUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")

    if order.status_konfirmasi != "menunggu":
        raise HTTPException(
            status_code=400,
            detail=f"Pesanan ini sudah berstatus '{order.status_konfirmasi}', tidak bisa dikonfirmasi/ditolak ulang",
        )

    if data.status_konfirmasi == "ditolak":
        for item in order.items:
            varian = db.query(ProdukVarian).filter(ProdukVarian.id == item.produk_varian_id).with_for_update().first()
            if varian:
                varian.stok += item.jumlah

    order.status_konfirmasi = data.status_konfirmasi
    order.ongkir = data.ongkir if order.metode == "kirim" else 0
    db.commit()
    db.refresh(order)
    return order


@router.get("/lacak/{order_id}", response_model=OrderCreateResponse)
def lacak_order(order_id: int, no_telepon: str, db: Session = Depends(get_db)):
    """Publik: pembeli cek status pesanannya (order id + nomor HP yang dipakai saat memesan)."""
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order or _digit(order.no_telepon) != _digit(no_telepon):
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    order.wa_link = None if order.status_konfirmasi == "ditolak" else _wa_link(order)
    return order
