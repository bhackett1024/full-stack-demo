import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../packages/replay/mcp.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ReplayMCP,structuredResult}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const groups=JSON.parse(await readFile(new URL('../data/relay-chat-scenarios.json',import.meta.url),'utf8'));
const tasks=groups.flatMap(g=>[...g.browsers.map(([label,id])=>({scenario:g.name,label,id})),{scenario:g.name,label:'Backend',id:g.backendId}]);
const transport=(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(20000)});
const client=new ReplayMCP(undefined,transport);await client.init();const results=[];
async function worker(){while(tasks.length){const t=tasks.shift(),start=Date.now();try{const r=structuredResult(await client.call('WarmRecording',{recordingId:t.id,waitSeconds:0}));results.push({...t,ms:Date.now()-start,result:r});console.log(JSON.stringify({...t,ms:Date.now()-start,state:r.state,error:r.error,phase:r.phase,previousRun:r.previousRun}));}catch(e){results.push({...t,ms:Date.now()-start,error:e.message});console.log(JSON.stringify({...t,ms:Date.now()-start,error:e.message}));}await writeFile(new URL('../.outputs/recording-probes.json',import.meta.url),JSON.stringify(results,null,2));}}
await Promise.all(Array.from({length:6},worker));await client.close();
