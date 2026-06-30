// 云函数：completeTask
// 完成任务
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 获取任务信息
    const taskRes = await db.collection('tasks').doc(event.taskId).get()
    const task = taskRes.data

    if (task.status !== 'in_progress') {
      return { code: -1, message: '任务状态异常' }
    }

    const teamId = task.teamId
    const points = task.points || 0

    // 更新任务状态
    await db.collection('tasks').doc(event.taskId).update({
      data: {
        status: 'completed',
        completedAt: new Date()
      }
    })

    // 获取用户信息
    let user = { nickName: '微信用户' }
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        user = userRes.data[0]
      }
    } catch (e) {}

    // 更新用户总贡献度（全局）
    let updatedUser = null
    if (user._id) {
      try {
        await db.collection('users').doc(user._id).update({
          data: {
            contribution: db.command.inc(points),
            completedTasks: db.command.inc(1),
            ongoingTasks: db.command.inc(-1)
          }
        })
        // 回查最新统计，前端用此直接更新缓存
        const refreshed = await db.collection('users').doc(user._id).get()
        updatedUser = refreshed.data
      } catch (e) {
        console.warn('[completeTask] 更新用户贡献失败', e)
      }
    }

    // 仅更新当前队伍该成员的贡献度（多队伍隔离）
    try {
      const memberUpdate = await db.collection('members').where({
        openid,
        teamId
      }).update({
        data: {
          contribution: db.command.inc(points),
          completedTasks: db.command.inc(1),
          ongoingTasks: db.command.inc(-1)
        }
      })
      console.log('[completeTask] 队伍成员贡献更新', memberUpdate.stats || memberUpdate)
    } catch (e) {
      console.warn('[completeTask] 更新队伍成员贡献失败', e)
    }

    // 记录动态（带 teamId 以便首页按队伍过滤）
    try {
      await db.collection('activities').add({
        data: {
          type: 'complete',
          userId: openid,
          userName: user.nickName,
          taskTitle: task.title,
          taskId: event.taskId,
          teamId,
          time: new Date()
        }
      })
    } catch (e) {}

    return { code: 0, message: '任务已完成', data: { points, user: updatedUser } }
  } catch (err) {
    return { code: -1, message: '操作失败: ' + err.message }
  }
}