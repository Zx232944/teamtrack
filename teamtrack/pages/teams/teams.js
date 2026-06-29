// pages/teams/teams.js - 多团队管理
const DB = require('../../utils/db')

Page({
  data: {
    teams: [],
    currentTeamId: null,
    loading: true
  },

  onLoad() {
    this._loaded = false
    this._force = false
    this.loadTeams()
  },

  onShow() {
    // 避免与 onLoad 重复请求，仅在实际需要刷新时加载
    if (this._loaded) {
      this._force = false
      this.loadTeams()
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this._force = true
    await this.loadTeams()
    wx.stopPullDownRefresh()
  },

  async loadTeams() {
    this.setData({ loading: true })
    this._loaded = true
    try {
      const teams = await DB.getMyTeamsWithCache(this._force)
      const currentTeamId = DB.getCurrentTeamId()

      // 如果没设置当前团队但有团队数据，默认选第一个
      let finalCurrent = currentTeamId
      if (!finalCurrent && teams.length > 0) {
        finalCurrent = teams[0]._id
        DB.setCurrentTeamId(finalCurrent)
      }

      // 标记当前选中的团队
      const processed = teams.map(t => ({
        ...t,
        isCurrent: t._id === finalCurrent,
        createdAtText: formatDate(t.createdAt)
      }))

      this.setData({
        teams: processed,
        currentTeamId: finalCurrent,
        loading: false
      })
    } catch (err) {
      console.error('加载团队列表失败', err)
      this.setData({ loading: false })
    }
  },

  // 切换当前团队
  onSwitchTeam(e) {
    const teamId = e.currentTarget.dataset.id
    if (teamId === this.data.currentTeamId) return
    DB.setCurrentTeamId(teamId)
    // 仅更新 isCurrent 标记，无需重新请求列表
    const teams = this.data.teams.map(t => ({
      ...t,
      isCurrent: t._id === teamId
    }))
    this.setData({ teams, currentTeamId: teamId })
    wx.showToast({ title: '已切换团队', icon: 'success', duration: 800 })
  },

  // 进入团队详情
  goTeamDetail(e) {
    const teamId = e.currentTarget.dataset.id
    DB.setCurrentTeamId(teamId)
    wx.navigateTo({ url: '/pages/team/team' })
  },

  // 创建新团队
  goCreateTeam() {
    wx.navigateTo({ url: '/pages/createTeam/createTeam' })
  },

  // 通过邀请码加入
  onJoinByCode() {
    wx.showModal({
      title: '加入团队',
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
            wx.showToast({ title: '加入成功', icon: 'success' })
            this.loadTeams()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '加入失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 复制邀请码
  onCopyInviteCode(e) {
    const code = e.currentTarget.dataset.code
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '邀请码已复制', icon: 'success' })
      }
    })
  },

  // 微信邀请好友（分享卡片，带当前点击的团队邀请码）
  onShareAppMessage(e) {
    const data = (e && e.target && e.target.dataset) || {}
    const teamName = data.name || '我的团队'
    const inviteCode = data.code || ''
    let title = `邀请你加入"${teamName}"`
    if (inviteCode) {
      title += `（邀请码：${inviteCode}）`
    }
    return {
      title,
      path: `/pages/index/index?inviteCode=${inviteCode}`,
      imageUrl: ''
    }
  },

  // 队长：解散团队
  onDissolveTeam(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '解散团队',
      content: `确定要解散团队"${name}"吗？所有成员、任务和交付物将被永久删除，且无法恢复。`,
      confirmText: '确认解散',
      confirmColor: '#FF4757',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '解散中...', mask: true })
          try {
            const result = await DB.quitTeam(id)
            wx.hideLoading()
            if (result && result.code === 0) {
              // 如果解散的是当前团队，清除当前团队ID
              if (id === this.data.currentTeamId) {
                DB.setCurrentTeamId('')
              }
              wx.showToast({ title: '团队已解散', icon: 'success' })
              this.loadTeams()
            } else {
              wx.showToast({ title: (result && result.message) || '解散失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '解散失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 队员：退出团队
  onQuitTeam(e) {
    const { id, name } = e.currentTarget.dataset
    wx.showModal({
      title: '退出团队',
      content: `确定要退出团队"${name}"吗？退出后将无法查看该团队的任务和贡献。`,
      confirmText: '确认退出',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true })
          try {
            const result = await DB.quitTeam(id)
            wx.hideLoading()
            if (result && result.code === 0) {
              // 如果退出的是当前团队，清除当前团队ID
              if (id === this.data.currentTeamId) {
                DB.setCurrentTeamId('')
              }
              wx.showToast({ title: '已退出团队', icon: 'success' })
              this.loadTeams()
            } else {
              wx.showToast({ title: (result && result.message) || '退出失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            wx.showToast({ title: err.message || '退出失败', icon: 'none' })
          }
        }
      }
    })
  }
})

function formatDate(d) {
  if (!d) return ''
  const date = new Date(d)
  if (isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
