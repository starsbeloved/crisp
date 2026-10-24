# Local P1-A1 preview

From the workspace root:

```sh
npm run wr:dev
```

Open <http://127.0.0.1:5173/station>. Backend: <http://127.0.0.1:8787/api/wr/health>. Both bind loopback; no LAN or phone HTTPS setup is supplied. Ports are strict; stop another process yourself if a conflict occurs. Ctrl-C stops both app-owned development processes.

Select a named fixture. All data and the video slot are explicitly synthetic. The display-vocabulary gallery is a separate example, including its always-labeled synthetic temperature; it is not the selected patient's reading. Check local service performs a real same-origin health request; Start local station explicitly initializes an HttpOnly SameSite session. This is a foundation session shell, not station ownership or a completed patient flow.

Click Acknowledge or activate Mark checked by keyboard: the recorder should increment once and display `request_014`. These are synthetic callback probes and do not change or save a patient request. Patient/request selection changes preview selection only. Audio controls are callbacks only; no provider or speaker starts.

`/phone` and `/questionnaire` are reserved skeleton pages. They collect nothing and request no camera access. Check in / Demo setup are labeled skeletons. The preview never starts sensors or uses live values.

Validation from workspace root:

```sh
npm run wr:test
npm run wr:typecheck
npm run wr:build
```

HTTP tests require permission to bind loopback sockets in restricted environments. Historical root `npm test` remains separate and fails loading the missing ECHO `server/src/http.ts`; preserve that baseline.

See [foundation checkpoint](foundation-checkpoint.md) for the frozen interface/files and limitations. The selected LOCAL presentation package is `../.local/handoffs/lovable/P1-A1-v2/`; its README and LOVABLE-PROMPT.md describe manual handoff. Nothing has been uploaded or connected to a third-party project.
