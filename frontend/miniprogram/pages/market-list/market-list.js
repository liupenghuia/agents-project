const { createMarketPage } = require('../market/create-market-page');

Page(createMarketPage({ mode: 'list' }));
