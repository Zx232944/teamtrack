// 云函数：createTask
// 创建任务
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 1. 先查 user 拿 userName（供 task 冗余 createdByName 和 activity 复用）
    let userName = '微信用户'
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        userName = userRes.data[0].nickName
      }
    } catch (e) {}

    // 2. 创建任务（冗余 createdByName 便于前端直接展示）
    const result = await db.collection('tasks').add({
      data: {
        teamId: event.teamId,
        title: event.title,
        description: event.description,
        category: event.category || '其他',
        status: 'pending',
        assigneeId: null,
        assigneeName: null,
        deadline: event.deadline,
        points: event.points || 10,
        deliverables: 0,
        createdBy: openid,
        createdByName: userName,
        attachments: event.attachments || [],
        createdAt: new Date()
      }
    })

    // 3. 记录动态（复用已查到的 userName）
    try {
      await db.collection('activities').add({
        data: {
          type: 'create',
          userId: openid,
          userName,
          taskTitle: event.title,
          taskId: result._id,
          teamId: event.teamId,
          time: new Date()
        }
      })
    } catch (e) {}

    return {
      code: 0,
      data: { taskId: result._id },
      message: '任务发布成功'
    }
  } catch (err) {
    return {
      code: -1,
      message: '发布失败: ' + err.message
    }
  }
}
