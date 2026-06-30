// 云函数：claimTask
// 领取任务（抢单）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 检查任务状态
    const taskRes = await db.collection('tasks').doc(event.taskId).get()
    const task = taskRes.data

    if (task.status !== 'pending') {
      return { code: -1, message: '任务已被领取' }
    }

    // 获取用户信息
    let user = { nickName: '微信用户' }
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        user = userRes.data[0]
      }
    } catch (e) {}

    // 更新任务状态
    await db.collection('tasks').doc(event.taskId).update({
      data: {
        status: 'in_progress',
        assigneeId: openid,
        assigneeName: user.nickName,
        claimedAt: new Date()
      }
    })

    // 更新用户进行中任务数
    let updatedUser = null
    if (user._id) {
      try {
        await db.collection('users').doc(user._id).update({
          data: { ongoingTasks: db.command.inc(1) }
        })
        // 回查最新统计，前端用此直接更新缓存
        const refreshed = await db.collection('users').doc(user._id).get()
        updatedUser = refreshed.data
      } catch (e) {}
    }

    // 仅更新当前团队该成员的进行中任务数（多团队隔离）
    try {
      await db.collection('members').where({
        openid,
        teamId: task.teamId
      }).update({
        data: { ongoingTasks: db.command.inc(1) }
      })
    } catch (e) {}

    // 记录动态（带 teamId 以便首页按团队过滤）
    try {
      await db.collection('activities').add({
        data: {
          type: 'claim',
          userId: openid,
          userName: user.nickName,
          taskTitle: task.title,
          taskId: event.taskId,
          teamId: task.teamId,
          time: new Date()
        }
      })
    } catch (e) {}

    return { code: 0, message: '抢单成功', data: { user: updatedUser } }
  } catch (err) {
    return { code: -1, message: '领取失败: ' + err.message }
  }
}