# WeChat Mini Program

Open this directory in WeChat DevTools. The Mini Program uses `http://localhost:3000` by default during local simulator development.

For projects managed by a WeChat third-party platform, `config.js` reads an external configuration value named `apiBaseUrl` through `wx.getExtConfigSync()`. For a standalone Mini Program, set `LOCAL_API_BASE_URL` through the release packaging/configuration step before previewing on a device. The URL must be reachable from the device; `localhost` points to the phone itself and will not reach a computer. Trial and release environments must use an approved HTTPS request domain.

Location use is declared in `app.json`. WeChat account privacy settings and the privacy policy still need to be configured in the Mini Program console before release.
