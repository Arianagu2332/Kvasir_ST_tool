import { createApp } from 'vue';
import { teleportStyle } from '@util/script';
import App from './App.vue';
import { clearKvasirInjections } from './injection';

let iframe: JQuery<HTMLIFrameElement> | undefined;
let app: ReturnType<typeof createApp> | undefined;
let destroyTeleportedStyle: (() => void) | undefined;
let stopViewportSync: (() => void) | undefined;

function mount() {
  const overlay = $('<iframe>').attr({
    script_id: getScriptId(),
    title: 'Kvasir',
    srcdoc: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body></body></html>',
  }).css({
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: CSS.supports('height', '100dvh') ? '100dvh' : '100vh',
    border: '0',
    zIndex: '2147483646',
    display: 'none',
    pointerEvents: 'none',
  }) as JQuery<HTMLIFrameElement>;
  iframe = overlay;

  overlay.on('load', () => {
    const panelDocument = overlay[0].contentDocument;
    if (!panelDocument) return;
    app?.unmount();
    destroyTeleportedStyle?.();
    destroyTeleportedStyle = teleportStyle(panelDocument.head).destroy;
    app = createApp(App, {
      onClose: () => {
        overlay.css({ display: 'none', pointerEvents: 'none' });
      },
    });
    app.mount(panelDocument.body);
  });
  overlay.appendTo('body');

  const viewport = overlay[0].ownerDocument.defaultView?.visualViewport;
  const syncViewport = () => {
    if (!viewport?.width || !viewport.height || !overlay[0].isConnected) return;
    overlay.css({ top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height });
  };
  viewport?.addEventListener('resize', syncViewport);
  viewport?.addEventListener('scroll', syncViewport);
  stopViewportSync = () => {
    viewport?.removeEventListener('resize', syncViewport);
    viewport?.removeEventListener('scroll', syncViewport);
  };

  appendInexistentScriptButtons([{ name: 'Kvasir', visible: true }]);
  eventOn(getButtonEvent('Kvasir'), () => {
    overlay.css({ display: 'block', pointerEvents: 'auto' });
    syncViewport();
  });
}

$(() => mount());

$(window).on('pagehide', () => {
  stopViewportSync?.();
  app?.unmount();
  destroyTeleportedStyle?.();
  iframe?.remove();
  clearKvasirInjections();
});
