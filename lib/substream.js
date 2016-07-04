'use strict'

var through2 = require('through2')

module.exports = Substream

function Substream (name, opts) {
  console.log(opts)
  var stream = opts.objectMode
    ? through2.obj(opts)
    : through2(opts)
  stream.__tj = opts
  stream.__name = name
  return stream
}
