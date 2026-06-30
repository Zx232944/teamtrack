// pages/index/index.js
const DB = require('../../utils/db')
const util = require('../../utils/util')
const teamSwitcher = require('../../utils/teamSwitcher')
const auth = require('../../utils/auth')

Page({
  data: {
    teams: [],
    currentTeamId: null,
    hasTeams: false,
    isLoggedIn: false,
    team: {},
    stats: {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      progress: 0
    },
    pendingTasks: [],
    inProgressTasks: [],
    completedTasks: [],
    rankingList: [],
    activities: [],
    loading: true  // 骨架屏控制
  },

  onLoad(options) {
    // 处理分享链接中的邀请码
    if (options && options.inviteCode) {
      this.handleInviteCode(options.inviteCode)
    }
    this.init()
  },

  // 处理邀请码：弹窗提示用户加入团队
  handleInviteCode(code) {
    if (!code) return
    wx.showModal({
      title: '收到团队邀请',
      content: `邀请码：${code}\n是否立即加入该团队？`,
      confirmText: '立即加入',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          if (!auth.isLoggedIn()) {
            wx.showToast({ title: '请先登录后加入', icon: 'none' })
            wx.switchTab({ url: '/pages/profile/profile' })
            return
          }
          wx.showLoading({ title: '加入中...' })
          try {
            await DB.joinTeam(code)
            wx.hideLoading()
            wx.showToast({ title: '加入成功', icon: 'success' })
            this.init()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '加入失败', icon: 'none' })
          }
        }
      }
    })
  },

  onShow() {
    // 退出登录后同步清除本页数据
    if (!auth.isLoggedIn()) {
      this.resetToLoggedOut()
      return
    }
    this.init()
  },

  // 重置为未登录状态的空数据
  resetToLoggedOut() {
    this.setData({
      teams: [],
      currentTeamId: null,
      hasTeams: false,
      isLoggedIn: false,
      team: {},
      stats: { total: 0, completed: 0, inProgress: 0, pending: 0, progress: 0 },
      pendingTasks: [],
      inProgressTasks: [],
      completedTasks: [],
      rankingList: [],
      activities: []
    })
  },

  onPullDownRefresh() {
    this.init().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async init() {
    if (!auth.isLoggedIn()) {
      this.resetToLoggedOut()
      return
    }
    this.setData({ isLoggedIn: true })
    await teamSwitcher.load(this)
    if (this.data.hasTeams) {
      this.loadData()
    } else {
      // 无团队时清空所有团队相关数据，避免残留
      this.setData({
        team: {},
        stats: { total: 0, completed: 0, inProgress: 0, pending: 0, progress: 0 },
        pendingTasks: [],
        inProgressTasks: [],
        completedTasks: [],
        rankingList: [],
        activities: []
      })
    }
  },

  // 团队切换回调
  onTeamChanged() {
    this.loadData()
  },

  // 切换团队
  onSwitchTeam(e) {
    const teamId = e.currentTarget.dataset.id
    teamSwitcher.switchTo(this, teamId)
  },

  // 跳转团队管理
  goTeamsPage() {
    teamSwitcher.goTeamsPage()
  },

  goCreateTeam() {
    teamSwitcher.goCreateTeam()
  },

  async loadData() {
    // 首次进入显示骨架屏，后续刷新（onShow）走 loading=false 静默更新
    const isFirstLoad = !this._loadedOnce
    if (isFirstLoad) this.setData({ loading: true })
    this._loadedOnce = true

    try {
      const [team, tasks, members, activities] = await Promise.all([
        DB.getTeam(),
        DB.getTasks(),
        DB.getMembers(),
        DB.getActivities()
      ])

      if (!team) {
        this.setData({ team: {}, stats: { total: 0, completed: 0, inProgress: 0, pending: 0, progress: 0 }, loading: false })
        return
      }

      // 纯函数计算统计，避免 getStats 内部重复查询 tasks/members
      const stats = DB.computeStats(tasks, members)
      stats.progress = stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0
      stats.total = stats.totalTasks
      stats.completed = stats.completedTasks
      stats.inProgress = stats.inProgressTasks
      stats.pending = stats.pendingTasks

      // 处理任务列表
      const pendingTasks = tasks.filter(t => t.status === 'pending').slice(0, 5)
      const inProgressTasks = tasks.filter(t => t.status === 'in_progress').map(t => {
        const countdown = util.getCountdown(t.deadline)
        return { ...t, countdownText: countdown.text, urgent: countdown.urgent }
      }).slice(0, 5)
      const completedTasks = tasks.filter(t => t.status === 'completed').slice(0, 5)

      // 处理排行榜（从已完成任务反算贡献值，避免云函数未更新时显示 0）
      const computedMembers = util.computeMemberContributions(tasks, members)
      const maxContribution = computedMembers.length > 0
        ? Math.max(...computedMembers.map(m => m.contribution || 0), 1)
        : 1
      const rankingList = computedMembers.map(m => ({
        ...m,
        percentage: Math.round(((m.contribution || 0) / maxContribution) * 100)
      })).sort((a, b) => (b.contribution || 0) - (a.contribution || 0))

      // 处理动态
      const activityTypeMap = {
        claim: '领取了任务',
        upload: '上传了交付物',
        complete: '完成了任务',
        create: '创建了任务'
      }
      const processedActivities = activities.map(a => ({
        ...a,
        typeText: activityTypeMap[a.type] || ''
      }))

      this.setData({
        team,
        stats,
        pendingTasks,
        inProgressTasks,
        completedTasks,
        rankingList,
        activities: processedActivities,
        loading: false
      })
    } catch (err) {
      console.error('加载数据失败', err)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goCreateTask() {
    if (!this.data.hasTeams) {
      wx.showToast({ title: '请先创建或加入团队', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/createTask/createTask' })
  },

  goTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  goContribution() {
    wx.switchTab({ url: '/pages/contribution/contribution' })
  },

  goTeam() {
    wx.navigateTo({ url: '/pages/team/team' })
  },

  goTaskDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/taskDetail/taskDetail?id=${id}` })
  }
})
