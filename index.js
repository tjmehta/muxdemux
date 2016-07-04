'use strict'

var ctor = require('through2').ctor
var debug = require('debug')('muxdemux')
var errToJSON = require('error-to-json')
var last = require('101/last')
var noop = require('101/noop')

var Substream = require('./lib/substream.js')

var closeParen = new Buffer('}')[0]
var openParen = new Buffer('{')[0]

var jsonErrs = function (arg) {
  return (arg instanceof Error)
    ? errToJSON(arg)
    : arg
}
var parseErrs = function (method, event) {
  if (method === 'emit' && event === 'error') {
    return function (arg, i) {
      return (i === 1)
        ? errToJSON.parse(arg)
        : arg
    }
  } else {
    return function (arg) {
      return arg
    }
  }
}
var parseBuffers = function (arg) {
  return (arg.type === 'Buffer')
    ? new Buffer(arg.data)
    : arg
}
var safeParse = function (chunk, enc) {
  var str = (enc === 'buffer')
    ? chunk.toString()
    : new Buffer(chunk, enc).toString('utf8')
  try {
    return JSON.parse(str)
  } catch (e) {
    return null
  }
}

module.exports = Muxdemux

function Muxdemux (opts, handleSubstream) {
  if (typeof opts === 'function') {
    handleSubstream = opts
    opts = null
  }
  opts = opts || {}
  opts.objectMode = false
  var Class = ctor(opts, transform)
  Class.prototype.substream = function (name, dontEmit) {
    debug('substream', name, dontEmit)
    var self = this
    this.__streams = this.__streams || []
    var substream = this.__streams[name]
    if (substream) {
      debug('substream: exists', name)
      return shim(substream)
    }
    debug('substream: does not exist', name)
    substream = this.__streams[name] = new Substream(name, opts)
    debug('substream: created', name)
    substream.on('error', noop) // prevent thrown errors
    if (!dontEmit) {
      debug('substream: push "new-chunk"', name)
      this.push(new Buffer(JSON.stringify({
        substream: name,
        'new': true
      })))
      this.emit('substream', name)
    }
    return shim(substream)
    function shim (substream) {
      return Object.create(substream, {
        write: {
          value: function () {
            debug('substream.write', name, arguments)
            self.push(new Buffer(JSON.stringify({
              substream: name,
              method: 'write',
              args: Array.prototype.slice.call(arguments)
            })))
            return substream.write.apply(substream, arguments)
          }
        },
        emit: {
          value: function () {
            debug('substream.emit', name, arguments)
            // ignore stream events.. data, resume, ...
            // well maybe not bc these are only external emits
            self.push(new Buffer(JSON.stringify({
              substream: name,
              method: 'emit',
              args: Array.prototype.slice.call(arguments).map(jsonErrs)
            })))
            return substream.emit.apply(substream, arguments)
          }
        }
      })
    }
  }
  function transform (chunk, enc, cb) {
    debug('transform', chunk, enc)
    var self = this
    var isJSON = Buffer.isBuffer(chunk)
      // chunk is buffer
      ? chunk[0] === openParen && last(chunk) === closeParen
      // chunk is string
      : chunk[0] === '{' && last(chunk) === '}'
    debug('transform chunk isJSON', isJSON, chunk.toString(), enc)
    if (isJSON) {
      var json = safeParse(chunk, enc)
      if (!json || !json.substream) { return push(cb) }
      var substream = this.__streams && this.__streams[json.substream]
      var create = this.listeners('substream').length
      if (json['new']) {
        this.emit('substream', json.substream)
      } else if (json.method && (substream || create)) {
        if (create) {
          this.substream(json.substream, true)
          substream = this.__streams[json.substream]
        }
        var method = json.method
        var args = json.args.map(parseBuffers).map(parseErrs(method, json.args[0]))
        substream[method].apply(substream, args)
      }
    }
    push(cb)
    function push () {
      self.push(chunk)
      cb()
    }
  }
  var instance = new Class()
  if (handleSubstream) {
    instance.on('substream', function (name) {
      debug('handleSubstream', name)
      handleSubstream.call(this, this.substream(name, true), name)
    })
  }
  return instance
}

Muxdemux.obj = function (opts, handleSubstream) {
  if (typeof opts === 'function') {
    handleSubstream = opts
    opts = null
  }
  opts = opts || {}
  opts.objectMode = true
  var Class = ctor(opts, transform)
  Class.prototype.substream = function (name, dontEmit) {
    debug('obj substream', name, dontEmit)
    var self = this
    this.__streams = this.__streams || []
    var substream = this.__streams[name]
    if (substream) {
      debug('substream: exists', name)
      return shim(substream)
    }
    debug('substream: does not exist', name)
    substream = this.__streams[name] = new Substream(name, opts)
    debug('substream: created', name)
    substream.on('error', noop) // prevent thrown errors
    if (!dontEmit) {
      debug('substream: push "new-chunk"', name)
      this.push({
        substream: name,
        'new': true
      })
      this.emit('substream', name)
    }
    return shim(substream)
    function shim (substream) {
      return Object.create(substream, {
        write: {
          value: function () {
            debug('substream.write', name, arguments)
            self.push({
              substream: name,
              method: 'write',
              args: Array.prototype.slice.call(arguments)
            })
            return substream.write.apply(substream, arguments)
          }
        },
        emit: {
          value: function () {
            debug('substream.emit', name, arguments)
            // ignore stream events.. data, resume, ...
            // well maybe not bc these are only external emits
            self.push({
              substream: name,
              method: 'emit',
              args: Array.prototype.slice.call(arguments).map(jsonErrs)
            })
            return substream.emit.apply(substream, arguments)
          }
        }
      })
    }
  }
  function transform (chunk, enc, cb) {
    debug('obj transform', chunk, enc)
    var self = this
    var json = chunk
    if (!json.substream) { return push(cb) }
    var substream = this.__streams && this.__streams[json.substream]
    var create = this.listeners('substream').length
    if (json['new']) {
      this.emit('substream', json.substream)
    } else if (json.method && (substream || create)) {
      if (create) {
        this.substream(json.substream, true)
        substream = this.__streams[json.substream]
      }
      var method = json.method
      var args = json.args.map(parseBuffers).map(parseErrs(method, json.args[0]))
      substream[method].apply(substream, args)
    }
    push(cb)
    function push () {
      self.push(chunk)
      cb()
    }
  }
  var instance = new Class()
  if (handleSubstream) {
    instance.on('substream', function (name) {
      handleSubstream.call(this, this.substream(name, true), name)
    })
  }
  return instance
}
