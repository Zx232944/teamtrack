// pages/myStats/myStats.js - 累计数据详情（按团队拆分）
// 直接复用全局缓存（由首页/任务页/贡献页加载），不再单独请求云函数
const appStore = require('../../utils/appStore')
const auth = require('../../utils/auth')
const DB = require('../../utils/db')

Page({
  data: {
    teams: [],
    total: {
      contribution: 0,
      completed: 0,
      ongoing: 0
    },
    loading: true,
    isLoggedIn: true
  },

  onLoad() {
    // 首次加载由 onShow 统一触发
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData()
    wx.stopPullDownRefresh()
  },

  async loadData() {
    if (!auth.isLoggedIn()) {
      this.setData({ isLoggedIn: false, loading: false, teams: [], total: { contribution: 0, completed: 0, ongoing: 0 } })
      return
    }
    this.setData({ loading: true })
    try {
      // user.contribution 等来自 users 表（由 claimTask/completeTask 维护）
      const user = await DB.getCurrentUser()
      // 直接调用 getMyTeams 拿按团队拆分（不走缓存，确保数据最新）
      const teams = await DB.getMyTeams()
      appStore.setTeams(teams)
      console.log('[myStats] user=', user, 'teams=', teams)
      const total = {
        contribution: (user && user.contribution) || 0,
        completed: (user && user.completedTasks) || 0,
        ongoing: (user && user.ongoingTasks) || 0
      }
      this.setData({
        teams: teams || [],
        total,
        loading: false,
        isLoggedIn: true
      })
    } catch (err) {
      console.error('[myStats] 加载失败', err)
      this.setData({ loading: false, teams: [] })
    }
  },

  // 跳转到团队详情
  goTeamDetail(e) {
    const teamId = e.currentTarget.dataset.id
    if (teamId) {
      DB.setCurrentTeamId(teamId)
      wx.navigateTo({ url: '/pages/team/team' })
    }
  },

  // 跳转到贡献页查看该团队排行
  goContribution(e) {
    const teamId = e.currentTarget.dataset.id
    if (teamId) {
      DB.setCurrentTeamId(teamId)
      wx.switchTab({ url: '/pages/contribution/contribution' })
    }
  }
})
