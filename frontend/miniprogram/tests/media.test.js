const assert = require('assert');
const { getFileInfo, imageContentType } = require('../utils/media');

assert.strictEqual(imageContentType('/tmp/photo.PNG'), 'image/png');
assert.strictEqual(imageContentType('/tmp/photo.webp?x=1'), 'image/webp');
assert.strictEqual(imageContentType('/tmp/no-extension'), 'image/jpeg');

getFileInfo('/tmp/photo.png', { getFileInfo: ({ success }) => success({ size: 123 }) }).then((info) => {
  assert.strictEqual(info.size, 123);
  return getFileInfo('/tmp/missing.png', { getFileInfo: ({ fail }) => fail() }).then(
    () => assert.fail('expected getFileInfo to reject'),
    (error) => assert.strictEqual(error.message, '无法读取图片信息，请重新选择'),
  );
}).then(() => console.log('media tests passed'));
