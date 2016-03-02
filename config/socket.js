/*eslint-env node*/
'use strict';


module.exports = function(io, watson, appCreds) {
  // references
  // https://developer.ibm.com/answers/questions/244090/multiple-speech-to-text-consecutive-queries.html
  // https://github.com/watson-developer-cloud/node-sdk/issues/187?cm_mc_uid=01985298275414559885703&cm_mc_sid_50200000=1455988570

  var numberOfClients = 0;
  var recognizeStream = null;
  var recorderId = null;

  // Events emitted by server:
  // connect: default handshake on connection
  // disconnect: default disconnection event
  // onerror: default error reponse
  // recorderstatus: respond to client's recorder request ('succeeded'/'failed')
  // server: send a message from server
  // interim: broadcast interim result from Watson
  
  var watsonSetup = function(watson, credentials, recorderSocketId) {
  	  // Initialize Watson if it has not been done before or if Watson was previously closed.
      if (recognizeStream===null) {
        var params = {
          content_type: 'audio/l16; rate=16000',
          interim_results: true,
          continuous: true
        };
        
        // setup watson service
        var speechToText = watson.speech_to_text(credentials);

        recognizeStream = speechToText.createRecognizeStream(params);
        recognizeStream.setEncoding('utf8');

        /* Events from Watson's socket: 
         * results: When Watson has interim results
         * data: When Watson has final transcript
         * error: When Watson has error
         * connection-close: When Watson closed connection
         */

        // Watson's socket send in interim result available
        recognizeStream.on('results', function(data) {
          if (data) {
            console.log( '[Watson results]:', data);
            // broadcast to all clients
            io.sockets.emit('interim', data);      		
          }
          else {
            console.log('[Watson results]: empty');
          }
        });

        // Watson's socket sends in final result available
        recognizeStream.on('data', function(transcript) {
          console.log( '[Watson transcript]:', transcript );
          // broadcast to all clients
          // For now, only use the interim results. Skip final transcript.
          // io.sockets.emit('final', transcript);
        });

        // Watson's socket sends in error
        recognizeStream.on('error', function(data) {
          console.log('[Watson error]:', data);
        });
      
        // Watson's socket closed connection
        recognizeStream.on('connection-close', function() {
          console.log('[Watson]:', 'connection closed');
        });
        
        // Identify the recorder that initiates this recognition
        recorderId = recorderSocketId;
        io.to(recorderId).emit('recorderstatus', 'succeeded');
        io.sockets.emit('server', 'Recorder joined.');
        console.log('Socket ' + recorderId + ' is now the recorder. Watson setup successful');
      }
      else {
        console.log('Watson recognizeStream already exists');
      }
  };


  // Server's socket established connection
  io.on('connection', function(socket) {
    var blocksReceived = 0;

    numberOfClients = numberOfClients+1;
    console.log([ 'On server connection: there are' , numberOfClients , 'clients now' ].join(' ') );


    /* Events from Client's socket: 
     * recorder: When a client declares to be a recorder
     * data: When client(s) submits audio data
     * disconnect: When client(s) closed connection
     */

    socket.on('recorder', function(data) {
      // Do not accept more than one recorder at any time
  	  if (recorderId===null) {

        var credentials = appCreds;
        credentials.version = 'v1';
      
        console.log('setup Watson with username=' + data.username + ' password=' + data.password);
      
        // Verify that the user who takes the recorder's role must have the correct credentials
        if (credentials && credentials.username===data.username && credentials.password===data.password ) {
          watsonSetup(watson, credentials, socket.id);
        }
        else {
      	  console.log('client supplied bad credentials');
      	  socket.emit('recorderstatus', 'failed');
        }
      }
      else {
        console.log('a recorder already exists');
        socket.emit('recorderstatus', 'failed');
      }
    });


    // Client sends in raw audio data
    // Client must be a recorder to send data
    socket.on('audio', function(data) {
      if (socket.id===recorderId) {
        blocksReceived = blocksReceived+1;
        var ack = [ 'received block', blocksReceived, 'from ', socket.id ].join(' ');

        // Sends ack to client's socket, then submit data to watson
        if (recognizeStream) {
          socket.emit('server', ack);
          console.log('[Server]:', ack);
          recognizeStream.write(data);
        }
        else {
      	  socket.emit('server', 'offline');      	
        }
      }
    });
    
    // Client disconnected
    socket.on('disconnect', function() {
      console.log('[Client]:', [ socket.id, 'disconnected' ].join(' '));

      numberOfClients = numberOfClients-1;

      if (numberOfClients<=0) {      	
        numberOfClients = 0;
      }

      // If the disconnected socket is the recorder then also disconnect Watson
      if (recorderId===socket.id || numberOfClients===0) {
      	// clear recorderId and stop recognition
      	recorderId = null;
      	if (recognizeStream) {
          recognizeStream.stop();
          recognizeStream = null;
        }
        io.sockets.emit('server', 'Recorder left.');
      }
      console.log('On client disconnect: there are ' + numberOfClients + ' clients now');
    });
  });
};