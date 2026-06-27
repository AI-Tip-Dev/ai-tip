# 多语言 (i18n) 方案

> 状态：已实施  
> 日期：2026-06-25  

---

## 1. 选型

**自定义轻量 composable** — 零依赖，完全 TypeScript 类型安全。

理由：
- 项目 ~170 条 UI 字符串，不需要重型框架
- 符合项目架构原则 "Simplicity First"
- 未来可平滑迁移到 vue-i18n

---

## 2. 架构

```
src/shared/locales/          ← main + renderer 共享
├── types.ts                 ← LocaleMessages 接口（所有翻译 key 的单一源）
├── en.ts                    ← 英文
└── zh-CN.ts                 ← 简体中文

src/renderer/src/composables/
├── useI18n.ts               ← const { t } = useI18n()
└── useLanguageSettings.ts   ← 语言偏好 + 切换时 IPC 同步主进程菜单
```

**三进程覆盖**：

| 进程 | 方案 |
|------|------|
| Renderer（Vue） | `useI18n()` composable，`t('key')` 获取翻译 |
| Main（菜单） | import locale 文件，Renderer 切换时 IPC 通知重建菜单 |
| Preload | 暴露 `setLocale()` 桥接 Renderer → Main |

---

## 3. 使用方式

```vue
<h3>{{ t('fields.title') }}</h3>
<input :placeholder="t('nav.placeholder')" />
<span>{{ t('bot.fill', { '{}': name }) }}</span>
```

- 语言切换即时生效（Vue 响应式），无需刷新
- Key 拼错 → 编译报错
- 主进程菜单自动同步