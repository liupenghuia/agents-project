const api = require('../../services/api');
const { runRequest } = require('../../utils/request-state');

Page({
  data: {
    id: '', role: 'applicant', conversation: null, messages: [], draft: '',
    loading: true, submitting: false, sending: false, error: '',
    scrollIntoView: '',
  },
  onLoad(options) {
    this.setData({ id: options.id || '', role: options.role === 'recruiter' ? 'recruiter' : 'applicant' });
    this.load();
  },
  load() {
    return runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData(patch),
      mode: 'load',
      request: () => Promise.all([api.getConversation(this.data.id), api.listConversationMessages(this.data.id)]),
      mapSuccess: ([conversation, messages]) => ({ conversation, messages: messages || [] }),
    }).then(() => {
      api.markConversationRead(this.data.id).catch(() => {});
      this.scrollToBottom();
    }).catch(() => {});
  },
  scrollToBottom() {
    const messages = this.data.messages || [];
    const last = messages[messages.length - 1];
    this.setData({ scrollIntoView: last ? `m-${last.id}` : 'chat-bottom' });
  },
  input(event) { this.setData({ draft: event.detail.value }); },
  send() {
    const body = String(this.data.draft || '').trim();
    if (!body || this.data.submitting) return;
    const clientRequestId = `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    runRequest({
      getState: () => this.data,
      setState: (patch) => this.setData({ ...patch, sending: patch.submitting }),
      mode: 'submit',
      request: () => api.sendConversationMessage(this.data.id, { body, clientRequestId }),
      mapSuccess: (message) => ({
        messages: this.data.messages.concat(message),
        draft: '',
      }),
    }).then(() => this.scrollToBottom()).catch(() => {});
  },
  end() {
    wx.showModal({ title: '结束会话', content: '结束后双方不能继续发送，历史消息仍可查看。', success: (result) => {
      if (!result.confirm) return;
      runRequest({
        getState: () => this.data,
        setState: (patch) => this.setData(patch),
        mode: 'submit',
        request: () => api.endConversation(this.data.id),
        mapSuccess: (conversation) => ({ conversation }),
      }).then(() => wx.showToast({ title: '会话已结束', icon: 'success' })).catch(() => {});
    } });
  },
  retry() { this.load(); },
});
