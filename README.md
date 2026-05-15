# 飞书 AI 聊天机器人

这个小项目会把飞书消息转给 OpenAI，再把回复发回飞书。第一版适合先跑通私聊或群聊里的 AI 对话，后面可以继续加飞书日历、课程资料整理等能力。

## 1. 飞书后台配置

打开飞书开放平台：

<https://open.feishu.cn/app>

创建一个「企业自建应用」，建议命名为：

```text
Codex AI 助手
```

然后完成这些设置：

1. 在「凭证与基础信息」里复制：
   - `App ID`
   - `App Secret`
2. 在「事件订阅」里配置请求地址：
   - 本地开发时先等公网地址准备好
   - 最终路径格式是：`https://你的公网域名/feishu/events`
3. 在「事件订阅」里添加事件：
   - `im.message.receive_v1`，接收消息
4. 在「权限管理」里添加权限：
   - 接收用户发送给机器人的单聊消息
   - 接收群聊中 @ 机器人的消息
   - 发送消息
5. 在「机器人」能力里启用机器人。
6. 在「版本管理与发布」里发布新版本，等管理员审核通过。

第一次测试建议先不要开启事件加密。等机器人跑通后，再补事件加密支持。

## 2. 本地配置

复制配置样例：

```bash
cp .env.example .env
```

然后填写：

```text
FEISHU_APP_ID=飞书 App ID
FEISHU_APP_SECRET=飞书 App Secret
FEISHU_VERIFICATION_TOKEN=事件订阅里的 Verification Token
OPENAI_API_KEY=OpenAI API Key
```

如果想换模型，可以改：

```text
OPENAI_MODEL=gpt-4o-mini
```

也可以调整机器人风格：

```text
BOT_SYSTEM_PROMPT=You are Harris's teaching assistant. Reply clearly and help organize A-Level and IGCSE physics work.
```

## 3. 启动服务

安装依赖：

```bash
npm install
```

启动：

```bash
npm run dev
```

健康检查地址：

```text
http://localhost:3008/health
```

## 4. 配置公网回调

飞书事件订阅必须使用公网 HTTPS 地址。可以选一种：

- Cloudflare Tunnel
- ngrok
- 部署到 Railway / Render / Vercel / 自己的服务器

如果用 ngrok，示例：

```bash
ngrok http 3008
```

然后把生成的 HTTPS 地址填到飞书事件订阅，请求地址填：

```text
https://你的-ngrok-域名/feishu/events
```

## 4.1 部署到 Railway

Railway 更适合长期使用，因为它会提供一个固定 HTTPS 域名。

推荐做法：

1. 打开 Railway：
   <https://railway.com/>
2. 登录后创建新项目。
3. 选择从 GitHub 仓库部署，或使用 Railway CLI 部署当前目录。
4. 在服务的 Variables / 环境变量页面添加：

```text
FEISHU_APP_ID=飞书 App ID
FEISHU_APP_SECRET=飞书 App Secret
FEISHU_VERIFICATION_TOKEN=事件订阅里的 Verification Token
OPENAI_API_KEY=OpenAI API Key
OPENAI_MODEL=gpt-4o-mini
BOT_SYSTEM_PROMPT=You are Harris's teaching assistant. Reply clearly and help organize A-Level and IGCSE physics work.
```

不要手动设置 `PORT`，Railway 会自动提供。

5. 部署成功后，在 Railway 服务的 Settings / Networking 里生成 Public Domain。
6. 把飞书事件订阅请求地址改成：

```text
https://你的-railway-域名/feishu/events
```

## 5. 测试方式

1. 把应用发布并安装到企业。
2. 私聊机器人，发送一句话。
3. 或在群里添加机器人，然后 `@机器人` 发送消息。

机器人收到消息后，会调用 OpenAI 并把回复发回同一个聊天。

## 后续可加的能力

- 创建飞书日历事件
- 查询或整理当前课程资料文件夹
- 将 A-Level / IGCSE 内容归档到固定结构
- 每周自动提醒整理课件和讲义
