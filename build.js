import * as esbuild from "esbuild"
import * as fs from "fs";
import http from 'node:http';
import { livereloadPlugin } from "@jgoz/esbuild-plugin-livereload";

const timestamp = (+new Date).toString(36);

const args = (argList => {
  let res = {};
  let opt, thisOpt, curOpt;
  for (let i = 0; i < argList.length; i++) {
    thisOpt = argList[i].trim();
    opt = thisOpt.replace(/^\-+/, "");
    if (opt === thisOpt) {
      // argument value
      if (curOpt) res[curOpt] = opt;
      curOpt = null;
    } else {
      // argument name
      curOpt = opt;
      res[curOpt] = true;
    }
  }
  //console.log(res);
  return res;
})(process.argv);

const sketch = args.sketch;

async function build() {
  const basePath = "src/" + sketch + "/";
  const entryPoints = ["index.html", "app.css", "app.js", "update_worker.js"];
  for (let i = 0; i < entryPoints.length; ++i)
    entryPoints[i] = basePath + entryPoints[i];
  if (fs.existsSync(basePath + "data")) entryPoints.push(basePath + "data/*");
  const plugins = [livereloadPlugin()];
  const context = await esbuild.context({
    //external: ["three"],
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
    },
    write: true,
    metafile: true,
    plugins: plugins,
  });

  await context.watch();
  const { host, port } = await context.serve({
    port: 8081,
    servedir: "public",
  });

  // Proxy esbuild's server so we can add custom headers
  // Those are needed so the document is in a secure context, where it can use SharedArrayBuffer
  http.createServer((req, res) => {
    const options = {
      hostname: host,
      port: port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    }
    const proxyReq = http.request(options, proxyRes => {
      proxyRes.headers["Cross-Origin-Opener-Policy"] = "same-origin";
      proxyRes.headers["Cross-Origin-Embedder-Policy"] = "require-corp";
      res.writeHead(proxyRes.statusCode, proxyRes.headers)
      proxyRes.pipe(res, { end: true })
    });
    req.pipe(proxyReq, { end: true })
  }).listen(8080)
}

void build();


