'use strict';

var https=require('https'),
	httpProxy=require('http-proxy'),	
	config = JSON.parse(require('fs').readFileSync('config.json','utf8')),	
	stats = {
		wsProxied : 0
	};	

function createProxy () {
	var proxy, server;	

	httpProxy.setMaxSockets(65000);  

	proxy = new httpProxy.RoutingProxy();

	server = https.createServer({
		pfx: require('fs').readFileSync('cert.pfx') 
	});

	server.on('request',function (request,response) {
		proxy.proxyRequest(request, response, config.proxy_target);
	});

	server.on('upgrade', function(request, socket, head) {
		stats.wsProxied++;
		proxy.proxyWebSocketRequest(request, socket, head, config.proxy_target);
    });
 
	server.listen(config.proxy_port, function () {
		console.log('Proxy server listening on port',config.proxy_port);
	}); 
}

createProxy();

setInterval(function () {
	console.log('stats',stats);
},5000);

require('./heapdump').startSnapshotServer(config.proxy_heapdump_port, function () {
		console.log('heapdump snapshot enabled at http://localhost:' + config.proxy_heapdump_port+'/snapshot\n',config);
});