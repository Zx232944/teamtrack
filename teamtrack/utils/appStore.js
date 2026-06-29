/**
 * 全局共享数据缓存 - 团队列表
 * user 缓存归 auth.js 管理，本模块只管 teams。
 * 缓存只存 getMyTeams 云函数返回的原始格式，不含 isActive/isCaptain 等派生字段。
 *
 * 数据来源：db.getMyTeamsWithCache 内部写入
 * 失效时机：写操作（createTeam/joinTeam/quitTeam/claimTask/completeTask）后由 db.js 调 invalidateTeams
 */

const TEAM_CACHE_KEY = 'cache_teams_v2'

// 内存缓存（进程级，跨页面共享，冷启动丢失）
let _teams = null

/**
 * 同步读取团队列表缓存（内存优先 → storage 回填）
 * @returns {Array|null} teams，null 表示无缓存
 */
function getTeams() {
  if (_teams) return _teams
  try {
    _teams = wx.getStorageSync(TEAM_CACHE_KEY) || null
    return _teams
  } catch (e) {
    return null
  }
}

/**
 * 写入团队列表缓存（仅原始格式，拒绝派生字段）
 */
function setTeams(teams) {
  _teams = teams || []
  try {
    wx.setStorageSync(TEAM_CACHE_KEY, _teams)
  } catch (e) {}
}

/**
 * 失效团队列表缓存（写操作后调用）
 */
function invalidateTeams() {
  _teams = null
  try {
    wx.removeStorageSync(TEAM_CACHE_KEY)
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
