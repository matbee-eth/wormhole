var express = require('express');
var appS = require('./server/appserver');
var dbS = require('./server/dbserver');
var MemoryStore = express.session.MemoryStore,
    sessionStore = new MemoryStore({ reapInterval: 60000 * 10 });
var app = express.createServer();
var io = require('socket.io').listen(app);
var parseCookie = require('cookie').parse;
var Session = require('connect').middleware.session.Session;

app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({
        secret: 'acidhax',
        cookie: { maxAge: 60000 },
        store: sessionStore
    }));

    app.use(app.router);
    app.use(express.static(__dirname + '/client/'));
});

io.set('authorization', function (data, accept) {
    if (data.headers.cookie) {
        data.cookie = parseCookie(data.headers.cookie);
        data.sessionID = data.cookie['connect.sid'];
        // save the session store to the data object 
        // (as required by the Session constructor)
        data.sessionStore = sessionStore;
        data.sessionStore.load(data.sessionID, function(err, sess){
            if (err || !sess) return accept(err);
            data.session = sess;
            accept(null, true);
        });
    } else {
       return accept('No cookie transmitted.', false);
    }
});

// io.configure('development', function () {
//     io.set('log level', 2);
// })

var dbserv = new dbS.dbserver('http://localhost:5984', true);
appServer = new appS.appserver(io, dbserv, sessionStore);

// You can only execute the client-specified RPC callback ONCE. It becomes invalid afterwards.
// To execute, you must execute a Function and supply your optional parameters.
// this(function (param1, param2) { }, param1, param2);
appServer.Methods({
    Hello:function (parameters, callback) {
        var _params = parameters;
        this.return("world.", "balls", "big balls"); // Executes the client-specified callback function. Can only be fired once.
        // This is the only time you can simply send parameters.
    }
});

// Global hook for every connected client.
appServer.on('change', '#inputElement', function (event) {
    this.get(
        // Function executed on the client...
        function () {
            // alert("wtf");
            return $('#inputElement').val();
        },
        // Server-side callback.
        function (value) {
            console.log("Clients input field value is: " + value);
            dbserv.tables("testings").list(function(response) {
                console.log(response);
            }, true);
        }
    );
});

appServer.WatchFiles(__dirname + '/client/test.css', function() {

});

appServer.WatchFiles(__dirname + '/client/test.js', function() {
    
});

appServer.WatchFiles(__dirname + '/client/test.template.html', function() {

});


app.listen(8080)