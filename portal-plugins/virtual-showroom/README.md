# OpenAN Portal 插件：虚拟展厅（Virtual Showroom）

卡片式 Demo 展厅插件。卡片完全由 **`cards.json` 配置驱动**：新增/修改卡片只需编辑
`cards.json` 并上传到 `/OpenA2A-T/openan-portal-frontend/plugins/virtual-showroom/cards.json`，
无需重新构建插件。

## 菜单与路由

| 菜单 | labelKey | order | 路由 |
|---|---|---|---|
| 虚拟展厅 / Demo Showcase | `virtual-showroom:nav.title` | 8 | `/showroom` |

## i18n

菜单与页内文案均跟随门户语言切换（zh/en），三层保障：

1. **manifest 契约**：`name: "Demo Showcase"` + `labelKey: "virtual-showroom:nav.title"`（含 `:`）。
   门户加载器会把含 `:` 的 labelKey 替换为插件 `name` 作为 i18n key；portal 内置翻译表
   本身就有 `"Demo Showcase" → 虚拟展厅`。
2. **插件自注册**（registry-center 同款惯例）：bundle 加载时向
   `window.__OPENAN_PORTAL_CONTEXT__.i18n` 注册 `addResourceBundle`——
   `translation` 命名空间下的 `Demo Showcase`、`virtual-showroom:*` 全套键，以及
   `virtual-showroom` 命名空间（`nav.title`），en/zh 双语。
3. **页内文案**：组件监听 `languageChanged` 事件，标题/副标题/按钮/状态文案全部走
   `t(key)` + 双语兜底。

## 卡片配置（cards.json）

字段沿用 openan.dev best-practices 卡片结构：封面图 + 类别 + 标题 + 描述 + 链接。

```jsonc
{
  "cards": [
    {
      "id": "observation-demo",
      "enabled": true,            // false 可隐藏
      "order": 1,                 // 排序，小在前
      "title": "…",  "titleEn": "…",             // 按语言二选一展示
      "category": "…", "categoryEn": "…",        // 按语言二选一展示
      "description": "…", "descriptionEn": "…",  // 按语言二选一展示
      "image": "images/observation-demo.svg",   // 相对本插件目录
      "url": "http://203.0.113.10:9010/observation-demo/",
      "openIn": "new-tab"          // new-tab | same-tab
    }
  ]
}
```

**卡片内容跟随门户语言切换**：`title/titleEn`、`description/descriptionEn`、
`category/categoryEn` 按当前语言（zh/en）二选一渲染，缺某语言字段时自动回退到另一语言，
互为兜底；语言切换即时生效（监听 `languageChanged`）。

封面图放在 `assets/images/`，构建时随插件一起发布到 `plugins/virtual-showroom/images/`。

## 构建

```bash
npm install
npm run build:plugin     # 产物 dist-plugin/（index.js + index.css + plugin.manifest.json + cards.json + images/）
```

## 部署（门户服务器 203.0.113.10）

1. 上传 `dist-plugin/` → `/OpenA2A-T/openan-portal-frontend/plugins/virtual-showroom/`
2. 门户主包 `assets/index-*.js` 的插件注册数组（`zu=[...]`）中已追加：
   `{id:`virtual-showroom`,mode:`bundle`,entry:`/plugins/virtual-showroom`,enabled:!0}`
3. 浏览器 Ctrl+F5 强刷后，左侧菜单出现「虚拟展厅」。

## ⚠️ 踩坑记录：UMD 插件里不要用 `import.meta.url`

Vite UMD lib 构建会把 `import.meta.url` 替换为
`"data:text/jsx;base64,<整个源文件的 base64>"` 字面量。插件运行时若以它为基址做
`new URL(ref, base)` / 字符串拼接，会得到非法 URL，`fetch`/图片全部
`net::ERR_INVALID_URL`（症状：插件能挂载但卡片加载失败，控制台出现巨型 data: URL 报错）。

**正确做法**（见 `src/index.jsx` 的 `resolvePluginBase()`）：

1. `window.__OPENAN_SHOWROOM_BASE__` 全局覆盖（可选）；
2. 模块顶层求值时读 `document.currentScript.src`（loader 以普通 `<script>` 注入时成立）；
3. 兜底硬编码部署路径 `/plugins/virtual-showroom/`。

## 调试

- 卡片不出现：Ctrl+F5 强刷（门户主包文件名不变，浏览器可能缓存旧 bundle）；
- 卡片区显示加载失败：直接访问 `/plugins/virtual-showroom/cards.json` 确认可达与 JSON 合法；
- 更换基址：门户页面注入 `window.__OPENAN_SHOWROOM_BASE__ = '/plugins/virtual-showroom/'`。
