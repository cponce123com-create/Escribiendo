package com.editorialnoparatodos.escribiendo;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(
    name = "NativeManuscriptReader",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeManuscriptReaderPlugin extends Plugin {
    private static final int MAX_QUEUE_BYTES = 12 * 1024 * 1024;
    private BroadcastReceiver stateReceiver;

    @Override
    public void load() {
        stateReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                JSObject state = new JSObject();
                state.put("state", intent.getStringExtra("state"));
                state.put("sectionIndex", intent.getIntExtra("sectionIndex", 0));
                String sectionId = intent.getStringExtra("sectionId");
                if (sectionId != null) state.put("sectionId", sectionId);
                state.put("paragraphIndex", intent.getIntExtra("paragraphIndex", -1));
                String title = intent.getStringExtra("sectionTitle");
                String message = intent.getStringExtra("message");
                if (title != null) state.put("sectionTitle", title);
                if (message != null) state.put("message", message);
                notifyListeners("playbackState", state);
            }
        };
        IntentFilter filter = new IntentFilter(ManuscriptReaderService.ACTION_STATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(stateReceiver, filter);
        }
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        final TextToSpeech[] engine = new TextToSpeech[1];
        engine[0] = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                if (engine[0] != null) engine[0].shutdown();
                call.reject("Android no pudo iniciar el motor de voz.");
                return;
            }
            JSArray voices = new JSArray();
            Set<Voice> available = engine[0].getVoices();
            if (available != null) {
                for (Voice voice : available) {
                    Locale locale = voice.getLocale();
                    if (locale == null) continue;
                    JSObject item = new JSObject();
                    String id = voice.getName();
                    item.put("id", id);
                    item.put("name", id.replace('_', ' '));
                    item.put("language", locale.toLanguageTag());
                    item.put("requiresNetwork", voice.isNetworkConnectionRequired());
                    voices.put(item);
                }
            }
            if (engine[0] != null) engine[0].shutdown();
            JSObject result = new JSObject();
            result.put("voices", voices);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void requestNotificationsPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermissionCallback");
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        android.content.SharedPreferences preferences = getContext().getSharedPreferences("reader_state", Context.MODE_PRIVATE);
        String savedState = preferences.getString("state", "idle");
        if (!ManuscriptReaderService.isServiceRunning() &&
            ("playing".equals(savedState) || "paused".equals(savedState))) {
            preferences.edit().putString("state", "idle").putInt("sectionIndex", 0).putInt("paragraphIndex", -1)
                .remove("sectionId").remove("sectionTitle").remove("message").apply();
            ReaderQueueFile.delete(getContext());
            savedState = "idle";
        }
        JSObject result = new JSObject();
        result.put("state", savedState);
        result.put("sectionIndex", preferences.getInt("sectionIndex", 0));
        String sectionId = preferences.getString("sectionId", null);
        if (sectionId != null) result.put("sectionId", sectionId);
        result.put("paragraphIndex", preferences.getInt("paragraphIndex", -1));
        String title = preferences.getString("sectionTitle", null);
        String message = preferences.getString("message", null);
        if (title != null) result.put("sectionTitle", title);
        if (message != null) result.put("message", message);
        call.resolve(result);
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String bookTitle = call.getString("bookTitle", "Manuscrito");
        JSArray sections = call.getArray("sections");
        if (sections == null || sections.length() == 0) {
            call.reject("No hay texto para leer.");
            return;
        }
        try {
            JSONObject queue = new JSONObject();
            queue.put("bookTitle", bookTitle);
            queue.put("rate", Math.max(0.65, Math.min(1.7, call.getDouble("rate", 1.0))));
            queue.put("voiceId", call.getString("voiceId", ""));
            queue.put("sections", new JSONArray(sections.toString()));
            byte[] bytes = queue.toString().getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_QUEUE_BYTES) {
                call.reject("El manuscrito es demasiado grande para cargarlo en la lectura móvil.");
                return;
            }
            try (FileOutputStream output = new FileOutputStream(ReaderQueueFile.get(getContext()))) {
                output.write(bytes);
            }
            Intent intent = new Intent(getContext(), ManuscriptReaderService.class);
            intent.setAction(ManuscriptReaderService.ACTION_PLAY);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo preparar la lectura del manuscrito.", error);
        }
    }

    @PluginMethod public void pause(PluginCall call) { send(ManuscriptReaderService.ACTION_PAUSE, call); }
    @PluginMethod public void resume(PluginCall call) { send(ManuscriptReaderService.ACTION_RESUME, call); }
    @PluginMethod public void stop(PluginCall call) { send(ManuscriptReaderService.ACTION_STOP, call); }

    @PluginMethod
    public void setRate(PluginCall call) {
        Intent intent = new Intent(getContext(), ManuscriptReaderService.class);
        intent.setAction(ManuscriptReaderService.ACTION_RATE);
        intent.putExtra("rate", (float) Math.max(0.65, Math.min(1.7, call.getDouble("rate", 1.0))));
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void setVoice(PluginCall call) {
        Intent intent = new Intent(getContext(), ManuscriptReaderService.class);
        intent.setAction(ManuscriptReaderService.ACTION_VOICE);
        intent.putExtra("voiceId", call.getString("voiceId", ""));
        getContext().startService(intent);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (stateReceiver != null) {
            try { getContext().unregisterReceiver(stateReceiver); } catch (IllegalArgumentException ignored) { }
            stateReceiver = null;
        }
        super.handleOnDestroy();
    }

    private void send(String action, PluginCall call) {
        Intent intent = new Intent(getContext(), ManuscriptReaderService.class);
        intent.setAction(action);
        getContext().startService(intent);
        call.resolve();
    }
}
