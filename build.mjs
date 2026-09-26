import * as esbuild from "esbuild";
await esbuild.build({
  entryPoints: ["src/shim.js"], bundle: true, format: "iife", minify: true,
  target: ["chrome70"], outfile: "www/shim.js", loader: { ".json": "json" }, legalComments: "none",
});
console.log("www/shim.js prêt");
