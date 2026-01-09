/*
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {selectJsonLd} from './select.js';

// `template` is fully resolved / dereferenced
export async function render({credential, renderProperty, template} = {}) {
  // filter credential (selective disclosure)
  credential = selectJsonLd({
    document: credential,
    pointers: renderProperty ?? ['/']
  });

  // a promise that resolves when the rendering is ready (or rejects if it
  // fails); can be used to show the display or an error instead
  let resolveRender;
  let rejectRender;
  const readyPromise = new Promise((resolve, reject) => {
    resolveRender = resolve;
    rejectRender = reject;
  });

  // create iframe for sandboxed rendering
  const iframe = document.createElement('iframe');
  // permissions TBD
  iframe.sandbox = 'allow-scripts allow-modals';
  // block all network access in browsers that support `iframe.csp`; other
  // browsers will use the meta tag in the iframe HTML which does not appear
  // to be changeable by JavaScript once set (prevents change of the policy
  // by a template even if `iframe.csp` does not work)
  iframe.setAttribute('csp', `default-src 'none' data: 'unsafe-inline'`);
  iframe.onload = () => {
    // create a MessageChannel; transfer one port to the iframe
    const channel = new MessageChannel();
    // start message queue so messages won't be lost while iframe loads
    channel.port1.start();
    // handle `ready` message
    channel.port1.onmessage = function ready(event) {
      if(event.data === 'ready') {
        resolveRender();
      } else {
        rejectRender(new Error(event.data?.error?.message));
      }
      channel.port1.onmessage = undefined;
    };
    // send "start" message; send `port2` to iframe for return communication
    iframe.contentWindow.postMessage('start', '*', [channel.port2]);
  };

  // start up the iframe
  iframe.srcdoc =
    `<html>
      <head>
        <meta
          http-equiv="content-security-policy"
          content="default-src 'none' data: 'unsafe-inline'">
        <script
          name="credential"
          type="application/vc">${JSON.stringify(credential, null, 2)}</script>
        <script>
          // add promise that will resolve to the communication port from
          // the parent window
          const portPromise = new Promise(resolve => {
            window.addEventListener('message', function start(event) {
              if(event.data === 'start' && event.ports?.[0]) {
                window.removeEventListener('message', start);
                resolve(event.ports[0]);
              }
            });
          });

          // attach a function to the window for the template to call when
          // it's "ready" (or that an error occurred) that will send a message
          // to the parent so the parent can decide whether to show the iframe
          window.renderMethodReady = function(err) {
            portPromise.then(port => port.postMessage(
              !err ? 'ready' : {error: {message: err.message}}));
          };
        </script>
      </head>

      <body>
        ${template}
      </body>
    </html>`;

  return {iframe, ready: readyPromise};
}
