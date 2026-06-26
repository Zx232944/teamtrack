// 云函数：uploadDeliverable
// 记录交付物信息（文件已通过客户端 wx.cloud.uploadFile 上传到云存储）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    const { taskId, fileName, fileID, size, isLink, linkUrl } = event

    // 查询当前版本号
    let version = 1
    try {
      const existing = await db.collection('deliverables').where({ taskId }).get()
      version = existing.data.length + 1
    } catch (e) {}

    // 获取用户名
    let userName = '微信用户'
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        userName = userRes.data[0].nickName
      }
    } catch (e) {}

    // 查询任务以获取 teamId 和标题
    let task = null
    try {
      const taskRes = await db.collection('tasks').doc(taskId).get()
      task = taskRes.data
    } catch (e) {}

    // 写入交付物记录
    const record = await db.collection('deliverables').add({
      data: {
        taskId,
        teamId: task ? task.teamId : '',
        userId: openid,
        userName,
        fileName,
        fileID: fileID || '',
        fileUrl: linkUrl || '',
        isLink: !!isLink,
        version,
        size: size || '未知',
        uploadedAt: new Date()
      }
    })

    // 更新任务的交付物计数
    try {
      if (task) {
        await db.collection('tasks').doc(taskId).update({
          data: { deliverables: (task.deliverables || 0) + 1 }
        })

        // 记录动态（带 teamId）
        await db.collection('activities').add({
          data: {
            type: 'upload',
            userId: openid,
            userName,
            taskTitle: task.title,
            taskId,
            teamId: task.teamId,
            time: new Date()
          }
        })
      }
    } catch (e) {}

    return {
      code: 0,
      data: { _id: record._id, version },
      message: '上传成功'
    }
  } catch (err) {
    return {
      code: -1,
      message: '上传失败: ' + err.message
    }
  }
}