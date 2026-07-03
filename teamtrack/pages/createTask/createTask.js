// pages/createTask/createTask.js
const DB = require('../../utils/db')
const cloud = require('../../utils/cloud')

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
    submitting: false,
    attachments: [],
    uploading: false
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

  // ============ 任务附件 ============

  onAddAttachment() {
    wx.showActionSheet({
      itemList: ['选择文件', '填写在线链接', '图片上传'],
      success: (res) => {
        if (res.tapIndex === 0) this.chooseFile()
        else if (res.tapIndex === 1) this.inputLink()
        else if (res.tapIndex === 2) this.chooseImage()
      }
    })
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: (res) => {
        const file = res.tempFiles[0]
        this.doUploadAttachment('file', file.name, file.path, file.size)
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0]
        const fileName = `图片_${Date.now()}.${file.tempFilePath.split('.').pop()}`
        this.doUploadAttachment('image', fileName, file.tempFilePath, file.size)
      }
    })
  },

  inputLink() {
    wx.showModal({
      title: '在线链接',
      editable: true,
      placeholderText: '请粘贴文档链接（如腾讯文档、飞书等）',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm && res.content) {
          const link = res.content.trim()
          const fileName = '在线文档_' + new Date().toLocaleDateString() + '.link'
          this.addAttachment({
            type: 'link', fileName, fileID: '', fileUrl: link, size: '链接'
          })
        }
      }
    })
  },

  async doUploadAttachment(type, fileName, filePath, fileSize) {
    if (this.data.uploading) return
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...', mask: true })
    try {
      const cloudPath = `taskAttachments/${Date.now()}_${fileName}`
      const fileID = await cloud.uploadFile(cloudPath, filePath)
      const size = this.formatSize(fileSize)
      this.addAttachment({ type, fileName, fileID, fileUrl: '', size })
      wx.hideLoading()
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '上传失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  addAttachment(att) {
    const attachments = this.data.attachments.concat(att)
    this.setData({ attachments })
  },

  onRemoveAttachment(e) {
    const index = e.currentTarget.dataset.index
    const attachments = this.data.attachments.filter((_, i) => i !== index)
    this.setData({ attachments })
  },

  formatSize(bytes) {
    if (!bytes) return '未知'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
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
      await DB.createTask({ ...this.data.form, attachments: this.data.attachments })
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