# Phase 2 Self-Heal 测试手册

## 前置条件

1. **启动测试目标页面**
   ```bash
   cd ocbot_site
   npm run dev
   ```
   确认 `http://localhost:3000/test/debug` 可访问。

2. **构建并加载扩展**
   ```bash
   python3 ocbot/scripts/dev.py update-web
   ```
   在浏览器 `chrome://extensions` 刷新 ocbot 扩展。

3. **配置 LLM Provider**
   打开扩展 Home → Settings，确保已配置可用的 LLM Provider。

## 创建测试 Skill

在扩展 Home → Skills → 新建 Skill：

| 字段 | 值 |
|------|----|
| name | Debug Test Skill |
| startUrl | `http://localhost:3000/test/debug` |
| skillMd | `Navigate to the test page. Click the "Click Me" button. Type "hello" in the text input. Select "Beta" from the dropdown.` |
| steps | 留空（首次由 agent track 自动生成） |

## 测试用例

### TC-1: Agent Track 首次执行

**前置**: Skill 无 steps（首次运行）。

**操作**: Run Skill。

**预期**:
- 日志: `execution: Track: agent`
- Agent 通过 LLM 推理完成所有操作
- 执行成功后 steps 被缓存到 Skill 中
- 测试页面 Activity Log 依次显示: Button clicked → Input changed → Select changed

---

### TC-2: Fast Track 缓存命中

**前置**: TC-1 成功（Skill 已有 steps）。

**操作**: 刷新测试页面，再次 Run Skill。

**预期**:
- 日志: `execution: Track: fast`
- 日志: `selector: Enriched elements {count: N}`
- 日志: 多条 `selector: XPath match {hit: true}`
- 无 L2/L3 事件
- 执行速度明显快于 TC-1（无 LLM 调用）

---

### TC-3: L1 自愈 — XPath/testId 匹配

**前置**: TC-2 成功。

**操作**: 刷新测试页面（DOM 结构不变），Run Skill。

**预期**:
- 日志: `selector: XPath match {hit: true}`（多条）
- 可能出现 `selector: testId match`
- 无 L2/L3 事件
- 执行成功

---

### TC-4: L2 自愈 — 元素属性变更

**前置**: Skill 有缓存的 steps。

**操作**:
1. 打开测试页面
2. 点击 **"Mutate Button"**（改变按钮的 text/id/class）
3. Run Skill

**预期**:
- 日志: `selector: XPath match {hit: false}`（XPath 不再匹配）
- 日志: `L2: Attempting L2 heal {stepIndex: N}`
- 日志: `L2: Re-inferring step {instruction: "..."}`
- 日志: `L2: healStep done {success: true}`
- 日志: `L2: L2 heal result {resolved: true}`
- 执行成功，步骤被更新（evolution）

---

### TC-5: L3 自愈 — 元素被移除

**前置**: Skill 有缓存的 steps。

**操作**:
1. 打开测试页面
2. 点击 **"Remove Button"**（完全移除按钮）
3. Run Skill

**预期**:
- L2 尝试失败（元素不存在，无法 re-infer）
- 日志: `L3: Attempting segment repair {failedIndex: N}`
- 日志: `L3: Re-planning segment {failedIndex: N}`
- 日志: `L3: healSegment done {stepCount: M}`
- LLM 重新规划剩余步骤
- 如果 L3 成功: steps 被 merge 并 evolve

---

### TC-6: L3 自愈 — 布局完全替换

**前置**: Skill 有缓存的 steps。

**操作**:
1. 打开测试页面
2. 点击 **"Swap Layout"**（替换为完全不同的 DOM 结构）
3. Run Skill

**预期**:
- 所有原始 XPath 失败
- L2 失败（原始指令在新布局中无法匹配）
- L3 启动: `L3: Attempting segment repair`
- LLM 基于 skillMd 重新规划步骤
- 可能回退到 agent track: `execution: Track: agent`

---

### TC-7: diffTrees — 无效点击检测

**前置**: Skill 有缓存的 steps。

**操作**:
1. 打开测试页面
2. 点击 **"Add Disabled Button"**（插入一个同名但 disabled 的按钮）
3. Run Skill

**预期**:
- 如果 Skill 点击到 disabled 按钮:
  - 日志: `diff: Click effect {changed: false}`
  - 被视为 noEffect，触发重试或 L2 heal
- 如果通过 testId 正确匹配到原始按钮:
  - 日志: `diff: Click effect {changed: true}`
  - 正常执行

---

### TC-8: Fragility 评分

**前置**: 多次执行过包含 heal 的 Skill。

**操作**:
1. 执行 5 次以上，其中部分执行前先 Mutate/Remove
2. 检查 Skill 详情页

**预期**:
- 日志: `fragility: Fragile steps {indices: [...]}`
- Skill Editor 中显示 fragileSteps
- 频繁失败的 step index 被标记

---

## 观察 Debug 日志

所有日志通过 `chrome.storage.session` 存储，可在以下位置查看:

1. **浏览器 DevTools** → Application → Session Storage → 查找 `ocbot_debug_events`
2. **扩展 Background Console** → `await chrome.storage.session.get('ocbot_debug_events')`

### 日志分类颜色

| 分类 | 含义 |
|------|------|
| `L1` | XPath/testId/roleName 自愈 |
| `L2` | LLM 单步重推理 |
| `L3` | LLM 段落重规划 |
| `selector` | 选择器匹配过程 |
| `diff` | diffTrees 点击效果检测 |
| `execution` | 执行轨道选择 (fast/agent) |
| `fragility` | 脆弱步骤识别 |

## 故障排查

| 问题 | 排查 |
|------|------|
| 无日志输出 | 检查 `chrome.storage.session` 权限；确认扩展已重新加载 |
| Agent track 失败 | 检查 LLM Provider 配置；查看 background console 报错 |
| L2 始终失败 | 确认测试页面 accessibility tree 正常（DevTools → Accessibility） |
| Fast track 未命中 | 确认 Skill 已有 steps（Skill Editor 查看） |
| 测试页面打不开 | 确认 `npm run dev` 在运行，端口 3000 未被占用 |
