/**
 * 云开发调用封装
 */

// 检测云开发是否可用
function isCloudAvailable() {
  try {
    return typeof wx !== 'undefined' && !!wx.cloud
  } catch (e) {
    return false
  }
}

// 检测并初始化云
let _cloudReady = false
function ensureCloud() {
  if (_cloudReady) return true
  try {
    if (wx.cloud) {
      // 标记为已就绪，实际可用性由调用结果决定
      _cloudReady = true
      return true
    }
  } catch (e) {
    console.warn('[cloud] 云开发不可用，使用模拟数据')
  }
  return false
}

// 检查 app.js 是否已初始化云开发
function checkCloudInited() {
  try {
    const app = getApp()
    return app && app.globalData && app.globalData.cloudReady !== false
  } catch (e) {
    return true
  }
}

/**
 * 调用云函数
 */
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (res.result && res.result.code === 0) {
          resolve(res.result.data || res.result)
        } else {
          reject(new Error(res.result ? res.result.message : '云函数调用失败'))
        }
      },
      fail: (err) => reject(err)
    })
  })
}

/**
 * 直接查询云数据库
 */
function queryCollection(collection, where = {}, options = {}) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    const db = wx.cloud.database()
    let query = db.collection(collection)

    if (Object.keys(where).length > 0) {
      query = query.where(where)
    }

    if (options.orderBy) {
      query = query.orderBy(options.orderBy.field, options.orderBy.direction || 'desc')
    }

    if (options.limit) {
      query = query.limit(options.limit)
    }

    query.get({
      success: (res) => resolve(res.data || []),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 通过ID查询单条记录
 */
function queryById(collection, id) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    const db = wx.cloud.database()
    db.collection(collection).doc(id).get({
      success: (res) => resolve(res.data),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 新增记录
 */
function addRecord(collection, data) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    const db = wx.cloud.database()
    db.collection(collection).add({
      data: {
        ...data,
        createdAt: data.createdAt || new Date()
      },
      success: (res) => resolve({ _id: res._id, ...data }),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 更新记录
 */
function updateRecord(collection, id, data) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    const db = wx.cloud.database()
    db.collection(collection).doc(id).update({
      data,
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 上传文件到云存储
 * @param {string} cloudPath 云存储路径
 * @param {string} filePath 本地文件路径
 */
function uploadFile(cloudPath, filePath) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 删除云存储文件
 */
function deleteFile(fileID) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    wx.cloud.deleteFile({
      fileList: [fileID],
      success: (res) => resolve(res),
      fail: (err) => reject(err)
    })
  })
}

/**
 * 获取临时下载链接
 */
function getTempFileURL(fileID) {
  return new Promise((resolve, reject) => {
    if (!ensureCloud()) {
      return reject(new Error('CLOUD_UNAVAILABLE'))
    }
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => resolve(res.fileList[0].tempFileURL),
      fail: (err) => reject(err)
    })
  })
}

module.exports = {
  isCloudAvailable,
  ensureCloud,
  callFunction,
  queryCollection,
  queryById,
  addRecord,
  updateRecord,
  uploadFile,
  deleteFile,
  getTempFileURL
}