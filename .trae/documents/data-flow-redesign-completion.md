# 数据流重设计收尾计划

## Context

基础层（appStore.js / auth.js / db.js / teamSwitcher.js）和 3 个页面（index.js / myStats.js / profile.js）已完成改造。但 profile.js 的 init 方法编辑时产生了重复行 bug，且仍有 5 个页面文件未改造：contribution.js / taskDetail.js / tasks.js / teams.js / createTask.js。

本计划完成剩余工作，使数据流重设计全部落地。

## Current State Analysis

### 已完成（无需改动）
- `utils/appStore.js`：纯 teams 缓存，含 getTeams/setTeams/invalidateTeams/clear
- `utils/auth.js`：含 getCachedUser/invalidateUser/refreshUser，setCachedUser 不再调 appStore
- `utils/db.js`：含 getMyTeamsWithCache/computeStats，5 处写操作已加 invalidateTeams
- `utils/teamSwitcher.js`：load 用 getMyTeamsWithCache，catch 用 invalidateTeams
- `pages/index/index.js`：loadData 用 computeStats 替代 getStats
- `pages/myStats/myStats.js`：getCachedUser 立即渲染 + refreshUser 后台刷新

### 已知 Bug
- `pages/profile/profile.js` 第 37-38 行：`this.loadUser()` 重复调用了两次

### 待改造（grep 确认）
- `pages/contribution/contribution.js:97`：`DB.getCurrentUser()` 需改为 `auth.getCachedUser()`
- `pages/taskDetail/taskDetail.js:67,161,196`：3 处 `DB.getCurrentUser()` 需删除
- `pages/taskDetail/taskDetail.js` onComplete：需加 `auth.invalidateUser()`
- `pages/tasks/tasks.js:177`：onClaimTask 成功后需加 `auth.invalidateUser()`
- `pages/teams/teams.js:33`：`DB.getMyTeams()` 需改为 `DB.getMyTeamsWithCache(this._force)`
- `pages/createTask/createTask.js:31`：`DB.getMyTeams()` 需改为 `DB.getMyTeamsWithCache()`

## Proposed Changes

### 1. 修复 profile.js 重复 loadUser bug
**文件**：`pages/profile/profile.js`
**问题**：第 37-38 行 `this.loadUser()` 重复
**改法**：合并为一行，保留注释
```javascript
// 改前（37-38 行）:
      this.loadUser()// 拉取最新用户信息（含 contribution 等统计字段，由 users 表维护）
      this.loadUser()

// 改后:
      this.loadUser()  // 拉取最新用户信息（含 contribution 等统计字段，由 users 表维护）
```

### 2. 改造 contribution.js
**文件**：`pages/contribution/contribution.js`
**原因**：loadData 中 `DB.getCurrentUser()` 走 login 云函数有副作用，且页面只用 user 做展示（贡献数据从 members/tasks 计算）
**改法**：第 97 行 `DB.getCurrentUser()` → `auth.getCachedUser()`
```javascript
// 改前:
      const [user, members, tasks, allDeliverables] = await Promise.all([
        DB.getCurrentUser(),
        DB.getMembers(),
        DB.getTasks({ status: 'all' }),
        DB.getDeliverables()
      ])

// 改后:
      const [user, members, tasks, allDeliverables] = await Promise.all([
        auth.getCachedUser(),
        DB.getMembers(),
        DB.getTasks({ status: 'all' }),
        DB.getDeliverables()
      ])
```
**注**：auth 已在文件顶部 import，无需新增导入

### 3. 改造 taskDetail.js（4 处改动）
**文件**：`pages/taskDetail/taskDetail.js`

**3a. onClaim（第 67 行）**：删除无用的 `const user = await DB.getCurrentUser()`，user 变量未在后续使用
```javascript
// 改前:
  async onClaim() {
    const user = await DB.getCurrentUser()
    wx.showModal({

// 改后:
  async onClaim() {
    wx.showModal({
```

**3b. doUpload（第 161 行 + 第 177 行）**：删除 getCurrentUser 调用，uploadDeliverable 不传 user
```javascript
// 改前（161 行）:
      const user = await DB.getCurrentUser()
      const task = this.data.task

// 改后:
      const task = this.data.task
```
```javascript
// 改前（172-178 行）:
      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName,
        filePath,
        user
      })

// 改后:
      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName,
        filePath
      })
```
**注**：db.js 的 uploadDeliverable 已不使用 user 参数（云函数调用未传 user）

**3c. doUploadLink（第 196 行 + 第 200-208 行）**：删除 getCurrentUser，移除 user 参数
```javascript
// 改前（196 行）:
      const user = await DB.getCurrentUser()
      const task = this.data.task

// 改后:
      const task = this.data.task
```
```javascript
// 改前（200-208 行）:
      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName: fileName,
        filePath: null,
        user,
        isLink: true,
        linkUrl: link
      })

// 改后:
      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName: fileName,
        filePath: null,
        isLink: true,
        linkUrl: link
      })
```

**3d. onComplete（第 320 行后）**：completeTask 成功后失效 user 缓存（completeTask 云函数会更新 users 表的 contribution/completedTasks/ongoingTasks）
```javascript
// 改前:
            await DB.updateTaskStatus(this.taskId, 'completed')
            wx.hideLoading()
            wx.showToast({ title: '任务已完成！', icon: 'success' })
            this.loadDetail()

// 改后:
            await DB.updateTaskStatus(this.taskId, 'completed')
            auth.invalidateUser()
            wx.hideLoading()
            wx.showToast({ title: '任务已完成！', icon: 'success' })
            this.loadDetail()
```

### 4. 改造 tasks.js
**文件**：`pages/tasks/tasks.js`
**原因**：claimTask 云函数会更新 users 表的 ongoingTasks，需失效 user 缓存
**改法**：onClaimTask 成功后加 `auth.invalidateUser()`
```javascript
// 改前（177 行后）:
            await DB.claimTask(id)
            wx.hideLoading()
            wx.showToast({ title: '抢单成功！', icon: 'success' })
            this.loadTasks()

// 改后:
            await DB.claimTask(id)
            auth.invalidateUser()
            wx.hideLoading()
            wx.showToast({ title: '抢单成功！', icon: 'success' })
            this.loadTasks()
```
**注**：auth 已在文件顶部 import

### 5. 改造 teams.js
**文件**：`pages/teams/teams.js`
**原因**：团队管理页应使用缓存优先，下拉刷新才强制拉云端
**改法**：
- 新增 `_force` 实例字段
- onLoad / onShow 设 `_force = false`
- onPullDownRefresh 设 `_force = true`
- loadTeams 调 `DB.getMyTeamsWithCache(this._force)`

```javascript
// 改前 onLoad:
  onLoad() {
    this._loaded = false
    this.loadTeams()
  },

// 改后:
  onLoad() {
    this._loaded = false
    this._force = false
    this.loadTeams()
  },
```
```javascript
// 改前 onShow:
  onShow() {
    if (this._loaded) {
      this.loadTeams()
    }
  },

// 改后:
  onShow() {
    if (this._loaded) {
      this._force = false
      this.loadTeams()
    }
  },
```
```javascript
// 改前 onPullDownRefresh:
  async onPullDownRefresh() {
    await this.loadTeams()
    wx.stopPullDownRefresh()
  },

// 改后:
  async onPullDownRefresh() {
    this._force = true
    await this.loadTeams()
    wx.stopPullDownRefresh()
  },
```
```javascript
// 改前 loadTeams（33 行）:
      const teams = await DB.getMyTeams()

// 改后:
      const teams = await DB.getMyTeamsWithCache(this._force)
```
**注**：joinTeam / quitTeam 成功后调 loadTeams 时缓存已被 db.js 内部 invalidate，`_force` 保持当前值即可（false 也能命中 miss 拉云端）

### 6. 改造 createTask.js
**文件**：`pages/createTask/createTask.js`
**原因**：创建任务页只需展示团队下拉，缓存优先即可
**改法**：第 31 行 `DB.getMyTeams()` → `DB.getMyTeamsWithCache()`
```javascript
// 改前:
      const teams = await DB.getMyTeams()

// 改后:
      const teams = await DB.getMyTeamsWithCache()
```

## Assumptions & Decisions

1. **uploadDeliverable 不需要 invalidateUser**：上传交付物只创建 deliverables 记录，不修改 users 表统计字段
2. **claimTask 需要 invalidateUser**：claimTask 云函数更新 users.ongoingTasks
3. **completeTask 需要 invalidateUser**：completeTask 云函数更新 users.contribution / completedTasks / ongoingTasks
4. **teams.js join/quit 后不显式设 _force=true**：db.js 的 joinTeam/quitTeam 已调 invalidateTeams，缓存为空时 getMyTeamsWithCache(false) 也会拉云端
5. **contribution.js 不调 refreshUser**：贡献数据从 members/tasks 实时计算，user 仅用于显示昵称，缓存足够

## Verification steps

1. **语法检查**：grep 确认无残留的 `DB.getCurrentUser()`（除 db.js 定义和 auth.js refreshUser 内部）和 `DB.getMyTeams()`（除 db.js 定义）
2. **profile.js**：确认 init 方法只有一行 loadUser 调用
3. **taskDetail.js**：确认 3 处 getCurrentUser 已删除，onComplete 含 invalidateUser
4. **tasks.js**：确认 onClaimTask 含 invalidateUser
5. **teams.js**：确认 _force 逻辑完整，loadTeams 用 getMyTeamsWithCache
6. **createTask.js**：确认 loadTeams 用 getMyTeamsWithCache
7. **真机测试流程**：登录 → 领任务（验证 ongoingTasks 更新）→ 完成任务（验证 contribution 更新）→ 切换团队 → 退出/解散团队 → 退出登录重登
