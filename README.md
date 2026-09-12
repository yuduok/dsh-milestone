# dsh-milestone

给 dsh web 会话加"对话里程"导航：每一轮对话（turn）是一个里程，在**对话区左侧**渲染一条
**垂直刻度标尺**，**当前浏览位置对应的里程高亮**，**悬停显示该轮简略信息**，**点击跳转到该轮**。

```
   对话区左侧
        │
   ────┼─        ⌃  （上方还有更早的里程）
        │
   ▬▬▬▬▬┼▬▬▬▬▬   ← 当前可视轮（最长最亮，带端点）
        │  ▬▬▬▬
        │    ▬▬     悬停：第 7 轮 · "帮我改下这个构建脚本" · 12 分钟前 · 已完成
        │
   ────┼─        ⌄  （下方还有更新的里程）
```

标尺**只显示 5 个里程**（当前轮 ±2），随阅读位置滑动；两侧的 `⌃`/`⌄` 提示还有更多里程。

## 滑动动画

切换是**一次连续的滑动**，不是刻度原地替换：

- 标尺实际渲染 9 个刻度（`STRIP_TICKS`：可读区 5 个 + 每侧 2 个过渡刻度 `STRIP_OVERSCAN`），
  整列用一个 `translateY` 平移，让焦点刻度落在视口中心线；CSS `transition: transform .34s` 负责补间。
- 多渲染的那 4 个刻度是**过渡材料**——没有它们，走一格就只能卸载/挂载节点，看起来是"顶替"。
- 超出可读区的刻度按距离逐级**淡出 + 模糊**（`data-distance` 3/4/5/6 → opacity/blur 递增），
  视口再有上下软遮罩（`mask-image`），所以视觉上始终只有 5 个左右清晰可读。
- 居中量由纯函数 `stripShift(focusIndex)` 给出，且**以视口中心线为准**（不是以整条 strip 的中点为
  准——strip 比视口高时，按后者居中会把焦点顶到视口边缘）。CSS 的刻度高度/间距由 locator.ts
  的常量插值生成，避免 CSS 与 JS 对"一格走多远"产生分歧。
- 尊重 `prefers-reduced-motion`：该偏好下关闭位移过渡与脉冲动画。

## 挂载位置与实现方式

标尺视觉上漂浮在对话列左侧、不占据任何布局空间，实现上是**注册点与渲染点分离**：

| 关注点 | 做法 | 原因 |
|---|---|---|
| 注册槽位 | `conversation.session.header.actions`（session 作用域 list 槽，`order:-10`） | 只有 **session 作用域**的槽位才注入会话标准套件（`useSession` / `useProjection`）；list 槽是**追加**，不会顶掉已有关卡按钮 |
| 实际渲染位置 | `createPortal` 到 `[data-shell-overlay]`（ui-layout 的 AppFrame 浮层：`inset:0; pointer-events:none`，直接子元素自动恢复交互） | 让标尺脱离 header 行几何、真正浮在对话列左侧。注意 `shell.overlay` 本身是 **root 作用域**，拿不到会话套件，因此不能直接注册在那里 |
| 水平定位 | 运行时测量 `[data-conversation-scroll]` 左边缘 → 相对浮层的 `left = columnLeft + RAIL_INSET(12px)` | 侧栏折叠/拖拽、详情面板开合、窗口缩放都会移动对话列；测量比重算网格更稳。**必须 `+inset`（往右）**：`columnLeft` 就是 sidebar 的右边界，若按"标尺宽度+间隙"往左减（`- 26 - 10`），标尺会被推回 sidebar 上方，看起来像"贴在 sidebar 右侧" |

## 架构

两半协同，数据走 dsh 官方 `session-projection` 通道（与 `dsh-session-stats` 同范式）：

```
session 事件流
   │
   ├─ host 半 src/index.ts → ctx.sessionProjections.register(milestones)
   │     纯折叠：turn/start 开启 · 首条 user/message 记摘要(80 字符) · turn/end 关闭
   │     state 纯 JSON，全同步函数
   │
   ▼  框架自动经历史基线 + session/projection 推送帧送达（免疫分页与压缩）
client 半 src/client.tsx → 注册于 header.actions，portal 到 shell.overlay
      useProjection('milestones') 读数据（无客户端折叠）
      useSession + DOM 标记做滚动位置同步 → windowTicks 切出 5 个刻度
```

**为什么用投影而不是自己开 RPC**：投影值由框架推送到每个客户端载具，历史翻页与会话压缩
都不会让标尺丢轮次；host 只负责纯折叠，客户端零数据加工。

## 挂载

需要重启 `dsh web` 才生效（会中断现有 web 会话）。

方式 A —— dsh CLI：

```bash
dsh plugin --profile web add /Users/yudu/Documents/dsh-Milestone
dsh --profile web --dump-config | grep -A3 dsh-milestone   # 确认合成层出现该行
```

方式 B —— 手动 link：

```jsonc
// ~/.dsh/profiles/web/package.json → dependencies
"dsh-milestone": "link:/Users/yudu/Documents/dsh-Milestone"
```

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml 追加（顶层必须是数组）
- insert:
    - id: dsh-milestone
      name: dsh-milestone
```

```bash
cd ~/.dsh/profiles/web && pnpm install
```

> `name` 必须写**包名**而非文件路径：client 半的发现机制是
> `require.resolve('<entryName>/package.json')`，只有包名可解析。

## 挂载后验收

1. 启动日志无 `FAILED fiber` / `client-modules` 报错（声明损坏或产物缺失会在此聚合抛错）。
2. `curl -sf http://127.0.0.1:3080/plugins/dsh-milestone/client.js | head -c 200`
   —— 应 200 且以 `/*! dsh-milestone client bundle` 开头。
3. 首页 `__DSH_BOOT__` 含 `dsh-milestone` 行。
4. 浏览器：标尺出现在**对话区左侧**（垂直排列）；清晰可读的刻度始终是 5 个；
   滚动时焦点刻度**平滑滑到中心**（不是原地替换），边缘刻度淡出/模糊；hover 出卡；点击跳转；
   里程多于可读区时两端出现 `⌃`/`⌄`。

## 开发

```bash
npm install
npm run check     # 一条命令跑完全部：typecheck → 单测 → 构建 → 产物验证
```

分步：

```bash
npm run typecheck  # tsc --noEmit
npm test           # 68 个纯函数单测（折叠状态机 + 可视轮判定 + 滑动 strip + 居中量 + 相对时间）
npm run build      # esbuild → lib/client.js（__ModuleLoader__ CJS 工厂格式）
npm run verify     # 在干净 vm 上下文物化产物 + 跑 apply()，并断言注入的 CSS 几何已求值
```

`npm run verify` 覆盖 Node 冒烟**测不到**的三件事：① 工厂体在无 `module` 全局的浏览器式上下文
能否物化（见下节 F1 坑）；② `apply()` 真的注册了槽位/字典/CSS；③ CSS 里的 `${...}` 模板是否
已求值为具体几何（读产物**源码**只能看到未求值形态，必须取注入后的字符串）。

改 client 半后**必须**重跑 `npm run build`：`dsh web` 只读 `lib/client.js` 产物，
不编译 TS 源码；产物缺失会在启动审计时报 `MissingClientBundleError`。

### 构建格式的坑（F1，评审拦截过）

client bundle 必须是这个形状：

```js
window.__ModuleLoader__.load({
  id: "dsh-milestone",
  factory: (require) => {
    var module = { exports: {} };      // ← 必须有
    var exports = module.exports;      // ← 必须有
    ...CJS body...
    return module.exports;
  }
});
```

真实 `ClientModuleLoader.materialize` 只以 `(require)` 单参调用工厂，浏览器作用域没有
`module` 绑定；漏掉这两行会在**物化期**抛 `ReferenceError: module is not defined`，
插件静默不渲染。**Node 冒烟测不出这个缺陷**——Node 的 CJS wrapper 自带全局 `module`，
会造成假阳性。判据必须用干净上下文：

```js
// 只给 window.__ModuleLoader__，不注入 module/exports/require/process
const ctx = vm.createContext({ window: { __ModuleLoader__: { load: (r) => regs.push(r) } }, ...jsBuiltins });
new vm.Script(bundleSource).runInContext(ctx);
const exports = regs[0].factory((spec) => seed[spec]);   // 单参物化
```

## 已知局限

- **点击跳转**依赖该轮节点仍在客户端已加载窗口内：早期轮次未 `loadOlder` 时跳转静默跳过（不报错）。
  5 刻度窗口锚定在"当前可视轮"，因此正常滚动时窗口内的轮次总是已加载的。
- **滚动同步**依赖对话流 DOM 标记 `[data-conversation-scroll]` 与 `[data-chat-anchor-key]`；
  上游若改这些属性名，标尺仍渲染但不跟随滚动（UI 降级，数据不受影响）。
  水平定位同样依赖 `[data-shell-overlay]`（ui-layout 的浮层）；缺失时标尺不渲染而非乱飘。
  定位结果会写到 DOM 上供排查：`.dms-rail[data-column-left]` 是测得的对话列左缘（≈ sidebar 宽度），
  `[data-left]` 是标尺实际的 `left`（= columnLeft + 12）。若标尺位置不对，先看这两个值：
  `data-column-left` 为 0 或缺失 = 测量没跑（scrollport/浮层未就绪）；两值相等且看着偏左 = 调 `RAIL_INSET`。
- 投影按会话隔离，subagent 子会话不出现在父会话标尺中。

## 目标版本

dsh `0.1.1-rc.2`（Web profile）。`peerDependencies` 按官方红线写
`^0.1.0-rc.6` 线；`devDependencies` 精确 pin `0.1.1-rc.2`，因为 npm 上
`^0.1.0-rc.6` 会解析到 rc.8 的旧扁平形 `ProjectionDefinition`（`schema`/`view`），
与目标 checkout 的 `stateSchema`/`wire{viewSchema,view}` 不兼容。

> rc 阶段 API pre-stable：升级 dsh 后请先比对
> `node_modules/@deepseek-ai/dsh-session-projection/lib/types/index.d.ts`
> 的 `ProjectionDefinition` 形状。
