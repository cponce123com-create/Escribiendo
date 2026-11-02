package com.editorialnoparatodos.escribiendo;

import android.content.Context;
import java.io.File;

/** Keeps the temporary, plaintext speech queue out of Android Auto Backup. */
final class ReaderQueueFile {
    private static final String FILE_NAME = "reader_queue.json";
    private ReaderQueueFile() { }
    static File get(Context context) { return new File(context.getNoBackupFilesDir(), FILE_NAME); }
    static void delete(Context context) { get(context).delete(); }
}
