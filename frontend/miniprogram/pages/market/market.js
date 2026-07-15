const api = require('../../services/api');
const { boundsFromCenter, buildMapQuery, toMapMarkers } = require('../../utils/market-map');
const { mergeMarketItems, normalizeMarketItem } = require('../../utils/market-list');
const { matchMarketItem } = require('../../utils/matching');

const DEFAULT_CENTER = { latitude: 31.2304, longitude: 121.4737 };

Page({
  data: {
    role: 'applicant', mode: 'map', items: [], markers: [], selected: null,
    loading: false, loadingMore: false, actionLoading: false, error: '', keyword: '', locationNotice: '', nextCursor: null,
    showFilters: false, filters: {}, draftFilters: {}, viewerProfile: null, totalCount: null, activeFilterSummary: '',
    savedFilters: [], recentSearches: [],
    latitude: DEFAULT_CENTER.latitude, longitude: DEFAULT_CENTER.longitude, scale: 11,
  },
  onLoad(options) {
    const role = options.role === 'recruiter' ? 'recruiter' : 'applicant';
    const saved = getApp().globalData.workspaces[role] || {};
    const storageKey = `marketFilters:${role}`;
    const savedFilters = wx.getStorageSync(storageKey) || [];
    const recentSearches = wx.getStorageSync(`marketRecent:${role}`) || [];
    this.setData({
      role, mode: options.mode === 'list' ? 'list' : saved.mode || 'map', keyword: saved.keyword || '',
      filters: saved.filters || {}, draftFilters: saved.filters || {}, scale: saved.scale || 11,
      savedFilters, recentSearches, activeFilterSummary: this.summarizeFilters(saved.filters || {}),
    });
    this._requestSerial = 0;
    if (role === 'applicant') api.getApplicantJobSeekingInformation().then((profile) => this.setData({ viewerProfile: profile })).catch(() => {});
  },
  onUnload() { this.saveWorkspace(); clearTimeout(this._mapTimer); this._requestSerial += 1; },
  summarizeFilters(filters = {}) {
    return Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}:${value}`).join(' · ');
  },
  saveWorkspace() {
    const app = getApp();
    app.globalData.workspaces[this.data.role] = { mode: this.data.mode, keyword: this.data.keyword, filters: this.data.filters, scale: this.data.scale };
  },
  persistFilterHistory(filters) {
    if (!Object.values(filters || {}).some(Boolean) && !this.data.keyword) return;
    const entry = { ...filters, keyword: this.data.keyword, savedAt: Date.now() };
    const recent = [entry, ...(wx.getStorageSync(`marketRecent:${this.data.role}`) || [])]
      .filter((item, index, list) => list.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index)
      .slice(0, 5);
    wx.setStorageSync(`marketRecent:${this.data.role}`, recent);
    this.setData({ recentSearches: recent });
  },
  apiFilters() {
    const filters = this.data.filters || {};
    return this.data.role === 'applicant'
      ? { jobTypeName: filters.jobType || '', expectedSalary: filters.salaryRange || '', workMethod: filters.workMethod || '', location: filters.location || '', publishedFrom: filters.publishedFrom || '', publishedTo: filters.publishedTo || '' }
      : { jobType: filters.jobType || '', salaryRange: filters.salaryRange || '', settlementMethod: filters.workMethod || '', location: filters.location || '', publishedFrom: filters.publishedFrom || '', publishedTo: filters.publishedTo || '' };
  },
  onReady() {
    this._mapContext = wx.createMapContext('marketMap', this);
    this.initializeMap();
  },
  input(event) { this.setData({ keyword: event.detail.value }); },
  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this._requestSerial += 1;
    this.setData({ mode, error: '', loading: false }, () => {
      this.saveWorkspace();
      if (mode === 'map') this.loadMap();
      else this.loadList(false);
    });
  },
  search() {
    this.saveWorkspace();
    if (this.data.mode === 'map') this.loadMap();
    else this.loadList(false);
  },
  openFilters() { this.setData({ showFilters: true, draftFilters: { ...this.data.filters } }); },
  closeFilters() { this.setData({ showFilters: false }); },
  filterInput(event) { this.setData({ [`draftFilters.${event.currentTarget.dataset.field}`]: event.detail.value }); },
  pickWorkMethod(event) { this.setData({ 'draftFilters.workMethod': ['monthly_settlement', 'indefinite_duration'][event.detail.value] }); },
  resetFilters() { this.setData({ draftFilters: {} }); },
  applyFilters() {
    const filters = { ...this.data.draftFilters };
    this.setData({
      filters, showFilters: false, nextCursor: null, totalCount: null,
      activeFilterSummary: this.summarizeFilters(filters),
    }, () => { this.persistFilterHistory(filters); this.saveWorkspace(); this.search(); });
  },
  saveCurrentFilters() {
    const filters = { ...this.data.filters, keyword: this.data.keyword };
    if (!Object.values(filters).some(Boolean)) { wx.showToast({ title: '没有可保存的条件', icon: 'none' }); return; }
    const next = [filters, ...(this.data.savedFilters || [])]
      .filter((item, index, list) => list.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(item)) === index)
      .slice(0, 8);
    wx.setStorageSync(`marketFilters:${this.data.role}`, next);
    this.setData({ savedFilters: next });
    wx.showToast({ title: '已保存筛选', icon: 'success' });
  },
  applySavedFilter(event) {
    const index = Number(event.currentTarget.dataset.index);
    const source = event.currentTarget.dataset.source === 'recent' ? this.data.recentSearches : this.data.savedFilters;
    const selected = source[index];
    if (!selected) return;
    const { keyword = '', savedAt, ...filters } = selected;
    this.setData({
      keyword, filters, draftFilters: { ...filters }, showFilters: false, nextCursor: null,
      activeFilterSummary: this.summarizeFilters(filters),
    }, () => { this.saveWorkspace(); this.search(); });
  },
  deleteSavedFilter(event) {
    const index = Number(event.currentTarget.dataset.index);
    const next = this.data.savedFilters.filter((_, itemIndex) => itemIndex !== index);
    wx.setStorageSync(`marketFilters:${this.data.role}`, next);
    this.setData({ savedFilters: next });
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
    action({ keyword: this.data.keyword, ...this.apiFilters(), ...(append ? { cursor: this.data.nextCursor } : {}) }).then((result) => {
      if (serial !== this._requestSerial) return;
      const incoming = (result.items || []).map((item) => {
        const normalized = normalizeMarketItem(item, api.resolveMediaUrl);
        const matching = matchMarketItem(normalized, this.data.viewerProfile);
        return matching.reasons.length ? { ...normalized, matchScore: matching.score, matchReasons: matching.reasons } : normalized;
      });
      this.setData({
        items: append ? mergeMarketItems(this.data.items, incoming) : incoming,
        nextCursor: result.nextCursor || null,
        totalCount: typeof result.totalCount === 'number' ? result.totalCount : this.data.totalCount,
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
    const query = { ...buildMapQuery(bounds, this.data.scale, this.data.keyword, this.data.role), ...this.apiFilters() };
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
    wx.navigateTo({ url: `/pages/market-detail/market-detail?role=${this.data.role}&id=${id}` });
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
  block() {
    const item = this.data.selected; if (!item) return;
    wx.showModal({ title: '拉黑发布者', content: '拉黑后，对方的信息将从你的地图、列表和收藏中隐藏。', success: (result) => {
      if (!result.confirm) return;
      api.createMarketUserBlock({ targetType: this.data.role === 'applicant' ? 'recruitment_post' : 'applicant_information', targetId: item.id })
        .then(() => { this.closeDetail(); this.search(); wx.showToast({ title: '已拉黑', icon: 'success' }); })
        .catch((error) => this.setData({ error: error.message }));
    } });
  },
  retry() { this.search(); },
  openFavorites() { wx.redirectTo({ url: `/pages/favorites/favorites?role=${this.data.role}` }); },
  openMyCenter() { wx.redirectTo({ url: `/pages/my-center/my-center?role=${this.data.role}` }); },
  openListTab() { this.setData({ mode: 'list' }, () => { this.saveWorkspace(); this.loadList(false); }); },
});
