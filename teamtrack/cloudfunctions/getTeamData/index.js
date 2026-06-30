// 云函数：getTeamData
// 获取队伍的完整数据（队伍信息、成员、任务、动态）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  // 兼容测试号环境
  const openid = wxContext.OPENID || event.openid || 'dev_default_user'

  try {
    // 1. 查询用户所在队伍
    let team = null
    try {
      const memberRes = await db.collection('members').where({ openid }).get()
      if (memberRes.data.length > 0) {
        const teamId = memberRes.data[0].teamId
        const teamRes = await db.collection('teams').doc(teamId).get()
        team = teamRes.data
      }
    } catch (e) {}

    // 如果用户没有队伍，尝试获取第一个队伍（演示用）
    if (!team && event.fallbackFirst !== false) {
      try {
        const teamsRes = await db.collection('teams').limit(1).get()
        if (teamsRes.data.length > 0) {
          team = teamsRes.data[0]
        }
      } catch (e) {}
    }

    if (!team) {
      return {
        code: 0,
        data: { team: null, members: [], tasks: [], activities: [] }
      }
    }

    // 2. 查询成员
    let members = []
    try {
      const membersRes = await db.collection('members').where({ teamId: team._id }).get()
      members = membersRes.data
    } catch (e) {}

    // 3. 查询任务
    let tasks = []
    try {
      const tasksRes = await db.collection('tasks').where({ teamId: team._id }).get()
      tasks = tasksRes.data
    } catch (e) {}

    // 4. 查询动态（最近20条）
    let activities = []
    try {
      const actsRes = await db.collection('activities')
        .where({ teamId: team._id })
        .orderBy('time', 'desc')
        .limit(20)
        .get()
      activities = actsRes.data
    } catch (e) {
      // 如果按 teamId 查不到，尝试查全部
      try {
        const actsRes = await db.collection('activities')
          .orderBy('time', 'desc')
          .limit(20)
          .get()
        activities = actsRes.data
      } catch (e2) {}
    }

    return {
      code: 0,
      data: { team, members, tasks, activities }
    }
  } catch (err) {
    return {
      code: -1,
      message: '获取数据失败: ' + err.message
    }
  }
}