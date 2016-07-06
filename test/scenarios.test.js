'use strict'

var describe = global.describe
var it = global.it

var callbackCount = require('callback-count')
var expect = require('chai').expect
var through2 = require('through2')

var muxdemux = require('../index.js')

describe('scenarios', function () {
  it('should not write unpipe if stream is ended', function (done) {
    var next = callbackCount(3, done).next
    var dataStream = through2.obj()
    var mux = muxdemux.obj()
    var middleStream = through2.obj()
    var demux = muxdemux.obj(handleStream)
    var substream = mux.substream('data')
    dataStream.id = 'dataStream'
    mux.id = 'mux'
    middleStream.id = 'middleStream'
    demux.id = 'demux'
    substream.id = 'substream'
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
})
