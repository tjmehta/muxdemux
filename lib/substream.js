'use strict'

var util = require('util')

var through2 = require('through2')

var Through = through2.ctor()
var ObjThrough = through2.ctor({ objectMode: true })

module.exports = Substream

module.exports.ctor = ctor

module.exports.obj = ObjSubstream

function ctor (opts) {
  opts = opts || {}
  var len = Object.keys(opts).length
  if (len === 0 || (!opts.objectMode && len === 1)) {
    return Substream
  } else if (opts.objectMode && len === 1) {
    return ObjSubstream
  } else {
    var Through = through2.ctor(opts)
    var CustomSubstream = function (name) {
      Through.call(this)
      this.__name = name
    }
    util.inherits(CustomSubstream, Through)
    return CustomSubstream
  }
}

/**
 * Substream Class
 * substream w/ objectMode:false
 */
function Substream (name) {
  Through.call(this)
  this.__name = name
}
util.inherits(Substream, Through)

/**
 * ObjSubstream Class
 * substream w/ objectMode:true
 */
function ObjSubstream (name) {
  ObjThrough.call(this)
  this.__name = name
}
util.inherits(ObjSubstream, ObjThrough)
