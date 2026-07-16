const api = require('../../services/api');
const marketApp = require('../../services/market-app');
const { getActiveRole, setActiveRole, getMarketWorkspace, saveMarketWorkspace } = require('../../utils/workspace');
const navigation = require('../../utils/navigation');

const { DEFAULT_CENTER } = marketApp;

function createMarketPage({ mode }) {
  const fixedMode = mode === 'list' ? 'list' : 'map';

  return {
    data: {
      role: 'applicant',
      mode: fixedMode,
      items: [],
      markers: [],
      selected: null,
      loading: false,
      loadingMore: false,
      actionLoading: false,
      error: '',
      keyword: '',
      locationNotice: '',
      nextCursor: null,
      showFilters: false,
      filters: {},
      draftFilters: {},
      viewerProfile: null,
      totalCount: null,
      activeFilterSummary: '',
      savedFilters: [],
      recentSearches: [],
      latitude: DEFAULT_CENTER.latitude,
      longitude: DEFAULT_CENTER.longitude,
      scale: 11,
    },

    onLoad(options) {
      const role = setActiveRole(options.role || getActiveRole() || 'applicant') || 'applicant';
      const saved = getMarketWorkspace(role);
      const history = marketApp.loadFilterHistory(role);
      this.setData({
        role,
        mode: fixedMode,
        keyword: saved.keyword || '',
        filters: saved.filters || {},
        draftFilters: saved.filters || {},
        scale: saved.scale || 11,
        savedFilters: history.savedFilters,
        recentSearches: history.recentSearches,
        activeFilterSummary: marketApp.summarizeFilters(saved.filters || {}),
      });
      saveMarketWorkspace(role, {
        mode: fixedMode,
        keyword: saved.keyword,
        filters: saved.filters,
        scale: saved.scale,
      });
      this._requestSerial = 0;
      if (role === 'applicant') {
        api.getApplicantJobSeekingInformation()
          .then((profile) => this.setData({ viewerProfile: profile }))
          .catch(() => {});
      }
    },

    onShow() {
      const role = getActiveRole() || this.data.role;
      if (role !== this.data.role) {
        this.onLoad({ role });
        return;
      }
      if (fixedMode === 'list' && !this.data.items.length && !this.data.loading) this.loadList(false);
    },

    onUnload() {
      this.saveWorkspace();
      clearTimeout(this._mapTimer);
      this._requestSerial += 1;
    },

    onHide() { this.saveWorkspace(); },

    summarizeFilters(filters = {}) {
      return marketApp.summarizeFilters(filters);
    },

    saveWorkspace() {
      saveMarketWorkspace(this.data.role, {
        mode: fixedMode,
        keyword: this.data.keyword,
        filters: this.data.filters,
        scale: this.data.scale,
      });
    },

    persistFilterHistory(filters) {
      const recent = marketApp.persistRecentSearch(this.data.role, filters, this.data.keyword);
      this.setData({ recentSearches: recent });
    },

    onReady() {
      if (fixedMode !== 'map') return;
      this._mapContext = wx.createMapContext('marketMap', this);
      this.initializeMap();
    },

    input(event) { this.setData({ keyword: event.detail.value }); },

    switchMode(event) {
      const next = event.currentTarget.dataset.mode === 'list' ? 'list' : 'map';
      if (next === fixedMode) return;
      this.saveWorkspace();
      navigation.openMainTab(next, { role: this.data.role });
    },

    search() {
      this.saveWorkspace();
      if (fixedMode === 'map') this.loadMap();
      else this.loadList(false);
    },

    openFilters() { this.setData({ showFilters: true, draftFilters: { ...this.data.filters } }); },
    closeFilters() { this.setData({ showFilters: false }); },
    filterInput(event) {
      this.setData({ [`draftFilters.${event.currentTarget.dataset.field}`]: event.detail.value });
    },
    pickWorkMethod(event) {
      this.setData({
        'draftFilters.workMethod': ['monthly_settlement', 'indefinite_duration'][event.detail.value],
      });
    },
    resetFilters() { this.setData({ draftFilters: {} }); },

    applyFilters() {
      const filters = { ...this.data.draftFilters };
      this.setData({
        filters,
        showFilters: false,
        nextCursor: null,
        totalCount: null,
        activeFilterSummary: marketApp.summarizeFilters(filters),
      }, () => {
        this.persistFilterHistory(filters);
        this.saveWorkspace();
        this.search();
      });
    },

    saveCurrentFilters() {
      const result = marketApp.saveFiltersPreset(this.data.role, this.data.filters, this.data.keyword);
      if (!result.ok) {
        wx.showToast({ title: result.message, icon: 'none' });
        return;
      }
      this.setData({ savedFilters: result.savedFilters });
      wx.showToast({ title: '已保存筛选', icon: 'success' });
    },

    applySavedFilter(event) {
      const index = Number(event.currentTarget.dataset.index);
      const source = event.currentTarget.dataset.source === 'recent'
        ? this.data.recentSearches
        : this.data.savedFilters;
      const selected = source[index];
      if (!selected) return;
      const { keyword = '', savedAt, ...filters } = selected;
      this.setData({
        keyword,
        filters,
        draftFilters: { ...filters },
        showFilters: false,
        nextCursor: null,
        activeFilterSummary: marketApp.summarizeFilters(filters),
      }, () => {
        this.saveWorkspace();
        this.search();
      });
    },

    deleteSavedFilter(event) {
      const index = Number(event.currentTarget.dataset.index);
      const next = marketApp.deleteSavedFilter(this.data.role, index);
      this.setData({ savedFilters: next });
    },

    initializeMap() {
      if (!wx.getLocation) {
        this.useFallbackLocation('当前环境无法获取定位，已展示默认区域');
        return;
      }
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
      this.setData({
        ...DEFAULT_CENTER,
        loading: false,
        locationNotice: message,
      }, () => this.loadMap(marketApp.fallbackBounds()));
    },

    retryLocation() { this.initializeMap(); },

    loadList(append = false) {
      if (this.data.loading || this.data.loadingMore || (append && !this.data.nextCursor)) return;
      const serial = ++this._requestSerial;
      this.setData({ [append ? 'loadingMore' : 'loading']: true, error: '' });
      marketApp.fetchMarketList(api, {
        role: this.data.role,
        keyword: this.data.keyword,
        filters: this.data.filters,
        cursor: this.data.nextCursor,
        append,
        existingItems: this.data.items,
        viewerProfile: this.data.viewerProfile,
      }).then((result) => {
        if (serial !== this._requestSerial) return;
        this.setData({
          items: result.items,
          nextCursor: result.nextCursor,
          totalCount: result.totalCount != null ? result.totalCount : this.data.totalCount,
        });
      }).catch((error) => {
        if (serial === this._requestSerial) this.setData({ error: error.message });
      }).finally(() => {
        if (serial === this._requestSerial) this.setData({ loading: false, loadingMore: false });
      });
    },

    onReachBottom() {
      if (fixedMode === 'list') this.loadList(true);
    },

    currentBounds(callback) {
      if (!this._mapContext || !this._mapContext.getRegion) {
        callback(marketApp.boundsFromCenter(this.data.latitude, this.data.longitude));
        return;
      }
      this._mapContext.getRegion({
        success: ({ southwest, northeast }) => callback({
          south: southwest.latitude,
          west: southwest.longitude,
          north: northeast.latitude,
          east: northeast.longitude,
        }),
        fail: () => callback(marketApp.boundsFromCenter(this.data.latitude, this.data.longitude)),
      });
    },

    loadMap(bounds) {
      if (this.data.loading) return;
      if (!bounds) {
        this.currentBounds((region) => this.loadMap(region));
        return;
      }
      const serial = ++this._requestSerial;
      this.setData({ loading: true, error: '' });
      marketApp.fetchMarketMap(api, {
        role: this.data.role,
        bounds,
        scale: this.data.scale,
        keyword: this.data.keyword,
        filters: this.data.filters,
      }).then((result) => {
        if (serial !== this._requestSerial) return;
        this._markerTargets = result.markerTargets;
        this.setData({ markers: result.markers });
      }).catch((error) => {
        if (serial === this._requestSerial) this.setData({ error: error.message, markers: [] });
      }).finally(() => {
        if (serial === this._requestSerial) this.setData({ loading: false });
      });
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
        this.setData({
          latitude: target.latitude,
          longitude: target.longitude,
          scale: Math.min(20, this.data.scale + 2),
        }, () => this.loadMap());
        return;
      }
      this.openById(target.id);
    },

    open(event) { this.openById(event.currentTarget.dataset.id); },
    openById(id) { navigation.openMarketDetail(this.data.role, id); },
    closeDetail() { this.setData({ selected: null }); },

    callContact() {
      const phoneNumber = this.data.selected && this.data.selected.contactPhone;
      if (!phoneNumber) {
        this.setData({ error: '当前信息没有可用联系方式' });
        return;
      }
      wx.makePhoneCall({
        phoneNumber,
        fail: () => this.setData({ error: '未能发起电话，请稍后重试' }),
      });
    },

    favorite() {
      const item = this.data.selected;
      if (!item || this.data.actionLoading) return;
      const shouldFavorite = !item.isFavorited;
      this.setData({ actionLoading: true, error: '' });
      marketApp.toggleFavorite(api, { role: this.data.role, item, shouldFavorite })
        .then(({ selected }) => {
          this.setData({
            selected,
            items: marketApp.applyFavoriteToItems(this.data.items, item.id, shouldFavorite),
          });
          wx.showToast({ title: shouldFavorite ? '已收藏' : '已取消收藏', icon: 'success' });
        })
        .catch((error) => this.setData({ error: error.message }))
        .finally(() => this.setData({ actionLoading: false }));
    },

    report() {
      const item = this.data.selected;
      if (!item) return;
      wx.showModal({
        title: '举报信息',
        editable: true,
        placeholderText: '请填写举报原因',
        success: (result) => {
          if (!result.confirm || !String(result.content || '').trim()) return;
          marketApp.reportItem(api, {
            role: this.data.role,
            item,
            reason: result.content.trim(),
          }).then(() => wx.showToast({ title: '举报已提交', icon: 'success' }))
            .catch((error) => this.setData({ error: error.message }));
        },
      });
    },

    block() {
      const item = this.data.selected;
      if (!item) return;
      wx.showModal({
        title: '拉黑发布者',
        content: '拉黑后，对方的信息将从你的地图、列表和收藏中隐藏。',
        success: (result) => {
          if (!result.confirm) return;
          marketApp.blockPublisher(api, { role: this.data.role, item })
            .then(() => {
              this.closeDetail();
              this.search();
              wx.showToast({ title: '已拉黑', icon: 'success' });
            })
            .catch((error) => this.setData({ error: error.message }));
        },
      });
    },

    retry() { this.search(); },
    openFavorites() { navigation.openFavorites(this.data.role); },
    openMyCenter() { navigation.openMainTab('my', { role: this.data.role }); },
  };
}

module.exports = { createMarketPage, DEFAULT_CENTER };
