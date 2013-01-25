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

* A reference to the 'head' variable received from http event handlers is never released.
* Enough data is sent to fill, and thus create, new slab buffers (both the tcp socket 1MB slab and the tls 10MB slab).
* The long-lived references to 'head' are created at a rate at least as fast as the slab buffers creation rate.

The http-proxy and ws modules used as examples in this project satisfy the above criteria if the following are true:

* Long-lived websocket connections are created at a rate at least as fast as slab buffers are created.
* Enough data is sent across the websocket to create new slab buffers.

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

After the fixes were applied in the above examples for ws and http-proxy, you can still notice many 8k buffers retained.
This is because nodejs uses a slab buffer for every Buffer object created that's under 8k bytes. 

Having node core emit an upgrade header that is not backed by this slab buffer seems like a reasonable solution that won't
have any overhead for apps that retain the head reference.
