# 数据流重设计：全局状态 + 本地缓存（混合模式）

## Context

当前 teamtrack 小程序的数据流存在核心问题：`appStore` 只写不读，缓存层形同虚设，每个页面仍各自调 DB。具体表现为：
- `getCurrentUser` 被重复调用 7 处（且底层调 login 云函数有副作用）
- `getMyTeams` 有 4 个独立入口，缓存格式不一致
- index 页面 `getTasks`/`getMembers` 各调 2 次（loadData + getStats 内部）
- 写操作后只刷自己页面，不刷新全局缓存

本次重设计采用**分层混合模式**：公共数据（user、teams）走缓存优先读路径，强实时数据（tasks/members/deliverables/activities）保留按需拉取，写操作后显式失效缓存。不引入 TTL/事件总线，靠 onShow 自然刷新 + 显式失效保证一致性。

## 关键设计决策

1. **appStore 移除 user 职责**：user 缓存全部归 auth.js（消除 appStore.setUser 与 auth.setCachedUser 双写入口）。appStore 专注 teams 缓存。
2. **缓存只存原始格式**：teams 缓存只存 getMyTeams 云函数返回的原始数据（含 myRole/myContribution 等），不存 isActive/isCaptain 等派生字段（页面 setData 时计算）。
3. **db.js 自动失效 teams**：写操作（createTeam/joinTeam/quitTeam/claimTask/completeTask）成功后自动 `appStore.invalidateTeams()`。user 缓存失效由页面调 `auth.invalidateUser()`（db 不 require auth，避免循环依赖）。

依赖链（无循环）：auth.js → db.js + appStore.js；db.js → cloud.js + appStore.js；appStore.js → 无。

## 实施步骤

### 1. utils/appStore.js（中改）
- 移除 `setUser/getUser/USER_CACHE_KEY`（user 归 auth）
- `TEAM_CACHE_KEY` 从 `'cache_teams'` 改为 `'cache_teams_v2'`（隔离旧格式）
- 新增 `invalidateTeams()`（清内存+storage）
- `clear()` 只清 teams（不再清 user）
- 导出：`getTeams, setTeams, invalidateTeams, clear`

### 2. utils/auth.js（小改）
- `setCachedUser`（line 193）：删除 `appStore.setUser(user)`
- 新增 `invalidateUser()`：`_userInfo = null` + removeStorage('userInfo')
- 新增 `refreshUser()`：封装 `db.getCurrentUser() + setCachedUser(user)`，返回 user
- `logout` 中 `appStore.clear()` 保留
- 导出新增 `invalidateUser, refreshUser`

### 3. utils/db.js（中改）
- 顶部新增 `require('./appStore')`
- 新增 `getMyTeamsWithCache(force=false)`：force=false 先读 appStore.getTeams()，miss 才调 getMyTeams+setTeams；force=true 跳过缓存
- 新增 `computeStats(tasks, members)`：纯函数，从已有 tasks/members 计算 totalTasks/completedTasks 等（抽自 getStats 内部逻辑）
- `getStats` 内部改为调 computeStats（保留接口）
- 写操作加 `appStore.invalidateTeams()`：createTeam(97)、joinTeam(109)、quitTeam(122)、claimTask(165)、updateTaskStatus(169，仅 completed 分支)

### 4. utils/teamSwitcher.js（小改）
- `load`：`DB.getMyTeams()` → `DB.getMyTeamsWithCache()`；删除 `appStore.setTeams(teams)`（缓存由 getMyTeamsWithCache 内部写）；catch 分支改调 `appStore.invalidateTeams()`
- `switchTo`：删除 `appStore.setTeams(processed)`（line 69，派生字段不进缓存，切换团队不改变 teams 列表）

### 5. pages/index/index.js（小改）
- `loadData`（line 141-213）：去掉 `DB.getStats()`，改用 `DB.computeStats(tasks, members)`。getTasks/getMembers 各从 2 次降为 1 次。

### 6. pages/profile/profile.js（小改）
- 移除 `require('../../utils/appStore')`
- `init`（line 38）：删除 `appStore.setUser(cached)`
- `loadUser`：`DB.getCurrentUser()+setCachedUser+appStore.setUser` → `auth.refreshUser()` + setData
- `onLogin`（line 82）：删除 `appStore.setUser(user)`
- `onSubmitRegister`（line 143）：删除 `appStore.setUser(user)`

### 7. pages/myStats/myStats.js（小改）
- `loadData`：`DB.getCurrentUser()` → `auth.getCachedUser()`（立即渲染）+ `auth.refreshUser()`（后台刷新）；`DB.getMyTeams()+appStore.setTeams()` → `DB.getMyTeamsWithCache()`

### 8. pages/contribution/contribution.js（极小改）
- `loadData`（line 97）：`DB.getCurrentUser()` → `auth.getCachedUser()`（wxml 只用 user.nickName）

### 9. pages/taskDetail/taskDetail.js（小改）
- `onClaim`（line 67）：删除 `const user = await DB.getCurrentUser()`（user 未使用）
- `doUpload`（line 161）：删除 getCurrentUser，uploadDeliverable 不传 user
- `doUploadLink`（line 196）：删除 getCurrentUser，uploadDeliverable 不传 user
- `onComplete`：completeTask 后加 `auth.invalidateUser()`

### 10. pages/tasks/tasks.js（极小改）
- `onClaimTask`：claimTask 成功后加 `auth.invalidateUser()`

### 11. pages/teams/teams.js（小改）
- `loadTeams`：`DB.getMyTeams()` → `DB.getMyTeamsWithCache(this._force)`；下拉刷新设 `_force=true`，普通 onShow 设 `_force=false`

### 12. pages/createTask/createTask.js（极小改）
- `loadTeams`：`DB.getMyTeams()` → `DB.getMyTeamsWithCache()`

## 不改的点（防范围蔓延）
- `db.getTeam` 全表扫描（历史性能问题，暂不处理）
- `db.getDeliverables` 无参全库查询（contribution 依赖此行为，暂不处理）
- `auth.isLoggedIn` 的副作用回填
- 所有云函数（后端不变）
- 所有 wxml/wxss（只改 JS 数据流）

## 验证方法
1. 真机预览，登录后依次访问首页/任务/贡献/我的/累计统计，确认数据正常显示
2. 领任务后：任务页任务状态更新、累计统计的"进行中"数 +1（验证 invalidateTeams + invalidateUser）
3. 完成任务后：任务详情状态更新、累计统计的"已完成"+贡献值变化
4. 退出/解散团队后：首页/任务/贡献页团队列表更新（验证 invalidateTeams）
5. 切换团队：各页面数据跟随切换（验证缓存优先 + currentTeamId）
6. 退出登录后重新登录：数据正常恢复（验证 clear）
