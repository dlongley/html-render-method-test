/*
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {selectJsonLd} from './select.js';

// `template` is fully resolved / dereferenced
// `renderMethodReady` is a listener that will be called when template is ready
export async function render({
  credential, renderProperty, template, renderMethodReady
} = {}) {
  // filter credential (selective disclosure)
  credential = selectJsonLd({
    document: credential,
    pointers: renderProperty ?? ['/']
  });

  // create iframe for sandboxed rendering
  const iframe = document.createElement('iframe');
  // permissions TBD
  iframe.sandbox = 'allow-scripts allow-modals';
  // block all network access in browsers that support `iframe.csp`; other
  // browsers will use the meta tag in the iframe HTML which does not appear
  // to be changeable by JavaScript once set (prevents change of the policy
  // by a template even if `iframe.csp` does not work)
  iframe.setAttribute('csp', `connect-src 'none'`);
  iframe.onload = () => {
    // create a MessageChannel; transfer one port to the iframe
    const channel = new MessageChannel();
    // start message queue so messages won't be lost while iframe loads
    channel.port1.start();
    // handle `ready` message
    channel.port1.onmessage = function ready(event) {
      if(event.data !== 'ready') {
        return;
      }
      channel.port1.onmessage = undefined;
      renderMethodReady?.();
    };
    // send "start" message; send `port2` to iframe for return communication
    iframe.contentWindow.postMessage('start', '*', [channel.port2]);
  };

  // start up the iframe
  iframe.srcdoc =
    `<html>
      <head>
        <meta http-equiv="content-security-policy" content="connect-src 'none'">
        <script
          name="credential"
          type="application/vc">${JSON.stringify(credential, null, 2)}</script>
        <script>
          // add promise that will resolve to the communication port from
          // the parent window
          const portPromise = new Promise(resolve => {
            window.addEventListener('message', function start(event) {
              const {data: message, ports} = event;
              const port = ports?.[0];
              if(!(message === 'start' && port)) {
                // ignore unknown message
                return;
              };
              window.removeEventListener('message', start);
              resolve(port);
            });
          });

          // attach a function to the window for the template to call when
          // it's "ready" that will send a message to the parent so the
          // parent can decide when to show the iframe
          window.renderMethodReady = function() {
            portPromise.then(port => port.postMessage('ready'));
          };
        </script>
      </head>

      <body>
        ${template}
      </body>
    </html>`;
  return {iframe};
}
