"use client";

import Link from "next/link";
import { Capacitor } from "@capacitor/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  NativeManuscriptReader,
  type ReaderPlaybackState,
  type ReaderVoice,
} from "@escribiendo/native-reader";
import { getBookReadAloudContentAction } from "@/lib/books/reading-actions";
import type { ReadAloudSection } from "@/lib/books/reading-actions";
import { filterSpanishVoices, getSpanishVoiceLocaleLabel } from "@/lib/editor/read-aloud-voices";
import { getReadAloudStartErrorMessage } from "@/lib/editor/read-aloud-errors";
import { paginateReaderBlocks, readerPageForBlock } from "@/lib/editor/read-aloud-pagination";
import type { ReadAloudBlock, ReadAloudTextRun } from "@/lib/editor/read-aloud-document";
import styles from "./manuscript-book-reader.module.css";

type ReadMode = "chapter" | "book";
type ReaderTheme = "paper" | "sepia" | "night";
type TurnDirection = "next" | "previous";

interface ManuscriptBookReaderProps {
  bookId: string;
  bookTitle: string;
  currentSectionId: string;
}

const RATE_OPTIONS = [0.75, 0.9, 1, 1.15, 1.3, 1.5] as const;
const FONT_SIZES = [17, 19, 21, 23, 25] as const;
const EMPTY_BLOCKS: ReadAloudBlock[] = [];
const subscribeToPlatform = () => () => undefined;
const isAndroidPlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
const serverPlatformSnapshot = () => false;

function RunText({ run }: { run: ReadAloudTextRun }) {
  let content: ReactNode = run.text;
  if (run.code) content = <code>{content}</code>;
  if (run.strike) content = <s>{content}</s>;
  if (run.underline) content = <u>{content}</u>;
  if (run.italic) content = <em>{content}</em>;
  if (run.bold) content = <strong>{content}</strong>;
  return <>{content}</>;
}

function ReaderBlock({ block, active }: { block: ReadAloudBlock; active: boolean }) {
  const content = block.runs.map((run, index) => (
    <RunText key={`${index}-${run.text}`} run={run} />
  ));
  const className = `${styles.block} ${styles[`block_${block.type.replaceAll("-", "_")}`]} ${active ? styles.blockActive : ""}`;
  if (block.type === "scene-break") {
    return (
      <div className={className} aria-label="Separación de escena">
        <span aria-hidden="true">⁂</span>
      </div>
    );
  }
  if (block.type === "image") {
    return (
      <figure className={className}>
        {block.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={block.imageUrl} alt={block.text} loading="lazy" />
        ) : null}
        <figcaption>Imagen: {content}</figcaption>
      </figure>
    );
  }
  if (block.type === "heading") return <h3 className={className}>{content}</h3>;
  if (block.type === "quote") return <blockquote className={className}>{content}</blockquote>;
  return (
    <p className={className}>
      {block.type === "list-item" ? <span aria-hidden="true">• </span> : null}
      {content}
    </p>
  );
}

export function ManuscriptBookReader({
  bookId,
  bookTitle,
  currentSectionId,
}: ManuscriptBookReaderProps) {
  const android = useSyncExternalStore(
    subscribeToPlatform,
    isAndroidPlatform,
    serverPlatformSnapshot,
  );
  const [mode, setMode] = useState<ReadMode>("chapter");
  const [sections, setSections] = useState<ReadAloudSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<ReaderVoice[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceId, setVoiceId] = useState("");
  const [rate, setRate] = useState(1);
  const [fontSize, setFontSize] = useState<(typeof FONT_SIZES)[number]>(19);
  const [theme, setTheme] = useState<ReaderTheme>("paper");
  const [playback, setPlayback] = useState<ReaderPlaybackState>({ state: "idle", sectionIndex: 0 });
  const [manualPagePosition, setManualPagePosition] = useState({ sectionId: "", pageIndex: 0 });
  const [pages, setPages] = useState<number[][]>([]);
  const [turnDirection, setTurnDirection] = useState<TurnDirection>("next");
  const [turnKey, setTurnKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const pageBodyRef = useRef<HTMLDivElement>(null);
  const measureBodyRef = useRef<HTMLDivElement>(null);
  const measureFlowRef = useRef<HTMLDivElement>(null);
  const swipeStartX = useRef<number | null>(null);

  const sectionIndexFromId = playback.sectionId
    ? sections.findIndex((section) => section.id === playback.sectionId)
    : -1;
  const currentSectionIndex =
    sectionIndexFromId >= 0
      ? sectionIndexFromId
      : Math.min(playback.sectionIndex, Math.max(0, sections.length - 1));
  const currentSection = sections[currentSectionIndex];
  const blocks = currentSection?.paragraphs ?? EMPTY_BLOCKS;
  const isActive = playback.state === "playing" || playback.state === "paused";
  const activeBlockIndex = playback.paragraphIndex ?? -1;
  const pageIndex =
    activeBlockIndex >= 0
      ? readerPageForBlock(pages, activeBlockIndex)
      : manualPagePosition.sectionId === currentSection?.id
        ? manualPagePosition.pageIndex
        : 0;
  const speakableBlockCount = useMemo(
    () => blocks.filter((block) => block.text.length > 0).length,
    [blocks],
  );

  useEffect(() => {
    if (!android) return;
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
        const spanish = filterSpanishVoices(available);
        setVoices(spanish);
        setVoiceId(spanish.find((voice) => !voice.requiresNetwork)?.id ?? spanish[0]?.id ?? "");
        setVoicesLoaded(true);
      })
      .catch(() => {
        if (mounted) {
          setVoicesLoaded(true);
          setError("No se pudieron consultar las voces españolas de Android.");
        }
      });
    void NativeManuscriptReader.getPlaybackState()
      .then((state) => {
        if (!mounted) return;
        setPlayback(
          state.state === "idle" ? { state: "idle", sectionIndex: 0, paragraphIndex: -1 } : state,
        );
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      void listener?.remove();
    };
  }, [android]);

  useEffect(() => {
    if (!android) return;
    let mounted = true;
    void getBookReadAloudContentAction(bookId, currentSectionId, mode)
      .then((result) => {
        if (!mounted) return;
        if (result.success) setSections(result.sections);
        else {
          setSections([]);
          setError(result.message);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSections([]);
        setError("No se pudo preparar el texto del lector.");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [android, bookId, currentSectionId, mode]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const actualBody = pageBodyRef.current;
      const measuredBody = measureBodyRef.current;
      const measureFlow = measureFlowRef.current;
      if (!actualBody || !measuredBody || !measureFlow) return;
      measuredBody.style.width = `${actualBody.clientWidth}px`;
      const style = window.getComputedStyle(actualBody);
      const availableHeight =
        actualBody.clientHeight -
        Number.parseFloat(style.paddingTop || "0") -
        Number.parseFloat(style.paddingBottom || "0");
      const gap = Number.parseFloat(window.getComputedStyle(measureFlow).rowGap || "16") || 16;
      const heights = Array.from(measureFlow.children).map(
        (child) => (child as HTMLElement).getBoundingClientRect().height,
      );
      setPages(paginateReaderBlocks(heights, availableHeight, gap));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [blocks, fontSize, layoutVersion]);

  useEffect(() => {
    const body = pageBodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => setLayoutVersion((value) => value + 1));
    observer.observe(body);
    return () => observer.disconnect();
  }, [currentSectionIndex]);

  const changePage = useCallback(
    (target: number, direction?: TurnDirection) => {
      const lastPage = Math.max(0, pages.length - 1);
      const next = Math.max(0, Math.min(lastPage, target));
      if (next === pageIndex) return;
      setTurnDirection(direction ?? (next > pageIndex ? "next" : "previous"));
      setTurnKey((value) => value + 1);
      setManualPagePosition({ sectionId: currentSection?.id ?? "", pageIndex: next });
    },
    [currentSection?.id, pageIndex, pages.length],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "SELECT" ||
        target?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (event.key === "ArrowRight") changePage(pageIndex + 1, "next");
      if (event.key === "ArrowLeft") changePage(pageIndex - 1, "previous");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changePage, pageIndex]);

  const startPlayback = async () => {
    if (!currentSection || voices.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await NativeManuscriptReader.requestNotificationsPermission();
      if (!permission.granted) {
        setError(
          "Permite las notificaciones de Escribiendo para usar los controles con la pantalla bloqueada.",
        );
        return;
      }
      await NativeManuscriptReader.play({
        bookTitle,
        sections: sections.map(({ id, title, paragraphs }) => ({
          id,
          title,
          paragraphs: paragraphs.map((paragraph) => paragraph.text),
        })),
        rate,
        ...(voiceId ? { voiceId } : {}),
      });
      setPlayback({
        state: "playing",
        sectionIndex: 0,
        sectionId: sections[0]?.id,
        paragraphIndex: -1,
        sectionTitle: sections[0]?.title,
      });
    } catch (caught) {
      setError(getReadAloudStartErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const pauseOrResume = async () => {
    if (playback.state === "playing") await NativeManuscriptReader.pause();
    else if (playback.state === "paused") await NativeManuscriptReader.resume();
  };

  const stopPlayback = async () => {
    await NativeManuscriptReader.stop();
  };

  const activeParagraphNumber =
    activeBlockIndex < 0
      ? 0
      : blocks.slice(0, activeBlockIndex + 1).filter((block) => block.text.length > 0).length;
  const visibleBlockIndexes = pages[pageIndex] ?? [];
  const backHref = `/books/${bookId}/sections/${currentSection?.id ?? currentSectionId}`;

  if (!android) {
    return (
      <main className={styles.unavailable}>
        <p>El lector con voz está disponible en la aplicación Android.</p>
        <Link href={`/books/${bookId}/sections/${currentSectionId}`}>Volver al manuscrito</Link>
      </main>
    );
  }

  return (
    <main
      className={`${styles.shell} ${styles[`theme_${theme}`]}`}
      style={{ "--reader-font-size": `${fontSize}px` } as CSSProperties}
    >
      <header className={styles.topbar}>
        <Link href={backHref} className={styles.backLink} aria-label="Volver al manuscrito">
          ←
        </Link>
        <div className={styles.bookHeading}>
          <span>LECTOR</span>
          <strong>{bookTitle}</strong>
        </div>
        <div className={styles.topControls}>
          <label className={styles.srOnly} htmlFor="reader-mode">
            Alcance de lectura
          </label>
          <select
            id="reader-mode"
            value={mode}
            onChange={(event) => {
              setLoading(true);
              setPlayback({ state: "idle", sectionIndex: 0, paragraphIndex: -1 });
              setMode(event.target.value as ReadMode);
            }}
            disabled={isActive || loading}
          >
            <option value="chapter">Este capítulo</option>
            <option value="book">Desde aquí hasta el final</option>
          </select>
          <label className={styles.srOnly} htmlFor="reader-voice">
            Voz en español
          </label>
          <select
            id="reader-voice"
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            disabled={voices.length === 0 || isActive}
          >
            {!voicesLoaded ? <option value="">Cargando voces…</option> : null}
            {voicesLoaded && voices.length === 0 ? (
              <option value="">Sin voces españolas</option>
            ) : null}
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {getSpanishVoiceLocaleLabel(voice.language)} · {voice.name}
                {voice.requiresNetwork ? " · en línea" : " · sin conexión"}
              </option>
            ))}
          </select>
          <label className={styles.srOnly} htmlFor="reader-rate">
            Velocidad
          </label>
          <select
            id="reader-rate"
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
          >
            {RATE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className={styles.readingStage} aria-label="Página del manuscrito">
        <button
          className={styles.pageArrow}
          type="button"
          aria-label="Página anterior"
          onClick={() => changePage(pageIndex - 1, "previous")}
          disabled={pageIndex <= 0}
        >
          ‹
        </button>
        <article
          className={`${styles.page} ${styles[`turn_${turnDirection}`]}`}
          key={`${currentSection?.id ?? "loading"}-${pageIndex}-${turnKey}`}
          onTouchStart={(event) => {
            swipeStartX.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const endX = event.changedTouches[0]?.clientX;
            if (swipeStartX.current === null || endX === undefined) return;
            const delta = endX - swipeStartX.current;
            if (Math.abs(delta) > 48) changePage(pageIndex + (delta < 0 ? 1 : -1));
            swipeStartX.current = null;
          }}
        >
          <header className={styles.pageHeader}>
            <span>
              {currentSection
                ? "LECTURA DEL MANUSCRITO"
                : loading
                  ? "Preparando manuscrito…"
                  : "Lector de voz"}
            </span>
            {pageIndex === 0 ? (
              <h1>{currentSection?.title ?? bookTitle}</h1>
            ) : (
              <span className={styles.runningTitle}>{currentSection?.title ?? bookTitle}</span>
            )}
          </header>
          <div className={styles.pageBody} ref={pageBodyRef}>
            {loading ? <p className={styles.emptyState}>Preparando las páginas…</p> : null}
            {!loading && !currentSection ? (
              <p className={styles.emptyState}>No se encontró contenido para leer.</p>
            ) : null}
            {!loading && currentSection
              ? visibleBlockIndexes.map((index) => {
                  const block = blocks[index];
                  return block ? (
                    <ReaderBlock
                      key={`${index}-${block.text}`}
                      block={block}
                      active={isActive && activeBlockIndex === index}
                    />
                  ) : null;
                })
              : null}
          </div>
          <footer className={styles.pageFooter}>
            <span>
              {currentSectionIndex + 1} / {Math.max(1, sections.length)}
            </span>
            <span>
              Página {pageIndex + 1} de {Math.max(1, pages.length)}
            </span>
          </footer>
        </article>
        <button
          className={styles.pageArrow}
          type="button"
          aria-label="Página siguiente"
          onClick={() => changePage(pageIndex + 1, "next")}
          disabled={pageIndex >= pages.length - 1}
        >
          ›
        </button>
      </section>

      <div className={styles.measurePage} aria-hidden="true">
        <div className={styles.pageBody} ref={measureBodyRef}>
          <div className={styles.measureFlow} ref={measureFlowRef}>
            {blocks.map((block, index) => (
              <ReaderBlock key={`measure-${index}`} block={block} active={false} />
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.controlBar}>
        <div className={styles.progressInfo} role="status" aria-live="polite">
          <strong>
            {playback.state === "playing"
              ? "Reproduciendo"
              : playback.state === "paused"
                ? "En pausa"
                : playback.state === "completed"
                  ? "Capítulo finalizado"
                  : "Listo para leer"}
          </strong>
          <span>
            {currentSection?.title ?? ""}
            {activeParagraphNumber
              ? ` · Párrafo ${activeParagraphNumber} de ${speakableBlockCount}`
              : ""}
          </span>
        </div>
        <div className={styles.transport}>
          {isActive ? (
            <>
              <button
                type="button"
                onClick={() => void pauseOrResume()}
                className={styles.primaryControl}
              >
                {playback.state === "playing" ? "Pausar" : "Continuar"}
              </button>
              <button
                type="button"
                onClick={() => void stopPlayback()}
                className={styles.secondaryControl}
              >
                Detener
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void startPlayback()}
              disabled={loading || busy || sections.length === 0 || voices.length === 0}
              className={styles.primaryControl}
            >
              {busy ? "Iniciando…" : "Leer en voz alta"}
            </button>
          )}
        </div>
        <div className={styles.appearanceControls} aria-label="Apariencia del lector">
          <button
            type="button"
            onClick={() =>
              setFontSize(
                (value) => FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(value) - 1)] ?? value,
              )
            }
            aria-label="Reducir tamaño de letra"
          >
            A−
          </button>
          <button
            type="button"
            onClick={() =>
              setFontSize(
                (value) =>
                  FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(value) + 1)] ??
                  value,
              )
            }
            aria-label="Aumentar tamaño de letra"
          >
            A+
          </button>
          <label className={styles.srOnly} htmlFor="reader-theme">
            Fondo del lector
          </label>
          <select
            id="reader-theme"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ReaderTheme)}
          >
            <option value="paper">Papel</option>
            <option value="sepia">Sepia</option>
            <option value="night">Noche</option>
          </select>
        </div>
      </footer>

      {!voicesLoaded || voices.length === 0 ? (
        <p className={styles.voiceHint}>
          Instala una voz en español en los ajustes de síntesis de voz de Android; para escuchar sin
          conexión, elige una voz descargada.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {pages.length === 0 && !loading && sections.length > 0 ? (
        <p className={styles.error} role="status">
          Ajustando la página al tamaño de la pantalla…
        </p>
      ) : null}
    </main>
  );
}
