// 云函数：quitTeam
// 退出队伍（队员）或解散队伍（队长）
// users 表的 contribution/completedTasks/ongoingTasks 为全局累计字段，
// 由 claimTask/completeTask 维护，因此退出/解散时需按队伍任务数据反向扣减。
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
    return { code: -1, message: '缺少队伍ID' }
  }

  try {
    // 获取队伍成员记录
    const memberRes = await db.collection('members').where({ openid, teamId }).get()
    if (memberRes.data.length === 0) {
      return { code: -1, message: '你不在该队伍中' }
    }

    const member = memberRes.data[0]
    const isCaptain = member.role === 'captain'

    if (isCaptain) {
      // ===== 队长：解散队伍 =====
      // 1. 查询队伍所有任务（用于扣减成员数据 + 清理交付物）
      const tasksRes = await db.collection('tasks').where({ teamId }).get()
      const taskIds = tasksRes.data.map(t => t._id)

      // 2. 按成员统计任务数据，反向扣减 users 表
      const statsByUser = {}
      tasksRes.data.forEach(t => {
        if (!t.assigneeId) return
        if (!statsByUser[t.assigneeId]) statsByUser[t.assigneeId] = { contribution: 0, completed: 0, ongoing: 0 }
        if (t.status === 'completed') {
          statsByUser[t.assigneeId].completed += 1
          statsByUser[t.assigneeId].contribution += (t.points || 0)
        } else if (t.status === 'in_progress') {
          statsByUser[t.assigneeId].ongoing += 1
        }
      })

      const allMemberRes = await db.collection('members').where({ teamId }).get()
      for (const m of allMemberRes.data) {
        const stats = statsByUser[m.openid] || { contribution: 0, completed: 0, ongoing: 0 }
        if (stats.contribution || stats.completed || stats.ongoing) {
          try {
            const userRes = await db.collection('users').where({ openid: m.openid }).get()
            if (userRes.data.length > 0) {
              await db.collection('users').doc(userRes.data[0]._id).update({
                data: {
                  contribution: _.inc(-stats.contribution),
                  completedTasks: _.inc(-stats.completed),
                  ongoingTasks: _.inc(-stats.ongoing)
                }
              })
            }
          } catch (e) {
            console.warn('[quitTeam] 扣减用户数据失败', m.openid, e)
          }
        }
      }

      // 3. 删除所有成员记录
      await db.collection('members').where({ teamId }).remove()

      // 4. 删除队伍所有任务，并清理交付物
      try {
        if (taskIds.length > 0) {
          await db.collection('tasks').where({ teamId }).remove()
          await db.collection('deliverables').where({ taskId: _.in(taskIds) }).remove()
        }
      } catch (e) {
        console.warn('[quitTeam] 清理任务/交付物失败', e)
      }

      // 5. 删除队伍动态
      try {
        await db.collection('activities').where({ teamId }).remove()
      } catch (e) {}

      // 6. 删除队伍记录
      await db.collection('teams').doc(teamId).remove()

      return {
        code: 0,
        action: 'dissolve',
        message: '队伍已解散'
      }
    } else {
      // ===== 队员：退出队伍 =====
      // 1. 统计该队员在该队伍的任务数据，反向扣减 users 表
      const myTasksRes = await db.collection('tasks').where({ teamId, assigneeId: openid }).get()
      let myContribution = 0, myCompleted = 0, myOngoing = 0
      myTasksRes.data.forEach(t => {
        if (t.status === 'completed') {
          myCompleted += 1
          myContribution += (t.points || 0)
        } else if (t.status === 'in_progress') {
          myOngoing += 1
        }
      })

      if (myContribution || myCompleted || myOngoing) {
        try {
          const userRes = await db.collection('users').where({ openid }).get()
          if (userRes.data.length > 0) {
            await db.collection('users').doc(userRes.data[0]._id).update({
              data: {
                contribution: _.inc(-myContribution),
                completedTasks: _.inc(-myCompleted),
                ongoingTasks: _.inc(-myOngoing)
              }
            })
          }
        } catch (e) {
          console.warn('[quitTeam] 扣减用户数据失败', e)
        }
      }

      // 2. 删除该成员记录
      await db.collection('members').doc(member._id).remove()

      // 3. 队伍成员数 -1
      try {
        const teamRes = await db.collection('teams').doc(teamId).get()
        const team = teamRes.data
        await db.collection('teams').doc(teamId).update({
          data: { memberCount: Math.max((team.memberCount || 1) - 1, 0) }
        })
      } catch (e) {}

      // 4. 释放该队员负责的进行中任务（改为待领取，让其他成员可领取）
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

      // 5. 记录动态
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
        message: '已退出队伍'
      }
    }
  } catch (err) {
    return { code: -1, message: '操作失败: ' + err.message }
  }
}
