import { registerPlugin } from "@capacitor/core";

export interface ReaderVoice {
  id: string;
  name: string;
  language: string;
  requiresNetwork: boolean;
}

export interface ReaderSection {
  id: string;
  title: string;
  paragraphs: string[];
  /** Plain-text fallback for Android bridges that do not preserve nested arrays. */
  text?: string;
}

export interface ReaderPlaybackState {
  state: "idle" | "playing" | "paused" | "completed" | "error";
  sectionIndex: number;
  sectionId?: string;
  paragraphIndex?: number;
  sectionTitle?: string;
  message?: string;
}

export interface NativeManuscriptReaderPlugin {
  getVoices(): Promise<{ voices: ReaderVoice[] }>;
  getPlaybackState(): Promise<ReaderPlaybackState>;
  requestNotificationsPermission(): Promise<{ granted: boolean }>;
  play(options: {
    bookTitle: string;
    sections: ReaderSection[];
    rate: number;
    voiceId?: string;
  }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  setRate(options: { rate: number }): Promise<void>;
  setVoice(options: { voiceId: string }): Promise<void>;
  addListener(
    eventName: "playbackState",
    listener: (state: ReaderPlaybackState) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

export const NativeManuscriptReader =
  registerPlugin<NativeManuscriptReaderPlugin>("NativeManuscriptReader");
