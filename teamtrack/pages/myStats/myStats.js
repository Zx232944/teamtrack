// pages/myStats/myStats.js - 累计数据详情（按团队拆分）
// total 取 users 表全局累计字段；按团队分布直接调用 getMyTeams 实时统计
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
      // 优先用缓存立即渲染，后台刷新最新统计
      const cachedUser = auth.getCachedUser()
      const teams = await DB.getMyTeamsWithCache()
      const total = {
        contribution: (cachedUser && cachedUser.contribution) || 0,
        completed: (cachedUser && cachedUser.completedTasks) || 0,
        ongoing: (cachedUser && cachedUser.ongoingTasks) || 0
      }
      this.setData({
        teams: teams || [],
        total,
        loading: false,
        isLoggedIn: true
      })
      // 后台刷新用户统计（claimTask/completeTask 后 users 表字段会变）
      const user = await auth.refreshUser()
      if (user) {
        this.setData({
          total: {
            contribution: user.contribution || 0,
            completed: user.completedTasks || 0,
            ongoing: user.ongoingTasks || 0
          }
        })
      }
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
