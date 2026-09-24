const fs = require('fs');
const path = require('path');

for (const name of ['matrix_sdk.swift', 'matrix_sdk_ffi.swift']) {
  const file = path.join(__dirname, '..', 'swift', name);
  const contents = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, contents.replace(/[\t ]+$/gm, ''));
}
