import { useRef, useState } from 'react';
import { clamp } from '../engine/animation.ts';

export function TimelineResize() {
  const drag = useRef<{ top: number; height: number } | null>(null);
  const [height, setHeight] = useState<number>();
  function resize(element: HTMLElement, value: number) {
    const timeline = element.parentElement;
    const shell = timeline?.parentElement;
    if (!timeline || !shell) return;
    const mobile = matchMedia('(max-width: 790px)').matches;
    const min = mobile ? 180 : 170;
    const max = mobile ? Math.max(min, window.innerHeight * .8) : Math.max(min, shell.clientHeight - 235);
    const pixels = Math.round(clamp(value, min, max));
    shell.style.setProperty('--timeline-height', pixels + 'px');
    setHeight(pixels);
  }
  return <div className="timeline-resize" role="separator" tabIndex={0} aria-orientation="horizontal"
    aria-label="Resize timeline" aria-valuetext={height ? height + ' pixels' : 'Default height'}
    title="Drag up to expand the timeline. Double-click to reset."
    onPointerDown={event => {
      const panel = event.currentTarget.parentElement;
      if (!panel || event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { top: event.clientY, height: panel.getBoundingClientRect().height };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (drag.current) resize(event.currentTarget, drag.current.height + drag.current.top - event.clientY);
    }}
    onLostPointerCapture={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}
    onDoubleClick={event => {
      event.currentTarget.parentElement?.parentElement?.style.removeProperty('--timeline-height');
      setHeight(undefined);
    }}
    onKeyDown={event => {
      const delta = event.key === 'ArrowUp' ? 32 : event.key === 'ArrowDown' ? -32 : 0;
      if (!delta) return;
      event.preventDefault();
      event.stopPropagation();
      resize(event.currentTarget, (event.currentTarget.parentElement?.getBoundingClientRect().height ?? 250) + delta);
    }}><span aria-hidden="true"/></div>;
}
