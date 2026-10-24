import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './patient.css';

export function PatientShell({children,step,onActivity}:{children:ReactNode;step?:string;onActivity?:()=>void}) {
  const [help,setHelp]=useState(false);
  return <div className="wr-patient" onPointerDownCapture={onActivity} onKeyDownCapture={onActivity}>
    <header className="wr-patient-header"><a href="/check-in" aria-label="Waiting Room check-in" className="wr-patient-brand">
      <svg viewBox="0 0 44 44" width="36" height="36" aria-hidden="true"><path d="M22 15C11 7 4 18 9 30c4 10 10 8 13 7 4 1 10 3 14-7 5-12-2-23-14-15Z" fill="currentColor"/><path d="M23 11c1-6 6-8 11-7-1 6-6 9-11 7Z" fill="currentColor"/><path d="M22 16c0-5-2-7-4-9" stroke="currentColor" strokeWidth="3" fill="none"/></svg>
      <span>Waiting Room<small>Patient check-in</small></span></a><button className="wr-patient-quiet" type="button" onClick={()=>setHelp(true)}>I need help</button></header>
    <main className="wr-patient-card">{step&&<p className="wr-patient-eyebrow">{step}</p>}{children}</main>
    <footer className="wr-patient-footer">A supervised prototype. This check-in is not medical triage.</footer>
    {help&&<HelpDialog onClose={()=>setHelp(false)}/>}
  </div>;
}
function HelpDialog({onClose}:{onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current,previous=document.activeElement as HTMLElement|null;
    if(el){if(typeof el.showModal==='function')el.showModal();else el.setAttribute('open','');el.querySelector('button')?.focus();}
    return()=>{if(el?.open){if(typeof el.close==='function')el.close();else el.removeAttribute('open');}previous?.focus();};
  },[]);
  return <dialog ref={dialog} className="wr-patient-help" aria-modal="true" onCancel={e=>{e.preventDefault();onClose();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){e.preventDefault();dialog.current?.querySelector('button')?.focus();}}} aria-labelledby="patient-help-title"><h2 id="patient-help-title">Ask the demo operator for help</h2><p>Please speak to the person at this station. No notification has been sent.</p><p>You can continue with assistance if you cannot use a phone or camera.</p><button type="button" onClick={onClose}>Return to check-in</button></dialog>;
}

export function ErrorNotice({message,children}:{message:string;children?:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ref.current?.focus();},[message]);
  return <div ref={ref} className="wr-patient-error" role="alert" tabIndex={-1}><h2>There is a problem</h2><p>{message}</p>{children}</div>;
}
