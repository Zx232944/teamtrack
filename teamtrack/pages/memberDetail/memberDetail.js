// pages/memberDetail/memberDetail.js - 队友详情
const DB = require('../../utils/db')
const util = require('../../utils/util')

Page({
  data: {
    member: null,
    tasks: [],
    deliverables: [],
    totalDeliverables: 0,
    loading: true
  },

  onLoad(options) {
    const { openid, nickName, role, contribution, completedTasks, percentage, teamId } = options || {}
    if (!openid || !teamId) {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.teamId = teamId
    this.openid = openid

    const member = {
      nickName: decodeURIComponent(nickName || ''),
      role: role || 'member',
      contribution: Number(contribution) || 0,
      completedTasks: Number(completedTasks) || 0,
      percentage: Number(percentage) || 0
    }
    this.setData({ member })
    wx.setNavigationBarTitle({ title: member.nickName + ' 的状态' })
    this.loadData()
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [tasks, deliverables] = await Promise.all([
        DB.getMemberTasks(this.teamId, this.openid),
        DB.getMemberDeliverables(this.teamId, this.openid)
      ])

      const processedTasks = (tasks || []).map(t => ({
        ...t,
        statusText: util.getStatusText(t.status),
        statusClass: util.getStatusClass(t.status),
        createdAtText: util.formatDateTime(t.createdAt)
      }))

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
      const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      const processedDels = (deliverables || []).map(d => {
        const ext = (d.fileName || '').split('.').pop().toLowerCase()
        const icon = fileIcons[ext] || fileIcons.default
        return {
          ...d,
          iconText: icon.text,
          iconColor: icon.color,
          isImage: imgExt.indexOf(ext) !== -1,
          uploadedAtText: util.formatDateTime(d.uploadedAt)
        }
      })

      this.setData({
        tasks: processedTasks,
        deliverables: processedDels,
        totalDeliverables: processedDels.length,
        loading: false
      })
    } catch (err) {
      console.error('[memberDetail] 加载失败', err)
      this.setData({ loading: false })
    }
  },

  async onRefresh() {
    await this.loadData()
  },

  // 预览交付物（复用 contribution 逻辑）
  async onPreviewDeliverable(e) {
    const deliverable = e.currentTarget.dataset.item
    if (deliverable.isLink && deliverable.fileUrl) {
      this.openLink(deliverable.fileUrl)
      return
    }
    if (!deliverable.fileID && deliverable.fileName && deliverable.fileName.indexOf(' | ') !== -1) {
      this.openLink(deliverable.fileName.split(' | ')[1])
      return
    }
    if (!deliverable.fileID) {
      wx.showToast({ title: '该交付物无文件可预览', icon: 'none' })
      return
    }

    if (deliverable.isImage) {
      wx.showLoading({ title: '加载图片...' })
      try {
        const cloud = require('../../utils/cloud')
        const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
        wx.hideLoading()
        wx.previewImage({ current: tempUrl, urls: [tempUrl] })
      } catch (err) {
        wx.hideLoading()
        this.showFileError(err.message || '图片加载失败')
      }
      return
    }

    const tapIndex = await new Promise(resolve => {
      wx.showActionSheet({
        itemList: ['在线预览', '保存到本地'],
        success: (res) => resolve(res.tapIndex),
        fail: () => resolve(-1)
      })
    })
    if (tapIndex === -1) return

    const ext = (deliverable.fileName || '').split('.').pop().toLowerCase()
    const saveToAlbum = tapIndex === 1
    wx.showLoading({ title: saveToAlbum ? '保存中...' : '下载文件...', mask: true })
    try {
      const cloud = require('../../utils/cloud')
      const tempUrl = await cloud.getTempFileURL(deliverable.fileID)
      wx.downloadFile({
        url: tempUrl,
        success: (res) => {
          wx.hideLoading()
          if (res.statusCode !== 200) {
            this.showFileError('下载失败（HTTP ' + res.statusCode + '）')
            return
          }
          if (saveToAlbum) {
            this.saveToLocal(res.tempFilePath, ext)
          } else {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail: () => this.showFileError('无法预览此格式，可尝试"保存到本地"')
            })
          }
        },
        fail: (err) => {
          wx.hideLoading()
          this.showFileError(err.errMsg || '下载失败')
        }
      })
    } catch (err) {
      wx.hideLoading()
      this.showFileError(err.message || '获取文件失败')
    }
  },

  saveToLocal(tempFilePath, ext) {
    const imgExt = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
    if (imgExt.indexOf(ext) !== -1) {
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          if (err.errMsg && err.errMsg.indexOf('auth deny') !== -1) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启"保存到相册"权限',
              confirmText: '去设置',
              confirmColor: '#FF6B35',
              success: (r) => { if (r.confirm) wx.openSetting() }
            })
          } else {
            this.showFileError(err.errMsg || '保存失败')
          }
        }
      })
    } else {
      wx.openDocument({
        filePath: tempFilePath,
        showMenu: true,
        success: () => wx.showToast({ title: '点击右上角可保存', icon: 'none' }),
        fail: () => this.showFileError('无法打开此格式')
      })
    }
  },

  showFileError(msg) {
    wx.showModal({
      title: '文件访问失败',
      content: msg + '\n\n可能原因：\n1. 云存储权限未设为"所有用户可读"\n2. 文件已被删除',
      showCancel: true,
      cancelText: '关闭',
      confirmText: '查看设置',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '云存储权限设置',
            content: '请前往微信开发者工具 → 云开发 → 存储 → 权限设置，将规则改为：所有用户可读，仅创建者可写',
            showCancel: false,
            confirmColor: '#FF6B35'
          })
        }
      }
    })
  },

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

  // 跳转到任务详情
  goTaskDetail(e) {
    const taskId = e.currentTarget.dataset.id
    if (taskId) wx.navigateTo({ url: '/pages/taskDetail/taskDetail?id=' + taskId })
  }
})
