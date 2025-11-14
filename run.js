import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import http from "node:http";
import {livereloadPlugin} from "@jgoz/esbuild-plugin-livereload";
import {runRelay} from "./src/relay/server.js";

const buildServerPort = 8081;
const projectorPort = 8080;
const relayPort = 8090;

const reInclude1 = /#include +\"([^\"]+)\"/dgis;
const reInclude2 = /#include +'([^']+)'/dgis;

function resolveIncludes(fn, resolvedFiles) {
  if (resolvedFiles.includes(fn)) return "";
  resolvedFiles.push(fn);

  const dir = path.dirname(fn);
  let cont = fs.readFileSync(fn, "utf8");
  while (true) {
    let m = reInclude1.exec(cont);
    if (!m) m = reInclude2.exec(cont);
    if (!m) break;
    let includeName = cont.substring(m.indices[1][0], m.indices[1][1]);
    includeName = path.join(dir, includeName);
    const includeCont = resolveIncludes(includeName, resolvedFiles);
    cont = cont.substring(0, m.indices[0][0]) + includeCont + cont.substring(m.indices[0][1]);
  }
  return cont;
}

export default function glsl(options = {}) {
  return {
    name: "glsl-plugin",
    setup(build) {
      build.onResolve({filter: /\.glsl$/}, (args) => ({
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: "glsl-plugin",
      }));

      build.onLoad({filter: /.*/, namespace: "glsl-plugin"}, (args) => {
        const files = [];
        const cont = resolveIncludes(args.path, files);
        return {
          contents: cont,
          loader: "text",
          watchFiles: files,
        };
      });
    },
  };
}

async function runProjector() {
  fs.copyFileSync("src/live/live.js", "public/live.js");

  const basePath = "src/projector";
  const dataPath = path.join(basePath, "data");

  // Cotext for main app
  const entryPoints = ["index.html", "prism.css", "app.css", "app.js", "updateWorker.js"];
  for (let i = 0; i < entryPoints.length; ++i) entryPoints[i] = path.join(basePath, entryPoints[i]);

  if (fs.existsSync(dataPath)) entryPoints.push(dataPath + "/*");

  const context = await esbuild.context({
    entryPoints: entryPoints,
    outdir: "public",
    bundle: true,
    format: "esm",
    sourcemap: true,
    loader: {
      ".html": "copy",
      ".css": "copy",
      ".txt": "copy",
      ".ply": "copy",
      ".jpg": "copy",
      ".png": "copy",
    },
    write: true,
    metafile: true,
    plugins: [livereloadPlugin(), glsl()],
  });

  await context.watch();
  const {host, port} = await context.serve({
    port: buildServerPort,
    servedir: "public",
  });

  // Proxy esbuild's server so we can add custom headers
  // Those are needed so the document is in a secure context, where it can use SharedArrayBuffer
  http
    .createServer((req, res) => {
      const options = {
        hostname: host,
        port: port,
        path: req.url,
        method: req.method,
        headers: req.headers,
      };
      const proxyReq = http.request(options, (proxyRes) => {
        proxyRes.headers["Cross-Origin-Opener-Policy"] = "same-origin";
        proxyRes.headers["Cross-Origin-Embedder-Policy"] = "require-corp";
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, {end: true});
      });
      req.pipe(proxyReq, {end: true});
    })
    .listen(projectorPort);
  console.log(`Local server running at port ${projectorPort}`);
}

void runProjector();
void runRelay(relayPort);
