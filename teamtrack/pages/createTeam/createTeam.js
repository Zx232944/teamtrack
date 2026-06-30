// pages/createTeam/createTeam.js
const DB = require('../../utils/db')

Page({
  data: {
    form: {
      name: '',
      competition: '',
      description: '',
      deadline: ''
    },
    competitions: [
      '中国国际大学生创新大赛（原互联网+）',
      '挑战杯',
      '数学建模竞赛',
      '电子设计竞赛',
      'ACM/ICPC',
      '其他竞赛'
    ],
    compIndex: 0,
    today: '',
    submitting: false
  },

  onLoad() {
    const today = new Date().toISOString().split('T')[0]
    this.setData({ today })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onCompChange(e) {
    const index = e.detail.value
    this.setData({
      compIndex: index,
      'form.competition': this.data.competitions[index]
    })
  },

  onDateChange(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  onCancel() {
    wx.navigateBack()
  },

  async onSubmit() {
    const { name, competition, description, deadline } = this.data.form

    if (!name.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' })
      return
    }
    if (!competition) {
      wx.showToast({ title: '请选择参赛赛事', icon: 'none' })
      return
    }
    if (!description.trim()) {
      wx.showToast({ title: '请输入项目描述', icon: 'none' })
      return
    }
    if (!deadline) {
      wx.showToast({ title: '请选择截止日期', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      await DB.createTeam({
        ...this.data.form,
        memberCount: 1,
        progress: 0
      })
      wx.showToast({ title: '创建成功！', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      wx.showToast({ title: '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})