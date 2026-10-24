/** Configuration is explicit. Never turn a laptop's localhost URL into a phone QR. */
export function patientPhoneLink(origin:string|undefined,code:string):string|null {
  if(!origin||!/^\d{8}$/.test(code))return null;
  try {
    const url=new URL(origin);
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='0.0.0.0'||host.startsWith('127.'))return null;
    url.pathname='/patient';url.hash=`code=${code}`;return url.toString();
  }catch{return null;}
}
