// 云函数：register
// 完成新用户注册：获取手机号 + 设置昵称，创建用户记录
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  const openid = wxContext.OPENID || event.openid || ('dev_' + (event.tempId || 'default_user'))
  const { phoneCode, nickName } = event

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

    // 2. 通过 phoneCode 换取手机号（如果传了 code）
    let phoneInfo = null
    if (phoneCode) {
      try {
        const phoneResult = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode })
        if (phoneResult.errCode === 0 && phoneResult.phoneInfo) {
          phoneInfo = {
            phoneNumber: phoneResult.phoneInfo.phoneNumber,
            purePhoneNumber: phoneResult.phoneInfo.purePhoneNumber,
            countryCode: phoneResult.phoneInfo.countryCode
          }
        }
      } catch (e) {
        console.warn('[register] 获取手机号失败', e)
        // 测试号环境可能没权限，继续走流程，标记为未获取
      }
    }

    // 3. 创建用户记录
    const newUser = {
      openid,
      nickName: nickName.trim(),
      avatarUrl: '',
      phone: phoneInfo ? phoneInfo.phoneNumber : '',
      phoneInfo: phoneInfo,
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
