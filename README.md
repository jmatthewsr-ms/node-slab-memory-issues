# node-memorypressure-slabbuffer #
Node memory pressure demonstration caused by two different slab buffer implementations.

## Usage ##

### Installing ###
'npm install'

### Running The Test ###

Run the following three apps:

'node wss'

'node proxy'

'node client'

The client will stop creating new connections after it reaches the client_maxConnections value specified in config.json.

### Saving Heapdumps ###

When the client has reached client_maxConnections, open the following URL's (the ports are configurable via config.json)

'http://localhost:8601/snapshot'

'http://localhost:8801/snapshot'

Load the resulting .heapdump files into the chrome memory profiler.

## Problem Description ##

This project illustrates two separate applications: ws (https://github.com/einaros/ws) and http-proxy (https://github.com/nodejitsu/node-http-proxy), having a similar issue where long lived sessions can 
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

The 'ws' module holds a reference to the 'head' object during an upgrade to a websocket.

Before any changes:

![wss before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-wss-before.jpg)

After

![wss after](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-wss-after.jpg)

### 'socket.io' Module ###

Socket.io is moving toward using the 'ws' module mentioned here.  In the current releases, it also suffers from the slab buffer
issue by retaining 'head'.

### 'http-proxy' Module ###

The 'http-proxy' module holds references to the 'head' object of the inbound websocket in the proxyWebSocketRequest() function

Before any changes:

![proxy before](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-proxy-before.jpg)

After

![proxy after](https://raw.github.com/jmatthewsr-ms/node-slab-memory-issues/master/docs/mem-pressure-proxy-after.jpg)
