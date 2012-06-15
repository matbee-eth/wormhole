var express = require('express'), app = express.createServer(), 
    io = require('socket.io').listen(app);
var appS = require('./appserver');
var MemoryStore = express.session.MemoryStore,
    sessionStore = new MemoryStore({ reapInterval: 60000 * 10 });

app.listen(8080); 
app.use(express.static(__dirname + '/../client/'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.session({
    store: sessionStore,
    secret: 'acidhax', 
    key: 'express.sid'
}));

io.configure('development', function () {
    io.set('log level', 2);
})

app.get('/*', function (req, res) {
    req.session.visitCount = req.session.visitCount ? req.session.visitCount + 1 : 1;
});

var parseCookie = require('connect').utils.parseCookie;


appServer = new appS.appserver(io, sessionStore);

// You're given an $ object with your appServer.Methods({}); functions.
// You can only execute the client-specified callback ONCE.
appServer.Methods({
    Hello:function (parameters, callback) {
        var _params = parameters;
        // this("world.", "balls", "big balls"); // Executes the client-specified callback function.
        // // this.$(function, parameters, parameters, parameters....);
        // this.get(
        //     // Function executed on the client...
        //     function () {
        //         return [$('#inputElement').val(), navigator.appName];
        //     },
        //     // Server-side callback.
        //     function (value, value2) {
        //         console.log("Clients input field value is: " + value);
        //         console.log("Clients input field value is: " + value2);
        //     }
        // );
    }
});

appServer.Hook('change', '#inputElement', function (event) {
    // console.log(this);
    this.get(
        // Function executed on the client...
        function () {
            return $('#inputElement').val();
        },
        // Server-side callback.
        function (value) {
            console.log("Clients input field value is: " + value);
        }
    );
});

appServer.WatchFiles(__dirname + '/../client/index.html', function(client) {

});

appServer.WatchFiles(__dirname + '/../client/test.css', function(client) {

});

appServer.WatchFiles(__dirname + '/../client/test.js', function(client) {
    
});

appServer.WatchFiles(__dirname + '/../client/clientserver.js', function(client) {

});

appServer.WatchFiles(__dirname + '/../client/test.template.html', function(client) {

});