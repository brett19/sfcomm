
var config = require( '../../config/config.js' ),
    express = require('express')
  , socketio = require('socket.io')
  , fs = require('fs');

// Config
var MAX_CHAT_LOG = 40;

// Global Storage
var clients = [];
var chatLog = [];
var delayQueue = [];

// Send a message to a specific userid/passhash
function emit_to( userid, passhash ) {
	// Build a func params array without the userid/passhash arguments
	var funcparams = [];
	for( var i = 2; i < arguments.length; ++i ) {
		funcparams[i-2] = arguments[i];
	}
		
	// Loop each client and send it to those authed as the requested user
	clients.forEach(function ( oclient ) {
		if( oclient.userid != userid || oclient.passhash != passhash ) return;
		oclient.emit.apply( oclient, funcparams );
	});
}

// Send a message to all clients
function emit_to_all( ) {
	// Build a func params array without the userid/passhash arguments
	var funcparams = [];
	for( var i = 0; i < arguments.length; ++i ) {
		funcparams[i] = arguments[i];
	}

	// Loop each client and send it to those who are authorized
	clients.forEach(function ( oclient ) {
		if( !oclient.authed ) return;
		oclient.emit.apply( oclient, funcparams );
	});
}

// Validate whoever is connecting with a PHP message is actually allowed
function validate_api( key ) {
	return key == 'testkey';
}

function register( app, io )
{
	io.sockets.on('connection', function (socket) {
		// Identify this client
		socket.name = socket.remoteAddress + ":" + socket.remotePort 
		
		// Set the userid/passhash for validation
		socket.authed = false;
		socket.userid = 0;
		socket.passhash = '';
		
		// Put this new client in the list
		clients.push( socket );
	
		// Ensure when they disconnect the are removed from the list
		socket.on('disconnect', function() {
			clients.splice(clients.indexOf(socket), 1);
		});
	
		// Handle SlotFactory Authentication Request
		socket.on('sf_auth', function( userid, passhash ) {
			socket.userid = userid;
			socket.passhash = passhash;
			socket.authed = true;
			
			//console.log( 'Authenticated UserID ' + socket.userid + ' w/ Hash "' + socket.passhash + '"' );
			socket.emit( 'sf_authed', true );
			
			// send message log
			chatLog.forEach(function(chatMsg){
				socket.emit( 'sf_chatmsg',
					chatMsg.userid, 
					chatMsg.name,
					chatMsg.color,
					chatMsg.time,
					chatMsg.text,
					chatMsg.gameid
				);
			});
		});
	
	});
	app.get('/service/chat', function (req, res) {
		res.sendfile(__dirname + '/chat.html');
	});
	
	
	app.get('/api/chat/sendmsg', function (req, res) {
		if( !validate_api(req.param('apikey')) ) {
			res.send( 401 );
			return;
		}
		
		var msg_userid = req.param('userid', 0);
		var msg_name = req.param('name', 'Unknown');
		var msg_color = req.param('color', '#ffffff');
		var msg_time = req.param('time', 0);
		var msg_text = req.param('text', '');
		var msg_delay = req.param('delay', 0);
		var msg_gameid = req.param('gameid', 0);
		
		var handleMsg = function() {
			emit_to_all( 'sf_chatmsg', msg_userid, msg_name, msg_color, msg_time, msg_text, msg_gameid );
			chatLog.push({
				userid: msg_userid,
				name: msg_name,
				color: msg_color,
				time: msg_time,
				text: msg_text,
				gameid: msg_gameid
			});
			
			// Limit the log size!
			if( chatLog.length > MAX_CHAT_LOG ) {
				chatLog.shift( );
			}
		}
		
		if( msg_delay > 10 ) {
			delayQueue.push([ (new Date().getTime()) + parseInt(msg_delay), handleMsg ]);
		} else {
			handleMsg();
		}
		
		res.send( 200 );
	});
}

// Set up handling of the Delayed Requests
function handleDelayQueue( ) {
	// Sort First (ascending by time)
	delayQueue.sort(function(a,b){
		return a[0]-b[0];
	});
	
	// Continue now
	while( delayQueue.length > 0 ) {
		if( delayQueue[0][0] > (new Date().getTime()) ) {
			// Not time for this event yet
			//  We can break early here since the sort above
			//    will ensure everything is in order.
			break;
		}
		
		// Execute this delayed item
		var delayItem = delayQueue.shift( );
		delayItem[1]( );
	}
}
setInterval( handleDelayQueue, 2000 );

// Post a SYSTEM message saying the chat restarted
chatLog.push({
	userid: -1000,
	name: 'SYSTEM',
	color: '#dc50ff',
	time: (new Date().getTime()),
	text: 'The chat system was restarted successfully.',
	gameid: -1000
});

var sslKey = fs.readFileSync('[].key');
var sslCert = fs.readFileSync('[].crt');
var sslCa = fs.readFileSync('[].crt');

var http_app = express.createServer( );
http_app.listen( 80, config.localbackendip );
var http_io = socketio.listen( http_app );
register( http_app, http_io );

var https_app = express.createServer({ key: sslKey, cert: sslCert, ca: sslCa });
https_app.listen( 443, config.localbackendip );
var https_io = socketio.listen( https_app );
register( https_app, https_io );




















