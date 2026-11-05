"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { FaDownload, FaFileAlt, FaTimes } from 'react-icons/fa';
import { documents } from '../data/documents';

const tabs = ['resume', 'cv'] as const;
type Tab = typeof tabs[number];

export default function DocumentViewer({ onNavigate }: { onNavigate: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState<Tab>('resume');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const document = documents[active];

  useEffect(() => {
    if (!open) return;
    const previous = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    return () => { window.document.body.style.overflow = previous; };
  }, [open]);

  function selectTab(tab: Tab) { if (tab !== active) { setActive(tab); setLoaded(false); } }
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = 1 - index;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    else return;
    event.preventDefault();
    selectTab(tabs[next]);
    tabButtons.current[next]?.focus();
  }

  return <>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-controls="document-viewer" className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm text-muted hover:text-accent dark:text-muted-dark dark:hover:text-gold" onClick={() => {
      setActive('resume'); setLoaded(false); dialog.current?.showModal(); setOpen(true);
    }}><FaFileAlt aria-hidden="true" /> CV</button>
    <dialog ref={dialog} id="document-viewer" className="document-dialog" aria-labelledby="document-viewer-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close();
    }}>
      <div className="document-shell">
        <h2 id="document-viewer-title" className="sr-only">Silas Osunba — Resume and Academic CV</h2>
        <div className="document-heading">
          <div role="tablist" aria-label="Choose a document" className="document-tabs">
            {tabs.map((tab, index) => <button key={tab} ref={element => { tabButtons.current[index] = element; }} type="button" role="tab" id={`document-tab-${tab}`} aria-controls={`document-panel-${tab}`} aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onClick={() => selectTab(tab)} onKeyDown={event => moveTab(event, index)}>{tab === 'resume' ? 'Resume' : 'Academic CV'}</button>)}
          </div>
          <button autoFocus type="button" className="document-close" aria-label="Close document viewer" onClick={() => dialog.current?.close()}><FaTimes aria-hidden="true" /></button>
        </div>
        {tabs.map(tab => <div key={tab} role="tabpanel" id={`document-panel-${tab}`} aria-labelledby={`document-tab-${tab}`} hidden={active !== tab} tabIndex={0} className="document-panel">
          {active === tab && (document ? <>
            <p className="document-description">{document.description}</p>
            <div className="document-preview">
              {open && !loaded && <p role="status" className="document-loading">Loading preview…</p>}
              {open && <iframe key={tab} src={document.previewUrl} title={`Silas Osunba — ${document.label}`} onLoad={() => setLoaded(true)} />}
            </div>
            <p className="document-help">Preview unavailable? <a href={document.openUrl} target="_blank" rel="noopener noreferrer">Open {document.label} in a new tab ↗</a></p>
          </> : <div className="document-empty"><FaFileAlt aria-hidden="true" /><h3 className="content-title">Academic CV coming soon</h3><p>My research, publications, and academic experience will be available here.</p></div>)}
        </div>)}
        <div className="document-actions">
          <a href="mailto:osunbasilas@gmail.com?subject=Hiring%20Opportunity" className="btn-secondary" onClick={() => { dialog.current?.close(); onNavigate(); }}>Hire me</a>
          {document && <a download href={document.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn-primary"><FaDownload aria-hidden="true" /> Download {document.label}</a>}
        </div>
      </div>
    </dialog>
  </>;
}
