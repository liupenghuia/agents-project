const api = require('../../services/api');
const { boundsFromCenter, buildMapQuery, toMapMarkers } = require('../../utils/market-map');
const { mergeMarketItems, normalizeMarketItem } = require('../../utils/market-list');

const DEFAULT_CENTER = { latitude: 31.2304, longitude: 121.4737 };

Page({
  data: {
    role: 'applicant', mode: 'map', items: [], markers: [], selected: null,
    loading: false, loadingMore: false, actionLoading: false, error: '', keyword: '', locationNotice: '', nextCursor: null,
    latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude, scale: 11,
  },
  onLoad(options) {
    this.setData({ role: options.role === 'recruiter' ? 'recruiter' : 'applicant' });
    this._requestSerial = 0;
  },
  onReady() {
    this._mapContext = wx.createMapContext('marketMap', this);
    this.initializeMap();
  },
  onUnload() {
    clearTimeout(this._mapTimer);
    this._requestSerial += 1;
  },
  input(event) { this.setData({ keyword: event.detail.value }); },
  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this._requestSerial += 1;
    this.setData({ mode, error: '', loading: false }, () => {
      if (mode === 'map') this.loadMap();
      else this.loadList(false);
    });
  },
  search() {
    if (this.data.mode === 'map') this.loadMap();
    else this.loadList(false);
  },
  initializeMap() {
    if (!wx.getLocation) { this.useFallbackLocation('当前环境无法获取定位，已展示默认区域'); return; }
    this.setData({ loading: true, error: '', locationNotice: '' });
    wx.getLocation({
      type: 'gcj02',
      success: ({ latitude, longitude }) => {
        this.setData({ latitude, longitude, loading: false }, () => this.loadMap());
      },
      fail: () => this.useFallbackLocation('定位未授权，已展示默认区域，可点击重新定位'),
    });
  },
  useFallbackLocation(message) {
    this.setData({ ...DEFAULT_CENTER, loading: false, locationNotice: message }, () => this.loadMap(boundsFromCenter(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude)));
  },
  retryLocation() { this.initializeMap(); },
  loadList(append = false) {
    if (this.data.loading || this.data.loadingMore || (append && !this.data.nextCursor)) return;
    const serial = ++this._requestSerial;
    const action = this.data.role === 'applicant' ? api.listMarketRecruitmentPosts : api.listMarketJobSeekingInformation;
    this.setData({ [append ? 'loadingMore' : 'loading']: true, error: '' });
    action({ keyword: this.data.keyword, ...(append ? { cursor: this.data.nextCursor } : {}) }).then((result) => {
      if (serial !== this._requestSerial) return;
      const incoming = (result.items || []).map((item) => normalizeMarketItem(item, api.resolveMediaUrl));
      this.setData({
        items: append ? mergeMarketItems(this.data.items, incoming) : incoming,
        nextCursor: result.nextCursor || null,
      });
    }).catch((error) => {
      if (serial === this._requestSerial) this.setData({ error: error.message });
    }).finally(() => { if (serial === this._requestSerial) this.setData({ loading: false, loadingMore: false }); });
  },
  onReachBottom() {
    if (this.data.mode === 'list') this.loadList(true);
  },
  currentBounds(callback) {
    if (!this._mapContext || !this._mapContext.getRegion) {
      callback(boundsFromCenter(this.data.latitude, this.data.longitude));
      return;
    }
    this._mapContext.getRegion({
      success: ({ southwest, northeast }) => callback({ south: southwest.latitude, west: southwest.longitude, north: northeast.latitude, east: northeast.longitude }),
      fail: () => callback(boundsFromCenter(this.data.latitude, this.data.longitude)),
    });
  },
  loadMap(bounds) {
    if (this.data.loading) return;
    if (!bounds) { this.currentBounds((region) => this.loadMap(region)); return; }
    const serial = ++this._requestSerial;
    const query = buildMapQuery(bounds, this.data.scale, this.data.keyword, this.data.role);
    const action = this.data.role === 'applicant' ? api.mapMarketRecruitmentPosts : api.mapMarketJobSeekingInformation;
    this.setData({ loading: true, error: '' });
    action(query).then((result) => {
      if (serial !== this._requestSerial) return;
      const mapped = toMapMarkers(result.items, this.data.role);
      this._markerTargets = mapped.targets;
      this.setData({ markers: mapped.markers });
    }).catch((error) => {
      if (serial === this._requestSerial) this.setData({ error: error.message, markers: [] });
    }).finally(() => { if (serial === this._requestSerial) this.setData({ loading: false }); });
  },
  regionChange(event) {
    if (event.type !== 'end') return;
    const scale = Number(event.detail && event.detail.scale) || this.data.scale;
    this.setData({ scale });
    clearTimeout(this._mapTimer);
    this._mapTimer = setTimeout(() => this.loadMap(), 280);
  },
  markerTap(event) {
    const target = this._markerTargets && this._markerTargets[event.detail.markerId];
    if (!target) return;
    if (target.cluster) {
      this.setData({ latitude: target.latitude, longitude: target.longitude, scale: Math.min(20, this.data.scale + 2) }, () => this.loadMap());
      return;
    }
    this.openById(target.id);
  },
  open(event) { this.openById(event.currentTarget.dataset.id); },
  openById(id) {
    const action = this.data.role === 'applicant' ? api.getMarketRecruitmentPost : api.getMarketJobSeekingInformation;
    const serial = ++this._requestSerial;
    this.setData({ loading: true, error: '' });
    action(id).then((selected) => {
      if (serial === this._requestSerial) this.setData({ selected: normalizeMarketItem(selected, api.resolveMediaUrl) });
    }).catch((error) => {
      if (serial === this._requestSerial) this.setData({ error: error.message });
    }).finally(() => { if (serial === this._requestSerial) this.setData({ loading: false }); });
  },
  closeDetail() { this.setData({ selected: null }); },
  callContact() {
    const phoneNumber = this.data.selected && this.data.selected.contactPhone;
    if (!phoneNumber) { this.setData({ error: '当前信息没有可用联系方式' }); return; }
    wx.makePhoneCall({ phoneNumber, fail: () => this.setData({ error: '未能发起电话，请稍后重试' }) });
  },
  favorite() {
    const item = this.data.selected; if (!item || this.data.actionLoading) return;
    const shouldFavorite = !item.isFavorited;
    const action = this.data.role === 'applicant'
      ? (shouldFavorite ? api.favoriteRecruitmentPost : api.unfavoriteRecruitmentPost)
      : (shouldFavorite ? api.favoriteJobSeekingInformation : api.unfavoriteJobSeekingInformation);
    this.setData({ actionLoading: true, error: '' });
    action(item.id).then(() => {
      const selected = { ...item, isFavorited: shouldFavorite };
      const items = this.data.items.map((candidate) => candidate.id === item.id ? { ...candidate, isFavorited: shouldFavorite } : candidate);
      this.setData({ selected, items });
      wx.showToast({ title: shouldFavorite ? '已收藏' : '已取消收藏', icon: 'success' });
    }).catch((error) => this.setData({ error: error.message }))
      .finally(() => this.setData({ actionLoading: false }));
  },
  report() {
    const item = this.data.selected; if (!item) return;
    wx.showModal({ title: '举报信息', editable: true, placeholderText: '请填写举报原因', success: (result) => {
      if (!result.confirm || !String(result.content || '').trim()) return;
      api.createMarketReport({ targetType: this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information', targetId: item.id, reason: result.content.trim() })
        .then(() => wx.showToast({ title: '举报已提交', icon: 'success' })).catch((error) => this.setData({ error: error.message }));
    } });
  },
  retry() { this.search(); },
  openFavorites() { wx.navigateTo({ url: `/pages/favorites/favorites?role=${this.data.role}` }); },
});
