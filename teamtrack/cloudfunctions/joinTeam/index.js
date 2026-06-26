// 云函数：joinTeam
// 通过邀请码加入团队
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    const inviteCode = (event.inviteCode || '').toUpperCase().trim()

    if (!inviteCode) {
      return { code: -1, message: '邀请码不能为空' }
    }

    // 查询团队
    const teamRes = await db.collection('teams').where({ inviteCode }).get()

    if (teamRes.data.length === 0) {
      return { code: -1, message: '邀请码无效' }
    }

    const team = teamRes.data[0]

    // 检查是否已加入
    const memberRes = await db.collection('members').where({
      teamId: team._id,
      openid
    }).get()

    if (memberRes.data.length > 0) {
      return { code: -1, message: '你已加入该团队' }
    }

    // 获取用户信息（必须已注册，不应在此自动创建）
    let user = null
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        user = userRes.data[0]
      }
    } catch (e) {}

    if (!user) {
      return { code: -1, message: '请先完成注册（登录并设置昵称）' }
    }

    // 添加成员记录
    await db.collection('members').add({
      data: {
        teamId: team._id,
        userId: user._id,
        openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl || '',
        role: 'member',
        contribution: 0,
        completedTasks: 0,
        ongoingTasks: 0,
        joinDate: new Date()
      }
    })

    // 更新团队成员数
    await db.collection('teams').doc(team._id).update({
      data: { memberCount: db.command.inc(1) }
    })

    return {
      code: 0,
      data: { teamId: team._id, teamName: team.name },
      message: '加入成功'
    }
  } catch (err) {
    return {
      code: -1,
      message: '加入失败: ' + err.message
    }
  }
}