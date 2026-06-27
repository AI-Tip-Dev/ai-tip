# ADR-002: 使用 CDP Accessibility API 进行字段检测

**状态**: ✅ 已采纳
**日期**: 2026-06
**决策者**: 项目组
**关联**: [05 表单检测设计](../05-form-detection-design.md)

---

## 背景

需要在 WebView 中检测网页表单字段。早期设计采用 DOM 注入方案（在 `webview-preload.ts` 中 `querySelectorAll`）。

## 方案对比

| 维度 | CDP Accessibility API | DOM 注入 (preload) |
|------|:---:|:---:|
| Shadow DOM 穿透 | ✅ 自动 | ⚠️ 需递归穿透 |
| 对页面影响 | ✅ 零注入 | ⚠️ 注入脚本 |
| 检测准确性 | ✅ ARIA 角色映射 | ⚠️ 依赖 DOM 结构 |
| 实现复杂度 | 中（需 CDP debugger attach） | 低 |
| 类型覆盖 | 12 种 ARIA 角色 | 4 种 HTML 标签 |

## 决策

选择 **CDP Accessibility API**（`Accessibility.getFullAXTree`）。

## 后果

- ✅ 零 JS 注入，对被检测页面完全无感
- ✅ Shadow DOM 自动穿透，无需递归处理
- ✅ 通过 12 个 `FORM_AX_ROLES` 映射覆盖更多控件类型（combobox、spinbutton、slider 等）
- ✅ 同时返回 `RawAXNode[]` 支持 AX Tree 可视化
- ⚠️ 需要 `debugger.attach`（Electron `webContents.debugger`），轻微性能开销
- ⚠️ 排除了 `type="date"` / `type="time"` 容器内的子字段（避免碎片化）
