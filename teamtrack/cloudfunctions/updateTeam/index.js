// 云函数：updateTeam
// 队长更新队伍信息（目前仅支持 currentStep 时间线进度）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const db = cloud.database()

  const openid = wxContext.OPENID || event.openid || 'dev_default_user'
  const { teamId, currentStep } = event

  if (!teamId) {
    return { code: -1, message: '缺少队伍 ID' }
  }

  try {
    // 1. 查询队伍并鉴权（仅队长可修改）
    let team
    try {
      const teamRes = await db.collection('teams').doc(teamId).get()
      team = teamRes.data
    } catch (e) {
      return { code: -1, message: '队伍不存在' }
    }

    if (!team) {
      return { code: -1, message: '队伍不存在' }
    }

    if (team.captainId !== openid) {
      return { code: -1, message: '只有队长可以修改进度' }
    }

    // 2. 校验 currentStep 范围（1-6）
    const step = Number(currentStep)
    if (!Number.isInteger(step) || step < 1 || step > 6) {
      return { code: -1, message: '步骤值无效' }
    }

    // 3. 更新队伍
    await db.collection('teams').doc(teamId).update({
      data: { currentStep: step }
    })

    return {
      code: 0,
      data: { currentStep: step },
      message: '进度已更新'
    }
  } catch (err) {
    return {
      code: -1,
      message: '更新失败: ' + err.message
    }
  }
}
