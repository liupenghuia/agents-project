const {
  createImageUploadUrl, createRecruitmentPost, getRecruitmentPost, listRecruitmentPosts,
  updateRecruitmentPost, uploadRecruitmentImage,
} = require('../../services/api');
const { validateRecruitmentPost } = require('../../utils/information');

Page({
  data: { loading: true, saving: false, error: '', saved: false, postId: '', form: { imageKeys: [] }, imagePaths: [], imageCount: 0 },

  onLoad(options) {
    this.setData({ postId: options.postId || '' });
    this.load(options.postId || '');
  },

  load(postId) {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(() => postId ? getRecruitmentPost(postId) : listRecruitmentPosts().then((posts) => posts && posts[0]))
      .then((post) => {
        if (!post) { this.setData({ loading: false }); return; }
        const imageKeys = (post.images || []).map((image) => image.objectKey);
        this.setData({ loading: false, form: { ...post, imageKeys }, imageCount: imageKeys.length });
      }).catch((error) => this.setData({ loading: false, error: error.message }));
  },

  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value, error: '', saved: false }); },

  chooseLocation() {
    wx.chooseLocation({
      success: (location) => this.setData({ 'form.locationText': location.name || location.address, 'form.latitude': location.latitude, 'form.longitude': location.longitude, error: '', saved: false }),
      fail: () => this.setData({ error: '定位未完成，请允许定位权限后重试' }),
    });
  },

  chooseImages() {
    const remaining = 6 - this.data.imageCount;
    if (remaining <= 0) { this.setData({ error: '最多上传 6 张图片' }); return; }
    wx.chooseMedia({ count: remaining, mediaType: ['image'], sourceType: ['album', 'camera'], success: ({ tempFiles }) => {
      const paths = (tempFiles || []).map((file) => file.tempFilePath);
      this.setData({ imagePaths: this.data.imagePaths.concat(paths), imageCount: this.data.imageCount + paths.length, error: '', saved: false });
    }, fail: () => this.setData({ error: '未选择图片，请重试' }) });
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const imageKeys = (this.data.form.imageKeys || []).slice();
    const imagePaths = this.data.imagePaths.slice();
    if (index < imageKeys.length) imageKeys.splice(index, 1);
    else imagePaths.splice(index - imageKeys.length, 1);
    this.setData({ 'form.imageKeys': imageKeys, imagePaths, imageCount: imageKeys.length + imagePaths.length, saved: false });
  },

  validate() {
    return validateRecruitmentPost(this.data.form, this.data.imageCount);
  },

  uploadNewImages() {
    const paths = this.data.imagePaths;
    if (!paths.length) return Promise.resolve([]);
    return paths.reduce((chain, filePath, index) => chain.then((keys) => wx.getFileInfo({ filePath }).then((info) => createImageUploadUrl({
      fileName: `recruitment-${Date.now()}-${index}.jpg`, contentType: 'image/jpeg', byteSize: info.size,
    })).then((reference) => uploadRecruitmentImage(reference.uploadUrl, filePath)).then((uploaded) => keys.concat(uploaded.objectKey))), Promise.resolve([]));
  },

  submit() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    this.setData({ saving: true, error: '', saved: false });
    this.uploadNewImages().then((newKeys) => {
      const data = { ...this.data.form, imageKeys: (this.data.form.imageKeys || []).concat(newKeys) };
      const action = this.data.postId ? updateRecruitmentPost(this.data.postId, data) : createRecruitmentPost(data);
      return action;
    }).then((post) => {
      const imageKeys = (post.images || []).map((image) => image.objectKey);
      this.setData({ saving: false, saved: true, postId: post.id, form: { ...post, imageKeys }, imagePaths: [], imageCount: imageKeys.length });
    }).catch((requestError) => this.setData({ saving: false, error: requestError.message }));
  },

  retry() { this.load(this.data.postId); },
});
