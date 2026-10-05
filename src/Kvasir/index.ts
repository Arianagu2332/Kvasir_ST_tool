import { createApp } from 'vue';
import { createScriptIdIframe } from '@util/script';
import App from './App.vue';
import { clearKvasirInjections } from './injection';

let iframe: JQuery<HTMLIFrameElement> | undefined;
let app: ReturnType<typeof createApp> | undefined;

function mount() {
  iframe = createScriptIdIframe().css({
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    border: '0',
    zIndex: '2147483646',
    display: 'none',
    pointerEvents: 'none',
  }).appendTo('body');

  iframe.on('load', () => {
    if (!iframe?.[0].contentDocument) return;
    app = createApp(App, {
      onClose: () => {
        if (iframe) iframe.css({ display: 'none', pointerEvents: 'none' });
      },
    });
    app.mount(iframe[0].contentDocument.body);
  });

  appendInexistentScriptButtons([{ name: 'Kvasir', visible: true }]);
  eventOn(getButtonEvent('Kvasir'), () => {
    iframe?.css({ display: 'block', pointerEvents: 'auto' });
  });
}

$(() => mount());

$(window).on('pagehide', () => {
  app?.unmount();
  iframe?.remove();
  clearKvasirInjections();
});
