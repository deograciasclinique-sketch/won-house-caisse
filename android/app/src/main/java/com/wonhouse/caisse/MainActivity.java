package com.wonhouse.caisse;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSharePlugin.class); // partage de l'application par WhatsApp
        super.onCreate(savedInstanceState);
    }
}
