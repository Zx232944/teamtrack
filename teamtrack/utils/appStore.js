/**
 * 全局共享数据缓存
 * 避免每个页面都重复调用云函数，由先加载数据的页面写入缓存，
 * 其他页面（如 profile / myStats）直接读取，减少云函数调用。
 *
 * 数据来源：
 * - teams：由首页/任务页/贡献页的 teamSwitcher.load() 写入
 * - user：由 profile 的 loadUser() 写入
 */

const TEAM_CACHE_KEY = 'cache_teams'
const USER_CACHE_KEY = 'userInfo'

// 内存缓存（进程级）
let _teams = null
let _user = null

/**
 * 写入团队列表缓存（含 myContribution / myCompletedTasks / myOngoingTasks）
 */
function setTeams(teams) {
  _teams = teams || []
  try {
    wx.setStorageSync(TEAM_CACHE_KEY, _teams)
  } catch (e) {}
}

/**
 * 读取团队列表缓存
 */
function getTeams() {
  if (_teams) return _teams
  try {
    _teams = wx.getStorageSync(TEAM_CACHE_KEY) || []
    return _teams
  } catch (e) {
    return []
  }
}

/**
 * 写入用户信息缓存
 */
function setUser(user) {
  _user = user || null
  if (user) {
    try {
      wx.setStorageSync(USER_CACHE_KEY, user)
    } catch (e) {}
  }
}

/**
 * 读取用户信息缓存
 */
function getUser() {
  if (_user) return _user
  try {
    _user = wx.getStorageSync(USER_CACHE_KEY) || null
    return _user
  } catch (e) {
    return null
  }
}

/**
 * 清空所有缓存（退出登录时调用）
 */
function clear() {
  _teams = null
  _user = null
  try {
    wx.removeStorageSync(TEAM_CACHE_KEY)
    wx.removeStorageSync(USER_CACHE_KEY)
  } catch (e) {}
}

module.exports = {
  setTeams,
  getTeams,
  setUser,
  getUser,
  clear
}
