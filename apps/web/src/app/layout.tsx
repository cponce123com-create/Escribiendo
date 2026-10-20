import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const dynamic = "force-dynamic";

const THEME_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("escribiendo-theme");
    var dark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export const metadata: Metadata = {
  title: {
    default: "ESCRIBIENDO · Editorial No Para Todos",
    template: "%s · ESCRIBIENDO",
  },
  description:
    "Plataforma privada de escritura, edición y maquetación editorial de EDITORIAL NO PARA TODOS.",
  applicationName: "ESCRIBIENDO",
  authors: [{ name: "EDITORIAL NO PARA TODOS" }],
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e7" },
    { media: "(prefers-color-scheme: dark)", color: "#11100e" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const nonce = headerStore.get("x-nonce") ?? undefined;

  return (
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
