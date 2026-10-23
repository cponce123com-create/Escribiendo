import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ESCRIBIENDO · Editorial No Para Todos",
    short_name: "ESCRIBIENDO",
    description: "Plataforma editorial privada de EDITORIAL NO PARA TODOS.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#11100e",
    theme_color: "#f5f0e7",
    lang: "es",
    icons: [
      {
        src: "/icon.png",
        sizes: "128x128",
        type: "image/png",
      },
    ],
  };
}
