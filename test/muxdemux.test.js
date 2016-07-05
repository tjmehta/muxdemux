'use strict'

var describe = global.describe
var it = global.it

var callbackCount = require('callback-count')
var expect = require('chai').expect
var noop = require('101/noop')
var through2 = require('through2')

var muxdemux = require('../index.js')
var substream = require('../lib/substream.js')

var jsonBuf = function (arg) {
  // for node < 0.10
  if (Buffer.isBuffer(arg)) {
    var json = arg.toJSON()
    arg = (json.type)
      ? json
      : { type: 'Buffer', data: json}
  }
  return arg
}

describe('muxdemux', function () {
  describe('custom opts', function () {
    describe('mux', function () {
      it('should mux streams into one', function (done) {
        var i = 0
        var opts = { highWaterMark: 1000, objectMode: false }
        // dump opts default coverage line..
        substream.ctor(null)
        // real test
        var Muxdemux = muxdemux.ctor(opts)
        var mux = new Muxdemux()
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
              args: [jsonBuf(new Buffer('datadatadata'))]
            })
            done()
          }
          i++
        })
        mux.substream('foo').write(new Buffer('datadatadata'))
      })
    })
  })

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
              args: [jsonBuf(new Buffer('datadatadata'))]
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
              args: [jsonBuf(new Buffer('uno'))]
            })
          } else if (j === 2) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [jsonBuf(new Buffer('dos'))]
            })
          } else if (j === 3) {
            expect(json).to.deep.equal({
              substream: 'foo',
              method: 'write',
              args: [jsonBuf(new Buffer('tres'))]
            })
          } else if (j === 4) {
            expect(data).to.deep.equal(new Buffer('quatro'))
          } else if (j === 5) {
            expect(data).to.deep.equal(new Buffer('{cinco}'))
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
        mux.write('{cinco}')
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

      it('should end if all substreams end', function (done) {
        var mux = muxdemux.obj()
        mux.on('finish', done)
        mux.substream('foo').write({ data: 1 })
        mux.substream('bar').write({ data: 1 })
        mux.substream('foo').end()
        mux.substream('bar').end()
      })

      it('should end if all substreams error', function (done) {
        var mux = muxdemux.obj()
        mux.on('finish', done)
        mux.substream('foo').on('error', noop)
        mux.substream('foo').emit('error', new Error('boom'))
      })

      it('should emit substream errors if parent stream closes', function (done) {
        var count = callbackCount(2, done)
        var mux = muxdemux.obj()
        mux.substream('foo').on('error', expectErr)
        mux.substream('bar').on('error', expectErr)
        mux.substream('qux').on('error', expectNoErr)
        mux.substream('qux').end()
        mux.end()
        function expectErr (err) {
          expect(err.message).to.match(/unexpected.*finish/)
          count.next()
        }
        function expectNoErr () {
          done(new Error('should not error'))
        }
      })

      it('should emit substream errors if parent stream errors', function (done) {
        var count = callbackCount(2, done)
        var mux = muxdemux.obj()
        mux.substream('foo').on('error', expectErr)
        mux.substream('bar').on('error', expectErr)
        mux.substream('qux').on('error', expectNoErr)
        mux.substream('qux').end()
        mux.emit('error', new Error('boom'))
        function expectErr (err) {
          expect(err.message).to.match(/unexpected.*error.*boom/)
          count.next()
        }
        function expectNoErr () {
          done(new Error('should not error'))
        }
      })

      describe('opts', function () {
        it('should NOT end if all substreams end (opts.keepOpen)', function (done) {
          var mux = muxdemux.obj({ keepOpen: true })
          mux.on('finish', function () {
            done(new Error('should not end'))
          })
          mux.substream('foo').write({ data: 1 })
          mux.substream('bar').write({ data: 1 })
          mux.substream('foo').end()
          mux.substream('bar').end()
          mux.removeAllListeners('finish')
          mux.on('finish', done)
          mux.end()
        })

        describe('opts.unexpectedFinishError', function () {
          it('should emit substream errors if parent stream closes', function (done) {
            var mux = muxdemux.obj({ unexpectedFinishError: false })
            mux.substream('foo').on('error', expectNoErr)
            mux.substream('bar').on('error', expectNoErr)
            mux.end()
            function expectNoErr () {
              done(new Error('should not error'))
            }
            done()
          })

          it('should emit substream errors if parent stream errors', function (done) {
            var mux = muxdemux.obj({ unexpectedFinishError: false })
            mux.substream('foo').on('error', expectNoErr)
            mux.substream('bar').on('error', expectNoErr)
            mux.on('error', noop)
            mux.emit('error', new Error('boom'))
            function expectNoErr () {
              done(new Error('should not error'))
            }
            done()
          })
        })
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

      it('should end if all substreams end', function (done) {
        var mux = muxdemux.obj()
        var demux = muxdemux.obj(function (substream) {
          // ..
        })
        mux.pipe(demux)
        demux.on('finish', done)
        mux.substream('foo').write({ data: 1 })
        mux.substream('foo').end()
      })

      it('should end if all substreams end (substream DNE)', function (done) {
        var mux = muxdemux.obj()
        var demux = muxdemux.obj()
        mux.pipe(demux)
        demux.on('finish', done)
        mux.substream('foo').write({ data: 1 })
        mux.substream('foo').end()
      })

      it('should end if all substreams error', function (done) {
        var next = callbackCount(2, done).next
        var mux = muxdemux.obj()
        var demux = muxdemux.obj(function (substream) {
          substream.on('error', function () {
            next()
          })
        })
        mux.pipe(demux)
        demux.on('finish', next)
        mux.substream('foo').on('error', noop)
        mux.substream('foo').emit('error', new Error('boom'))
      })

      it('should throw error if substream error has no handlers', function (done) {
        var next = callbackCount(2, done).next
        var mux = muxdemux.obj()
        var demux = muxdemux.obj(function (substream) {
          substream.on('error', function () {
            next()
          })
        })
        mux.pipe(demux)
        demux.on('finish', next)
        var err = new Error('boom')
        try {
          mux.substream('foo').emit('error', err)
        } catch (_err) {
          expect(_err).to.equal(err)
        }
      })

      describe('substreams', function () {
        it('should receive events emitted by mux', function (done) {
          var i = 0
          var mux = muxdemux.obj()
          mux.pipe(muxdemux.obj(function (stream, name) {
            if (name === 'foo') {
              stream.on('stuff', function (buf, err) {
                expect(buf).instanceof(Buffer)
                expect(err).instanceof(Error)
                expect(buf).to.deep.equal(new Buffer('hello'))
                expect(err.message).to.equal('boom')
                expect(err.stack).to.exist
                i++
              })
            } else { // bar
              stream.on('stuff', function (buf, err) {
                expect(buf).instanceof(Buffer)
                expect(err).instanceof(Error)
                expect(buf).to.deep.equal(new Buffer('hello2'))
                expect(err.message).to.equal('boom2')
                expect(err.stack).to.exist
                i++
                if (i === 2) {
                  done()
                }
              })
            }
          })).pipe(through2.obj(function (data, enc, cb) {
            this.push(data)
            cb()
          }))

          mux.substream('foo').emit('stuff', new Buffer('hello'), new Error('boom'))
          mux.substream('bar').emit('stuff', new Buffer('hello2'), new Error('boom2'))
        })
      })
    })
  })
})
