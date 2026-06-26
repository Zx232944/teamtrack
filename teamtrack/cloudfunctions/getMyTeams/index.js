// 云函数：getMyTeams
// 获取当前用户加入的所有团队（按团队拆分统计直接从 tasks 表实时计算）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  const _ = db.command

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 1. 查询用户加入的所有团队成员记录
    const memberRes = await db.collection('members').where({ openid }).get()
    const memberships = memberRes.data

    if (memberships.length === 0) {
      return { code: 0, data: [] }
    }

    // 2. 批量查询团队信息
    const teamIds = memberships.map(m => m.teamId)
    const teamsResult = await db.collection('teams')
      .where({ _id: _.in(teamIds) })
      .get()

    // 3. 查询该用户在所有相关团队中的任务（按 teamId 分组统计）
    //    - 已完成：status=completed 且 assigneeId=openid
    //    - 进行中：status=in_progress 且 assigneeId=openid
    //    - 贡献值：已完成任务的 points 之和
    const [completedRes, inProgressRes] = await Promise.all([
      db.collection('tasks').where({
        teamId: _.in(teamIds),
        assigneeId: openid,
        status: 'completed'
      }).get(),
      db.collection('tasks').where({
        teamId: _.in(teamIds),
        assigneeId: openid,
        status: 'in_progress'
      }).get()
    ])

    // 按 teamId 分组统计
    const statsByTeam = {}
    ;(completedRes.data || []).forEach(t => {
      if (!statsByTeam[t.teamId]) statsByTeam[t.teamId] = { completed: 0, ongoing: 0, contribution: 0 }
      statsByTeam[t.teamId].completed += 1
      statsByTeam[t.teamId].contribution += (t.points || 0)
    })
    ;(inProgressRes.data || []).forEach(t => {
      if (!statsByTeam[t.teamId]) statsByTeam[t.teamId] = { completed: 0, ongoing: 0, contribution: 0 }
      statsByTeam[t.teamId].ongoing += 1
    })

    // 4. 组装团队信息（统计直接从 tasks 表实时计算，不依赖 members 表的预聚合字段）
    const teams = teamsResult.data.map(team => {
      const myMember = memberships.find(m => m.teamId === team._id) || {}
      const stats = statsByTeam[team._id] || { completed: 0, ongoing: 0, contribution: 0 }
      return {
        ...team,
        myRole: myMember.role || 'member',
        myContribution: stats.contribution,
        myCompletedTasks: stats.completed,
        myOngoingTasks: stats.ongoing
      }
    })

    return { code: 0, data: teams }
  } catch (err) {
    console.error('[getMyTeams] 获取失败', err)
    return { code: -1, data: [], message: err.message }
  }
}