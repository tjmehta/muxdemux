'use strict'

var util = require('util')

var debug = require('debug')
var defaults = require('101/defaults')
var errToJSON = require('error-to-json')
var last = require('101/last')
var throughCtor = require('through2').ctor
var uuid = require('uuid')

var substreamCtor = require('./lib/substream.js').ctor

var closeParen = new Buffer('}')[0]
var openParen = new Buffer('{')[0]

var jsonBuf = function (arg) {
  // for node < 0.10
  if (Buffer.isBuffer(arg)) {
    var json = arg.toJSON()
    /* istanbul ignore next */
    arg = (json.type)
      ? json
      : { type: 'Buffer', data: json }
  }
  return arg
}
var jsonErr = function (arg) {
  if (arg instanceof Error) {
    arg = errToJSON(arg)
    arg.type = 'Error'
  }
  return arg
}
var parseErrs = function (arg) {
  if (arg.type === 'Error') {
    delete arg.type
    arg = errToJSON.parse(arg)
  }
  return arg
}
var parseBuffers = function (arg) {
  return (arg.type === 'Buffer')
    ? new Buffer(arg.data)
    : arg
}
var parseJSON = function (chunk, enc) {
  // chunk is buffer
  var isJSON = (chunk[0] === openParen && last(chunk) === closeParen)
  if (!isJSON) {
    return null
  }
  var str = chunk.toString()
  try {
    return JSON.parse(str)
  } catch (e) {
    return null
  }
}

module.exports = ctor() // { objectMode: false }
module.exports.ctor = ctor
module.exports.obj = ctor({ objectMode: true })

function ctor (opts) {
  opts = opts || {}
  var Through = throughCtor(opts, transform)
  var Substream = substreamCtor(opts)
  /**
   * Muxdemux Class
   * @param {Object} [opts]
   * @param {Object} [opts.id] default: uuid()
   * @param {Object} [opts.circular] filters out non-substream data, default: true
   * @param {Object} [opts.keepOpen] default: false
   * @param {Object} [opts.unexpectedFinishError] default: true
   * @param {Function} [handleSubstream]
   * @param {Boolean} [dontEndWhenSubstreamsEnd]
   */
  function Muxdemux (opts, handleSubstream) {
    if (!(this instanceof Muxdemux)) {
      return new Muxdemux(opts, handleSubstream)
    }
    if (typeof opts === 'function') {
      handleSubstream = opts
      opts = null
    }
    opts = opts || {}
    defaults(opts, {
      id: uuid(),
      circular: false,
      keepOpen: false,
      unexpectedFinishError: true
    })
    this.id = opts.id
    this.debug = debug('muxdemux:' + this.id)
    this.debug('Muxdemux', opts, typeof handleSubstream)
    // super
    Through.call(this)
    // constructor
    var self = this
    this.__opts = opts
    this.__substreamNames = {}
    this.__substreams = {}
    this.__wrappedSubstreams = {}
    this.__finishedSubstreams = {}
    this.once('finish', function () {
      if (opts.unexpectedFinishError) {
        self.debug('unexpected finish?', self.__substreamNames, self.__finishedSubstreams)
        var err = new Error('unexpected muxdemux finish')
        Object.keys(self.__substreamNames).forEach(function (name) {
          if (!self.__finishedSubstreams[name]) {
            self.__substreams[name].emit('error', err)
          }
        })
        return
      }
      Object.keys(self.__substreams).forEach(function (name) {
        self.__substreams[name].end()
      })
    })
    if (opts.unexpectedFinishError) {
      this.once('error', function (err) {
        self.debug('unexpected error?', self.__substreamNames, self.__finishedSubstreams)
        err.message = 'unexpected muxdemux error: ' + err.message
        Object.keys(self.__substreamNames).forEach(function (name) {
          if (!self.__finishedSubstreams[name]) {
            self.__substreams[name].emit('error', err)
          }
        })
        return
      })
    }
    if (handleSubstream) {
      this.on('substream', function (name) {
        self.debug('muxdemux.handleSubstream', name)
        var wrappedSubstream = getOrCreateWrappedSubstream.call(self, name)
        handleSubstream.call(self, wrappedSubstream, name)
      })
    }
  }
  // inherit from through
  util.inherits(Muxdemux, Through)
  /* public methods */
  /**
   * get or create a substream for public usage
   * @param  {String} name name of substream
   * @return {WrappedSubstream} substream w/ methods wrapped for public usage
   */
  Muxdemux.prototype.substream = function (name) {
    this.debug('muxdemux.substream', name)
    var substream = getSubstream.call(this, name)
    if (substream) {
      return this.__wrappedSubstreams[name]
    }
    substream = createSubstream.call(this, name)
    castAndPush.call(this, {
      substream: name,
      'new': true
    })
    this.emit('substream', name)
    return this.__wrappedSubstreams[name]
  }
  /* private methods */
  /**
   * cast chunk buffer if objectMode:false and push
   */
  function castAndPush (json) {
    this.debug('muxdemux.castAndPush', json)
    if (this._writableState.ending || this._writableState.ending.ended) {
      return
    }
    json.source = this.id
    if (!opts.objectMode && (typeof json === 'object' && !Buffer.isBuffer(json))) {
      this.debug('muxdemux.castAndPush: cast as buffer', json)
      json = new Buffer(JSON.stringify(json))
    }
    this.push(json)
  }
  /**
   * get or create substream on instance
   * @param  {String} name substream name
   * @return {Substream} substream w/ name
   */
  function createSubstream (name) {
    this.debug('muxdemux.createSubstream', name)
    var self = this
    var dontEndWhenSubstreamsEnd = this.__opts.keepOpen
    this.__substreamNames[name] = true
    var substream = this.__substreams[name] = new Substream(name)
    this.__wrappedSubstreams[name] = wrapSubstream.call(this, substream)
    this.debug('muxdemux.createSubstream: dontEndWhenSubstreamsEnd:', dontEndWhenSubstreamsEnd)
    if (!dontEndWhenSubstreamsEnd) {
      substream.once('finish', function () {
        self.debug('substream finish event', name)
        handleSubstreamFinish.call(self, name)
      })
      substream.once('error', function (err) {
        self.debug('substream error event', name, err)
        handleSubstreamFinish.call(self, name)
        var numHandlers = substream.listeners('error').length
        self.debug('substream error event: num handlers', numHandlers)
        if (numHandlers === 0) {
          self.debug('substream error event: throw error')
          throw err
        }
      })
    }
    return substream
  }
  /**
   * get or create substream on instance
   * @param  {String} name substream name
   * @return {Substream} substream w/ name
   */
  function getSubstream (name) {
    this.debug('muxdemux.getSubstream', name)
    return this.__substreams[name]
  }
  /**
   * get or create substream on instance
   * @param  {String} name substream name
   * @return {Substream} substream w/ name
   */
  function getOrCreateWrappedSubstream (name) {
    this.debug('getOrCreateWrappedSubstream', name)
    var substream = getSubstream.call(this, name)
    if (!substream) {
      createSubstream.call(this, name)
    }
    return this.__wrappedSubstreams[name]
  }
  /**
   * handle substream ends and determine if muxdemux should end
   * @return {[type]} [description]
   */
  function handleSubstreamFinish (name) {
    this.debug('muxdemux.handleSubstreamFinish', name)
    this.__finishedSubstreams[name] = true
    if (substreamsFinished.call(this)) {
      this.end()
    }
  }
  /**
   * check if all substreams are finished
   * @return {Boolean} finished
   */
  function substreamsFinished () {
    this.debug('muxdemux.substreamsFinished')
    var allLen = Object.keys(this.__substreamNames).length
    var stoppedLen = Object.keys(this.__finishedSubstreams).length
    return (allLen === stoppedLen)
  }
  /**
   * passthrough stream chunks and emit substream events for substream chunks
   * @param  {Buffer|String|Object} chunk
   * @param  {String} enc
   * @param  {Function} cb
   */
  function transform (chunk, enc, cb) {
    this.debug('muxdemux.transform', chunk, enc)
    var self = this
    var json = opts.objectMode
      ? chunk
      : parseJSON(chunk, enc)
    if (!json || !json.substream) {
      this.debug('muxdemux.transform: !json')
      // chunk is not a substream-chunk, just push downstream
      if (this.__opts.circular) {
        this.debug('muxdemux.transform: !json && circular')
        cb()
        return
      }
      push(chunk, cb)
      return
    }
    this.debug('muxdemux.transform: json', json)
    if (json.source === this.id) {
      // substream-chunk has made it back to source from a circular stream; do not push data.
      cb()
      return
    }
    // chunk is json, and a substream-chunk
    var substream = getSubstream.call(this, json.substream)
    this.debug('muxdemux.transform: substream[' + json.substream + '] exists', !!substream)
    if (json['new']) {
      this.debug('muxdemux.transform: new-substream chunk')
      // new substream found
      this.__substreamNames[json.substream] = true
      this.emit('substream', json.substream)
    }
    if (!substream && json.method === 'end') {
      this.debug('muxdemux.transform: subtream-chunk invoke:end and substream DNE', json.substream)
      handleSubstreamFinish.call(this, json.substream)
    }
    if (substream && json.method) {
      this.debug('muxdemux.transform: substream-chunk invoke', json.method)
      var method = json.method
      var args = json.args.map(parseBuffers).map(parseErrs)
      // invoke substream method
      substream[method].apply(substream, args)
    }
    push(chunk, cb)
    function push (chunk, cb) {
      self.push(chunk)
      cb()
    }
  }
  /**
   * wrap a substream for public usage
   * wraps write and emit, so that encoded substream-chunks
   * are passed along to substreams down the pipe
   * @param  {[type]} substream [description]
   * @return {[type]}           [description]
   */
  var ignoreEvents = ['pipe', 'unpipe']
  function wrapSubstream (substream) {
    var self = this
    var name = substream.__name
    return Object.create(substream, {
      write: {
        value: function () {
          self.debug('substream.write', name, arguments)
          castAndPush.call(self, {
            substream: name,
            method: 'write',
            args: Array.prototype.slice.call(arguments).map(jsonBuf)
          })
          return substream.write.apply(substream, arguments)
        }
      },
      emit: {
        value: function () {
          self.debug('substream.emit', arguments[0])
          // ignore stream events that can be called on a wrappedSubstream
          if (!~ignoreEvents.indexOf(arguments[0])) {
            self.debug('substream.emit: encoded', name, arguments)
            castAndPush.call(self, {
              substream: name,
              method: 'emit',
              args: Array.prototype.slice.call(arguments).map(jsonErr).map(jsonBuf)
            })
          }
          return substream.emit.apply(substream, arguments)
        }
      },
      end: {
        value: function () {
          self.debug('substream.end', name, arguments)
          castAndPush.call(self, {
            substream: name,
            method: 'end',
            args: Array.prototype.slice.call(arguments)
          })
          return substream.end.apply(substream, arguments)
        }
      }
    })
  }

  return Muxdemux
}
