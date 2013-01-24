'use strict';

var heapdump = require('heapdump'),
	http = require('http');

function startSnapshotServer(port, clb) {
	var server = http.createServer();

	server.on('request', function(request, response) {
		if(request.url === '/snapshot') {
			heapdump.writeSnapshot();
			response.writeHead(200);
		} else {
			response.writeHead(404);
		}
		response.end();
	});

	server.listen(port, function() {
		if(clb) {
			clb();
		}
	});
}

module.exports = {
	startSnapshotServer: startSnapshotServer
};