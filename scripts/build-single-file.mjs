import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
let html=await fs.readFile(path.join(root,'dist/index.html'),'utf8');
for(const [,file] of [...html.matchAll(/<link rel="stylesheet" href="([\w-]+\.css)">/g)]){
  const css=await fs.readFile(path.join(root,'dist',file),'utf8');
  html=html.replace('<link rel="stylesheet" href="'+file+'">',()=>'<style>\n'+css+'\n</style>');
}
for(const [,file] of [...html.matchAll(/<script src="([\w-]+\.js)"><\/script>/g)]){
  const code=await fs.readFile(path.join(root,'dist',file),'utf8');
  html=html.replace('<script src="'+file+'"></script>',()=>'<script>\n'+code.replace(/<\/script/gi,'<\\/script')+'\n</script>');
}
const out=path.join(root,'와일즈-장비시뮬레이터.html');
await fs.writeFile(out,html);
console.log('Single-file HTML: '+out+' ('+Buffer.byteLength(html).toLocaleString()+' bytes)');
