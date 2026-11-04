'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { FaArrowDown, FaArrowUp, FaGripVertical, FaPen, FaRegTrashAlt } from 'react-icons/fa';
import type { ContentRecord } from '../../lib/cms/model';

type Props = {
  records: ContentRecord[];
  disabled: boolean;
  onEdit: (record: ContentRecord) => void;
  onDelete: (record: ContentRecord) => void;
  onReorder: (ids: string[]) => Promise<void>;
  onDraggingChange: (active: boolean) => void;
};
type Drag = { id: string; pointerId: number; x: number; y: number; moved: boolean; startX: number; startY: number; order: ContentRecord[] };

function move(entries: ContentRecord[], from: number, to: number) {
  const next = [...entries];
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}

export default function OrderedEntryList({ records, disabled, onEdit, onDelete, onReorder, onDraggingChange }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<ContentRecord[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const entries = preview ?? records;

  function cancel() {
    drag.current = null; setPreview(null); setDragId(null); onDraggingChange(false);
    setAnnouncement('Move cancelled. The order has not changed.');
  }
  function pointAt(x: number, y: number) {
    const active = drag.current;
    const item = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-order-id]');
    if (!active || !active.moved || !item || !list.current?.contains(item)) return;
    const from = active.order.findIndex(entry => entry.id === active.id);
    const to = active.order.findIndex(entry => entry.id === item.dataset.orderId);
    if (from !== to && to >= 0) {
      const bounds = item.getBoundingClientRect();
      const midpoint = bounds.top + bounds.height / 2;
      if ((from < to && y < midpoint) || (from > to && y > midpoint)) return;
      active.order = move(active.order, from, to);
      setPreview(active.order);
      setAnnouncement(`Moving to position ${to}. Release to save.`);
    }
  }
  useEffect(() => {
    if (!dragId) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        drag.current = null; setPreview(null); setDragId(null); onDraggingChange(false);
        setAnnouncement('Move cancelled. The order has not changed.');
      }
    };
    let frame = 0;
    const scroll = () => {
      const active = drag.current;
      if (active?.moved) {
        const edge = Math.min(100, window.innerHeight / 5);
        const delta = active.y < edge ? -12 : active.y > window.innerHeight - edge ? 12 : 0;
        if (delta) { window.scrollBy(0, delta); pointAt(active.x, active.y); }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    window.addEventListener('keydown', escape);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', escape); };
  }, [dragId, onDraggingChange]);

  function start(event: PointerEvent<HTMLButtonElement>, record: ContentRecord) {
    if (disabled || drag.current || !event.isPrimary || event.button !== 0) return;
    list.current?.setPointerCapture(event.pointerId);
    drag.current = { id: record.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, order: records };
    setDragId(record.id); onDraggingChange(true);
    setAnnouncement(`Picked up ${record.title}. Drag to a new position, or press Escape to cancel.`);
  }
  function pointerMove(event: PointerEvent<HTMLUListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    active.moved ||= Math.hypot(active.x - active.startX, active.y - active.startY) > 6;
    if (active.moved) { event.preventDefault(); pointAt(active.x, active.y); }
  }
  async function finish(event: PointerEvent<HTMLUListElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null; setDragId(null); onDraggingChange(false);
    if (active.moved && active.order.some((entry, i) => entry.id !== records[i].id)) {
      try { await onReorder(active.order.map(entry => entry.id)); }
      finally { setPreview(null); }
    } else setPreview(null);
  }
  async function step(index: number, offset: number) {
    if (disabled || drag.current || index + offset < 0 || index + offset >= records.length) return;
    const next = move(records, index, index + offset);
    setPreview(next);
    try { await onReorder(next.map(entry => entry.id)); }
    finally {
      setPreview(null);
      requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`[data-order-id="${records[index].id}"] .admin-drag-handle`)?.focus({ preventScroll: true }));
    }
  }

  return <>
    <p id="entry-order-help" className="admin-help admin-order-help">Drag the grip to reorder. On a keyboard, focus the grip and use ↑ / ↓, or use the move buttons. Changes save automatically.</p>
    <p className="sr-only" role="status">{announcement}</p>
    <ul ref={list} aria-label="Ordered entries" aria-busy={disabled} onPointerMove={pointerMove} onPointerUp={event => { void finish(event); }} onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}>
      {entries.map((record, index) => <li key={record.id} data-order-id={record.id} className={dragId === record.id ? 'admin-entry-dragging' : ''}>
        <div className="admin-entry-order-row">
          <span className="admin-help">{record.published ? 'Published' : 'Draft'} · Order {preview ? index : record.position}</span>
          <div className="admin-order-controls">
            <button type="button" className="admin-order-button" aria-label={`Move ${record.title} up`} disabled={disabled || !!dragId || index === 0} onClick={() => { void step(index, -1); }}><FaArrowUp aria-hidden="true" /></button>
            <button type="button" className="admin-order-button" aria-label={`Move ${record.title} down`} disabled={disabled || !!dragId || index === entries.length - 1} onClick={() => { void step(index, 1); }}><FaArrowDown aria-hidden="true" /></button>
            <button type="button" className="admin-order-button admin-drag-handle" aria-label={`Reorder ${record.title}`} aria-describedby="entry-order-help" disabled={disabled} onPointerDown={event => start(event, record)} onKeyDown={event => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void step(index, event.key === 'ArrowUp' ? -1 : 1); }
            }}><FaGripVertical aria-hidden="true" /></button>
          </div>
        </div>
        <h3>{record.title}</h3>
        <div className="admin-toolbar">
          <button type="button" className="admin-entry-action" aria-label={`Edit ${record.title}`} disabled={disabled || !!dragId} onClick={() => onEdit(record)}><FaPen aria-hidden="true" />Edit</button>
          <button type="button" className="admin-entry-action admin-entry-action-delete" aria-label={`Delete ${record.title}`} disabled={disabled || !!dragId} onClick={() => onDelete(record)}><FaRegTrashAlt aria-hidden="true" />Delete</button>
        </div>
      </li>)}
    </ul>
  </>;
}
