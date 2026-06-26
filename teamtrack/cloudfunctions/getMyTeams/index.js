// 云函数：getMyTeams
// 获取当前用户加入的所有团队（按团队拆分统计直接从 tasks 表实时计算）
// 使用 aggregate 聚合统计，避免 .get() 100 条上限导致统计偏少
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()
  const _ = db.command
  const $ = db.command.aggregate

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

    // 3. 用 aggregate 按 teamId 分组统计任务数据
    //    - 已完成：status=completed 且 assigneeId=openid
    //    - 进行中：status=in_progress 且 assigneeId=openid
    //    - 贡献值：已完成任务的 points 之和
    const [completedAgg, inProgressAgg] = await Promise.all([
      db.collection('tasks').aggregate()
        .match({
          teamId: _.in(teamIds),
          assigneeId: openid,
          status: 'completed'
        })
        .group({
          _id: '$teamId',
          completed: $.sum(1),
          contribution: $.sum('$points')
        })
        .end(),
      db.collection('tasks').aggregate()
        .match({
          teamId: _.in(teamIds),
          assigneeId: openid,
          status: 'in_progress'
        })
        .group({
          _id: '$teamId',
          ongoing: $.sum(1)
        })
        .end()
    ])

    // 组装成 { teamId: { completed, ongoing, contribution } }
    const statsByTeam = {}
    ;(completedAgg.list || []).forEach(row => {
      statsByTeam[row._id] = {
        completed: row.completed || 0,
        ongoing: 0,
        contribution: row.contribution || 0
      }
    })
    ;(inProgressAgg.list || []).forEach(row => {
      if (!statsByTeam[row._id]) {
        statsByTeam[row._id] = { completed: 0, ongoing: 0, contribution: 0 }
      }
      statsByTeam[row._id].ongoing = row.ongoing || 0
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
