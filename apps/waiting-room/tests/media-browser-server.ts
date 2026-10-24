import { createServer as createVite } from 'vite';
import { createWaitingRoomServer } from '../server/http.ts';
import type { RequestListener } from 'node:http';

// Isolated ephemeral test server; never touches the application's persisted visits.
const app=createWaitingRoomServer({databasePath:':memory:'});
const handler=app.server.listeners('request')[0] as RequestListener;
app.server.removeListener('request',handler);
const vite=await createVite({configFile:false,root:process.cwd(),appType:'mpa',logLevel:'warn',server:{middlewareMode:true,hmr:false,fs:{deny:['.env','.env.*','**/.local/**','**/.git/**']}}});
app.server.on('request',(req,res)=>{if(req.url?.startsWith('/api/wr/'))void handler(req,res);else vite.middlewares(req,res,()=>{res.statusCode=404;res.end('Not found');});});
app.server.listen(0,'127.0.0.1',()=>{const address=app.server.address();if(address&&typeof address!=='string')console.log(`Synthetic media proof: http://127.0.0.1:${address.port}/tests/media-browser.html`);});
const close=()=>{void app.close().then(()=>vite.close()).then(()=>process.exit(0));};
process.once('SIGINT',close);process.once('SIGTERM',close);
