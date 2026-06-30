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
    chartData: [],
    loading: true
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
    const isFirstLoad = !this._loadedOnce
    if (isFirstLoad) this.setData({ loading: true })
    this._loadedOnce = true
    try {
      const [user, members, tasks, teamDeliverables] = await Promise.all([
        auth.getCachedUser(),
        DB.getMembers(),
        DB.getTasks({ status: 'all' }),
        DB.getTeamDeliverables()
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

      // 任务标题映射（交付物记录的 taskTitle 可能缺失）
      const taskMap = {}
      tasks.forEach(t => { taskMap[t._id] = t.title })

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
        chartData,
        loading: false
      })
    } catch (err) {
      console.error('加载贡献数据失败', err)
      this.setData({ loading: false })
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
        this.showFileError(err.message || '图片加载失败')
      }
      return
    }

    // 其他文件：弹窗选择"在线预览"或"保存到本地"
    const tapIndex = await new Promise(resolve => {
      wx.showActionSheet({
        itemList: ['在线预览', '保存到本地'],
        success: (res) => resolve(res.tapIndex),
        fail: () => resolve(-1)
      })
    })
    if (tapIndex === -1) return

    const ext = (deliverable.fileName || '').split('.').pop().toLowerCase()
    const saveToAlbum = tapIndex === 1
    wx.showLoading({ title: saveToAlbum ? '保存中...' : '下载文件...', mask: true })
    try {
      const cloud = require('../../utils/cloud')
      const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
      wx.downloadFile({
        url: tempUrl,
        success: (res) => {
          wx.hideLoading()
          if (res.statusCode !== 200) {
            this.showFileError('下载失败（HTTP ' + res.statusCode + '）')
            return
          }
          if (saveToAlbum) {
            this.saveToLocal(res.tempFilePath, ext)
          } else {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail: () => {
                this.showFileError('无法预览此格式，可尝试"保存到本地"')
              }
            })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          this.showFileError(err.errMsg || '下载失败')
        }
      })
    } catch (err) {
      wx.hideLoading()
      this.showFileError(err.message || '获取文件失败')
    }
  },

  // 保存到本地（图片走相册，其他文件走文档管理器）
  saveToLocal(tempFilePath, ext) {
    const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    if (imgExt.indexOf(ext) !== -1) {
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启"保存到相册"权限',
              confirmText: '去设置',
              confirmColor: '#FF6B35',
              success: (r) => { if (r.confirm) wx.openSetting() }
            })
          } else {
            this.showFileError(err.errMsg || '保存失败')
          }
        }
      })
    } else {
      wx.openDocument({
        filePath: tempFilePath,
        showMenu: true,
        success: () => wx.showToast({ title: '点击右上角可保存', icon: 'none' }),
        fail: () => this.showFileError('无法打开此格式')
      })
    }
  },

  // 统一的文件错误提示（带具体原因）
  showFileError(msg) {
    wx.showModal({
      title: '文件访问失败',
      content: msg + '\n\n可能原因：\n1. 云存储权限未设为"所有用户可读"\n2. 文件已被删除',
      showCancel: true,
      cancelText: '关闭',
      confirmText: '查看设置',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '云存储权限设置',
            content: '请前往微信开发者工具 → 云开发 → 存储 → 权限设置，将规则改为：所有用户可读，仅创建者可写',
            showCancel: false,
            confirmColor: '#FF6B35'
          })
        }
      }
    })
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
