/**
 * 云数据库初始化数据
 *
 * 在微信开发者工具的云开发控制台中，手动创建以下集合：
 * users, teams, tasks, members, deliverables, activities
 *
 * 然后右键此文件 → 在云开发控制台运行，或手动导入初始数据
 */

// 集合定义
const collections = [
  {
    name: 'users',
    description: '用户表',
    fields: {
      _id: 'string',
      openid: 'string',
      nickName: 'string',
      avatarUrl: 'string',
      role: 'string', // captain | member
      contribution: 'number',
      completedTasks: 'number',
      ongoingTasks: 'number',
      createdAt: 'date',
      lastLoginAt: 'date'
    }
  },
  {
    name: 'teams',
    description: '团队表',
    fields: {
      _id: 'string',
      name: 'string',
      competition: 'string',
      description: 'string',
      captainId: 'string',
      memberCount: 'number',
      progress: 'number',
      deadline: 'string',
      createdAt: 'date'
    }
  },
  {
    name: 'tasks',
    description: '任务表',
    fields: {
      _id: 'string',
      teamId: 'string',
      title: 'string',
      description: 'string',
      category: 'string',
      status: 'string', // pending | in_progress | completed
      assigneeId: 'string',
      assigneeName: 'string',
      deadline: 'string',
      points: 'number',
      deliverables: 'number',
      createdBy: 'string',
      createdAt: 'date'
    }
  },
  {
    name: 'members',
    description: '团队成员表',
    fields: {
      _id: 'string',
      teamId: 'string',
      userId: 'string',
      openid: 'string',
      nickName: 'string',
      avatarUrl: 'string',
      role: 'string',
      contribution: 'number',
      completedTasks: 'number',
      ongoingTasks: 'number',
      joinDate: 'date'
    }
  },
  {
    name: 'deliverables',
    description: '交付物表',
    fields: {
      _id: 'string',
      taskId: 'string',
      teamId: 'string',
      userId: 'string',
      userName: 'string',
      fileName: 'string',
      fileUrl: 'string',
      fileID: 'string',
      version: 'number',
      size: 'string',
      uploadedAt: 'date'
    }
  },
  {
    name: 'activities',
    description: '动态表',
    fields: {
      _id: 'string',
      type: 'string', // claim | upload | complete | create
      userId: 'string',
      userName: 'string',
      taskTitle: 'string',
      taskId: 'string',
      teamId: 'string',
      time: 'date'
    }
  }
]

// 初始种子数据 - 首次使用时导入
const seedData = {
  teams: [{
    _id: 'team_001',
    name: '智创未来',
    competition: '中国国际大学生创新大赛（原互联网+）',
    captainId: '',
    memberCount: 5,
    progress: 68,
    deadline: '2025-07-20',
    description: '基于AI的智能学习助手项目，致力于为学生提供个性化学习方案。',
    createdAt: new Date('2025-03-15')
  }],
  tasks: [
    {
      _id: 'task_001',
      teamId: 'team_001',
      title: '商业计划书撰写',
      description: '完成完整的商业计划书，包含市场分析、商业模式、财务预测等部分。',
      category: '文档',
      status: 'in_progress',
      assigneeId: '',
      assigneeName: '张三',
      deadline: '2025-07-05',
      points: 50,
      deliverables: 2,
      createdBy: '',
      createdAt: new Date('2025-06-01')
    },
    {
      _id: 'task_002',
      teamId: 'team_001',
      title: '产品UI设计',
      description: '完成小程序全部页面的UI设计稿，包含首页、任务页、个人中心等。',
      category: '设计',
      status: 'completed',
      assigneeId: '',
      assigneeName: '李四',
      deadline: '2025-06-20',
      points: 40,
      deliverables: 5,
      createdBy: '',
      createdAt: new Date('2025-05-15')
    },
    {
      _id: 'task_003',
      teamId: 'team_001',
      title: '前端原型开发',
      description: '基于设计稿完成小程序前端原型开发，实现核心页面交互。',
      category: '开发',
      status: 'in_progress',
      assigneeId: '',
      assigneeName: '王五',
      deadline: '2025-07-10',
      points: 60,
      deliverables: 3,
      createdBy: '',
      createdAt: new Date('2025-06-10')
    },
    {
      _id: 'task_004',
      teamId: 'team_001',
      title: '市场调研报告',
      description: '完成目标用户调研，输出竞品分析和用户需求报告。',
      category: '调研',
      status: 'completed',
      assigneeId: '',
      assigneeName: '赵六',
      deadline: '2025-06-15',
      points: 30,
      deliverables: 1,
      createdBy: '',
      createdAt: new Date('2025-05-20')
    },
    {
      _id: 'task_005',
      teamId: 'team_001',
      title: '路演PPT制作',
      description: '制作项目路演PPT，包含项目亮点、团队介绍、发展规划等。',
      category: '文档',
      status: 'pending',
      assigneeId: null,
      assigneeName: null,
      deadline: '2025-07-15',
      points: 35,
      deliverables: 0,
      createdBy: '',
      createdAt: new Date('2025-06-25')
    },
    {
      _id: 'task_006',
      teamId: 'team_001',
      title: '后端API开发',
      description: '完成核心业务API开发，包含用户管理、任务管理、数据统计等接口。',
      category: '开发',
      status: 'in_progress',
      assigneeId: '',
      assigneeName: '张三',
      deadline: '2025-07-08',
      points: 55,
      deliverables: 2,
      createdBy: '',
      createdAt: new Date('2025-06-05')
    },
    {
      _id: 'task_007',
      teamId: 'team_001',
      title: '答辩演练',
      description: '组织团队进行模拟答辩，完善答辩话术和演示流程。',
      category: '其他',
      status: 'pending',
      assigneeId: null,
      assigneeName: null,
      deadline: '2025-07-18',
      points: 25,
      deliverables: 0,
      createdBy: '',
      createdAt: new Date('2025-06-28')
    },
    {
      _id: 'task_008',
      teamId: 'team_001',
      title: '财务预测模型',
      description: '建立详细的财务预测模型，包含收入预测、成本分析、盈亏平衡点等。',
      category: '文档',
      status: 'pending',
      assigneeId: null,
      assigneeName: null,
      deadline: '2025-07-12',
      points: 40,
      deliverables: 0,
      createdBy: '',
      createdAt: new Date('2025-06-26')
    }
  ]
}

module.exports = { collections, seedData }