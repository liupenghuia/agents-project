const imageTypes = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

function imageContentType(filePath) {
  const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(String(filePath || ''));
  return imageTypes[(match && match[1] || '').toLowerCase()] || 'image/jpeg';
}

function getFileInfo(filePath, platform = wx) {
  return new Promise((resolve, reject) => {
    platform.getFileInfo({ filePath, success: resolve, fail: () => reject(new Error('无法读取图片信息，请重新选择')) });
  });
}

module.exports = { getFileInfo, imageContentType };
