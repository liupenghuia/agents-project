# Web 管理审核平台

这是一个无构建依赖的静态审核端，使用 `docs/openapi.yaml` 中的管理员认证和身份审核接口。

## 本地运行

先启动后端，再在项目根目录运行：

```bash
python3 -m http.server 4173 --directory frontend/web
```

打开 <http://localhost:4173>。默认 API 地址为 `http://localhost:3000`，也可以在浏览器控制台启动前设置 `window.REVIEW_API_BASE_URL`，或修改 `app.js` 顶部配置。

管理员 token 只保存在当前页面内存中，不写入 localStorage、URL 或日志。
