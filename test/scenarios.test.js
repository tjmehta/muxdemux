'use strict'

var describe = global.describe
var it = global.it

var callbackCount = require('callback-count')
var expect = require('chai').expect
var through2 = require('through2')

var muxdemux = require('../index.js')

describe('scenarios', function () {
  it('should not write unpipe-substream-chunk if stream is ended', function (done) {
    var next = callbackCount(3, done).next
    var dataStream = through2.obj()
    var mux = muxdemux.obj()
    var middleStream = through2.obj()
    var demux = muxdemux.obj(handleStream)
    var substream = mux.substream('data')
    // pipe all the things
    middleStream.on('finish', function () {
      mux.end()
    })
    substream.on('error', function (err) {
      expect(err.message).to.match(/unexpected.*finish/)
      next()
    })
    demux.substream('data').on('error', function (err) {
      expect(err.message).to.match(/unexpected.*finish/)
      next()
    })
    substream.on('unpipe', function () {
      substream.emit('yolo', 1) // coverage, doesn't attempt to write encoded substream-chunk to closed stream
      next()
    })
    mux.pipe(middleStream).pipe(demux)
    dataStream.pipe(substream)
    // write data
    dataStream.write({ data: 1 })
    // listen to the flow
    function handleStream (stream) {
      // only one substream: 'data'
      stream.on('data', function (data) {
        middleStream.end()
      })
    }
  })

  it('should end upstream if ended downstream (circular)', function (done) {
    var dataStream = through2.obj()
    var mux = muxdemux.obj({ id: 'mux' })
    var downstream = through2.obj()
    var upstream = through2.obj()
    var demux = muxdemux.obj({ id: 'demux' }, handleStream)
    var serverSubstream = mux.substream('data')
    // "server" setup
    serverSubstream.on('finish', function () {
      done()
    })
    upstream.pipe(mux).pipe(downstream)
    dataStream.pipe(serverSubstream)
    // "client" setup
    downstream.pipe(demux).pipe(upstream)
    function handleStream (clientSubstream) {
      // only one clientSubstream: 'data'
      clientSubstream.on('data', function (data) {
        clientSubstream.end() // which will end demux
      })
    }
    // "server" write data
    dataStream.write({ data: 1 })
  })
})
