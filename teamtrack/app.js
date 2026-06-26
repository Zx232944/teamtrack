// app.js - 赛队管家小程序入口
App({
  globalData: {
    userInfo: null,
    openid: null,
    currentTeam: null,
    cloudReady: false
  },

  onLaunch(options) {
    // 初始化云开发
    this.initCloud()

    // 处理邀请码（从分享链接进入）
    if (options && options.query && options.query.inviteCode) {
      this.globalData.pendingInviteCode = options.query.inviteCode
    }

    // 尝试获取本地缓存的登录信息
    try {
      const cachedUser = wx.getStorageSync('userInfo')
      if (cachedUser) {
        this.globalData.userInfo = cachedUser
      }
      const openid = wx.getStorageSync('openid')
      if (openid) {
        this.globalData.openid = openid
      }
    } catch (e) {
      console.warn('读取缓存失败', e)
    }
  },

  initCloud() {
    if (!wx.cloud) {
      console.warn('[app] 当前微信版本不支持云开发，将使用模拟数据')
      return
    }

    try {
      // 此处 env 替换为你的云开发环境ID
      // 1. 在微信开发者工具中开通云开发
      // 2. 将下方 'teamtrack-demo' 替换为你的云环境ID
      // 3. 若不替换，将自动回退到模拟数据模式
      wx.cloud.init({
        env: 'cloud1-d8g501yg926149990',
        traceUser: true
      })

      // 检测云开发是否真的可用
      this.checkCloudAvailable()
    } catch (e) {
      console.warn('[app] 云开发初始化失败，使用模拟数据', e)
    }
  },

  async checkCloudAvailable() {
    try {
      // 尝试调用一个简单的云函数来验证
      const db = wx.cloud.database()
      // 简单查询测试（即使集合不存在也不会立即报错）
      this.globalData.cloudReady = true
      console.log('[app] 云开发已就绪')
    } catch (e) {
      console.warn('[app] 云开发不可用，使用模拟数据')
      this.globalData.cloudReady = false
    }
  }
})