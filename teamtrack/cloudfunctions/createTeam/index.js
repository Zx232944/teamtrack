// 云函数：createTeam
// 创建队伍，并自动将创建者设为队长
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境 OPENID 为空
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 生成邀请码（6位）
    const inviteCode = generateInviteCode()

    // 1. 创建队伍
    const teamResult = await db.collection('teams').add({
      data: {
        name: event.name,
        competition: event.competition,
        description: event.description || '',
        deadline: event.deadline || '',
        captainId: openid,
        memberCount: 1,
        progress: 0,
        inviteCode,
        createdAt: new Date()
      }
    })

    // 2. 查询用户信息（用户必须已注册，不应在此自动创建）
    let user = { nickName: '队长' }
    try {
      const userRes = await db.collection('users').where({ openid }).get()
      if (userRes.data.length > 0) {
        user = userRes.data[0]
      } else {
        // 用户未注册，不应该能创建队伍
        return {
          code: -1,
          message: '请先完成注册（登录并设置昵称）'
        }
      }
    } catch (e) {
      console.warn('[createTeam] 查询用户失败', e)
    }

    // 3. 添加队长为队伍成员
    await db.collection('members').add({
      data: {
        teamId: teamResult._id,
        userId: user._id,
        openid,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl || '',
        role: 'captain',
        contribution: 0,
        completedTasks: 0,
        ongoingTasks: 0,
        joinDate: new Date()
      }
    })

    // 4. 更新用户角色为队长
    if (user._id) {
      try {
        await db.collection('users').doc(user._id).update({
          data: { role: 'captain' }
        })
      } catch (e) {}
    }

    return {
      code: 0,
      data: {
        teamId: teamResult._id,
        inviteCode
      },
      message: '队伍创建成功'
    }
  } catch (err) {
    return {
      code: -1,
      message: '创建失败: ' + err.message
    }
  }
}

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}