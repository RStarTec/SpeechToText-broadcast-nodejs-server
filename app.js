/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js application for Bluemix
//------------------------------------------------------------------------------

'use strict';

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');

// create a new express server
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var watson = require('watson-developer-cloud');

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');
// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();
// Replace the following by the name of your service
var serviceName = 'SpeechToText-subscription';

// setup express
require('./config/express')(app);
// setup sockets 
require('./config/socket')(io, watson, appEnv.getServiceCreds(serviceName));


// start server on the specified port and binding host
server.listen(appEnv.port, '0.0.0.0', function() {
  // print a message when the server starts listening
  console.log("server starting on " + appEnv.url);
});
