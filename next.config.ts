import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: izinkan akses `next dev` dari perangkat lain di LAN
  // (mis. tes tampilan mobile dari HP). Wildcard karena IP dari DHCP bisa
  // berubah. Tidak berpengaruh di produksi.
  allowedDevOrigins: ["192.168.1.*"],
  experimental: {
    // Batasi worker "Collecting page data" agar build tidak OOM di mesin
    // dengan RAM terbatas. Tidak memengaruhi hasil build/runtime produksi.
    cpus: 2,
    // Foto laporan dikirim lewat Server Action (maks 5MB, lihat
    // MAX_IMAGE_BYTES) — default Next.js hanya 1MB.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
