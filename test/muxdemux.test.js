'use strict'

var describe = global.describe
var it = global.it

var expect = require('chai').expect
var through2 = require('through2')

var muxdemux = require('../index.js')

describe('muxdemux', function () {
  describe('objectMode:false', function () {
    describe('mux', function () {
      it('should mux streams into one', function (done) {
        var i = 0
        var mux = muxdemux()
        mux.on('data', function (data) {
          var json = JSON.parse(data.toString())
          if (i === 0) {
            expect(json).to.deep.equal({
              substream: 'foo',
              new: true
            })
          } else if (i === 1) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [new Buffer('datadatadata').toJSON()]
            })
            done()
          }
          i++
        })
        mux.substream('foo').write(new Buffer('datadatadata'))
      })
    })

    describe('demux', function () {
      it('should demux streams', function (done) {
        var i = 0
        var j = 0
        var mux = muxdemux()
        mux.pipe(muxdemux(function (stream, name) {
          stream.on('data', function (data) {
            if (i === 0) {
              expect(data).to.deep.equal(new Buffer('uno'))
            } else if (i === 1) {
              expect(data).to.deep.equal(new Buffer('dos'))
            } else if (i === 2) {
              expect(data).to.deep.equal(new Buffer('tres'))
            }
            i++
          })
        })).pipe(through2(function (data, enc, cb) {
          var json
          try {
            json = JSON.parse(data.toString())
          } catch (err) {}
          if (j === 0) {
            expect(json).to.deep.equal({
              substream: 'foo',
              new: true
            })
          } else if (j === 1) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [new Buffer('uno').toJSON()]
            })
          } else if (j === 2) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [new Buffer('dos').toJSON()]
            })
          } else if (j === 3) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [new Buffer('tres').toJSON()]
            })
          } else if (j === 4) {
            expect(data).to.deep.equal(new Buffer('quatro'))
            done()
          }
          j++
          this.push(data)
          cb()
        }))
        mux.substream('foo').write(new Buffer('uno'))
        mux.substream('foo').write(new Buffer('dos'))
        mux.substream('foo').write(new Buffer('tres'))
        mux.write(new Buffer('quatro'))
      })
    })
  })

  describe('objectMode:true', function () {
    describe('mux', function () {
      it('should mux streams into one', function (done) {
        var i = 0
        var mux = muxdemux.obj()
        mux.on('data', function (json) {
          if (i === 0) {
            expect(json).to.deep.equal({
              substream: 'foo',
              new: true
            })
          } else if (i === 1) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [{ data: 1 }]
            })
            done()
          }
          i++
        })
        mux.substream('foo').write({ data: 1 })
      })
    })
    describe('demux', function () {
      it('should demux streams', function (done) {
        var i = 0
        var j = 0
        var mux = muxdemux.obj()
        mux.pipe(muxdemux.obj(function (stream, name) {
          stream.on('data', function (data) {
            if (i === 0) {
              expect(data).to.deep.equal({ foobar: 'uno' })
            } else if (i === 1) {
              expect(data).to.deep.equal({ foobar: 'dos' })
            } else if (i === 2) {
              expect(data).to.deep.equal({ foobar: 'tres' })
            }
            i++
          })
        })).pipe(through2.obj(function (data, enc, cb) {
          var json = data
          if (j === 0) {
            expect(json).to.deep.equal({
              substream: 'foo',
              new: true
            })
          } else if (j === 1) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [{ foobar: 'uno' }]
            })
          } else if (j === 2) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [{ foobar: 'dos' }]
            })
          } else if (j === 3) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [{ foobar: 'tres' }]
            })
          } else if (j === 4) {
            expect(data).to.deep.equal({ yolo: 1 })
            done()
          }
          j++
          this.push(data)
          cb()
        }))
        mux.substream('foo').write({ foobar: 'uno' })
        mux.substream('foo').write({ foobar: 'dos' })
        mux.substream('foo').write({ foobar: 'tres' })
        mux.write({ yolo: 1 })
      })
    })
  })
})
