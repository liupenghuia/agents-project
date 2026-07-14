const {
  createImageUploadUrl, createRecruitmentPost, disableRecruitmentPost, getRecruitmentPost,
  updateRecruitmentPost, uploadRecruitmentImage,
} = require('../../services/api');
const { validateRecruitmentPost } = require('../../utils/information');
const { getFileInfo, imageContentType } = require('../../utils/media');
const { ownerStatusView, savedMessage } = require('../../utils/market-status');

Page({
  data: { loading: true, saving: false, disabling: false, error: '', saved: false, savedMessage: '', postId: '', form: { imageKeys: [] }, statusView: {}, existingImages: [], imagePaths: [], imageCount: 0 },

  onLoad(options) {
    this.setData({ postId: options.postId || '' });
    this.load(options.postId || '');
  },

  load(postId) {
    this.setData({ loading: true, error: '' });
    getApp().ensureSession().then(() => postId ? getRecruitmentPost(postId) : null)
      .then((post) => {
        if (!post) { this.setData({ loading: false, statusView: ownerStatusView({}, false) }); return; }
        const imageKeys = (post.images || []).map((image) => image.objectKey);
        this.setData({ loading: false, form: { ...post, imageKeys }, statusView: ownerStatusView(post, true), existingImages: post.images || [], imageCount: imageKeys.length });
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
    const kind = event.currentTarget.dataset.kind;
    const imageKeys = (this.data.form.imageKeys || []).slice();
    const existingImages = this.data.existingImages.slice();
    const imagePaths = this.data.imagePaths.slice();
    if (kind === 'existing') { imageKeys.splice(index, 1); existingImages.splice(index, 1); }
    else imagePaths.splice(index, 1);
    this.setData({ 'form.imageKeys': imageKeys, existingImages, imagePaths, imageCount: imageKeys.length + imagePaths.length, error: '', saved: false });
  },

  validate() {
    return validateRecruitmentPost(this.data.form, this.data.imageCount);
  },

  uploadNewImages() {
    const paths = this.data.imagePaths;
    if (!paths.length) return Promise.resolve([]);
    return paths.reduce((chain, filePath, index) => chain.then((keys) => getFileInfo(filePath).then((info) => createImageUploadUrl({
      fileName: `recruitment-${Date.now()}-${index}`, contentType: imageContentType(filePath), byteSize: info.size,
    })).then((reference) => uploadRecruitmentImage(reference.uploadUrl, filePath)).then((uploaded) => keys.concat(uploaded.objectKey))), Promise.resolve([]));
  },

  submit() {
    if (this.data.saving) return;
    const error = this.validate();
    if (error) { this.setData({ error }); return; }
    this.setData({ saving: true, error: '', saved: false, savedMessage: '' });
    this.uploadNewImages().then((newKeys) => {
      const data = { ...this.data.form, imageKeys: (this.data.form.imageKeys || []).concat(newKeys) };
      const action = this.data.postId ? updateRecruitmentPost(this.data.postId, data) : createRecruitmentPost(data);
      return action;
    }).then((post) => {
      const imageKeys = (post.images || []).map((image) => image.objectKey);
      this.setData({ saving: false, saved: true, savedMessage: savedMessage(post.status), postId: post.id, form: { ...post, imageKeys }, statusView: ownerStatusView(post, true), existingImages: post.images || [], imagePaths: [], imageCount: imageKeys.length });
    }).catch((requestError) => this.setData({ saving: false, error: requestError.message }));
  },

  disable() {
    if (!this.data.postId || this.data.disabling || this.data.saving || this.data.form.status !== 'published') return;
    wx.showModal({ title: '下架招聘信息', content: '下架后不会出现在公开列表和地图中，可以修改后重新发布。', success: (result) => {
      if (!result.confirm) return;
      this.setData({ disabling: true, error: '', saved: false });
      disableRecruitmentPost(this.data.postId).then(() => {
        const form = { ...this.data.form, status: 'disabled', disabledAt: new Date().toISOString(), moderationReason: '', moderatedAt: '' };
        this.setData({ disabling: false, form, statusView: ownerStatusView(form, true) });
        wx.showToast({ title: '已下架', icon: 'success' });
      }).catch((error) => this.setData({ disabling: false, error: error.message }));
    } });
  },

  retry() { this.load(this.data.postId); },
});
