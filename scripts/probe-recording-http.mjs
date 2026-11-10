import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../packages/replay/mcp.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {ReplayMCP,structuredResult}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const observations=[];
const transport=async(url,options={})=>{const start=Date.now();let request;try{request=JSON.parse(options.body||'{}')}catch{};try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});observations.push({method:request?.method,tool:request?.params?.name,recordingId:request?.params?.arguments?.recordingId,status:response.status,type:response.headers.get('content-type'),headersMs:Date.now()-start});return response;}catch(e){observations.push({method:request?.method,tool:request?.params?.name,recordingId:request?.params?.arguments?.recordingId,error:e.message,headersMs:Date.now()-start});throw e;}};
const client=new ReplayMCP(undefined,transport);await client.init();
for(const [label,id] of [['Maya control','482cf508-c9d8-4e83-88ad-bd413a2284db'],['Leo after viewer opened','689251f4-96a4-4ef4-9a61-5cf26d9b51a2']]){try{const result=structuredResult(await client.call('WarmRecording',{recordingId:id,waitSeconds:0,until:'scanned'}));observations.push({label,result});}catch(e){observations.push({label,error:e.message});}}
console.log(JSON.stringify(observations,null,2));await writeFile(new URL('../.outputs/probe-http-details.json',import.meta.url),JSON.stringify(observations,null,2));await client.close();
