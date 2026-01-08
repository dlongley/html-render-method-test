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
    // do we need any feedback from the iframe? perhaps when the template
    // is ready:
    channel.port1.onmessage = event => {
      const {jsonrpc, method, params} = event.data;
      if(!(jsonrpc === '2.0' &&
        typeof method === 'string' &&
        Array.isArray(params))) {
        throw new Error('Unknown message format.');
      }
      if(method === 'renderMethodReady') {
        renderMethodReady?.();
        return;
      }
      throw new Error(`Unknown RPC method "${method}".`);
    };

    // message name "start" TBD; send `port2` to iframe for comms
    iframe.contentWindow.postMessage('start', '*', [channel.port2]);

    // tell the iframe to render the template
    channel.port1.postMessage({
      // message format TBD
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method: 'render',
      // 'template' is fully resolved
      params: [{credential, template}]
    });
  };

  // start up the iframe
  iframe.srcdoc = SRCDOC;
  return {iframe};
}

const SRCDOC = `
<html>
  <head>
    <meta http-equiv="content-security-policy" content="connect-src 'none'">
    <script>
// bootstrap renderer
window.addEventListener('message', event => {
  const {data: message, ports} = event;
  const port = ports?.[0];
  if(!(message === 'start' && port)) {
    // ignore unknown message
    return;
  };

  // we might want to attach a function to the window for the
  // template to call when it's "ready" that will send a message to
  // the parent so the parent can decide to show the iframe or not
  if(!window.renderMethodReady) {
    window.renderMethodReady = function() {
      port.postMessage({
        jsonrpc: '2.0',
        // use a different method name for the other end?
        method: 'renderMethodReady',
        params: []
      });
    };
  }

  // start message queue for channel port
  port.start();
  // handle messages from parent
  port.onmessage = event => {
    const {jsonrpc, method, params} = event.data;
    if(!(jsonrpc === '2.0' &&
      typeof method === 'string' &&
      Array.isArray(params))) {
      throw new Error('Unknown message format.');
    }
    const [options] = params;
    if(method === 'render') {
      render(options);
      return;
    }
    throw new Error(\`Unknown RPC method "\${method}".\`);
  };
});

function render({credential, template} = {}) {
  if(!(credential && typeof credential === 'object')) {
    throw new TypeError('"credential" must be an object.');
  }
  if(!(template && typeof template === 'string')) {
    throw new TypeError('"template" must be a string.');
  }
  console.log('injecting');

  // inject credential into HTML as a script tag
  const script = document.createElement('script');
  // FIXME: use "name" or "id"?
  script.setAttribute('name', 'credential');
  script.type = 'application/ld+json';
  script.innerHTML = JSON.stringify(credential, null, 2);
  document.head.appendChild(script);
  // set template as the new HTML body using "createContextualFragment" to
  // ensure any scripts execute; a script in the template must call
  // window.renderMethodReady() to indicate the rendering is ready
  document.body.append(
    document.createRange().createContextualFragment(template));
}
    </script>
  </head>

  <body>
  </body>
</html>
`;
