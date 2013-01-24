'use strict';

var WebSocketServer = require('ws').Server,
	stats = {
		connected : 0
	},
	config = JSON.parse(require('fs').readFileSync('config.json','utf8'));

function createServer () {
	var wss = new WebSocketServer({
		port: config.wss_port
	});

	wss.on('connection', function(ws) {
		stats.connected++;

		ws.on('close', function () {
			stats.connected--;
		});

		ws.send('something');
	});
}

createServer();

setInterval(function () {
	console.log('stats',stats);
},5000);

require('./heapdump').startSnapshotServer(config.wss_heapdump_port, function () {
		console.log('heapdump snapshot enabled at http://localhost:' + config.wss_heapdump_port+'/snapshot\n',config);
});