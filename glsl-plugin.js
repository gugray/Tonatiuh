import * as fs from "fs";
import * as path from "path";

const reInclude1 = /#include +\"([^\"]+)\"/dgis;
const reInclude2 = /#include +'([^']+)'/dgis;

function resolve(fn, resolvedFiles) {

  if (resolvedFiles.includes(fn))
    return "";
  resolvedFiles.push(fn);

  const dir = path.dirname(fn);
  // let cont = await fs.promises.readFile(fn, "utf8");
  let cont = fs.readFileSync(fn, "utf8");
  while (true) {
    let m = reInclude1.exec(cont);
    if (!m) m = reInclude2.exec(cont);
    if (!m) break;
    let includeName = cont.substring(m.indices[1][0], m.indices[1][1]);
    includeName = path.join(dir, includeName);
    const includeCont = resolve(includeName, resolvedFiles);
    cont = cont.substring(0, m.indices[0][0]) + includeCont + cont.substring(m.indices[0][1]);
  }
  return cont;
}

export default function glsl(options = {}) {
  return {
    name: 'glsl-plugin',
    setup(build) {
      build.onResolve({ filter: /\.glsl$/ }, args => ({
        path: path.isAbsolute(args.path) ? args.path : path.join(args.resolveDir, args.path),
        namespace: 'glsl-plugin',
      }));

      build.onLoad({ filter: /.*/, namespace: 'glsl-plugin' }, args => {
        const files = [];
        const cont = resolve(args.path, files);
        return {
          contents: cont,
          loader: 'text',
          watchFiles: files,
        };
      });

    }
  };
}

