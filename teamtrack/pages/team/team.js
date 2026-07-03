// pages/team/team.js - 队伍详情页（显示当前队伍信息）
const DB = require('../../utils/db')

Page({
  data: {
    team: null,
    members: [],
    inviteCode: '------',
    isCaptain: false,
    timeline: [
      { step: 1, title: '队伍组建', statusText: '待开始', done: false, current: false },
      { step: 2, title: '需求分析', statusText: '待开始', done: false, current: false },
      { step: 3, title: '方案设计', statusText: '待开始', done: false, current: false },
      { step: 4, title: '开发实施', statusText: '待开始', done: false, current: false },
      { step: 5, title: '测试优化', statusText: '待开始', done: false, current: false },
      { step: 6, title: '提交参赛', statusText: '待开始', done: false, current: false }
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

      // 计算队伍进度（用于"完成度"显示，与时间线无关）
      const tasks = await DB.getTasks({ status: 'all' })
      const completedCount = tasks.filter(t => t.status === 'completed').length
      team.progress = tasks.length > 0
        ? Math.round((completedCount / tasks.length) * 100)
        : 0

      // 判断当前用户是否为队长
      const openid = wx.getStorageSync('openid')
      const isCaptain = team.captainId === openid

      // 时间线：基于队长设置的 currentStep 计算 done/current
      const currentStep = team.currentStep || 1
      const timeline = this.data.timeline.map((item) => {
        const done = item.step < currentStep
        const current = item.step === currentStep
        return {
          ...item,
          done,
          current,
          statusText: current ? '进行中' : (done ? '已完成' : '待开始')
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
        isCaptain,
        timeline,
        loading: false
      })
    } catch (err) {
      console.error('加载队伍信息失败', err)
      this.setData({ loading: false })
    }
  },

  // 队长点击时间线设置当前步骤
  onTimelineTap(e) {
    if (!this.data.isCaptain) {
      wx.showToast({ title: '只有队长可以修改进度', icon: 'none' })
      return
    }
    const step = e.currentTarget.dataset.step
    const title = e.currentTarget.dataset.title
    const currentStep = (this.data.team && this.data.team.currentStep) || 1

    if (step === currentStep) {
      wx.showToast({ title: '已是当前步骤', icon: 'none' })
      return
    }

    const action = step < currentStep ? '回退' : '推进'
    wx.showModal({
      title: `${action}到第${step}步`,
      content: `确定将当前进度设置为「${title}」吗？`,
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '更新中...', mask: true })
          try {
            await DB.updateTeam(this.data.team._id, { currentStep: step })
            wx.hideLoading()
            wx.showToast({ title: '已更新', icon: 'success' })
            this.loadData()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '更新失败', icon: 'none' })
          }
        }
      }
    })
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

  // 跳转到队友详情页
  goMemberDetail(e) {
    const item = e.currentTarget.dataset.item || {}
    const openid = item.openid || item.userId || ''
    if (!openid) {
      wx.showToast({ title: '无法查看该成员', icon: 'none' })
      return
    }
    const tid = this.data.team && this.data.team._id
    const params = [
      'openid=' + openid,
      'nickName=' + encodeURIComponent(item.nickName || ''),
      'role=' + (item.role || 'member'),
      'contribution=' + (item.contribution || 0),
      'completedTasks=' + (item.completedTasks || 0),
      'percentage=' + (item.percentage || 0),
      'teamId=' + (tid || '')
    ].join('&')
    wx.navigateTo({ url: '/pages/memberDetail/memberDetail?' + params })
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