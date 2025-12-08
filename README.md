# ewhooks - WebHook 转接器系统

WebHook 是一个轻便的转接器系统，支持动态路由、变量替换和数据映射。

## 功能特性

- 🚀 **动态路由**: 通过 URL 路径动态选择配置文件
- 🔄 **灵活转发**: 支持所有 HTTP 方法 (GET/POST/PUT/DELETE 等)
- 📝 **变量替换**: 从请求体、请求头、查询参数和环境变量中提取数据
- 🔐 **安全防护**: 禁止直接访问配置文件
- ⚡ **数据映射**: 灵活的请求体转换和重组

## 快速开始

### 安装依赖

```bash
yarn install
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件设置端口和其他环境变量:

```env
PORT=3000
TOKEN=your_secret_token
```

### 启动服务

```bash
yarn start
# 或
yarn dev
```

服务将在 `http://localhost:3000` 启动。

## 使用说明

### 1. 创建配置文件

在 `adapter/` 目录下创建 JSON 配置文件，例如 `adapter/mywebhook.json`:

```json
{
  "to": "https://target.com/webhook",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{env.TOKEN}}"
  },
  "body": {
    "message": "{{body.text}}",
    "user": "{{body.user.name}}"
  }
}
```

### 2. 发送请求

```bash
curl -X POST http://localhost:3000/adapter/mywebhook \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello", "user": {"name": "Alice"}}'
```

### 3. 查看结果

请求将被转发到配置的目标 URL，数据会根据配置进行转换。

## 配置文件说明

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `to` | string | ✅ | 转发目标 URL |
| `method` | string | ❌ | HTTP 方法,默认使用原始请求方法 |
| `headers` | object | ❌ | 额外的请求头,支持变量替换 |
| `body` | object | ❌ | 数据映射,不设置则转发原始数据 |

### 变量语法

使用 `{{source.path}}` 语法从不同来源提取数据:

#### 1. 请求体变量 `{{body.path}}`

```json
{
  "body": {
    "message": "{{body.text}}",
    "nested": "{{body.user.profile.email}}"
  }
}
```

请求:
```json
{"text": "Hello", "user": {"profile": {"email": "user@example.com"}}}
```

转发:
```json
{"message": "Hello", "nested": "user@example.com"}
```

#### 2. 请求头变量 `{{headers.Header-Name}}`

```json
{
  "headers": {
    "X-Forwarded-Auth": "{{headers.Authorization}}"
  }
}
```

#### 3. 查询参数变量 `{{query.param}}`

```json
{
  "body": {
    "token": "{{query.token}}"
  }
}
```

请求: `POST /adapter/mywebhook?token=abc123`

#### 4. 环境变量 `{{env.VAR_NAME}}`

```json
{
  "headers": {
    "Authorization": "Bearer {{env.TOKEN}}"
  }
}
```

## 完整示例

### 示例 1: 简单转发

`adapter/simple.json`:
```json
{
  "to": "https://webhook.site/xxx"
}
```

原始请求数据会直接转发，不做任何修改。

### 示例 2: 数据重组

`adapter/transform.json`:
```json
{
  "to": "https://api.example.com/notify",
  "method": "POST",
  "headers": {
    "Authorization": "Bearer {{env.API_KEY}}",
    "X-Source": "{{headers.User-Agent}}"
  },
  "body": {
    "notification": {
      "title": "{{body.title}}",
      "message": "{{body.content}}",
      "user": "{{body.user.name}}"
    },
    "metadata": {
      "timestamp": "{{body.timestamp}}",
      "source": "webhook-adapter"
    }
  }
}
```

### 示例 3: 多源数据组合

`adapter/combined.json`:
```json
{
  "to": "https://api.example.com/events",
  "body": {
    "event": "{{body.event_type}}",
    "user": "{{body.user}}",
    "api_key": "{{env.API_KEY}}",
    "source_ip": "{{headers.X-Forwarded-For}}",
    "ref": "{{query.ref}}"
  }
}
```

## API 端点

### WebHook 转发

```
POST /adapter/:name
```

- `:name`: 配置文件名(不含 `.json` 后缀)
- 支持所有 HTTP 方法

**响应:**
- `200-299`: 转发成功，返回目标服务器响应
- `404`: 配置文件不存在
- `500`: 配置文件格式错误
- `502`: 转发失败

### 健康检查

```
GET /health
```

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 安全说明

- ⚠️ 配置文件 (`adapter/*.json`) 不能通过 HTTP 直接访问
- 🔒 敏感信息(Token、API Key)应存储在环境变量中
- 📝 所有请求和转发操作都会记录日志

## 项目结构

```
ewhooks/
├── adapter/              # 配置文件目录
│   └── example.json      # 示例配置
├── src/                  # 源代码目录
│   ├── server.js         # 主服务器
│   ├── forwarder.js      # 转发逻辑
│   └── variableResolver.js  # 变量解析器
├── .env.example          # 环境变量示例
├── package.json          # 项目配置
└── README.md             # 使用文档
```

## 常见问题

### 如何调试配置?

查看控制台日志，每个请求都会记录:
```
[2024-01-01T00:00:00.000Z] 收到请求: POST /adapter/example
[2024-01-01T00:00:00.001Z] 转发成功: example -> 状态码 200
```

### 变量解析失败怎么办?

如果变量路径不存在，会使用空字符串替换，不会报错。

### 支持哪些 HTTP 方法?

支持所有标准 HTTP 方法: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS 等。

## 许可证

MIT
