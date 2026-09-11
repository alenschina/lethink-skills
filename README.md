# Lethink Skills

为 Lethink CMS 开发提供的 Agent Skills，可安装到 ZCode、Codex、Trae、Qoder、OpenCode 等编程助手，帮助你根据业务需求创建和排查动态组件。

## 可用技能

| 技能 | 用途 |
| --- | --- |
| [create-lethink-dynamic-component](skills/create-lethink-dynamic-component/SKILL.md) | 基于静态 HTML 或业务需求创建动态组件，编写 `unit_json`、分类及筛选配置，并排查请求、字段绑定、内容入口和链接问题 |

## 安装

先安装 Node.js、npm（包含 npx）和 Git，并确保能够访问 [GitHub 仓库](https://github.com/alenschina/lethink-skills)。无需手动克隆仓库。

在终端执行以下命令，以安装到 ZCode 为例：

```bash
npx skills@latest add alenschina/lethink-skills --skill create-lethink-dynamic-component --agent zcode --global
```

使用其他平台时，将 `--agent zcode` 替换为表中的对应参数。Trae 和 Qoder 请按实际使用的国内版或国际版选择。

| 平台 | 安装参数 |
| --- | --- |
| ZCode | `--agent zcode` |
| Codex | `--agent codex` |
| Trae 国际版 | `--agent trae` |
| Trae 国内版 | `--agent trae-cn` |
| Qoder 国际版 | `--agent qoder` |
| Qoder 国内版 | `--agent qoder-cn` |
| OpenCode | `--agent opencode` |

`--global` 表示安装到用户级目录，可在多个项目中使用。如果只想在某个项目中使用，先进入该项目目录，再去掉 `--global` 执行安装命令。安装器会处理各平台的技能目录，详见 [支持的平台列表](https://github.com/vercel-labs/skills#supported-agents)。

如果你使用 SSH 访问 GitHub，可改用以下命令，并按需替换 Agent 参数：

```bash
npx skills@latest add git@github.com:alenschina/lethink-skills.git --skill create-lethink-dynamic-component --agent zcode --global
```

若安装时提示没有仓库访问权限，请先确认 GitHub 账号权限，以及 Git 凭据或 SSH 密钥配置。

## 使用

1. 在编程助手中打开实际的 Lethink 应用项目，让它能够读取相关前后端代码。
2. 刷新并启用已安装的技能。ZCode 的入口为“设置 → 技能”；其他平台按各自的技能管理方式操作。
3. 在对话中指定技能名称，并描述组件布局、业务字段和数据用途。

如果已有原始静态 HTML markup，可以同时提供代码、附件或文件路径；技能会优先沿用现有结构完成动态化。未提供时，编程助手会询问是否有现成 markup；没有也可以直接根据需求创建。关联的 CSS、JS 和页面截图可一并提供。

例如：

```text
请使用 create-lethink-dynamic-component 技能，帮我创建一个两层产品分类动态组件。

页面按一级分类展示卡片：
- 一级分类包含名称、说明文案和展示图片。
- 每个一级分类下面展示二级分类名称，点击后跳转到对应的产品列表。
- 分类信息需要在站点的内容管理中维护。

请先核对当前项目的数据接口和站点隔离方式，判断是否适合复用现有产品分类数据，
再提供完整的 unit_json、HTML、样式，以及后台配置和验证步骤。
```

ZCode 也可以通过 `$create-lethink-dynamic-component` 指定技能，再填写需求。具体调用方式参见 [ZCode Skill 文档](https://zcode.z.ai/cn/docs/skill)。

生成结果后，按步骤在 CMS 中创建组件、挂载到测试页面、录入内容并检查展示效果。使用技能仍需要相应的 CMS 账号和站点操作权限。

如果编程助手未识别技能，先检查安装时选择的平台和安装范围，再刷新技能列表并确认已启用。

## 更新

批量更新已安装的技能：

```bash
npx skills@latest update
```

按提示选择用户级或项目级安装范围。该命令会更新所选范围内的全部技能，包括从其他仓库安装的技能。

如果只想更新本仓库的动态组件技能，以用户级安装为例：

```bash
npx skills@latest update create-lethink-dynamic-component --global
```

如果当初安装在项目内，请先进入该项目目录，将 `--global` 改为 `--project` 再执行。

更新后刷新编程助手中的技能列表。更多选项参见 [skills 更新命令说明](https://github.com/vercel-labs/skills#skills-update)。
