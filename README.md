# Lethink Skills

集中维护 Lethink CMS 开发相关的 Agent Skills，供团队通过 `npx skills` 安装到 ZCode、Codex、Trae、Qoder、OpenCode 等编程助手。

## 已有技能

| 技能名 | 用途 |
| --- | --- |
| [create-lethink-dynamic-component](skills/create-lethink-dynamic-component/SKILL.md) | 根据业务字段创建动态组件，组装 unit_json、配置动态 HTML 指令，并排查内容入口、分类树、站点数据和链接问题 |

该技能附带两种绑定模式的配置模板、产品分类 HTML、配置说明、排查指南和 Node.js 校验脚本。安装时需要保留整个技能目录。

## 不同平台的安装参数

同一套 Skill 可以安装到下列平台。安装命令中的 `--agent` 决定目标平台，由安装器处理各平台的技能目录，不需要复制修改一套平台专用的 Skill。

| 同事使用的平台 | 安装参数 |
| --- | --- |
| ZCode | `--agent zcode` |
| Codex | `--agent codex` |
| Trae 国际版 | `--agent trae` |
| Trae 国内版 | `--agent trae-cn` |
| Qoder 国际版 | `--agent qoder` |
| Qoder 国内版 | `--agent qoder-cn` |
| OpenCode | `--agent opencode` |

请按实际安装的国际版或国内版选择参数。例如安装到 OpenCode，直接执行：

```bash
npx skills@latest add alenschina/lethink-skills --skill create-lethink-dynamic-component --agent opencode --global
```

使用其他平台时，只需把上面的 `opencode` 换成表中的对应值。安装后按各平台的技能管理入口刷新、启用和调用；不要默认所有平台都使用相同的 `$技能名` 调用语法。

上述平台均列在 [skills 安装器支持列表](https://github.com/vercel-labs/skills#supported-agents) 中。安装目录支持不等于已在每个平台完成业务联调；本仓库目前已验证 ZCode 安装和 Skill 文件完整性。

## 安装到 ZCode

准备 Node.js、npm（包含 npx）和 Git。本仓库地址为 [alenschina/lethink-skills](https://github.com/alenschina/lethink-skills)，直接执行：

```bash
npx skills@latest add alenschina/lethink-skills --skill create-lethink-dynamic-component --agent zcode --global
```

如果使用 SSH 访问 GitHub，也可以使用本仓库的 SSH 克隆地址：

```bash
npx skills@latest add git@github.com:alenschina/lethink-skills.git --skill create-lethink-dynamic-component --agent zcode --global
```

私有仓库要求安装者已经配置相应的 Git 访问权限，例如 SSH 密钥或凭据管理器。GitHub 的“组织/仓库”简写不适用于任意公司 Git 服务；其他服务使用完整地址。

安装完成后，在 ZCode 的“设置 → 技能”中刷新并启用。在对话中输入：

```text
$create-lethink-dynamic-component

请根据当前 Lethink 项目创建一个企业荣誉动态组件：
每条记录包含标题、年份、说明和图片。
请先确认数据归属，再提供完整 unit_json、HTML 和后台配置步骤。
```

应在实际 Lethink 应用工作区使用该技能，让 Agent 可以核对前后端实现。技能仓库只保存开发说明和模板，不包含 CMS 服务、数据库或访问凭据。

## 安装到 Codex 或当前项目

把 Agent 参数改成 codex：

```bash
npx skills@latest add alenschina/lethink-skills --skill create-lethink-dynamic-component --agent codex --global
```

`--global` 表示安装到用户级目录。只想在某个应用项目使用时，先进入那个项目目录，去掉 `--global` 再执行。

已经克隆本仓库，也可以在仓库根目录从本地安装：

```bash
npx skills@latest add . --skill create-lethink-dynamic-component --agent zcode --global
```

安装后的调用名称来自 SKILL.md 的 name，不是 Git 仓库名。

## 后续更新

维护者修改本仓库并推送后，使用者可从相同远程仓库重新执行原来的安装命令，按提示更新所选技能。安装器支持的更新命令和参数以当前版本的帮助为准：

```bash
npx skills@latest update --help
```

本仓库是从已有本机 Skill 复制而来。以后以仓库中的文件作为团队维护来源；修改本机另一个独立副本不会自动提交或同步到此仓库。

## 仓库结构

```text
lethink-skills/
├── README.md
├── .gitignore
└── skills/
    └── create-lethink-dynamic-component/
        ├── SKILL.md
        ├── agents/
        │   └── openai.yaml
        ├── references/
        │   ├── unit-json-contract.md
        │   ├── troubleshooting.md
        │   ├── create-package-template.json
        │   ├── existing-api-product-category-template.json
        │   └── product-category-template.html
        └── scripts/
            └── validate-unit-json.mjs
```

## 本地检查

以下命令均在仓库根目录执行。

检查安装器能否发现技能（只列出，不安装）：

```bash
npx skills@latest add . --list
```

检查两个模板：

```bash
node skills/create-lethink-dynamic-component/scripts/validate-unit-json.mjs skills/create-lethink-dynamic-component/references/create-package-template.json
node skills/create-lethink-dynamic-component/scripts/validate-unit-json.mjs skills/create-lethink-dynamic-component/references/existing-api-product-category-template.json skills/create-lethink-dynamic-component/references/product-category-template.html
```

校验脚本只检查本地配置和部分 HTML 约定，不验证实际数据库、账号权限或站点页面；CMS 联调仍按 Skill 中的步骤执行。

## 新增其他 Lethink 技能

在 `skills/<技能名>/` 下新增 `SKILL.md`，并按需放置 references、scripts、assets。不要在仓库根目录增加覆盖整个仓库的 SKILL.md。

每个 SKILL.md 必须包含 name 和 description，例如：

```yaml
---
name: lethink-example
description: 描述该技能具体处理什么任务，以及何时使用。
---
```

文件夹与 name 保持一致，使用英文小写和连字符。文档引用采用技能目录内的相对路径，避免依赖某位同事电脑上的绝对路径。完成后更新上方技能表，再运行 `npx skills@latest add . --list` 检查发现结果。

## 首次推送

本项目使用 main 分支，远程仓库为 [alenschina/lethink-skills](https://github.com/alenschina/lethink-skills)。首次关联并推送时，在这里执行（已有 origin 时跳过 remote add）：

```bash
git add README.md .gitignore skills
git commit -m "初始化 Lethink 技能仓库"
git remote add origin https://github.com/alenschina/lethink-skills.git
git push -u origin main
```

如果远程仓库已包含提交，先按团队 Git 流程对齐历史。推送完成后，同事即可使用本文安装命令获取技能。

本仓库使用标准的 `skills/<技能名>/SKILL.md` 发现结构，无须构建或发布 npm 包。[skills 安装器官方说明](https://github.com/vercel-labs/skills)

ZCode 的刷新、启用和调用方式参见 [ZCode Skill 文档](https://zcode.z.ai/cn/docs/skill)。
