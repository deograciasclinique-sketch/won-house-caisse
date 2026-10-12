import * as esbuild from "esbuild";
import { copyFileSync } from "node:fs";

// Application du gestionnaire (APK Android)
await esbuild.build({
  entryPoints: ["src/shim.js"], bundle: true, format: "iife", minify: true,
  target: ["chrome70"], outfile: "www/shim.js", loader: { ".json": "json" }, legalComments: "none",
});
console.log("www/shim.js prêt");

// Page client (menu + commande), publiée sur GitHub Pages
await esbuild.build({
  entryPoints: ["src/client.js"], bundle: true, format: "iife", minify: true,
  target: ["chrome70", "safari13"], outfile: "client/client.js", legalComments: "none",
});
copyFileSync("www/config.js", "client/config.js");
console.log("client/ prêt");
