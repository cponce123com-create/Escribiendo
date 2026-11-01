package com.editorialnoparatodos.escribiendo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeManuscriptReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
