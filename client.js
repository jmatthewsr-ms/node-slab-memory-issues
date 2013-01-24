'use strict';

var WebSocket = require('ws'),
	config = JSON.parse(require('fs').readFileSync('config.json', 'utf8')),
	stats = {
		wsConnected: 0,
		wsDataSent: 0
	},
	dataPayload;

function setup() {
	var i = 0;

	dataPayload = new Buffer(config.client_dataSize);
	for(i = 0; i < config.client_dataSize; i++) {
		dataPayload.write('A', i, 1, 'utf8');
	}

	if(config.client_connectionspersecond >= 1) {
		config.client_connectCount = config.client_connectionspersecond;
		config.client_connectDelay = 1000;
	} else {
		config.client_connectCount = 1;
		config.client_connectDelay = 1000 / config.client_connectionspersecond;
	}

	setInterval(function() {
		console.log('stats', stats);
	}, 5000);

	require('./heapdump').startSnapshotServer(config.client_heapdump_port, function() {
		console.log('setup complete with config:\n', config);
	});
}

function sendData(ws) {
	setTimeout(function() {
		ws.send(dataPayload, function(err) {
			if(!err) {
				stats.wsDataSent += config.client_dataSize;
			}
			sendData(ws);
		});
	}, config.client_dataDelay);
}

//data connection is used to fill slab buffers on the remote proxy/server
function createDataConnection() {
	var ws = new WebSocket('wss://localhost:' + config.proxy_port);

	ws.on('open', function() {
		console.log('Data socket connected');
		sendData(ws);
	});

	ws.on('close', function(err) {
		console.log('Data socket disconnected, err:', err);
	});
}

//connections are used to "pin" slab buffers in memory on the server/proxy
function createConnection() {
	var ws = new WebSocket('wss://localhost:' + config.proxy_port);

	ws.on('open', function() {
		stats.wsConnected++;
	});

	ws.on('close', function(err) {
		stats.wsConnected--;
	});
}

function connect() {
	var i = 0,
		count = Math.min(config.client_maxConnections - stats.wsConnected, config.client_connectCount);

	for(i = 0; i < count; i++) {
		createConnection();
	}
	setTimeout(connect, config.client_connectDelay);
}

setup();
createDataConnection();
connect();