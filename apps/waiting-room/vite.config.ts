import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { patientOriginForClient,phoneBoundary, phoneTls } from './environment.ts';
export default defineConfig(({mode})=>{
  const tls=mode==='phone'?phoneTls(process.env,fileURLToPath(new URL('.',import.meta.url))):null;
  return {
    define:{'import.meta.env.VITE_PATIENT_ORIGIN':JSON.stringify(patientOriginForClient(process.env))},
    plugins:tls?[phoneBoundary(tls.origin)]:[],
    server:{host:tls?'0.0.0.0':'127.0.0.1',port:tls?.port??5173,strictPort:true,allowedHosts:tls?[tls.host]:['localhost'],...(tls?{https:tls.https,hmr:false as const}:{}),proxy:{'/api/wr':{target:'http://127.0.0.1:8787',changeOrigin:false}},fs:{deny:['.env','.env.*','**/.local/**','**/.git/**']}},
    build:{emptyOutDir:false},
    preview:{host:'127.0.0.1',port:4173,strictPort:true},
  };
});
