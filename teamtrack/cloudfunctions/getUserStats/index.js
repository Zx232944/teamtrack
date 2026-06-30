// 云函数：getUserStats
// 轻量级：仅查询 users 表，不做团队查询，比 login 云函数轻 50%+
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    const { data } = await db.collection('users').where({ openid }).get()

    if (data.length === 0) {
      return { code: 0, data: null }
    }

    return { code: 0, data: data[0] }
  } catch (err) {
    console.error('[getUserStats] 查询失败', err)
    return { code: -1, message: err.message }
  }
}
