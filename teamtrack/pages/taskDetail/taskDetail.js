// pages/taskDetail/taskDetail.js
const DB = require('../../utils/db')
const util = require('../../utils/util')
const auth = require('../../utils/auth')

Page({
  data: {
    task: null,
    deliverables: [],
    countdown: {},
    uploading: false
  },

  onLoad(options) {
    this.taskId = options.id
    this.loadDetail()
  },

  onShow() {
    if (this.taskId) this.loadDetail()
  },

  async loadDetail() {
    try {
      const task = await DB.getTaskDetail(this.taskId)
      const deliverables = await DB.getDeliverables(this.taskId)
      const countdown = util.getCountdown(task.deadline)

      const fileIcons = {
        docx: { text: 'W', color: 'rgba(30, 144, 255, 0.2)' },
        doc: { text: 'W', color: 'rgba(30, 144, 255, 0.2)' },
        pdf: { text: 'P', color: 'rgba(255, 71, 87, 0.2)' },
        fig: { text: 'F', color: 'rgba(255, 107, 53, 0.2)' },
        psd: { text: 'P', color: 'rgba(0, 60, 255, 0.2)' },
        xlsx: { text: 'X', color: 'rgba(0, 200, 100, 0.2)' },
        pptx: { text: 'P', color: 'rgba(255, 80, 0, 0.2)' },
        zip: { text: 'Z', color: 'rgba(0, 212, 170, 0.2)' },
        rar: { text: 'Z', color: 'rgba(0, 212, 170, 0.2)' },
        png: { text: 'I', color: 'rgba(150, 100, 255, 0.2)' },
        jpg: { text: 'I', color: 'rgba(150, 100, 255, 0.2)' },
        jpeg: { text: 'I', color: 'rgba(150, 100, 255, 0.2)' },
        default: { text: '📄', color: 'rgba(255, 255, 255, 0.08)' }
      }

      const processedDels = deliverables.map(d => {
        const ext = (d.fileName || '').split('.').pop().toLowerCase()
        const icon = fileIcons[ext] || fileIcons.default
        return { ...d, iconText: icon.text, iconColor: icon.color }
      })

      this.setData({
        task: {
          ...task,
          statusText: util.getStatusText(task.status),
          statusClass: util.getStatusClass(task.status)
        },
        deliverables: processedDels,
        countdown
      })
    } catch (err) {
      console.error('加载详情失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async onClaim() {
    const user = await DB.getCurrentUser()
    wx.showModal({
      title: '确认抢单',
      content: '领取后需按时完成并提交交付物，确定领取该任务吗？',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '领取中...' })
          try {
            await DB.claimTask(this.taskId)
            wx.hideLoading()
            wx.showToast({ title: '抢单成功！', icon: 'success' })
            this.loadDetail()
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: e.message || '抢单失败', icon: 'none' })
          }
        }
      }
    })
  },

  onUpload() {
    wx.showActionSheet({
      itemList: ['选择文件上传', '填写在线文档链接', '拍照上传'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.chooseFile()
        } else if (res.tapIndex === 1) {
          this.inputLink()
        } else if (res.tapIndex === 2) {
          this.chooseImage()
        }
      }
    })
  },

  // 选择文件上传
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles[0]
        this.doUpload(file.name, file.path, file.size)
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '选择文件失败', icon: 'none' })
        }
      }
    })
  },

  // 拍照/相册上传
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0]
        const fileName = `图片_${Date.now()}.${file.tempFilePath.split('.').pop()}`
        this.doUpload(fileName, file.tempFilePath, file.size)
      }
    })
  },

  // 填写在线文档链接
  inputLink() {
    wx.showModal({
      title: '在线文档链接',
      editable: true,
      placeholderText: '请粘贴文档链接（如腾讯文档、飞书等）',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm && res.content) {
          const link = res.content.trim()
          const fileName = '在线文档_' + new Date().toLocaleDateString() + '.link'
          // 链接类型无需上传文件，直接记录
          this.doUploadLink(fileName, link)
        }
      }
    })
  },

  // 执行真实文件上传
  async doUpload(fileName, filePath, fileSize) {
    if (this.data.uploading) return
    this.setData({ uploading: true })

    wx.showLoading({ title: '上传中...', mask: true })

    try {
      const user = await DB.getCurrentUser()
      const task = this.data.task

      // 格式化文件大小
      let sizeStr = '未知'
      if (fileSize) {
        if (fileSize < 1024) sizeStr = fileSize + ' B'
        else if (fileSize < 1024 * 1024) sizeStr = (fileSize / 1024).toFixed(1) + ' KB'
        else sizeStr = (fileSize / 1024 / 1024).toFixed(1) + ' MB'
      }

      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName,
        filePath,
        user
      })

      wx.hideLoading()
      wx.showToast({ title: '上传成功！', icon: 'success' })
      this.loadDetail()
    } catch (err) {
      console.error('上传失败', err)
      wx.hideLoading()
      wx.showToast({ title: err.message || '上传失败', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  // 上传在线链接（不入云存储，仅记录）
  async doUploadLink(fileName, link) {
    wx.showLoading({ title: '提交中...' })
    try {
      const user = await DB.getCurrentUser()
      const task = this.data.task

      // 直接调用云函数记录（链接类型，不走云存储）
      await DB.uploadDeliverable({
        taskId: task._id,
        taskTitle: task.title,
        fileName: fileName,
        filePath: null,
        user,
        isLink: true,
        linkUrl: link
      })

      wx.hideLoading()
      wx.showToast({ title: '提交成功！', icon: 'success' })
      this.loadDetail()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  },

  // 预览/下载交付物
  async onPreviewDeliverable(e) {
    const deliverable = e.currentTarget.dataset.item

    // 1. 在线链接类型：复制链接或直接打开
    if (deliverable.isLink && deliverable.fileUrl) {
      this.openLink(deliverable.fileUrl)
      return
    }
    // 兼容旧数据：链接存在 fileName 中（"名称 | 链接"）
    if (!deliverable.fileID && deliverable.fileName && deliverable.fileName.indexOf(' | ') !== -1) {
      const link = deliverable.fileName.split(' | ')[1]
      this.openLink(link)
      return
    }

    // 2. 无 fileID 的模拟数据
    if (!deliverable.fileID) {
      wx.showToast({ title: '该交付物无文件可预览', icon: 'none' })
      return
    }

    // 3. 图片类型：使用 wx.previewImage 全屏预览
    const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    const ext = (deliverable.fileName || '').split('.').pop().toLowerCase()
    if (imgExt.indexOf(ext) !== -1) {
      wx.showLoading({ title: '加载图片...' })
      try {
        const cloud = require('../../utils/cloud')
        const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
        wx.hideLoading()
        wx.previewImage({
          current: tempUrl,
          urls: [tempUrl]
        })
      } catch (err) {
        wx.hideLoading()
        wx.showToast({ title: '图片加载失败', icon: 'none' })
      }
      return
    }

    // 4. 其他文件：下载并用系统打开（支持菜单保存/分享）
    wx.showLoading({ title: '下载文件...', mask: true })
    try {
      const cloud = require('../../utils/cloud')
      const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
      wx.downloadFile({
        url: tempUrl,
        success: (res) => {
          wx.hideLoading()
          if (res.statusCode === 200) {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail: () => {
                wx.showToast({ title: '无法打开此文件格式', icon: 'none' })
              }
            })
          } else {
            wx.showToast({ title: '下载失败', icon: 'none' })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '获取文件失败', icon: 'none' })
    }
  },

  // 打开在线链接
  openLink(link) {
    wx.showModal({
      title: '在线文档链接',
      content: link,
      confirmText: '复制链接',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: link,
            success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
          })
        }
      }
    })
  },

  async onComplete() {
    wx.showModal({
      title: '确认完成',
      content: '确定要标记该任务为已完成吗？完成后将获得任务分值。',
      confirmColor: '#FF6B35',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          try {
            await DB.updateTaskStatus(this.taskId, 'completed')
            wx.hideLoading()
            wx.showToast({ title: '任务已完成！', icon: 'success' })
            this.loadDetail()
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: e.message || '操作失败', icon: 'none' })
          }
        }
      }
    })
  }
})