/**
 * 数据访问层 - 纯云后端
 * 支持多团队管理，可通过切换当前团队查看不同团队的数据
 */

const cloud = require('./cloud')
const appStore = require('./appStore')
const cache = require('./cache')

// ============ 当前团队管理 ============

const CURRENT_TEAM_KEY = 'currentTeamId'

function getCurrentTeamId() {
  try {
    return wx.getStorageSync(CURRENT_TEAM_KEY) || null
  } catch (e) {
    return null
  }
}

function setCurrentTeamId(teamId) {
  try {
    if (teamId) {
      wx.setStorageSync(CURRENT_TEAM_KEY, teamId)
    } else {
      wx.removeStorageSync(CURRENT_TEAM_KEY)
    }
  } catch (e) {}
}

// ============ 用户相关 ============

async function getCurrentUser() {
  try {
    const currentTeamId = getCurrentTeamId()
    const res = await cloud.callFunction('login', { currentTeamId })
    // callFunction 已解包 res.result.data，res 即 userInfo
    // 新用户（未注册）时 res 为 { isNew: true, ... }
    if (!res || res.isNew) return null
    return res
  } catch (e) {
    console.warn('[db] 获取用户失败', e)
    return null
  }
}

async function updateUserInfo(userInfo) {
  return await cloud.callFunction('updateUser', userInfo)
}

/**
 * 轻量级获取用户信息（仅查 users 表，不做团队查询）
 * 替代 login 云函数用于页面刷新用户统计
 */
async function getUserStats() {
  try {
    return await cloud.callFunction('getUserStats')
  } catch (e) {
    console.warn('[db] 获取用户统计失败', e)
    return null
  }
}

// ============ 团队相关 ============

/**
 * 获取我加入的所有团队
 */
async function getMyTeams() {
  try {
    const res = await cloud.callFunction('getMyTeams')
    return res || []
  } catch (e) {
    console.warn('[db] 获取团队列表失败', e)
    return []
  }
}

/**
 * 缓存优先拉取团队列表
 * @param {boolean} force true 跳过缓存直接拉取
 */
async function getMyTeamsWithCache(force = false) {
  if (!force) {
    const cached = appStore.getTeams()
    if (cached !== null) return cached
  }
  const teams = await getMyTeams()
  appStore.setTeams(teams)
  return teams
}

/**
 * 获取当前团队信息（或指定团队）
 */
async function getTeam(teamId) {
  const tid = teamId || getCurrentTeamId()
  if (!tid) return null
  try {
    return await cloud.queryById('teams', tid)
  } catch (e) {
    console.warn('[db] 获取团队失败', e)
    return null
  }
}

/**
 * 获取团队成员
 */
async function getMembers(teamId) {
  const tid = teamId || getCurrentTeamId()
  if (!tid) return []
  return await cache.withCache('getMembers_' + tid, 30000, async () => {
    try {
      return await cloud.queryCollection('members', { teamId: tid })
    } catch (e) {
      console.warn('[db] 获取成员失败', e)
      return []
    }
  })
}

/**
 * 创建团队
 */
async function createTeam(data) {
  const res = await cloud.callFunction('createTeam', data)
  // 创建成功后自动切换为当前团队
  if (res && res.teamId) {
    setCurrentTeamId(res.teamId)
  }
  appStore.invalidateTeams()
  return res
}

/**
 * 通过邀请码加入团队
 */
async function joinTeam(inviteCode) {
  const res = await cloud.callFunction('joinTeam', { inviteCode })
  // 加入成功后自动切换为当前团队
  if (res && res.teamId) {
    setCurrentTeamId(res.teamId)
  }
  appStore.invalidateTeams()
  return res
}

/**
 * 退出团队（队员）/ 解散团队（队长）
 * @param {string} teamId
 */
async function quitTeam(teamId) {
  const res = await cloud.callFunction('quitTeam', { teamId })
  appStore.invalidateTeams()
  return res
}

// ============ 任务相关 ============

async function getTasks(filter = {}, teamId) {
  const tid = teamId || getCurrentTeamId()
  if (!tid) return []
  const statusKey = filter.status || 'all'
  return await cache.withCache('getTasks_' + tid + '_' + statusKey, 30000, async () => {
    try {
      const where = { teamId: tid }
      if (filter.status && filter.status !== 'all') {
        where.status = filter.status
      }
      return await cloud.queryCollection('tasks', where, {
        orderBy: { field: 'createdAt', direction: 'desc' }
      })
    } catch (e) {
      console.warn('[db] 获取任务失败', e)
      return []
    }
  })
}

async function getTaskDetail(taskId) {
  try {
    return await cloud.queryById('tasks', taskId)
  } catch (e) {
    console.warn('[db] 获取任务详情失败', e)
    return null
  }
}

/**
 * 创建任务到指定团队
 * @param {Object} data 任务数据，需包含 teamId
 */
async function createTask(data) {
  if (!data.teamId) {
    throw new Error('请选择发布到的团队')
  }
  cache.invalidateCache('getTasks')
  return await cloud.callFunction('createTask', data)
}

async function claimTask(taskId) {
  const res = await cloud.callFunction('claimTask', { taskId })
  appStore.invalidateTeams()
  cache.invalidateCache('getTasks')
  cache.invalidateCache('getMembers')
  return res  // res.data.user 为最新用户统计
}

async function updateTaskStatus(taskId, status) {
  if (status === 'completed') {
    const res = await cloud.callFunction('completeTask', { taskId })
    appStore.invalidateTeams()
    cache.invalidateCache('getTasks')
    cache.invalidateCache('getMembers')
    return res  // res.data.user 为最新用户统计
  }
  return await cloud.updateRecord('tasks', taskId, { status })
}

// ============ 交付物相关 ============

async function getDeliverables(taskId) {
  const cacheKey = taskId ? 'getDeliverables_task_' + taskId : 'getDeliverables_all'
  return await cache.withCache(cacheKey, 30000, async () => {
    try {
      const where = taskId ? { taskId } : {}
      return await cloud.queryCollection('deliverables', where, {
        orderBy: { field: 'uploadedAt', direction: 'desc' }
      })
    } catch (e) {
      console.warn('[db] 获取交付物失败', e)
      return []
    }
  })
}

/**
 * 按团队获取交付物（替代无参 getDeliverables 的全库扫描）
 * deliverables 表已写入 teamId 字段（见 uploadDeliverable 云函数）
 */
async function getTeamDeliverables(teamId) {
  const tid = teamId || getCurrentTeamId()
  if (!tid) return []
  return await cache.withCache('getDeliverables_team_' + tid, 30000, async () => {
    try {
      return await cloud.queryCollection('deliverables', { teamId: tid }, {
        orderBy: { field: 'uploadedAt', direction: 'desc' }
      })
    } catch (e) {
      console.warn('[db] 获取团队交付物失败', e)
      return []
    }
  })
}

/**
 * 上传交付物（真实文件上传）
 * 流程：1.上传文件到云存储 → 2.调用云函数记录信息
 */
async function uploadDeliverable(params) {
  const { taskId, fileName, filePath, isLink, linkUrl } = params

  let fileID = ''
  let size = '未知'

  // 1. 真实文件先上传到云存储
  if (!isLink && filePath) {
    try {
      const cloudPath = `deliverables/${taskId}/${Date.now()}_${fileName}`
      fileID = await cloud.uploadFile(cloudPath, filePath)
    } catch (e) {
      console.error('[db] 文件上传云存储失败', e)
      throw new Error('文件上传失败: ' + (e.errMsg || e.message || ''))
    }

    // 计算文件大小
    try {
      const fs = wx.getFileSystemManager()
      const stat = fs.statSync(filePath)
      size = formatFileSize(stat.size)
    } catch (e) {}
  }

  // 2. 调用云函数记录交付物
  // 失效所有交付物缓存（按任务和按团队），确保 taskDetail 和贡献页实时更新
  cache.invalidateCache('getDeliverables')
  const currentTeamId = getCurrentTeamId()
  if (currentTeamId) {
    cache.invalidateCache('getDeliverables_team_' + currentTeamId)
  }
  return await cloud.callFunction('uploadDeliverable', {
    taskId,
    fileName,
    fileID,
    size,
    isLink: !!isLink,
    linkUrl: linkUrl || ''
  })
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

// ============ 动态相关 ============

async function getActivities(limit = 20, teamId) {
  const tid = teamId || getCurrentTeamId()
  return await cache.withCache('getActivities_' + tid + '_' + limit, 30000, async () => {
    try {
      const where = tid ? { teamId: tid } : {}
      return await cloud.queryCollection('activities', where, {
        orderBy: { field: 'time', direction: 'desc' },
        limit
      })
    } catch (e) {
      console.warn('[db] 获取动态失败', e)
      return []
    }
  })
}

// ============ 统计相关 ============

/**
 * 纯函数：从已有 tasks/members 计算统计（零 IO，供 index 等页面复用避免重复查询）
 */
function computeStats(tasks, members) {
  return {
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
    pendingTasks: tasks.filter(t => t.status === 'pending').length,
    memberCount: members.length,
    totalContribution: members.reduce((sum, m) => sum + (m.contribution || 0), 0)
  }
}

async function getStats(teamId) {
  const tid = teamId || getCurrentTeamId()
  try {
    const [tasks, members] = await Promise.all([
      getTasks({ status: 'all' }, tid),
      getMembers(tid)
    ])
    return computeStats(tasks, members)
  } catch (e) {
    console.warn('[db] 获取统计失败', e)
    return {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      pendingTasks: 0,
      memberCount: 0,
      totalContribution: 0
    }
  }
}

module.exports = {
  getCurrentTeamId,
  setCurrentTeamId,
  getCurrentUser,
  getUserStats,
  updateUserInfo,
  getMyTeams,
  getMyTeamsWithCache,
  computeStats,
  getTeam,
  getMembers,
  createTeam,
  joinTeam,
  quitTeam,
  getTasks,
  getTaskDetail,
  createTask,
  claimTask,
  updateTaskStatus,
  getDeliverables,
  getTeamDeliverables,
  uploadDeliverable,
  getActivities,
  getStats
}
