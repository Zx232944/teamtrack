// 云函数：quitTeam
// 退出团队（队员）或解散团队（队长）
// 统计数据（贡献值/任务数）由 login 云函数实时从 members 表汇总，
// 因此本函数只需删除 members 记录即可，无需手动扣减 users 表。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  const _ = db.command

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'
  const teamId = event.teamId

  if (!teamId) {
    return { code: -1, message: '缺少团队ID' }
  }

  try {
    // 获取团队成员记录
    const memberRes = await db.collection('members').where({ openid, teamId }).get()
    if (memberRes.data.length === 0) {
      return { code: -1, message: '你不在该团队中' }
    }

    const member = memberRes.data[0]
    const isCaptain = member.role === 'captain'

    if (isCaptain) {
      // ===== 队长：解散团队 =====
      // 1. 删除所有成员记录
      await db.collection('members').where({ teamId }).remove()

      // 2. 删除团队所有任务，并收集任务ID用于清理交付物
      try {
        const tasksRes = await db.collection('tasks').where({ teamId }).get()
        const taskIds = tasksRes.data.map(t => t._id)
        if (taskIds.length > 0) {
          await db.collection('tasks').where({ teamId }).remove()
          await db.collection('deliverables').where({ taskId: _.in(taskIds) }).remove()
        }
      } catch (e) {
        console.warn('[quitTeam] 清理任务/交付物失败', e)
      }

      // 3. 删除团队动态
      try {
        await db.collection('activities').where({ teamId }).remove()
      } catch (e) {}

      // 4. 删除团队记录
      await db.collection('teams').doc(teamId).remove()

      return {
        code: 0,
        action: 'dissolve',
        message: '团队已解散'
      }
    } else {
      // ===== 队员：退出团队 =====
      // 1. 删除该成员记录
      await db.collection('members').doc(member._id).remove()

      // 2. 团队成员数 -1
      try {
        const teamRes = await db.collection('teams').doc(teamId).get()
        const team = teamRes.data
        await db.collection('teams').doc(teamId).update({
          data: { memberCount: Math.max((team.memberCount || 1) - 1, 0) }
        })
      } catch (e) {}

      // 3. 释放该队员负责的进行中任务（改为待领取，让其他成员可领取）
      try {
        const myInProgressRes = await db.collection('tasks').where({
          teamId,
          assigneeId: openid,
          status: 'in_progress'
        }).get()
        if (myInProgressRes.data.length > 0) {
          await db.collection('tasks').where({
            teamId,
            assigneeId: openid,
            status: 'in_progress'
          }).update({
            data: {
              status: 'pending',
              assigneeId: '',
              assigneeName: '',
              claimedAt: null
            }
          })
        }
      } catch (e) {
        console.warn('[quitTeam] 释放进行中任务失败', e)
      }

      // 4. 记录动态
      try {
        await db.collection('activities').add({
          data: {
            type: 'quit',
            userId: openid,
            userName: member.nickName || '队员',
            teamId,
            time: new Date()
          }
        })
      } catch (e) {}

      return {
        code: 0,
        action: 'quit',
        message: '已退出团队'
      }
    }
  } catch (err) {
    return { code: -1, message: '操作失败: ' + err.message }
  }
}
