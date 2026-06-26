// 云函数：updateUser
// 更新用户信息（昵称/头像等）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 只允许更新允许字段
    const allowedFields = ['nickName', 'avatarUrl']
    const updateData = {}
    allowedFields.forEach(key => {
      if (event[key] !== undefined) {
        updateData[key] = event[key]
      }
    })

    if (Object.keys(updateData).length === 0) {
      return { code: -1, message: '没有可更新的字段' }
    }

    // 查询用户
    const userRes = await db.collection('users').where({ openid }).get()
    if (userRes.data.length === 0) {
      return { code: -1, message: '用户不存在，请先注册' }
    }

    const userId = userRes.data[0]._id
    await db.collection('users').doc(userId).update({ data: updateData })

    // 同步更新 members 表中的 nickName
    if (updateData.nickName) {
      try {
        const membersRes = await db.collection('members').where({ openid }).get()
        for (const m of membersRes.data) {
          await db.collection('members').doc(m._id).update({
            data: { nickName: updateData.nickName }
          })
        }
      } catch (e) {
        console.warn('[updateUser] 同步成员表昵称失败', e)
      }
    }

    const updatedUser = { ...userRes.data[0], ...updateData }
    return { code: 0, data: updatedUser }
  } catch (err) {
    console.error('[updateUser] 更新失败', err)
    return { code: -1, message: '更新失败: ' + err.message }
  }
}
