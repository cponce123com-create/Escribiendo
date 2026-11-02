"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  NativeManuscriptReader,
  type ReaderPlaybackState,
  type ReaderVoice,
} from "@escribiendo/native-reader";
import { getBookReadAloudContentAction } from "@/lib/books/reading-actions";
import type { ReadAloudMode } from "@/lib/editor/read-aloud-queue";
import { filterSpanishVoices, getSpanishVoiceLocaleLabel } from "@/lib/editor/read-aloud-voices";
import { getReadAloudStartErrorMessage } from "@/lib/editor/read-aloud-errors";

interface ManuscriptReadAloudProps {
  bookId: string;
  currentSectionId: string;
}

const RATE_OPTIONS = [0.75, 0.9, 1, 1.15, 1.3, 1.5] as const;

export function ManuscriptReadAloud({ bookId, currentSectionId }: ManuscriptReadAloudProps) {
  const isAndroidApp = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const [voices, setVoices] = useState<ReaderVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceId, setVoiceId] = useState("");
  const [rate, setRate] = useState(1);
  const [mode, setMode] = useState<ReadAloudMode>("chapter");
  const [playback, setPlayback] = useState<ReaderPlaybackState>({
    state: "idle",
    sectionIndex: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAndroidApp) return;
    let mounted = true;
    let listener: { remove(): Promise<void> } | undefined;

    void NativeManuscriptReader.addListener("playbackState", (state) => {
      if (mounted) {
        setPlayback(state);
        if (state.state === "error" && state.message) setError(state.message);
      }
    }).then((handle) => {
      if (mounted) listener = handle;
      else void handle.remove();
    });

    void NativeManuscriptReader.getVoices()
      .then(({ voices: available }) => {
        if (!mounted) return;
        const spanishVoices = filterSpanishVoices(available);
        setVoices(spanishVoices);
        setVoicesLoaded(true);
        const preferred = spanishVoices.find((voice) => !voice.requiresNetwork);
        setVoiceId(preferred?.id ?? spanishVoices[0]?.id ?? "");
      })
      .catch(() => {
        if (mounted) {
          setVoicesLoaded(true);
          setError("No se pudieron consultar las voces instaladas en Android.");
        }
      });

    void NativeManuscriptReader.getPlaybackState()
      .then((state) => {
        if (mounted) {
          setPlayback(state);
          if (state.state === "error" && state.message) setError(state.message);
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
      void listener?.remove();
    };
  }, [isAndroidApp]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (
        !voices
          .find((voice) => voice.id === voiceId)
          ?.language.toLowerCase()
          .startsWith("es")
      ) {
        setError("Selecciona una voz española o instala una en los ajustes de voz de Android.");
        return;
      }
      const permission = await NativeManuscriptReader.requestNotificationsPermission();
      if (!permission.granted) {
        setError(
          "Permite las notificaciones para mantener visibles los controles al bloquear el teléfono.",
        );
        return;
      }
      const result = await getBookReadAloudContentAction(bookId, currentSectionId, mode);
      if (!result.success) {
        setError(result.message);
        return;
      }
      const queue = result.sections;
      if (queue.length === 0) {
        setError("No se encontró texto en la sección actual. Elige otra sección del libro.");
        return;
      }
      await NativeManuscriptReader.play({
        bookTitle: result.bookTitle,
        sections: queue,
        rate,
        ...(voiceId ? { voiceId } : {}),
      });
      setPlayback({ state: "playing", sectionIndex: 0, sectionTitle: queue[0]?.title });
    } catch (error) {
      setError(getReadAloudStartErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [bookId, currentSectionId, mode, rate, voiceId, voices]);

  const changeRate = async (nextRate: number) => {
    setRate(nextRate);
    if (playback.state === "playing" || playback.state === "paused") {
      await NativeManuscriptReader.setRate({ rate: nextRate });
    }
  };

  const changeVoice = async (nextVoiceId: string) => {
    setVoiceId(nextVoiceId);
    if (playback.state === "playing" || playback.state === "paused") {
      await NativeManuscriptReader.setVoice({ voiceId: nextVoiceId });
    }
  };

  if (!isAndroidApp) return null;

  const statusText =
    playback.state === "playing"
      ? `Leyendo: ${playback.sectionTitle ?? "manuscrito"}`
      : playback.state === "paused"
        ? "Lectura pausada"
        : playback.state === "completed"
          ? "Lectura finalizada"
          : playback.state === "error"
            ? (playback.message ?? "La lectura encontró un error.")
            : "Listo para escuchar este manuscrito.";

  return (
    <section
      aria-label="Lector de voz del manuscrito"
      className="mb-3 rounded-xl border border-line bg-surface p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="read-aloud-mode">
          Qué leer
        </label>
        <select
          id="read-aloud-mode"
          className="min-h-10 rounded-lg border border-line bg-canvas px-3 text-sm"
          value={mode}
          onChange={(event) => setMode(event.target.value as ReadAloudMode)}
          disabled={busy || playback.state === "playing"}
        >
          <option value="chapter">Este capítulo</option>
          <option value="book">Desde aquí hasta el final</option>
        </select>
        <label className="sr-only" htmlFor="read-aloud-voice">
          Voz del teléfono
        </label>
        <select
          id="read-aloud-voice"
          className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm"
          value={voiceId}
          onChange={(event) => void changeVoice(event.target.value)}
          disabled={voices.length === 0 || playback.state === "playing"}
        >
          {!voicesLoaded ? <option value="">Cargando voces…</option> : null}
          {voicesLoaded && voices.length === 0 ? (
            <option value="">No hay voces españolas instaladas</option>
          ) : null}
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {getSpanishVoiceLocaleLabel(voice.language)} · {voice.name}
              {voice.requiresNetwork ? " · requiere conexión" : " · sin conexión"}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="read-aloud-rate">
          Velocidad de lectura
        </label>
        <select
          id="read-aloud-rate"
          className="min-h-10 rounded-lg border border-line bg-canvas px-3 text-sm"
          value={rate}
          onChange={(event) => void changeRate(Number(event.target.value))}
        >
          {RATE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
        {playback.state === "playing" ? (
          <button
            type="button"
            className="min-h-10 rounded-lg border border-line px-3 text-sm font-medium"
            onClick={() => void NativeManuscriptReader.pause()}
          >
            Pausar
          </button>
        ) : playback.state === "paused" ? (
          <button
            type="button"
            className="min-h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-white"
            onClick={() => void NativeManuscriptReader.resume()}
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            className="min-h-10 rounded-lg bg-accent px-3 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void start()}
            disabled={busy || voices.length === 0}
          >
            {busy ? "Preparando…" : "Escuchar"}
          </button>
        )}
        {playback.state !== "idle" && playback.state !== "completed" ? (
          <button
            type="button"
            className="min-h-10 rounded-lg border border-line px-3 text-sm"
            onClick={() => void NativeManuscriptReader.stop()}
          >
            Detener
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-muted" role="status" aria-live="polite">
        {statusText}
      </p>
      {voicesLoaded && voices.length === 0 ? (
        <p className="mt-1 text-xs text-ink-muted">
          Instala datos de voz en español desde los ajustes de síntesis de voz de Android. Si está
          disponible, elige Español (Latinoamérica) o una voz de un país latinoamericano.
        </p>
      ) : null}
      {voices.length > 0 && voices.every((voice) => voice.requiresNetwork) ? (
        <p className="mt-1 text-xs text-ink-muted">
          Estas voces españolas requieren conexión. Instala una voz sin conexión en los ajustes de
          síntesis de voz de Android si tu motor ofrece esa opción.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
