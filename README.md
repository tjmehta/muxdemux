# muxdemux
multiplex and demultiplex (mux / demux) streams into an single stream (object mode or not)

# Installation
```bash
npm i --save muxdemux
```

# Usage
### Example: muxdemux substreams
```js
var muxdemux = require('muxdemux')
var mux = muxdemux()
var demux = muxdemux(handleSubstream)
mux.pipe(demux)
mux.substream('foo').write(new Buffer('hello world'))
mux.substream('bar').write(new Buffer('yolo'))
function handleSubstream (substream, name) {
  if (name === 'foo') {
    substream.once('data', function (data) {
      data.toString() // 'hello world'
    })
    substream.pipe(/* any other stream */)
  } else if (name === 'bar') {
    substream.once('data', function (data) {
      data.toString() // 'yolo'
    })
  }
}
```

###  Example: muxdemux substream events
Substream events are encoded and sent down the stream as data packets.
Demux streams will decode these data packets and emit the events as if they occurred on downstream substreams themselves.
All emitted from a mux.substream(<name>).emit(...) will be propagated to downstream substreams.
```js
var muxdemux = require('muxdemux')
var mux = muxdemux()
var demux = muxdemux(handleSubstream)
mux.pipe(demux)
mux.substream('foo').emit('buffer-event', new Buffer('🔥'))
mux.substream('bar').emit('error', new Error('boom'))
mux.substream('qux').emit('other-event', { abc: 'hello' })
function handleSubstream (substream, name) {
  if (name === 'foo') {
    // buffers are encoded on json and reparsed as buffers
    substream.once('buffer-event', function (buf, {
      buf instanceof Buffer // true
      buf.toString() // '🔥'
    })
  } else if (name === 'bar') {
    substream.once('error', function (err) {
      // errors are encoded on json and reparsed as errors
      err instanceof Error // true
      err.message // 'boom'
      err.stack // 'Error: boom ...'
    })
  } else if (name === 'qux') {
    substream.once('other-event', function (data) {
      // errors are encoded on json and reparsed as errors
      typeof data // 'object'
      data // { abc: 'hello' }
    })
  }
}
```

### Example: muxdemux object mode streams
For now muxdemux assumes that substreams share the same objectMode as their parents;
substreams of objectMode:true mux/demux streams will also be objectMode:true and vice versa.
```js
var muxdemux = require('muxdemux')
var mux = muxdemux.obj()
var demux = muxdemux.obj(handleSubstream)
mux.pipe(demux)
mux.substream('foo').write({ hello: 1 })
mux.substream('bar').write({ world: 2 })
function handleSubstream (substream, name) {
  if (name === 'foo') {
    substream.once('data', function (data) {
      data // { hello: 1 }
    })
    substream.pipe(/* any other stream */)
  } else if (name === 'bar') {
    substream.once('data', function (data) {
      data // { world: 2 }
    })
  }
}
```

### Example: muxdemux substreams end
If all of a mux/demux's substreams end the mux/demux stream will also end.
The same is also true for the opposite. If a mux/demux stream ends, it's substreams will be ended.
```js
var muxdemux = require('muxdemux')
var mux = muxdemux.obj()
var demux = muxdemux.obj(function handleSubstream (substream, name) { /* ... */ })
mux.on('finish', handleMuxFinish)
demux.on('finish', handleDemuxFinish)
mux.pipe(demux)
var foo = mux.substream('foo')
foo.write({ hello: 1 })
var bar = mux.substream('bar')
bar.write({ world: 2 })
// end substreams
foo.end()
bar.end()
function handleMuxFinish () {
  // get's called bc all substreams ended (both foo and bar)
}
function handleDemuxFinish () {
  // get's called downstream bc all substreams ended (both foo and bar)
}
```

### Example: unexpected muxdemux finish
If a muxdemux finishes before it's substreams it will emit an error to each unfinished substream.
This default behavior can be disabled by passing `opts.unexpectedFinishError = false`
```js
var muxdemux = require('muxdemux')
var mux = muxdemux.obj()
var foo = mux.substream('foo')
var bar = mux.substream('bar')
foo.on('error', function (err) {
  // called bc mux finished before foo-substream finished
  err // [Error: unexpected muxdemux finish]
})
bar.on('error', function () {
  // not called, bc bar finished before mux
})
bar.end() // bar ends first, hence no error
mux.end()
```

### Example: unexpected muxdemux error
If a muxdemux errors before it's substreams finish it will emit an error to each unfinished substream.
This default behavior can be disabled by passing `opts.unexpectedFinishError = false`
```js
var muxdemux = require('muxdemux')
var mux = muxdemux.obj()
var foo = mux.substream('foo')
var bar = mux.substream('bar')
foo.on('error', function (err) {
  // called bc mux finished before foo-substream finished
  // error message is prepended w/ 'unexpected muxdemux error: '
  err // [Error: unexpected muxdemux error: boom]
})
bar.on('error', function () {
  // not called, bc bar finished before mux
})
bar.end() // bar ends first, hence no error
mux.emit('error', new Error('boom'))
```

### Example: circular streams
Circular substream data is filtered out of muxdemux streams by default. But if you want to be explicit and prevent non-substream
data from infinitely circulating through your stream use `opts.circular`. `opts.circular` will filter out non-substream data.
Circular streams are useful if you want substream events to be emitted "upstream" and "downstream".
```js
// server.js
var muxdemux = require('muxdemux')
var websocket = /* ... */
var mux = muxdemux({ circular: true })
websocket.pipe(mux).pipe(websocket)
var fooSubstream = mux.substream('foo')
fooSubstream.on('custom1', function (data) {
  console.log(data) // "hello"
  fooSubstream.emit('custom2', 'world')
})

// client.js
var muxdemux = require('muxdemux')
var websocket = /* ... */
var mux = muxdemux({ circular: true })
websocket.pipe(demux).pipe(websocket)
var fooSubstream = demux.substream('foo')
fooSubstream.on('custom2', function () {
  console.log(data) // "world"
})
fooSubstream.emit('custom1', 'hello')
```

# License
MIT