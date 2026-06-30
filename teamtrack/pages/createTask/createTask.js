// pages/createTask/createTask.js
const DB = require('../../utils/db')

Page({
  data: {
    form: {
      title: '',
      description: '',
      category: '开发',
      deadline: '',
      points: 30,
      teamId: ''
    },
    teams: [],
    teamIndex: 0,
    categories: ['开发', '设计', '文档', '调研', '其他'],
    pointsOptions: [10, 20, 30, 40, 50, 60],
    today: '',
    submitting: false
  },

  async onLoad() {
    const today = new Date().toISOString().split('T')[0]
    this.setData({ today })

    await this.loadTeams()
  },

  async loadTeams() {
    try {
      const teams = await DB.getMyTeamsWithCache()
      if (teams.length === 0) {
        wx.showModal({
          title: '提示',
          content: '你还没有加入任何队伍，请先创建或加入队伍',
          showCancel: false,
          confirmColor: '#FF6B35',
          success: () => {
            wx.navigateBack()
          }
        })
        return
      }

      const currentTeamId = DB.getCurrentTeamId()
      let teamIndex = 0
      if (currentTeamId) {
        const idx = teams.findIndex(t => t._id === currentTeamId)
        if (idx >= 0) teamIndex = idx
      }

      this.setData({
        teams,
        teamIndex,
        'form.teamId': teams[teamIndex]._id
      })
    } catch (err) {
      console.error('加载队伍失败', err)
      wx.showToast({ title: '加载队伍失败', icon: 'none' })
    }
  },

  onTeamChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      teamIndex: index,
      'form.teamId': this.data.teams[index]._id
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onSelectCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.category })
  },

  onDateChange(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  onSelectPoints(e) {
    this.setData({ 'form.points': Number(e.currentTarget.dataset.points) })
  },

  onCancel() {
    wx.navigateBack()
  },

  async onSubmit() {
    const { title, description, deadline, teamId } = this.data.form

    if (!teamId) {
      wx.showToast({ title: '请选择发布到的队伍', icon: 'none' })
      return
    }
    if (!title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' })
      return
    }
    if (!description.trim()) {
      wx.showToast({ title: '请输入任务描述', icon: 'none' })
      return
    }
    if (!deadline) {
      wx.showToast({ title: '请选择截止时间', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await DB.createTask(this.data.form)
      wx.showToast({ title: '发布成功！', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      wx.showToast({ title: err.message || '发布失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})