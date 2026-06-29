// pages/contribution/contribution.js
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
    user: {},
    myContribution: 0,
    myCompletedTasks: 0,
    myRole: 'member',
    rankingList: [],
    deliverables: [],
    totalDeliverables: 0,
    chartData: []
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
      user: {},
      myContribution: 0,
      myCompletedTasks: 0,
      myRole: 'member',
      rankingList: [],
      deliverables: [],
      totalDeliverables: 0,
      chartData: []
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
      // 无团队时清空所有贡献数据，避免残留
      this.setData({
        myContribution: 0,
        myCompletedTasks: 0,
        myRole: 'member',
        rankingList: [],
        deliverables: [],
        totalDeliverables: 0,
        chartData: []
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

  goTeamsPage() {
    teamSwitcher.goTeamsPage()
  },

  goCreateTeam() {
    teamSwitcher.goCreateTeam()
  },

  async loadData() {
    try {
      const [user, members, tasks, allDeliverables] = await Promise.all([
        auth.getCachedUser(),
        DB.getMembers(),
        DB.getTasks({ status: 'all' }),
        DB.getDeliverables()
      ])

      // 从已完成任务反算贡献值，避免云函数未及时更新导致显示 0
      const computedMembers = util.computeMemberContributions(tasks, members)

      // 从当前团队的 members 中找出当前用户的信息（贡献值按团队计算）
      const openid = wx.getStorageSync('openid')
      const myMember = computedMembers.find(m => m.openid === openid) || {}

      // 处理排行榜
      const maxContribution = computedMembers.length > 0
        ? Math.max(...computedMembers.map(m => m.contribution || 0), 1)
        : 1
      const rankingList = computedMembers.map(m => ({
        ...m,
        percentage: Math.round(((m.contribution || 0) / maxContribution) * 100)
      })).sort((a, b) => (b.contribution || 0) - (a.contribution || 0))

      // 交付物按当前团队的任务过滤
      const taskIds = new Set(tasks.map(t => t._id))
      const taskMap = {}
      tasks.forEach(t => { taskMap[t._id] = t.title })
      const teamDeliverables = allDeliverables.filter(d => taskIds.has(d.taskId))

      // 处理交付物
      const fileIcons = {
        docx: { text: 'W', color: 'rgba(30, 144, 255, 0.2)' },
        pdf: { text: 'P', color: 'rgba(255, 71, 87, 0.2)' },
        fig: { text: 'F', color: 'rgba(255, 107, 53, 0.2)' },
        zip: { text: 'Z', color: 'rgba(0, 212, 170, 0.2)' },
        default: { text: '📄', color: 'rgba(255, 255, 255, 0.08)' }
      }
      const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      const processedDels = teamDeliverables.map(d => {
        const ext = (d.fileName || '').split('.').pop().toLowerCase()
        const icon = fileIcons[ext] || fileIcons.default
        const isImage = imgExt.indexOf(ext) !== -1
        return {
          ...d,
          taskTitle: d.taskTitle || taskMap[d.taskId] || '',
          iconText: icon.text,
          iconColor: icon.color,
          isImage,
          uploadedAtText: util.formatDateTime(d.uploadedAt)
        }
      })

      // 贡献趋势（按近7天统计交付物数量）
      const chartData = this.buildChartData(teamDeliverables)

      this.setData({
        user,
        myContribution: myMember.contribution || 0,
        myCompletedTasks: myMember.completedTasks || 0,
        myRole: myMember.role || 'member',
        rankingList,
        deliverables: processedDels,
        totalDeliverables: processedDels.length,
        chartData
      })
    } catch (err) {
      console.error('加载贡献数据失败', err)
    }
  },

  // 预览/下载交付物
  async onPreviewDeliverable(e) {
    const deliverable = e.currentTarget.dataset.item

    // 在线链接类型
    if (deliverable.isLink && deliverable.fileUrl) {
      this.openLink(deliverable.fileUrl)
      return
    }
    // 兼容旧数据
    if (!deliverable.fileID && deliverable.fileName && deliverable.fileName.indexOf(' | ') !== -1) {
      const link = deliverable.fileName.split(' | ')[1]
      this.openLink(link)
      return
    }
    // 无文件
    if (!deliverable.fileID) {
      wx.showToast({ title: '该交付物无文件可预览', icon: 'none' })
      return
    }

    // 图片预览
    if (deliverable.isImage) {
      wx.showLoading({ title: '加载图片...' })
      try {
        const cloud = require('../../utils/cloud')
        const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
        wx.hideLoading()
        wx.previewImage({
          current: tempUrl,
          urls: [tempUrl]
        })
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '图片加载失败', icon: 'none' })
      }
      return
    }

    // 其他文件：下载并打开
    wx.showLoading({ title: '下载文件...', mask: true })
    try {
      const cloud = require('../../utils/cloud')
      const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
      wx.downloadFile({
        url: tempUrl,
        success: (res) => {
          wx.hideLoading()
          if (res.statusCode === 200) {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail: () => {
                wx.showToast({ title: '无法打开此文件格式', icon: 'none' })
              }
            })
          } else {
            wx.showToast({ title: '下载失败', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '获取文件失败', icon: 'none' })
    }
  },

  // 打开在线链接
  openLink(link) {
    wx.showModal({
      title: '在线文档链接',
      content: link,
      confirmText: '复制链接',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: link,
            success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
          })
        }
      }
    })
  },

  // 构建最近7天交付物趋势
  buildChartData(deliverables) {
    const days = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      days.push({
        dateStr: d.toISOString().slice(0, 10),
        day: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()],
        value: 0
      })
    }
    deliverables.forEach(d => {
      const t = d.uploadedAt
      const dateStr = (t instanceof Date ? t : new Date(t)).toISOString().slice(0, 10)
      const found = days.find(x => x.dateStr === dateStr)
      if (found) found.value++
    })
    const maxVal = Math.max(...days.map(d => d.value), 1)
    return days.map(d => ({
      day: d.day,
      value: d.value,
      height: Math.round((d.value / maxVal) * 100)
    }))
  }
})
