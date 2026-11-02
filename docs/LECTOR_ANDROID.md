# Lector de manuscritos para Android

La app `apps/android-reader` agrega un contenedor Capacitor para Android y un plugin nativo que lee el manuscrito con el motor TextToSpeech del teléfono. No usa una API de IA para sintetizar voz. El texto se obtiene de la cuenta autenticada en Escribiendo, se entrega temporalmente al proceso Android y se elimina al detener o finalizar la reproducción.

## Funciones

- Escuchar la sección abierta o continuar desde ella hasta el final del libro.
- Elegir una voz instalada y cambiar la velocidad.
- Mantener la lectura con la pantalla bloqueada mediante un servicio multimedia de Android.
- Controles de reproducir, pausar, detener, capítulo anterior y siguiente desde la notificación/pantalla de bloqueo.
- Reanudar el fragmento actual al continuar después de una pausa.

La lectura necesita conexión para iniciar sesión y cargar el texto del libro. Para escuchar sin conexión, el dispositivo debe tener descargada una voz española; el APK no descarga modelos de voz propios. El servidor envía solo el capítulo elegido o las secciones desde el punto actual y limita la cola a 10 MB. Android guarda esa cola temporal en su directorio excluido de copias de seguridad y la elimina al terminar. Las notificaciones y los metadatos multimedia muestran información genérica para no revelar títulos en la pantalla bloqueada.

## Crear el APK en una computadora

Instala Node.js 24, pnpm 12, Android Studio con Android SDK 36 y JDK 21. Luego, desde la raíz del repositorio:

```sh
pnpm install --frozen-lockfile
pnpm --filter @escribiendo/android-reader sync
pnpm --filter @escribiendo/android-reader build:apk
```

El APK de depuración queda en:

```text
apps/android-reader/android/app/build/outputs/apk/debug/app-debug.apk
```

La URL web está en `apps/android-reader/capacitor.config.ts`. Puede reemplazarse durante la sincronización con `ESCRIBIENDO_WEB_URL`.

## Descargar el APK desde GitHub Actions

El flujo `APK del lector Android` compila un APK de depuración en cada PR que cambie el lector y en cada cambio correspondiente a `main`. También se puede iniciar manualmente desde **Actions → APK del lector Android → Run workflow**.

Cuando el flujo termine en verde:

1. Abre la ejecución más reciente de **APK del lector Android** en GitHub Actions.
2. En la parte inferior, descarga el artefacto `Escribiendo-Lector-Android-debug`.
3. Descomprime el ZIP y copia `app-debug.apk` al teléfono.
4. Abre el APK y permite instalar aplicaciones desde esa fuente cuando Android lo solicite.
5. Inicia sesión en Escribiendo, abre un manuscrito, pulsa **Escuchar** y acepta el permiso de notificaciones.
6. Bloquea la pantalla y verifica que el audio continúe; usa la notificación para pausar, avanzar o detener.
7. Comprueba que la pantalla bloqueada solo muestre «Escribiendo» y no revele el título del libro ni del capítulo.

El artefacto de GitHub caduca a los 14 días. Es un APK de depuración para instalación personal, no un paquete firmado para publicar en Google Play.

## Alcance de esta primera versión

El APK carga la interfaz de Escribiendo desde la URL configurada y requiere conexión para acceder al manuscrito. Capacitor documenta `server.url` principalmente para recarga en vivo y no como estrategia de distribución de producción; por ello, esta compilación está destinada a prueba personal. Antes de publicar en una tienda, habría que empaquetar una interfaz local y definir una autenticación móvil de producción. La voz y el servicio en segundo plano sí se ejecutan en Android.
