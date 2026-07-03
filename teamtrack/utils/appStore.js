/**
 * 全局共享数据缓存 - 队伍列表
 * user 缓存归 auth.js 管理，本模块只管 teams。
 * 缓存只存 getMyTeams 云函数返回的原始格式，不含 isActive/isCaptain 等派生字段。
 *
 * 数据来源：db.getMyTeamsWithCache 内部写入
 * 失效时机：写操作（createTeam/joinTeam/quitTeam/claimTask/completeTask）后由 db.js 调 invalidateTeams
 *
 * 缓存策略：内存 + storage 双层，带 TTL（60 秒）
 * - 跨设备同步：TTL 过期后自动从云端拉取，避免一端创建队伍后另一端长时间看不到
 * - storage 持久化：冷启动后 TTL 未过期仍可用，减少首屏等待
 */

const TEAM_CACHE_KEY = 'cache_teams_v2'
const TEAM_CACHE_TIME_KEY = 'cache_teams_time_v2'
const TEAM_CACHE_TTL = 60 * 1000  // 60 秒

// 内存缓存（进程级，跨页面共享，冷启动丢失）
let _teams = null
let _teamsTime = 0

/**
 * 同步读取队伍列表缓存（内存优先 → storage 回填，TTL 过期返回 null）
 * @returns {Array|null} teams，null 表示无缓存或已过期
 */
function getTeams() {
  const now = Date.now()
  if (_teams) {
    if (now - _teamsTime < TEAM_CACHE_TTL) return _teams
    _teams = null
    _teamsTime = 0
  }
  try {
    const stored = wx.getStorageSync(TEAM_CACHE_KEY)
    const storedTime = wx.getStorageSync(TEAM_CACHE_TIME_KEY) || 0
    if (stored && storedTime && (now - storedTime < TEAM_CACHE_TTL)) {
      _teams = stored
      _teamsTime = storedTime
      return _teams
    }
    // 过期清理
    if (stored) {
      wx.removeStorageSync(TEAM_CACHE_KEY)
      wx.removeStorageSync(TEAM_CACHE_TIME_KEY)
    }
  } catch (e) {}
  return null
}

/**
 * 写入队伍列表缓存（仅原始格式，拒绝派生字段）
 */
function setTeams(teams) {
  _teams = teams || []
  _teamsTime = Date.now()
  try {
    wx.setStorageSync(TEAM_CACHE_KEY, _teams)
    wx.setStorageSync(TEAM_CACHE_TIME_KEY, _teamsTime)
  } catch (e) {}
}

/**
 * 失效队伍列表缓存（写操作后调用）
 */
function invalidateTeams() {
  _teams = null
  _teamsTime = 0
  try {
    wx.removeStorageSync(TEAM_CACHE_KEY)
    wx.removeStorageSync(TEAM_CACHE_TIME_KEY)
  } catch (e) {}
}

/**
 * 清空所有缓存（退出登录时调用）
 */
function clear() {
  invalidateTeams()
}

module.exports = {
  getTeams,
  setTeams,
  invalidateTeams,
  clear
}
