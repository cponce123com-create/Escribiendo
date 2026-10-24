import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

// En el monorepo, el entorno vive en la raíz. Render inyecta las variables
// directamente y este archivo no las sobrescribe.
loadEnv({ path: path.resolve(process.cwd(), "../../.env"), quiet: true });

const isProduction = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  // Next.js 16 bloquea los recursos de desarrollo servidos desde otro origen.
  // La aplicación se prueba en 127.0.0.1, por lo que se autoriza ese host
  // en desarrollo. No afecta a la compilación de producción.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Los indicadores de desarrollo de Next.js 16 aplican estilos en línea, que
  // la CSP estricta bloquea, y el bloqueo provoca una recarga continua del
  // navegador. En desarrollo no aportan nada al producto.
  devIndicators: false,
  transpilePackages: [
    "@escribiendo/book-schema",
    "@escribiendo/database",
    "@escribiendo/editorial-engine",
    "@escribiendo/shared",
  ],
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2", "pdfjs-dist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  async headers() {
    const headers = [
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "X-Frame-Options",
        value: "DENY",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
      },
      {
        key: "Cross-Origin-Opener-Policy",
        value: "same-origin",
      },
      {
        key: "Cross-Origin-Resource-Policy",
        value: "same-origin",
      },
      {
        key: "X-DNS-Prefetch-Control",
        value: "off",
      },
    ];

    if (isProduction) {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      });
    }

    return [
      {
        source: "/:path*",
        headers,
      },
    ];
  },
};

export default nextConfig;
