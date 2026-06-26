// 云函数：login
// 仅查询登录态，不创建用户记录
// 新用户返回 isNew=true，由前端引导走注册流程（获取手机号 + 设置昵称）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境 OPENID 为空
  const openid = wxContext.OPENID || event.openid || ('dev_' + (event.tempId || 'default_user'))

  try {
    // 查询用户是否已存在
    const { data } = await db.collection('users').where({ openid }).get()

    if (data.length === 0) {
      // 新用户：不创建记录，只返回 openid 让前端引导注册
      return {
        code: 0,
        isNew: true,
        openid,
        data: null
      }
    }

    // 老用户：更新登录时间，返回用户信息
    const userInfo = data[0]
    await db.collection('users').doc(userInfo._id).update({
      data: { lastLoginAt: new Date() }
    })

    // 查询用户所在的团队，确定当前团队
    let currentTeamId = null
    try {
      const memberRes = await db.collection('members').where({ openid }).get()
      if (memberRes.data.length > 0) {
        // 优先使用本地缓存的 currentTeamId，否则取第一个团队
        const storedTeamId = event.currentTeamId
        const matched = storedTeamId
          ? memberRes.data.find(m => m.teamId === storedTeamId)
          : null
        currentTeamId = (matched && matched.teamId) || memberRes.data[0].teamId
      }
    } catch (e) {
      console.warn('[login] 查询团队成员失败', e)
    }

    return {
      code: 0,
      isNew: false,
      openid,
      currentTeamId,
      data: userInfo
    }
  } catch (err) {
    console.error('[login] 登录失败', err)
    return {
      code: -1,
      message: '登录失败: ' + err.message
    }
  }
}
