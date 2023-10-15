import * as esbuild from "esbuild"
import * as fs from "fs";
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
  const entryPoints = ["index.html", "app.css", "app.js"];
  for (let i = 0; i < entryPoints.length; ++i)
    entryPoints[i] = basePath + entryPoints[i];
  if (fs.existsSync(basePath + "data")) entryPoints.push(basePath + "data/*");
  const plugins = [livereloadPlugin()];
  const context = await esbuild.context({
    external: ["three"],
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
  await context.serve({
    port: 8080,
    servedir: "public",
  });
}

void build();
