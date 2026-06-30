// 工具函数

// 格式化日期
function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  const now = new Date()
  const diff = d - now
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return '已逾期'
  if (days === 0) return '今天截止'
  if (days === 1) return '明天截止'
  if (days <= 7) return `剩余${days}天`

  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}月${day}日`
}

// 格式化日期时间
function formatDateTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

// 计算倒计时
function getCountdown(deadline) {
  if (!deadline) return ''
  const d = new Date(deadline)
  const now = new Date()
  const diff = d - now

  if (diff < 0) return { text: '已逾期', urgent: true, expired: true }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days <= 1) return { text: `${days}天${hours}小时`, urgent: true, expired: false }
  return { text: `剩余${days}天`, urgent: false, expired: false }
}

// 生成唯一ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}

// 获取状态文本
function getStatusText(status) {
  const map = {
    pending: '待领取',
    in_progress: '进行中',
    completed: '已完成',
    expired: '已逾期'
  }
  return map[status] || status
}

// 获取状态标签样式
function getStatusClass(status) {
  const map = {
    pending: 'tag-yellow',
    in_progress: 'tag-blue',
    completed: 'tag-green',
    expired: 'tag-red'
  }
  return map[status] || 'tag-blue'
}

/**
 * 从已完成任务反算每个成员的贡献值和完成数
 * @param {Array} tasks - 当前队伍的全部任务
 * @param {Array} members - 当前队伍的成员列表
 * @returns {Array} 合并了贡献值的成员列表
 */
function computeMemberContributions(tasks, members) {
  if (!Array.isArray(tasks) || !Array.isArray(members)) {
    return members || []
  }

  // 只统计已完成的任务
  const completedTasks = tasks.filter(t => t.status === 'completed')

  // 按任务的 assigneeId / assignee 归集
  const contributionMap = {}
  completedTasks.forEach(t => {
    const key = t.assigneeId || t.assignee || ''
    if (!key) return
    if (!contributionMap[key]) {
      contributionMap[key] = { contribution: 0, completedTasks: 0 }
    }
    contributionMap[key].contribution += (t.points || 0)
    contributionMap[key].completedTasks += 1
  })

  // 合并到 members 上：若云端数据为 0 或缺失，则使用反算结果
  return members.map(m => {
    const key = m.openid || m.userId || ''
    const computed = contributionMap[key] || { contribution: 0, completedTasks: 0 }
    const storedContribution = m.contribution || 0
    const storedCompleted = m.completedTasks || 0
    return {
      ...m,
      // 取云端与反算中的较大值，避免云函数未更新时显示 0
      contribution: Math.max(storedContribution, computed.contribution),
      completedTasks: Math.max(storedCompleted, computed.completedTasks)
    }
  })
}

module.exports = {
  formatDate,
  formatDateTime,
  getCountdown,
  genId,
  getStatusText,
  getStatusClass,
  computeMemberContributions
}