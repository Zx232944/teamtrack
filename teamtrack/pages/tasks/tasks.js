// pages/tasks/tasks.js
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
    tasks: [],
    filteredTasks: [],
    currentFilter: 'all',
    loading: true,
    refreshing: false,
    allCount: 0,
    pendingCount: 0,
    inProgressCount: 0,
    completedCount: 0
  },

  onLoad() {
    this.init()
  },

  onShow() {
    if (!auth.isLoggedIn()) {
      this.resetToLoggedOut()
      return
    }
    this.init()
  },

  resetToLoggedOut() {
    this.setData({
      teams: [],
      currentTeamId: null,
      hasTeams: false,
      isLoggedIn: false,
      tasks: [],
      filteredTasks: [],
      loading: false,
      allCount: 0,
      pendingCount: 0,
      inProgressCount: 0,
      completedCount: 0
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
      this.loadTasks()
    } else {
      // 无团队时清空所有任务数据，避免残留
      this.setData({
        loading: false,
        tasks: [],
        filteredTasks: [],
        allCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        completedCount: 0
      })
    }
  },

  // 团队切换回调
  onTeamChanged() {
    this.loadTasks()
  },

  // 切换团队
  onSwitchTeam(e) {
    const teamId = e.currentTarget.dataset.id
    teamSwitcher.switchTo(this, teamId)
  },

  goTeamsPage() {
    teamSwitcher.goTeamsPage()
  },

  goCreateTeam() {
    teamSwitcher.goCreateTeam()
  },

  async loadTasks() {
    if (!this.data.hasTeams) {
      this.setData({ tasks: [], filteredTasks: [], loading: false })
      return
    }
    // 首次加载显示骨架屏，后续 onShow 刷新静默进行
    const isFirstLoad = !this._tasksLoadedOnce
    this.setData({ loading: isFirstLoad })
    this._tasksLoadedOnce = true
    try {
      const tasks = await DB.getTasks()
      const processed = tasks.map(t => {
        const countdown = util.getCountdown(t.deadline)
        return {
          ...t,
          statusText: util.getStatusText(t.status),
          statusClass: util.getStatusClass(t.status),
          countdownText: countdown.text,
          urgent: countdown.urgent
        }
      })

      const counts = {
        allCount: tasks.length,
        pendingCount: tasks.filter(t => t.status === 'pending').length,
        inProgressCount: tasks.filter(t => t.status === 'in_progress').length,
        completedCount: tasks.filter(t => t.status === 'completed').length
      }

      this.setData({
        tasks: processed,
        ...counts,
        loading: false
      })

      this.applyFilter()
    } catch (err) {
      console.error('加载任务失败', err)
      this.setData({ loading: false })
    }
  },

  onFilter(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({ currentFilter: filter })
    this.applyFilter()
  },

  applyFilter() {
    const { tasks, currentFilter } = this.data
    let filtered = tasks
    if (currentFilter !== 'all') {
      filtered = tasks.filter(t => t.status === currentFilter)
    }
    this.setData({ filteredTasks: filtered })
  },

  async onRefresh() {
    this.setData({ refreshing: true })
    await this.loadTasks()
    this.setData({ refreshing: false })
  },

  goTaskDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/taskDetail/taskDetail?id=${id}` })
  },

  goCreateTask() {
    if (!this.data.hasTeams) {
      wx.showToast({ title: '请先创建或加入团队', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/createTask/createTask' })
  },

  async onClaimTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认抢单',
      content: '领取后需按时完成并提交交付物，确定领取该任务吗？',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '领取中...' })
          try {
            const res = await DB.claimTask(id)
            // 乐观更新：立即更新本地任务状态
            const tasks = this.data.tasks.map(t =>
              t._id === id ? { ...t, status: 'in_progress', statusText: '进行中', statusClass: 'status-in_progress' } : t
            )
            this.setData({ tasks })
            this.applyFilter()
            // 云函数已返回最新用户统计，直接更新缓存，省一次 getUserStats 调用
            if (res && res.user) {
              auth.setCachedUser(res.user)
            }
            wx.hideLoading()
            wx.showToast({ title: '抢单成功！', icon: 'success' })
            this.loadTasks()
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: e.message || '抢单失败', icon: 'none' })
          }
        }
      }
    })
  }
})
