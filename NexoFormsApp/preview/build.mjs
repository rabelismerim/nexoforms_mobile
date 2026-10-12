import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(app, '..', '.verification', 'ui-preview');
fs.mkdirSync(out, {recursive: true});
await build({
  entryPoints: [path.join(app, 'preview/index.tsx')], bundle: true, outfile: path.join(out, 'app.js'), platform: 'browser', jsx: 'automatic',
  define: {__DEV__: 'true', 'process.env.NODE_ENV': '"development"', global: 'globalThis'},
  alias: {'react-native': path.join(app, 'preview/react-native.ts')},
  plugins: [{name: 'documentation-preview', setup(builder) {
    builder.onResolve({filter: /^\.\/service$/}, args => args.importer.endsWith('WorkspaceApp.tsx') ? {path: path.join(app, 'preview/demo-service.ts')} : undefined);
    builder.onResolve({filter: /^react-native-safe-area-context$/}, () => ({path: path.join(app, 'preview/native-shims.tsx')}));
    builder.onResolve({filter: /^react-native-image-crop-picker$/}, () => ({path: 'image-picker', namespace: 'preview'}));
    builder.onLoad({filter: /.*/, namespace: 'preview'}, () => ({contents: 'export default {openCamera: async () => {throw new Error("Câmera disponível no aplicativo Android.")}, openPicker: async () => {throw new Error("Galeria disponível no aplicativo Android.")}};', loader: 'js'}));
    builder.onLoad({filter: /\.svg$/}, args => ({contents: `import React from 'react'; export default function Logo(props) { return React.createElement('img',{src:${JSON.stringify('data:image/svg+xml;base64,' + fs.readFileSync(args.path).toString('base64'))},width:props.width,height:props.height,alt:'Logo Nexo Forms'}); }`, loader: 'js'}));
    builder.onLoad({filter: /\.jpg$/}, args => ({contents: `module.exports = {uri:${JSON.stringify('data:image/jpeg;base64,' + fs.readFileSync(args.path).toString('base64'))},width:1408,height:768};`, loader: 'js'}));
  }}],
});
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexo Forms — prévia da interface</title><style>html,body,#root{height:100%;margin:0;background:#080D16}*{box-sizing:border-box}body{overflow:hidden}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
console.log('Documentation preview built. Uses demonstration fixtures; not a native device test.');
