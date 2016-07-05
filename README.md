# muxdemux
multiplex and demultiplex (mux / demux) streams into an single stream (object mode or not)

# Installation
```bash
npm i --save muxdemux
```

# Usage
### Example: muxdemux substreams
```js
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

# License
MIT