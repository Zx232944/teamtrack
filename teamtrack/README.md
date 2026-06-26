# 赛队管家 TeamTrack - 微信小程序 Demo

> 专为大学生竞赛团队打造的轻量级协作管理工具，基于微信云开发

## 快速开始

### 方式一：纯前端体验（无需配置）

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 导入项目，目录选择 `teamtrack`，AppID 选「测试号」
3. 直接运行 - Demo 内置完整模拟数据，所有功能可立即体验

### 方式二：接入真实云开发（推荐）

#### 1. 开通云开发
- 在微信开发者工具中点击「云开发」按钮开通环境
- 记录下你的**云环境ID**（如 `teamtrack-abc123`）

#### 2. 修改云环境ID
打开 [app.js](file:///e:/编程/CY/teamtrack/app.js) 第 46 行，将 `'teamtrack-demo'` 替换为你的云环境ID：
```js
wx.cloud.init({
  env: 'your-cloud-env-id',  // 替换为你的云环境ID
  traceUser: true
})
```

#### 3. 创建数据库集合
在云开发控制台 → 数据库，创建以下6个集合：
- `users` - 用户表
- `teams` - 团队表
- `tasks` - 任务表
- `members` - 团队成员表
- `deliverables` - 交付物表
- `activities` - 动态表

#### 4. 部署云函数
右键 `cloudfunctions` 目录下每个云函数文件夹，选择「上传并部署：云端安装依赖」：
- `login` - 用户登录
- `createTeam` - 创建团队
- `createTask` - 创建任务
- `claimTask` - 领取任务
- `completeTask` - 完成任务
- `uploadDeliverable` - 上传交付物
- `joinTeam` - 加入团队
- `getTeamData` - 获取团队数据
- `initData` - 初始化种子数据（可选）

#### 5. 设置数据库权限
在云开发控制台 → 数据库 → 每个集合 → 权限设置，选择「仅创建者可读写」或「所有用户可读，仅创建者可写」。

#### 6. 运行体验
重新编译运行小程序，所有数据将真实存储在云数据库，文件上传至云存储。

## 已实现的核心功能

### 用户体系
- 微信登录（自动获取 openid）
- 昵称修改
- 用户缓存与状态管理
- 退出登录

### 团队管理
- 创建团队（自动生成6位邀请码）
- 通过邀请码加入团队
- 团队信息展示
- 成员列表与贡献度排行
- 竞赛时间线（根据完成度自动更新）

### 任务管理
- 发布任务（标题/描述/分类/截止时间/分值）
- 任务抢单（领取后状态自动流转）
- 任务列表筛选（全部/待领取/进行中/已完成）
- 任务详情查看
- 标记完成（自动结算贡献分值）

### 交付物管理（核心功能）
- **真实文件上传**：从聊天记录选文件上传至云存储
- **拍照上传**：调用相机或相册
- **在线链接提交**：腾讯文档/飞书等在线协作链接
- **版本管理**：每次上传自动递增版本号
- **文件预览**：点击交付物预览/下载
- **文件大小统计**：自动计算并展示

### 贡献举证
- 个人贡献值统计
- 贡献趋势图（7日数据）
- 团队贡献排行榜
- 交付物历史记录

## 技术架构

```
┌─────────────────────────────────────────┐
│           微信小程序前端 (WXML/WXSS/JS)         │
├─────────────────────────────────────────┤
│  utils/auth.js    - 微信登录与用户管理         │
│  utils/db.js      - 数据访问层（云+mock双模式） │
│  utils/cloud.js   - 云开发调用封装             │
│  utils/util.js    - 通用工具函数               │
│  utils/mockData.js- 模拟数据（fallback）       │
├─────────────────────────────────────────┤
│              微信云开发后端                │
├─────────────────────────────────────────┤
│  云函数 (8个)                              │
│   ├─ login         - 登录与用户创建           │
│   ├─ createTeam    - 创建团队+邀请码           │
│   ├─ joinTeam      - 加入团队                 │
│   ├─ createTask    - 发布任务                 │
│   ├─ claimTask     - 抢单（原子操作）          │
│   ├─ completeTask  - 完成+结算贡献度           │
│   ├─ uploadDeliverable - 交付物记录           │
│   └─ getTeamData   - 团队数据聚合查询          │
│                                           │
│  云数据库 (6个集合)                         │
│   ├─ users         - 用户表                  │
│   ├─ teams         - 团队表（含邀请码）        │
│   ├─ tasks         - 任务表                  │
│   ├─ members       - 团队成员表              │
│   ├─ deliverables  - 交付物表（含fileID）     │
│   └─ activities    - 操作动态表              │
│                                           │
│  云存储                                    │
│   └─ deliverables/{taskId}/{timestamp}_{name} │
└─────────────────────────────────────────┘
```

## 数据库结构

### users（用户表）
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| openid | string | 微信openid |
| nickName | string | 昵称 |
| avatarUrl | string | 头像 |
| role | string | 角色：captain/member |
| contribution | number | 总贡献值 |
| completedTasks | number | 已完成任务数 |
| ongoingTasks | number | 进行中任务数 |
| createdAt | date | 注册时间 |

### teams（团队表）
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| name | string | 团队名 |
| competition | string | 赛事名称 |
| description | string | 项目描述 |
| captainId | string | 队长openid |
| memberCount | number | 成员数 |
| progress | number | 进度% |
| deadline | string | 截止日期 |
| inviteCode | string | 6位邀请码 |

### tasks（任务表）
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| teamId | string | 所属团队 |
| title | string | 任务标题 |
| description | string | 任务描述 |
| category | string | 分类 |
| status | string | pending/in_progress/completed |
| assigneeId | string | 负责人openid |
| assigneeName | string | 负责人昵称 |
| deadline | string | 截止日期 |
| points | number | 任务分值 |
| deliverables | number | 交付物数量 |

### deliverables（交付物表）
| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| taskId | string | 关联任务 |
| userId | string | 上传者openid |
| userName | string | 上传者昵称 |
| fileName | string | 文件名 |
| fileID | string | 云存储fileID |
| version | number | 版本号 |
| size | string | 文件大小 |
| uploadedAt | date | 上传时间 |

## 设计风格
- **暗色科技风**：#0F0F1A 深色背景
- **活力橙** #FF6B35：主色调，代表行动力
- **科技蓝** #1E90FF：辅助色，代表专业
- **薄荷绿** #00D4AA：成功状态色

## 常见问题

**Q：为什么打开后是模拟数据？**
A：云环境未配置。请按「方式二」接入真实云开发，或保持模拟模式体验功能。

**Q：上传文件失败？**
A：1) 检查云函数是否已部署 2) 检查云存储权限 3) 真机调试时文件大小限制10MB

**Q：邀请码无效？**
A：邀请码由创建团队时自动生成，在团队管理页面可查看。确保6位且大小写正确。

**Q：如何在真机预览？**
A：开发者工具 → 预览 → 手机扫码。云开发需在「真机调试」模式下完整可用。