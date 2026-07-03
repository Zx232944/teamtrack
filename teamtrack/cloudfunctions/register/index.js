// 云函数：register
// 完成新用户注册：设置昵称，创建用户记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  const openid = wxContext.OPENID || event.openid || ('dev_' + (event.tempId || 'default_user'))
  const { nickName } = event

  if (!nickName || !nickName.trim()) {
    return { code: -1, message: '请填写昵称' }
  }

  try {
    // 1. 防止重复注册
    const existRes = await db.collection('users').where({ openid }).get()
    if (existRes.data.length > 0) {
      // 已注册，直接返回
      return {
        code: 0,
        isNew: false,
        openid,
        data: existRes.data[0]
      }
    }

    // 2. 创建用户记录
    const newUser = {
      openid,
      nickName: nickName.trim(),
      avatarUrl: '',
      role: 'member',
      contribution: 0,
      completedTasks: 0,
      ongoingTasks: 0,
      createdAt: new Date(),
      lastLoginAt: new Date()
    }
    const result = await db.collection('users').add({ data: newUser })
    const userInfo = { _id: result._id, ...newUser }

    return {
      code: 0,
      isNew: true,
      openid,
      data: userInfo
    }
  } catch (err) {
    console.error('[register] 注册失败', err)
    return {
      code: -1,
      message: '注册失败: ' + err.message
    }
  }
}
