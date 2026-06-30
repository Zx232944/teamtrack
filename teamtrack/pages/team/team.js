// pages/team/team.js - 队伍详情页（显示当前队伍信息）
const DB = require('../../utils/db')

Page({
  data: {
    team: null,
    members: [],
    inviteCode: '------',
    timeline: [
      { step: 1, title: '队伍组建', date: '待定', done: false, current: true },
      { step: 2, title: '需求分析', date: '待定', done: false, current: false },
      { step: 3, title: '方案设计', date: '待定', done: false, current: false },
      { step: 4, title: '开发实施', date: '待定', done: false, current: false },
      { step: 5, title: '测试优化', date: '待定', done: false, current: false },
      { step: 6, title: '提交参赛', date: '待定', done: false, current: false }
    ],
    loading: true
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [team, members] = await Promise.all([
        DB.getTeam(),
        DB.getMembers()
      ])

      if (!team) {
        this.setData({ team: null, loading: false })
        return
      }

      // 计算队伍进度
      const tasks = await DB.getTasks({ status: 'all' })
      const completedCount = tasks.filter(t => t.status === 'completed').length
      team.progress = tasks.length > 0
        ? Math.round((completedCount / tasks.length) * 100)
        : 0

      // 根据进度更新时间线
      const progressPercent = team.progress
      const timeline = this.data.timeline.map((item, index) => {
        const stepProgress = (index + 1) / 6 * 100
        return {
          ...item,
          done: progressPercent >= stepProgress,
          current: progressPercent >= (index) / 6 * 100 && progressPercent < stepProgress
        }
      })

      const maxContribution = Math.max(...members.map(m => m.contribution || 0), 1)
      const processedMembers = members.map(m => ({
        ...m,
        percentage: Math.round(((m.contribution || 0) / maxContribution) * 100)
      }))

      this.setData({
        team,
        members: processedMembers,
        inviteCode: team.inviteCode || '------',
        timeline,
        loading: false
      })
    } catch (err) {
      console.error('加载队伍信息失败', err)
      this.setData({ loading: false })
    }
  },

  // 复制邀请码
  copyCode() {
    if (this.data.inviteCode === '------') {
      wx.showToast({ title: '暂无邀请码', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' })
      }
    })
  },

  // 邀请成员 - 通过分享小程序卡片
  onInvite() {
    if (!this.data.team) {
      wx.showToast({ title: '请先创建队伍', icon: 'none' })
      return
    }
    // 触发分享（需要 button open-type="share"）
    wx.showModal({
      title: '邀请成员',
      content: `邀请码：${this.data.inviteCode}\n\n点击右上角"..."→"转发"或下方"邀请成员"按钮分享给好友，好友打开后输入邀请码即可加入队伍。`,
      showCancel: false,
      confirmColor: '#FF6B35',
      confirmText: '知道了'
    })
  },

  // 加入其他队伍
  onJoinTeam() {
    wx.showModal({
      title: '加入队伍',
      editable: true,
      placeholderText: '请输入6位邀请码',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm && res.content) {
          const code = res.content.trim().toUpperCase()
          if (code.length !== 6) {
            wx.showToast({ title: '邀请码格式错误', icon: 'none' })
            return
          }
          wx.showLoading({ title: '加入中...' })
          try {
            await DB.joinTeam(code)
            wx.hideLoading()
            wx.showToast({ title: '加入成功！', icon: 'success' })
            this.loadData()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '加入失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 跳转到队伍管理（多队伍切换）
  goTeamsPage() {
    wx.navigateTo({ url: '/pages/teams/teams' })
  },

  // 分享邀请
  onShareAppMessage() {
    const team = this.data.team || {}
    return {
      title: `邀请你加入「${team.name || '队迹协作工具'}」队伍`,
      path: `/pages/index/index?inviteCode=${this.data.inviteCode}`,
      imageUrl: ''
    }
  },

  async onRefresh() {
    await this.loadData()
  }
})