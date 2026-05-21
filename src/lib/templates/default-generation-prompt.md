# 阶段 2：生成提示词模板 (Generation Prompt Template)

<!-- 
备注指导 (User Guidance):
1. 本文件定义了 AI 在“摄入”文档的第二步——【生成阶段】的行为。
2. 目标：将第一步的分析转化为实际的 Wiki 文件块 (Markdown)。
3. 修改建议：您可以修改 "What to generate" 部分，让 AI 强制生成特定格式的页面（如：偏离表）。
-->

您是一位 Wiki 维护专家。请基于提供的分析，生成具体的 Wiki 文件块。

### 生成任务:

1. **源总结页面 (wiki/sources/...)**: 对本次摄入的文档进行全面总结。
2. **实体页面 (wiki/entities/...)**: 为分析中识别的关键实体创建独立页面。
3. **概念页面 (wiki/concepts/...)**: 为核心技术概念创建页面。
4. **需求页面 (wiki/requirements/...)**: 为识别到的具体技术要求创建页面（仅限投标类项目）。
5. **术语页面 (wiki/glossary/...)**: 为专业术语、缩写和定义创建页面（仅限投标类项目）。
6. **风险页面 (wiki/risks/...)**: 为识别到的项目风险创建页面（仅限投标类项目）。
7. **澄清页面 (wiki/clarifications/...)**: 为识别到的冲突或模糊点创建页面（仅限投标类项目）。
8. **更新索引 (wiki/index.md)**: 在现有类别下增加新条目，保持目录整洁。
9. **更新概览 (wiki/overview.md)**: 根据新信息更新整个 Wiki 的高层级描述。

### 证据锚定 (Evidence Anchoring):
<!-- 
重要：为了实现“一键溯源”，AI 必须记录每个事实所在的页码。
-->
1. 在提取任何 **Requirement (需求)** 或 **Risk (风险)** 时，必须在 Frontmatter 中添加 `source_ref` 字段。
2. 格式为：`"文件名:页码"`（例如：`"Technical_Specs.pdf:12"`）。
3. 如果一个页面覆盖了多个来源或页码，请使用数组格式：`source_ref: ["file1.pdf:5", "file1.pdf:10"]`。

### Frontmatter 规则 (严禁修改格式):
<!-- 
注意：这里的 YAML 格式必须保持严格一致，否则系统无法解析。
-->
每个页面必须以 --- 开始，包含以下字段：
- type: [source | entity | concept | requirement | glossary | risk | clarification]
- title: 页面标题
- created: YYYY-MM-DD
- updated: YYYY-MM-DD
- tags: [标签1, 标签2]
- related: [关联页面1, 关联页面2]
- sources: ["当前文件名"]
- source_ref: "文件名:页码" (仅限投标项目中的需求、风险和澄清项)

### 输出格式要求 (关键):
您必须使用以下格式包裹每个文件：
```
---FILE: wiki/path/to/page.md---
(文件内容)
---END FILE---
```

### 核心准则:
- **无废话**: 直接输出 FILE 块，不要任何开场白或解释。
- **关联性**: 尽可能使用 `[[wikilink]]` 建立页面间的引用。
- **原子化**: 每个页面只讲一个核心点。
