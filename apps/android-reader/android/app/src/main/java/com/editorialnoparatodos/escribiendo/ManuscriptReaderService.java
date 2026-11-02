package com.editorialnoparatodos.escribiendo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class ManuscriptReaderService extends Service {
    public static final String ACTION_PLAY = "com.editorialnoparatodos.escribiendo.reader.PLAY";
    public static final String ACTION_PAUSE = "com.editorialnoparatodos.escribiendo.reader.PAUSE";
    public static final String ACTION_RESUME = "com.editorialnoparatodos.escribiendo.reader.RESUME";
    public static final String ACTION_STOP = "com.editorialnoparatodos.escribiendo.reader.STOP";
    public static final String ACTION_NEXT = "com.editorialnoparatodos.escribiendo.reader.NEXT";
    public static final String ACTION_PREVIOUS = "com.editorialnoparatodos.escribiendo.reader.PREVIOUS";
    public static final String ACTION_RATE = "com.editorialnoparatodos.escribiendo.reader.RATE";
    public static final String ACTION_VOICE = "com.editorialnoparatodos.escribiendo.reader.VOICE";
    static final String ACTION_STATE = "com.editorialnoparatodos.escribiendo.reader.STATE";
    private static final String CHANNEL_ID = "manuscript_reading";
    private static final int NOTIFICATION_ID = 5310;
    private static final int MAX_UTTERANCE_CHARS = 3400;
    private static volatile boolean serviceRunning = false;

    private final List<SpokenSection> sections = new ArrayList<>();
    private TextToSpeech tts;
    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;
    private String bookTitle = "Manuscrito";
    private String voiceId = "";
    private float rate = 1.0f;
    private int sectionIndex = 0;
    private int utteranceIndex = 0;
    private int paragraphIndex = -1;
    private boolean initialized = false;
    private boolean paused = false;
    private boolean preparing = false;

    public static boolean isServiceRunning() { return serviceRunning; }

    private static class SpokenSection {
        final String id;
        final String title;
        final List<SpeechChunk> utterances = new ArrayList<>();
        SpokenSection(String id, String title) { this.id = id; this.title = title; }
    }

    private static class SpeechChunk {
        final String text;
        final int paragraphIndex;
        SpeechChunk(String text, int paragraphIndex) {
            this.text = text;
            this.paragraphIndex = paragraphIndex;
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        serviceRunning = true;
        createNotificationChannel();
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":reader");
        mediaSession = new MediaSessionCompat(this, "EscribiendoManuscriptReader");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { resumeReading(); }
            @Override public void onPause() { pauseReading(); }
            @Override public void onStop() { stopReading(true); }
            @Override public void onSkipToNext() { moveSection(1); }
            @Override public void onSkipToPrevious() { moveSection(-1); }
        });
        mediaSession.setActive(true);
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) {
                sendState("error", "Android no pudo iniciar la voz.");
                stopReading(false);
                return;
            }
            initialized = true;
            tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
            tts.setLanguage(Locale.forLanguageTag("es-PE"));
            tts.setSpeechRate(rate);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { }
                @Override public void onDone(String utteranceId) { runOnMain(ManuscriptReaderService.this::advance); }
                @Override public void onError(String utteranceId) { runOnMain(() -> fail("El motor de voz no pudo leer este fragmento.")); }
                @Override public void onError(String utteranceId, int errorCode) { onError(utteranceId); }
                @Override public void onStop(String utteranceId, boolean interrupted) { }
            });
            if (preparing) applyVoiceAndSpeak();
        });
    }

    @Nullable @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || intent.getAction() == null) return START_NOT_STICKY;
        switch (intent.getAction()) {
            case ACTION_PLAY: loadQueue(); break;
            case ACTION_PAUSE: pauseReading(); break;
            case ACTION_RESUME: resumeReading(); break;
            case ACTION_STOP: stopReading(true); break;
            case ACTION_NEXT: moveSection(1); break;
            case ACTION_PREVIOUS: moveSection(-1); break;
            case ACTION_RATE:
                rate = Math.max(0.65f, Math.min(1.7f, intent.getFloatExtra("rate", 1f)));
                if (tts != null && initialized) tts.setSpeechRate(rate);
                break;
            case ACTION_VOICE:
                voiceId = intent.getStringExtra("voiceId");
                restartCurrentUtterance();
                break;
        }
        return START_NOT_STICKY;
    }

    private void loadQueue() {
        ensureForeground();
        try {
            File queueFile = ReaderQueueFile.get(this);
            byte[] bytes;
            try (FileInputStream input = new FileInputStream(queueFile)) { bytes = input.readAllBytes(); }
            JSONObject queue = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            bookTitle = queue.optString("bookTitle", "Manuscrito");
            rate = (float) Math.max(0.65, Math.min(1.7, queue.optDouble("rate", 1.0)));
            voiceId = queue.optString("voiceId", "");
            sections.clear();
            sectionIndex = 0;
            utteranceIndex = 0;
            paragraphIndex = -1;
            JSONArray rawSections = queue.getJSONArray("sections");
            for (int i = 0; i < rawSections.length(); i++) {
                JSONObject raw = rawSections.getJSONObject(i);
                SpokenSection section = new SpokenSection(raw.optString("id", ""), raw.optString("title", "Sección"));
                appendChunks(section, section.title, -1);
                JSONArray paragraphs = raw.optJSONArray("paragraphs");
                if (paragraphs != null) {
                    for (int paragraph = 0; paragraph < paragraphs.length(); paragraph++) {
                        appendChunks(section, paragraphs.optString(paragraph, ""), paragraph);
                    }
                } else {
                    appendChunks(section, raw.optString("text", ""), 0);
                }
                if (!section.utterances.isEmpty()) sections.add(section);
            }
            if (sections.isEmpty()) { fail("El manuscrito no contiene texto para leer."); return; }
            preparing = true;
            paused = false;
            ensureForeground();
            if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L);
            if (initialized) applyVoiceAndSpeak();
        } catch (Exception error) {
            fail("No se pudo cargar el manuscrito para leerlo.");
        }
    }

    private void appendChunks(SpokenSection section, String rawText, int sourceParagraphIndex) {
        String text = rawText.replace('\u00a0', ' ').trim();
        if (text.isEmpty()) return;
        String[] paragraphs = text.split("\\R+");
        for (String paragraphValue : paragraphs) {
            String paragraph = paragraphValue.replaceAll("\\s+", " ").trim();
            int start = 0;
            while (start < paragraph.length()) {
                int end = Math.min(start + MAX_UTTERANCE_CHARS, paragraph.length());
                if (end < paragraph.length()) {
                    int preferred = -1;
                    int floor = Math.min(end, start + (MAX_UTTERANCE_CHARS * 2 / 3));
                    for (int i = end - 1; i >= floor; i--) {
                        char c = paragraph.charAt(i);
                        if (c == '.' || c == '?' || c == '!' || c == ';' || c == ':' || c == ',') { preferred = i + 1; break; }
                    }
                    if (preferred < 0) {
                        preferred = paragraph.lastIndexOf(' ', end);
                        if (preferred <= start) preferred = end;
                    }
                    end = preferred;
                }
                String chunk = paragraph.substring(start, end).trim();
                if (!chunk.isEmpty()) section.utterances.add(new SpeechChunk(chunk, sourceParagraphIndex));
                start = end;
                while (start < paragraph.length() && Character.isWhitespace(paragraph.charAt(start))) start++;
            }
        }
    }

    private void applyVoiceAndSpeak() {
        if (!initialized || !preparing) return;
        preparing = false;
        if (!voiceId.isEmpty()) {
            boolean voiceFound = false;
            Set<Voice> available = tts.getVoices();
            if (available != null) {
                for (Voice voice : available) {
                    if (voiceId.equals(voice.getName())) {
                        voiceFound = true;
                        if (tts.setVoice(voice) != TextToSpeech.SUCCESS) {
                            fail("No se pudo aplicar la voz española seleccionada.");
                            return;
                        }
                        break;
                    }
                }
            }
            if (!voiceFound) {
                fail("La voz seleccionada ya no está disponible en Android.");
                return;
            }
        }
        tts.setSpeechRate(rate);
        speakCurrent();
    }

    private void speakCurrent() {
        if (paused || sectionIndex >= sections.size()) { finish(); return; }
        SpokenSection section = sections.get(sectionIndex);
        if (utteranceIndex >= section.utterances.size()) {
            sectionIndex++;
            utteranceIndex = 0;
            paragraphIndex = -1;
            speakCurrent();
            return;
        }
        SpeechChunk chunk = section.utterances.get(utteranceIndex);
        paragraphIndex = chunk.paragraphIndex;
        updateSessionAndNotification("playing");
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L);
        Bundle params = new Bundle();
        String utteranceId = sectionIndex + ":" + utteranceIndex;
        int result = tts.speak(chunk.text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result == TextToSpeech.ERROR) fail("Android rechazó un fragmento del texto.");
        else sendState("playing", null);
    }

    private void advance() {
        if (paused) return;
        utteranceIndex++;
        if (sectionIndex < sections.size() && utteranceIndex >= sections.get(sectionIndex).utterances.size()) {
            sectionIndex++;
            utteranceIndex = 0;
        }
        if (sectionIndex >= sections.size()) finish();
        else speakCurrent();
    }

    private void pauseReading() {
        if (!preparing && sections.isEmpty()) return;
        paused = true;
        if (tts != null) tts.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        updateSessionAndNotification("paused");
        sendState("paused", null);
    }

    private void resumeReading() {
        if (sections.isEmpty()) { loadQueue(); return; }
        paused = false;
        if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L);
        preparing = true;
        if (initialized) applyVoiceAndSpeak();
    }

    private void restartCurrentUtterance() {
        if (sections.isEmpty() || paused) return;
        if (tts != null) tts.stop();
        preparing = true;
        if (initialized) applyVoiceAndSpeak();
    }

    private void moveSection(int delta) {
        if (sections.isEmpty()) return;
        sectionIndex = Math.max(0, Math.min(sections.size() - 1, sectionIndex + delta));
        utteranceIndex = 0;
        paragraphIndex = -1;
        paused = false;
        preparing = true;
        if (tts != null) tts.stop();
        if (initialized) applyVoiceAndSpeak();
    }

    private void finish() {
        if (sections.isEmpty()) return;
        String ended = sectionIndex >= sections.size() ? "completed" : "playing";
        if (ended.equals("completed")) {
            sendState("completed", null);
            stopReading(false);
        }
    }

    private void fail(String message) {
        sendState("error", message);
        stopReading(false);
    }

    private void stopReading(boolean notify) {
        if (tts != null) tts.stop();
        if (notify) sendState("idle", null);
        paused = true;
        preparing = false;
        sections.clear();
        sectionIndex = 0;
        utteranceIndex = 0;
        paragraphIndex = -1;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.setPlaybackState(new PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_STOPPED, 0, 0).build());
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        ReaderQueueFile.delete(this);
        stopSelf();
    }

    private void ensureForeground() {
        startForeground(NOTIFICATION_ID, buildNotification("playing"));
        updateSessionAndNotification("playing");
    }

    private void updateSessionAndNotification(String state) {
        if (mediaSession != null) {
            mediaSession.setMetadata(new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, "Lectura del manuscrito")
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Escribiendo")
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, "Escribiendo")
                .build());
            long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE |
                PlaybackStateCompat.ACTION_PLAY_PAUSE | PlaybackStateCompat.ACTION_STOP |
                PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS;
            int playbackState = "paused".equals(state) ? PlaybackStateCompat.STATE_PAUSED : PlaybackStateCompat.STATE_PLAYING;
            mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                .setActions(actions).setState(playbackState, utteranceIndex, "paused".equals(state) ? 0f : 1f).build());
        }
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.notify(NOTIFICATION_ID, buildNotification(state));
    }

    private Notification buildNotification(String state) {
        String action = "paused".equals(state) ? ACTION_RESUME : ACTION_PAUSE;
        String actionLabel = "paused".equals(state) ? "Continuar" : "Pausar";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Escribiendo")
            .setContentText("Lectura del manuscrito")
            .setContentIntent(openAppIntent())
            .setSubText("Escribiendo · lector de voz")
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_previous, "Anterior", actionIntent(ACTION_PREVIOUS, 2)))
            .addAction(new NotificationCompat.Action(
                "paused".equals(state) ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause,
                actionLabel,
                actionIntent(action, 3)))
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_media_next, "Siguiente", actionIntent(ACTION_NEXT, 4)))
            .addAction(new NotificationCompat.Action(android.R.drawable.ic_menu_close_clear_cancel, "Detener", actionIntent(ACTION_STOP, 5)));
        Notification publicNotification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Escribiendo")
            .setContentText("Lectura en curso")
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .build();
        builder.setPublicVersion(publicNotification);
        if (mediaSession != null) {
            builder.setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        }
        return builder.build();
    }

    private PendingIntent openAppIntent() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launch == null) return null;
        launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 1, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, ManuscriptReaderService.class).setAction(action);
        return PendingIntent.getService(this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Lectura del manuscrito", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Controles para escuchar capítulos con la pantalla apagada.");
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void sendState(String state, String message) {
        String title = sectionIndex < sections.size() ? sections.get(sectionIndex).title : "";
        String sectionId = sectionIndex < sections.size() ? sections.get(sectionIndex).id : null;
        android.content.SharedPreferences.Editor saved = getSharedPreferences("reader_state", MODE_PRIVATE)
            .edit().putString("state", state).putInt("sectionIndex", sectionIndex)
            .putInt("paragraphIndex", paragraphIndex).putString("sectionTitle", title);
        if (sectionId == null) saved.remove("sectionId"); else saved.putString("sectionId", sectionId);
        if (message == null) saved.remove("message"); else saved.putString("message", message);
        saved.apply();
        Intent event = new Intent(ACTION_STATE).setPackage(getPackageName());
        event.putExtra("state", state);
        event.putExtra("sectionIndex", sectionIndex);
        event.putExtra("paragraphIndex", paragraphIndex);
        if (sectionId != null) event.putExtra("sectionId", sectionId);
        if (sectionIndex < sections.size()) event.putExtra("sectionTitle", sections.get(sectionIndex).title);
        if (message != null) event.putExtra("message", message);
        sendBroadcast(event);
    }

    private void runOnMain(Runnable runnable) {
        new android.os.Handler(getMainLooper()).post(runnable);
    }

    @Override public void onDestroy() {
        ReaderQueueFile.delete(this);
        android.content.SharedPreferences preferences = getSharedPreferences("reader_state", MODE_PRIVATE);
        String state = preferences.getString("state", "idle");
        if ("playing".equals(state) || "paused".equals(state)) {
            preferences.edit().putString("state", "idle").putInt("sectionIndex", 0).putInt("paragraphIndex", -1)
                .remove("sectionId").remove("sectionTitle").remove("message").apply();
        }
        serviceRunning = false;
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (mediaSession != null) { mediaSession.release(); mediaSession = null; }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
