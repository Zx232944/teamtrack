/**
 * 微信登录与用户授权工具
 *
 * 流程：
 * 1. login() 只查询是否已注册，不创建用户记录
 *    - 已注册：返回用户信息
 *    - 未注册：返回 { isNew: true, openid }，由页面引导走注册流程
 * 2. register({ phoneCode, nickName }) 完成新用户注册
 *    - 通过 button open-type="getPhoneNumber" 获取 phoneCode
 *    - 弹窗输入昵称
 *    - 调用云函数 register 创建用户记录
 */

const db = require('./db')
const appStore = require('./appStore')

// 缓存的用户信息
let _userInfo = null

/**
 * 检查本地是否已登录
 */
function isLoggedIn() {
  if (_userInfo) return true
  try {
    const cached = wx.getStorageSync('userInfo')
    if (cached) {
      _userInfo = cached
      return true
    }
  } catch (e) {}
  return false
}

/**
 * 获取缓存的用户信息
 */
function getCachedUser() {
  if (_userInfo) return _userInfo
  try {
    _userInfo = wx.getStorageSync('userInfo')
    return _userInfo
  } catch (e) {
    return null
  }
}

/**
 * 登录：仅查询用户是否已注册，不创建记录
 * @returns {Promise<{isNew: boolean, openid: string, user: object|null}>}
 */
function login() {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('当前环境不支持云开发'))
      return
    }

    wx.showLoading({ title: '登录中...', mask: true })

    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: (res) => {
        wx.hideLoading()
        if (res.result && res.result.code === 0) {
          const openid = res.result.openid
          try {
            wx.setStorageSync('openid', openid)
          } catch (e) {}

          // 新用户：不缓存 userInfo，由页面引导注册
          if (res.result.isNew) {
            resolve({ isNew: true, openid, user: null })
            return
          }

          // 老用户：缓存并返回
          const user = res.result.data
          _userInfo = user
          try {
            wx.setStorageSync('userInfo', user)
          } catch (e) {}

          // 同步当前团队
          if (res.result.currentTeamId) {
            try {
              const db = require('./db')
              db.setCurrentTeamId(res.result.currentTeamId)
            } catch (e) {}
          }

          resolve({ isNew: false, openid, user })
        } else {
          const msg = (res.result && res.result.message) || '登录失败'
          reject(new Error(msg))
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[auth] login 云函数调用失败', err)
        reject(new Error(err.errMsg || '登录失败，请检查云函数是否已部署'))
      }
    })
  })
}

/**
 * 注册新用户（获取手机号 + 设置昵称后调用）
 * @param {Object} param0
 * @param {string} param0.phoneCode - getPhoneNumber 回调拿到的 code
 * @param {string} param0.nickName - 用户输入的昵称
 */
async function register({ phoneCode, nickName }) {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '注册中...', mask: true })
    wx.cloud.callFunction({
      name: 'register',
      data: { phoneCode, nickName },
      success: (res) => {
        wx.hideLoading()
        if (res.result && res.result.code === 0) {
          const user = res.result.data
          _userInfo = user
          try {
            wx.setStorageSync('userInfo', user)
            wx.setStorageSync('openid', res.result.openid)
          } catch (e) {}
          resolve(user)
        } else {
          const msg = (res.result && res.result.message) || '注册失败'
          reject(new Error(msg))
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('[auth] register 云函数调用失败', err)
        reject(new Error(err.errMsg || '注册失败，请检查云函数是否已部署'))
      }
    })
  })
}

/**
 * 弹窗输入昵称
 */
function promptNickName(placeholder) {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '设置昵称',
      content: '请输入你在团队中的昵称，方便队友认出你',
      editable: true,
      placeholderText: placeholder || '请输入昵称',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          const nickName = res.content && res.content.trim()
          if (!nickName) {
            reject(new Error('昵称不能为空'))
            return
          }
          resolve(nickName)
        } else {
          reject(new Error('用户取消'))
        }
      }
    })
  })
}

/**
 * 更新用户信息（昵称/头像）
 */
async function updateUser(info) {
  _userInfo = { ..._userInfo, ...info }
  try {
    wx.setStorageSync('userInfo', _userInfo)
  } catch (e) {}
  return db.updateUserInfo(info)
}

/**
 * 仅更新本地缓存的用户信息（不写云数据库）
 * 用于刷新统计等只读字段后同步缓存
 */
function setCachedUser(user) {
  if (!user) return
  _userInfo = user
  try {
    wx.setStorageSync('userInfo', user)
  } catch (e) {}
}

/**
 * 失效用户缓存（写操作后由页面调用，db.js 不能 require auth 故不在此自动失效）
 */
function invalidateUser() {
  _userInfo = null
  try {
    wx.removeStorageSync('userInfo')
  } catch (e) {}
}

/**
 * 从云端拉取最新用户信息并刷新缓存
 * 替代各页面重复的 getCurrentUser + setCachedUser 模式
 */
async function refreshUser() {
  const user = await db.getCurrentUser()
  if (user) setCachedUser(user)
  return user
}

/**
 * 退出登录
 * 清除所有本地缓存，并通知全局状态
 */
function logout() {
  _userInfo = null
  try {
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('openid')
    wx.removeStorageSync('currentTeamId')
  } catch (e) {}

  // 清空共享数据缓存
  appStore.clear()

  // 同步清除全局数据
  try {
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.userInfo = null
      app.globalData.openid = null
      app.globalData.currentTeam = null
    }
  } catch (e) {}
}

/**
 * 检查是否已登录（未登录时用于各页面跳转引导）
 */
function checkLoginAndRedirect() {
  if (isLoggedIn()) return true
  wx.showModal({
    title: '未登录',
    content: '请先登录后再操作',
    confirmText: '去登录',
    confirmColor: '#FF6B35',
    showCancel: false,
    success: () => {
      wx.switchTab({ url: '/pages/profile/profile' })
    }
  })
  return false
}

module.exports = {
  isLoggedIn,
  getCachedUser,
  setCachedUser,
  invalidateUser,
  refreshUser,
  login,
  register,
  promptNickName,
  updateUser,
  logout,
  checkLoginAndRedirect
}
