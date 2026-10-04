import fs from 'node:fs/promises';import{build}from'esbuild';
const result=await build({entryPoints:['web/app.js'],bundle:true,write:false,format:'iife',platform:'browser',target:['chrome120','safari17','firefox121'],legalComments:'inline',minify:false});
const css=await fs.readFile('web/styles.css','utf8');let html=await fs.readFile('web/index.html','utf8');
const runtimeLicense=await fs.readFile('docs/licenses/sax-LICENSE.md','utf8');
html=html.replace('<head>',()=>'<head>\n<!-- Runtime dependency sax 1.6.1 license:\n'+runtimeLicense.replace(/--/g,'—')+'\n-->');
html=html.replace(/<link[^>]+href="\.\/styles\.css"[^>]*>/,()=>'<style>'+css+'</style>').replace(/<script[^>]+src="\.\/app\.js"[^>]*><\/script>/,()=>'<script>'+result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script>');
if(/src="\.\/app\.js"|href="\.\/styles\.css"/.test(html))throw new Error('Build markers not replaced');await fs.mkdir('dist',{recursive:true});await fs.writeFile('dist/index.html',html);console.log(`Built standalone app: ${Buffer.byteLength(html)} bytes`);
