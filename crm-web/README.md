# crm-web

The CRM product's web app: React + Vite + Tailwind, CRM screens only. One build serves every installation
(the Mediqzy CRM and dedicated hospitals such as Medstar).

- **Branding is runtime.** `src/config/brand.ts` loads `GET /api/branding` before the first render: name,
  logo, favicon, support email and WhatsApp template prefix. Nothing hospital-specific is compiled in.
- **Menu** = `sidebarNav` in `src/pages/crm/CRMModulePages.tsx`, filtered by the user's permissions and by
  `GET /api/crm/ui-config` (`disabledPaths`: modules switched off on this installation).
- **Tool pages** (`tools/`: Home, Inbox, Engage, Calls, WhatsApp templates) are plain HTML served at
  `/crm-tools/`. The app shows them inside its menu through `src/pages/crm/shared/ToolFrame.tsx`; each loads
  `tools/embed.js` first.
- **Shared schemas** come from `../shared` (`@shared/...`), the same files the API uses.

```
npm ci
npm run build            # dist/
CRM_API=https://<installation> npm run dev   # local preview against a running installation
```

Origin: moved from `MySmartHealth/medstar-crm` (client/ and crm-tools/) in Phase 1 of the
"One Product, Many Deployments" plan. See docs/architecture/CRM_MEDSTAR_DIVERGENCE.md.
