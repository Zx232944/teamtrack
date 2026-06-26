/**
 * 团队切换器公用逻辑
 * 在页面的 onLoad/onShow 中调用 teamSwitcher.load(this) 即可
 * 切换团队后会自动重新执行页面的 onLoadTeamsChanged() 方法（如存在）
 */
const DB = require('./db')
const appStore = require('./appStore')

const teamSwitcher = {
  /**
   * 加载团队列表并设置到页面 data
   * @param {Object} page 页面实例
   */
  async load(page) {
    try {
      const teams = await DB.getMyTeams()
      const currentTeamId = DB.getCurrentTeamId()

      let finalCurrent = currentTeamId
      if (!finalCurrent && teams.length > 0) {
        finalCurrent = teams[0]._id
        DB.setCurrentTeamId(finalCurrent)
      }

      const processed = teams.map(t => ({
        ...t,
        isActive: t._id === finalCurrent,
        isCaptain: t.myRole === 'captain'
      }))

      // 同步写入全局缓存，供 profile / myStats 复用
      appStore.setTeams(teams)

      page.setData({
        teams: processed,
        currentTeamId: finalCurrent,
        hasTeams: teams.length > 0
      })

      return processed
    } catch (err) {
      console.error('[teamSwitcher] 加载团队失败', err)
      page.setData({ teams: [], hasTeams: false })
      appStore.setTeams([])
      return []
    }
  },

  /**
   * 切换当前团队
   * @param {Object} page 页面实例
   * @param {string} teamId
   */
  async switchTo(page, teamId) {
    if (!teamId) return
    const currentTeamId = DB.getCurrentTeamId()
    if (teamId === currentTeamId) return

    DB.setCurrentTeamId(teamId)

    // 更新页面 data 中的 active 状态
    const teams = page.data.teams || []
    const processed = teams.map(t => ({
      ...t,
      isActive: t._id === teamId
    }))
    page.setData({ teams: processed, currentTeamId: teamId })

    wx.showToast({ title: '已切换团队', icon: 'none', duration: 800 })

    // 触发页面自定义的刷新回调
    if (typeof page.onTeamChanged === 'function') {
      page.onTeamChanged(teamId)
    } else if (typeof page.loadData === 'function') {
      // 默认调用 loadData
      page.loadData()
    } else if (typeof page.loadTasks === 'function') {
      page.loadTasks()
    } else if (typeof page.init === 'function') {
      page.init()
    }
  },

  /**
   * 跳转到团队管理页
   */
  goTeamsPage() {
    wx.navigateTo({ url: '/pages/teams/teams' })
  },

  /**
   * 跳转到创建团队页
   */
  goCreateTeam() {
    wx.navigateTo({ url: '/pages/createTeam/createTeam' })
  }
}

module.exports = teamSwitcher
