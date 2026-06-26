// pages/profile/profile.js
const DB = require('../../utils/db')
const auth = require('../../utils/auth')
const appStore = require('../../utils/appStore')

Page({
  data: {
    user: {},
    isLoggedIn: false,
    // 注册流程状态：'' | 'phone' | 'nickName'
    registerStep: '',
    tempNickName: '',
    tempPhoneCode: ''
  },

  onLoad() {
    this._loaded = false
    this.init()
  },

  onShow() {
    // onLoad 已执行过，onShow 刷新最新统计数据
    if (this._loaded) {
      if (auth.isLoggedIn()) {
        this.loadUser()
      } else {
        this.setData({ user: {}, isLoggedIn: false })
      }
    }
  },

  async init() {
    this._loaded = true
    // 优先使用缓存
    const cached = auth.getCachedUser()
    if (cached) {
      this.setData({ user: cached, isLoggedIn: true })
      appStore.setUser(cached)
      // 拉取最新用户信息（含 contribution 等统计字段，由 users 表维护）
      this.loadUser()
    } else {
      // 未登录（或已退出），不自动调用 login 云函数
      this.setData({ user: {}, isLoggedIn: false })
    }
  },

  // 拉取最新用户信息并刷新展示
  async loadUser() {
    if (!auth.isLoggedIn()) return
    try {
      const user = await DB.getCurrentUser()
      if (user) {
        auth.setCachedUser(user)
        appStore.setUser(user)
        this.setData({ user, isLoggedIn: true })
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  },

  /**
   * 点击"微信登录"按钮：
   * 调用 login 云函数检测是否已注册
   * - 已注册：直接登录成功
   * - 未注册：进入注册流程，弹出手机号授权
   */
  async onLogin() {
    wx.showLoading({ title: '登录中...', mask: true })
    try {
      const result = await auth.login()
      wx.hideLoading()

      if (result.isNew) {
        // 新用户：进入注册流程
        this.setData({ registerStep: 'phone' })
        return
      }

      // 老用户：直接登录
      const user = result.user
      appStore.setUser(user)
      this.setData({ user, isLoggedIn: true })
      wx.showToast({ title: '登录成功', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      if (err.message && err.message.indexOf('取消') === -1) {
        wx.showToast({ title: err.message || '登录失败', icon: 'none' })
      }
    }
  },

  /**
   * 获取手机号回调（button open-type="getPhoneNumber"）
   */
  onGetPhoneNumber(e) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '已取消手机号授权', icon: 'none' })
      return
    }
    this.setData({
      tempPhoneCode: e.detail.code,
      registerStep: 'nickName'
    })
  },

  /**
   * 跳过手机号授权（测试号或不想授权）
   */
  onSkipPhone() {
    wx.showModal({
      title: '提示',
      content: '不授权手机号将无法在团队中相互联系，确定跳过吗？',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            tempPhoneCode: '',
            registerStep: 'nickName'
          })
        }
      }
    })
  },

  onNickNameInput(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  /**
   * 提交注册
   */
  async onSubmitRegister() {
    const { tempNickName, tempPhoneCode } = this.data
    const nickName = (tempNickName || '').trim()
    if (!nickName) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    try {
      const user = await auth.register({ phoneCode: tempPhoneCode, nickName })
      appStore.setUser(user)
      this.setData({
        user,
        isLoggedIn: true,
        registerStep: '',
        tempNickName: '',
        tempPhoneCode: ''
      })
      wx.showToast({ title: '注册成功！', icon: 'success' })
    } catch (err) {
      if (err.message && err.message.indexOf('取消') === -1) {
        wx.showToast({ title: err.message || '注册失败', icon: 'none' })
      }
    }
  },

  onEditNickName() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入新的昵称',
      content: this.data.user.nickName || '',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm && res.content) {
          const nickName = res.content.trim()
          await auth.updateUser({ nickName })
          this.setData({ 'user.nickName': nickName })
          wx.showToast({ title: '修改成功', icon: 'success' })
        }
      }
    })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将清除所有团队数据，确定要退出吗？',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          auth.logout()
          this.setData({
            user: {},
            isLoggedIn: false,
            registerStep: '',
            tempNickName: '',
            tempPhoneCode: ''
          })
          wx.showToast({ title: '已退出登录', icon: 'success' })
          // 跳转到登录页（当前 profile 即登录页）
          // 不切换 tab，让用户看到登录入口
        }
      }
    })
  },

  goMyTasks() {
    wx.switchTab({ url: '/pages/tasks/tasks' })
  },

  goMyStats() {
    wx.navigateTo({ url: '/pages/myStats/myStats' })
  },

  goTeam() {
    wx.navigateTo({ url: '/pages/team/team' })
  },

  goTeams() {
    wx.navigateTo({ url: '/pages/teams/teams' })
  },

  showAbout() {
    wx.showModal({
      title: '关于赛队管家',
      content: '赛队管家 TeamTrack v1.0.0\n\n专为大学生竞赛团队打造的轻量级协作管理工具。解决进度不透明、责任推诿、队长一人焦虑的痛点，让团队管理不再依赖人情。\n\n核心功能：任务抢单、进度追踪、贡献举证、团队管理、文件版本管理（基于微信云开发）。',
      showCancel: false,
      confirmColor: '#FF6B35'
    })
  },

  showHelp() {
    wx.showModal({
      title: '使用帮助',
      content: '1. 队长创建团队，获得邀请码\n2. 队员通过邀请码加入团队\n3. 队长发布任务，设置截止时间和分值\n4. 队员在任务中心"抢单"领取任务\n5. 完成任务后上传交付物（支持文件/链接/图片）\n6. 系统自动记录贡献度和文件版本\n7. 查看排行榜了解团队贡献分布',
      showCancel: false,
      confirmColor: '#FF6B35'
    })
  }
})
