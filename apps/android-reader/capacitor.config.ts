import type { CapacitorConfig } from "@capacitor/cli";

const webUrl = process.env.ESCRIBIENDO_WEB_URL ?? "https://escribiendo-6ypc.onrender.com";
const webHost = new URL(webUrl).host;

const config: CapacitorConfig = {
  appId: "com.editorialnoparatodos.escribiendo",
  appName: "Escribiendo · Lector",
  webDir: "www",
  server: {
    // Esta app personal abre la web autenticada para reutilizar los libros y
    // sesiones existentes. El servicio de voz y sus controles sí son nativos.
    url: webUrl,
    cleartext: false,
    allowNavigation: [webHost],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
