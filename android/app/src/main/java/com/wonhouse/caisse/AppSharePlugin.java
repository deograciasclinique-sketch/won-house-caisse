package com.wonhouse.caisse;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Partage de l'application WON HOUSE :
 *  - shareApk  : envoie le fichier d'installation (APK) de l'application elle-même (fonctionne hors ligne)
 *  - shareText : envoie un message (lien de téléchargement)
 *  - getVersion: version installée
 * Ouvre directement WhatsApp (ou WhatsApp Business) ; sinon, la liste des applications de partage.
 */
@CapacitorPlugin(name = "AppShare")
public class AppSharePlugin extends Plugin {

    @PluginMethod
    public void shareApk(PluginCall call) {
        try {
            Context ctx = getContext();
            File src = new File(ctx.getApplicationInfo().sourceDir);
            File dir = new File(ctx.getCacheDir(), "partage");
            if (!dir.exists()) dir.mkdirs();
            File out = new File(dir, "WON-HOUSE-caisse.apk");
            copy(src, out);
            Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", out);

            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("application/vnd.android.package-archive");
            i.putExtra(Intent.EXTRA_STREAM, uri);
            String text = call.getString("text", "");
            if (text != null && !text.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, text);
            i.setClipData(ClipData.newRawUri("WON-HOUSE-caisse.apk", uri));
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            launch(i, call, "Envoyer l'application");
        } catch (Exception e) {
            call.reject("Impossible de préparer le fichier : " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        launch(i, call, "Envoyer le lien");
    }

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject r = new JSObject();
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", p.versionName);
            r.put("build", p.versionCode);
        } catch (Exception e) {
            r.put("version", "?");
        }
        call.resolve(r);
    }

    private void launch(Intent i, PluginCall call, String title) {
        boolean whatsapp = Boolean.TRUE.equals(call.getBoolean("whatsapp", true));
        if (whatsapp) {
            for (String pkg : new String[]{"com.whatsapp", "com.whatsapp.w4b"}) {
                try {
                    Intent w = new Intent(i);
                    w.setPackage(pkg);
                    getActivity().startActivity(w);
                    JSObject r = new JSObject();
                    r.put("app", pkg);
                    call.resolve(r);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // WhatsApp absent : on essaie le suivant
                }
            }
        }
        try {
            Intent chooser = Intent.createChooser(i, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            JSObject r = new JSObject();
            r.put("app", "chooser");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Aucune application pour partager : " + e.getMessage());
        }
    }

    private static void copy(File src, File dst) throws Exception {
        if (dst.exists() && dst.length() == src.length() && dst.lastModified() >= src.lastModified()) return;
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
    }
}
