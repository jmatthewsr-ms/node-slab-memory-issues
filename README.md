# node-slab-memory-issues #
Node memory pressure demonstration caused by two different slab buffer implementations.

## Usage ##

### Installing ###
'npm install'

### Running The Test ###

Run the following three apps:

'node wss'

'node proxy'

'node client'

Run the client last.  The client will attempt websocket connections to the wss (webscocket server) via the proxy.

The client will stop creating new connections after it reaches the client_maxConnections value specified in config.json.

### Saving Heapdumps ###

When the client has reached client_maxConnections, open the following URL's (the ports are configurable via config.json)

Take a heapdump for the proxy server:
'http://localhost:8601/snapshot'

Take a heapdump for the wss server:
'http://localhost:8801/snapshot'

Load the resulting .heapdump files into the chrome memory profiler.

## Problem Description ##

This project illustrates three applications: [ws](https://github.com/einaros/ws), [socket.io](https://github.com/LearnBoost/socket.io) and [http-proxy](https://github.com/nodejitsu/node-http-proxy), having a similar issue where long lived sessions can 
reference large "slab memory buffers" in node.  The reference to a slab buffer will prevent it from being garbage collected
and a scenario can occur where in a very short period of time total memory in a system can be exhausted.

In general this type of memory issue can occur in any nodejs application if the following are met:

* A reference to the 'head' variable (or a reference to any data referencing a slab) received from http event handlers is never released.
* The duration of some connections are longer than the time it takes to fill a slab buffer (turnover rate).
* Some of these long-lived connections are referencing different slab buffers.
* Enough of these long-lived connections referencing different slab buffers are active to cause a memory issue.


The http-proxy and ws modules used as examples in this project satisfy the above criteria.
The example code reproduces this problem using a minimal number of long-lived connections to illustrate the issue. It's possible in an extreme case to have a single websocket connection cause 10MB of memory usage.  10 of these connections would use 100MB.

### Slab Buffers ###
Nodejs uses "Slab Buffers" to improve performance by writing memory to a large block of contiguous memory instead of creating many small objects dynamically.  The two slab buffers that are causing issues 
for the sample projects listed here are located in tls.js and stream_wrap.cc.

tls.js:

    SlabBuffer.prototype.create = function create() {
      this.isFull = false;
      this.pool = new Buffer(10 * 1024 * 1024); 
      this.offset = 0;
      this.remaining = this.pool.length;
    };

stream_wrap.cc:

    \#define SLAB_SIZE (1024 * 1024)

### 'ws' Module ###

The 'ws' module holds a reference to the 'head' object during an upgrade to a websocket.  'head' will reference
the 1MB stream_wrapp.cc buffer.

Before any changes:

![wss before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-wss-before.jpg)

After

![wss after](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-wss-after.jpg)

### 'socket.io' Module ###

Socket.io is moving toward using the 'ws' module mentioned here.  In the current releases, it also suffers from the slab buffer
issue by retaining 'head'.

### 'http-proxy' Module ###

The 'http-proxy' module holds references to the 'head' object of the inbound websocket in proxyWebSocketRequest().
This 'head' reference will retain the 10MB tls.js slab buffer.  Note that for unsecure (non TLS) connections, the
10MB slab buffer is not an issue.

Before any changes:

![proxy before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-proxy-before.jpg)

After

![proxy after](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-proxy-after.jpg)

### Node Core ###

The above sections show that modules can avoid large slab buffer retention due to the 'head' reference from a websocket upgrade.
It is also possible for the node core to remove the reference to the large slab buffers (both the 1MB and 10MB buffers) by copying
the upgrade head data to a new Buffer that is not backed by a large slab:

http.js:

    // This is start + byteParsed
    //var bodyHead = d.slice(start + bytesParsed, end);
    var bodyHead = new Buffer(end - start - bytesParsed);     
    d.copy(bodyHead,0,start + bytesParsed, end); 

This code will replace the reference to the large slabs, but after this change the data is *still* referencing an underlying
optimization buffer called Buffer.pool in buffer.js.  The size of this buffer is much smaller (8k) however. Notice that the
above solutions for apps like ws, socket.io and http-proxy of also copying the head data will result in the same 8k retention.

Having node core emit the 'head' data on an 'upgrade' event that is not backed by any optimization buffer would be the only way
to completely resolve this without apps modifying their code.

Below is the before and after heapdumps for node.exe before the above http.js modifications and after.  The test is capturing the
heapdump from the 'wss' process after 100 connections.  The wss and proxy modules have *not* been modified in this test, so the
better memory usage is due only to the above patch in node.exe.

Before:

![node before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-node-before.jpg)

After:

![node before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-node-after.jpg)

